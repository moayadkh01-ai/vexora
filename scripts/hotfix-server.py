#!/usr/bin/env python3
# VEXORA hotfix patcher (UI portrait + ALREADY_IN_ROOM)
import re, sys

# 1) config: stale thresholds
c = open('server/config.js', encoding='utf-8').read()
old = "  /* realtime */"
new = """  /* ghost rooms / sessions hygiene (ms) */
  STALE_OPEN_MS: parseInt(env('STALE_OPEN_MS', '120000'), 10),
  STALE_AI_MS: parseInt(env('STALE_AI_MS', '180000'), 10),
  STALE_BOTH_OFFLINE_MS: parseInt(env('STALE_BOTH_OFFLINE_MS', '180000'), 10),

  /* realtime */"""
assert old in c, 'config anchor'
open('server/config.js','w',encoding='utf-8').write(c.replace(old, new))
print('config ok')

# 2) matchmaker: hygiene helpers + use in entry points
m = open('server/matchmaker.js', encoding='utf-8').read()

helper = """
/* ---------- stale-room hygiene (fix: ALREADY_IN_ROOM lock) ---------- */
const msCfg = () => require('./config');
function staleRoomVerdict(room, t){
  const cfg = msCfg();
  if (room.status === 'open' && room.last_activity < t - cfg.STALE_OPEN_MS) return 'open';
  if (room.vs_ai && room.status === 'playing' && room.last_activity < t - cfg.STALE_AI_MS) return 'ai';
  if (!room.vs_ai && room.status === 'playing' && room.guest_id && room.last_activity < t - cfg.STALE_BOTH_OFFLINE_MS){
    const h = q.userById.get(room.host_id), g = q.userById.get(room.guest_id);
    if (h && g && t - h.last_seen > cfg.STALE_BOTH_OFFLINE_MS && t - g.last_seen > cfg.STALE_BOTH_OFFLINE_MS) return 'both-offline';
  }
  return null;
}
function disposeRoom(room, mode){
  const t = now();
  tx(() => {
    if (mode === 'open') walletMove(room.host_id, room.entry, 'إغلاق غرفة مهجورة — استرجاع الرسوم', 'room:' + room.id);
    if (mode === 'both-offline'){
      walletMove(room.host_id, room.entry, 'إغلاق مباراة متروكة — استرجاع الرسوم', 'room:' + room.id);
      walletMove(room.guest_id, room.entry, 'إغلاق مباراة متروكة — استرجاع الرسوم', 'room:' + room.id);
    }
    stmt.roomClose.run(t, t, room.id);
  })();
  rt.emit(room.host_id, 'room:update', { room: { id: room.id, status: 'closed', over: true, winner: 0 } });
  if (room.guest_id) rt.emit(room.guest_id, 'room:update', { room: { id: room.id, status: 'closed', over: true, winner: 0 } });
}
function cleanStaleRoom(userId){
  let guard = 0;
  while (guard++ < 5){
    const room = activeRoomOf(userId);
    if (!room) return null;
    const verdict = staleRoomVerdict(room, now());
    if (!verdict) return room;
    disposeRoom(room, verdict);
  }
  return activeRoomOf(userId);
}
function sweepStaleRooms(){
  const t = now();
  const rows = db.prepare('SELECT * FROM rooms WHERE status != ? AND last_activity < ?').all('closed', t - msCfg().STALE_OPEN_MS);
  let n = 0;
  for (const room of rows){
    const v = staleRoomVerdict(room, t);
    if (v){ disposeRoom(room, v); n++; }
  }
  return n;
}
function leaveActive(user){
  const room = activeRoomOf(user.id);
  if (!room) return { ok: true, none: true };
  const res = leaveRoom(user, room.id);
  return res.err ? res : Object.assign({ ok: true }, res);
}

"""
anchor = "const roomCode = () => crypto.randomBytes(3).toString('hex').toUpperCase();"
assert anchor in m, 'roomCode anchor'
m = m.replace(anchor, helper + anchor, 1)

m = m.replace("  if (stmt.qGet.get(user.id)) return { err: 'ALREADY_QUEUED' };\n  if (activeRoomOf(user.id)) return { err: 'ALREADY_IN_ROOM' };",
              "  if (stmt.qGet.get(user.id)) return { err: 'ALREADY_QUEUED' };\n  if (cleanStaleRoom(user.id)) return { err: 'ALREADY_IN_ROOM', msg: 'لديك غرفة أو مباراة جارية — عد إليها أو غادرها من اللوبي' };")

# createRoom guard
old_cr = "  if (activeRoomOf(user.id)) return { err: 'ALREADY_IN_ROOM' };\n  stmt.qDel.run(user.id);\n  const g = games.GAMES[game];"
new_cr = "  if (cleanStaleRoom(user.id)) return { err: 'ALREADY_IN_ROOM', msg: 'لديك غرفة أو مباراة جارية — عد إليها أو غادرها من اللوبي' };\n  stmt.qDel.run(user.id);\n  const g = games.GAMES[game];"
assert old_cr in m, 'createRoom guard'
m = m.replace(old_cr, new_cr)

# practice guard
old_pr = "  if (activeRoomOf(user.id)) return { err: 'ALREADY_IN_ROOM' };\n  stmt.qDel.run(user.id);\n  const state = games.newState(game);\n  const t = now();"
new_pr = "  if (cleanStaleRoom(user.id)) return { err: 'ALREADY_IN_ROOM', msg: 'لديك غرفة أو مباراة جارية — عد إليها أو غادرها من اللوبي' };\n  stmt.qDel.run(user.id);\n  const state = games.newState(game);\n  const t = now();"
assert old_pr in m, 'practice guard'
m = m.replace(old_pr, new_pr)

m = m.replace("module.exports = { enqueue, cancel, tick, createRoom, joinRoom, joinByCode, practice, move, chat, chatHistory, safeState, publicRoom, activeRoomOf, leaveRoom, openRoomsStmt: stmt, GAMES: games.GAMES };",
              "module.exports = { enqueue, cancel, tick, createRoom, joinRoom, joinByCode, practice, move, chat, chatHistory, safeState, publicRoom, activeRoomOf, leaveRoom, cleanStaleRoom, sweepStaleRooms, leaveActive, openRoomsStmt: stmt, GAMES: games.GAMES };")
open('server/matchmaker.js','w',encoding='utf-8').write(m)
print('matchmaker ok')

# 3) api.js: leave-active endpoint
a = open('server/api.js', encoding='utf-8').read()
old_ep = "api.post('/rooms/:id/leave', (req, res) => {"
new_ep = """api.post('/rooms/leave-active', (req, res) => {
  const r = mm.leaveActive(req.user);
  if (r.ok) return ok(res, r);
  return fail(res, statusOf(r), r.err, r.msg);
});

api.post('/rooms/:id/leave', (req, res) => {"""
assert old_ep in a, 'api endpoint anchor'
a = a.replace(old_ep, new_ep, 1)
open('server/api.js','w',encoding='utf-8').write(a)
print('api ok')

# 4) app.js: periodic sweep + ghost-session purge, replace old stale-open cleanup
p = open('server/app.js', encoding='utf-8').read()
old_clean = """/* room cleanup: stale open rooms > 10 min → close & refund host */
setInterval(() => {
  const stale = db.prepare(`SELECT * FROM rooms WHERE status = 'open' AND last_activity < ?`).all(now() - 600e3);
  for (const room of stale){
    try {
      mm.leaveRoom({ id: room.host_id }, room.id);
      console.log('[rooms] stale room closed', room.id);
    } catch(e){ /* host may be gone */ }
  }
}, 60e3).unref();"""
new_clean = """/* ghost rooms sweep: abandoned open/AI/both-offline rooms → close (+refund)
   fixes users getting stuck with ALREADY_IN_ROOM */
setInterval(() => {
  try { const n = mm.sweepStaleRooms(); if (n) console.log('[rooms] swept', n, 'stale room(s)'); } catch(e){ console.error('[rooms] sweep', e.message); }
}, 30e3).unref();

/* ghost sessions purge: expired tokens removed from the DB */
setInterval(() => {
  try { db.prepare('DELETE FROM sessions WHERE expires_at < ?').run(now()); } catch(e){}
}, 10 * 60e3).unref();"""
assert old_clean in p, 'app cleanup anchor'
p = p.replace(old_clean, new_clean)
open('server/app.js','w',encoding='utf-8').write(p)
print('app ok')
print('ALL SERVER PATCHES APPLIED')
