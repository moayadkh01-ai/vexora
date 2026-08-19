# VEXORA — Phone Deployment Guide (Railway, ~3 minutes)

Everything below is done **from your phone browser**. The moment you paste the
token into the chat, the agent deploys the platform and returns the verified
permanent URL.

---

## On your phone (5 taps)

1. **Open** `railway.app` → **Login / Sign up** → tap **Continue with Google**
   (or email — free trial credit, **no credit card**).
2. Tap **New Project** → choose **Empty Project**.
3. Open **Project Settings** (⚙ top-right) → **Tokens**.
4. Tap **Publish** → **copy the token** shown.
5. **Paste the token into the chat.**

> The token only allows deploying into this one project. You can revoke it
> anytime (same screen → Delete).

## What the agent does with it (fully automated)

| Step | Command (already written & staged) |
|---|---|
| Deploy the platform | `scripts/deploy-railway.sh` → `railway up` |
| Production env | `NODE_ENV`, `DB_PATH=/data/vexora.db`, `COOKIE_SECURE`, `ADMIN_PASS` |
| Persistent storage | Volume mounted at `/data` (accounts & coins survive restarts/deploys) |
| Public URL | `railway domain` → permanent `https://….up.railway.app` (WebSockets ✓) |
| Verification | `scripts/verify-permanent.js` — full acceptance checklist |

---

## After deployment

### 1) The live URL
`https://<your-domain>.up.railway.app` — works 24/7 from any mobile browser,
WebSockets included (real-time multiplayer). Keep the tab open on two devices
to test live matchmaking.

### 2) Admin Dashboard — exact route & credentials
- **URL:** `https://<your-domain>.up.railway.app/#/admin`
- **Login first** at `#/auth` with:
  - **Email/username:** `admin@vexora.gg`
  - **Password:** the `ADMIN_PASS` variable (default `admin123` — change it!)
- The «الإدارة / Admin» item also appears in the menu once signed in as admin.
- Capabilities: live KPIs, player search, **ban/unban**, **grant coins**,
  order approvals, wallet audit log, and **⬇ one-tap database backup**.

### 3) SQLite database — management & backup
- **Location:** `/data/vexora.db` on the persistent volume (set via `DB_PATH`).
  All accounts, coins, rooms, friendships, orders and audit logs live there.
- **Backup (from your phone):** sign in as admin → Admin Dashboard →
  **⬇ Download DB backup** — streams a checkpointed copy of the database.
  (Direct link: `https://<domain>/api/admin/db-backup?token=<admin-token>`.)
- **Restore / inspect:** the file is a standard SQLite DB — open it with any
  SQLite browser (e.g. sqlitebrowser.org), or restore by replacing
  `/data/vexora.db` (Railway dashboard → your service → Volumes).
- **Snapshots:** Railway also keeps volume backups (Settings → Volumes).

---

## Alternative hosts (same repo, ready as-is)
- **Render:** `render.yaml` blueprint included (needs GitHub + Render API key).
- **Docker / any VPS:** `Dockerfile` + `scripts/deploy-vps.sh` included.
