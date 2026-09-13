"""
Remplace toutes les occurrences de REACT_APP_BACKEND_URL par NEXT_PUBLIC_BACKEND_URL
dans tous les fichiers .js et .jsx du dossier src/.
"""
import os
import re

SRC_DIR = r"c:\mes applications\turfex\frontend\src"

def fix_file(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    if 'REACT_APP_BACKEND_URL' not in content:
        return
    
    new_content = content.replace('REACT_APP_BACKEND_URL', 'NEXT_PUBLIC_BACKEND_URL')
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"Fixed env var: {filepath}")

def main():
    for root, dirs, files in os.walk(SRC_DIR):
        for file in files:
            if file.endswith('.jsx') or file.endswith('.js'):
                fix_file(os.path.join(root, file))
    print("Done.")

if __name__ == "__main__":
    main()
