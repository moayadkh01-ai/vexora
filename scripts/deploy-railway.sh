#!/bin/bash
# ============================================================
# VEXORA — full Railway deployment (run by the agent)
# Env: RAILWAY_TOKEN=<project token>  [ADMIN_PASS=<strong>]
# Deploys the app, sets production variables, attaches a
# persistent volume at /data and generates the public domain.
# ============================================================
set -uo pipefail
[ -n "${RAILWAY_TOKEN:-}" ] || { echo "RAILWAY_TOKEN is not set — see DEPLOY.md"; exit 1; }
export RAILWAY_TOKEN
DIR="$(cd "$(dirname "$0")/.." && pwd)"; cd "$DIR"
npm i -D --no-save @railway/cli >/dev/null 2>&1 || true
RY=node_modules/.bin/railway
[ -x "$RY" ] || RY="npx -y railway"

echo "▶ 1/4 deploying service…"
"$RY" up --ci 2>&1 | tail -6

echo "▶ 2/4 setting environment…"
"$RY" variables set \
  --kv "NODE_ENV=production" \
  --kv "DB_PATH=/data/vexora.db" \
  --kv "COOKIE_SECURE=1" \
  --kv "ADMIN_PASS=${ADMIN_PASS:-admin123}" \
  --kv "PAYMENTS_SIMULATE=1" 2>&1 | tail -2 || true

echo "▶ 3/4 attaching persistent volume (/data)…"
"$RY" volume add --mount-path /data 2>/dev/null || "$RY" volumes add --mount-path /data 2>/dev/null || echo "  (attach volume from dashboard → Settings → Volumes → /data)"

echo "▶ 4/4 generating public domain…"
"$RY" domain 2>&1 | tail -2 || echo "  (generate domain from dashboard → Settings → Networking)"

echo "✅ pipeline finished — run scripts/verify-permanent.js against the domain."
