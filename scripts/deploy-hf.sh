#!/bin/bash
# ============================================================
# NoirCue — deploy to Hugging Face Spaces (100% free, no card)
# Run by the agent with the user's HF write token:
#     HF_TOKEN=hf_xxx bash scripts/deploy-hf.sh
# Creates:  • public Docker Space  → https://{owner}-noircue.hf.space
#           • PRIVATE dataset repo → permanent encrypted-at-rest
#             SQLite backups (player data never public)
#           • secrets: HF_TOKEN, HF_REPO, ADMIN_PASS, SELF_PING_URL
# ============================================================
set -euo pipefail
[ -n "${HF_TOKEN:-}" ] || { echo "HF_TOKEN missing"; exit 1; }
DIR="$(cd "$(dirname "$0")/.." && pwd)"; cd "$DIR"
OWNER=$(curl -s -H "Authorization: Bearer $HF_TOKEN" https://huggingface.co/api/whoami-v2 | python3 -c 'import sys,json;print(json.load(sys.stdin)["name"])')
SPACE="$OWNER/noircue"; DATASET="$OWNER/noircue-db"
echo "▶ owner: $OWNER · space: $SPACE · private dataset: $DATASET"

# 1) private dataset repo for DB backups (create if missing)
curl -s -o /dev/null -w "" -X POST https://huggingface.co/api/dataset/create \
  -H "Authorization: Bearer $HF_TOKEN" -H 'Content-Type: application/json' \
  -d "{\"name\":\"noircue-db\",\"private\":true}" || true

# 2) public Docker Space (create if missing)
curl -s -o /dev/null -X POST https://huggingface.co/api/spaces \
  -H "Authorization: Bearer $HF_TOKEN" -H 'Content-Type: application/json' \
  -d '{"name":"noircue","sdk":"docker","private":false,"hardware":"cpu-basic"}' || true

# 3) commit the app files (README frontmatter sets app_port 3000)
python3 - "$HF_TOKEN" "$SPACE" <<'PY'
import base64, json, os, sys, urllib.request
token, space = sys.argv[1], sys.argv[2]
files = []
readme = """---
title: NoirCue · نواركيو
emoji: 🎮
colorFrom: indigo
colorTo: cyan
sdk: docker
app_port: 3000
pinned: false
---
NoirCue (نواركيو) — premium Arabic-RTL multiplayer gaming platform.
"""
files.append(('README.md', readme.encode()))
for root, dirs, names in os.walk('.'):
    dirs[:] = [d for d in dirs if d not in ('node_modules', 'bin', 'data', 'mobile', '.git') and not d.startswith('.')]
    for f in names:
        if f.endswith(('.log', '.zip', '.tgz')): continue
        p = os.path.join(root, f)
        rel = os.path.relpath(p, '.')
        if rel.startswith(('server/', 'public/', 'scripts/')) or rel in ('package.json', 'package-lock.json', 'Dockerfile', 'config.example.env'):
            files.append((rel, open(p, 'rb').read()))
nd = '\n'.join([
    json.dumps({'key': 'header', 'value': {'summary': 'NoirCue deploy', 'repoType': 'space'}}),
    *['{"key":"file","value":' + json.dumps({'path': rel, 'content': base64.b64encode(b).decode(), 'encoding': 'base64'}) + '}' for rel, b in files]
])
req = urllib.request.Request(
  f'https://huggingface.co/api/spaces/{space}/commit/main',
  data=nd.encode(), method='POST',
  headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/x-ndjson'})
print(urllib.request.urlopen(req).status, '· files:', len(files))
PY

# 4) secrets (env) — incl. self-ping so the free Space never sleeps (48h rule)
for KV in "HF_TOKEN=$HF_TOKEN" "HF_REPO=$DATASET" "NODE_ENV=production" "DB_PATH=/app/data/noircue.db" "COOKIE_SECURE=1" "ADMIN_PASS=${ADMIN_PASS:-admin123}" "PAYMENTS_SIMULATE=1" "SELF_PING_URL=https://$OWNER-noircue.hf.space" "HF_BACKUP_MIN=3"; do
  K="${KV%%=*}"; V="${KV#*=}"
  curl -s -o /dev/null -X POST "https://huggingface.co/api/spaces/$SPACE/secrets" \
    -H "Authorization: Bearer $HF_TOKEN" -H 'Content-Type: application/json' \
    -d "{\"key\":\"$K\",\"value\":\"$V\"}" || true
done

# 5) (re)start the Space build
curl -s -o /dev/null -X POST "https://huggingface.co/api/spaces/$SPACE/restart" \
  -H "Authorization: Bearer $HF_TOKEN" || true

echo "✅ deployed → https://$OWNER-noircue.hf.space (build takes ~2-4 min)"
echo "   verify:  node scripts/verify-permanent.js https://$OWNER-noircue.hf.space"
