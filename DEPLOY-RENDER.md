# VEXORA — Render Free Path (no credit card)

**How the free tier's two big problems are solved in this repo:**
1. *Sleeps after 15 min idle* → `SELF_PING_URL` env makes the app ping its own
   public URL every 4 minutes → **never sleeps**.
2. *Ephemeral disk (DB wiped on every deploy/wake)* → `server/hf-sync.js`
   backs up SQLite every 3 minutes to a **private Hugging Face repo**
   (HF *storage* is still free — only Spaces compute is paid) and restores it
   automatically on every boot → **accounts & coins survive**.

---

## What you provide (3 items, all from your phone)

### 1️⃣ GitHub token (for pushing the code)
1. **github.com** → Sign up / log in (email is enough)
2. Avatar → **Settings** → Developer settings (bottom) → **Personal access tokens** → **Tokens (classic)**
3. **Generate new token (classic)** → note: `vexora` → expiration: 30 days →
   tick ✅ **repo** → **Generate** → copy → paste it in the chat

### 2️⃣ Render API key (for creating the service)
1. **render.com** → **Get Started** → sign up with **Google** (no card asked)
2. Avatar → **Account Settings** → **API Keys** → **Create API Key**
   → name `vexora` → copy → paste it in the chat

### 3️⃣ One-time: create the private backup repo on HF (you already have the account)
1. **huggingface.co** → **＋** → **New Dataset**
2. Name: `vexora-db` · Visibility: **Private** → **Create dataset**
(Your existing HF token already has write access to it — paste it again if
the chat lost it.)

---

## What the agent then runs (fully automated)

```
GH_TOKEN=… RENDER_API_KEY=… HF_TOKEN=… HF_REPO=MoayadQ8/vexora-db \
  bash scripts/deploy-render.sh
```
1. Creates the public GitHub repo `yourname/vexora` and pushes the app
   (no secrets inside — all secrets live in Render's env).
2. Creates the **free** Render web service (Node, Frankfurt, health-checked).
3. Sets environment: `ADMIN_PASS`, `HF_TOKEN`, `HF_REPO`, `SELF_PING_URL`,
   `COOKIE_SECURE`.
4. Build ~3-5 min → **https://vexora.onrender.com** (WebSockets supported).
5. Agent runs the 18-point acceptance check on the live URL, then hands it over.

> If Render's API refuses the API-created service (repo not "connected"),
> you do the connect once in the dashboard: **New → Web Service → Existing
> repository → vexora** (~6 taps) — everything after that is automated again.

## After go-live
- App: `https://vexora.onrender.com` · Admin: `/#/admin`
  (`admin@vexora.gg` + your `ADMIN_PASS`)
- DB backups: **⬇ Download DB backup** button in the admin dashboard +
  auto-backup every 3 min to your private HF dataset.
