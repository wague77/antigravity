
"""TURFEX — Intégration Maketou (paiement alternatif à Chariow).

API Maketou : https://docs-api.maketou.com
Base URL : https://api.maketou.net
Auth : Bearer token via header Authorization

Tarifs TURFEX configurés :
  - 1 mois  : 30 €
  - 3 mois  : 80 € (économie 10 €)
  - 1 an    : 260 € (économie 100 €)
"""
import os
import logging
from typing import Any, Dict, Optional

import httpx

logger = logging.getLogger(__name__)

MAKETOU_API_BASE = "https://api.maketou.net"

# Mapping plan → product UUID Maketou (lu depuis .env, modifiable en runtime via app_secrets)
PLANS = {
    "1m": {"label": "1 mois", "price": 30, "discount": 0, "envKey": "MAKETOU_PRODUCT_1M"},
    "3m": {"label": "3 mois", "price": 80, "discount": 10, "envKey": "MAKETOU_PRODUCT_3M"},
    "1y": {"label": "1 an", "price": 260, "discount": 100, "envKey": "MAKETOU_PRODUCT_1Y"},
}


async def _load_maketou_api_key(db) -> Optional[str]:
    """Charge la clé Maketou depuis MongoDB > .env."""
    if db is not None:
        try:
            doc = await db.app_secrets.find_one({"_id": "maketou_api_key"})
            if doc:
                val = (doc.get("value") or "").strip()
                if val:
                    return val
        except Exception as e:
            logger.warning(f"Failed to load Maketou key from DB: {e}")
    return (os.environ.get("MAKETOU_API_KEY") or "").strip() or None


async def _load_maketou_product_id(db, plan_key: str) -> Optional[str]:
    """Charge le productDocumentId d'un plan depuis MongoDB > .env."""
    plan = PLANS.get(plan_key)
    if not plan:
        return None
    if db is not None:
        try:
            doc = await db.app_secrets.find_one({"_id": f"maketou_product_{plan_key}"})
            if doc:
                val = (doc.get("value") or "").strip()
                if val:
                    return val
        except Exception as e:
            logger.warning(f"Failed to load Maketou product {plan_key} from DB: {e}")
    return (os.environ.get(plan["envKey"]) or "").strip() or None


def _headers(api_key: str) -> Dict[str, str]:
    return {"Authorization": f"Bearer {api_key}", "Content-Type": "application/json"}


async def create_checkout(
    db,
    plan_key: str,
    email: str,
    first_name: str,
    last_name: str,
    redirect_url: str,
    phone: Optional[str] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Crée un panier Maketou et retourne l'URL de redirection vers le checkout.

    Returns: {"ok": True, "cartId": "...", "redirectUrl": "https://checkout.moneroo.io/..."}
             {"ok": False, "error": "..."}
    """
    api_key = await _load_maketou_api_key(db)
    if not api_key:
        return {"ok": False, "error": "Aucune clé API Maketou configurée"}
    product_id = await _load_maketou_product_id(db, plan_key)
    if not product_id:
        return {"ok": False, "error": f"Aucun productDocumentId pour le plan {plan_key}"}

    payload: Dict[str, Any] = {
        "productDocumentId": product_id,
        "email": email.strip(),
        "firstName": first_name.strip()[:50] or "TURFEX",
        "lastName": last_name.strip()[:50] or "User",
        "redirectURL": redirect_url,
    }
    if phone:
        payload["phone"] = phone.strip()
    if meta:
        payload["meta"] = meta

    try:
        async with httpx.AsyncClient(timeout=20) as client:
            r = await client.post(f"{MAKETOU_API_BASE}/api/v1/stores/cart/checkout", headers=_headers(api_key), json=payload)
        if r.status_code in (200, 201):
            data = r.json() or {}
            return {
                "ok": True,
                "cartId": (data.get("cart") or {}).get("id"),
                "redirectUrl": data.get("redirectUrl"),
                "raw": data,
            }
        try:
            err_body = r.json()
            err_msg = err_body.get("message") or err_body.get("code") or r.text[:200]
        except Exception:
            err_msg = r.text[:200] or f"HTTP {r.status_code}"
        return {"ok": False, "error": f"[{r.status_code}] {err_msg}"}
    except Exception as e:
        logger.exception(f"Maketou checkout failed: {e}")
        return {"ok": False, "error": str(e)}


async def get_cart_status(db, cart_id: str) -> Dict[str, Any]:
    """Récupère le statut d'un panier Maketou (waiting_payment | completed | abandoned | payment_failed)."""
    api_key = await _load_maketou_api_key(db)
    if not api_key:
        return {"ok": False, "error": "Aucune clé API Maketou configurée"}
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(f"{MAKETOU_API_BASE}/api/v1/stores/cart/{cart_id}", headers=_headers(api_key))
        if r.status_code == 200:
            data = r.json() or {}
            return {
                "ok": True,
                "id": data.get("id"),
                "status": data.get("status"),
                "customerInfo": data.get("customerInfo"),
                "meta": data.get("meta"),
                "paymentId": data.get("paymentId"),
            }
        try:
            err_body = r.json()
            err_msg = err_body.get("message") or err_body.get("code")
        except Exception:
            err_msg = r.text[:200]
        return {"ok": False, "error": f"[{r.status_code}] {err_msg}"}
    except Exception as e:
        logger.exception(f"Maketou get_cart failed: {e}")
        return {"ok": False, "error": str(e)}

