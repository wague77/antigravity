
"""Module de notifications email TURFEX.

Centralise :
 - les toggles par événement (stockés en DB `notification_settings`)
 - les builders HTML brandés
 - les triggers (une fonction async par événement)
 - les digests quotidien/hebdo exécutés par le scheduler

Toutes les fonctions trigger/digest sont no-op silencieuses si le toggle email
global est désactivé (clés Resend manquantes) ou si l'événement est désactivé.
"""
import os
import uuid
import asyncio
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import resend
import httpx

logger = logging.getLogger(__name__)

# ===== CONFIG & DÉFAUTS =====
DEFAULT_SETTINGS: Dict[str, Any] = {
    # Sécurité
    "admin_password_changed": True,
    "ip_locked": True,
    # Utilisateurs / Codes
    "code_activated": True,
    "codes_expired_daily": True,  # digest 09:00 UTC
    "payment_received": True,
    # Paris / ROI
    "bet_won": True,
    "bet_won_threshold": 100.0,  # €
    "weekly_digest": True,  # lundi 09:00 UTC
    # Pronostics
    "pronostic_grade_a": True,
    "daily_r1_pronostics": True,  # digest 08:00 Europe/Paris — envoyé aux abonnés actifs
    # Lead nurturing
    "trial_followup": True,  # relance abonnement J+2 après trial — 10:00 Europe/Paris
    "trial_followup_promo_code": "TURFEX5",  # code promo affiché dans la relance
    "trial_followup_discount_label": "5 € de réduction",  # libellé de la réduction
    # URL de paiement Chariow utilisée par le bouton "Activer mon abonnement TURFEX"
    # de l'email/export OFFRE ABONNEMENT. Modifiable depuis l'admin.
    "subscription_payment_url": "https://ygsftwvy.mychariow.shop/checkout/prd_dh34ze",
    # NEW: Expiration codes — push J-1 utilisateur (email + push)
    "code_expiring_soon": True,  # email J-1 avant expiration code
    "code_expiring_soon_hours": 24,  # fenêtre (heures avant expiration)
    # NEW: Alertes Grade A
    "grade_a_realtime_user": True,  # email aux abonnés dès qu'un grade A est sauvegardé
    "grade_a_30min_reminder": True,  # rappel 30 min avant le départ d'une course Grade A
    # NEW: Email provider switcher (resend|brevo) + fallback
    # `email_provider` : "resend" (défaut) ou "brevo" — provider primaire utilisé
    # `email_fallback_enabled` : si True, retombe sur l'autre provider quand le primaire échoue
    # `brevo_sender_email` / `brevo_sender_name` : expéditeur Brevo (doit être vérifié sur Brevo)
    "email_provider": "resend",
    "email_fallback_enabled": True,
    "brevo_sender_email": "noreply@turfex.fr",
    "brevo_sender_name": "TURFEX",
    # Payment providers : choix des moyens de paiement affichés sur le site
    # Valeurs possibles : ["chariow"], ["maketou"], ["chariow","maketou"], ["maketou","chariow"] (ordre = priorité d'affichage)
    "payment_providers": ["chariow", "maketou"],
}

SETTINGS_KEY = "notification_settings"

# Anti-spam IP lockout : (ip, scope, lockout_until_ts) déjà notifiés en mémoire.
# Reset au redémarrage = acceptable.
_notified_lockouts: set = set()


# ===== ENV / STATE =====
# Pas de cache module-level pour la clé Resend : en multi-worker (uvicorn --workers>1)
# le cache est inconsistent entre processus. On lit MongoDB à chaque envoi (~3ms overhead).
_runtime_api_key_loaded: bool = False  # kept for backward compat, no longer used


async def _load_runtime_secrets(db) -> Optional[str]:
    """Charge la clé Resend depuis MongoDB (collection app_secrets, _id='resend_api_key').

    Retourne la valeur trouvée (string non-vide) ou None.
    Pas de cache : appelé à chaque envoi pour garantir cohérence multi-worker.
    """
    if db is None:
        return None
    try:
        doc = await db.app_secrets.find_one({"_id": "resend_api_key"})
        if doc:
            val = (doc.get("value") or "").strip()
            return val if val else None
        return None
    except Exception as e:
        logger.warning(f"Failed to load runtime Resend API key: {e}")
        return None


async def _load_resend_sender_email(db) -> str:
    """Retourne le SENDER_EMAIL Resend actif (DB > .env > fallback Resend default).

    Permet à l'admin de modifier l'expéditeur Resend depuis l'UI sans redéployer.
    Stocké dans `app_secrets._id="resend_sender_email"`.
    """
    if db is not None:
        try:
            doc = await db.app_secrets.find_one({"_id": "resend_sender_email"})
            if doc:
                val = (doc.get("value") or "").strip()
                if val:
                    return val
        except Exception as e:
            logger.warning(f"Failed to load Resend sender email from DB: {e}")
    return (os.environ.get("SENDER_EMAIL") or "onboarding@resend.dev").strip() or "onboarding@resend.dev"


async def _load_brevo_api_key(db) -> Optional[str]:
    """Charge la clé Brevo depuis MongoDB (app_secrets, _id='brevo_api_key').

    Fallback : variable d'env `BREVO_API_KEY` si pas en DB.
    """
    if db is not None:
        try:
            doc = await db.app_secrets.find_one({"_id": "brevo_api_key"})
            if doc:
                val = (doc.get("value") or "").strip()
                if val:
                    return val
        except Exception as e:
            logger.warning(f"Failed to load Brevo API key from DB: {e}")
    env_val = (os.environ.get("BREVO_API_KEY") or "").strip()
    return env_val or None


def _invalidate_runtime_secrets_cache() -> None:
    """No-op kept for backward compatibility (no cache to invalidate)."""
    pass


def _env(api_key_override: Optional[str] = None) -> Dict[str, str]:
    """Retourne config Resend.

    Args:
        api_key_override: si fourni (depuis _load_runtime_secrets), prend priorité sur env var.
    """
    api_key_env = os.environ.get("RESEND_API_KEY", "").strip()
    api_key = api_key_override if api_key_override else api_key_env
    return {
        "api_key": api_key,
        "recipient": os.environ.get("ADMIN_NOTIFICATION_EMAIL", "").strip(),
        "sender": os.environ.get("SENDER_EMAIL", "onboarding@resend.dev").strip() or "onboarding@resend.dev",
    }


def email_enabled(api_key_override: Optional[str] = None) -> bool:
    """Retourne True si au moins un provider (Resend OU Brevo) est configuré.

    Cette fonction reste synchrone pour rétrocompatibilité — elle vérifie l'env.
    Le routing par provider se fait dans `_send_to` (qui lit settings + DB).
    """
    e = _env(api_key_override)
    if e["api_key"] and e["recipient"]:
        return True
    # Brevo fallback : si BREVO_API_KEY est en env ET un recipient existe
    brevo_env = (os.environ.get("BREVO_API_KEY") or "").strip()
    return bool(brevo_env and e["recipient"])


# ===== SETTINGS =====
async def get_settings(db) -> Dict[str, Any]:
    doc = await db.admin_config.find_one({"key": SETTINGS_KEY})
    settings = dict(DEFAULT_SETTINGS)
    if doc and isinstance(doc.get("value"), dict):
        # merge sur défaut pour éviter qu'une clé manquante casse
        for k, v in doc["value"].items():
            if k in DEFAULT_SETTINGS:
                settings[k] = v
    return settings


async def update_settings(db, patch: Dict[str, Any]) -> Dict[str, Any]:
    current = await get_settings(db)
    for k, v in (patch or {}).items():
        if k not in DEFAULT_SETTINGS:
            continue
        # type check souple
        default = DEFAULT_SETTINGS[k]
        if isinstance(default, bool):
            current[k] = bool(v)
        elif isinstance(default, (int, float)):
            try:
                value = float(v) if isinstance(default, float) else int(v)
                # Validation : seuils numériques jamais négatifs
                if value < 0:
                    value = 0
                current[k] = value
            except Exception:
                pass
        else:
            current[k] = v
    await db.admin_config.update_one(
        {"key": SETTINGS_KEY},
        {"$set": {
            "key": SETTINGS_KEY,
            "value": current,
            "updatedAt": datetime.now(timezone.utc).isoformat(),
        }},
        upsert=True,
    )
    return current


# ===== SENDER =====
async def _send(subject: str, html: str, db=None) -> Dict[str, Any]:
    """Envoi vers le destinataire admin avec switcher provider + fallback."""
    # Lit MongoDB à chaque envoi (cohérent multi-worker)
    api_key_override = await _load_runtime_secrets(db) if db is not None else None
    if not email_enabled(api_key_override):
        return {"ok": False, "error": "disabled"}
    env = _env(api_key_override)
    recipient = env["recipient"]
    if not recipient:
        return {"ok": False, "error": "no recipient"}
    return await _send_to(recipient, subject, html, db=db)


# ===== HTML BUILDERS =====
_BASE_STYLES = (
    "font-family: -apple-system, Segoe UI, Roboto, sans-serif; "
    "background:#f4f4f5; padding:24px;"
)
_HEADER = (
    "padding:20px 24px; "
    "background:linear-gradient(90deg,#ec4899,#facc15,#06b6d4); "
    "color:#111; font-weight:900; font-size:22px; letter-spacing:2px; "
    "border-bottom:2px solid #111; font-style:italic;"
)


def _wrap(title: str, inner_html: str, accent: str = "#ec4899") -> str:
    return f"""<!DOCTYPE html><html><body style="{_BASE_STYLES}">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="600" style="background:#ffffff; border:2px solid #111; border-radius:8px;">
<tr><td style="{_HEADER}">TURFEX · {title}</td></tr>
<tr><td style="padding:24px;">{inner_html}</td></tr>
</table>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="600" style="margin-top:14px;">
<tr><td style="background:#fef3c7; border:1px solid #f59e0b; border-radius:6px; padding:10px 14px; font-size:11px; color:#78350f; line-height:1.5;">
<b>📩 Tu trouves ce mail dans tes spams ?</b><br>
Pour ne plus rien manquer : ajoute <b>noreply@royal-turf777.com</b> à tes contacts (Gmail : « + Ajouter aux contacts » dans la fiche expéditeur), puis clique sur « <b>Pas spam</b> » sur ce message.
</td></tr>
</table>
<p style="text-align:center; color:#9ca3af; font-size:11px; margin-top:14px;">
TURFEX · Intelligence PMU · notification automatique<br>
<a href="https://royal-turf777.com" style="color:#9ca3af; text-decoration:none;">royal-turf777.com</a>
</p>
</body></html>"""


# ===== EXPORT HTML (avec image de fond brandée) =====
_EXPORT_BG_CACHE: Optional[str] = None
_EXPORT_QR_CACHE: Dict[str, str] = {}


def _get_export_bg_data_url() -> Optional[str]:
    """Charge et met en cache l'image de fond exportée en data URL base64.

    Retourne None si le fichier est absent (l'export reste fonctionnel sans fond).
    """
    global _EXPORT_BG_CACHE
    if _EXPORT_BG_CACHE is not None:
        return _EXPORT_BG_CACHE or None
    try:
        import base64
        path = os.path.join(os.path.dirname(os.path.abspath(__file__)), "turfex_hero_export.jpg")
        if not os.path.exists(path):
            _EXPORT_BG_CACHE = ""
            return None
        with open(path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("ascii")
        _EXPORT_BG_CACHE = f"data:image/jpeg;base64,{b64}"
        return _EXPORT_BG_CACHE
    except Exception as e:
        logger.warning(f"Failed to load export background image: {e}")
        _EXPORT_BG_CACHE = ""
        return None


def _get_qr_svg(url: str) -> str:
    """Génère et met en cache un QR code SVG inline pointant vers `url`.

    Retourne une chaîne vide si la lib `qrcode` est indisponible (l'export reste
    fonctionnel sans QR code).
    """
    cached = _EXPORT_QR_CACHE.get(url)
    if cached is not None:
        return cached
    try:
        import io
        import qrcode
        from qrcode.image.svg import SvgPathImage
        qr = qrcode.QRCode(
            version=None,
            error_correction=qrcode.constants.ERROR_CORRECT_M,
            box_size=10,
            border=2,
        )
        qr.add_data(url)
        qr.make(fit=True)
        img = qr.make_image(image_factory=SvgPathImage)
        buf = io.BytesIO()
        img.save(buf)
        svg = buf.getvalue().decode("utf-8")
        # Strip XML declaration so SVG can be embedded inline cleanly
        if svg.startswith("<?xml"):
            svg = svg.split("?>", 1)[-1].lstrip()
        _EXPORT_QR_CACHE[url] = svg
        return svg
    except Exception as e:
        logger.warning(f"Failed to generate QR code: {e}")
        _EXPORT_QR_CACHE[url] = ""
        return ""


def _wrap_export(title: str, inner_html: str, light: bool = False) -> str:
    """Wrapper HTML pour les exports brandés avec image de fond plein écran.

    Les containers internes utilisent rgba(255,255,255,0.95) pour garantir la
    lisibilité des pronostics par-dessus l'image hero.

    Args:
        light: si True, omet l'image de fond inline base64 (~310 KB) pour produire
            un HTML léger (~80 KB) compatible avec les éditeurs Gmail/Outlook qui
            tronquent les emails > 102 KB.
    """
    bg = None if light else _get_export_bg_data_url()
    if bg:
        body_style = (
            "font-family: -apple-system, Segoe UI, Roboto, sans-serif; "
            "padding:24px; min-height:100vh; margin:0; "
            f"background-image: url('{bg}'); "
            "background-size: cover; background-position: center; "
            "background-attachment: fixed; background-repeat: no-repeat; "
            "background-color:#0f172a;"
        )
        overlay_style = (
            "background:rgba(0,0,0,0.35); padding:24px; min-height:100vh; "
            "box-sizing:border-box;"
        )
        footer_text_style = (
            "text-align:center; color:#f1f5f9; font-size:11px; margin-top:14px; "
            "text-shadow:0 1px 3px rgba(0,0,0,0.6);"
        )
        footer_link_color = "#f1f5f9"
    else:
        # Light mode (Gmail-friendly): solid pastel + container ombre douce
        body_style = (
            "font-family: -apple-system, Segoe UI, Roboto, sans-serif; "
            "background:#f4f4f5; padding:24px; margin:0;"
        )
        overlay_style = "padding:0; box-sizing:border-box;"
        footer_text_style = (
            "text-align:center; color:#9ca3af; font-size:11px; margin-top:14px;"
        )
        footer_link_color = "#9ca3af"

    container_style = (
        "background:#ffffff; border:2px solid #111; "
        "border-radius:10px; "
        "box-shadow:0 12px 40px rgba(0,0,0,0.18);"
    )
    inner_cell_style = (
        "padding:24px; background:#ffffff; border-radius:0 0 8px 8px;"
    )
    footer_note_style = (
        "background:#fef3c7; border:1px solid #f59e0b; "
        "border-radius:6px; padding:10px 14px; font-size:11px; color:#78350f; line-height:1.5;"
    )

    # QR code banner pointing to royal-turf777.com (top of export, just under header)
    qr_svg = _get_qr_svg("https://royal-turf777.com")
    qr_banner = ""
    if qr_svg:
        # Inject responsive style on the SVG so it fills the QR box
        qr_svg_styled = qr_svg.replace(
            "<svg",
            '<svg style="width:100%;height:100%;display:block;"',
            1,
        )
        qr_banner = (
            '<tr><td style="padding:14px 18px; background:#ffffff; '
            'border-bottom:1px solid #e5e7eb;">'
            '<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">'
            '<tr>'
            '<td style="width:96px; vertical-align:middle; padding-right:14px;">'
            '<div style="width:88px; height:88px; padding:6px; background:#ffffff; '
            'border:2px solid #111; border-radius:8px; box-sizing:border-box;">'
            f'{qr_svg_styled}'
            '</div></td>'
            '<td style="vertical-align:middle;">'
            '<div style="font-weight:900; font-size:14px; color:#111; '
            'letter-spacing:0.5px; margin-bottom:4px;">📲 Scanne pour t\'inscrire</div>'
            '<div style="font-size:12px; color:#374151; line-height:1.45;">'
            'Reçois nos pronostics quotidiens directement par email — '
            '<b>3 jours d\'essai gratuits</b> sur '
            '<a href="https://royal-turf777.com" style="color:#ec4899; '
            'text-decoration:none; font-weight:700;">royal-turf777.com</a>'
            '</div>'
            '</td></tr></table>'
            '</td></tr>'
        )

    return f"""<!DOCTYPE html>
<html lang="fr"><head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>TURFEX · {title}</title>
</head>
<body style="{body_style}">
<div style="{overlay_style}">
<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="600" style="{container_style}">
<tr><td style="{_HEADER}">TURFEX · {title}</td></tr>
{qr_banner}
<tr><td style="{inner_cell_style}">{inner_html}</td></tr>
</table>
<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" width="600" style="margin-top:14px;">
<tr><td style="{footer_note_style}">
<b>📩 Document exporté depuis l'admin TURFEX</b><br>
Pronostics du jour pour la R1 — partage interne ou archivage.
</td></tr>
</table>
<p style="{footer_text_style}">
TURFEX · Intelligence PMU · export brandé<br>
<a href="https://royal-turf777.com" style="color:{footer_link_color}; text-decoration:none; font-weight:700;">royal-turf777.com</a>
</p>
</div>
</body></html>"""


def _table(rows: List[tuple]) -> str:
    out = ['<table role="presentation" cellspacing="0" cellpadding="8" border="0" width="100%" style="background:#f9fafb; border:1px solid #e5e7eb; border-radius:6px; font-size:13px; color:#111;">']
    for label, value in rows:
        out.append(
            f'<tr><td style="font-weight:bold; width:140px;">{label}</td>'
            f'<td style="font-family:ui-monospace, monospace; word-break:break-all;">{value}</td></tr>'
        )
    out.append("</table>")
    return "".join(out)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


# ===== TRIGGERS =====

async def on_admin_password_changed(db, ip: str, user_agent: str) -> Dict[str, Any]:
    s = await get_settings(db)
    if not s.get("admin_password_changed"):
        return {"ok": False, "error": "event disabled"}
    inner = (
        '<h2 style="margin:0 0 12px 0; font-size:18px; color:#111;">🔐 Mot de passe administrateur modifié</h2>'
        '<p style="margin:0 0 16px 0; color:#333; font-size:14px; line-height:1.5;">'
        "Le mot de passe de l'espace admin TURFEX vient d'être changé avec succès. "
        'Si ce n\'est pas toi, <b style="color:#dc2626;">change immédiatement le mot de passe</b> '
        "et vérifie les tentatives de connexion récentes dans le dashboard."
        "</p>"
        + _table([("Date (UTC)", _now_iso()), ("Adresse IP", ip), ("User-Agent", user_agent)])
    )
    return await _send("[TURFEX] Mot de passe admin modifié", _wrap("SÉCURITÉ ADMIN", inner), db=db)


async def on_ip_locked(db, ip: str, scope: str, duration_secs: int, total_failed: int, lockout_level: int, lockout_until_ts: float) -> Dict[str, Any]:
    """Dédupe via (ip, scope, lockout_until_ts) en mémoire."""
    s = await get_settings(db)
    if not s.get("ip_locked"):
        return {"ok": False, "error": "event disabled"}
    key = (ip, scope, int(lockout_until_ts))
    if key in _notified_lockouts:
        return {"ok": False, "error": "already notified"}
    _notified_lockouts.add(key)
    # Limite la taille du set en mémoire
    if len(_notified_lockouts) > 500:
        _notified_lockouts.clear()
        _notified_lockouts.add(key)

    from datetime import timedelta as _td
    mins = duration_secs // 60
    dur_str = f"{mins} min" if mins < 60 else f"{mins // 60}h{mins % 60:02d}"
    scope_fr = "Espace admin" if scope == "admin" else "Code utilisateur"
    inner = (
        '<h2 style="margin:0 0 12px 0; font-size:18px; color:#dc2626;">🚨 Tentative de brute-force détectée</h2>'
        f'<p style="margin:0 0 16px 0; color:#333; font-size:14px; line-height:1.5;">'
        f"L'IP <b>{ip}</b> a déclenché un verrouillage sur la route <b>{scope_fr}</b>. "
        f"Vérifie la section Sécurité du dashboard admin pour confirmer."
        f"</p>"
        + _table([
            ("Date (UTC)", _now_iso()),
            ("IP", ip),
            ("Scope", scope_fr),
            ("Verrouillée pour", dur_str),
            ("Niveau lockout", f"{lockout_level} (escalating)"),
            ("Échecs totaux", str(total_failed)),
        ])
    )
    return await _send(f"[TURFEX] 🚨 Brute-force — IP {ip} verrouillée ({dur_str})", _wrap("ALERTE SÉCURITÉ", inner), db=db)


async def on_code_activated(db, code: str, label: str, duration_days: Optional[int], expires_at: Optional[str]) -> Dict[str, Any]:
    s = await get_settings(db)
    if not s.get("code_activated"):
        return {"ok": False, "error": "event disabled"}
    inner = (
        '<h2 style="margin:0 0 12px 0; font-size:18px; color:#15803d;">🎟️ Code d\'accès activé</h2>'
        '<p style="margin:0 0 16px 0; color:#333; font-size:14px; line-height:1.5;">'
        "Un code d'accès TURFEX vient d'être utilisé pour la première fois. "
        "Son compteur d'expiration démarre maintenant."
        "</p>"
        + _table([
            ("Date activation (UTC)", _now_iso()),
            ("Code", code),
            ("Libellé", label or "—"),
            ("Durée", f"{duration_days} jours" if duration_days else "—"),
            ("Expire le", expires_at or "—"),
        ])
    )
    return await _send(f"[TURFEX] 🎟️ Code activé : {code}", _wrap("NOUVEAU UTILISATEUR", inner), db=db)


async def on_payment_received(db, amount: float, currency: str, buyer_email: str, tx_id: str, raw_payload: Any) -> Dict[str, Any]:
    s = await get_settings(db)
    if not s.get("payment_received"):
        return {"ok": False, "error": "event disabled"}
    inner = (
        '<h2 style="margin:0 0 12px 0; font-size:18px; color:#0284c7;">💳 Nouveau paiement reçu</h2>'
        '<p style="margin:0 0 16px 0; color:#333; font-size:14px; line-height:1.5;">'
        "Un paiement vient d'être enregistré via le webhook Chariow."
        "</p>"
        + _table([
            ("Date (UTC)", _now_iso()),
            ("Montant", f"{amount:.2f} {currency}"),
            ("Acheteur", buyer_email or "—"),
            ("Transaction", tx_id or "—"),
        ])
    )
    return await _send(f"[TURFEX] 💳 Paiement {amount:.2f} {currency}", _wrap("NOUVEAU PAIEMENT", inner), db=db)


async def on_bet_won(db, bet: Dict[str, Any]) -> Dict[str, Any]:
    s = await get_settings(db)
    if not s.get("bet_won"):
        return {"ok": False, "error": "event disabled"}
    threshold = float(s.get("bet_won_threshold") or 0)
    gain = float(bet.get("gainReel") or 0)
    if gain < threshold:
        return {"ok": False, "error": f"below threshold ({gain} < {threshold})"}
    mise = float(bet.get("mise") or 0)
    roi = ((gain - mise) / mise * 100.0) if mise else 0.0
    chevaux = "-".join(str(n) for n in (bet.get("chevaux") or []))
    inner = (
        '<h2 style="margin:0 0 12px 0; font-size:18px; color:#15803d;">💰 Pari gagnant !</h2>'
        f'<p style="margin:0 0 16px 0; color:#333; font-size:14px; line-height:1.5;">'
        f"Un pari vient de rapporter <b>{gain:.2f} €</b> (mise : {mise:.2f} €, ROI : <b>{roi:+.1f}%</b>)."
        "</p>"
        + _table([
            ("Date (UTC)", _now_iso()),
            ("Course", f"{bet.get('date', '')} {bet.get('reunion', '')}{bet.get('course', '')}"),
            ("Type pari", bet.get("typePari", "")),
            ("Chevaux", chevaux),
            ("Mise", f"{mise:.2f} €"),
            ("Gain", f"{gain:.2f} €"),
            ("ROI", f"{roi:+.1f}%"),
            ("Cote affichée", str(bet.get("coteAffichee") or "—")),
        ])
    )
    return await _send(f"[TURFEX] 💰 Pari gagné +{gain:.2f} €", _wrap("PARI GAGNANT", inner), db=db)


async def on_pronostic_grade_a(db, pronostic: Dict[str, Any]) -> Dict[str, Any]:
    s = await get_settings(db)
    if not s.get("pronostic_grade_a"):
        return {"ok": False, "error": "event disabled"}
    grade = (pronostic.get("grade") or "").upper()
    if grade != "A":
        return {"ok": False, "error": f"not grade A ({grade})"}
    course_info = pronostic.get("courseInfo") or f"{pronostic.get('reunion', '')}{pronostic.get('course', '')}"
    chevaux = "-".join(str(n) for n in (pronostic.get("classement") or [])[:5])
    inner = (
        '<h2 style="margin:0 0 12px 0; font-size:18px; color:#7c3aed;">🏆 Nouveau pronostic Grade A</h2>'
        '<p style="margin:0 0 16px 0; color:#333; font-size:14px; line-height:1.5;">'
        "Un pronostic de confiance maximale vient d'être enregistré — c'est le moment de miser."
        "</p>"
        + _table([
            ("Date (UTC)", _now_iso()),
            ("Course", course_info),
            ("Grade", "A — Très forte confiance"),
            ("Top 5 pronostiqué", chevaux or "—"),
        ])
    )
    return await _send(f"[TURFEX] 🏆 Grade A — {course_info}", _wrap("PRONOSTIC GRADE A", inner, accent="#7c3aed"), db=db)


# ===== DIGESTS =====

async def send_daily_digest(db) -> Dict[str, Any]:
    """Liste les codes expirés dans les dernières 24h."""
    s = await get_settings(db)
    if not s.get("codes_expired_daily") or not email_enabled():
        return {"ok": False, "error": "disabled"}
    now = datetime.now(timezone.utc)
    yesterday = now - timedelta(hours=24)
    yesterday_iso = yesterday.isoformat()
    now_iso = now.isoformat()

    # Codes avec expiresAt dans l'intervalle [yesterday, now]
    items = await db.access_codes.find({
        "expiresAt": {"$gte": yesterday_iso, "$lte": now_iso},
    }).sort("expiresAt", -1).to_list(100)

    if not items:
        return {"ok": False, "error": "no expired codes in last 24h"}

    rows = ""
    for c in items:
        rows += (
            f'<tr>'
            f'<td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; font-family:ui-monospace,monospace; font-weight:bold;">{c.get("code", "—")}</td>'
            f'<td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;">{c.get("label") or "—"}</td>'
            f'<td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; font-size:12px;">{c.get("expiresAt", "—")}</td>'
            f'<td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; text-align:center;">{c.get("usedCount", 0)}</td>'
            f'</tr>'
        )
    table = (
        '<table width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb; border-radius:6px; font-size:13px;">'
        '<tr style="background:#ec4899; color:white;">'
        '<th style="padding:8px; text-align:left;">Code</th>'
        '<th style="padding:8px; text-align:left;">Libellé</th>'
        '<th style="padding:8px; text-align:left;">Expiré le</th>'
        '<th style="padding:8px; text-align:center;">Usages</th>'
        '</tr>' + rows + '</table>'
    )
    inner = (
        f'<h2 style="margin:0 0 12px 0; font-size:18px; color:#111;">⏰ {len(items)} code(s) expiré(s) dans les 24 dernières heures</h2>'
        '<p style="margin:0 0 16px 0; color:#333; font-size:14px;">'
        "Pense à relancer les clients concernés ou à étendre leur code depuis le dashboard admin."
        "</p>"
        + table
    )
    return await _send(f"[TURFEX] ⏰ Digest quotidien — {len(items)} codes expirés", _wrap("DIGEST QUOTIDIEN", inner), db=db)


async def send_weekly_digest(db) -> Dict[str, Any]:
    """Stats de la semaine : paris, ROI, top 3."""
    s = await get_settings(db)
    if not s.get("weekly_digest") or not email_enabled():
        return {"ok": False, "error": "disabled"}

    now = datetime.now(timezone.utc)
    week_ago = now - timedelta(days=7)
    week_ago_iso = week_ago.isoformat()

    bets = await db.bets.find({"createdAt": {"$gte": week_ago_iso}}).to_list(1000)
    if not bets:
        return {"ok": False, "error": "no bets this week"}

    total_mise = sum(float(b.get("mise") or 0) for b in bets)
    total_gain = sum(float(b.get("gainReel") or 0) for b in bets if b.get("statut") == "gagne")
    wins = [b for b in bets if b.get("statut") == "gagne"]
    losses = [b for b in bets if b.get("statut") == "perdu"]
    pending = [b for b in bets if b.get("statut") == "en_attente"]
    net = total_gain - total_mise
    roi = (net / total_mise * 100.0) if total_mise else 0.0
    win_rate = (len(wins) / (len(wins) + len(losses)) * 100.0) if (wins or losses) else 0.0

    top3 = sorted(wins, key=lambda b: float(b.get("gainReel") or 0), reverse=True)[:3]
    top3_html = ""
    for i, b in enumerate(top3, 1):
        chevaux = "-".join(str(n) for n in (b.get("chevaux") or []))
        top3_html += (
            f'<tr><td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;">{i}.</td>'
            f'<td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; font-family:ui-monospace,monospace;">{b.get("typePari", "—")}</td>'
            f'<td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;">{chevaux}</td>'
            f'<td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; text-align:right; font-weight:bold; color:#15803d;">+{float(b.get("gainReel") or 0):.2f} €</td></tr>'
        )

    top3_table = (
        '<table width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb; border-radius:6px; font-size:13px;">'
        '<tr style="background:#facc15; color:#111;">'
        '<th style="padding:8px; text-align:left;">#</th>'
        '<th style="padding:8px; text-align:left;">Type</th>'
        '<th style="padding:8px; text-align:left;">Chevaux</th>'
        '<th style="padding:8px; text-align:right;">Gain</th>'
        '</tr>' + (top3_html or '<tr><td colspan="4" style="padding:12px; text-align:center; color:#9ca3af;">Aucun gain cette semaine</td></tr>') + '</table>'
    )

    roi_color = "#15803d" if roi >= 0 else "#dc2626"
    inner = (
        f'<h2 style="margin:0 0 12px 0; font-size:18px; color:#111;">📊 Bilan hebdomadaire ({week_ago.strftime("%d/%m")} → {now.strftime("%d/%m")})</h2>'
        + _table([
            ("Paris joués", str(len(bets))),
            ("Gagnés", f"{len(wins)} ({win_rate:.1f}%)"),
            ("Perdus", str(len(losses))),
            ("En attente", str(len(pending))),
            ("Total misé", f"{total_mise:.2f} €"),
            ("Total gagné", f"{total_gain:.2f} €"),
            ("Résultat net", f'<span style="color:{roi_color}; font-weight:bold;">{net:+.2f} €</span>'),
            ("ROI", f'<span style="color:{roi_color}; font-weight:bold;">{roi:+.1f}%</span>'),
        ])
        + '<h3 style="margin:24px 0 8px 0; font-size:15px;">🏆 Top 3 gains de la semaine</h3>'
        + top3_table
    )
    return await _send(f"[TURFEX] 📊 Bilan hebdo · ROI {roi:+.1f}%", _wrap("BILAN HEBDOMADAIRE", inner), db=db)


async def send_config_test(db=None, label: str = "Test") -> Dict[str, Any]:
    """Email de test minimal.

    Important : `db` doit être passé pour que la clé Resend stockée en MongoDB
    (override .env) soit prise en compte. Sans ce paramètre, on retombe sur la
    clé du .env qui peut être périmée → erreur "API key is invalid".
    """
    inner = (
        '<h2 style="color:#ec4899;">✅ Test TURFEX Resend</h2>'
        '<p>Si tu reçois cet email, l\'intégration notification admin fonctionne.</p>'
        f'<p style="font-size:12px;color:#6b7280;">Label: {label} · Date: {_now_iso()}</p>'
    )
    return await _send("[TURFEX] Test de notification email", _wrap("TEST CONFIG", inner), db=db)


# ===== DIGEST RUNS (audit trail) =====

async def log_digest_run(db, job_name: str, result: Dict[str, Any], trigger: str = "cron") -> None:
    """Enregistre une exécution de digest dans digest_runs pour audit.

    trigger: 'cron' | 'manual' | 'startup_catchup' | 'external_cron'
    """
    try:
        doc = {
            "id": str(uuid.uuid4()),
            "jobName": job_name,
            "trigger": trigger,
            "ok": bool(result.get("ok", False)),
            "sent": int(result.get("sent", 0) or 0),
            "eligible": int(result.get("eligible", 0) or 0) if "eligible" in result else None,
            "recipientsCount": int(result.get("recipients_count", 0) or 0) if "recipients_count" in result else None,
            "error": result.get("error"),
            "date": result.get("date"),
            "hippodrome": result.get("hippodrome"),
            "coursesCount": len(result.get("courses", []) or []),
            "runAt": datetime.now(timezone.utc).isoformat(),
        }
        await db.digest_runs.insert_one(doc)
    except Exception as e:
        logger.warning(f"log_digest_run failed: {e}")


async def get_last_digest_run(db, job_name: str) -> Optional[Dict[str, Any]]:
    """Retourne le dernier run réussi d'un job (ou None)."""
    doc = await db.digest_runs.find_one(
        {"jobName": job_name, "ok": True},
        sort=[("runAt", -1)],
    )
    if doc:
        doc.pop("_id", None)
    return doc


async def should_run_catchup(db, job_name: str, cron_hour_paris: int) -> bool:
    """Retourne True si le job aurait dû tourner aujourd'hui (passé l'heure cron Paris)
    mais n'a pas encore de run réussi pour aujourd'hui."""
    try:
        from zoneinfo import ZoneInfo
        now_paris = datetime.now(ZoneInfo("Europe/Paris"))
    except Exception:
        now_paris = datetime.utcnow() + timedelta(hours=1)

    # Si l'heure cron n'est pas encore passée aujourd'hui → pas de catch-up
    if now_paris.hour < cron_hour_paris:
        return False

    today_paris = now_paris.strftime("%Y-%m-%d")

    # Cherche un run réussi aujourd'hui pour ce job
    async for r in db.digest_runs.find({
        "jobName": job_name,
        "ok": True,
    }).sort("runAt", -1).limit(5):
        run_at = r.get("runAt", "")
        try:
            rat = datetime.fromisoformat(run_at.replace("Z", "+00:00"))
            rat_paris = rat.astimezone(ZoneInfo("Europe/Paris"))
            if rat_paris.strftime("%Y-%m-%d") == today_paris:
                return False  # Déjà tourné aujourd'hui
        except Exception:
            continue

    return True


# ===== TRIAL FOLLOWUP (J+2) =====

def _build_followup_html(
    promo_code: str,
    discount_label: str,
    trial_used_at: str,
    payment_url: str = "https://ygsftwvy.mychariow.shop/checkout/prd_dh34ze",
) -> str:
    """Email de relance pour trial expiré : rappel + offre + code promo.

    payment_url : lien direct du checkout Chariow utilisé par le CTA
    "🚀 Activer mon abonnement TURFEX". Configurable via les settings admin.
    """
    safe_url = (payment_url or "").strip() or "https://ygsftwvy.mychariow.shop/checkout/prd_dh34ze"
    inner = (
        '<h2 style="margin:0 0 12px 0; font-size:20px; color:#111;">🎯 Tu as testé TURFEX — voici ton offre</h2>'
        '<p style="margin:0 0 16px 0; color:#444; font-size:14px; line-height:1.6;">'
        "Il y a deux jours, on t'a envoyé notre <b>top 8 R1</b> avec analyse complète : "
        "forme récente, cote, fraîcheur, expérience piste, driver et stats entraineurs. "
        "Tu as pu juger de la qualité de nos pronostics."
        '</p>'
        '<p style="margin:0 0 16px 0; color:#444; font-size:14px; line-height:1.6;">'
        "Pour continuer à recevoir nos pronostics <b>chaque matin à 08h00</b> et débloquer aussi le dashboard "
        "complet (analyse temps réel des 8 réunions du jour, value bets, prepared hits, tracker de paris, "
        "stats ROI et notifications push), <b>abonne-toi maintenant</b>."
        '</p>'
        '<div style="margin:24px 0; padding:20px; background:linear-gradient(135deg,#fef3c7,#fef9c3); border:2px solid #facc15; border-radius:10px; text-align:center;">'
        f'<p style="margin:0 0 8px 0; font-size:14px; color:#713f12;">🎁 <b>Offre de bienvenue</b></p>'
        f'<div style="font-size:24px; font-weight:900; color:#111; letter-spacing:2px; font-family:ui-monospace,monospace; padding:8px 16px; background:white; border:2px dashed #ca8a04; border-radius:6px; display:inline-block; margin:4px 0;">{promo_code}</div>'
        f'<p style="margin:8px 0 0 0; font-size:13px; color:#713f12;">Utilise ce code pour {discount_label} sur ton abonnement</p>'
        '</div>'
        '<table role="presentation" align="center" style="margin:8px auto;"><tr><td>'
        f'<a href="{safe_url}" style="display:inline-block; padding:14px 32px; background:#ec4899; color:white; font-weight:bold; font-size:15px; text-decoration:none; border-radius:8px; border:2px solid #111;">'
        '🚀 Activer mon abonnement TURFEX'
        '</a>'
        '</td></tr></table>'
        '<p style="margin:24px 0 8px 0; font-size:13px; color:#6b7280;"><b>Ce que tu obtiens :</b></p>'
        '<ul style="margin:0; padding-left:20px; color:#444; font-size:13px; line-height:1.8;">'
        '<li>📧 Pronostics R1 quotidiens à 08h00 avec top 8 + entraineurs</li>'
        '<li>📊 Dashboard live avec les 8 réunions du jour</li>'
        '<li>💰 Value Bets et Prepared Hits algo</li>'
        '<li>📈 Tracker de paris + stats ROI</li>'
        '<li>🔔 Notifications push pour les arrivées</li>'
        '</ul>'
        f'<p style="margin:24px 0 0 0; font-size:11px; color:#9ca3af; font-style:italic;">'
        f'Tu as reçu ton pronostic test le {trial_used_at[:10] if trial_used_at else "—"}. '
        "Si tu ne souhaites plus recevoir nos messages, ignore simplement cet email — c'est notre dernier de cette série."
        '</p>'
    )
    return _wrap("OFFRE ABONNEMENT", inner)


async def send_trial_followup(db, force_all_used: bool = False) -> Dict[str, Any]:
    """Relance les trials qui ont reçu leur pronostic il y a ~2 jours.

    Cible : trials avec trialUsed=true, active=true, followupSent=false,
    et trialUsedAt entre J-3 et J-1 (fenêtre de 24h centrée sur J-2).

    Args:
        db: MongoDB async client
        force_all_used: si True, ignore la fenêtre temporelle (utile pour tests/manual)

    Returns:
        {ok, sent, eligible, errors}
    """
    s = await get_settings(db)
    if not s.get("trial_followup"):
        return {"ok": False, "error": "event disabled"}
    if not email_enabled():
        return {"ok": False, "error": "resend disabled"}

    promo_code = s.get("trial_followup_promo_code", "TURFEX5") or "TURFEX5"
    discount_label = s.get("trial_followup_discount_label", "5 € de réduction") or "5 € de réduction"
    payment_url = s.get("subscription_payment_url") or "https://ygsftwvy.mychariow.shop/checkout/prd_dh34ze"

    now = datetime.now(timezone.utc)

    query = {
        "active": True,
        "trialUsed": True,
        "$or": [
            {"followupSent": {"$exists": False}},
            {"followupSent": False},
        ],
    }

    if not force_all_used:
        # Fenêtre J-3 à J-1 (utilisé entre 24h et 72h)
        upper = (now - timedelta(days=1)).isoformat()
        lower = (now - timedelta(days=3)).isoformat()
        query["trialUsedAt"] = {"$gte": lower, "$lte": upper}

    eligible: List[Dict[str, Any]] = []
    async for t in db.visitor_trials.find(query):
        em = (t.get("email") or "").strip().lower()
        if _valid_email(em):
            t.pop("_id", None)
            eligible.append(t)

    if not eligible:
        return {"ok": False, "error": "no eligible trial in J-3..J-1 window", "eligible": 0}

    sent = 0
    errors = []
    subject = f"[TURFEX] 🎯 Ton offre {discount_label} — code {promo_code}"

    for idx, t in enumerate(eligible):
        html = _build_followup_html(promo_code, discount_label, t.get("trialUsedAt", ""), payment_url)
        result = await _send_to(t["email"], subject, html, db=db)
        if result.get("ok"):
            sent += 1
            try:
                await db.visitor_trials.update_one(
                    {"id": t["id"]},
                    {"$set": {
                        "followupSent": True,
                        "followupSentAt": now.isoformat(),
                    }},
                )
            except Exception as e:
                logger.warning(f"trial followup mark failed for {t['id']}: {e}")
        else:
            errors.append({"to": t["email"], "error": result.get("error")})
        if idx < len(eligible) - 1:
            await asyncio.sleep(0.6)  # throttle Resend

    return {
        "ok": sent > 0,
        "sent": sent,
        "eligible": len(eligible),
        "errors": errors[:5],
        "promoCode": promo_code,
    }


async def build_followup_html_only(db) -> Dict[str, Any]:
    """Génère l'HTML de l'email "OFFRE ABONNEMENT" sans envoi (export admin).

    Lit settings (promo, discount label, payment URL) et renvoie l'HTML brut tel
    qu'il serait envoyé par send_trial_followup. Utilisé par l'endpoint d'export
    /api/admin/notifications/digest/trial-followup/export.
    """
    s = await get_settings(db)
    promo_code = s.get("trial_followup_promo_code", "TURFEX5") or "TURFEX5"
    discount_label = s.get("trial_followup_discount_label", "5 € de réduction") or "5 € de réduction"
    payment_url = s.get("subscription_payment_url") or "https://ygsftwvy.mychariow.shop/checkout/prd_dh34ze"
    # trial_used_at = aujourd'hui (l'export n'est pas tied à un visiteur précis)
    trial_used_at = datetime.now(timezone.utc).isoformat()
    html = _build_followup_html(promo_code, discount_label, trial_used_at, payment_url)
    return {
        "ok": True,
        "html": html,
        "promoCode": promo_code,
        "discountLabel": discount_label,
        "paymentUrl": payment_url,
    }



# ===== SUBSCRIBER EMAILS (R1 daily pronostics) =====

def _valid_email(e: str) -> bool:
    if not e or "@" not in e or " " in e:
        return False
    local, _, domain = e.partition("@")
    return bool(local) and "." in domain


async def get_active_subscribers(db, include_trials_for_today: bool = True) -> List[Dict[str, Any]]:
    """Retourne la liste dédupée des destinataires actifs pour le digest pronostics R1.

    Sources :
     - access_codes où active=true, non expiré, email non vide → source='code'
     - email_subscribers où active=true → source='manual'
     - visitor_trials où active=true, trialUsed=false, trialDate<=today → source='trial'
       (les trials reçoivent UN SEUL email puis sont marqués trialUsed=true par le caller)

    Returns:
        List of dicts: [{email, source, trial_id?}]. Email dédupé en priorité 'code' > 'manual' > 'trial'.
    """
    now = datetime.now(timezone.utc)

    def _is_expired(exp_str: str) -> bool:
        if not exp_str:
            return False
        try:
            s = exp_str.replace("Z", "+00:00")
            dt = datetime.fromisoformat(s)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt < now
        except Exception:
            return False

    by_email: Dict[str, Dict[str, Any]] = {}

    # 1) Codes avec email (priorité haute)
    async for c in db.access_codes.find({
        "active": True,
        "email": {"$exists": True, "$ne": ""},
    }):
        if _is_expired(c.get("expiresAt") or ""):
            continue
        em = (c.get("email") or "").strip().lower()
        if _valid_email(em):
            by_email[em] = {"email": em, "source": "code"}

    # 2) Subscribers manuels
    async for s in db.email_subscribers.find({"active": True}):
        em = (s.get("email") or "").strip().lower()
        if _valid_email(em) and em not in by_email:
            by_email[em] = {"email": em, "source": "manual"}

    # 3) Trials visiteurs — trialDate <= today (jour de test atteint), trialUsed=false, active=true
    if include_trials_for_today:
        # On compare la date au format YYYY-MM-DD (Europe/Paris pour cohérence avec l'envoi 8h Paris)
        try:
            from zoneinfo import ZoneInfo
            today_paris = datetime.now(ZoneInfo("Europe/Paris")).strftime("%Y-%m-%d")
        except Exception:
            today_paris = (datetime.utcnow() + timedelta(hours=1)).strftime("%Y-%m-%d")

        async for t in db.visitor_trials.find({
            "active": True,
            "trialUsed": False,
            "trialDate": {"$lte": today_paris},
        }):
            em = (t.get("email") or "").strip().lower()
            if _valid_email(em) and em not in by_email:
                by_email[em] = {"email": em, "source": "trial", "trial_id": t.get("id")}

    return sorted(by_email.values(), key=lambda x: x["email"])


async def _send_via_resend(recipient: str, subject: str, html: str, api_key: str, sender: str) -> Dict[str, Any]:
    """Envoi via API Resend. Retry 429 avec backoff exponentiel (1s, 2s)."""
    resend.api_key = api_key
    params = {"from": sender, "to": [recipient], "subject": subject, "html": html}
    last_err: Optional[str] = None
    for attempt in range(3):
        try:
            result = await asyncio.to_thread(resend.Emails.send, params)
            email_id = result.get("id") if isinstance(result, dict) else None
            return {"ok": True, "id": email_id, "provider": "resend"}
        except Exception as e:
            err_str = str(e)
            last_err = err_str
            is_rate_limit = (
                "429" in err_str
                or "rate limit" in err_str.lower()
                or "too many requests" in err_str.lower()
            )
            if is_rate_limit and attempt < 2:
                wait = 2 ** attempt
                logger.warning(f"Resend rate-limit on {recipient} (attempt {attempt+1}/3) — retry in {wait}s")
                await asyncio.sleep(wait)
                continue
            return {"ok": False, "error": err_str, "provider": "resend"}
    return {"ok": False, "error": last_err or "unknown", "provider": "resend"}


async def _send_via_brevo(
    recipient: str,
    subject: str,
    html: str,
    api_key: str,
    sender_email: str,
    sender_name: str,
) -> Dict[str, Any]:
    """Envoi via API Brevo (https://api.brevo.com/v3/smtp/email).

    Retry 429 avec backoff exponentiel.
    """
    payload = {
        "sender": {"email": sender_email, "name": sender_name or "TURFEX"},
        "to": [{"email": recipient}],
        "subject": subject,
        "htmlContent": html,
    }
    headers = {"api-key": api_key, "Content-Type": "application/json", "Accept": "application/json"}
    last_err: Optional[str] = None
    for attempt in range(3):
        try:
            async with httpx.AsyncClient(timeout=20) as client:
                r = await client.post("https://api.brevo.com/v3/smtp/email", headers=headers, json=payload)
            if r.status_code in (200, 201):
                data = r.json() if r.text else {}
                return {"ok": True, "id": data.get("messageId"), "provider": "brevo"}
            # Try to extract error message
            try:
                err_body = r.json()
                err_msg = err_body.get("message") or err_body.get("code") or r.text[:200]
            except Exception:
                err_msg = r.text[:200] or f"HTTP {r.status_code}"
            last_err = f"[{r.status_code}] {err_msg}"
            if r.status_code == 429 and attempt < 2:
                wait = 2 ** attempt
                logger.warning(f"Brevo rate-limit on {recipient} (attempt {attempt+1}/3) — retry in {wait}s")
                await asyncio.sleep(wait)
                continue
            return {"ok": False, "error": last_err, "provider": "brevo"}
        except Exception as e:
            last_err = str(e)
            if attempt < 2:
                await asyncio.sleep(2 ** attempt)
                continue
            return {"ok": False, "error": last_err, "provider": "brevo"}
    return {"ok": False, "error": last_err or "unknown", "provider": "brevo"}


async def _send_to(recipient: str, subject: str, html: str, db=None) -> Dict[str, Any]:
    """Envoie un email à `recipient` via le provider configuré (resend|brevo).

    Logique :
      1. Lit `email_provider` dans settings (défaut "resend")
      2. Tente l'envoi avec le provider primaire
      3. Si échec ET `email_fallback_enabled=True` → bascule sur l'autre provider
      4. Log du résultat dans email_log avec le provider utilisé
    """
    # Charge settings + clés
    settings = await get_settings(db) if db is not None else dict(DEFAULT_SETTINGS)
    primary = (settings.get("email_provider") or "resend").lower()
    fallback_enabled = bool(settings.get("email_fallback_enabled", True))

    resend_key = await _load_runtime_secrets(db) if db is not None else None
    if not resend_key:
        resend_key = (os.environ.get("RESEND_API_KEY") or "").strip() or None
    brevo_key = await _load_brevo_api_key(db)

    resend_sender = await _load_resend_sender_email(db) if db is not None else (os.environ.get("SENDER_EMAIL") or "onboarding@resend.dev").strip()
    brevo_sender = settings.get("brevo_sender_email") or "noreply@turfex.fr"
    brevo_name = settings.get("brevo_sender_name") or "TURFEX"

    async def try_resend() -> Dict[str, Any]:
        if not resend_key:
            return {"ok": False, "error": "resend api key missing", "provider": "resend"}
        return await _send_via_resend(recipient, subject, html, resend_key, resend_sender)

    async def try_brevo() -> Dict[str, Any]:
        if not brevo_key:
            return {"ok": False, "error": "brevo api key missing", "provider": "brevo"}
        return await _send_via_brevo(recipient, subject, html, brevo_key, brevo_sender, brevo_name)

    # 1) Provider primaire
    if primary == "brevo":
        result = await try_brevo()
        secondary_fn = try_resend
        secondary_name = "resend"
    else:
        result = await try_resend()
        secondary_fn = try_brevo
        secondary_name = "brevo"

    # 2) Fallback si échec
    if not result.get("ok") and fallback_enabled:
        primary_err = result.get("error") or "unknown"
        primary_provider = result.get("provider") or primary
        logger.warning(
            f"Primary provider '{primary_provider}' failed for {recipient}: {primary_err} → fallback to '{secondary_name}'"
        )
        fb_result = await secondary_fn()
        if fb_result.get("ok"):
            fb_result["fallback_from"] = primary_provider
            result = fb_result
        else:
            # Les deux ont échoué — on garde l'erreur la plus parlante
            result = {
                "ok": False,
                "error": f"primary={primary_err} | fallback={fb_result.get('error')}",
                "provider": f"{primary_provider}+{secondary_name}",
            }

    # 3) Audit log
    if db is not None:
        if result.get("ok"):
            await _log_email(
                db, recipient, subject, "ok",
                email_id=result.get("id"),
                provider=result.get("provider"),
                fallback_from=result.get("fallback_from"),
            )
        else:
            await _log_email(
                db, recipient, subject, "failed",
                error=result.get("error"),
                provider=result.get("provider"),
            )
    if not result.get("ok"):
        result["recipient"] = recipient
    return result


async def _log_email(
    db,
    recipient: str,
    subject: str,
    status: str,
    email_id: Optional[str] = None,
    error: Optional[str] = None,
    provider: Optional[str] = None,
    fallback_from: Optional[str] = None,
) -> None:
    """Audit trail des envois email : collection email_log."""
    try:
        await db.email_log.insert_one({
            "id": str(uuid.uuid4()),
            "recipient": recipient,
            "subject": subject,
            "status": status,  # ok | failed | bcc_fallback | bcc_failed
            "emailId": email_id,
            "error": error,
            "provider": provider,  # resend | brevo | resend+brevo (les deux ont échoué)
            "fallbackFrom": fallback_from,  # provider primaire qui a échoué (si fallback déclenché)
            "sentAt": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.warning(f"_log_email failed: {e}")


def _build_course_block(course: Dict[str, Any], favoris: List[Dict[str, Any]], outsiders: List[Dict[str, Any]], entraineurs: Optional[List[Dict[str, Any]]] = None) -> str:
    """Construit le bloc HTML d'une course avec 4 FAVORIS + 4 OUTSIDERS + entraineurs.

    Note: les détails techniques (scores, grades, méthodes) ne sont PAS exposés à l'utilisateur final.
    On affiche uniquement : numéro, cheval, driver/entraineur, cote.
    """
    c_num = course.get("numero") or course.get("course") or "?"
    c_lib = course.get("libelle") or course.get("nomPrix") or ""
    c_disc = course.get("discipline") or ""
    c_dist = course.get("distance") or ""
    c_heure = course.get("heureDepart")
    try:
        if c_heure:
            from datetime import datetime as _dt
            h = _dt.utcfromtimestamp(int(c_heure) / 1000).strftime("%Hh%M")
        else:
            h = ""
    except Exception:
        h = ""

    header_right = " · ".join(x for x in [h, c_disc, f"{c_dist}m" if c_dist else ""] if x)

    def _section(title: str, accent: str, sub: str, list_horses: List[Dict[str, Any]]) -> str:
        rows = ""
        for i, cheval in enumerate(list_horses, 1):
            cote = cheval.get("cote")
            cote_str = f"{cote:.1f}" if isinstance(cote, (int, float)) else "—"
            entra = cheval.get("entraineur") or ""
            driver_line = cheval.get("driver", "") or ""
            if entra:
                driver_line = f"{driver_line}<br><span style=\"font-size:10px; color:#9ca3af;\">Ent. {entra}</span>" if driver_line else f"Ent. {entra}"
            rows += (
                '<tr>'
                f'<td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; font-weight:bold; width:30px; text-align:center; color:{accent};">{i}</td>'
                f'<td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; font-family:ui-monospace,monospace; font-weight:bold; width:34px; text-align:center; background:#fef3c7;">{cheval.get("numPmu", "")}</td>'
                f'<td style="padding:6px 8px; border-bottom:1px solid #e5e7eb;"><b>{cheval.get("nom", "")}</b><br><span style="font-size:11px; color:#6b7280;">{driver_line}</span></td>'
                f'<td style="padding:6px 8px; border-bottom:1px solid #e5e7eb; font-family:ui-monospace,monospace; text-align:center; width:60px;"><b>{cote_str}</b></td>'
                '</tr>'
            )
        empty_row = '<tr><td colspan="4" style="padding:12px; text-align:center; color:#9ca3af;">— pas de candidat dans cette catégorie —</td></tr>'
        return (
            f'<div style="margin-top:12px;">'
            f'<div style="display:flex; align-items:center; gap:8px; margin-bottom:6px;">'
            f'<div style="width:4px; height:18px; background:{accent}; border-radius:2px;"></div>'
            f'<div style="font-weight:900; font-size:13px; color:{accent}; letter-spacing:1px;">{title}</div>'
            f'<div style="font-size:11px; color:#9ca3af;">— {sub}</div>'
            f'</div>'
            f'<table width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #e5e7eb; border-radius:6px; font-size:13px;">'
            '<tr style="background:#111; color:white;">'
            '<th style="padding:6px 8px; text-align:center; width:30px;">#</th>'
            '<th style="padding:6px 8px; text-align:center; width:34px;">N°</th>'
            '<th style="padding:6px 8px; text-align:left;">Cheval · Driver · Entraineur</th>'
            '<th style="padding:6px 8px; text-align:center; width:60px;">Cote</th>'
            '</tr>' + (rows or empty_row) + '</table>'
            '</div>'
        )

    favoris_section = _section("FAVORIS", "#15803d", "à privilégier en base", favoris)
    outsiders_section = _section("OUTSIDERS", "#ea580c", "value à surveiller", outsiders)

    # Section Entraineurs à suivre (inchangée)
    trainers_html = ""
    if entraineurs:
        t_rows = ""
        for j, t in enumerate(entraineurs, 1):
            chevaux_list = ", ".join(t.get("chevauxNoms", [])[:3])
            if len(t.get("chevauxNoms", [])) > 3:
                chevaux_list += f" +{len(t['chevauxNoms']) - 3}"
            best = t.get("bestPlace")
            best_str = f"<b>{best}e</b>" if best else "—"
            t_rows += (
                '<tr>'
                f'<td style="padding:5px 8px; border-bottom:1px solid #fde68a; font-weight:bold; width:25px; text-align:center;">{j}</td>'
                f'<td style="padding:5px 8px; border-bottom:1px solid #fde68a;"><b>{t.get("entraineur", "")}</b></td>'
                f'<td style="padding:5px 8px; border-bottom:1px solid #fde68a; text-align:center; width:70px;">{t.get("chevaux", 0)} <span style="color:#6b7280; font-size:11px;">présent{"s" if t.get("chevaux", 0) > 1 else ""}</span></td>'
                f'<td style="padding:5px 8px; border-bottom:1px solid #fde68a; text-align:center; width:90px;"><b style="color:#15803d;">{t.get("podiums", 0)}</b> / {t.get("nbCourses3derniers", 0)}</td>'
                f'<td style="padding:5px 8px; border-bottom:1px solid #fde68a; text-align:center; width:60px;">{best_str}</td>'
                f'<td style="padding:5px 8px; border-bottom:1px solid #fde68a; font-size:11px; color:#6b7280;">{chevaux_list}</td>'
                f'</tr>'
            )
        trainers_html = (
            '<div style="margin-top:14px;">'
            '<div style="font-weight:bold; font-size:12px; color:#111; margin-bottom:4px; letter-spacing:0.5px;">📊 STATS ENTRAINEURS (sur 3 dernières courses des partants)</div>'
            '<table width="100%" cellspacing="0" cellpadding="0" style="border:1px solid #fde68a; border-radius:6px; font-size:12px; background:#fffbeb;">'
            '<tr style="background:#facc15; color:#111;">'
            '<th style="padding:6px 8px; text-align:center; width:25px;">#</th>'
            '<th style="padding:6px 8px; text-align:left;">Entraineur</th>'
            '<th style="padding:6px 8px; text-align:center; width:70px;">Chevaux</th>'
            '<th style="padding:6px 8px; text-align:center; width:90px;">Podiums</th>'
            '<th style="padding:6px 8px; text-align:center; width:60px;">Best</th>'
            '<th style="padding:6px 8px; text-align:left;">Partants ici</th>'
            '</tr>' + (t_rows or '<tr><td colspan="6" style="padding:8px; text-align:center; color:#9ca3af;">Aucun entraineur identifié</td></tr>') + '</table>'
            '</div>'
        )

    return (
        f'<div style="margin:24px 0; padding:16px; background:#fafaf9; border:2px solid #111; border-radius:8px;">'
        f'<div style="display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:6px;">'
        f'<h3 style="margin:0; font-size:16px; color:#111;">🏇 C{c_num} — {c_lib}</h3>'
        f'<span style="font-size:12px; color:#6b7280; font-family:ui-monospace,monospace;">{header_right}</span>'
        f'</div>'
        f'{favoris_section}'
        f'{outsiders_section}'
        f'{trainers_html}'
        f'</div>'
    )


async def build_r1_html_only(db, fetch_course_data, light: bool = False) -> Dict[str, Any]:
    """Génère uniquement le HTML du digest R1 du jour (sans envoi email).

    Utile pour le bouton "Exporter R1 quotidiens en HTML" dans /admin.

    Args:
        light: si True, omet l'image de fond inline base64 pour produire un HTML
            léger (~80 KB) compatible Gmail (qui tronque les emails > 102 KB).

    Returns:
        {ok, html, hippodrome, reunion, date, courses_count, error?}
    """
    try:
        from zoneinfo import ZoneInfo
        now_fr = datetime.now(ZoneInfo("Europe/Paris"))
    except Exception:
        now_fr = datetime.utcnow() + timedelta(hours=1)
    date_str = now_fr.strftime("%d%m%Y")

    from turf_analytics import compute_top8_bases_outsiders, compute_entraineur_stats

    try:
        prog = await fetch_course_data("programme", date_str)
    except Exception as e:
        return {"ok": False, "error": f"programme fetch failed: {e}"}

    reunions = (prog or {}).get("reunions") or []
    r1 = None
    for r in reunions:
        if r.get("reunion", "").upper() == "R1":
            r1 = r
            break
    if not r1:
        return {"ok": False, "error": f"R1 introuvable pour {date_str}"}

    courses = r1.get("courses", [])
    if not courses:
        return {"ok": False, "error": "R1 sans courses"}

    course_blocks = []
    courses_detail = []
    for c in courses:
        num = c.get("numero")
        if not num:
            continue
        course_key = f"C{num}"
        try:
            data = await fetch_course_data("scrape", date_str, "R1", course_key)
            data["courseInfo"] = {
                "hippodrome": r1.get("hippodrome", ""),
                "discipline": c.get("discipline") or "",
            }
            top8_split = compute_top8_bases_outsiders(data)
            favoris = top8_split.get("favoris", [])
            outsiders = top8_split.get("outsiders", [])
            entraineurs_stats = compute_entraineur_stats(data)
            courses_detail.append({
                "numero": num,
                "libelle": c.get("libelle", ""),
                "top8_count": len(favoris) + len(outsiders),
                "favoris_count": len(favoris),
                "outsiders_count": len(outsiders),
            })
            course_blocks.append(_build_course_block(c, favoris, outsiders, None if light else entraineurs_stats))
        except Exception as e:
            logger.warning(f"R1 C{num} failed: {e}")
            course_blocks.append(
                f'<div style="margin:16px 0; padding:12px; background:#fef2f2; border:1px solid #fecaca; border-radius:6px; color:#991b1b; font-size:13px;">'
                f'❌ C{num} : impossible de récupérer les données ({e})'
                '</div>'
            )

    if not course_blocks:
        return {"ok": False, "error": "aucune course exploitable"}

    intro = (
        f'<h2 style="margin:0 0 12px 0; font-size:20px; color:#111;">🏇 Pronostics TURFEX — R1 {r1.get("hippodrome", "")}</h2>'
        f'<p style="margin:0 0 16px 0; color:#555; font-size:14px;">'
        f"Voici la sélection TURFEX du jour pour la R1 du <b>{now_fr.strftime('%d/%m/%Y')}</b>. "
        f"{len(courses_detail)} course(s) analysée(s) avec, pour chaque course, "
        '<b style="color:#15803d;">4 FAVORIS</b> à privilégier en base et '
        '<b style="color:#ea580c;">4 OUTSIDERS</b> à surveiller pour les rapports value.'
        '</p>'
    )
    legend = (
        '<div style="margin:16px 0; padding:12px; background:#f3f4f6; border-radius:6px; font-size:12px; color:#374151;">'
        '<b>Comment lire</b> : '
        '<span style="background:#15803d; color:white; padding:2px 8px; border-radius:10px; font-weight:bold;">FAVORIS</span> '
        "= chevaux solides à jouer en base · "
        '<span style="background:#ea580c; color:white; padding:2px 8px; border-radius:10px; font-weight:bold;">OUTSIDERS</span> '
        "= chevaux à valeur ajoutée pour booster les rapports."
        '</div>'
    )
    html = _wrap_export("PRONOSTICS R1", intro + legend + "\n".join(course_blocks), light=light)

    return {
        "ok": True,
        "html": html,
        "hippodrome": r1.get("hippodrome", ""),
        "reunion": r1.get("reunion", ""),
        "date": date_str,
        "courses_count": len(courses_detail),
        "courses": courses_detail,
    }


async def send_daily_r1_pronostics(db, fetch_course_data, target_email: Optional[str] = None) -> Dict[str, Any]:
    """Envoie le top 8 par course de R1 à tous les abonnés actifs.

    Args:
        db: MongoDB async client
        fetch_course_data: callable async(date, reunion, course) -> dict (depuis server.py)
        target_email: si fourni, envoie UNIQUEMENT à cet email (filtre recipients).
            Utile pour un renvoi ciblé "à 1 seul trial" depuis l'admin.

    Returns:
        {ok, sent, skipped, errors, courses, recipients}
    """
    s = await get_settings(db)
    if not s.get("daily_r1_pronostics"):
        return {"ok": False, "error": "event disabled"}
    if not email_enabled():
        return {"ok": False, "error": "resend disabled"}

    # Date du jour (Europe/Paris : le programme PMU change à la date locale FR)
    try:
        from zoneinfo import ZoneInfo
        now_fr = datetime.now(ZoneInfo("Europe/Paris"))
    except Exception:
        now_fr = datetime.utcnow() + timedelta(hours=1)
    date_str = now_fr.strftime("%d%m%Y")

    # Fetch programme via callback (évite import circulaire avec server.py)
    from turf_analytics import compute_top8_bases_outsiders, compute_entraineur_stats

    # Récupère programme du jour
    try:
        prog = await fetch_course_data("programme", date_str)
    except Exception as e:
        return {"ok": False, "error": f"programme fetch failed: {e}"}

    reunions = (prog or {}).get("reunions") or []
    r1 = None
    for r in reunions:
        if r.get("reunion", "").upper() == "R1":
            r1 = r
            break
    if not r1:
        return {"ok": False, "error": f"R1 introuvable pour {date_str}"}

    courses = r1.get("courses", [])
    if not courses:
        return {"ok": False, "error": "R1 sans courses"}

    # Calcule le top 8 pour chaque course
    course_blocks = []
    courses_detail = []
    for c in courses:
        num = c.get("numero")
        if not num:
            continue
        course_key = f"C{num}"
        try:
            data = await fetch_course_data("scrape", date_str, "R1", course_key)
            data["courseInfo"] = {
                "hippodrome": r1.get("hippodrome", ""),
                "discipline": c.get("discipline") or "",
            }
            top8_split = compute_top8_bases_outsiders(data)
            favoris = top8_split.get("favoris", [])
            outsiders = top8_split.get("outsiders", [])
            entraineurs_stats = compute_entraineur_stats(data)
            courses_detail.append({
                "numero": num,
                "libelle": c.get("libelle", ""),
                "top8_count": len(favoris) + len(outsiders),
                "favoris_count": len(favoris),
                "outsiders_count": len(outsiders),
                "entraineurs_count": len(entraineurs_stats),
            })
            course_blocks.append(_build_course_block(c, favoris, outsiders, entraineurs_stats))
        except Exception as e:
            logger.warning(f"R1 C{num} failed: {e}")
            course_blocks.append(
                f'<div style="margin:16px 0; padding:12px; background:#fef2f2; border:1px solid #fecaca; border-radius:6px; color:#991b1b; font-size:13px;">'
                f'❌ C{num} : impossible de récupérer les données ({e})'
                '</div>'
            )

    if not course_blocks:
        return {"ok": False, "error": "aucune course exploitable"}

    intro = (
        f'<h2 style="margin:0 0 12px 0; font-size:20px; color:#111;">🏇 Pronostics TURFEX — R1 {r1.get("hippodrome", "")}</h2>'
        f'<p style="margin:0 0 16px 0; color:#555; font-size:14px;">'
        f"Voici la sélection TURFEX du jour pour la R1 du <b>{now_fr.strftime('%d/%m/%Y')}</b>. "
        f"{len(courses_detail)} course(s) analysée(s) avec, pour chaque course, "
        '<b style="color:#15803d;">4 FAVORIS</b> à privilégier en base et '
        '<b style="color:#ea580c;">4 OUTSIDERS</b> à surveiller pour les rapports value.'
        '</p>'
    )
    legend = (
        '<div style="margin:16px 0; padding:12px; background:#f3f4f6; border-radius:6px; font-size:12px; color:#374151;">'
        '<b>Comment lire</b> : '
        '<span style="background:#15803d; color:white; padding:2px 8px; border-radius:10px; font-weight:bold;">FAVORIS</span> '
        "= chevaux solides à jouer en base · "
        '<span style="background:#ea580c; color:white; padding:2px 8px; border-radius:10px; font-weight:bold;">OUTSIDERS</span> '
        "= chevaux à valeur ajoutée pour booster les rapports."
        '</div>'
    )
    html = _wrap("PRONOSTICS R1", intro + legend + "\n".join(course_blocks))

    # Récupère destinataires (codes/subscribers/trials)
    recipients = await get_active_subscribers(db)
    if target_email:
        target_email_lc = target_email.lower().strip()
        recipients = [r for r in recipients if (r.get("email") or "").lower().strip() == target_email_lc]
        if not recipients:
            return {
                "ok": False,
                "error": f"target_email {target_email} not found in active subscribers",
                "sent": 0,
                "recipients_count": 0,
                "errors": [],
                "reunion": r1.get("reunion"),
                "hippodrome": r1.get("hippodrome", ""),
                "date": date_str,
            }
    if not recipients:
        return {"ok": False, "error": "aucun abonné actif avec email"}

    # Envoi individuel (Resend limite bcc et on veut des logs propres)
    # Throttle à ~2 req/s pour respecter la rate limit Resend (tier gratuit)
    sent = 0
    sent_trials = 0
    errors = []
    subject = f"[TURFEX] 🏇 Pronostics R1 {r1.get('hippodrome', '')} du {now_fr.strftime('%d/%m')}"
    for idx, r in enumerate(recipients):
        em = r["email"]
        # Pour les trials, on personnalise le footer
        if r.get("source") == "trial":
            trial_html = html.replace(
                "TURFEX · Intelligence PMU · notification automatique",
                'TURFEX · Intelligence PMU<br><b style="color:#ec4899;">🎁 Ceci est ton jour de test gratuit. '
                'Pour continuer à recevoir les pronostics quotidiens, abonne-toi sur turfex.app</b>'
            )
            result = await _send_to(em, subject + " (test gratuit)", trial_html, db=db)
        else:
            result = await _send_to(em, subject, html, db=db)

        if result.get("ok"):
            sent += 1
            # Marque le trial comme utilisé
            if r.get("source") == "trial" and r.get("trial_id"):
                try:
                    await db.visitor_trials.update_one(
                        {"id": r["trial_id"]},
                        {"$set": {
                            "trialUsed": True,
                            "trialUsedAt": datetime.now(timezone.utc).isoformat(),
                        }},
                    )
                    sent_trials += 1
                except Exception as e:
                    logger.warning(f"trial mark used failed for {r['trial_id']}: {e}")
        else:
            errors.append({"to": em, "error": result.get("error")})
        # Throttle 0.6s entre chaque envoi sauf le dernier
        if idx < len(recipients) - 1:
            await asyncio.sleep(0.6)

    return {
        "ok": sent > 0,
        "sent": sent,
        "sent_trials": sent_trials,
        "recipients_count": len(recipients),
        "errors": errors[:5],  # limite log
        "courses": courses_detail,
        "reunion": r1.get("reunion"),
        "hippodrome": r1.get("hippodrome"),
        "date": date_str,
    }


# ===== EXPORT FERRAN R1 — Top Couplés de toutes les courses =====

def _build_ferran_course_block(course: Dict[str, Any], analysis: Dict[str, Any]) -> str:
    """HTML block pour une course avec ses top couplés/tiercés Ferran.

    Utilise des couleurs sobres email-compatibles (pas de gradient Tailwind).
    """
    num = course.get("numCourse") or course.get("numOrdre") or "?"
    libelle = course.get("libelle") or ""
    heure = course.get("heureDepart")
    heure_str = ""
    if heure:
        try:
            hd = datetime.fromtimestamp(int(heure) / 1000) if isinstance(heure, (int, float)) else None
            if hd:
                heure_str = hd.strftime("%H:%M")
        except Exception:
            pass
    distance = course.get("distance")
    discipline = (course.get("discipline") or "").replace("_", " ").title()
    partants = analysis.get("totalPartants", 0)
    parity = (analysis.get("parity") or {}).get("dominant", "").upper()

    top_couples = analysis.get("topCouples") or []
    top_tierces = analysis.get("topTierces") or []
    kept = analysis.get("kept") or []

    couples_html = ""
    if top_couples:
        chips = []
        for cp in top_couples[:6]:
            nums = "-".join(str(n) for n in cp.get("couple", []))
            score = cp.get("score", "")
            chips.append(
                f'<span style="display:inline-block; background:#dcfce7; border:1px solid #22c55e; '
                f'color:#14532d; padding:5px 10px; margin:3px 3px 0 0; border-radius:4px; '
                f'font-weight:900; font-size:15px; font-variant-numeric:tabular-nums;">'
                f'{nums}<span style="color:#166534; font-weight:500; font-size:10px; '
                f'margin-left:5px;">({score})</span></span>'
            )
        couples_html = (
            '<div style="margin-top:10px;"><div style="font-size:11px; font-weight:700; '
            'color:#14532d; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">'
            '★ Top Couplés Ferran</div>' + "".join(chips) + '</div>'
        )

    tierces_html = ""
    if top_tierces:
        chips = []
        for t in top_tierces[:4]:
            nums = "-".join(str(n) for n in t.get("tierce", []))
            score = t.get("score", "")
            chips.append(
                f'<span style="display:inline-block; background:#dbeafe; border:1px solid #3b82f6; '
                f'color:#1e3a8a; padding:5px 10px; margin:3px 3px 0 0; border-radius:4px; '
                f'font-weight:900; font-size:15px; font-variant-numeric:tabular-nums;">'
                f'{nums}<span style="color:#1e40af; font-weight:500; font-size:10px; '
                f'margin-left:5px;">({score})</span></span>'
            )
        tierces_html = (
            '<div style="margin-top:8px;"><div style="font-size:11px; font-weight:700; '
            'color:#1e3a8a; text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">'
            '★★ Top Tiercés Ferran</div>' + "".join(chips) + '</div>'
        )

    kept_html = ""
    if kept:
        kept_nums = " · ".join(str(n) for n in kept)
        kept_html = (
            f'<div style="margin-top:8px; font-size:11px; color:#475569;">'
            f'<b>Conservés :</b> <span style="font-family:ui-monospace,monospace; '
            f'font-weight:700; color:#0f172a;">{kept_nums}</span></div>'
        )

    return f"""
<div style="background:#ffffff; border:2px solid #0f172a; border-radius:8px;
            padding:14px 16px; margin:12px 0;">
  <div style="display:flex; align-items:baseline; justify-content:space-between;
              border-bottom:1px solid #e2e8f0; padding-bottom:8px; margin-bottom:10px;">
    <div>
      <span style="background:#0f172a; color:#fde68a; padding:3px 8px; font-weight:900;
                   font-size:14px; border-radius:4px; letter-spacing:0.5px;">C{num}</span>
      <span style="font-weight:800; margin-left:8px; font-size:14px; color:#0f172a;
                   text-transform:uppercase;">{libelle}</span>
    </div>
    <div style="font-family:ui-monospace,monospace; font-size:11px; color:#64748b;">
      {heure_str} · {discipline} · {distance}m · {partants} partants
      {f' · Dominante {parity}' if parity else ''}
    </div>
  </div>
  {couples_html}
  {tierces_html}
  {kept_html}
</div>
"""


def render_ferran_r1_html(
    date_str: str,
    hippodrome: str,
    reunion: str,
    courses_with_analysis: List[Dict[str, Any]],
    light: bool = False,
) -> str:
    """Construit le HTML exporté "Couplés Ferran R1" pour toutes les courses R1.

    Args:
        date_str: YYYY-MM-DD
        hippodrome: nom de l'hippodrome R1
        reunion: "R1"
        courses_with_analysis: liste de dicts {course, analysis}
            où `course` est la meta course (numCourse, libelle, heure, …)
            et `analysis` est le retour de `analyze_with_ferran(participants)`.
        light: si True, version Gmail (sans image de fond inline, < 100 KB).

    Returns:
        HTML string (déjà wrappé avec _wrap_export + QR code).
    """
    try:
        d = datetime.strptime(date_str, "%Y-%m-%d")
        date_human = d.strftime("%d/%m/%Y")
    except Exception:
        date_human = date_str

    # Intro
    intro = f"""
<div style="background:#f8fafc; border-left:4px solid #0f172a; padding:12px 14px;
            margin-bottom:14px; font-size:13px; color:#1e293b; line-height:1.55;">
  <b>Couplés & Tiercés Ferran — {reunion} {hippodrome}</b><br>
  <span style="font-size:11px; color:#475569;">
    Date : <b>{date_human}</b> · {len(courses_with_analysis)} course(s) analysée(s)<br>
    Méthode : élimination par scoring multi-critères (cotes, musique, parité, réussite) —
    les combinaisons en vert sont les plus probables selon l'algo.
  </span>
</div>
"""

    legend = """
<div style="font-size:11px; color:#64748b; margin-bottom:10px; line-height:1.5;
            background:#fef9c3; border:1px solid #fde047; padding:8px 12px; border-radius:4px;">
  <b>Légende :</b>
  <span style="background:#dcfce7; border:1px solid #22c55e; padding:1px 6px;
               border-radius:3px; margin-left:4px;">Couplés</span>
  <span style="background:#dbeafe; border:1px solid #3b82f6; padding:1px 6px;
               border-radius:3px; margin-left:4px;">Tiercés</span>
  — le nombre entre parenthèses (ex: 85.2) est le <b>score Ferran</b> (plus haut = plus probable).
</div>
"""

    blocks_html = ""
    for item in courses_with_analysis:
        try:
            blocks_html += _build_ferran_course_block(item["course"], item["analysis"])
        except Exception as e:
            logger.warning(f"ferran render block failed: {e}")

    if not blocks_html:
        blocks_html = (
            '<div style="padding:24px; text-align:center; color:#64748b;">'
            'Aucune course exploitable pour cette R1.</div>'
        )

    inner = intro + legend + blocks_html
    return _wrap_export(f"COUPLÉS FERRAN · {reunion}", inner, light=light)


# ===== EXPIRATION CODES J-1 (#c) =====

def _build_code_expiring_html(code: str, label: Optional[str], expires_at: str, hours_remaining: int) -> str:
    """Email d'alerte expiration code à J-1."""
    try:
        d = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
        from zoneinfo import ZoneInfo
        d_paris = d.astimezone(ZoneInfo("Europe/Paris"))
        date_str = d_paris.strftime("%A %d %B à %Hh%M").capitalize()
    except Exception:
        date_str = expires_at

    inner = (
        '<h2 style="margin:0 0 16px 0; color:#dc2626;">⏰ Ton accès TURFEX expire bientôt</h2>'
        f'<p style="font-size:14px; color:#444; line-height:1.6;">Bonjour,</p>'
        f'<p style="font-size:14px; color:#444; line-height:1.6;">Ton accès <b style="font-family:monospace;">{code}</b>'
        f'{f" ({label})" if label else ""} expire dans <b>{hours_remaining} heures</b> '
        f'(le <b>{date_str}</b>).</p>'
        '<div style="margin:20px 0; padding:16px; background:#fef3c7; border:2px solid #f59e0b; border-radius:8px;">'
        '<p style="margin:0; font-size:13px; color:#78350f;">'
        "<b>Ne perds pas l'accès aux pronostics R1 quotidiens !</b><br>"
        "Renouvelle ton accès dès maintenant pour 30 € — paiement instantané, "
        "code envoyé par email."
        '</p></div>'
        '<div style="text-align:center; margin:24px 0;">'
        '<a href="https://royal-turf777.com" style="display:inline-block; background:#ec4899; color:white; '
        'padding:12px 28px; border-radius:8px; text-decoration:none; font-weight:bold;">Renouveler mon accès</a>'
        '</div>'
        '<p style="font-size:11px; color:#6b7280; font-style:italic;">'
        "Tu reçois cet email car ton code arrive à expiration. Si tu ne souhaites plus recevoir "
        "ces alertes, ignore simplement ce message."
        '</p>'
    )
    return _wrap("EXPIRATION ACCÈS", inner, accent="#dc2626")


async def send_code_expiring_warnings(db) -> Dict[str, Any]:
    """Scanne les access_codes qui expirent dans la fenêtre [now, now+hours] et envoie un email J-1.

    Idempotent : un code ne reçoit le warning qu'une seule fois (champ `expirationWarningSentAt`).
    """
    settings = await get_settings(db)
    if not settings.get("code_expiring_soon", False):
        return {"ok": False, "error": "event disabled", "sent": 0, "eligible": 0}
    if not email_enabled():
        return {"ok": False, "error": "email disabled", "sent": 0, "eligible": 0}

    hours_window = int(settings.get("code_expiring_soon_hours", 24) or 24)
    now = datetime.now(timezone.utc)
    threshold = now + timedelta(hours=hours_window)
    threshold_iso = threshold.isoformat()
    now_iso = now.isoformat()

    # Codes actifs avec email + expirent dans la fenêtre + pas encore prévenus
    query = {
        "active": True,
        "email": {"$exists": True, "$nin": [None, ""]},
        "expiresAt": {"$gte": now_iso, "$lte": threshold_iso},
        "$or": [
            {"expirationWarningSentAt": {"$exists": False}},
            {"expirationWarningSentAt": None},
        ],
    }

    eligible = []
    async for c in db.access_codes.find(query):
        eligible.append(c)

    if not eligible:
        return {"ok": False, "error": "no eligible code in expiry window", "sent": 0, "eligible": 0}

    sent = 0
    errors: List[Dict[str, Any]] = []
    for idx, c in enumerate(eligible):
        try:
            expires_at = c.get("expiresAt", "")
            d = datetime.fromisoformat(expires_at.replace("Z", "+00:00"))
            hours_remaining = max(0, int((d - now).total_seconds() // 3600))
        except Exception:
            hours_remaining = hours_window

        html = _build_code_expiring_html(
            code=c.get("code", "?"),
            label=c.get("label"),
            expires_at=c.get("expiresAt", ""),
            hours_remaining=hours_remaining,
        )
        subject = f"[TURFEX] ⏰ Ton accès expire dans {hours_remaining}h"
        result = await _send_to(c["email"], subject, html, db=db)

        if result.get("ok"):
            sent += 1
            try:
                await db.access_codes.update_one(
                    {"id": c.get("id")},
                    {"$set": {"expirationWarningSentAt": datetime.now(timezone.utc).isoformat()}},
                )
            except Exception as e:
                logger.warning(f"mark expirationWarningSentAt failed: {e}")
        else:
            errors.append({"to": c.get("email"), "error": result.get("error")})

        if idx < len(eligible) - 1:
            await asyncio.sleep(0.6)

    return {
        "ok": sent > 0,
        "sent": sent,
        "eligible": len(eligible),
        "errors": errors[:5],
    }


# ===== ALERTE GRADE A AUX UTILISATEURS (#d) =====

async def on_pronostic_grade_a_user_broadcast(
    db,
    course_label: str,
    hippodrome: str,
    horse_num: int,
    horse_name: str,
    cote: Optional[float],
    reasons: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Diffuse une alerte Grade A à TOUS les utilisateurs avec email actif.

    Idempotent : on hash (course_label + horse_num) du jour pour éviter de spammer.
    """
    settings = await get_settings(db)
    if not settings.get("grade_a_realtime_user", False):
        return {"ok": False, "error": "event disabled", "sent": 0}
    if not email_enabled():
        return {"ok": False, "error": "email disabled", "sent": 0}

    # Idempotence par jour Paris
    try:
        from zoneinfo import ZoneInfo
        today = datetime.now(ZoneInfo("Europe/Paris")).strftime("%Y-%m-%d")
    except Exception:
        today = datetime.utcnow().strftime("%Y-%m-%d")

    dedup_key = hashlib_md5(f"{today}|{course_label}|{horse_num}|{horse_name}")
    existing = await db.grade_a_alerts_sent.find_one({"key": dedup_key}) if hasattr(db, "grade_a_alerts_sent") else None
    if existing:
        return {"ok": False, "error": "already sent today", "sent": 0}

    recipients = await get_active_subscribers(db)
    if not recipients:
        return {"ok": False, "error": "no recipients", "sent": 0}

    cote_str = f"{cote:.1f}" if cote else "—"
    reasons_str = (
        '<ul style="margin:8px 0; padding-left:20px;">' +
        "".join([f'<li style="font-size:13px; color:#374151;">{r}</li>' for r in (reasons or [])[:4]]) +
        "</ul>"
    ) if reasons else ""

    inner = (
        '<h2 style="margin:0 0 12px 0; color:#7c3aed;">🏆 Pépite Grade A détectée !</h2>'
        f'<div style="background:#f5f3ff; border:2px solid #7c3aed; border-radius:8px; padding:16px; margin:12px 0;">'
        f'<div style="font-size:11px; text-transform:uppercase; color:#6d28d9; font-weight:bold;">{hippodrome}</div>'
        f'<div style="font-size:18px; font-weight:bold; color:#1f2937; margin:6px 0;">{course_label}</div>'
        f'<div style="font-size:24px; font-weight:900; color:#7c3aed;">N°{horse_num} {horse_name}</div>'
        f'<div style="font-size:14px; color:#4b5563; margin-top:6px;">Cote : <b>{cote_str}</b></div>'
        f'{reasons_str}'
        '</div>'
        '<p style="font-size:13px; color:#4b5563; line-height:1.5;">'
        "Conviction max sur ce cheval. Connecte-toi à TURFEX pour l'analyse complète et les recommandations de jeu."
        '</p>'
    )

    subject = f"[TURFEX] 🏆 Pépite Grade A — {horse_name} ({hippodrome})"
    sent = 0
    for idx, r in enumerate(recipients):
        result = await _send_to(r["email"], subject, _wrap("ALERTE GRADE A", inner, accent="#7c3aed"), db=db)
        if result.get("ok"):
            sent += 1
        if idx < len(recipients) - 1:
            await asyncio.sleep(0.6)

    # Marque comme envoyé
    try:
        await db.grade_a_alerts_sent.insert_one({
            "key": dedup_key,
            "courseLabel": course_label,
            "hippodrome": hippodrome,
            "horse": f"{horse_num} {horse_name}",
            "date": today,
            "sent": sent,
            "sentAt": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        logger.warning(f"grade_a_alerts_sent insert failed: {e}")

    return {"ok": sent > 0, "sent": sent, "recipients_count": len(recipients)}


def hashlib_md5(s: str) -> str:
    """Wrapper compact pour clé de dédup."""
    import hashlib
    return hashlib.md5(s.encode("utf-8")).hexdigest()


