
"""Tests for SUBSCRIBERS CRUD + R1 pronostics digest + email on codes (iteration 3)."""
import os
import uuid
import pytest
import requests

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
ADMIN_PASSWORD = os.environ.get('ADMIN_PASSWORD', 'wague-admin-2026')
H = {"X-Admin-Password": ADMIN_PASSWORD, "Content-Type": "application/json"}


# --- Subscribers CRUD ---
class TestSubscribers:
    def test_list_shape(self):
        r = requests.get(f"{BASE_URL}/api/admin/subscribers", headers=H, timeout=15)
        assert r.status_code == 200
        d = r.json()
        for k in ["manual", "fromCodes", "activeRecipients", "activeCount"]:
            assert k in d
        assert isinstance(d["activeRecipients"], list)
        assert isinstance(d["activeCount"], int)

    def test_create_duplicate_invalid(self):
        email = f"test_{uuid.uuid4().hex[:8]}@turfex.local"
        # Create
        r = requests.post(f"{BASE_URL}/api/admin/subscribers", headers=H,
                          json={"email": email, "note": "TEST_iter3"}, timeout=15)
        assert r.status_code == 200
        sid = r.json()["subscriber"]["id"]
        assert r.json()["subscriber"]["email"] == email.lower()

        # Duplicate
        r2 = requests.post(f"{BASE_URL}/api/admin/subscribers", headers=H,
                           json={"email": email}, timeout=15)
        assert r2.status_code == 409

        # Invalid email
        r3 = requests.post(f"{BASE_URL}/api/admin/subscribers", headers=H,
                           json={"email": "noatsign"}, timeout=15)
        assert r3.status_code == 400

        # Patch toggle off -> must remove from activeRecipients
        rp = requests.patch(f"{BASE_URL}/api/admin/subscribers/{sid}", headers=H,
                            json={"active": False}, timeout=15)
        assert rp.status_code == 200
        listing = requests.get(f"{BASE_URL}/api/admin/subscribers", headers=H, timeout=15).json()
        assert email.lower() not in listing["activeRecipients"]

        # Re-activate & verify appears
        requests.patch(f"{BASE_URL}/api/admin/subscribers/{sid}", headers=H,
                       json={"active": True}, timeout=15)
        listing = requests.get(f"{BASE_URL}/api/admin/subscribers", headers=H, timeout=15).json()
        assert email.lower() in listing["activeRecipients"]

        # Delete
        rd = requests.delete(f"{BASE_URL}/api/admin/subscribers/{sid}", headers=H, timeout=15)
        assert rd.status_code == 200
        assert rd.json()["deleted"] == 1


# --- Codes with email field ---
class TestCodesEmail:
    def test_create_code_with_email(self):
        email = f"codetest_{uuid.uuid4().hex[:8]}@turfex.local"
        r = requests.post(f"{BASE_URL}/api/admin/codes", headers=H,
                          json={"label": "TEST_iter3_code", "email": email.upper(),
                                "durationDays": 7, "count": 1}, timeout=15)
        assert r.status_code == 200
        code = r.json()["codes"][0]
        assert code["email"] == email.lower()
        cid = code["id"]

        # Patch email
        new_em = f"codetest2_{uuid.uuid4().hex[:8]}@turfex.local"
        rp = requests.patch(f"{BASE_URL}/api/admin/codes/{cid}", headers=H,
                            json={"email": new_em}, timeout=15)
        assert rp.status_code == 200

        # Verify appears in fromCodes
        subs = requests.get(f"{BASE_URL}/api/admin/subscribers", headers=H, timeout=15).json()
        emails_in_codes = [c["email"] for c in subs["fromCodes"]]
        assert new_em.lower() in emails_in_codes

        # Cleanup
        requests.delete(f"{BASE_URL}/api/admin/codes/{cid}", headers=H, timeout=15)


# --- R1 Pronostics digest trigger ---
class TestR1Digest:
    def test_trigger_r1_pronostics(self):
        r = requests.post(f"{BASE_URL}/api/admin/notifications/digest/r1-pronostics",
                          headers=H, timeout=15)
        assert r.status_code == 200
        d = r.json()
        # Endpoint is now FIRE-AND-FORGET → expected shape:
        #   {ok: True, queued: True, message: "..."}  (envoi en arrière-plan)
        # OR {ok: False, error: "disabled"|...} when notifications désactivées.
        assert "ok" in d
        if d.get("ok"):
            assert d.get("queued") is True
            assert "message" in d
        else:
            err = (d.get("error") or "").lower()
            assert any(k in err for k in ["disabled", "abonné", "abonne"])

    def test_disabled_toggle_blocks(self):
        # Get current settings
        cur = requests.get(f"{BASE_URL}/api/admin/notifications/status", headers=H, timeout=15).json()
        was = cur["settings"].get("daily_r1_pronostics", True)
        # Disable
        requests.patch(f"{BASE_URL}/api/admin/notifications/settings", headers=H,
                       json={"daily_r1_pronostics": False}, timeout=15)
        try:
            r = requests.post(f"{BASE_URL}/api/admin/notifications/digest/r1-pronostics",
                              headers=H, timeout=30)
            assert r.status_code == 200
            d = r.json()
            assert d.get("ok") is False
            assert "disabled" in (d.get("error") or "").lower()
        finally:
            # Restore
            requests.patch(f"{BASE_URL}/api/admin/notifications/settings", headers=H,
                           json={"daily_r1_pronostics": was}, timeout=15)


# --- turf_analytics robustness ---
class TestTurfAnalytics:
    def test_compute_top8_empty(self):
        from turf_analytics import compute_top8
        assert compute_top8({}) == []
        assert compute_top8({"participants": []}) == []

    def test_compute_top8_minimal(self):
        from turf_analytics import compute_top8
        data = {
            "participants": [
                {"numPmu": 1, "nom": "A"},
                {"numPmu": 2, "nom": "B", "cote": 5.0},
                {"numPmu": 3, "nom": "C", "cote": 2.5, "history": []},
            ]
        }
        out = compute_top8(data)
        assert len(out) == 3
        for h in out:
            assert "grade" in h and h["grade"] in ["A", "B", "C", "D", "E"]
            assert "reasons" in h
            assert "breakdown" in h


# --- Status includes new key ---
class TestStatusSchema:
    def test_defaults_have_r1_key(self):
        r = requests.get(f"{BASE_URL}/api/admin/notifications/status", headers=H, timeout=15)
        assert r.status_code == 200
        d = r.json()
        assert "daily_r1_pronostics" in d["defaults"]
        assert "daily_r1_pronostics" in d["settings"]

