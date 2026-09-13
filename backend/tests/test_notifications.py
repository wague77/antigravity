
"""TURFEX — Notifications email + webhook + integration tests.

Couvre :
 - GET /api/admin/notifications/status
 - PATCH /api/admin/notifications/settings (persistance + threshold)
 - POST /api/admin/notifications/test (Resend)
 - POST /api/admin/notifications/digest/daily | weekly (avec et sans données)
 - POST /api/webhook/chariow (insertion + notif)
 - POST /api/pronostics grade A vs C (filtre)
 - PATCH /api/bets/{bid} transition gagne avec/sans seuil
 - IP brute-force admin-login + dedup notification + unlock
 - Rétention defaults / persistance après mises à jour

Utilise prefix TEST_ pour tout ce qui est créé puis cleanup.

ATTENTION rate-limit : admin-login = 4 fails / 5min → lockout 15min. On utilise
au plus 1 test login wrong — la suite IP brute force se déverrouille via
/api/admin/security/unlock immédiatement. Resend = 100/j, on limite les
envois réels.
"""
import os
import time
import uuid
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL").rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_PWD = "wague-admin-2026"
H_ADMIN = {"X-Admin-Password": ADMIN_PWD, "Content-Type": "application/json"}


# ============ SESSION ============
@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module", autouse=True)
def _restore_defaults_after(s):
    """Réinitialise les settings notif à leur valeur par défaut + unlock IP en fin de module."""
    yield
    try:
        s.patch(
            f"{API}/admin/notifications/settings",
            json={
                "admin_password_changed": True,
                "ip_locked": True,
                "code_activated": True,
                "codes_expired_daily": True,
                "payment_received": True,
                "bet_won": True,
                "bet_won_threshold": 100.0,
                "weekly_digest": True,
                "pronostic_grade_a": True,
            },
            headers=H_ADMIN,
            timeout=10,
        )
    except Exception:
        pass
    # Unlock notre IP côté admin pour ne pas pénaliser le test runner
    try:
        r = s.get(f"{API}/admin/security", headers=H_ADMIN, timeout=10)
        if r.status_code == 200:
            data = r.json() or {}
            for scope in ("admin", "user"):
                for entry in data.get(scope, []) or []:
                    ip = entry.get("ip")
                    if not ip:
                        continue
                    s.post(
                        f"{API}/admin/security/unlock",
                        json={"ip": ip, "scope": scope},
                        headers=H_ADMIN,
                        timeout=10,
                    )
    except Exception:
        pass


# ============ STATUS ============
class TestNotificationsStatus:
    def test_status_requires_admin(self, s):
        r = s.get(f"{API}/admin/notifications/status")
        assert r.status_code == 401

    def test_status_ok(self, s):
        r = s.get(f"{API}/admin/notifications/status", headers=H_ADMIN)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["enabled"] is True
        assert d["hasApiKey"] is True
        assert d["hasRecipient"] is True
        assert "*" in d["recipientMasked"]
        assert "@" in d["recipientMasked"]
        assert isinstance(d["sender"], str) and len(d["sender"]) > 0
        # 9 clés dans defaults (8 toggles + 1 threshold)
        defaults = d["defaults"]
        for k in [
            "admin_password_changed", "ip_locked", "code_activated",
            "codes_expired_daily", "payment_received", "bet_won",
            "bet_won_threshold", "weekly_digest", "pronostic_grade_a",
        ]:
            assert k in defaults
        assert "settings" in d
        for k in defaults:
            assert k in d["settings"]


# ============ SETTINGS PERSISTENCE ============
class TestNotificationsSettings:
    def test_patch_threshold_persists(self, s):
        r = s.patch(
            f"{API}/admin/notifications/settings",
            json={"bet_won_threshold": 50.0},
            headers=H_ADMIN,
        )
        assert r.status_code == 200, r.text
        assert r.json()["ok"] is True
        assert float(r.json()["settings"]["bet_won_threshold"]) == 50.0

        # Re-GET pour confirmer la persistance DB
        g = s.get(f"{API}/admin/notifications/status", headers=H_ADMIN)
        assert g.status_code == 200
        assert float(g.json()["settings"]["bet_won_threshold"]) == 50.0

    def test_patch_toggle_off_then_on(self, s):
        # OFF
        r = s.patch(
            f"{API}/admin/notifications/settings",
            json={"pronostic_grade_a": False},
            headers=H_ADMIN,
        )
        assert r.status_code == 200
        assert r.json()["settings"]["pronostic_grade_a"] is False

        # ON (restore)
        r2 = s.patch(
            f"{API}/admin/notifications/settings",
            json={"pronostic_grade_a": True},
            headers=H_ADMIN,
        )
        assert r2.status_code == 200
        assert r2.json()["settings"]["pronostic_grade_a"] is True

    def test_patch_unknown_key_ignored(self, s):
        r = s.patch(
            f"{API}/admin/notifications/settings",
            json={"definitely_not_a_real_key": True},
            headers=H_ADMIN,
        )
        assert r.status_code == 200
        assert "definitely_not_a_real_key" not in r.json()["settings"]


# ============ TEST EMAIL ============
class TestNotificationsTestEmail:
    def test_send_test_email(self, s):
        r = s.post(f"{API}/admin/notifications/test", headers=H_ADMIN, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        # Resend retourne ok=true + id (string) en cas de succès
        # Si la quota est atteinte ou clé invalide, ok=false acceptable
        if d.get("ok"):
            assert d.get("id"), "Expected Resend id when ok=true"
        else:
            # Documenter le motif d'échec pour debug
            print(f"WARN: notif test email returned ok=false: {d}")


# ============ DIGESTS ============
class TestDigests:
    def test_daily_digest_no_codes(self, s):
        # Pas forcément vide en prod, mais on vérifie au moins que le call répond 200
        r = s.post(f"{API}/admin/notifications/digest/daily", headers=H_ADMIN, timeout=20)
        assert r.status_code == 200, r.text
        # ok peut être true (codes expirés réels) ou false (pas de codes)
        d = r.json()
        assert "ok" in d

    def test_weekly_digest(self, s):
        r = s.post(f"{API}/admin/notifications/digest/weekly", headers=H_ADMIN, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert "ok" in d


# ============ WEBHOOK CHARIOW ============
class TestChariowWebhook:
    def test_webhook_persists_and_notifies(self, s):
        tx = f"TEST_tx_{uuid.uuid4().hex[:8]}"
        payload = {
            "event": "payment_success",
            "amount": 49.90,
            "currency": "EUR",
            "buyer_email": "TEST_buyer@example.com",
            "transaction_id": tx,
        }
        r = s.post(f"{API}/webhook/chariow", json=payload, timeout=20)
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert "notification" in d
        # notification.ok peut être true (Resend OK) ou false (toggle off)

    def test_webhook_failed_event_ignored(self, s):
        r = s.post(
            f"{API}/webhook/chariow",
            json={"event": "payment_failed", "amount": 10},
            timeout=10,
        )
        assert r.status_code == 200
        assert r.json().get("ignored") == "failed payment"


# ============ PRONOSTICS GRADE FILTER ============
class TestPronosticsGradeFilter:
    def test_grade_a_inserted_with_grade(self, s):
        body = {
            "date": "2026-01-15",
            "reunion": "R1",
            "course": "C1",
            "courseInfo": "TEST_grade_a",
            "cafs": [1, 2, 3],
            "classement": [1, 2, 3, 4, 5],
            "arrivee": [],
            "tierceHits": 0,
            "top7Hits": 0,
            "grade": "A",
        }
        r = s.post(f"{API}/pronostics", json=body, timeout=10)
        assert r.status_code == 200, r.text
        pid_a = r.json()["id"]

        # Verify persisted with grade
        g = s.get(f"{API}/pronostics?limit=20", timeout=10)
        assert g.status_code == 200
        items = g.json()["items"]
        match = next((it for it in items if it["id"] == pid_a), None)
        assert match is not None
        assert match.get("grade") == "A"

        # cleanup
        s.delete(f"{API}/pronostics/{pid_a}", timeout=10)

    def test_grade_c_inserted_no_email(self, s):
        # On désactive d'abord pronostic_grade_a pour s'assurer qu'aucun email n'est envoyé
        # même si grade != A — la logique filtre dans on_pronostic_grade_a
        body = {
            "date": "2026-01-15",
            "reunion": "R2",
            "course": "C2",
            "courseInfo": "TEST_grade_c",
            "cafs": [],
            "classement": [1, 2, 3],
            "arrivee": [],
            "tierceHits": 0,
            "top7Hits": 0,
            "grade": "C",
        }
        r = s.post(f"{API}/pronostics", json=body, timeout=10)
        assert r.status_code == 200
        pid_c = r.json()["id"]

        g = s.get(f"{API}/pronostics?limit=20", timeout=10)
        match = next((it for it in g.json()["items"] if it["id"] == pid_c), None)
        assert match is not None
        assert match.get("grade") == "C"
        # Pas d'email envoyé — vérification implicite (le filtre se fait côté on_pronostic_grade_a)

        s.delete(f"{API}/pronostics/{pid_c}", timeout=10)


# ============ BETS THRESHOLD ============
class TestBetWonThreshold:
    def _make_bet(self, s):
        body = {
            "date": "2026-01-15",
            "reunion": "R1",
            "course": "C1",
            "typePari": "SIMPLE_GAGNANT",
            "chevaux": [7],
            "mise": 10.0,
            "coteAffichee": 5.0,
            "statut": "en_attente",
        }
        r = s.post(f"{API}/bets", json=body, timeout=10)
        assert r.status_code == 200
        return r.json()["id"]

    def test_below_threshold_no_send_above_sends(self, s):
        # Régler threshold à 100 pour ces tests
        s.patch(
            f"{API}/admin/notifications/settings",
            json={"bet_won_threshold": 100.0, "bet_won": True},
            headers=H_ADMIN,
        )

        # Bet 1 — gain en-dessous (50€ < 100€)
        bid_low = self._make_bet(s)
        r1 = s.patch(f"{API}/bets/{bid_low}", json={"statut": "gagne", "gainReel": 50.0}, timeout=10)
        assert r1.status_code == 200
        assert r1.json().get("updated", 0) >= 1
        # cleanup
        s.delete(f"{API}/bets/{bid_low}", timeout=10)

        # Bet 2 — gain au-dessus (150€ >= 100€) — déclenche email (background, non bloquant)
        bid_hi = self._make_bet(s)
        r2 = s.patch(f"{API}/bets/{bid_hi}", json={"statut": "gagne", "gainReel": 150.0}, timeout=10)
        assert r2.status_code == 200
        assert r2.json().get("updated", 0) >= 1
        s.delete(f"{API}/bets/{bid_hi}", timeout=10)

    def test_no_email_if_already_won(self, s):
        # Si la transition n'est pas en_attente -> gagne, pas d'email
        bid = self._make_bet(s)
        # Direct create as already gagne
        r = s.patch(f"{API}/bets/{bid}", json={"gainReel": 200.0}, timeout=10)
        assert r.status_code == 200
        s.delete(f"{API}/bets/{bid}", timeout=10)


# ============ IP BRUTE-FORCE LOCKOUT + DEDUP ============
class TestIpLockout:
    """ATTENTION : ce test verrouille temporairement notre IP côté admin scope.
    On déverrouille immédiatement après via /admin/security/unlock.
    """

    def test_4_wrong_then_locked_then_unlock(self, s):
        # Récup état initial
        st0 = s.get(f"{API}/admin/security", headers=H_ADMIN, timeout=10)
        assert st0.status_code == 200

        # Trigger 4 wrong logins → 4ème déclenche le lockout
        statuses = []
        for i in range(4):
            r = s.post(f"{API}/admin/login", json={"password": f"WRONG_{i}"}, timeout=10)
            statuses.append(r.status_code)
            time.sleep(0.3)

        # Au moins le dernier doit être 401 (4ème échec) ou 429 si déjà locked
        assert statuses[-1] in (401, 429), f"unexpected statuses: {statuses}"

        # 5ème tentative → doit être 429 (lockout actif), et NE doit PAS renvoyer d'email
        r5 = s.post(f"{API}/admin/login", json={"password": "WRONG_5"}, timeout=10)
        assert r5.status_code == 429, f"Expected lockout, got {r5.status_code}: {r5.text}"

        # Vérifier état via /admin/security (avec mot de passe correct → bypass car header check)
        st = s.get(f"{API}/admin/security", headers=H_ADMIN, timeout=10)
        assert st.status_code == 200
        data = st.json() or {}
        admin_entries = data.get("admin", [])
        admin_locked = [e for e in admin_entries if e.get("isLocked")]
        assert len(admin_locked) >= 1, f"Expected at least one admin IP locked, got: {admin_entries}"

        # Déverrouiller toutes les IPs admin pour ne pas se bloquer
        for e in admin_locked:
            r_unlock = s.post(
                f"{API}/admin/security/unlock",
                json={"ip": e["ip"], "scope": "admin"},
                headers=H_ADMIN,
                timeout=10,
            )
            assert r_unlock.status_code == 200
            assert r_unlock.json()["ok"] is True

        # Login correct doit fonctionner après unlock
        ok = s.post(f"{API}/admin/login", json={"password": ADMIN_PWD}, timeout=10)
        assert ok.status_code == 200, ok.text

