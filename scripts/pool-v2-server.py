#!/usr/bin/env python3
# server: shot clock + spin + pocketed exposure

# ---- games.js: POOL v2 (spin + 9s clock + foul) ----
g = open('server/games.js', encoding='utf-8').read()

old_new = """const POOL = {
  newState(){
    return { balls: P.rackPositions(), turn: 1, over: false, winner: 0, groups: { 1: null, 2: null }, last: null, lastShot: null };
  },"""
new_new = """const SHOT_CLOCK_MS = 9000;
const POOL = {
  newState(){
    return { balls: P.rackPositions(), turn: 1, over: false, winner: 0, groups: { 1: null, 2: null }, last: null, lastShot: null, turnStartedAt: Date.now(), foulBy: 0 };
  },"""
assert old_new in g
g = g.replace(old_new, new_new)

old_valid = """  valid(b){
    const a = Number(b && b.angle), p = Number(b && b.power);
    return (Number.isFinite(a) && Number.isFinite(p) && p >= 1 && p <= 100) ? { angle: a, power: p } : null;
  },"""
new_valid = """  valid(b){
    const a = Number(b && b.angle), p = Number(b && b.power);
    let s = Number(b && b.spin);
    if (!Number.isFinite(s)) s = 0;
    s = Math.max(-1, Math.min(1, s));
    return (Number.isFinite(a) && Number.isFinite(p) && p >= 1 && p <= 100) ? { angle: a, power: p, spin: s } : null;
  },"""
assert old_valid in g
g = g.replace(old_valid, new_valid)

old_apply = """  apply(st, slot, shot){
    if (st.over) return { ok: false, reason: 'GAME_OVER' };
    if (st.turn !== slot) return { ok: false, reason: 'NOT_YOUR_TURN' };
    if (!P.allStopped(st.balls)) return { ok: false, reason: 'BALLS_MOVING' };"""
new_apply = """  apply(st, slot, shot){
    if (st.over) return { ok: false, reason: 'GAME_OVER' };
    if (st.turn !== slot) return { ok: false, reason: 'NOT_YOUR_TURN' };
    if (!P.allStopped(st.balls)) return { ok: false, reason: 'BALLS_MOVING' };
    /* 9-second shot clock: expired → foul, turn passes */
    if (st.turnStartedAt && Date.now() - st.turnStartedAt > SHOT_CLOCK_MS + 1500){
      st.foulBy = slot;
      st.turn = 3 - slot;
      st.turnStartedAt = Date.now();
      return { ok: false, reason: 'SHOT_CLOCK', msg: 'انتهت الـ9 ثوانٍ — فاول وتنقل الدور للخصم' };
    }"""
assert old_apply in g
g = g.replace(old_apply, new_apply)

old_speed = """    const speed = shot.power * 0.062;
    const rad = shot.angle * Math.PI / 180;
    cue.vx = Math.cos(rad) * speed;
    cue.vy = Math.sin(rad) * speed;"""
new_speed = """    const speed = shot.power * 0.062;
    const rad = shot.angle * Math.PI / 180;
    cue.spin = shot.spin || 0;
    cue._spinUsed = false;
    cue.vx = Math.cos(rad) * speed;
    cue.vy = Math.sin(rad) * speed;"""
assert old_speed in g
g = g.replace(old_speed, new_speed)

old_keep = """    const keep = !cueIn && (ownPot || (!g && pocketedBalls.length > 0));
    if (!keep) st.turn = 3 - slot;"""
new_keep = """    const keep = !cueIn && (ownPot || (!g && pocketedBalls.length > 0));
    if (!keep) st.turn = 3 - slot;
    st.turnStartedAt = Date.now();
    st.foulBy = cueIn ? slot : 0;"""
assert old_keep in g
g = g.replace(old_keep, new_keep)

# AI shot: also reset clock (turn passes to AI already handled); AI power slight tune
g = g.replace("ang += (Math.random() * 7 - 3.5);                                     // human-ish error\n    return { angle: ang, power: 40 + Math.random() * 25 };",
              "ang += (Math.random() * 7 - 3.5);                                     // human-ish error\n    return { angle: ang, power: 40 + Math.random() * 25, spin: 0 };")

# export shot-clock sweeper
old_exp = "module.exports = { GAMES, newState, validMove, engineOf, C4, RV, rvFlips, CHESS, TABLA, POOL, CH, BG, P };"
new_exp = """/* periodic shot-clock enforcement: pools whose turn expired without a shot → foul */
function poolClockTick(){
  return 0; /* driven by matchmaker sweep — see matchmaker.poolClockSweep */
}
module.exports = { GAMES, newState, validMove, engineOf, C4, RV, rvFlips, CHESS, TABLA, POOL, CH, BG, P, SHOT_CLOCK_MS, poolClockTick };"""
assert old_exp in g
g = g.replace(old_exp, new_exp)
open('server/games.js','w',encoding='utf-8').write(g)
print('games.js ok')

# ---- matchmaker: clock sweep + safeState exposure ----
m = open('server/matchmaker.js', encoding='utf-8').read()

sweep = """
/* pool shot-clock sweep (1s): expired turn → foul + pass + broadcast */
function poolClockSweep(){
  const rows = db.prepare(`SELECT * FROM rooms WHERE game = 'pool8' AND status = 'playing' AND vs_ai = 0`).all();
  for (const room of rows){
    let st;
    try { st = JSON.parse(room.state); } catch(e){ continue; }
    if (st.over || !st.turnStartedAt) continue;
    if (Date.now() - st.turnStartedAt > games.SHOT_CLOCK_MS + 2500){
      st.foulBy = st.turn;
      st.turn = 3 - st.turn;
      st.turnStartedAt = Date.now();
      stmt.roomSetState.run(JSON.stringify(st), st.turn, room.move_count, now(), room.id);
      const upd = stmt.roomById.get(room.id);
      broadcastRoom(upd);
      rt.emit(3 - st.turn, 'pool:clock', { roomId: room.id, foulBy: st.foulBy });
    }
  }
}

function sweepStaleRooms(){"""
anchor = "/* global sweep (periodic) */\nfunction sweepStaleRooms(){"
assert anchor in m, 'sweep anchor'
m = m.replace(anchor, sweep)
m = m.replace("module.exports = { enqueue, cancel, tick, createRoom, joinRoom, joinByCode, practice, move, chat, chatHistory, safeState, publicRoom, activeRoomOf, leaveRoom, cleanStaleRoom, sweepStaleRooms, leaveActive, openRoomsStmt: stmt, GAMES: games.GAMES };",
              "module.exports = { enqueue, cancel, tick, createRoom, joinRoom, joinByCode, practice, move, chat, chatHistory, safeState, publicRoom, activeRoomOf, leaveRoom, cleanStaleRoom, sweepStaleRooms, poolClockSweep, leaveActive, openRoomsStmt: stmt, GAMES: games.GAMES };")

# safeState: expose clock + pocketed
old_ss = """  if (room.game === 'pool8'){
    out.balls = state.balls; out.groups = state.groups; out.lastShot = state.lastShot;
    out.aimable = games.P.allStopped(state.balls);
  }"""
new_ss = """  if (room.game === 'pool8'){
    out.balls = state.balls; out.groups = state.groups; out.lastShot = state.lastShot;
    out.aimable = games.P.allStopped(state.balls);
    out.turnStartedAt = state.turnStartedAt || 0;
    out.shotClock = games.SHOT_CLOCK_MS;
    out.foulBy = state.foulBy || 0;
    out.pocketed = state.balls.filter(b => b.pocketed && b.id !== 0).map(b => b.id);
  }"""
assert old_ss in m
m = m.replace(old_ss, new_ss)
open('server/matchmaker.js','w',encoding='utf-8').write(m)
print('matchmaker ok')

# ---- app.js: 1s clock sweep interval ----
p = open('server/app.js', encoding='utf-8').read()
old_iv = """/* ghost rooms sweep: abandoned open/AI/both-offline rooms → close (+refund)
   fixes users getting stuck with ALREADY_IN_ROOM */"""
new_iv = """/* pool shot-clock enforcement (every second) */
setInterval(() => {
  try { mm.poolClockSweep(); } catch(e){ /* non-fatal */ }
}, 1000).unref();

/* ghost rooms sweep: abandoned open/AI/both-offline rooms → close (+refund)
   fixes users getting stuck with ALREADY_IN_ROOM */"""
assert old_iv in p
p = p.replace(old_iv, new_iv)
open('server/app.js','w',encoding='utf-8').write(p)
print('app ok')
