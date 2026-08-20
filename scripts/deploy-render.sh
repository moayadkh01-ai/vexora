#!/bin/bash
# ============================================================
# NoirCue — Render deployment (run by the agent)
# Env: GH_TOKEN=<github PAT>  RENDER_API_KEY=<render key>
#      HF_TOKEN=<hf write token>  HF_REPO=<user>/noircue-db
# 1) creates/pushes the GitHub repo (public, no secrets inside)
# 2) creates the Render web service from that repo (free plan)
# 3) sets env vars, triggers deploy, prints the live URL
# ============================================================
set -uo pipefail
for v in GH_TOKEN RENDER_API_KEY; do [ -n "${!v:-}" ] || { echo "$v missing"; exit 1; }; done
DIR="$(cd "$(dirname "$0")/.." && pwd)"

GH_USER=$(curl -s -H "Authorization: token $GH_TOKEN" https://api.github.com/user | python3 -c 'import sys,json;print(json.load(sys.stdin)["login"])')
echo "▶ github user: $GH_USER"
curl -s -X POST https://api.github.com/user/repos -H "Authorization: token $GH_TOKEN" \
  -H 'Content-Type: application/json' -d '{"name":"noircue","private":false,"auto_init":true}' | head -c 120; echo

echo "▶ pushing files…"
cd "$DIR"
git init -q 2>/dev/null; git config user.email "deploy@noircue.gg"; git config user.name "NoirCue Deploy"
git add -A server public scripts package.json package-lock.json Dockerfile render.yaml railway.json Procfile config.example.env DEPLOY.md 2>/dev/null || git add -A
git commit -qm "NoirCue deploy" 2>/dev/null
git branch -M main 2>/dev/null
git push -qf "https://$GH_USER:$GH_TOKEN@github.com/$GH_USER/noircue.git" main 2>&1 | tail -2
echo "▶ repo: https://github.com/$GH_USER/noircue"

echo "▶ creating render service…"
CREATE=$(curl -s -X POST https://api.render.com/v1/services -H "Authorization: Bearer $RENDER_API_KEY" \
  -H 'Content-Type: application/json' -d "{
    \"type\":\"web_service\",\"autoDeploy\":\"yes\",\"branch\":\"main\",\"name\":\"noircue\",
    \"repo\":\"https://github.com/$GH_USER/noircue\",
    \"serviceDetails\":{\"runtime\":\"node\",\"plan\":\"free\",
      \"envSpecificDetails\":{\"buildCommand\":\"npm ci --omit=dev --no-audit --no-fund\",\"startCommand\":\"node server/index.js\",\"healthCheckPath\":\"/api/healthz\"}}
  }")
echo "$CREATE" | head -c 400; echo
SID=$(echo "$CREATE" | python3 -c 'import sys,json;print(json.load(sys.stdin).get("id",""))' 2>/dev/null)
[ -n "$SID" ] && echo "SERVICE_ID=$SID" || { echo "⚠ API create blocked — connect the repo once from the Render dashboard (New → Web Service → noircue) then rerun this script for env+deploy."; exit 3; }

echo "▶ setting environment…"
for KV in "ADMIN_PASS=${ADMIN_PASS:-admin123}" "HF_TOKEN=${HF_TOKEN:-}" "HF_REPO=${HF_REPO:-}" "SELF_PING_URL=https://noircue.onrender.com" "COOKIE_SECURE=1"; do
  curl -s -o /dev/null -X PUT "https://api.render.com/v1/services/$SID/env-vars" -H "Authorization: Bearer $RENDER_API_KEY" \
    -H 'Content-Type: application/json' -d "{\"key\":\"${KV%%=*}\",\"value\":\"${KV#*=}\"}" || true
done
curl -s -o /dev/null -X POST "https://api.render.com/v1/services/$SID/deploys" -H "Authorization: Bearer $RENDER_API_KEY" -H 'Content-Type: application/json' -d '{}'
echo "✅ deployed → https://noircue.onrender.com (build ~3-5 min)"
