'use strict';
/* ============================================================
   VEXORA — application (mounted by index.js AFTER db restore)
   Express REST + static client + WebSocket realtime + timers
   ============================================================ */
const express = require('express');
const path = require('path');
const http = require('http');
const cfg = require('./config');
const { db, now } = require('./db');
const { seed } = require('./seed');
const auth = require('./auth');
const rt = require('./rt');
const mm = require('./matchmaker');
const apiRouter = require('./api');
const hf = require('./hf-sync');

seed();


const app = express();
app.disable('x-powered-by');
/* capture raw body too — required for Stripe webhook signature verification */
app.use(express.json({ limit: '100kb', verify: (req, res, buf) => { req.rawBody = buf; } }));

/* CORS — the browser app is same-origin, but this keeps the API reachable
   from any origin/proxy (Bearer-token auth; no cross-site cookies) */
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Max-Age', '86400');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

/* security headers */
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  if (cfg.IS_PROD) res.setHeader('Strict-Transport-Security', 'max-age=31536000');
  next();
});

app.use(apiRouter);

/* static client */
const PUB = path.join(__dirname, '..', 'public');
app.use(express.static(PUB, { maxAge: 0, setHeaders: (res, p) => { if (p.endsWith('.html') || p.endsWith('.css') || p.endsWith('.js')) res.setHeader('Cache-Control', 'no-cache'); } }));

/* SPA fallback for non-API GETs */
app.use((req, res, next) => {
  if (req.method === 'GET' && !req.path.startsWith('/api/')) {
    return res.sendFile(path.join(PUB, 'index.html'));
  }
  next();
});

/* 404 + error handling */
app.use('/api', (req, res) => res.status(404).json({ ok: false, error: 'NO_ROUTE' }));
app.use((err, req, res, next) => {
  if (err && err.type === 'entity.parse.failed') return res.status(400).json({ ok: false, error: 'BAD_JSON', msg: 'طلب غير صالح' });
  if (err && err.type === 'entity.too.large') return res.status(413).json({ ok: false, error: 'TOO_LARGE' });
  console.error('[http]', err.message);
  res.status(500).json({ ok: false, error: 'SERVER', msg: 'خطأ في الخادم — حاول لاحقًا' });
});

const server = http.createServer(app);
/* keep-alive tuning: keep idle sockets open longer than typical client/LB pools
   so a request never lands on a socket the server is about to close */
server.keepAliveTimeout = 65000;
server.headersTimeout = 70000;

/* WebSocket /rt?token=… */
const { sha } = auth;
function verifyToken(token){
  const row = db.prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > ?').get(sha(String(token || '')), now());
  return row ? row.user_id : null;
}
rt.attach(server, verifyToken);

/* matchmaker tick */
const mmTimer = setInterval(() => {
  try { mm.tick(); } catch(e){ console.error('[mm]', e.message); }
}, 2000);
mmTimer.unref();

/* presence + lobby broadcast (delivered, not persisted) */
let lastPresence = '';
setInterval(() => {
  const ids = rt.onlineUserIds();
  const counts = {};
  db.prepare(`SELECT game, COUNT(*) c FROM rooms WHERE status = 'playing' GROUP BY game`).all()
    .forEach(r => { counts[r.game] = r.c * 2; });
  const openRooms = db.prepare(`SELECT COUNT(*) c FROM rooms WHERE status = 'open' AND privacy = 'public'`).get().c;
  const snap = JSON.stringify({ online: ids.length, counts, openRooms });
  if (snap !== lastPresence){
    lastPresence = snap;
    const payload = JSON.parse(snap);
    ids.forEach(id => rt.deliverOnly(id, { seq: 0, type: 'presence', data: payload, at: now() }));
  }
}, 6000);

/* ghost rooms sweep: abandoned open/AI/both-offline rooms → close (+refund)
   fixes users getting stuck with ALREADY_IN_ROOM */
setInterval(() => {
  try { const n = mm.sweepStaleRooms(); if (n) console.log('[rooms] swept', n, 'stale room(s)'); } catch(e){ console.error('[rooms] sweep', e.message); }
}, 30e3).unref();

/* ghost sessions purge: expired tokens removed from the DB */
setInterval(() => {
  try { db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now()); } catch(e){}
}, 10 * 60e3).unref();

/* optional keep-awake self-ping (free-tier hosts) */
if (cfg.SELF_PING_URL){
  const ping = setInterval(async () => {
    try { await fetch(cfg.SELF_PING_URL + '/api/healthz'); } catch(e){}
  }, 4 * 60 * 1000);
  ping.unref();
  console.log('self-ping keep-awake → ' + cfg.SELF_PING_URL);
}

server.listen(cfg.PORT, cfg.HOST, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  VEXORA (فيكسورا) server is live');
  console.log('  http://' + cfg.HOST + ':' + cfg.PORT);
  console.log('  db: ' + cfg.DB_PATH);
  console.log('  payments: ' + (cfg.PAYMENTS_STRIPE_READY ? 'STRIPE ✓' : 'manual/dev (see README for Stripe setup)'));
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
});

hf.start(cfg, db);
