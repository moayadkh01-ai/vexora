#!/usr/bin/env python3
"""NoirCue full rebrand: VEXORA→NoirCue, فيكسورا→نواركيو across the entire repo."""
import os, re

AR_OLD = ['فيكسورا', 'فيكسور', 'فكسورا']
AR_NEW = 'نواركيو'
EN_OLD = ['VEXORA', 'Vexora', 'vexora', 'Vexora', 'VEXORA']
EN_NEW = 'NoirCue'

SKIP_DIRS = {'node_modules', 'prebuilt', '.git', 'assets'}
SKIP_FILES = {'noircue.py'}  # this script itself

def brand(text):
    # Arabic first (avoid partial overlaps)
    for a in AR_OLD:
        text = text.replace(a, AR_NEW)
    # English variants (case-aware)
    text = re.sub(r'\bVEXORA\b', 'NoirCue', text)
    text = re.sub(r'\bVexora\b', 'NoirCue', text)
    text = re.sub(r'\bvexora\b', 'noircue', text)
    # tokens like VEXORA_Admin, vexora_token, vexora-db, vexora.gg
    text = text.replace('VEXORA_Admin', 'NoirCue_Admin')
    text = text.replace('vexora_token', 'noircue_token')
    text = text.replace('vexora-db', 'noircue-db')
    text = text.replace('vexora.gg', 'noircue.app')
    text = text.replace('vexora_backup', 'noircue_backup')
    text = text.replace('VEXORA Coins', 'NoirCue Coins')
    text = text.replace('vexora-mobile', 'noircue-mobile')
    text = text.replace('VEXORA-complete', 'NoirCue-complete')
    text = text.replace('vexora-deploy', 'noircue-deploy')
    text = text.replace('VEXORA-full', 'NoirCue-full')
    return text

changed = 0
for root, dirs, files in os.walk('.'):
    dirs[:] = [d for d in dirs if d not in SKIP_DIRS and not d.startswith('.')]
    for f in files:
        if f in SKIP_FILES or f.endswith(('.zip', '.tgz', '.db', '.png', '.jpg', '.ico')):
            continue
        p = os.path.join(root, f)
        try:
            src = open(p, encoding='utf-8').read()
        except Exception:
            continue
        out = brand(src)
        if out != src:
            open(p, 'w', encoding='utf-8').write(out)
            changed += 1
            print('  ✓', p)
print(f'\n{changed} files rebranded')
