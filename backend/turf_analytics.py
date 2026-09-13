
"""Algorithme turf Python simplifié pour sélection automatique des top 8 chevaux.

Inspiré de /app/frontend/src/lib/analytics.js mais plus léger : on vise 80% de la
qualité avec une implémentation claire et testable.

Critères pris en compte :
 - Cote (simple gagnant) — plus faible = meilleur
 - Forme récente (3 dernières courses) — moyenne pondérée des places par récence
 - Fraîcheur — dernière course ni trop proche (<5j) ni trop loin (>90j)
 - Expérience piste/discipline — bonus si déjà couru même hippodrome ou discipline
 - Régularité driver — bonus si même driver que la dernière course
 - Stabilité entraineur — bonus si même entraineur sur les 3 dernières + podiums sous cet entraineur

Pondération finale (somme = 100) :
  forme:30  cote:30  entraineur:10  fraicheur:15  piste:10  driver:5

Module turf_analytics expose aussi compute_entraineur_stats(course_data) qui agrège
les performances des entraineurs présents dans la course (chevaux, podiums,
meilleure place sur les 3 dernières courses de leurs partants).
"""
from typing import List, Dict, Any, Optional


def _score_cote(cote: Optional[float], all_cotes: List[float]) -> float:
    """Plus la cote est faible, plus le score est élevé (0-100)."""
    if cote is None or cote <= 0 or not all_cotes:
        return 30.0  # neutre (peu d'info)
    min_c = max(1.1, min(c for c in all_cotes if c and c > 0))
    # score = 100 quand c=min, décroît en courbe log
    import math
    return max(0.0, min(100.0, 100.0 * (1.0 - math.log(cote / min_c) / 3.5)))


def _score_forme(history: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Moyenne pondérée des places sur les 3 dernières courses.
    Retourne {score, reasons, podiums, nbCourses}."""
    if not history:
        return {"score": 35.0, "reasons": ["Pas d'historique disponible"], "podiums": 0, "nbCourses": 0}

    weighted = 0.0
    total_w = 0.0
    podiums = 0
    for i, c in enumerate(history[:3]):
        place = int(c.get("place") or 0)
        partants = int(c.get("partants") or 16)
        days_ago = int(c.get("daysAgo") or 30)
        if place <= 0:
            continue
        # Récence : plus c'est récent, plus ça compte
        w = 1.0 / (1.0 + days_ago / 45.0)
        # Score individuel : top = 100, flop = 0, non classé = 5
        if place == 1:
            s = 100
            podiums += 1
        elif place == 2:
            s = 85
            podiums += 1
        elif place == 3:
            s = 72
            podiums += 1
        elif place == 4:
            s = 58
        elif place == 5:
            s = 48
        elif place <= partants // 2:
            s = 35
        else:
            s = 10
        weighted += s * w
        total_w += w

    score = (weighted / total_w) if total_w > 0 else 25.0
    reasons = []
    if podiums >= 2:
        reasons.append(f"{podiums} podium{'s' if podiums > 1 else ''} sur {min(3, len(history))}")
    elif podiums == 1:
        reasons.append("1 podium récent")
    if score >= 65:
        reasons.append("Forme solide")
    elif score < 25:
        reasons.append("Forme en berne")

    return {"score": score, "reasons": reasons, "podiums": podiums, "nbCourses": len(history)}


def _score_fraicheur(history: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Bonus si dernière course dans la fenêtre optimale (10-45j)."""
    if not history:
        return {"score": 40.0, "reasons": []}
    last = history[0]
    days = int(last.get("daysAgo") or 999)
    reasons = []
    if days < 5:
        return {"score": 35.0, "reasons": [f"Court (dernière il y a {days}j)"]}
    if days <= 15:
        return {"score": 90.0, "reasons": [f"Très frais ({days}j)"]}
    if days <= 45:
        return {"score": 80.0, "reasons": []}
    if days <= 90:
        reasons.append(f"Rentrée ({days}j)")
        return {"score": 55.0, "reasons": reasons}
    return {"score": 25.0, "reasons": [f"Longue absence ({days}j)"]}


def _score_piste(history: List[Dict[str, Any]], current_hippo: str, current_disc: str) -> Dict[str, Any]:
    """Bonus si le cheval a déjà couru sur l'hippodrome ou dans la discipline."""
    if not history:
        return {"score": 45.0, "reasons": []}
    up_h = (current_hippo or "").upper().strip()
    up_d = (current_disc or "").upper().strip()
    same_hippo = same_disc = 0
    best_place_same = None
    for c in history[:3]:
        if up_h and up_h in (c.get("hippodrome") or "").upper():
            same_hippo += 1
            p = int(c.get("place") or 99)
            if p > 0 and (best_place_same is None or p < best_place_same):
                best_place_same = p
        if up_d and up_d in (c.get("discipline") or "").upper():
            same_disc += 1

    score = 40.0
    reasons = []
    if same_hippo and best_place_same and best_place_same <= 3:
        score = 95.0
        reasons.append("Piste connue (podium ici)")
    elif same_hippo:
        score = 72.0
        reasons.append("Déjà couru ici")
    elif same_disc >= 2:
        score = 60.0
        reasons.append("Habitué de la discipline")
    return {"score": score, "reasons": reasons}


def _score_driver(history: List[Dict[str, Any]], current_driver: str) -> Dict[str, Any]:
    """Bonus si le cheval reconduit son driver récent."""
    if not history or not current_driver:
        return {"score": 50.0, "reasons": []}
    last_driver = (history[0].get("driver") or "").strip()
    if last_driver and last_driver.upper() == current_driver.upper():
        # Si le couple a fait un podium ensemble → meilleur bonus
        last_place = int(history[0].get("place") or 99)
        if last_place and last_place <= 3:
            return {"score": 90.0, "reasons": [f"Couple driver OK ({current_driver})"]}
        return {"score": 70.0, "reasons": [f"Même driver ({current_driver})"]}
    return {"score": 45.0, "reasons": ["Nouveau driver"]}


def _score_entraineur(history: List[Dict[str, Any]], current_entraineur: str) -> Dict[str, Any]:
    """Bonus selon la stabilité + les performances de l'entraineur actuel sur les 3 dernières courses.

    Analyse :
    - Stabilité : nombre de fois où current_entraineur == entraineur de l'historique
    - Performance sous cet entraineur : podiums, places ≤ 5
    """
    if not history:
        return {"score": 45.0, "reasons": [], "podiums": 0, "stability": 0}
    if not current_entraineur:
        return {"score": 40.0, "reasons": [], "podiums": 0, "stability": 0}

    cur = current_entraineur.strip().upper()
    stability = 0
    podiums_under = 0
    top5_under = 0
    last_was_same = False
    for i, c in enumerate(history[:3]):
        h_ent = (c.get("entraineur") or "").strip().upper()
        if h_ent and h_ent == cur:
            stability += 1
            if i == 0:
                last_was_same = True
            place = int(c.get("place") or 99)
            if place and place <= 3:
                podiums_under += 1
            if place and place <= 5:
                top5_under += 1

    if stability == 0:
        return {
            "score": 35.0,
            "reasons": [f"Nouvel entraineur ({current_entraineur})"],
            "podiums": 0,
            "stability": 0,
        }

    # Base stability score: 60 (1 course) / 75 (2 courses) / 85 (3 courses)
    base = 40 + stability * 15
    # Bonus performance
    bonus_perf = podiums_under * 8 + max(0, top5_under - podiums_under) * 3
    score = min(100.0, base + bonus_perf)

    reasons = []
    if stability == 3 and podiums_under >= 2:
        reasons.append(f"Entraineur stable + {podiums_under} podiums/3")
    elif podiums_under >= 1 and last_was_same:
        reasons.append(f"Même entraineur ({podiums_under} podium{'s' if podiums_under > 1 else ''})")
    elif stability >= 2:
        reasons.append("Entraineur reconduit")
    elif last_was_same:
        reasons.append("Même entraineur que dernière")

    return {
        "score": score,
        "reasons": reasons,
        "podiums": podiums_under,
        "stability": stability,
    }


def compute_top8(course_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Retourne le top 8 des chevaux avec score détaillé et raisons.

    Args:
        course_data: dict retourné par /api/scrape-pmu avec participants (+ history+cote)
                     et courseInfo (hippodrome, discipline)

    Returns:
        Liste de dicts [{numPmu, nom, driver, cote, score, grade, reasons:[...], breakdown:{...}}]
    """
    participants = course_data.get("participants", []) or []
    hippo = ""
    disc = ""
    ci = course_data.get("courseInfo") or {}
    if isinstance(ci, dict):
        hippo = ci.get("hippodrome") or ""
        disc = ci.get("discipline") or ""
    # Fallback depuis la course
    if not hippo:
        course = course_data.get("course") or {}
        if isinstance(course, dict):
            hippo = course.get("hippodrome") or ""
            disc = course.get("discipline") or course.get("specialite") or ""

    all_cotes = [p.get("cote") for p in participants if isinstance(p.get("cote"), (int, float))]

    scored = []
    for p in participants:
        # Exclure non-partants
        statut = (p.get("statut") or "").upper()
        if statut in ("NON_PARTANT", "NONPARTANT", "DISQUALIFIE_NON_PARTI"):
            continue

        num = p.get("numPmu")
        if num is None:
            continue

        history = p.get("history") or []
        cote = p.get("cote")
        driver = p.get("driver") or p.get("nomJockey") or ""
        entraineur = p.get("entraineur") or p.get("nomEntraineur") or ""

        sc_cote = _score_cote(cote, all_cotes) if all_cotes else 30.0
        sc_forme = _score_forme(history)
        sc_frais = _score_fraicheur(history)
        sc_piste = _score_piste(history, hippo, disc)
        sc_driver = _score_driver(history, driver)
        sc_entra = _score_entraineur(history, entraineur)

        # Pondération : forme 30 + cote 30 + entraineur 10 + fraîcheur 15 + piste 10 + driver 5 = 100
        total = (
            0.30 * sc_cote
            + 0.30 * sc_forme["score"]
            + 0.15 * sc_frais["score"]
            + 0.10 * sc_piste["score"]
            + 0.05 * sc_driver["score"]
            + 0.10 * sc_entra["score"]
        )

        reasons = []
        # Cote
        if cote is not None:
            if all_cotes and cote == min(all_cotes):
                reasons.append(f"Favori (cote {cote:.1f})")
            elif cote <= 3.5:
                reasons.append(f"Cote abordable ({cote:.1f})")
        reasons.extend(sc_forme["reasons"])
        reasons.extend(sc_entra["reasons"])
        reasons.extend(sc_frais["reasons"])
        reasons.extend(sc_piste["reasons"])
        reasons.extend(sc_driver["reasons"])
        # Dédupe et limite à 4
        seen = set()
        dedup = []
        for r in reasons:
            if r not in seen:
                seen.add(r)
                dedup.append(r)
            if len(dedup) >= 4:
                break

        # Grade
        if total >= 72:
            grade = "A"
        elif total >= 60:
            grade = "B"
        elif total >= 48:
            grade = "C"
        elif total >= 35:
            grade = "D"
        else:
            grade = "E"

        scored.append({
            "numPmu": num,
            "nom": p.get("nom") or p.get("nomCheval") or f"#{num}",
            "driver": driver,
            "entraineur": entraineur,
            "cote": cote,
            "score": round(total, 1),
            "grade": grade,
            "reasons": dedup,
            "breakdown": {
                "forme": round(sc_forme["score"], 1),
                "cote": round(sc_cote, 1),
                "fraicheur": round(sc_frais["score"], 1),
                "piste": round(sc_piste["score"], 1),
                "driver": round(sc_driver["score"], 1),
                "entraineur": round(sc_entra["score"], 1),
            },
        })

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:8]


def compute_entraineur_stats(course_data: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Agrège les stats des entraineurs de la course.

    Pour chaque entraineur (identifié par le nom du cheval de la course) on calcule
    sur les 3 dernières courses de SES partants :
    - nb chevaux présents dans la course
    - nb podiums cumulés (places 1-3)
    - nb places dans le top 5
    - meilleure place observée
    - moyenne de place (hors non-classés)

    Retourne le top 5 entraineurs par score (podiums + top5 pondérés).
    """
    participants = course_data.get("participants", []) or []
    agg: Dict[str, Dict[str, Any]] = {}

    for p in participants:
        # Exclure non-partants
        statut = (p.get("statut") or "").upper()
        if statut in ("NON_PARTANT", "NONPARTANT", "DISQUALIFIE_NON_PARTI"):
            continue
        ent = (p.get("entraineur") or p.get("nomEntraineur") or "").strip()
        if not ent:
            continue
        key = ent.upper()
        bucket = agg.setdefault(key, {
            "nom": ent,
            "chevaux": 0,
            "chevaux_noms": [],
            "podiums": 0,
            "top5": 0,
            "nbCoursesAnalysees": 0,
            "bestPlace": None,
            "sumPlace": 0,
            "countPlace": 0,
        })
        bucket["chevaux"] += 1
        cheval_nom = p.get("nom") or p.get("nomCheval") or f"#{p.get('numPmu', '')}"
        bucket["chevaux_noms"].append(cheval_nom)

        for c in (p.get("history") or [])[:3]:
            place = int(c.get("place") or 0)
            bucket["nbCoursesAnalysees"] += 1
            if place > 0:
                if place <= 3:
                    bucket["podiums"] += 1
                if place <= 5:
                    bucket["top5"] += 1
                if bucket["bestPlace"] is None or place < bucket["bestPlace"]:
                    bucket["bestPlace"] = place
                bucket["sumPlace"] += place
                bucket["countPlace"] += 1

    # Calcule score et moyenne, puis trie
    out = []
    for _, v in agg.items():
        nb_courses = max(1, v["nbCoursesAnalysees"])
        score = (v["podiums"] * 10) + (v["top5"] * 4)
        win_rate = round(100.0 * v["podiums"] / nb_courses, 1) if v["nbCoursesAnalysees"] else 0.0
        avg_place = round(v["sumPlace"] / v["countPlace"], 1) if v["countPlace"] else None
        out.append({
            "entraineur": v["nom"],
            "chevaux": v["chevaux"],
            "chevauxNoms": v["chevaux_noms"],
            "podiums": v["podiums"],
            "top5": v["top5"],
            "nbCourses3derniers": v["nbCoursesAnalysees"],
            "bestPlace": v["bestPlace"],
            "avgPlace": avg_place,
            "podiumRate": win_rate,  # % de podiums sur les 3 dernières
            "score": score,
        })

    out.sort(key=lambda x: (x["score"], x["chevaux"]), reverse=True)
    return out[:5]



# ===== TOP 8 = 4 FAVORIS (cotes 2-10) + 4 OUTSIDERS (cotes 11-25) =====
# Scoring combiné = 60 % forme score + 40 % réussite carrière (sur tout l'historique)


def _score_career(history: List[Dict[str, Any]]) -> float:
    """Score 0-100 basé sur la réussite carrière du cheval :
    50 % taux de podium (place ≤ 3) + 50 % taux de victoire (place = 1)
    sur l'ensemble de l'historique disponible.
    """
    if not history:
        return 30.0
    n = 0
    wins = 0
    podiums = 0
    for c in history:
        place = int(c.get("place") or 0)
        if place <= 0:
            continue
        n += 1
        if place == 1:
            wins += 1
            podiums += 1
        elif place <= 3:
            podiums += 1
    if n == 0:
        return 30.0
    win_rate = wins / n
    pod_rate = podiums / n
    # Boost si nombreuses courses (cheval expérimenté)
    experience_bonus = min(15.0, n * 0.5)
    return min(100.0, 100.0 * (0.5 * pod_rate + 0.5 * win_rate) + experience_bonus)


def compute_top8_bases_outsiders(course_data: Dict[str, Any]) -> Dict[str, List[Dict[str, Any]]]:
    """Sépare le top 8 en 4 favoris (cotes 2-10) + 4 outsiders (cotes 11-25).

    Stratégie de fallback (si pas assez dans une fourchette) :
      1. Élargir outsiders à 11-35
      2. Combler avec les meilleurs hors fourchette (ordre score combiné décroissant)
      3. Pour bases : garder ce qui a la plus petite cote disponible

    Score combiné = 0.6 × forme_score + 0.4 × career_score (sur 0-100).

    Returns:
        {"favoris": [...4 max...], "outsiders": [...4 max...]}
    """
    base_top8 = compute_top8(course_data)  # déjà trié par score multi-critères
    # On recalcule un score combiné spécifique pour le tri bases/outsiders
    # mais on conserve toutes les infos déjà calculées
    participants = course_data.get("participants", []) or []
    by_num = {p.get("numPmu"): p for p in participants}

    enriched = []
    for h in base_top8:
        p = by_num.get(h.get("numPmu")) or {}
        history = p.get("history") or []
        forme_data = _score_forme(history)
        career = _score_career(history)
        combined = 0.6 * forme_data["score"] + 0.4 * career
        enriched.append({
            **h,
            "_combinedScore": round(combined, 1),
            "_career": round(career, 1),
        })

    # Étendre la sélection au-delà du top 8 si besoin (pour avoir assez d'outsiders)
    # On recalcule pour TOUS les partants pour combler les fourchettes
    all_cotes = [p.get("cote") for p in participants if isinstance(p.get("cote"), (int, float))]
    full_scored = []
    for p in participants:
        statut = (p.get("statut") or "").upper()
        if statut in ("NON_PARTANT", "NONPARTANT", "DISQUALIFIE_NON_PARTI"):
            continue
        num = p.get("numPmu")
        if num is None:
            continue
        cote = p.get("cote")
        # Si déjà dans `enriched`, on garde l'objet existant
        existing = next((e for e in enriched if e.get("numPmu") == num), None)
        if existing:
            full_scored.append(existing)
            continue
        history = p.get("history") or []
        forme_data = _score_forme(history)
        career = _score_career(history)
        combined = 0.6 * forme_data["score"] + 0.4 * career
        # Calcule un grade et reasons minimaux pour cohérence d'affichage
        ci = course_data.get("courseInfo") or {}
        hippo = ci.get("hippodrome") or ""
        disc = ci.get("discipline") or ""
        sc_cote = _score_cote(cote, all_cotes) if all_cotes else 30.0
        sc_frais = _score_fraicheur(history)
        sc_piste = _score_piste(history, hippo, disc)
        sc_driver = _score_driver(history, p.get("driver") or p.get("nomJockey") or "")
        sc_entra = _score_entraineur(history, p.get("entraineur") or p.get("nomEntraineur") or "")
        total = (
            0.30 * sc_cote
            + 0.30 * forme_data["score"]
            + 0.15 * sc_frais["score"]
            + 0.10 * sc_piste["score"]
            + 0.05 * sc_driver["score"]
            + 0.10 * sc_entra["score"]
        )
        if total >= 72:
            grade = "A"
        elif total >= 60:
            grade = "B"
        elif total >= 48:
            grade = "C"
        elif total >= 35:
            grade = "D"
        else:
            grade = "E"
        reasons = []
        if cote is not None and cote <= 3.5:
            reasons.append(f"Cote abordable ({cote:.1f})")
        reasons.extend(forme_data["reasons"][:2])
        full_scored.append({
            "numPmu": num,
            "nom": p.get("nom") or p.get("nomCheval") or f"#{num}",
            "driver": p.get("driver") or p.get("nomJockey") or "",
            "entraineur": p.get("entraineur") or p.get("nomEntraineur") or "",
            "cote": cote,
            "score": round(total, 1),
            "grade": grade,
            "reasons": reasons[:4],
            "_combinedScore": round(combined, 1),
            "_career": round(career, 1),
        })

    # Tri par score combiné DESC pour piocher les meilleurs
    full_scored.sort(key=lambda x: x["_combinedScore"], reverse=True)

    # Sélection bases (cote 2-10) — 4 meilleurs par score combiné
    bases_pool = [h for h in full_scored if isinstance(h.get("cote"), (int, float)) and 2.0 <= h["cote"] <= 10.0]
    bases = bases_pool[:4]
    # Si <4 bases : compléter avec les meilleurs hors fourchette (cote ≤ 12)
    if len(bases) < 4:
        already_ids = {b["numPmu"] for b in bases}
        extra = [h for h in full_scored if h.get("numPmu") not in already_ids and isinstance(h.get("cote"), (int, float)) and h["cote"] <= 12.0]
        bases.extend(extra[: 4 - len(bases)])
    # Toujours <4 ? Compléter avec les meilleurs absolus (peu importe la cote)
    if len(bases) < 4:
        already_ids = {b["numPmu"] for b in bases}
        extra = [h for h in full_scored if h.get("numPmu") not in already_ids]
        bases.extend(extra[: 4 - len(bases)])

    base_ids = {b["numPmu"] for b in bases}

    # Sélection outsiders (cote 11-25) — 4 meilleurs par score combiné
    outsiders_pool = [
        h for h in full_scored
        if h.get("numPmu") not in base_ids
        and isinstance(h.get("cote"), (int, float))
        and 11.0 <= h["cote"] <= 25.0
    ]
    outsiders = outsiders_pool[:4]
    # Fallback 1 : élargir à 11-35
    if len(outsiders) < 4:
        already_ids = base_ids | {o["numPmu"] for o in outsiders}
        extra = [
            h for h in full_scored
            if h.get("numPmu") not in already_ids
            and isinstance(h.get("cote"), (int, float))
            and 11.0 <= h["cote"] <= 35.0
        ]
        outsiders.extend(extra[: 4 - len(outsiders)])
    # Fallback 2 : tout cheval pas encore pris, cote > 10
    if len(outsiders) < 4:
        already_ids = base_ids | {o["numPmu"] for o in outsiders}
        extra = [
            h for h in full_scored
            if h.get("numPmu") not in already_ids
            and isinstance(h.get("cote"), (int, float))
            and h["cote"] > 10.0
        ]
        outsiders.extend(extra[: 4 - len(outsiders)])
    # Fallback 3 : n'importe quel cheval restant (rare, courses < 10 partants)
    if len(outsiders) < 4:
        already_ids = base_ids | {o["numPmu"] for o in outsiders}
        extra = [h for h in full_scored if h.get("numPmu") not in already_ids]
        outsiders.extend(extra[: 4 - len(outsiders)])

    # Nettoie les champs internes (préfixe _) avant retour
    def _clean(h):
        return {k: v for k, v in h.items() if not k.startswith("_")}

    return {
        "favoris": [_clean(b) for b in bases[:4]],
        "outsiders": [_clean(o) for o in outsiders[:4]],
    }

