'use strict';
/* ============================================================
   VEXORA — Server Configuration
   All secrets come from environment variables (or a .env file
   placed in the project root — see config.example.env).
   ============================================================ */
const fs = require('fs');
const path = require('path');

/* tiny .env loader (no dependency needed) */
const envFile = path.join(__dirname, '..', '.env');
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, 'utf-8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const env = (k, d) => (process.env[k] !== undefined ? process.env[k] : d);
const bool = (k, d) => env(k, d ? '1' : '0') === '1' || env(k, d) === 'true';

const cfg = {
  PORT: parseInt(env('PORT', '3000'), 10),
  HOST: env('HOST', '0.0.0.0'),
  DB_PATH: env('DB_PATH', path.join(__dirname, '..', 'data', 'vexora.db')),

  /* economy */
  WELCOME_VC: parseInt(env('WELCOME_VC', '1000'), 10),
  DAILY_VC: parseInt(env('DAILY_VC', '500'), 10),
  DAILY_COOLDOWN_H: parseFloat(env('DAILY_COOLDOWN_H', '12')),
  C4_ENTRY: parseInt(env('C4_ENTRY', '100'), 10),
  C4_POT: parseInt(env('C4_POT', '250'), 10),
  C4_AI_WIN: parseInt(env('C4_AI_WIN', '150'), 10),
  ELO_K: parseInt(env('ELO_K', '32'), 10),

  /* sessions */
  SESSION_DAYS: parseInt(env('SESSION_DAYS', '30'), 10),
  COOKIE_SECURE: bool('COOKIE_SECURE', false),

  /* admin bootstrap (change immediately in production) */
  ADMIN_EMAIL: env('ADMIN_EMAIL', 'admin@vexora.gg'),
  ADMIN_USER: env('ADMIN_USER', 'VEXORA_Admin'),
  ADMIN_PASS: env('ADMIN_PASS', 'admin123'),

  /* ── Payments ─────────────────────────────────────────────
     Real card payments use Stripe. Until keys are configured,
     the platform runs its "dev/manual" provider:
       • orders go through the SAME settlement pipeline,
       • settlement is triggered by an admin approval or the
         clearly-labelled dev simulator (PAYMENTS_SIMULATE).
     Required to enable Stripe:
       STRIPE_SECRET_KEY=sk_live_... / sk_test_...
       STRIPE_WEBHOOK_SECRET=whsec_...
     ──────────────────────────────────────────────────────── */
  STRIPE_SECRET_KEY: env('STRIPE_SECRET_KEY', ''),
  STRIPE_WEBHOOK_SECRET: env('STRIPE_WEBHOOK_SECRET', ''),
  STRIPE_API: 'https://api.stripe.com/v1',
  PAYMENTS_SIMULATE: bool('PAYMENTS_SIMULATE', true),

  /* keep-awake: on hosts that sleep idle instances (Render free etc.),
     set SELF_PING_URL to the live https URL and the server pings itself
     every 4 minutes so the instance stays warm */
  SELF_PING_URL: env('SELF_PING_URL', ''),

  /* ghost rooms / sessions hygiene (ms) */
  STALE_OPEN_MS: parseInt(env('STALE_OPEN_MS', '120000'), 10),
  STALE_AI_MS: parseInt(env('STALE_AI_MS', '180000'), 10),
  STALE_BOTH_OFFLINE_MS: parseInt(env('STALE_BOTH_OFFLINE_MS', '180000'), 10),

  /* realtime */
  RT_POLL_TIMEOUT_S: parseInt(env('RT_POLL_TIMEOUT_S', '25'), 10),
  PRESENCE_WINDOW_S: parseInt(env('PRESENCE_WINDOW_S', '45'), 10),

  /* rate limits (requests / window per IP) */
  RL_AUTH: parseInt(env('RL_AUTH', '15'), 10),
  RL_GLOBAL: parseInt(env('RL_GLOBAL', '400'), 10),

  IS_PROD: bool('IS_PROD', false)
};

cfg.PAYMENTS_STRIPE_READY = !!cfg.STRIPE_SECRET_KEY;

module.exports = cfg;
