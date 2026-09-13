
"""TURFEX — Export du code source complet (admin only).

Endpoint : `GET /api/admin/source-export` (header `X-Admin-Password` requis).

Génère à la volée un fichier .txt unique contenant :
  • Backend complet (`*.py` de `/app/backend/` y compris tests)
  • Frontend complet (`*.{js,jsx,css}` de `/app/frontend/src/`)
  • Fichiers de configuration racine (package.json, requirements.txt, tailwind.config.js, postcss.config.js, craco.config.js)
  • Squelettes `.env.example` (clés sans valeurs) — JAMAIS les vraies clés API

Format du dump : header + table des matières + délimiteurs `# FILE: <path>` à la
manière du format source utilisé pour Odds Detective.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, List, Optional

from fastapi import APIRouter, Header, HTTPException
from fastapi.responses import Response

logger = logging.getLogger(__name__)

REPO_ROOT = Path("/app")
BACKEND_DIR = REPO_ROOT / "backend"
FRONTEND_SRC_DIR = REPO_ROOT / "frontend" / "src"
FRONTEND_PUBLIC_DIR = REPO_ROOT / "frontend" / "public"

# Fichiers de configuration racine à inclure tels quels (sans secrets)
ROOT_CONFIG_FILES = [
    REPO_ROOT / "backend" / "requirements.txt",
    REPO_ROOT / "frontend" / "package.json",
    REPO_ROOT / "frontend" / "tailwind.config.js",
    REPO_ROOT / "frontend" / "postcss.config.js",
    REPO_ROOT / "frontend" / "craco.config.js",
    REPO_ROOT / "frontend" / "components.json",
    REPO_ROOT / "frontend" / "jsconfig.json",
]

# Fichiers .env à exporter en squelette (clés seulement, valeurs vidées)
ENV_FILES = [
    REPO_ROOT / "backend" / ".env",
    REPO_ROOT / "frontend" / ".env",
]

# Extensions / dirs à exclure pour le frontend
FRONTEND_EXTENSIONS = {".js", ".jsx", ".ts", ".tsx", ".css", ".html", ".json"}
EXCLUDED_DIR_NAMES = {
    "node_modules", "build", "dist", ".next", "coverage",
    "__pycache__", ".pytest_cache", ".mypy_cache", ".ruff_cache",
    ".git", ".emergent", "venv", ".venv", "env",
}
# Fichiers binaires / volumineux à ignorer côté backend
BACKEND_EXCLUDED_SUFFIXES = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".pdf", ".zip", ".pyc"}


def _should_skip_dir(path: Path) -> bool:
    return path.name in EXCLUDED_DIR_NAMES


def _walk_files(root: Path, allowed_suffixes: Optional[set] = None) -> List[Path]:
    """Walk récursif filtrant les répertoires exclus.

    Si `allowed_suffixes` est fourni, ne garde que les fichiers avec ces extensions.
    """
    out: List[Path] = []
    if not root.exists():
        return out
    for dirpath, dirnames, filenames in os.walk(root):
        # mutate in-place pour skip
        dirnames[:] = [d for d in dirnames if d not in EXCLUDED_DIR_NAMES]
        for fn in filenames:
            p = Path(dirpath) / fn
            if allowed_suffixes is not None:
                if p.suffix.lower() not in allowed_suffixes:
                    continue
            out.append(p)
    out.sort()
    return out


def _read_text_safely(path: Path, max_bytes: int = 2_000_000) -> str:
    """Lit un fichier en UTF-8 ; ignore silencieusement les binaires / trop gros."""
    try:
        size = path.stat().st_size
        if size > max_bytes:
            return f"// [FICHIER OMIS — {size} octets > {max_bytes}]\n"
        return path.read_text(encoding="utf-8")
    except UnicodeDecodeError:
        return "// [FICHIER BINAIRE OMIS]\n"
    except Exception as e:
        return f"// [LECTURE IMPOSSIBLE : {e}]\n"


# Regex de rédaction : masque les clés API connues qui pourraient avoir été
# hardcodées par mégarde. Pattern → remplacement.
import re as _re  # noqa: E402

_SECRET_PATTERNS = [
    # Maketou
    (_re.compile(r"msk_[a-fA-F0-9]{40,}"), "msk_REDACTED_MAKETOU_KEY"),
    # Resend
    (_re.compile(r"re_[A-Za-z0-9]{8,}_[A-Za-z0-9]{20,}"), "re_REDACTED_RESEND_KEY"),
    # Brevo / Sendinblue
    (_re.compile(r"xkeysib-[a-fA-F0-9]{40,}-[A-Za-z0-9]{12,}"), "xkeysib-REDACTED_BREVO_KEY"),
    # OpenAI
    (_re.compile(r"sk-(?:proj-)?[A-Za-z0-9_\-]{30,}"), "sk-REDACTED_OPENAI_KEY"),
    # Anthropic
    (_re.compile(r"sk-ant-[A-Za-z0-9_\-]{30,}"), "sk-ant-REDACTED_ANTHROPIC_KEY"),
    # Stripe
    (_re.compile(r"sk_(?:test|live)_[A-Za-z0-9]{24,}"), "sk_REDACTED_STRIPE_KEY"),
    (_re.compile(r"pk_(?:test|live)_[A-Za-z0-9]{24,}"), "pk_REDACTED_STRIPE_KEY"),
    # Emergent LLM (sk-emergent-...)
    (_re.compile(r"sk-emergent-[A-Za-z0-9]{20,}"), "sk-emergent-REDACTED"),
    # Generic Bearer tokens dans du code (ex: Bearer "...")
    (_re.compile(r'Bearer\s+["\'][A-Za-z0-9_\-]{30,}["\']'), 'Bearer "REDACTED_TOKEN"'),
]


def _redact_secrets(content: str) -> str:
    """Masque toute clé API hardcodée détectée (défense en profondeur)."""
    for pattern, repl in _SECRET_PATTERNS:
        content = pattern.sub(repl, content)
    return content


def _env_to_skeleton(content: str) -> str:
    """Convertit un .env en .env.example (clés seulement, valeurs vidées).

    Préserve les commentaires (#…) et les lignes vides. Pour `KEY=VALUE`,
    garde `KEY=` (valeur supprimée). Sécurise contre les fuites de clés API.
    """
    out_lines: List[str] = []
    for raw in content.splitlines():
        s = raw.rstrip()
        if not s.strip():
            out_lines.append("")
            continue
        if s.lstrip().startswith("#"):
            out_lines.append(s)
            continue
        if "=" in s:
            key = s.split("=", 1)[0]
            out_lines.append(f"{key}=")
        else:
            out_lines.append(s)
    return "\n".join(out_lines) + "\n"


def _format_file_block(rel_path: str, content: str) -> str:
    sep = "#" * 80
    header = f"\n{sep}\n# FILE: {rel_path}\n{sep}\n\n"
    content = _redact_secrets(content)
    if not content.endswith("\n"):
        content += "\n"
    return header + content


def _build_export() -> str:
    """Construit le dump complet du code source TURFEX."""
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    sep_top = "=" * 80

    # 1) Collecte des fichiers
    backend_files = [
        p for p in _walk_files(BACKEND_DIR)
        if p.suffix.lower() == ".py"
        or p.name in {"requirements.txt"}
    ]
    frontend_files = _walk_files(FRONTEND_SRC_DIR, allowed_suffixes=FRONTEND_EXTENSIONS)
    public_files = [
        p for p in _walk_files(FRONTEND_PUBLIC_DIR)
        if p.suffix.lower() in {".html", ".json", ".webmanifest", ".js", ".css"}
    ]
    config_files = [p for p in ROOT_CONFIG_FILES if p.exists()]
    env_files = [p for p in ENV_FILES if p.exists()]

    # 2) Construit la TOC
    all_groups = [
        ("Backend (Python)", backend_files),
        ("Frontend src", frontend_files),
        ("Frontend public", public_files),
        ("Configuration racine", config_files),
        ("Variables d'environnement (squelettes .env.example)", env_files),
    ]

    toc_lines: List[str] = []
    counter = 0
    for group_label, files in all_groups:
        if not files:
            continue
        toc_lines.append(f"\n--- {group_label} ---")
        for f in files:
            counter += 1
            rel = str(f.relative_to(REPO_ROOT))
            toc_lines.append(f"  {counter:03d}. {rel}")
    toc = "\n".join(toc_lines)

    # 3) Header
    header = (
        f"{sep_top}\n"
        "TURFEX — INTELLIGENCE PMU — CODE SOURCE COMPLET\n"
        f"Build : {now}\n"
        f"{sep_top}\n"
        "Application complète de pronostics turf — React 19 + FastAPI + MongoDB\n"
        "PWA avec analytics pros, codes d'accès, paiements (Maketou + Chariow),\n"
        "emails (Resend + Brevo), IA Claude Sonnet 4.5, et apps embarquées :\n"
        "  • Turf Astro (numérologie de course)\n"
        "  • Le Pari de la Fortune (méthode WAGUE)\n"
        "  • Odds Detective (auth indépendante, route /odds-detective)\n"
        "\n"
        "Intégrations 3rd party (clés API en .env.example — vides ici par sécurité) :\n"
        "  • Resend (emails transactionnels — fallback Brevo)\n"
        "  • Brevo (provider email secondaire)\n"
        "  • Maketou (paiement)\n"
        "  • Chariow (paiement — 3 plans 1m/3m/1y)\n"
        "  • Emergent LLM Universal Key (Claude Sonnet 4.5)\n"
        "  • PMU Turfinfo API (online.turfinfo.api.pmu.fr)\n"
        "\n"
        f"Fichiers exportés : {counter}\n"
        f"{sep_top}\n"
        "\n"
        "TABLE DES MATIÈRES\n"
        "------------------"
        f"{toc}\n"
        "\n"
        f"{sep_top}\n"
    )

    # 4) Concatène tous les contenus
    parts: List[str] = [header]

    # Backend
    for f in backend_files:
        rel = str(f.relative_to(REPO_ROOT))
        parts.append(_format_file_block(rel, _read_text_safely(f)))
    # Frontend src
    for f in frontend_files:
        rel = str(f.relative_to(REPO_ROOT))
        parts.append(_format_file_block(rel, _read_text_safely(f)))
    # Frontend public
    for f in public_files:
        rel = str(f.relative_to(REPO_ROOT))
        parts.append(_format_file_block(rel, _read_text_safely(f)))
    # Config racine
    for f in config_files:
        rel = str(f.relative_to(REPO_ROOT))
        parts.append(_format_file_block(rel, _read_text_safely(f)))
    # .env → squelette
    for f in env_files:
        rel = str(f.relative_to(REPO_ROOT)) + ".example"
        skel = _env_to_skeleton(_read_text_safely(f))
        parts.append(_format_file_block(rel, skel))

    # 5) Footer
    parts.append(f"\n{sep_top}\nFIN DU CODE SOURCE — {counter} fichiers\n{sep_top}\n")
    return "".join(parts)


def build_source_export_router(require_admin: Callable) -> APIRouter:
    """Crée un router pour l'export source. `require_admin` doit lever 401 si refusé."""
    router = APIRouter(tags=["admin_source_export"])

    @router.get("/admin/source-export")
    async def source_export(x_admin_password: Optional[str] = Header(None)):
        await require_admin(x_admin_password)
        try:
            payload = _build_export()
        except Exception as e:
            logger.exception("source-export build failed")
            raise HTTPException(status_code=500, detail=f"Export failed: {e}")
        date_tag = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M")
        filename = f"turfex_source_complet_{date_tag}.txt"
        return Response(
            content=payload,
            media_type="text/plain; charset=utf-8",
            headers={
                "Content-Disposition": f'attachment; filename="{filename}"',
                "X-Source-Lines": str(payload.count("\n")),
            },
        )

    @router.get("/admin/source-export/preview")
    async def source_export_preview(x_admin_password: Optional[str] = Header(None)):
        """Retourne uniquement le header + la TOC pour aperçu rapide (rapide à charger)."""
        await require_admin(x_admin_password)
        full = _build_export()
        # On retourne juste les premières ~200 lignes (header + TOC + 1er fichier)
        head_lines = full.splitlines()[:200]
        return {
            "preview": "\n".join(head_lines),
            "total_lines": full.count("\n"),
            "total_bytes": len(full.encode("utf-8")),
        }

    return router

