
"""TURFEX — Module 'Turf Astro' (numérologie de course).

Intégration de l'application TURF ASTRO sous le préfixe `/api/astro/*`.
Les routes existantes TURFEX (`/api/programme`, `/api/race`, etc.) ne sont
PAS modifiées — namespace dédié pour éviter toute collision.

Code source : turf_astro_source_complet.txt (transmis par l'utilisateur).
Méthode : Astro's Racing Numerology (1925) — Chaldean letter values.
"""
import re
import uuid
import logging
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger(__name__)

ASTRO_PMU_BASE = "https://online.turfinfo.api.pmu.fr/rest/client/1"
ASTRO_PMU_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
    "Accept": "application/json",
    "Origin": "https://www.pmu.fr",
    "Referer": "https://www.pmu.fr/",
}

# ---------- ASTRO NUMEROLOGY ----------
CHALDEAN: Dict[str, int] = {
    'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5, 'F': 8, 'G': 3, 'H': 5,
    'I': 1, 'J': 1, 'K': 2, 'L': 3, 'M': 4, 'N': 5, 'O': 7, 'P': 8,
    'Q': 1, 'R': 2, 'S': 3, 'T': 4, 'U': 6, 'V': 6, 'W': 6, 'X': 5,
    'Y': 1, 'Z': 7
}


def reduce_digit(n: int) -> int:
    """Reduce a number to a single digit (1-9)."""
    if n <= 0:
        return 0
    while n > 9:
        n = sum(int(c) for c in str(n))
    return n


def name_value(name: str) -> int:
    """Total Chaldean numeric value of a name."""
    if not name:
        return 0
    total = 0
    for ch in name.upper():
        if ch in CHALDEAN:
            total += CHALDEAN[ch]
    return total


def day_value(date_ddmmyyyy: str) -> int:
    """Day Value (D.V.): sum of digits of date reduced to single digit."""
    digits = [int(c) for c in date_ddmmyyyy if c.isdigit()]
    return reduce_digit(sum(digits))


def compute_predictions(date_str: str, participants: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Apply Astro-inspired numerology and return ranked predictions."""
    starters = [p for p in participants if p.get('statut') == 'PARTANT']
    fnh = len(starters)
    fnh_red = reduce_digit(fnh)
    dv = day_value(date_str)

    out = []
    for p in starters:
        nm = p.get('nom', '') or ''
        num = p.get('numPmu', 0) or 0
        nv_total = name_value(nm)
        nv_red = reduce_digit(nv_total)
        first_letter = (nm[:1] or '').upper()
        id_val = reduce_digit(CHALDEAN.get(first_letter, 0))

        reasons = []
        score = 0
        if nv_red == dv:
            score = max(score, 100)
            reasons.append("Outright Winner (Name Value = D.V.)")
        if nv_red == fnh_red and fnh_red != 0:
            score = max(score, 80)
            reasons.append("Direct Connection (Name Value = F.N.H.)")
        if id_val == dv and id_val != 0:
            score = max(score, 70)
            reasons.append("Unit Force (Initial Digit = D.V.)")
        if num and nv_total and nv_total % num == 0:
            score = max(score, 60)
            reasons.append("Double Force (numéro divise Name Value)")
        if score == 0:
            distance = abs(nv_red - dv)
            score = max(0, 50 - distance * 6)
            reasons.append(f"Affinité partielle (écart {distance})")

        out.append({
            "numPmu": num,
            "nom": nm,
            "nameValueTotal": nv_total,
            "nameValueReduced": nv_red,
            "initialDigit": id_val,
            "score": score,
            "reasons": reasons,
        })

    out.sort(key=lambda x: (-x["score"], x["numPmu"]))
    rank = 1
    for item in out:
        item["rank"] = rank
        rank += 1
    return out


# ---------- MODELS ----------
class AstroFavoriteCreate(BaseModel):
    date: str
    reunion: int
    course: int
    numPmu: int
    nom: str
    note: Optional[str] = ""


class AstroFavorite(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    date: str
    reunion: int
    course: int
    numPmu: int
    nom: str
    note: Optional[str] = ""
    createdAt: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


def _validate_date(date_str: str) -> str:
    if not re.fullmatch(r"\d{8}", date_str):
        raise HTTPException(400, "Date doit être au format ddMMyyyy")
    return date_str


def build_astro_router(db) -> APIRouter:
    """Construit le router Turf Astro et lui injecte la dépendance MongoDB.

    Toutes les routes sont préfixées par `/astro` (sera elle-même intégrée
    dans le router principal `/api`, donc URL finale `/api/astro/...`).
    """
    router = APIRouter(prefix="/astro", tags=["turf_astro"])

    @router.get("/")
    async def astro_root():
        return {"message": "Turf Astro · Numérologie PMU", "ok": True}

    @router.get("/programme/{date}")
    async def astro_get_programme(date: str):
        _validate_date(date)
        try:
            r = requests.get(f"{ASTRO_PMU_BASE}/programme/{date}", headers=ASTRO_PMU_HEADERS, timeout=15)
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            raise HTTPException(502, f"Erreur PMU: {e}")
        prog = data.get("programme") or {}
        reunions = prog.get("reunions") or []
        summary = []
        for reu in reunions:
            hippo = reu.get("hippodrome") or {}
            courses = []
            for c in reu.get("courses") or []:
                courses.append({
                    "numOrdre": c.get("numOrdre"),
                    "numExterne": c.get("numExterne"),
                    "libelle": c.get("libelle"),
                    "libelleCourt": c.get("libelleCourt"),
                    "discipline": c.get("discipline"),
                    "specialite": c.get("specialite"),
                    "distance": c.get("distance"),
                    "distanceUnit": c.get("distanceUnit"),
                    "heureDepart": c.get("heureDepart"),
                    "montantPrix": c.get("montantPrix"),
                    "nombreDeclaresPartants": c.get("nombreDeclaresPartants"),
                    "arriveeDefinitive": c.get("arriveeDefinitive"),
                    "departImminent": c.get("departImminent"),
                })
            summary.append({
                "numOfficiel": reu.get("numOfficiel"),
                "numExterne": reu.get("numExterne"),
                "dateReunion": reu.get("dateReunion"),
                "nature": reu.get("nature"),
                "hippodrome": {
                    "code": hippo.get("code"),
                    "libelleCourt": hippo.get("libelleCourt"),
                    "libelleLong": hippo.get("libelleLong"),
                },
                "pays": reu.get("pays"),
                "courses": courses,
            })
        return {"date": date, "reunions": summary}

    @router.get("/race/{date}/R{reunion}/C{course}/participants")
    async def astro_get_participants(date: str, reunion: int, course: int):
        _validate_date(date)
        try:
            r = requests.get(
                f"{ASTRO_PMU_BASE}/programme/{date}/R{reunion}/C{course}/participants",
                headers=ASTRO_PMU_HEADERS, timeout=15
            )
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            raise HTTPException(502, f"Erreur PMU: {e}")
        return data

    @router.get("/numerology/{date}/R{reunion}/C{course}")
    async def astro_get_numerology(date: str, reunion: int, course: int):
        _validate_date(date)
        try:
            r = requests.get(
                f"{ASTRO_PMU_BASE}/programme/{date}/R{reunion}/C{course}/participants",
                headers=ASTRO_PMU_HEADERS, timeout=15
            )
            r.raise_for_status()
            data = r.json()
        except Exception as e:
            raise HTTPException(502, f"Erreur PMU: {e}")
        participants = data.get("participants") or []
        predictions = compute_predictions(date, participants)
        return {
            "date": date,
            "reunion": reunion,
            "course": course,
            "dayValue": day_value(date),
            "fullNumberHorses": len([p for p in participants if p.get('statut') == 'PARTANT']),
            "predictions": predictions,
        }

    @router.post("/favorites", response_model=AstroFavorite)
    async def astro_add_favorite(payload: AstroFavoriteCreate):
        fav = AstroFavorite(**payload.model_dump())
        await db.astro_favorites.insert_one(fav.model_dump())
        return fav

    @router.get("/favorites", response_model=List[AstroFavorite])
    async def astro_list_favorites(date: Optional[str] = None):
        q: Dict[str, Any] = {}
        if date:
            q["date"] = date
        rows = await db.astro_favorites.find(q, {"_id": 0}).sort("createdAt", -1).to_list(500)
        return rows

    @router.delete("/favorites/{fav_id}")
    async def astro_delete_favorite(fav_id: str):
        res = await db.astro_favorites.delete_one({"id": fav_id})
        if res.deleted_count == 0:
            raise HTTPException(404, "Favori introuvable")
        return {"ok": True}

    return router

