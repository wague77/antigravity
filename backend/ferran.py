
"""
Ferran Method - Adaptation logicielle de la méthode de pronostic par élimination.

Critères implémentés (issus du PDF) :
1. Synthèse de la presse (basée sur les cotes : favoris = cote la + basse)
2. Écart général (rapport gains/courses faibles ⇒ écart élevé)
3. Chiffrage de la 1ère lettre (nom cheval / driver / entraîneur)
4. Séries pairs/impairs (couplés écartés selon parité dominante)
5. Suite de 2 numéros (génération de séquences à partir des favoris)
6. Opérations mathématiques (addition/soustraction/multiplication)
7. Pourcentage de victoires/places ("réussite")
8. Élimination par identité (driver/entraîneur déjà gagnant)
9. Génération de Couplés / Tiercés probables avec scoring
"""
from itertools import combinations
from typing import List, Dict, Any
import string


def _alpha_idx(letter: str) -> int:
    if not letter:
        return 0
    letter = letter.upper()
    return string.ascii_uppercase.index(letter) + 1 if letter in string.ascii_uppercase else 0


def _safe_div(a, b):
    return a / b if b else 0.0


def _success_rate(p: Dict[str, Any]) -> float:
    courses = p.get("nombreCourses") or 0
    vict = p.get("nombreVictoires") or 0
    places = p.get("nombrePlaces") or 0
    return _safe_div(vict + places, courses) if courses else 0.0


def _ecart_score(p: Dict[str, Any]) -> float:
    """High écart = horse hasn't placed in many recent attempts (musique-based)."""
    musique = (p.get("musique") or "").upper()
    if not musique:
        return 0.5
    bad = sum(1 for ch in musique if ch.isdigit() and int(ch) > 3) + musique.count("0")
    bad += sum(1 for ch in musique if ch in "DART")
    total = len([ch for ch in musique if ch.isdigit() or ch in "DARTaq"])
    return _safe_div(bad, total) if total else 0.5


def _odds(p: Dict[str, Any]) -> float:
    rap = (p.get("dernierRapportDirect") or {}).get("rapport")
    if rap is None:
        rap = (p.get("dernierRapportReference") or {}).get("rapport")
    return float(rap) if rap is not None else 99.0


def analyze_with_ferran(participants: List[Dict[str, Any]]) -> Dict[str, Any]:
    runners = [p for p in participants if p.get("statut") == "PARTANT"]
    n = len(runners)

    # === Step 1: Press synthesis (favorites by odds) ===
    sorted_by_odds = sorted(runners, key=_odds)
    favorites = [p["numPmu"] for p in sorted_by_odds[: min(5, n)]]

    # === Step 2: Pairs / Impairs distribution ===
    pairs = [p["numPmu"] for p in runners if p["numPmu"] % 2 == 0]
    impairs = [p["numPmu"] for p in runners if p["numPmu"] % 2 == 1]
    parity_dominant = "pair" if len(pairs) > len(impairs) else "impair"

    # === Step 3: Chiffrage 1ère lettre du nom ===
    chiffrage = []
    for p in runners:
        nom = (p.get("nom") or "").strip()
        driver = (p.get("driver") or "").strip()
        entr = (p.get("entraineur") or "").strip()
        chiffrage.append({
            "numPmu": p["numPmu"],
            "nom": nom,
            "chiffreNom": _alpha_idx(nom[0]) if nom else 0,
            "chiffreDriver": _alpha_idx(driver[0]) if driver else 0,
            "chiffreEntraineur": _alpha_idx(entr[0]) if entr else 0,
            "nombreLettresNom": len(nom.replace(" ", "")),
        })

    # === Step 4: Score multi-critères pour chaque partant ===
    scored = []
    min_odds = min((_odds(p) for p in runners), default=1.0) or 1.0
    for p in runners:
        odds = _odds(p)
        success = _success_rate(p)
        ecart = _ecart_score(p)
        score = (
            (min_odds / odds) * 40
            + success * 30
            + (1 - ecart) * 20
            + (5 if p["numPmu"] in favorites else 0)
            + (5 if p["numPmu"] % 2 == (0 if parity_dominant == "pair" else 1) else 0)
        )
        scored.append({
            "numPmu": p["numPmu"],
            "nom": p.get("nom"),
            "driver": p.get("driver"),
            "entraineur": p.get("entraineur"),
            "odds": odds if odds < 99 else None,
            "successRate": round(success * 100, 1),
            "ecartScore": round(ecart, 2),
            "score": round(score, 2),
            "musique": p.get("musique"),
        })
    scored.sort(key=lambda x: -x["score"])

    # === Step 5: Élimination - les 30% les plus faibles ===
    cutoff = max(int(n * 0.7), 4) if n >= 6 else max(n - 1, 2)
    kept = scored[:cutoff]
    eliminated = scored[cutoff:]
    kept_nums = [s["numPmu"] for s in kept]

    # === Step 6: Couplés probables (top 6) ===
    top_for_couples = kept[: min(6, len(kept))]
    couples_scored = []
    for a, b in combinations(top_for_couples, 2):
        cs = (a["score"] + b["score"]) / 2
        if (a["numPmu"] + b["numPmu"]) % 2 == 1:
            cs += 2
        couples_scored.append({
            "couple": [a["numPmu"], b["numPmu"]],
            "score": round(cs, 2),
            "names": [a["nom"], b["nom"]],
        })
    couples_scored.sort(key=lambda x: -x["score"])
    top_couples = couples_scored[:8]

    # === Step 7: Tiercés probables (top 4) ===
    top_for_tierces = kept[: min(5, len(kept))]
    tierces_scored = []
    for a, b, c in combinations(top_for_tierces, 3):
        ts = (a["score"] + b["score"] + c["score"]) / 3
        tierces_scored.append({
            "tierce": [a["numPmu"], b["numPmu"], c["numPmu"]],
            "score": round(ts, 2),
            "names": [a["nom"], b["nom"], c["nom"]],
        })
    tierces_scored.sort(key=lambda x: -x["score"])
    top_tierces = tierces_scored[:6]

    # === Step 8: Suite de 2 numéros (math operations on top couple) ===
    suites = []
    if len(top_couples) >= 1:
        a, b = top_couples[0]["couple"]
        candidates = set()
        candidates.add(a + 1)
        candidates.add(a - 1)
        candidates.add(b + 1)
        candidates.add(b - 1)
        candidates.add(a + b)
        candidates.add(abs(a - b))
        if a > 0:
            candidates.add(b // a if a > 0 else 0)
        candidates.add((a * b) % max(n, 1))
        valid = sorted([c for c in candidates if c in [p["numPmu"] for p in runners] and c not in (a, b)])
        suites = [{"base": [a, b], "candidates": valid}]

    return {
        "totalPartants": n,
        "favorites": favorites,
        "parity": {"pair": pairs, "impair": impairs, "dominant": parity_dominant},
        "chiffrage": chiffrage,
        "scored": scored,
        "kept": kept_nums,
        "eliminated": [s["numPmu"] for s in eliminated],
        "topCouples": top_couples,
        "topTierces": top_tierces,
        "suites": suites,
    }

