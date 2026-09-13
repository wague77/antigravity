
"""TURFEX — Module 'Odds Detective' (intégration de l'application standalone).

Préfixe : `/api/odds/*`. Auth indépendante via tokens session séparés.
Collections MongoDB préfixées `odds_*` pour éviter toute collision avec TURFEX.

Source : odds_detective_source.txt (transmis par l'utilisateur).
Code intégré sans modification fonctionnelle ; les chemins MongoDB ont été
préfixés et le router monté en sous-route dédiée.
"""
import logging
import secrets
import string
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, Depends, Header, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

ODDS_PMU_BASE = "https://online.turfinfo.api.pmu.fr/rest/client/1/programme"


class OddsLoginRequest(BaseModel):
    code: str


class OddsLoginResponse(BaseModel):
    token: str
    username: str
    expiration: str
    is_admin: bool = False


class OddsFilterDef(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    name: str
    method: str
    criteria: Dict[str, Any] = {}
    created_at: str = Field(default_factory=lambda: datetime.now(timezone.utc).isoformat())


class OddsFilterCreate(BaseModel):
    name: str
    method: str
    criteria: Dict[str, Any] = {}


class OddsUserCodeCreate(BaseModel):
    username: str
    expiration: Optional[str] = "25/09/2033"
    custom_code: Optional[str] = None


async def _odds_fetch_pmu(url: str) -> dict:
    async with httpx.AsyncClient(timeout=20.0, headers={"User-Agent": "Mozilla/5.0"}) as cli:
        r = await cli.get(url)
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail=f"WAGUE API error {r.status_code}")
        return r.json()


def _odds_format_date(date_str: str) -> str:
    if "-" in date_str:
        y, m, d = date_str.split("-")
        return f"{d}{m}{y}"
    return date_str


def _odds_compute_indices(participants: List[dict]):
    enriched = []
    runners = [p for p in participants if p.get("statut") == "PARTANT"]
    for p in runners:
        ref = (p.get("dernierRapportReference") or {}).get("rapport")
        direct = (p.get("dernierRapportDirect") or {}).get("rapport")
        cote2 = ref if ref else direct
        cote1 = direct if direct else ref
        ratio = round(cote1 / cote2, 2) if cote1 and cote2 and cote2 > 0 else None
        gains = (p.get("gainsParticipant") or {}).get("gainsCarriere", 0) or 0
        nbcourses = p.get("nombreCourses", 0) or 0
        nbvic = p.get("nombreVictoires", 0) or 0
        nbpl = p.get("nombrePlaces", 0) or 0
        crv = round((nbvic / nbcourses) * 100, 1) if nbcourses else 0.0
        crpl = round((nbpl / nbcourses) * 100, 1) if nbcourses else 0.0
        musique = p.get("musique", "") or ""
        ifp = 0
        try:
            first = musique[0]
            if first.isdigit():
                ifp = int(first)
        except Exception:
            ifp = 0
        cdc = ifp
        positions = []
        for ch in musique:
            if ch.isdigit():
                positions.append(int(ch))
            if len(positions) >= 5:
                break
        fv = round(sum(positions) / len(positions), 2) if positions else 0
        enriched.append({
            "numPmu": p.get("numPmu"), "nom": p.get("nom"),
            "driver": p.get("driver"), "entraineur": p.get("entraineur"),
            "age": p.get("age"), "sexe": p.get("sexe"), "musique": musique,
            "gains": gains, "nombreCourses": nbcourses, "nombreVictoires": nbvic,
            "nombrePlaces": nbpl, "cote1": cote1, "cote2": cote2, "ratio": ratio,
            "crv": crv, "crpl": crpl, "ifp": ifp, "cdc": cdc, "fv": fv,
            "placeCorde": p.get("placeCorde"), "oeilleres": p.get("oeilleres"),
            "deferre": p.get("deferre"), "handicapValeur": p.get("handicapValeur"),
            "ordreArrivee": p.get("ordreArrivee"), "urlCasaque": p.get("urlCasaque"),
            "robe": (p.get("robe") or {}).get("libelleCourt"),
        })

    def safe_rank(arr, key, reverse=False):
        valid = [x for x in arr if x.get(key) is not None]
        valid.sort(key=lambda x: x[key], reverse=reverse)
        rmap = {x["numPmu"]: i + 1 for i, x in enumerate(valid)}
        for x in arr:
            x[f"rang_{key}"] = rmap.get(x["numPmu"])
        return arr

    enriched = safe_rank(enriched, "cote2")
    enriched = safe_rank(enriched, "gains", reverse=True)
    enriched = safe_rank(enriched, "crv", reverse=True)

    cote_sorted = sorted([e for e in enriched if e.get("cote2")], key=lambda x: x["cote2"])
    favori = cote_sorted[0] if cote_sorted else None
    base_fixe = cote_sorted[1] if len(cote_sorted) > 1 else None
    top3 = cote_sorted[:3]
    hyperbase = max(top3, key=lambda x: x.get("crv") or 0) if top3 else None
    top4 = cote_sorted[:4]
    superbase = max(top4, key=lambda x: x.get("gains") or 0) if top4 else None
    ratio_sorted = sorted([e for e in enriched if e.get("ratio") and e["ratio"] < 1], key=lambda x: x["ratio"])
    base_trend = ratio_sorted[0] if ratio_sorted else (cote_sorted[2] if len(cote_sorted) > 2 else None)
    bouts = sorted([e for e in enriched if (e.get("nombreVictoires") or 0) > 0 and e.get("cote2")], key=lambda x: -x["cote2"])
    tocard = bouts[0] if bouts else (cote_sorted[-1] if cote_sorted else None)
    pokers = [e for e in enriched if (e.get("ifp") or 0) in (1, 2, 3) and (e.get("cote2") or 0) > 10]
    pokers.sort(key=lambda x: -(x.get("cote2") or 0))
    coup_poker = pokers[0] if pokers else (bouts[1] if len(bouts) > 1 else None)
    spec_sorted = sorted([e for e in enriched if e.get("ratio") and e["ratio"] > 1.2], key=lambda x: -x["ratio"])
    speculatif = spec_sorted[0] if spec_sorted else None

    selections = {
        "favori": favori, "base_fixe": base_fixe, "base_trend": base_trend,
        "tocard": tocard, "coup_poker": coup_poker, "speculatif": speculatif,
        "superbase": superbase, "hyperbase": hyperbase,
    }
    return enriched, selections


def _odds_passes_filters(p: dict, course_meta: dict, f: dict) -> bool:
    num = p.get("numPmu") or 0
    cote = p.get("cote2") or 0
    parite = f.get("parite")
    if parite == "PAIR" and num % 2 != 0: return False
    if parite == "IMPAIR" and num % 2 == 0: return False
    num_type = f.get("num_type")
    if num_type == "PETIT" and num > 5: return False
    if num_type == "MOYEN" and (num <= 5 or num > 10): return False
    if num_type == "GROS" and num <= 10: return False
    sexe = f.get("sexe")
    if sexe and p.get("sexe") != sexe: return False
    age_min = f.get("age_min"); age_max = f.get("age_max")
    if age_min and (p.get("age") or 0) < int(age_min): return False
    if age_max and (p.get("age") or 999) > int(age_max): return False
    if f.get("oeilleres") == "AVEC" and p.get("oeilleres") == "SANS_OEILLERES": return False
    if f.get("oeilleres") == "SANS" and p.get("oeilleres") != "SANS_OEILLERES": return False
    cote_min = f.get("cote_min"); cote_max = f.get("cote_max")
    if cote_min and cote < float(cote_min): return False
    if cote_max and cote > float(cote_max): return False
    rang_max = f.get("rang_fav_max"); rang_min = f.get("rang_fav_min")
    if rang_max and (p.get("rang_cote2") or 99) > int(rang_max): return False
    if rang_min and (p.get("rang_cote2") or 0) < int(rang_min): return False
    crv_min = f.get("crv_min"); crv_max = f.get("crv_max")
    if crv_min and (p.get("crv") or 0) < float(crv_min): return False
    if crv_max and (p.get("crv") or 0) > float(crv_max): return False
    crpl_min = f.get("crpl_min")
    if crpl_min and (p.get("crpl") or 0) < float(crpl_min): return False
    gains_min = f.get("gains_min")
    if gains_min and (p.get("gains") or 0) < float(gains_min) * 100: return False
    nbcourses_min = f.get("nbcourses_min")
    if nbcourses_min and (p.get("nombreCourses") or 0) < int(nbcourses_min): return False
    nbvic_min = f.get("nbvic_min")
    if nbvic_min and (p.get("nombreVictoires") or 0) < int(nbvic_min): return False
    ifp_max = f.get("ifp_max")
    if ifp_max and (p.get("ifp") or 99) > int(ifp_max): return False
    fv_max = f.get("fv_max")
    if fv_max and (p.get("fv") or 99) > float(fv_max): return False
    ratio_min = f.get("ratio_min"); ratio_max = f.get("ratio_max")
    if ratio_min and (p.get("ratio") or 0) < float(ratio_min): return False
    if ratio_max and (p.get("ratio") or 99) > float(ratio_max): return False
    ratio_dir = f.get("ratio_dir"); r = p.get("ratio")
    if ratio_dir == "BAISSE" and (not r or r >= 1): return False
    if ratio_dir == "HAUSSE" and (not r or r <= 1): return False
    if ratio_dir == "STABLE" and (not r or abs(r - 1) > 0.05): return False
    corde_min = f.get("corde_min"); corde_max = f.get("corde_max")
    if corde_min and (p.get("placeCorde") or 0) < int(corde_min): return False
    if corde_max and (p.get("placeCorde") or 999) > int(corde_max): return False
    discipline = f.get("discipline")
    if discipline and course_meta.get("discipline") != discipline: return False
    partants_min = f.get("partants_min"); partants_max = f.get("partants_max")
    if partants_min and (course_meta.get("nombrePartants") or 0) < int(partants_min): return False
    if partants_max and (course_meta.get("nombrePartants") or 999) > int(partants_max): return False
    dist_min = f.get("distance_min"); dist_max = f.get("distance_max")
    if dist_min and (course_meta.get("distance") or 0) < int(dist_min): return False
    if dist_max and (course_meta.get("distance") or 99999) > int(dist_max): return False
    alloc_min = f.get("allocation_min"); alloc_max = f.get("allocation_max")
    if alloc_min and (course_meta.get("montantPrix") or 0) < int(alloc_min): return False
    if alloc_max and (course_meta.get("montantPrix") or 99999999) > int(alloc_max): return False
    cat = f.get("categorie")
    if cat and course_meta.get("categorieParticularite") != cat: return False
    return True


def _gen_code(n: int = 10) -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(n))


async def _seed_odds_admin(db) -> None:
    """Idempotent : assure qu'au moins un admin existe.

    - Si aucun admin n'existe → crée ADMIN2025
    - Si un admin existe (même avec un code custom rotaté) → ne touche pas à son code
      (ne réinjecte PAS ADMIN2025 pour ne pas casser une rotation effectuée)
    """
    admin_exists = await db.odds_users.find_one({"is_admin": True}, {"_id": 0})
    if admin_exists:
        return
    await db.odds_users.update_one(
        {"code": "ADMIN2025"},
        {
            "$set": {"is_admin": True, "username": "admin", "expiration": "31/12/2099"},
            "$setOnInsert": {
                "id": str(uuid.uuid4()),
                "code": "ADMIN2025",
                "created_at": datetime.now(timezone.utc).isoformat(),
            },
        },
        upsert=True,
    )


def build_odds_router(db) -> APIRouter:
    router = APIRouter(prefix="/odds", tags=["odds_detective"])

    def _verify_token(authorization: Optional[str] = Header(None)) -> str:
        if not authorization or not authorization.startswith("Bearer "):
            raise HTTPException(status_code=401, detail="Token manquant")
        return authorization.split(" ", 1)[1]

    async def _require_admin(token: str = Depends(_verify_token)) -> dict:
        s = await db.odds_sessions.find_one({"token": token}, {"_id": 0})
        if not s:
            raise HTTPException(status_code=401, detail="Session invalide")
        user = await db.odds_users.find_one({"code": s["user_code"]}, {"_id": 0})
        if not user or not user.get("is_admin"):
            raise HTTPException(status_code=403, detail="Accès admin requis")
        return user

    @router.get("/")
    async def root():
        return {"app": "Odds Detective", "status": "ok"}

    @router.post("/auth/login", response_model=OddsLoginResponse)
    async def login(req: OddsLoginRequest):
        # Login strict : seuls les codes existants en base sont acceptés.
        # Plus aucune création automatique de codes "démo" (DETECTIVE2025, JEANCLAUDE, DEMO).
        # → tous les codes utilisateur doivent être créés par l'admin via /admin/users.
        # Match case-insensitive pour éviter les soucis d'autocomplétion / clavier mobile.
        code_input = (req.code or "").strip()
        if not code_input:
            raise HTTPException(status_code=401, detail="Code utilisateur invalide")
        # Recherche exacte d'abord (rapide), puis fallback case-insensitive
        user = await db.odds_users.find_one({"code": code_input}, {"_id": 0})
        if not user:
            import re as _re
            user = await db.odds_users.find_one(
                {"code": {"$regex": f"^{_re.escape(code_input)}$", "$options": "i"}},
                {"_id": 0},
            )
        if not user:
            raise HTTPException(status_code=401, detail="Code utilisateur invalide")
        token = str(uuid.uuid4())
        await db.odds_sessions.insert_one({
            "token": token, "user_code": user["code"],
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        return OddsLoginResponse(
            token=token, username=user["username"], expiration=user["expiration"],
            is_admin=bool(user.get("is_admin")),
        )

    @router.get("/auth/me")
    async def me(token: str = Depends(_verify_token)):
        s = await db.odds_sessions.find_one({"token": token}, {"_id": 0})
        if not s:
            raise HTTPException(status_code=401, detail="Session invalide")
        user = await db.odds_users.find_one({"code": s["user_code"]}, {"_id": 0})
        return {
            "username": user["username"], "expiration": user["expiration"],
            "is_admin": bool(user.get("is_admin")),
        }

    @router.post("/admin/users")
    async def admin_create_user(payload: OddsUserCodeCreate, _admin=Depends(_require_admin)):
        code = (payload.custom_code or _gen_code()).upper()
        existing = await db.odds_users.find_one({"code": code}, {"_id": 0})
        if existing:
            raise HTTPException(status_code=409, detail="Code déjà utilisé")
        doc = {
            "id": str(uuid.uuid4()), "code": code,
            "username": payload.username,
            "expiration": payload.expiration or "25/09/2033",
            "is_admin": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.odds_users.insert_one({**doc})
        doc.pop("_id", None)
        return doc

    @router.get("/admin/users")
    async def admin_list_users(_admin=Depends(_require_admin)):
        return await db.odds_users.find({}, {"_id": 0}).to_list(1000)

    @router.delete("/admin/users/{code}")
    async def admin_delete_user(code: str, admin=Depends(_require_admin)):
        if code.upper() == admin["code"].upper():
            raise HTTPException(status_code=400, detail="Vous ne pouvez pas vous supprimer")
        await db.odds_users.delete_one({"code": code})
        await db.odds_sessions.delete_many({"user_code": code})
        return {"deleted": code}

    @router.patch("/admin/users/{code}")
    async def admin_update_user(code: str, payload: Dict[str, Any], _admin=Depends(_require_admin)):
        allowed = {k: v for k, v in payload.items() if k in {"username", "expiration", "is_admin"}}
        if not allowed:
            raise HTTPException(status_code=400, detail="Aucun champ valide")
        await db.odds_users.update_one({"code": code}, {"$set": allowed})
        return await db.odds_users.find_one({"code": code}, {"_id": 0})

    class ChangeAdminCodeRequest(BaseModel):
        new_code: str
        confirm: bool = False

    @router.post("/admin/change-code")
    async def admin_change_own_code(
        payload: ChangeAdminCodeRequest, admin=Depends(_require_admin)
    ):
        """Permet à l'admin courant de modifier SON propre code d'accès.

        - new_code : 4 caractères min, max 32, alphanumérique majuscule
        - Idempotent : si new_code == ancien code, no-op
        - Cascade : met à jour `odds_sessions.user_code` pour ne pas déconnecter l'admin
        """
        new_code = (payload.new_code or "").strip().upper()
        if len(new_code) < 4 or len(new_code) > 32 or not all(c.isalnum() for c in new_code):
            raise HTTPException(status_code=400, detail="Code invalide (4-32 caractères alphanumériques)")

        old_code = admin["code"]
        if new_code == old_code:
            return {"ok": True, "code": new_code, "changed": False}

        # Vérifie qu'aucun autre utilisateur n'a déjà ce code
        existing = await db.odds_users.find_one({"code": new_code}, {"_id": 0})
        if existing:
            raise HTTPException(status_code=409, detail="Code déjà utilisé par un autre utilisateur")

        if not payload.confirm:
            raise HTTPException(status_code=400, detail="Confirmation requise (confirm=true)")

        # Update user + cascade sessions
        await db.odds_users.update_one(
            {"code": old_code},
            {"$set": {"code": new_code, "updated_at": datetime.now(timezone.utc).isoformat()}},
        )
        await db.odds_sessions.update_many(
            {"user_code": old_code}, {"$set": {"user_code": new_code}}
        )
        return {"ok": True, "code": new_code, "changed": True}

    @router.get("/programme/{date}")
    async def get_programme(date: str, token: str = Depends(_verify_token)):
        d = _odds_format_date(date)
        cache_key = f"odds_prog_{d}"
        cached = await db.odds_cache.find_one({"key": cache_key}, {"_id": 0})
        now = datetime.now(timezone.utc)
        if cached:
            ts = datetime.fromisoformat(cached["ts"])
            if now - ts < timedelta(minutes=2):
                return cached["data"]
        data = await _odds_fetch_pmu(f"{ODDS_PMU_BASE}/{d}")
        await db.odds_cache.update_one(
            {"key": cache_key},
            {"$set": {"key": cache_key, "data": data, "ts": now.isoformat()}},
            upsert=True,
        )
        return data

    @router.get("/programme/{date}/R{reunion}/C{course}/participants")
    async def get_participants(date: str, reunion: int, course: int, token: str = Depends(_verify_token)):
        d = _odds_format_date(date)
        url = f"{ODDS_PMU_BASE}/{d}/R{reunion}/C{course}/participants"
        data = await _odds_fetch_pmu(url)
        participants = data.get("participants", [])
        enriched, selections = _odds_compute_indices(participants)
        # Construit l'arrivée officielle si la course est terminée
        arrived = sorted(
            [p for p in enriched if p.get("ordreArrivee")],
            key=lambda x: x["ordreArrivee"],
        )
        arrivee = [
            {"position": p["ordreArrivee"], "numPmu": p["numPmu"], "nom": p["nom"], "cote": p.get("cote2")}
            for p in arrived
        ]
        return {
            "date": d, "reunion": reunion, "course": course,
            "participants": enriched, "selections": selections,
            "raw_count": len(participants),
            "arrivee": arrivee,
            "arriveeDefinitive": len(arrivee) > 0,
        }

    @router.get("/tendance/{date}")
    async def tendance_jour(date: str, token: str = Depends(_verify_token)):
        d = _odds_format_date(date)
        data = await _odds_fetch_pmu(f"{ODDS_PMU_BASE}/{d}")
        reunions = (data.get("programme") or {}).get("reunions", [])
        out = []
        for r in reunions:
            for c in r.get("courses", []):
                out.append({
                    "reunion": r.get("numOfficiel"), "course": c.get("numOrdre"),
                    "hippodrome": (r.get("hippodrome") or {}).get("libelleCourt"),
                    "heureDepart": c.get("heureDepart"), "libelle": c.get("libelle"),
                    "discipline": c.get("discipline"), "specialite": c.get("specialite"),
                    "distance": c.get("distance"), "montantPrix": c.get("montantPrix"),
                    "nombrePartants": c.get("nombreDeclaresPartants"),
                    "categorieParticularite": c.get("categorieParticularite"),
                    "arriveeDefinitive": c.get("arriveeDefinitive"),
                })
        return {"date": d, "races": out}

    @router.get("/tableau-de-bord/{date}/R{reunion}")
    async def tableau_de_bord(date: str, reunion: int, token: str = Depends(_verify_token)):
        d = _odds_format_date(date)
        data = await _odds_fetch_pmu(f"{ODDS_PMU_BASE}/{d}")
        reunions = (data.get("programme") or {}).get("reunions", [])
        target = next((r for r in reunions if r.get("numOfficiel") == reunion), None)
        if not target:
            raise HTTPException(status_code=404, detail="Réunion introuvable")
        out_courses = []
        for c in target.get("courses", []):
            try:
                url = f"{ODDS_PMU_BASE}/{d}/R{reunion}/C{c.get('numOrdre')}/participants"
                pdata = await _odds_fetch_pmu(url)
                enriched, selections = _odds_compute_indices(pdata.get("participants", []))
                out_courses.append({
                    "course": c.get("numOrdre"), "libelle": c.get("libelle"),
                    "heureDepart": c.get("heureDepart"), "discipline": c.get("discipline"),
                    "distance": c.get("distance"),
                    "selections": selections, "top": enriched[:5] if enriched else [],
                })
            except Exception as e:
                logger.warning(f"odds: course {c.get('numOrdre')} failed: {e}")
        return {
            "date": d, "reunion": reunion,
            "hippodrome": (target.get("hippodrome") or {}).get("libelleCourt"),
            "courses": out_courses,
        }

    @router.post("/filters", response_model=OddsFilterDef)
    async def create_filter(f: OddsFilterCreate, token: str = Depends(_verify_token)):
        obj = OddsFilterDef(name=f.name, method=f.method, criteria=f.criteria)
        await db.odds_filters.insert_one(obj.model_dump())
        return obj

    @router.get("/filters", response_model=List[OddsFilterDef])
    async def list_filters(token: str = Depends(_verify_token)):
        return await db.odds_filters.find({}, {"_id": 0}).to_list(500)

    @router.delete("/filters/{filter_id}")
    async def delete_filter(filter_id: str, token: str = Depends(_verify_token)):
        await db.odds_filters.delete_one({"id": filter_id})
        return {"deleted": filter_id}

    @router.post("/analyse")
    async def analyse(payload: Dict[str, Any], token: str = Depends(_verify_token)):
        method = payload.get("method", "FAVORI")
        date_start = payload.get("date_start"); date_end = payload.get("date_end")
        if not date_start or not date_end:
            raise HTTPException(status_code=400, detail="Dates requises")
        filters = payload.get("filters") or {}
        d = _odds_format_date(date_start)
        data = await _odds_fetch_pmu(f"{ODDS_PMU_BASE}/{d}")
        reunions = (data.get("programme") or {}).get("reunions", [])
        games = []; wins = 0; mises = 0.0; rentrees = 0.0
        key_map = {
            "FAVORI": "favori", "BASEFIXE": "base_fixe", "TOCARD": "tocard",
            "POKER": "coup_poker", "SUPERBASE": "superbase", "HYPERBASE": "hyperbase",
            "TREND": "base_trend", "SPECULATIF": "speculatif",
        }
        for r in reunions[:5]:
            course_disc = filters.get("discipline")
            for c in r.get("courses", [])[:10]:
                try:
                    course_meta = {
                        "discipline": c.get("discipline"),
                        "nombrePartants": c.get("nombreDeclaresPartants"),
                        "distance": c.get("distance"),
                        "montantPrix": c.get("montantPrix"),
                        "categorieParticularite": c.get("categorieParticularite"),
                    }
                    if course_disc and course_meta["discipline"] != course_disc:
                        continue
                    url = f"{ODDS_PMU_BASE}/{d}/R{r.get('numOfficiel')}/C{c.get('numOrdre')}/participants"
                    pdata = await _odds_fetch_pmu(url)
                    enriched, selections = _odds_compute_indices(pdata.get("participants", []))
                    if method == "TOUS":
                        candidates = [p for p in enriched if _odds_passes_filters(p, course_meta, filters)]
                    else:
                        pick = selections.get(key_map.get(method, "favori"))
                        candidates = []
                        if pick:
                            full = next((e for e in enriched if e["numPmu"] == pick["numPmu"]), pick)
                            if _odds_passes_filters(full, course_meta, filters):
                                candidates = [full]
                    for pick in candidates:
                        mises += 1.0
                        won = pick.get("ordreArrivee") == 1
                        if won:
                            wins += 1
                            rentrees += float(pick.get("cote2") or 0)
                        games.append({
                            "reunion": r.get("numOfficiel"), "course": c.get("numOrdre"),
                            "hippodrome": (r.get("hippodrome") or {}).get("libelleCourt"),
                            "libelle": c.get("libelle"), "cheval": pick.get("nom"),
                            "num": pick.get("numPmu"), "cote": pick.get("cote2"),
                            "place": pick.get("ordreArrivee"), "won": won,
                        })
                except Exception:
                    continue
        solde = round(rentrees - mises, 2)
        pct_reussite = round((wins / mises) * 100, 1) if mises else 0.0
        pct_rendement = round((solde / mises) * 100, 1) if mises else 0.0
        return {
            "method": method, "date_start": d, "date_end": _odds_format_date(date_end),
            "nbre_jeux": int(mises), "reussis": wins, "perdus": int(mises) - wins,
            "mises": mises, "rentrees": round(rentrees, 2), "solde": solde,
            "pct_reussite": pct_reussite, "pct_rendement": pct_rendement, "games": games,
        }

    return router

