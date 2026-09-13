"""
Fixe les imports relatifs dans les pages Odds Detective du dossier app/odds-detective/(dashboard).
Ces fichiers ont été copiés depuis src/odds_detective/pages/*.jsx
et ont des imports comme ../context/, ../components/ qui pointaient vers l'ancien chemin.
"""
import os
import re

PAGES_DIR = r"c:\mes applications\turfex\frontend\src\app\odds-detective\(dashboard)"

# Mapping: ancien préfixe relatif → nouveau chemin @/
REPLACEMENTS = [
    # Imports depuis le contexte OD
    (r'from "\.\./context/AuthContext"', 'from "@/odds_detective/context/AuthContext"'),
    (r"from '\.\./context/AuthContext'", "from '@/odds_detective/context/AuthContext'"),
    (r'from "\.\./\.\./context/AuthContext"', 'from "@/odds_detective/context/AuthContext"'),
    
    # Imports depuis les composants OD
    (r'from "\.\./components/([^"]+)"', lambda m: f'from "@/odds_detective/components/{m.group(1)}"'),
    (r"from '\.\./components/([^']+)'", lambda m: f"from '@/odds_detective/components/{m.group(1)}'"),
    (r'from "\.\./\.\./components/([^"]+)"', lambda m: f'from "@/odds_detective/components/{m.group(1)}"'),
    
    # Imports depuis lib OD
    (r'from "\.\./lib/([^"]+)"', lambda m: f'from "@/odds_detective/lib/{m.group(1)}"'),
    (r"from '\.\./lib/([^']+)'", lambda m: f"from '@/odds_detective/lib/{m.group(1)}'"),
    
    # Imports depuis les pages OD (cross-imports)
    (r'from "\.\./pages/([^"]+)"', lambda m: f'from "@/odds_detective/pages/{m.group(1)}"'),
    
    # Import CSS OD
    (r'import "\.\./odds\.css"', 'import "@/odds_detective/odds.css"'),
    (r"import '\.\./odds\.css'", "import '@/odds_detective/odds.css'"),
    (r'import "\.\./\.\./odds\.css"', 'import "@/odds_detective/odds.css"'),
    
    # Composants UI shadcn (si import relatif)
    (r'from "\.\./\.\./components/ui/([^"]+)"', lambda m: f'from "@/components/ui/{m.group(1)}"'),
    
    # Navigate de react-router-dom → redirect Next.js
    (r'import \{ Navigate \} from "react-router-dom"', ''),
    (r'import \{ Outlet, Navigate \} from "react-router-dom"', ''),
    (r'import \{ Outlet \} from "react-router-dom"', ''),
    (r'<Navigate to="([^"]+)" replace />', lambda m: f'/* Navigate to {m.group(1)} - use useEffect redirect */'),
    (r'<Outlet />', '{children}'),
]

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    
    for pattern, replacement in REPLACEMENTS:
        if callable(replacement):
            content = re.sub(pattern, replacement, content)
        else:
            content = re.sub(pattern, replacement, content)
    
    # Ajouter "use client" si pas présent et fichier contient JSX/hooks
    if not content.startswith('"use client"') and not content.startswith("'use client'"):
        content = '"use client";\n' + content
    
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Fixed: {filepath}")
    else:
        print(f"No change: {filepath}")

def main():
    for root, dirs, files in os.walk(PAGES_DIR):
        for file in files:
            if file.endswith('.jsx') or file.endswith('.js'):
                fix_file(os.path.join(root, file))

if __name__ == "__main__":
    main()
