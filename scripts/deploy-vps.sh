#!/bin/bash
# ============================================================
# NoirCue — deploy to any VPS over SSH (permanent 24/7)
# Usage:  bash scripts/deploy-vps.sh user@your-server-ip
# Requires: ssh key auth to the server (as root or sudo user)
# Installs Node 20 if missing, uploads the project, enables a
# systemd service with auto-restart and boot persistence.
# ============================================================
set -euo pipefail
DEST="${1:?usage: deploy-vps.sh user@host}"
APP_DIR=/opt/noircue
HERE="$(cd "$(dirname "$0")/.." && pwd)"

echo "▶ 1/5  preparing bundle…"
TAR=/tmp/noircue-deploy.tgz
tar czf "$TAR" -C "$HERE" --exclude node_modules --exclude data --exclude bin --exclude '.git' \
  server public scripts test package.json package-lock.json config.example.env render.yaml railway.json Dockerfile Procfile || \
tar czf "$TAR" -C "$HERE" --exclude node_modules --exclude data --exclude bin server public scripts test package.json package-lock.json config.example.env

echo "▶ 2/5  uploading to $DEST…"
ssh "$DEST" "mkdir -p $APP_DIR"
scp "$TAR" "$DEST:/tmp/"
ssh "$DEST" "tar xzf /tmp/noircue-deploy.tgz -C $APP_DIR"

echo "▶ 3/5  installing Node 20 (if needed) + deps…"
ssh "$DEST" "bash -s" <<'REMOTE'
set -e
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y nodejs >/dev/null || (apt-get update >/dev/null && apt-get install -y nodejs >/dev/null)
fi
cd /opt/noircue
npm ci --omit=dev --no-audit --no-fund
mkdir -p data
REMOTE

echo "▶ 4/5  installing systemd service (auto-restart + boot)…"
ssh "$DEST" "bash -s" <<'REMOTE'
set -e
id noircue >/dev/null 2>&1 || useradd -r -m -d /opt/noircue -s /usr/sbin/nologin noircue || true
cat > /etc/systemd/system/noircue.service <<'UNIT'
[Unit]
Description=NoirCue (نواركيو) multiplayer gaming platform
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/noircue
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOST=0.0.0.0
Environment=DB_PATH=/opt/noircue/data/noircue.db
EnvironmentFile=-/opt/noircue/noircue.env
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3
StandardOutput=append:/var/log/noircue.log
StandardError=append:/var/log/noircue.log

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable noircue
systemctl restart noircue
sleep 2
systemctl --no-pager --lines=3 status noircue || true
REMOTE

echo "▶ 5/5  done."
echo ""
echo "NoirCue is now running on the VPS at http://SERVER_IP:3000"
echo "Next (recommended):"
echo "  1) point a domain at the server and terminate TLS with Caddy/nginx"
echo "     sample Caddyfile:  noircue.yourdomain.com { reverse_proxy 127.0.0.1:3000 }"
echo "  2) add secrets to /opt/noircue/noircue.env (ADMIN_PASS, COOKIE_SECURE=1, SELF_PING_URL=...)"
