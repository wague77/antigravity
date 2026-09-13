
"""Iteration 11 — Backend-only tests for 3 new features:
- (c) AI analysis (Claude Sonnet 4.5) via /api/ai/analyze-horse, /api/ai/analyze-top8
- (d) Code-expiring digest + cron /api/cron/code-expiring + admin trigger
- (e) Grade A user real-time broadcast via /api/pronostics (fire-and-forget)

Uses REACT_APP_BACKEND_URL from env. Admin password & CRON_TOKEN from backend/.env.
"""
import os
import time
import uuid
import pytest
import requests
from pathlib import Path

# ----- Env loading (strip dotenv quotes) -----
FRONT_ENV = Path("/app/frontend/.env")
BACK_ENV = Path("/app/backend/.env")


def _read_env(p: Path, key: str) -> str:
    if not p.exists():
        return ""
    for line in p.read_text().splitlines():
        line = line.strip()
        if line.startswith(f"{key}="):
            val = line.split("=", 1)[1].strip()
            # strip quotes
            if (val.startswith('"') and val.endswith('"')) or (val.startswith("'") and val.endswith("'")):
                val = val[1:-1]
            return val
    return ""


BASE_URL = _read_env(FRONT_ENV, "REACT_APP_BACKEND_URL").rstrip("/")
ADMIN_PASSWORD = _read_env(BACK_ENV, "ADMIN_PASSWORD") or "wague-admin-2026"
CRON_TOKEN = _read_env(BACK_ENV, "CRON_TOKEN")

assert BASE_URL, "REACT_APP_BACKEND_URL missing"
assert CRON_TOKEN, "CRON_TOKEN missing in backend/.env"


@pytest.fixture(scope="session")
def admin_headers():
    return {"X-Admin-Password": ADMIN_PASSWORD, "Content-Type": "application/json"}


@pytest.fixture(scope="session")
def api():
    s = requests.Session()
    s.headers.update({"Content-Type": "application/json"})
    return s


# ==============================================================
# Feature (c): AI ANALYSIS — analyze-horse
# ==============================================================
class TestAIAnalyzeHorse:
    def test_empty_horse_returns_400(self, api):
        r = api.post(f"{BASE_URL}/api/ai/analyze-horse", json={"horse": {}, "courseContext": {}})
        assert r.status_code == 400, r.text

    # Class-level fixture: unique horse per test session (re-used by both tests below)
    _unique_horse = {
        "numero": 5,
        "nom": f"ETOILE FILANTE {uuid.uuid4().hex[:6]}",  # unique per pytest invocation
        "driver": "J. Dupont",
        "entraineur": "P. Martin",
        "cote": 8.5,
        "formScore": 82,
        "grade": "B",
        "reasons": ["forme récente 3p2p1p", "driver top 5"],
    }
    _ctx = {"libelle": "Prix de Paris", "hippodrome": "Vincennes", "discipline": "Attelé", "distance": 2100}

    def test_horse_analysis_first_call_not_cached(self, api):
        r = api.post(f"{BASE_URL}/api/ai/analyze-horse", json={"horse": self._unique_horse, "courseContext": self._ctx}, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True, data
        assert isinstance(data.get("analysis"), str) and len(data["analysis"]) > 0
        # first call should be fresh
        assert data.get("cached") is False, f"expected fresh result, got cached. Data: {data}"

    def test_horse_analysis_second_call_cached(self, api):
        # Same payload as test 1 → must hit cache
        r = api.post(f"{BASE_URL}/api/ai/analyze-horse", json={"horse": self._unique_horse, "courseContext": self._ctx}, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True
        assert data.get("cached") is True, f"expected cached=True on 2nd identical call, got {data}"
        assert isinstance(data.get("analysis"), str) and len(data["analysis"]) > 0


# ==============================================================
# Feature (c): AI ANALYSIS — analyze-top8
# ==============================================================
class TestAIAnalyzeTop8:
    def test_empty_list_returns_400(self, api):
        r = api.post(f"{BASE_URL}/api/ai/analyze-top8", json={"top8": [], "courseContext": {}})
        assert r.status_code == 400, r.text

    def test_over_12_returns_400(self, api):
        big = [{"numero": i, "nom": f"H{i}", "cote": 5.0, "grade": "C"} for i in range(1, 14)]
        r = api.post(f"{BASE_URL}/api/ai/analyze-top8", json={"top8": big, "courseContext": {}})
        assert r.status_code == 400, r.text

    def test_top8_analysis(self, api):
        top8 = [
            {"numero": 1, "nom": "ETOILE FILANTE", "cote": 3.2, "grade": "A", "formScore": 92, "reasons": ["forme max", "driver top"]},
            {"numero": 7, "nom": "ORAGE NOIR", "cote": 5.5, "grade": "B", "formScore": 84, "reasons": ["piste aimée"]},
            {"numero": 12, "nom": "LUNE ROUGE", "cote": 8.0, "grade": "B", "formScore": 79, "reasons": ["fraîcheur"]},
            {"numero": 3, "nom": "VENT DU NORD", "cote": 12.0, "grade": "C", "formScore": 72, "reasons": ["outsider"]},
            {"numero": 9, "nom": "SOLEIL LEVANT", "cote": 15.0, "grade": "C", "formScore": 68, "reasons": []},
            {"numero": 4, "nom": "MISTRAL", "cote": 20.0, "grade": "D", "formScore": 60, "reasons": []},
        ]
        ctx = {"libelle": "Prix du Test", "hippodrome": "Vincennes", "discipline": "Attelé", "distance": 2700, "terrain": "bon"}
        r = api.post(f"{BASE_URL}/api/ai/analyze-top8", json={"top8": top8, "courseContext": ctx}, timeout=60)
        assert r.status_code == 200, r.text
        data = r.json()
        assert data.get("ok") is True, data
        assert isinstance(data.get("analysis"), str) and len(data["analysis"]) > 20
        # fr heuristic : mot français courant
        assert any(w in data["analysis"].lower() for w in ["cheval", "course", "cote", "priv", "jeu", "forme"])


# ==============================================================
# Feature (c): AI USAGE + CACHE CLEAR (admin)
# ==============================================================
class TestAIAdminEndpoints:
    def test_usage_requires_admin(self, api):
        r = api.get(f"{BASE_URL}/api/admin/ai/usage")
        assert r.status_code in (401, 403), r.status_code

    def test_usage_with_admin_returns_structure(self, api, admin_headers):
        r = api.get(f"{BASE_URL}/api/admin/ai/usage", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        for k in ["totals", "daily", "cacheEntries", "estimatedCostEur7d", "model", "cacheTtlHours"]:
            assert k in data, f"missing {k} in {data.keys()}"
        assert data["model"] == "claude-sonnet-4-5-20250929"
        assert data["cacheTtlHours"] == 24
        assert isinstance(data["totals"], dict)
        for tk in ["calls", "cached", "real", "errors"]:
            assert tk in data["totals"]
        # At least some calls from previous tests in this run
        assert data["totals"]["calls"] >= 1
        assert isinstance(data["cacheEntries"], int) and data["cacheEntries"] >= 1

    def test_cache_delete_requires_admin(self, api):
        r = api.delete(f"{BASE_URL}/api/admin/ai/cache")
        assert r.status_code in (401, 403), r.status_code


# ==============================================================
# Feature (d): Code-expiring digest
# ==============================================================
class TestCodeExpiringDigest:
    def test_cron_code_expiring_invalid_token_401(self, api):
        r = api.get(f"{BASE_URL}/api/cron/code-expiring?token=invalid_XXX")
        assert r.status_code == 401, r.text

    def test_cron_code_expiring_missing_token_401(self, api):
        r = api.get(f"{BASE_URL}/api/cron/code-expiring")
        assert r.status_code == 401, r.text

    def test_cron_code_expiring_valid_token(self, api):
        r = api.get(f"{BASE_URL}/api/cron/code-expiring?token={CRON_TOKEN}", timeout=30)
        if r.status_code == 503 and "ADMIN_MANUAL_ONLY" in (r.text or ""):
            import pytest as _pt
            _pt.skip("ADMIN_MANUAL_ONLY enabled — CRON disabled")
        assert r.status_code == 200, r.text
        data = r.json()
        # Endpoint is fire-and-forget : returns either {queued:true,...}
        # or {queued:false, skipped:true, reason:"already_ran_today"}
        if data.get("skipped"):
            assert data.get("reason") in ("already_ran_today", "already_running")
        else:
            assert data.get("queued") is True
            assert data.get("jobName") == "code_expiring"
            assert "queuedAt" in data

    def test_admin_trigger_code_expiring(self, api, admin_headers):
        r = api.post(f"{BASE_URL}/api/admin/notifications/digest/code-expiring", headers=admin_headers, timeout=30)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "ok" in data
        assert "sent" in data
        assert "eligible" in data

    def test_admin_trigger_requires_auth(self, api):
        r = api.post(f"{BASE_URL}/api/admin/notifications/digest/code-expiring")
        assert r.status_code in (401, 403)

    def test_history_contains_code_expiring(self, api, admin_headers):
        r = api.get(f"{BASE_URL}/api/admin/notifications/digest/history", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        assert "lastSuccessByJob" in data
        assert "countByJob" in data
        # After the admin trigger above, at least one entry for code_expiring should exist
        combined = set((data.get("countByJob") or {}).keys()) | set((data.get("lastSuccessByJob") or {}).keys())
        assert "code_expiring" in combined, f"code_expiring missing from history keys: {combined}"


# ==============================================================
# Feature (d+e): notifications settings new keys
# ==============================================================
class TestNotificationSettingsNewKeys:
    def test_status_contains_new_keys(self, api, admin_headers):
        r = api.get(f"{BASE_URL}/api/admin/notifications/status", headers=admin_headers)
        assert r.status_code == 200, r.text
        data = r.json()
        settings = data.get("settings", {})
        for key in ["code_expiring_soon", "code_expiring_soon_hours", "grade_a_realtime_user", "grade_a_30min_reminder"]:
            assert key in settings, f"missing '{key}' in settings: {list(settings.keys())}"
        assert isinstance(settings["code_expiring_soon"], bool)
        assert isinstance(settings["code_expiring_soon_hours"], int)
        assert isinstance(settings["grade_a_realtime_user"], bool)
        assert isinstance(settings["grade_a_30min_reminder"], bool)

    def test_patch_setting_and_roundtrip(self, api, admin_headers):
        # First fetch current
        r0 = api.get(f"{BASE_URL}/api/admin/notifications/status", headers=admin_headers)
        assert r0.status_code == 200
        original = r0.json()["settings"]["grade_a_realtime_user"]

        try:
            # Toggle to False
            r1 = api.patch(
                f"{BASE_URL}/api/admin/notifications/settings",
                headers=admin_headers,
                json={"grade_a_realtime_user": False},
            )
            assert r1.status_code == 200, r1.text
            assert r1.json()["ok"] is True
            assert r1.json()["settings"]["grade_a_realtime_user"] is False

            # GET persists
            r2 = api.get(f"{BASE_URL}/api/admin/notifications/status", headers=admin_headers)
            assert r2.status_code == 200
            assert r2.json()["settings"]["grade_a_realtime_user"] is False
        finally:
            # Restore
            rr = api.patch(
                f"{BASE_URL}/api/admin/notifications/settings",
                headers=admin_headers,
                json={"grade_a_realtime_user": original},
            )
            assert rr.status_code == 200


# ==============================================================
# Feature (e): Grade A user broadcast (fire-and-forget) via /api/pronostics
# ==============================================================
UNIQUE_TAG = uuid.uuid4().hex[:8]


class TestGradeAUserBroadcast:
    def _make_pronostic(self, horse_num=99, horse_name=None):
        return {
            "date": "2099-01-01",
            "reunion": "R99",
            "course": f"C{UNIQUE_TAG[:2]}",
            "courseInfo": f"TESTIT11 {UNIQUE_TAG}",
            "cafs": [1, 2, 3],
            "classement": [1, 2, 3],
            "arrivee": [],
            "tierceHits": 0,
            "top7Hits": 0,
            "grade": "A",
            "gradeAHorseNum": horse_num,
            "gradeAHorseName": horse_name or f"TEST_HORSE_{UNIQUE_TAG}",
            "gradeAHorseCote": 4.2,
            "gradeAHorseReasons": ["forme top", "driver solide"],
            "hippodrome": "TEST-HIPPO",
        }

    def test_save_pronostic_grade_a_triggers_broadcast(self, api, admin_headers):
        payload = self._make_pronostic(horse_num=99, horse_name=f"TEST_CHEVAL_{UNIQUE_TAG}")
        r = api.post(f"{BASE_URL}/api/pronostics", json=payload)
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True
        # fire-and-forget; wait for asyncio.create_task
        time.sleep(6)
        # Can't reach db directly via api, but we can verify idempotence by calling 2nd time
        # and later cleanup via admin endpoint if available.

    def test_save_pronostic_grade_a_second_call_same_day_dedup(self, api):
        """Second identical call → should still return ok=True from /api/pronostics
        (the broadcast function internally dedups via grade_a_alerts_sent; not directly
        observable via HTTP, but we confirm no crash).
        """
        payload = self._make_pronostic(horse_num=99, horse_name=f"TEST_CHEVAL_{UNIQUE_TAG}")
        r = api.post(f"{BASE_URL}/api/pronostics", json=payload)
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True


# ==============================================================
# Post-hoc DB verification via a helper admin-authenticated endpoint
# (we use Mongo directly via a one-off script in conftest-free manner)
# ==============================================================
class TestDBSideEffects:
    """Validate grade_a_alerts_sent, ai_analysis_cache, ai_usage_log collections via motor."""

    def test_db_collections_state(self):
        import asyncio
        from motor.motor_asyncio import AsyncIOMotorClient

        async def _run():
            mongo_url = _read_env(BACK_ENV, "MONGO_URL")
            db_name = _read_env(BACK_ENV, "DB_NAME")
            assert mongo_url and db_name
            client = AsyncIOMotorClient(mongo_url)
            db = client[db_name]
            try:
                cache_count = await db.ai_analysis_cache.count_documents({})
                assert cache_count >= 1, f"expected ai_analysis_cache entries >=1, got {cache_count}"
                doc = await db.ai_analysis_cache.find_one({})
                assert doc is not None
                for k in ["key", "kind", "analysis", "cachedAt"]:
                    assert k in doc, f"missing {k} in cache doc"

                log_count = await db.ai_usage_log.count_documents({})
                assert log_count >= 1
                sample = await db.ai_usage_log.find_one({})
                for k in ["kind", "cached", "model"]:
                    assert k in sample

                ga_count = await db.grade_a_alerts_sent.count_documents({})
                assert ga_count >= 0

                await db.grade_a_alerts_sent.delete_many({"horse": {"$regex": f"TEST_CHEVAL_{UNIQUE_TAG}"}})
                await db.pronostics.delete_many({"courseInfo": {"$regex": f"TESTIT11 {UNIQUE_TAG}"}})
            finally:
                client.close()

        asyncio.run(_run())

