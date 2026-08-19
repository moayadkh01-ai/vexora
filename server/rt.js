'use strict';
/* ============================================================
   VEXORA — Realtime hub
   Every outgoing event is persisted to the `events` table with a
   sequence number, then delivered over WebSocket. If WS is not
   reachable (restrictive proxies), the client transparently falls
   back to authenticated long-polling on the SAME event log, so
   both transports are guaranteed consistent.
   ============================================================ */
const { WebSocketServer } = require('ws');
const { db, now, q, cfg } = require('./db');

/* ---------- outbound event bus ---------- */
const sockets = new Map();   // userId -> Set<ws>

function emit(userId, type, data){
  const t = now();
  const r = q.evIns.run(userId, type, JSON.stringify(data || {}), t);
  const seq = Number(r.lastInsertRowid);
  const ev = { seq, type, data: data || {}, at: t };
  deliver(userId, ev);
  return ev;
}
function deliver(userId, ev){
  const set = sockets.get(userId);
  if (!set) return;
  const msg = JSON.stringify({ t: 'event', ev });
  for (const ws of set){ if (ws.readyState === 1) ws.send(msg); }
}
function emitMany(userIds, type, data){ userIds.forEach(id => emit(id, type, data)); }
function broadcastOnline(userIds, type, data){ userIds.forEach(id => deliverOnly(id, { seq: 0, type, data, at: now() })); }
function deliverOnly(userId, ev){
  const set = sockets.get(userId);
  if (set) for (const ws of set){ if (ws.readyState === 1) ws.send(JSON.stringify({ t: 'event', ev })); }
}

/* ---------- presence ---------- */
function isOnline(user){ return now() - user.last_seen < cfg.PRESENCE_WINDOW_S * 1000; }
function onlineUserIds(){
  return db.prepare(`SELECT id FROM users WHERE last_seen > ? AND banned = 0`).all(now() - cfg.PRESENCE_WINDOW_S * 1000).map(r => r.id);
}

/* long-poll: wait until new events for this user or timeout */
function pollEvents(userId, cursor, timeoutMs, cb){
  const started = now();
  (function wait(){
    const rows = q.evSince.all(userId, cursor);
    if (rows.length || now() - started >= timeoutMs){
      cb(rows.map(r => ({ seq: r.seq, type: r.type, data: JSON.parse(r.data), at: r.created_at })));
      return;
    }
    setTimeout(wait, 400);
  })();
}

/* ---------- WebSocket server ---------- */
function attach(httpServer, verifyToken){
  const wss = new WebSocketServer({ server: httpServer, path: '/rt' });

  wss.on('connection', (ws, req) => {
    let userId = null;
    try {
      const url = new URL(req.url, 'http://x');
      const token = url.searchParams.get('token') || '';
      userId = verifyToken(token);
    } catch(e){ userId = null; }
    if (!userId){ ws.close(4001, 'AUTH'); return; }

    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });
    if (!sockets.has(userId)) sockets.set(userId, new Set());
    sockets.get(userId).add(ws);

    /* client may push lightweight ops (moves/chat typing) — heavy logic stays in REST */
    ws.on('message', raw => {
      if (raw.length > 2048) return;
      let msg = null;
      try { msg = JSON.parse(raw); } catch(e){ return; }
      if (!msg || typeof msg.t !== 'string') return;
      if (msg.t === 'hb'){ ws.isAlive = true; if (req.userTouch) req.userTouch(userId); ws.send('{"t":"hb-ok"}'); return; }
      if (msg.t === 'cursor-sync'){ /* informational only */ return; }
    });

    ws.on('close', () => {
      const set = sockets.get(userId);
      if (set){ set.delete(ws); if (!set.size) sockets.delete(userId); }
    });
  });

  /* dead connection sweep */
  const sweep = setInterval(() => {
    for (const ws of wss.clients){
      if (ws.isAlive === false){ ws.terminate(); continue; }
      ws.isAlive = false;
      try { ws.ping(); } catch(e){}
    }
  }, 30000);
  sweep.unref();

  return wss;
}

/* event log cleanup */
setInterval(() => { q.evPrune.run(now() - 3600e3); }, 15 * 60e3).unref();

module.exports = { emit, emitMany, deliverOnly, broadcastOnline, pollEvents, attach, sockets, onlineUserIds, isOnline };
