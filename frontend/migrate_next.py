import os
import re

def process_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
        
    original = content
    needs_client = False
    
    # Heuristics for "use client"
    if 'useState' in content or 'useEffect' in content or 'useContext' in content or 'useRef' in content or 'useNavigate' in content or 'useLocation' in content or 'usePathname' in content or 'useRouter' in content or 'onClick' in content or 'onChange' in content or 'onSubmit' in content:
        needs_client = True
        
    # Odds Detective auth requires client
    if 'AuthContext' in content or 'OddsAuthProvider' in content or 'useOddsAuth' in content:
        needs_client = True
        
    if needs_client and not content.startswith('"use client"'):
        content = '"use client";\n' + content

    # Replace react-router-dom hooks and components
    content = content.replace('import { useNavigate } from "react-router-dom"', 'import { useRouter } from "next/navigation"')
    content = content.replace('import { useNavigate, useLocation } from "react-router-dom"', 'import { useRouter, usePathname } from "next/navigation"')
    content = content.replace('import { useLocation } from "react-router-dom"', 'import { usePathname } from "next/navigation"')
    content = content.replace('useNavigate()', 'useRouter()')
    content = content.replace('useLocation()', '{ pathname: usePathname() }') # very basic mock for useLocation
    content = content.replace('import { Link } from "react-router-dom"', 'import Link from "next/link"')
    content = content.replace('import { NavLink } from "react-router-dom"', 'import Link from "next/link"')
    content = content.replace('<NavLink', '<Link')
    content = content.replace('</NavLink>', '</Link>')
    
    if content != original:
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f"Updated {filepath}")

def main():
    src_dir = r"c:\mes applications\turfex\frontend\src"
    for root, dirs, files in os.walk(src_dir):
        if 'app' in root.split(os.sep): # Skip new app router files for now, except maybe page.jsx? No, page.jsx already has use client
            continue
        for file in files:
            if file.endswith('.jsx') or file.endswith('.js'):
                # skip index.js and App.js since they are being removed
                if file in ['index.js', 'App.js']:
                    continue
                process_file(os.path.join(root, file))

if __name__ == "__main__":
    main()
