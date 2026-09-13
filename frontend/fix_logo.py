"""
Corrige les imports de logo SVG dans les fichiers Next.js.
Remplace 'import logo from "@/assets/logo.svg"' par une constante string.
Et met à jour les usages 'src={logo}' -> 'src={LOGO_SRC}'
"""
import os
import re

FILES_TO_FIX = [
    r"c:\mes applications\turfex\frontend\src\app\page.jsx",
    r"c:\mes applications\turfex\frontend\src\app\admin\page.jsx",
    r"c:\mes applications\turfex\frontend\src\app\payment-success\page.jsx",
    r"c:\mes applications\turfex\frontend\src\components\PasswordGate.jsx",
]

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    original = content
    
    # Remplace import logo from "@/assets/logo.svg";
    content = re.sub(
        r'import logo from "@/assets/logo\.svg";?\n?',
        'const LOGO_SRC = "/logo.svg";\n',
        content
    )
    content = re.sub(
        r"import logo from '@/assets/logo\.svg';?\n?",
        "const LOGO_SRC = '/logo.svg';\n",
        content
    )
    
    # Remplace src={logo} par src={LOGO_SRC}
    content = content.replace('src={logo}', 'src={LOGO_SRC}')
    
    # Pareil pour les pages sources (au cas où)
    content = re.sub(
        r'import logo from "\.\.?/assets/logo\.svg";?\n?',
        'const LOGO_SRC = "/logo.svg";\n',
        content
    )
    
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Fixed logo: {filepath}")
    else:
        print(f"No change: {filepath}")

def main():
    for f in FILES_TO_FIX:
        if os.path.exists(f):
            fix_file(f)
        else:
            print(f"File not found: {f}")

if __name__ == "__main__":
    main()
