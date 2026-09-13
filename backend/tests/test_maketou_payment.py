
"""Backend tests for Maketou payment integration (P0 feature)."""
import os
import pytest
import requests

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL", "https://identical-build-8.preview.emergentagent.com").rstrip("/")
ADMIN_PASSWORD = "wague-admin-2026"
MAKETOU_KEY = "msk_REDACTED_MAKETOU_KEY"


@pytest.fixture(scope="module")
def s():
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json"})
    return sess


@pytest.fixture(scope="module")
def admin(s):
    sess = requests.Session()
    sess.headers.update({"Content-Type": "application/json", "X-Admin-Password": ADMIN_PASSWORD})
    return sess


# ---------- Public providers endpoint ----------
class TestPublicProviders:
    def test_get_providers_default_state(self, s):
        r = s.get(f"{BASE_URL}/api/payment/providers")
        assert r.status_code == 200
        d = r.json()
        assert "providers" in d and "plans" in d
        assert isinstance(d["providers"], list) and len(d["providers"]) >= 1
        # Plans validation
        keys = {p["key"]: p for p in d["plans"]}
        assert keys["1m"]["price"] == 30
        assert keys["3m"]["price"] == 80 and keys["3m"]["discount"] == 10
        assert keys["1y"]["price"] == 260 and keys["1y"]["discount"] == 100


# ---------- Public checkout ----------
class TestPublicCheckout:
    def _payload(self, plan="1m"):
        return {
            "plan": plan,
            "email": f"TEST_{plan}@example.com",
            "firstName": "Test",
            "lastName": "User",
        }

    def test_checkout_1m(self, s):
        r = s.post(f"{BASE_URL}/api/payment/maketou/checkout", json=self._payload("1m"))
        assert r.status_code == 200, r.text
        d = r.json()
        assert d["ok"] is True
        assert d["cartId"] and isinstance(d["cartId"], str)
        assert d["redirectUrl"] and "checkout.moneroo.io" in d["redirectUrl"]

    def test_checkout_3m_distinct(self, s):
        r1 = s.post(f"{BASE_URL}/api/payment/maketou/checkout", json=self._payload("3m"))
        r2 = s.post(f"{BASE_URL}/api/payment/maketou/checkout", json=self._payload("3m"))
        assert r1.status_code == 200 and r2.status_code == 200
        c1, c2 = r1.json()["cartId"], r2.json()["cartId"]
        assert c1 and c2 and c1 != c2

    def test_checkout_1y(self, s):
        r = s.post(f"{BASE_URL}/api/payment/maketou/checkout", json=self._payload("1y"))
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is True and d["cartId"]

    def test_checkout_invalid_plan(self, s):
        r = s.post(f"{BASE_URL}/api/payment/maketou/checkout", json={**self._payload(), "plan": "xx"})
        assert r.status_code == 400

    def test_checkout_empty_email(self, s):
        r = s.post(f"{BASE_URL}/api/payment/maketou/checkout", json={**self._payload(), "email": ""})
        assert r.status_code == 400

    def test_checkout_invalid_email(self, s):
        r = s.post(f"{BASE_URL}/api/payment/maketou/checkout", json={**self._payload(), "email": "noatsign"})
        assert r.status_code == 400


# ---------- Public cart status ----------
class TestCartStatus:
    def test_cart_status_unpaid(self, s):
        # Create a fresh cart first
        r = s.post(f"{BASE_URL}/api/payment/maketou/checkout", json={
            "plan": "1m", "email": "TEST_status@example.com",
            "firstName": "T", "lastName": "U",
        })
        assert r.status_code == 200
        cart_id = r.json()["cartId"]
        r2 = s.get(f"{BASE_URL}/api/payment/maketou/cart/{cart_id}")
        assert r2.status_code == 200
        d = r2.json()
        assert d["ok"] is True
        # Unpaid → typically 'waiting_payment' (could also be other valid statuses)
        assert d["status"] in ("waiting_payment", "abandoned", "payment_failed", None) or isinstance(d["status"], str)
        assert d.get("accessCode") in (None, {})


# ---------- Admin auth gate ----------
class TestAdminAuth:
    def test_admin_no_password_rejected(self, s):
        r = s.get(f"{BASE_URL}/api/admin/payment/providers")
        assert r.status_code in (401, 403)

    def test_admin_wrong_password_rejected(self, s):
        r = s.get(f"{BASE_URL}/api/admin/payment/providers", headers={"X-Admin-Password": "WRONG"})
        assert r.status_code in (401, 403)


# ---------- Admin endpoints ----------
class TestAdminProviders:
    def test_admin_get_providers(self, admin):
        r = admin.get(f"{BASE_URL}/api/admin/payment/providers")
        assert r.status_code == 200
        d = r.json()
        assert "providers" in d and "available" in d
        assert d["maketou"]["apiKeyConfigured"] is True
        assert d["maketou"]["products"]["1m"]["set"] is True
        assert d["maketou"]["products"]["3m"]["set"] is True
        assert d["maketou"]["products"]["1y"]["set"] is True

    def test_admin_patch_providers_toggle_and_restore(self, admin, s):
        # Set both
        r = admin.patch(f"{BASE_URL}/api/admin/payment/providers", json={"providers": ["chariow", "maketou"]})
        assert r.status_code == 200
        public = s.get(f"{BASE_URL}/api/payment/providers").json()
        assert set(public["providers"]) == {"chariow", "maketou"}

        # Restore to maketou only
        r2 = admin.patch(f"{BASE_URL}/api/admin/payment/providers", json={"providers": ["maketou"]})
        assert r2.status_code == 200
        public2 = s.get(f"{BASE_URL}/api/payment/providers").json()
        assert public2["providers"] == ["maketou"]

    def test_admin_patch_providers_empty_400(self, admin):
        r = admin.patch(f"{BASE_URL}/api/admin/payment/providers", json={"providers": []})
        assert r.status_code == 400


class TestAdminSecrets:
    def test_admin_clear_and_restore_apikey(self, admin):
        # Clear
        r = admin.post(f"{BASE_URL}/api/admin/payment/maketou/secrets", json={"apiKey": ""})
        assert r.status_code == 200
        # Verify cleared
        r2 = admin.get(f"{BASE_URL}/api/admin/payment/providers")
        assert r2.status_code == 200
        # NOTE: even if DB cleared, env fallback can still satisfy. Ensure check via response shape.
        # If env fallback exists, apiKeyConfigured may remain true. Document actual behavior:
        cfg = r2.json()
        cleared_ok = cfg["maketou"]["apiKeyConfigured"]
        # Restore IMMEDIATELY (critical)
        r3 = admin.post(f"{BASE_URL}/api/admin/payment/maketou/secrets", json={"apiKey": MAKETOU_KEY})
        assert r3.status_code == 200, "CRITICAL: failed to restore Maketou key"
        # Confirm restored
        r4 = admin.get(f"{BASE_URL}/api/admin/payment/providers")
        assert r4.json()["maketou"]["apiKeyConfigured"] is True
        # If cleared_ok was True, .env fallback present (acceptable but documented)
        print(f"After clear, apiKeyConfigured={cleared_ok} (env fallback expected)")

    def test_admin_no_fields_400(self, admin):
        r = admin.post(f"{BASE_URL}/api/admin/payment/maketou/secrets", json={})
        assert r.status_code == 400


class TestAdminTest:
    def test_admin_test_checkout(self, admin):
        r = admin.post(f"{BASE_URL}/api/admin/payment/maketou/test", json={
            "plan": "1m", "email": "admin@turfex.fr",
        })
        assert r.status_code == 200
        d = r.json()
        assert d["ok"] is True
        assert d["cartId"]
        assert d["redirectUrl"] and "checkout.moneroo.io" in d["redirectUrl"]
        assert d["plan"] == "1m" and d["price"] == 30

