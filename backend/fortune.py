
"""TURFEX — Module 'Le Pari de la Fortune' (méthode WAGUE / système analytique).

Intégration sous le préfixe `/api/fortune/*`.
- Proxy programme PMU + participants enrichis (LS auto depuis musique)
- Moteur d'analyse en groupes : CSPE, SETD, LTYPEA/B, LGPW, PEFA, LSPW, LSPW2, TDNW, LSFA, CPTQ
- Générateur de tickets Tiercé (T01..T06) et Couplés
- Bankroll persisté en MongoDB (`fortune_bankroll`)
- Proxy + parser pour le widget de pronostics presse (renvoyé en JSON propre)

Source : le-pari-de-la-fortune-source-complet.txt (transmis par l'utilisateur).
Texte "Artus"/"Boturfers" remplacés par "WAGUE" dans les payloads visibles si applicable.
"""
import re
import uuid
import logging
from datetime import datetime, timezone
from itertools import permutations
from html import unescape
from typing import Any, Dict, List, Optional

import httpx
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

logger = logging.getLogger(__name__)

FORTUNE_PMU_BASE = "https://online.turfinfo.api.pmu.fr/rest/client/61"


# ---------------- Models ----------------
class FortuneHorse(BaseModel):
    numPmu: int
    nom: str
    ls: float = 0.0
    status: str = "NW"
    pressScore: int = 0


class FortuneAnalyzeRequest(BaseModel):
    horses: List[FortuneHorse]


class FortuneTicketRequest(BaseModel):
    bases: List[int]
    associated: List[int]
    ticket_type: str
    stake_per_combo: float = 1.0


class FortuneCoupleRequest(BaseModel):
    group_a: List[int]
    group_b: List[int]
    ordered: bool = False
    stake_per_combo: float = 1.0


class FortuneBankrollEntry(BaseModel):
    id: Optional[str] = None
    date: str
    label: str
    stake: float
    payout: float


# ---------------- Helpers ----------------
async def _fetch_pmu(path: str) -> dict:
    url = f"{FORTUNE_PMU_BASE}{path}"
    async with httpx.AsyncClient(timeout=20.0) as cx:
        r = await cx.get(url, headers={"User-Agent": "Mozilla/5.0", "Accept": "application/json"})
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail=f"WAGUE upstream error {r.status_code}")
        return r.json()


def _parse_music_score(music: str) -> float:
    if not music:
        return 0.0
    tokens = re.findall(r"(\d+|D|T|A|R)[a-zA-Z]?", music)
    score = 0.0
    weight = 1.0
    for t in tokens[:6]:
        if t.isdigit():
            n = int(t)
            if n == 1:
                score += 5 * weight
            elif n == 2:
                score += 3 * weight
            elif n == 3:
                score += 2 * weight
            elif 0 < n <= 5:
                score += 1 * weight
        else:
            score -= 1 * weight
        weight *= 0.85
    return round(max(0.0, min(20.0, score)), 2)


def _build_groups(horses: List[FortuneHorse]) -> Dict[str, Any]:
    by_n = {h.numPmu: h for h in horses}
    by_press = sorted(horses, key=lambda h: (-h.pressScore, -h.ls))
    by_ls = sorted(horses, key=lambda h: (-h.ls, -h.pressScore))
    n = len(horses)
    top_press = max(3, min(6, n // 2))
    top_ls = max(3, min(6, n // 2))

    cspe = [h.numPmu for h in by_press[:top_press]]
    setd = [h.numPmu for h in by_ls[:top_ls]]

    combined = sorted(horses, key=lambda h: -(h.pressScore + h.ls))
    ltype_a = [h.numPmu for h in combined[:top_ls]]

    ltype_b_horses = [h for h in horses if h.ls >= 4]
    ltype_b_horses.sort(key=lambda h: -h.ls)
    ltype_b = [h.numPmu for h in ltype_b_horses[: max(3, top_ls)]]

    lgpw = [n_ for n_ in cspe if n_ in ltype_b]
    pefa = [n_ for n_ in cspe if n_ not in lgpw]

    lspw_horses = [by_n[i] for i in ltype_b if by_n[i].status == "WW"]
    lspw_horses.sort(key=lambda h: -h.ls)
    lspw = [h.numPmu for h in lspw_horses[:3]]

    ww_in_b = sorted([by_n[i] for i in ltype_b if by_n[i].status == "WW"], key=lambda h: -h.ls)
    nw_in_b = sorted([by_n[i] for i in ltype_b if by_n[i].status == "NW"], key=lambda h: -h.ls)
    lspw2: List[int] = []
    if ww_in_b:
        lspw2.append(ww_in_b[0].numPmu)
    if nw_in_b:
        lspw2.append(nw_in_b[0].numPmu)

    tdnw = [i for i in setd if by_n[i].status == "NW"]
    lsfa = [i for i in setd if by_n[i].status == "WW"]

    union: List[int] = []
    for src in (cspe, setd, ltype_b):
        for x in src:
            if x not in union:
                union.append(x)
    cptq = sorted(union, key=lambda i: -(by_n[i].pressScore + by_n[i].ls))

    return {
        "CSPE": cspe, "SETD": setd, "LTYPEA": ltype_a, "LTYPEB": ltype_b,
        "LGPW": lgpw, "PEFA": pefa, "LSPW": lspw, "LSPW2": lspw2,
        "TDNW": tdnw, "LSFA": lsfa, "CPTQ": cptq,
    }


def _tierce_combos(bases: List[int], assoc: List[int], ttype: str) -> List[List[int]]:
    pool = list(dict.fromkeys(bases + assoc))
    results: List[List[int]] = []

    if ttype in ("T01", "T02"):
        if not bases or len(assoc) < 2:
            return []
        b = bases[0]
        for a, c in permutations(assoc, 2):
            results.append([b, a, c])
    elif ttype == "T03":
        if len(bases) < 2 or not assoc:
            return []
        for b1, b2 in permutations(bases[:2], 2):
            for a in assoc:
                results.append([b1, b2, a])
    elif ttype == "T04":
        if not bases:
            return []
        b = bases[0]
        rest = [x for x in pool if x != b]
        for a, c in permutations(rest, 2):
            results.append([b, a, c])
    elif ttype == "T05":
        if not bases or not assoc:
            return []
        for trio in permutations(pool, 3):
            if any(b in trio[:2] for b in bases):
                results.append(list(trio))
    elif ttype == "T06":
        for trio in permutations(pool, 3):
            results.append(list(trio))
    else:
        raise HTTPException(status_code=400, detail="Unknown ticket type")

    seen: set = set()
    out: List[List[int]] = []
    for t in results:
        k = tuple(t)
        if k not in seen:
            seen.add(k)
            out.append(t)
    return out


def _parse_press_widget(raw: str) -> Dict[str, Any]:
    """Parse le HTML embarqué dans le `document.write('...')` du widget presse externe.

    Retourne :
        {
          "title": "Quinté du samedi ...",
          "synthese": "15-11-2-7-14-3-12-13",
          "headers": ["Presse", "1", "2", ..., "8"],
          "rows": [["La Marseillaise", "15", "2", "11", ...], ...]
        }
    """
    out: Dict[str, Any] = {"title": "", "synthese": "", "headers": [], "rows": []}
    # Extrait le contenu entre document.write(' et la dernière ')
    m = re.search(r"document\.write\(\s*'(.*)'\s*\)\s*;?\s*$", raw, re.DOTALL)
    inner = m.group(1) if m else raw
    inner = inner.replace("\\'", "'").replace('\\"', '"').replace("\\/", "/")

    def strip_tags(s: str) -> str:
        return unescape(re.sub(r"<[^>]+>", "", s)).strip()

    # Tables
    tables = re.findall(r"<table[^>]*>(.*?)</table>", inner, re.DOTALL | re.IGNORECASE)
    if tables:
        # Premier tableau = pronostics presse
        rows_html = re.findall(r"<tr[^>]*>(.*?)</tr>", tables[0], re.DOTALL | re.IGNORECASE)
        for i, row_html in enumerate(rows_html):
            cells = re.findall(r"<t[hd][^>]*>(.*?)</t[hd]>", row_html, re.DOTALL | re.IGNORECASE)
            cleaned = [strip_tags(c) for c in cells]
            if not cleaned or all(not c for c in cleaned):
                continue
            if i == 0:
                out["headers"] = cleaned
            else:
                out["rows"].append(cleaned)

    # Synthèse / titre — souvent dans des éléments séparés ou un 2e tableau
    # Cherche un pattern "n-n-n-n-n-n-n-n"
    syn_match = re.search(r"(\d+(?:-\d+){3,})", strip_tags(inner))
    if syn_match:
        out["synthese"] = syn_match.group(1)

    months = "janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre"
    title_match = re.search(
        rf"(Quinté\s+(?:du|de)\s+\w+\s+\d+\s+(?:{months}))",
        strip_tags(inner),
        re.IGNORECASE,
    )
    if title_match:
        out["title"] = title_match.group(1).strip()

    return out


def build_fortune_router(db) -> APIRouter:
    """Construit le router 'Le Pari de la Fortune' avec injection MongoDB."""
    router = APIRouter(prefix="/fortune", tags=["fortune"])

    @router.get("/")
    async def fortune_root():
        return {"app": "Le Pari de la Fortune", "ok": True, "method": "WAGUE"}

    @router.get("/programme/{date}")
    async def fortune_programme(date: str):
        if not re.fullmatch(r"\d{8}", date):
            raise HTTPException(400, "Date doit être au format DDMMYYYY")
        data = await _fetch_pmu(f"/programme/{date}")
        prog = data.get("programme", {})
        out = []
        for r in prog.get("reunions", []):
            hippo = r.get("hippodrome", {}) or {}
            courses = []
            for c in r.get("courses", []) or []:
                courses.append({
                    "numOrdre": c.get("numOrdre"),
                    "libelle": c.get("libelle"),
                    "heureDepart": c.get("heureDepart"),
                    "distance": c.get("distance"),
                    "discipline": c.get("discipline"),
                    "specialite": c.get("specialite"),
                    "nombrePartants": c.get("nombreDeclaresPartants"),
                    "statut": c.get("statut"),
                })
            out.append({
                "numOfficiel": r.get("numOfficiel"),
                "hippodrome": hippo.get("libelleCourt") or hippo.get("libelleLong") or "",
                "code": hippo.get("code"),
                "pays": (r.get("pays") or {}).get("libelle"),
                "nature": r.get("nature"),
                "statut": r.get("statut"),
                "dateReunion": r.get("dateReunion"),
                "courses": courses,
            })
        return {"date": prog.get("date"), "reunions": out}

    @router.get("/programme/{date}/R{r}/C{c}/participants")
    async def fortune_participants(date: str, r: int, c: int):
        data = await _fetch_pmu(f"/programme/{date}/R{r}/C{c}/participants")
        parts = data.get("participants", []) or []
        out = []
        for p in parts:
            if p.get("statut") and p.get("statut") != "PARTANT":
                continue
            cote_dir = (p.get("dernierRapportDirect") or {}).get("rapport")
            cote_ref = (p.get("dernierRapportReference") or {}).get("rapport")
            favoris = (p.get("dernierRapportReference") or {}).get("favoris", False)
            music = p.get("musique") or ""
            out.append({
                "numPmu": p.get("numPmu"),
                "nom": p.get("nom"),
                "driver": p.get("driver"),
                "entraineur": p.get("entraineur"),
                "age": p.get("age"),
                "sexe": p.get("sexe"),
                "musique": music,
                "nombreCourses": p.get("nombreCourses"),
                "nombreVictoires": p.get("nombreVictoires"),
                "nombrePlaces": p.get("nombrePlaces"),
                "coteDirecte": cote_dir,
                "coteReference": cote_ref,
                "favoris": favoris,
                "deferre": p.get("deferre"),
                "oeilleres": p.get("oeilleres"),
                "lsAuto": _parse_music_score(music),
                "statusAuto": "WW" if (p.get("nombreVictoires") or 0) >= 1 and music.startswith(tuple(["1", "2"])) else "NW",
            })
        out.sort(key=lambda x: x["numPmu"] or 0)
        return {"participants": out}

    @router.post("/analyze")
    async def fortune_analyze(req: FortuneAnalyzeRequest):
        if not req.horses:
            raise HTTPException(status_code=400, detail="No horses provided")
        return {"groups": _build_groups(req.horses)}

    @router.post("/tickets/tierce")
    async def fortune_tickets_tierce(req: FortuneTicketRequest):
        combos = _tierce_combos(req.bases, req.associated, req.ticket_type)
        cost = round(len(combos) * req.stake_per_combo, 2)
        return {"ticket_type": req.ticket_type, "combinations": combos, "count": len(combos), "cost": cost}

    @router.post("/tickets/couple")
    async def fortune_tickets_couple(req: FortuneCoupleRequest):
        combos: List[List[int]] = []
        if req.ordered:
            for a in req.group_a:
                for b in req.group_b:
                    if a != b:
                        combos.append([a, b])
        else:
            seen: set = set()
            for a in req.group_a:
                for b in req.group_b:
                    if a == b:
                        continue
                    k = tuple(sorted((a, b)))
                    if k not in seen:
                        seen.add(k)
                        combos.append(list(k))
        cost = round(len(combos) * req.stake_per_combo, 2)
        return {"combinations": combos, "count": len(combos), "cost": cost}

    @router.post("/bankroll")
    async def fortune_bankroll_add(entry: FortuneBankrollEntry):
        doc = entry.model_dump()
        doc["id"] = doc.get("id") or str(uuid.uuid4())
        doc["createdAt"] = datetime.now(timezone.utc).isoformat()
        await db.fortune_bankroll.insert_one(doc.copy())
        return {**{k: v for k, v in doc.items() if k != "_id"}}

    @router.get("/bankroll")
    async def fortune_bankroll_list():
        items = await db.fortune_bankroll.find({}, {"_id": 0}).to_list(1000)
        items.sort(key=lambda x: x.get("date", ""))
        return {"entries": items}

    @router.delete("/bankroll/{eid}")
    async def fortune_bankroll_delete(eid: str):
        res = await db.fortune_bankroll.delete_one({"id": eid})
        return {"deleted": res.deleted_count}

    @router.get("/press")
    async def fortune_press():
        """Récupère + parse le widget de pronostics presse externe et renvoie du JSON propre.

        Évite l'usage de `document.write()` côté frontend (qui silently fail quand
        le script est injecté après le chargement de la page).
        """
        try:
            async with httpx.AsyncClient(timeout=15.0) as cx:
                r = await cx.get(
                    "https://www.boturfers.fr/public/widgets/widget-presse.php?style=default",
                    headers={"User-Agent": "Mozilla/5.0", "Accept": "*/*"},
                )
                if r.status_code != 200:
                    raise HTTPException(status_code=502, detail=f"Press widget error {r.status_code}")
                parsed = _parse_press_widget(r.text)
                return parsed
        except HTTPException:
            raise
        except Exception as e:
            logger.warning(f"fortune press fetch failed: {e}")
            raise HTTPException(status_code=502, detail=str(e))

    return router

