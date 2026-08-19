#!/bin/bash
# ============================================================
# VEXORA — deploy to any VPS over SSH (permanent 24/7)
# Usage:  bash scripts/deploy-vps.sh user@your-server-ip
# Requires: ssh key auth to the server (as root or sudo user)
# Installs Node 20 if missing, uploads the project, enables a
# systemd service with auto-restart and boot persistence.
# ============================================================
set -euo pipefail
DEST="${1:?usage: deploy-vps.sh user@host}"
APP_DIR=/opt/vexora
HERE="$(cd "$(dirname "$0")/.." && pwd)"

echo "▶ 1/5  preparing bundle…"
TAR=/tmp/vexora-deploy.tgz
tar czf "$TAR" -C "$HERE" --exclude node_modules --exclude data --exclude bin --exclude '.git' \
  server public scripts test package.json package-lock.json config.example.env render.yaml railway.json Dockerfile Procfile || \
tar czf "$TAR" -C "$HERE" --exclude node_modules --exclude data --exclude bin server public scripts test package.json package-lock.json config.example.env

echo "▶ 2/5  uploading to $DEST…"
ssh "$DEST" "mkdir -p $APP_DIR"
scp "$TAR" "$DEST:/tmp/"
ssh "$DEST" "tar xzf /tmp/vexora-deploy.tgz -C $APP_DIR"

echo "▶ 3/5  installing Node 20 (if needed) + deps…"
ssh "$DEST" "bash -s" <<'REMOTE'
set -e
if ! command -v node >/dev/null || [ "$(node -v | cut -c2-3)" -lt 20 ]; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - >/dev/null
  apt-get install -y nodejs >/dev/null || (apt-get update >/dev/null && apt-get install -y nodejs >/dev/null)
fi
cd /opt/vexora
npm ci --omit=dev --no-audit --no-fund
mkdir -p data
REMOTE

echo "▶ 4/5  installing systemd service (auto-restart + boot)…"
ssh "$DEST" "bash -s" <<'REMOTE'
set -e
id vexora >/dev/null 2>&1 || useradd -r -m -d /opt/vexora -s /usr/sbin/nologin vexora || true
cat > /etc/systemd/system/vexora.service <<'UNIT'
[Unit]
Description=VEXORA (فيكسورا) multiplayer gaming platform
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/vexora
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=HOST=0.0.0.0
Environment=DB_PATH=/opt/vexora/data/vexora.db
EnvironmentFile=-/opt/vexora/vexora.env
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=3
StandardOutput=append:/var/log/vexora.log
StandardError=append:/var/log/vexora.log

[Install]
WantedBy=multi-user.target
UNIT
systemctl daemon-reload
systemctl enable vexora
systemctl restart vexora
sleep 2
systemctl --no-pager --lines=3 status vexora || true
REMOTE

echo "▶ 5/5  done."
echo ""
echo "VEXORA is now running on the VPS at http://SERVER_IP:3000"
echo "Next (recommended):"
echo "  1) point a domain at the server and terminate TLS with Caddy/nginx"
echo "     sample Caddyfile:  vexora.yourdomain.com { reverse_proxy 127.0.0.1:3000 }"
echo "  2) add secrets to /opt/vexora/vexora.env (ADMIN_PASS, COOKIE_SECURE=1, SELF_PING_URL=...)"
