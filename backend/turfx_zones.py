
"""TURFEX ZONES — Analyse "Value" inspirée de Turf-France (CX/RTX/OR/IDC/CFP/RATIO).

Réutilise les données PMU déjà fetchées par ferran_get_participants pour :
  - calculer 6 indicateurs hippiques par cheval
  - répartir les chevaux en 3 zones (A/B/C) selon leur cote
  - identifier le top value, top potentiel et chevaux à éviter
  - générer un résumé automatique de la course

Aucune dépendance à un service externe (tout est local + PMU API).
"""
import math
import re
from typing import Any, Dict, List, Optional, Tuple


# ============================================================
# PARSING DE LA MUSIQUE PMU
# ============================================================
# La musique PMU est de la forme "1a2a3a(25)4a5a..." où :
#   - chaque token = position dans une course (1 = 1er, 0 = > 10e, D = disq, A/T = arrêt)
#   - lettre = discipline (a=attelé, m=monté, p=plat, h=haie, s=steeple)
#   - (25) = année antérieure, sépare deux saisons
def _parse_musique(musique: str, max_courses: int = 10) -> List[Dict[str, Any]]:
    """Retourne une liste de dicts {pos, discipline, year_marker} dans l'ordre chrono inverse."""
    if not musique:
        return []
    # Tokens : 1 chiffre/lettre + 1 lettre (discipline)
    # Patterns possibles : "1a", "Da", "0m", "Ta" + parenthèses séparateurs (25), (24)
    tokens = re.findall(r"([0-9DTA])([a-z])|\((\d{2})\)", musique)
    out = []
    for pos, disc, year in tokens:
        if year:
            continue  # marqueur d'année, on ignore (juste séparateur)
        out.append({
            "pos_raw": pos,
            "pos": (10 if pos == "0" else (None if pos in ("D", "T", "A") else int(pos))),
            "discipline": disc,
        })
        if len(out) >= max_courses:
            break
    return out


def _form_score(musique: str) -> Tuple[float, int]:
    """Score de forme 0-100 basé sur les 5 dernières courses.

    Plus la position est récente ET bonne, plus le score est haut.
    Retourne (score, nb_courses_analysées).
    """
    courses = _parse_musique(musique, max_courses=5)
    if not courses:
        return 0.0, 0
    # Pondération décroissante : course la plus récente compte 30%, la 2e 25%, ...
    weights = [0.30, 0.25, 0.20, 0.15, 0.10]
    score_total = 0.0
    weight_sum = 0.0
    for i, c in enumerate(courses):
        if i >= len(weights):
            break
        w = weights[i]
        weight_sum += w
        pos = c["pos"]
        if pos is None:
            # Disqualification = 0 pts
            point = 0
        else:
            # 1er=100, 2e=80, 3e=60, 4e=45, 5e=30, 6-9e=15, 10e+=5
            if pos == 1:
                point = 100
            elif pos == 2:
                point = 80
            elif pos == 3:
                point = 60
            elif pos == 4:
                point = 45
            elif pos == 5:
                point = 30
            elif pos <= 9:
                point = 15
            else:
                point = 5
        score_total += point * w
    if weight_sum == 0:
        return 0.0, 0
    return round(score_total / weight_sum, 2), len(courses)


# ============================================================
# INDICATEURS DÉRIVÉS (CX, RTX, OR, IDC, CFP, RATIO)
# ============================================================
def _compute_cx(victoires: int, courses: int) -> int:
    """CX = % de victoires sur la carrière, plafonné à 50 (cap réaliste)."""
    if courses <= 0:
        return 0
    pct = (victoires / courses) * 100
    return int(min(50, round(pct)))


def _compute_rtx(victoires: int, places: int, courses: int) -> str:
    """RTX = code 3 chiffres : (victoires_rate)(places_rate)(courses_total).

    Format : XYZ où :
      X = chiffre 0-9 reflétant le taux de victoires (0=0%, 9≥45%)
      Y = chiffre 0-9 reflétant le taux de places (0=0%, 9≥75%)
      Z = chiffre 0-9 reflétant l'expérience (1 course=0, 50+=9)
    """
    if courses <= 0:
        return "000"
    vic_rate = (victoires / courses) * 100
    place_rate = ((victoires + places) / courses) * 100
    x = min(9, int(vic_rate / 5))
    y = min(9, int(place_rate / 8.5))
    z = min(9, int(courses / 6))
    return f"{x}{y}{z}"


def _count_recent_disq(musique: str, n: int = 5) -> int:
    """Compte le nombre de disqualifications/abandons dans les `n` dernières courses."""
    courses = _parse_musique(musique, max_courses=n)
    return sum(1 for c in courses if c["pos"] is None)


def _count_recent_wins(musique: str, n: int = 3) -> int:
    """Compte le nombre de victoires (1ère place) dans les `n` dernières courses."""
    courses = _parse_musique(musique, max_courses=n)
    return sum(1 for c in courses if c["pos"] == 1)


def _is_deferre_gagnant(musique: str, deferre: str) -> bool:
    """Détecte un signal "déferré gagnant" : cheval déferré ET dernière course victorieuse.

    Configuration courante des entraîneurs lorsqu'ils visent une victoire (le déferrage
    aide la vitesse). Si la dernière course (la plus récente dans la musique) est un "1",
    c'est un signal fort de pic de forme.

    Important :
      - "DEFERRE_*" (DEFERRE_ANTERIEURS, DEFERRE_POSTERIEURS, DEFERRE_ANTERIEURS_POSTERIEURS) → déferré ✅
      - "PROTEGE_*"  → AU CONTRAIRE protégé (avec fers de protection) → pas de bonus
      - vide / None  → ferré normal → pas de bonus

    Args:
        musique: chaîne PMU (ex: "1a8aDa2a")
        deferre: champ deferre PMU (ex: "DEFERRE_ANTERIEURS", "PROTEGE_*", ou "" si normal)
    """
    deferre_str = str(deferre or "").strip().upper()
    if not deferre_str.startswith("DEFERRE"):
        return False
    courses = _parse_musique(musique, max_courses=1)
    if not courses:
        return False
    return courses[0]["pos"] == 1


def _compute_or(
    gains_carriere: int,
    age: int,
    victoires: int,
    places: int,
    courses: int,
    form_score: float,
    musique: str = "",
    deferre: str = "",
) -> str:
    """OR = code 3 chiffres reflétant la classe globale du cheval (composite).

    Formule (option c + malus disq + bonus victoires + bonus déferré gagnant) :
        OR = floor( min(999, max(0,
              top3_rate × 400
            + gains_annuels / 2000
            + form_5dern × 2
            - disq_5dern × 200          # malus -200 par disqualification dans les 5 dernières
            + wins_3dern × 50           # bonus +50 par victoire dans les 3 dernières
            + deferre_gagnant × 30      # bonus +30 si déferré + dernière course gagnée
          )))

    Où :
      - top3_rate         = (victoires + places) / courses, dans [0, 1]
      - gains_annuels     = gains_carriere / max(age - 1, 1)  (€)
      - form_5dern        = score forme 0-100 (5 dernières courses pondérées)
      - disq_5dern        = nombre de D/T/A dans les 5 dernières courses (max 5)
      - wins_3dern        = nombre de 1ères places dans les 3 dernières courses (max 3)
      - deferre_gagnant   = 1 si cheval déferré ET dernière course = victoire, sinon 0

    Le bonus "déferré gagnant" est un signal pro hippique : un entraîneur qui déferre
    un cheval ayant gagné sa dernière course mise sur un pic de forme proche.
    """
    if courses <= 0:
        top3_rate = 0.0
    else:
        top3_rate = (victoires + places) / courses
        # Cap de sécurité au cas où places + victoires > courses (incohérence data)
        top3_rate = max(0.0, min(1.0, top3_rate))

    eff_age = max(1, (age or 4) - 1)
    gains_annuels = gains_carriere / eff_age if eff_age > 0 else 0
    disq_recent = _count_recent_disq(musique, n=5)
    wins_recent = _count_recent_wins(musique, n=3)
    deferre_bonus = 30 if _is_deferre_gagnant(musique, deferre) else 0

    composite = (
        (top3_rate * 400)
        + (gains_annuels / 2000)
        + (form_score * 2)
        - (disq_recent * 200)
        + (wins_recent * 50)
        + deferre_bonus
    )
    code = int(max(0, min(999, round(composite))))
    return f"{code:03d}"


def _compute_idc(form_score: float, cote: Optional[float]) -> float:
    """IDC = Indice de confiance.

    Combine forme récente et confiance du marché (cote). Plus la cote est basse
    (cheval favori) ET la forme bonne, plus l'IDC est élevé. Échelle 0-100.
    """
    if cote is None or cote <= 0:
        return round(form_score * 0.5, 2)
    # Inverse cote : cote 1 → 100, cote 100 → 1
    cote_factor = max(1, min(100, 100 / cote))
    # Pondération : 60% forme, 40% cote
    val = (form_score * 0.6) + (cote_factor * 0.4)
    return round(val, 2)


def _compute_cfp(idc: float, gains_carriere: int, victoires: int) -> int:
    """CFP = Coefficient de Forme & Potentiel (potentiel global).

    Mesure le "potentiel" cumulé d'un cheval : croisement gains × forme × victoires.
    Échelle indicative 0 à 50 000+.
    """
    base = idc * 100
    gains_factor = max(1, gains_carriere / 1000)
    vic_factor = 1 + (victoires * 0.3)
    cfp = base * math.log10(gains_factor + 1) * vic_factor
    return int(round(cfp))


def _compute_ratio(cfp: int, cote: Optional[float]) -> float:
    """RATIO = √(CFP / Cote) — indicateur de value (sous-cote).

    > 20  : cheval très value (sous-coté)
    10-20 : value intéressante
    5-10  : correct
    < 5   : surcoté
    """
    if cote is None or cote <= 0:
        return 0.0
    if cfp <= 0:
        return 0.0
    return round(math.sqrt(cfp / cote), 2)


# ============================================================
# PIPELINE PRINCIPAL
# ============================================================
def compute_turfx_zones(participants: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Calcule les indicateurs + zones + résumé pour la course.

    Args:
        participants: liste de dicts comme retournée par /ferran/.../participants

    Returns:
        {
          "horses": [...],   # tous les chevaux enrichis (indicateurs)
          "zones": {"A": [...], "B": [...], "C": [...]},
          "summary": {"topValue": {...}, "topPotential": {...}, "toAvoid": {...}},
          "stats": {"total": int, "withCote": int}
        }
    """
    enriched: List[Dict[str, Any]] = []
    for p in participants or []:
        if (p.get("statut") or "").upper() in ("NON_PARTANT", "NONPARTANT", "DISQUALIFIE"):
            continue
        num = p.get("num") or p.get("numPmu") or 0
        nom = p.get("nom") or ""
        cote = None
        try:
            raw_cote = p.get("rapportDirect") or p.get("cote")
            cote = float(raw_cote) if raw_cote is not None else None
        except (TypeError, ValueError):
            cote = None

        age = int(p.get("age") or 0) or 5
        sexe = (p.get("sexe") or "")[:1].upper() or "?"
        musique = p.get("musique") or ""
        victoires = int(p.get("nombreVictoires") or 0)
        places = int(p.get("nombrePlaces") or 0)
        courses = int(p.get("nombreCourses") or 0)
        # PMU API renvoie les gains en CENTIMES → on convertit en euros
        gains_raw = int(p.get("gainsParticipant") or 0)
        gains = gains_raw // 100 if gains_raw >= 10000 else gains_raw  # heuristique : >10k forcément centimes
        driver = p.get("driver") or ""
        entraineur = p.get("entraineur") or ""
        deferre = p.get("deferre") or ""

        form_score, _ = _form_score(musique)
        cx = _compute_cx(victoires, courses)
        rtx = _compute_rtx(victoires, places, courses)
        or_code = _compute_or(gains, age, victoires, places, courses, form_score, musique, deferre)
        idc = _compute_idc(form_score, cote)
        cfp = _compute_cfp(idc, gains, victoires)
        ratio = _compute_ratio(cfp, cote)

        enriched.append({
            "num": num,
            "nom": nom,
            "age": age,
            "sexe": sexe,
            "musique": musique,
            "gains": gains,
            "courses": courses,
            "victoires": victoires,
            "places": places,
            "driver": driver,
            "entraineur": entraineur,
            "deferre": deferre,
            "cote": cote,
            "formScore": form_score,
            "cx": cx,
            "rtx": rtx,
            "or": or_code,
            "idc": idc,
            "cfp": cfp,
            "ratio": ratio,
        })

    # Zones A/B/C : tri par cote croissante (favoris en A)
    with_cote = [h for h in enriched if h["cote"] is not None]
    without_cote = [h for h in enriched if h["cote"] is None]
    sorted_horses = sorted(with_cote, key=lambda h: h["cote"]) + without_cote

    n = len(sorted_horses)
    if n == 0:
        zones = {"A": [], "B": [], "C": []}
    else:
        # Découpe : A = top tiers favoris, B = milieu, C = outsiders
        a_size = max(1, n // 3 + (1 if n % 3 > 0 else 0))
        b_size = max(1, n // 3)
        zones = {
            "A": sorted_horses[:a_size],
            "B": sorted_horses[a_size:a_size + b_size],
            "C": sorted_horses[a_size + b_size:],
        }

    # Stars du résumé
    horses_with_ratio = [h for h in enriched if h["ratio"] > 0]
    top_value = max(horses_with_ratio, key=lambda h: h["ratio"]) if horses_with_ratio else None
    top_potential = max(enriched, key=lambda h: h["cfp"]) if enriched else None
    to_avoid = min(horses_with_ratio, key=lambda h: h["ratio"]) if horses_with_ratio else None

    # Marque les stars sur les objets
    for h in enriched:
        h["isTopValue"] = bool(top_value and h["num"] == top_value["num"])
        h["isTopPotential"] = bool(top_potential and h["num"] == top_potential["num"])
        h["isToAvoid"] = bool(to_avoid and h["num"] == to_avoid["num"])

    return {
        "horses": enriched,
        "zones": zones,
        "summary": {
            "topValue": _star_card(top_value, "value"),
            "topPotential": _star_card(top_potential, "potential"),
            "toAvoid": _star_card(to_avoid, "avoid"),
        },
        "stats": {
            "total": len(enriched),
            "withCote": len(with_cote),
        },
    }


def _star_card(h: Optional[Dict[str, Any]], kind: str) -> Optional[Dict[str, Any]]:
    if not h:
        return None
    return {
        "num": h["num"],
        "nom": h["nom"],
        "ratio": h["ratio"],
        "cfp": h["cfp"],
        "cote": h["cote"],
        "kind": kind,
    }

