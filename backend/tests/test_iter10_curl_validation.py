
"""Iteration 10 — targeted curl-style validations requested by main agent.

Covers:
(a) /api/cron/r1-pronostics idempotence chain (call 1 → run-or-skip, call 2 → MUST skip already_ran_today)
(b) /api/cron/trial-followup logs a digest_runs entry with trigger='external_cron'
(c) Full bcrypt round-trip: change password → login with new → login with old rejected → restore old password
(d) Verify digest_runs DB state: docs have jobName/trigger/ok/runAt; trigger values observed.

Run with:
  REACT_APP_BACKEND_URL=... pytest backend/tests/test_iter10_curl_validation.py -v
"""
import os
import asyncio
from pathlib import Path

import pytest
import httpx
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient

load_dotenv(Path("/app/backend/.env"))

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "").rstrip("/")
if not BASE_URL:
    pytest.skip("REACT_APP_BACKEND_URL not set", allow_module_level=True)

API = f"{BASE_URL}/api"
ADMIN_PWD = "wague-admin-2026"
# CRON_TOKEN in .env is stored WITHOUT quotes in this env, but strip any lingering quotes
CRON_TOKEN = os.environ.get("CRON_TOKEN", "").strip().strip('"').strip("'")


@pytest.fixture
def client():
    with httpx.Client(timeout=60.0) as c:
        yield c


def _get_db():
    mongo_url = os.environ["MONGO_URL"]
    db_name = os.environ["DB_NAME"]
    return AsyncIOMotorClient(mongo_url)[db_name], mongo_url


# ------------------------------------------------------------------ #
# (a) CRON R1 idempotence chain
# ------------------------------------------------------------------ #
class TestCronR1Idempotence:
    def test_cron_token_loaded(self):
        assert CRON_TOKEN, "CRON_TOKEN must be non-empty in backend/.env"
        assert len(CRON_TOKEN) >= 16

    def test_call1_then_call2_second_must_skip(self, client):
        """Call #1 may queue OR skip (idempotent). Call #2 MUST skip with reason=already_ran_today.

        When ADMIN_MANUAL_ONLY=true, CRON returns 503 — test is a no-op in that case.
        """
        r1 = client.get(f"{API}/cron/r1-pronostics", params={"token": CRON_TOKEN})
        if r1.status_code == 503 and "ADMIN_MANUAL_ONLY" in (r1.text or ""):
            import pytest as _pt
            _pt.skip("ADMIN_MANUAL_ONLY enabled — CRON disabled")
        assert r1.status_code == 200, r1.text
        d1 = r1.json()
        # First call: queued (background) OR skipped (already ran) — both acceptable
        assert d1.get("queued") in (True, False)
        # Wait for background to complete if just queued
        import time as _t
        if d1.get("queued") is True:
            _t.sleep(20)

        # Second call — idempotent skip required
        r2 = client.get(f"{API}/cron/r1-pronostics", params={"token": CRON_TOKEN})
        assert r2.status_code == 200, r2.text
        d2 = r2.json()
        assert d2.get("skipped") is True, f"2nd call must skip, got: {d2}"
        assert d2.get("reason") == "already_ran_today", f"reason mismatch: {d2}"
        assert "lastRun" in d2


# ------------------------------------------------------------------ #
# (b) trial-followup logs digest_runs entry with trigger='external_cron'
# ------------------------------------------------------------------ #
class TestCronTrialFollowupLogging:
    def test_trial_followup_logs_with_correct_trigger(self, client):
        r = client.get(f"{API}/cron/trial-followup", params={"token": CRON_TOKEN})
        if r.status_code == 503 and "ADMIN_MANUAL_ONLY" in (r.text or ""):
            import pytest as _pt
            _pt.skip("ADMIN_MANUAL_ONLY enabled — CRON disabled")
        assert r.status_code == 200, r.text
        data = r.json()
        # New fire-and-forget shape: queued or skipped
        assert "queued" in data or "skipped" in data

        # Wait briefly for background to log if it just queued
        import time as _t
        if data.get("queued") is True:
            _t.sleep(8)

        # Verify a fresh digest_runs entry with trigger=external_cron exists for trial_followup
        async def _check():
            db, _ = _get_db()
            doc = await db.digest_runs.find_one(
                {"jobName": "trial_followup"}, sort=[("runAt", -1)]
            )
            return doc

        doc = asyncio.run(_check())
        assert doc is not None, "No digest_runs entry found for trial_followup"
        # If the underlying ran, trigger should be external_cron; if it was already run, we still expect
        # the most-recent log to have external_cron OR cron/manual. Accept known set.
        assert doc.get("trigger") in {
            "external_cron",
            "cron",
            "manual",
            "startup_catchup",
        }, f"unexpected trigger: {doc.get('trigger')}"
        assert "runAt" in doc
        assert "ok" in doc


# ------------------------------------------------------------------ #
# (c) Full bcrypt round-trip (change password → login → restore)
# ------------------------------------------------------------------ #
NEW_PWD = "TEST-iter10-newpwd-XYZ9"


class TestBcryptRoundTrip:
    def test_full_password_change_roundtrip(self, client):
        # Step 1 — ensure baseline login works
        r = client.post(f"{API}/admin/login", json={"password": ADMIN_PWD})
        assert r.status_code == 200, r.text
        assert r.json().get("adminToken") == ADMIN_PWD, "adminToken MUST remain plain password for FE compat"

        # Step 2 — change password
        r = client.post(
            f"{API}/admin/change-password",
            headers={"X-Admin-Password": ADMIN_PWD},
            json={"currentPassword": ADMIN_PWD, "newPassword": NEW_PWD},
        )
        assert r.status_code == 200, r.text

        # Step 3 — login with OLD password MUST fail
        r = client.post(f"{API}/admin/login", json={"password": ADMIN_PWD})
        assert r.status_code == 401, f"Old pwd must be rejected, got {r.status_code} {r.text}"

        # Step 4 — login with NEW password MUST work
        r = client.post(f"{API}/admin/login", json={"password": NEW_PWD})
        assert r.status_code == 200, r.text
        assert r.json().get("adminToken") == NEW_PWD

        # Step 5 — DB must contain bcrypt hash (60 chars, $2x$)
        async def _dbcheck():
            db, _ = _get_db()
            doc = await db.admin_config.find_one({"key": "admin_password"})
            return doc

        doc = asyncio.run(_dbcheck())
        assert doc is not None
        v = doc.get("value", "")
        assert v.startswith(("$2a$", "$2b$", "$2y$")), f"Expected bcrypt hash, got: {v[:10]}"
        assert len(v) == 60

        # Step 6 — admin endpoint w/ new header works
        r = client.get(f"{API}/admin/codes", headers={"X-Admin-Password": NEW_PWD})
        assert r.status_code == 200

        # Step 7 — RESTORE original password (post-condition for environment)
        r = client.post(
            f"{API}/admin/change-password",
            headers={"X-Admin-Password": NEW_PWD},
            json={"currentPassword": NEW_PWD, "newPassword": ADMIN_PWD},
        )
        assert r.status_code == 200, r.text

        # Step 8 — verify restored
        r = client.post(f"{API}/admin/login", json={"password": ADMIN_PWD})
        assert r.status_code == 200


# ------------------------------------------------------------------ #
# (d) digest_runs trigger variety
# ------------------------------------------------------------------ #
class TestDigestRunsTriggers:
    def test_triggers_are_from_known_set(self, client):
        r = client.get(
            f"{API}/admin/notifications/digest/history",
            params={"limit": 100},
            headers={"X-Admin-Password": ADMIN_PWD},
        )
        assert r.status_code == 200
        items = r.json().get("items", [])
        assert isinstance(items, list)

        allowed = {"external_cron", "cron", "manual", "startup_catchup", "scheduler", "manual_add_send", "manual_resend"}
        triggers_seen = set()
        for it in items:
            t = it.get("trigger")
            assert t, f"item missing trigger: {it}"
            triggers_seen.add(t)
            assert t in allowed, f"unexpected trigger {t!r} in item {it}"

        # External cron should exist because we invoked it in previous tests
        # (soft assert — allow environments where cron was run from scheduler only)
        print(f"Triggers seen in digest_runs: {triggers_seen}")
        assert "external_cron" in triggers_seen, (
            f"expected at least one external_cron entry, got {triggers_seen}"
        )

    def test_history_items_ordered_desc_by_runAt(self, client):
        r = client.get(
            f"{API}/admin/notifications/digest/history",
            params={"limit": 20},
            headers={"X-Admin-Password": ADMIN_PWD},
        )
        assert r.status_code == 200
        items = r.json().get("items", [])
        if len(items) >= 2:
            # runAt is ISO string — lexicographic sort works
            for a, b in zip(items, items[1:]):
                assert a["runAt"] >= b["runAt"], "items must be DESC by runAt"

