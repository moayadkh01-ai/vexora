# VEXORA — Permanent 24/7 Deployment

The platform is **deployment-ready as-is** (Node 20 + SQLite + WebSockets).
Nothing needs rewriting: `npm ci --omit=dev && node server/index.js` runs it
on any host. Docker, Render, Railway, Procfile and systemd configs are all in
this repo.

**One thing the agent cannot do alone:** create a hosting account. Permanent
hosting requires an account credential — choose ONE of the paths below and
provide the item listed. Deployment + full verification (register, login,
username validation, WebSocket play, 24/7 independence) is done by the agent
as soon as the credential is provided.

---

## Path A — Railway (easiest: ONE token, free trial credit, WebSockets ✓, persistent volume ✓)

1. Sign up at **https://railway.app** (GitHub or email) — no credit card.
2. Create a project → **Empty project**.
3. Project → **Settings → Tokens → Publish** → copy the token.
4. **Give the agent that token.**

The agent then runs `scripts/deploy-railway.sh`, attaches a persistent volume
(`/data`) so accounts & coins survive restarts, sets production env vars, and
returns the permanent `…up.railway.app` URL (custom domain optional).

## Path B — Render (needs GitHub + Render API key)

1. Sign up at **https://render.com** (free) — the Blueprint is ready: `render.yaml`.
2. Account Settings → **API Keys** → Create.
3. **Give the agent:** the Render API key **and** a GitHub personal access token
   (repo scope) so the code can be pushed to a repo connected to your account.

Note: the persistent disk (so player accounts/coins survive restarts) requires
the **Starter plan ($7/mo)**; the free plan sleeps and wipes disk.

## Path C — Any VPS (most powerful: full control, ~$4–6/mo)

Hetzner / DigitalOcean / Contabo / Oracle free tier — anything with Ubuntu 22+.

1. Create a server (1 vCPU / 1 GB RAM is plenty).
2. Add the agent's SSH key (it will be shown to you) to `~/.ssh/authorized_keys`,
   or give an SSH password / key for a sudo user.
3. **Give the agent:** `user@ip-address` + SSH key/password.

The agent then runs `scripts/deploy-vps.sh` — installs Node 20, uploads the
project, enables a systemd service (auto-restart, boots with the server),
configures TLS via Caddy on your domain if you have one.

---

## What stays persistent where

| Data | File | Kept by |
|---|---|---|
| Accounts, passwords (hashed), sessions | SQLite | persistent volume / VPS disk |
| VEXORA Coins ledger & orders | SQLite | same |
| Store catalog, rooms, friendships | SQLite | same |
| Static frontend + game servers | repo files | redeployed from this repo |

## Environment (production)

| Var | Value |
|---|---|
| `NODE_ENV` | `production` |
| `DB_PATH` | on the persistent volume (e.g. `/data/vexora.db`) |
| `COOKIE_SECURE` | `1` (behind HTTPS) |
| `ADMIN_PASS` | strong password (bootstrap admin `admin@vexora.gg`) |
| `SELF_PING_URL` | the live URL — keeps free tiers awake (optional) |
| `PAYMENTS_SIMULATE` | `0` + Stripe keys when going live on payments |

## Agent verification checklist (run before handing over any URL)

1. homepage loads (Arabic RTL) 2. `/api/healthz` 200 3. account creation
4. username validation (short/reserved/duplicate rejected) 5. login + session
6. no failed fetches 7. no tunnel errors 8. independence from the agent session
(deployment lives entirely on the host).
