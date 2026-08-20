# NoirCue · نواركيو — Online Multiplayer Gaming Platform

A real client–server gaming platform: **Node.js + Express + SQLite + WebSockets**, with a fully **Arabic RTL** player interface on the original NoirCue brand.

n> **Permanent 24/7 hosting:** see [DEPLOY.md](DEPLOY.md) — provide one credential (Railway token / Render key / VPS SSH) and the agent deploys + verifies it.
> **العب بلا حدود · Play Beyond Limits**

---

## Quick start

```bash
npm install
npm start          # → http://localhost:3000
```

## Public URL (live)

The platform is currently published through a Cloudflare tunnel:

> **<span>https://sandra-patch-prize-variable.trycloudflare.com</span>**

- Works from any browser worldwide (HTTPS + WebSockets).
- The current URL is always recorded in `data/PUBLIC_URL`.
- If the tunnel was stopped, bring everything back with one command:

```bash
bash scripts/tunnel.sh        # starts server (if needed) + tunnel, prints the live URL
cat data/PUBLIC_URL           # the current public URL
```

The tunnel supervisor (`scripts/tunnel.sh`) is self-healing: it restarts the
server if it dies, **reinstalls dependencies automatically** if the workspace
was restored from a snapshot, and **probes the public URL every 45s** — if the
edge connection goes stale (HTTP 530) it recycles the tunnel and records the
new link in `data/PUBLIC_URL`.

The quick-tunnel subdomain can change if the tunnel recycles — `data/PUBLIC_URL`
always holds the live link. For a **fixed, never-changing domain**, either:
- create a named Cloudflare tunnel (`cloudflared tunnel login && cloudflared
  tunnel create noircue`) and add `--token <TUNNEL_TOKEN>` to the script, or
- deploy to any Node host (Render/Railway/VPS): `npm install && npm start`.
  No code changes needed.

- The **admin account** is bootstrapped on first run: `admin@noircue.gg` / `admin123` (change via `.env`).
- Players register their own accounts (welcome bonus **+1,000 VC** credited on the server).
- All state (accounts, wallets, rooms, inventory, orders, friendships) persists in `data/noircue.db`.

## Tests

```bash
npm test           # 100 end-to-end backend checks (auth, wallet, store, payments,
                   #  friends+challenges, rooms, matchmaking over WS, two game engines,
                   #  settlement, security: forged tokens, bans, replay attacks…)
npm run test:dom   # 35 DOM checks: boots the real server and drives the real Arabic
                   #  RTL frontend in a real DOM through a full player journey
                   #  (match → moves → chat → wallet → store → Reversi → reload-
                   #  reconnect → admin dashboard)
```

## Architecture

```
server/                    ← all game logic & money is server-authoritative
├── index.js      HTTP + static client + WebSocket upgrade + timers
├── config.js     env config (.env supported — see config.example.env)
├── db.js         SQLite (WAL) schema + prepared statements
├── auth.js       scrypt hashing · opaque session tokens (hashed at rest) ·
│                 walletMove() — the ONLY path that moves NoirCue Coins
├── security.js   rate limiting · input validation · sanitization
├── games.js      game engines (pluggable): NoirCue Connect + NoirCue Reversi
│                 (أوثيلو) — turns, legality, auto-pass, wins, server AI
├── matchmaker.js queue → rating-based pairing → rooms → settlement (Elo, pots)
├── rt.js         realtime hub: every event persisted with a seq number and
│                 delivered over WebSocket, with authenticated long-poll on
│                 the same event log as automatic fallback
├── payments.js   payment architecture (see below)
├── api.js        REST API (validated, rate-limited, role-guarded)
└── seed.js       store catalog + admin bootstrap

public/           Arabic RTL single-page client (NoirCue design system)
test/             e2e + DOM integration suites
```

### Games (both live & server-authoritative)
- **NoirCue Connect (نواركيو كونكت)** — four-in-a-row, 7×6
- **NoirCue Reversi (أوثيلو)** — 8×8, server-enforced flips, automatic pass when
  stuck, end by double-pass/full board, winner by disc majority
- Practice vs a positional server AI, or ranked PvP through matchmaking/rooms
- Leaving a live human match concedes (pot to opponent); abandoning AI practice closes the table

### Realtime
`GET /api/...` for reads/mutations, `WS /rt?token=…` for pushes
(`match:found`, `room:update`, `chat:new`, `wallet:update`, `presence`,
`friend:*`, `force:logout`). If a proxy blocks WebSockets, the client
transparently switches to `GET /api/rt/poll` — same event log, same seq cursor.

### Payments (integration-ready, honestly labelled)
One settlement pipeline (`settleOrder`) — idempotent, transactional — with two providers:

| Provider | Status | How it activates |
|---|---|---|
| **Stripe** | Structure ready | Set `STRIPE_SECRET_KEY` + `STRIPE_WEBHOOK_SECRET` in `.env`, add webhook `https://YOUR_DOMAIN/api/pay/webhook/stripe` (event `checkout.session.completed`). Until then the API returns `501 CONFIG_REQUIRED` with instructions instead of pretending. |
| **Manual / dev** | Active by default | Orders go `pending → paid` through the same pipeline via **admin approval** or the clearly-labelled **dev simulator** (`PAYMENTS_SIMULATE=1`), which stands in for the webhook. |

NoirCue Coin purchases (sticks, emoji packs, themes, frames) and VC→cash flows are fully live with real balances. Webhook signature verification (HMAC, timing-safe) included; replays are safely idempotent (tested).

### Security
- scrypt password hashing, timing-safe compares; session tokens stored hashed
- httpOnly cookies (+ Bearer for WS/tests), 30-day expiry, revocation on ban
- server-authoritative game state — out-of-turn/illegal moves rejected (tested)
- wallet ledger with balance invariants — no client can set a balance
- rate limiting (auth + global), input validation, JSON body limits, security headers
- role-guarded admin APIs; banned users revoked instantly across sessions

## Player features (Arabic RTL)
Registration & login · persistent accounts · lobby with live presence ·
create/join rooms (public or by 6-char code) · rating-based matchmaking ·
**NoirCue Connect** playable online (or practice vs server AI) · server-paid
pots & Elo · room chat with **premium emoji packs** (ownership enforced by the
server) · **premium cue sticks** (equip shown in room) · wallet with daily
bonus & VIP multipliers · NoirCue Store (coin packs, VIP, cosmetics) ·
inventory & equipping · friends (requests/presence + **real challenges**:
create a private room and invite a friend over realtime) · public player
profiles · **reconnect**: reload the page mid-match and you're dropped straight
back into your live room · VIP memberships with server-enforced expiry ·
notifications · loading screen · mobile-responsive (drawer + bottom nav).

Admin (staff-facing, EN/LTR): live KPIs, DAU chart, matches by game, player
search, ban/unban, coin grants, order approval, wallet audit log.

## Deployment notes
- `npm install && npm start` behind any reverse proxy (nginx/Caddy).
- WebSockets: proxy `/rt` with `Upgrade` headers; the long-poll fallback needs nothing.
- Database: SQLite file at `DB_PATH` (zero-config). For very large scale, the DAO
  in `db.js` maps 1:1 to Postgres tables — swap the driver, keep the schema.
- Set `IS_PROD=1`, `COOKIE_SECURE=1`, rotate `ADMIN_PASS`, disable
  `PAYMENTS_SIMULATE` and configure Stripe for production.

## Files
| Path | Purpose |
|---|---|
| `public/` | Arabic RTL client (`index.html`, `core.js`, `views.js`, `room.js`, `style.css`) |
| `server/` | Node.js backend |
| `test/` | `e2e.js` (78 checks) · `dom.js` (27 checks) |
| `config.example.env` | documented configuration template |
| `brand.html`, `noircue-logo.svg` | brand identity files (also served at `/brand.html`) |
