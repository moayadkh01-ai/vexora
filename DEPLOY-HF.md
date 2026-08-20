# NoirCue — Free 24/7 Deployment on Hugging Face Spaces (no credit card)

**Why HF Spaces:** 100% free forever, signup needs **email only** (no card),
runs full Docker with **WebSockets** (real-time multiplayer ✓), public URL
`https://{your-name}-noircue.hf.space`, and — with the persistence layer built
into this repo (`server/hf-sync.js`) — your SQLite database is auto-backed-up
every 3 minutes to a **private** HF repo and auto-restored on every restart,
so accounts and coins never disappear. A built-in self-ping keeps the Space
awake (free Spaces sleep after 48h of zero visits).

---

## On your phone (4 taps, ~2 minutes)

1. Open **huggingface.co** → **Sign Up** (name + email + password → confirm
   the email from your inbox) — **no credit card, ever**.
2. Tap your avatar → **Settings** → **Access Tokens**.
3. **New token** → name `noircue` → type **Write** → **Create** → copy it.
4. **Paste the token in the chat.**

> The token can only write repos in your account. Revoke it anytime from the
> same screen after deployment.

## What the agent runs (fully automated, already staged)

```
HF_TOKEN=hf_xxx bash scripts/deploy-hf.sh
```
1. Creates **private dataset repo** `{you}/noircue-db` → permanent DB backups
   (your players' data stays private — the Space itself is public).
2. Creates the **public Docker Space** `{you}/noircue` and uploads the app.
3. Sets secrets: `HF_TOKEN`, `HF_REPO`, `DB_PATH`, `ADMIN_PASS`,
   `SELF_PING_URL` (keeps it awake), `HF_BACKUP_MIN=3`.
4. Build finishes in ~2–4 min → `https://{you}-noircue.hf.space` is live 24/7.
5. Agent verifies with `scripts/verify-permanent.js` (18 checks) and hands
   you the URL.

## After deployment

- **App:** `https://{you}-noircue.hf.space` (Arabic RTL, WebSockets, mobile).
- **Admin:** `https://{you}-noircue.hf.space/#/admin` — sign in at `#/auth`
  with `admin@noircue.gg` + the `ADMIN_PASS` you chose (default `admin123`).
- **DB backup:** Admin dashboard → **⬇ Download DB backup**
  (checkpointed SQLite, opens in any SQLite browser).
- **DB restore:** replace `backup.db.gz` in the private `noircue-db` repo, or
  upload a `.db` via the dashboard — the app restores it on next restart.

## Notes
- Free hardware (2 vCPU / 16 GB) is far more than this app needs.
- If the Space is ever paused manually, opening the URL wakes it in ~30s and
  the database restores automatically from the hub.
- Railway/Render/VPS/Docker remain available as one-command upgrades
  (`DEPLOY.md`, `scripts/deploy-railway.sh`, `scripts/deploy-vps.sh`).
