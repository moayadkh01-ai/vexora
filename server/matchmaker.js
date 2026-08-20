'use strict';
/* ============================================================
   VEXORA — Matchmaker + room lifecycle + settlement
   Queue → pairing (rating window widens with wait) → room.
   All coin movement happens in SQLite transactions here.
   ============================================================ */
const crypto = require('crypto');
const { db, tx, now, q } = require('./db');
const { walletMove, notify } = require('./auth');
const rt = require('./rt');
const games = require('./games');

const stmt = {
  qAll: db.prepare('SELECT mm_queue.*, users.username, users.rating FROM mm_queue JOIN users ON users.id = mm_queue.user_id WHERE users.banned = 0 ORDER BY enqueued_at'),
  qDel: db.prepare('DELETE FROM mm_queue WHERE user_id = ?'),
  qGet: db.prepare('SELECT * FROM mm_queue WHERE user_id = ?'),
  qIns: db.prepare('INSERT INTO mm_queue (user_id, game, rating, enqueued_at) VALUES (?,?,?,?)'),
  roomIns: db.prepare(`INSERT INTO rooms (code,game,host_id,guest_id,status,vs_ai,privacy,state,turn,entry,pot,created_at,last_activity)
                       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`),
  roomById: db.prepare('SELECT * FROM rooms WHERE id = ?'),
  openRooms: db.prepare(`SELECT rooms.*, users.username AS host_name, users.rating AS host_rating, users.hue AS host_hue
                         FROM rooms JOIN users ON users.id = rooms.host_id
                         WHERE rooms.status = 'open' AND rooms.privacy = 'public' AND users.last_seen > ?
                         ORDER BY rooms.created_at DESC LIMIT 60`),
  roomSetState: db.prepare('UPDATE rooms SET state = ?, turn = ?, move_count = ?, last_activity = ? WHERE id = ?'),
  roomJoin: db.prepare(`UPDATE rooms SET guest_id = ?, status = 'playing', state = ?, turn = 1, last_activity = ? WHERE id = ? AND guest_id IS NULL AND status = 'open'`),
  roomClose: db.prepare(`UPDATE rooms SET status = 'closed', closed_at = ?, last_activity = ? WHERE id = ?`),
  roomTouch: db.prepare('UPDATE rooms SET last_activity = ? WHERE id = ?'),
  matchIns: db.prepare('INSERT INTO matches (room_id,game,p1,p2,winner_id,rating_delta,created_at) VALUES (?,?,?,?,?,?,?)'),
  chatIns: db.prepare('INSERT INTO chat_msgs (room_id,user_id,name,text,created_at) VALUES (?,?,?,?,?)'),
  chatByRoom: db.prepare('SELECT * FROM chat_msgs WHERE room_id = ? ORDER BY id DESC LIMIT 80'),
  userUpd: db.prepare('UPDATE users SET wins = wins + ?, losses = losses + ?, xp = xp + ?, rating = ?, streak = ?, best_streak = MAX(best_streak, ?) WHERE id = ?')
};


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
/* pool shot-clock sweep: expired turn → foul + pass + broadcast */
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

const roomCode = () => crypto.randomBytes(3).toString('hex').toUpperCase();

/* ---------- queue ---------- */
function enqueue(user, game){
  if (!games.GAMES[game]) return { err: 'UNKNOWN_GAME' };
  const g = games.GAMES[game];
  if (g.soon) return { err: 'NOT_AVAILABLE', msg: 'هذه اللعبة قادمة قريبًا' };
  if (user.coins < cfgEntry()) return { err: 'INSUFFICIENT_FUNDS', msg: 'تحتاج عملات فيكسورا أكثر لدخول الطابور' };
  if (stmt.qGet.get(user.id)) return { err: 'ALREADY_QUEUED' };
  if (cleanStaleRoom(user.id)) return { err: 'ALREADY_IN_ROOM', msg: 'لديك غرفة أو مباراة جارية — عد إليها أو غادرها من اللوبي' };
  stmt.qIns.run(user.id, game, user.rating, now());
  rt.emit(user.id, 'queue:joined', { game });
  return { ok: true };
}
function cancel(user){
  stmt.qDel.run(user.id);
  rt.emit(user.id, 'queue:left', {});
  return { ok: true };
}
function cfgEntry(){ return require('./config').C4_ENTRY; }

/* ---------- matching tick (interval-driven) ---------- */
function tick(){
  const rows = stmt.qAll.all();
  const byGame = {};
  rows.forEach(r => { (byGame[r.game] = byGame[r.game] || []).push(r); });
  for (const game of Object.keys(byGame)){
    const list = byGame[game].sort((a, b) => a.enqueued_at - b.enqueued_at);
    const used = new Set();
    for (let i = 0; i < list.length; i++){
      if (used.has(list[i].user_id)) continue;
      let best = -1, bestGap = 1e9;
      for (let j = i + 1; j < list.length; j++){
        if (used.has(list[j].user_id)) continue;
        const gap = Math.abs(list[i].rating - list[j].rating);
        if (gap < bestGap){ bestGap = gap; best = j; }
      }
      if (best < 0) continue;
      const a = list[i], b = list[best];
      const wait = now() - Math.min(a.enqueued_at, b.enqueued_at);
      const window = 150 + (wait / 1000) * 40;         // widens the longer they wait
      if (bestGap > window) continue;
      used.add(a.user_id); used.add(b.user_id);
      try { pairMatch(a.user_id, b.user_id, game); }
      catch(e){ console.error('[mm] pair error', e.message); }
    }
  }
}
function pairMatch(idA, idB, game){
  const a = q.userById.get(idA), b = q.userById.get(idB);
  if (!a || !b) return;
  const entry = cfgEntry();
  if (a.coins < entry || b.coins < entry){ // re-check funds atomically at pairing
    if (a.coins < entry) bail(idA); if (b.coins < entry) bail(idB); return;
  }
  stmt.qDel.run(idA); stmt.qDel.run(idB);
  const room = makeRoom(game, a, b);
  rt.emit(idA, 'match:found', { roomId: room.id, game, vs: { id: b.id, username: b.username, rating: b.rating }, you: 1 });
  rt.emit(idB, 'match:found', { roomId: room.id, game, vs: { id: a.id, username: a.username, rating: a.rating }, you: 2 });
  notify(a.id, 'match', 'تم إيجاد خصم!', 'أنت ضد ' + b.username + ' — الغرفة ' + room.code);
  notify(b.id, 'match', 'تم إيجاد خصم!', 'أنت ضد ' + a.username + ' — الغرفة ' + room.code);
  return room;
}
function bail(id){ stmt.qDel.run(id); rt.emit(id, 'queue:left', { reason: 'INSUFFICIENT_FUNDS' }); }
function notifyBothMatch(a, b, room){
  notify(a.id, 'match', 'تم إيجاد خصم!', 'أنت ضد ' + b.username + ' — الغرفة ' + room.code);
  notify(b.id, 'match', 'تم إيجاد خصم!', 'أنت ضد ' + a.username + ' — الغرفة ' + room.code);
}

function makeRoom(game, host, guest){
  const state = games.newState(game);
  const t = now();
  const code = roomCode();
  const id = stmt.roomIns.run(code, game, host.id, guest ? guest.id : null,
    guest ? 'playing' : 'open', 0, 'public', JSON.stringify(state), 1, cfgEntry(), cfgEntry() * 2, t, t).lastInsertRowid;
  /* entry fees — atomic, logged */
  walletMove(host.id, -cfgEntry(), 'دخول مباراة ' + game, 'room:' + id);
  if (guest) walletMove(guest.id, -cfgEntry(), 'دخول مباراة ' + game, 'room:' + id);
  return { id: Number(id), code, game };
}

/* ---------- rooms (manual create/join) ---------- */
function createRoom(user, game, privacy){
  if (!games.GAMES[game] || games.GAMES[game].soon) return { err: 'UNKNOWN_GAME' };
  if (user.coins < cfgEntry()) return { err: 'INSUFFICIENT_FUNDS', msg: 'رصيدك لا يكفي رسوم الدخول' };
  if (cleanStaleRoom(user.id)) return { err: 'ALREADY_IN_ROOM', msg: 'لديك غرفة أو مباراة جارية — عد إليها أو غادرها من اللوبي' };
  stmt.qDel.run(user.id);
  const g = games.GAMES[game];
  const state = games.newState();
  const t = now();
  let id;
  const run = tx(() => {
    id = Number(stmt.roomIns.run(roomCode(), game, user.id, null, 'open', 0, privacy === 'private' ? 'private' : 'public',
      JSON.stringify(state), 1, cfgEntry(), cfgEntry() * 2, t, t).lastInsertRowid);
    walletMove(user.id, -cfgEntry(), 'إنشاء غرفة ' + g.name_ar, 'room:' + id);
  });
  run();
  return { ok: true, room: publicRoom(stmt.roomById.get(id)) };
}
function joinRoom(user, roomId){
  const room = stmt.roomById.get(roomId);
  if (!room) return { err: 'NOT_FOUND' };
  if (room.host_id === user.id) return { err: 'ALREADY_IN_ROOM' };
  if (room.status !== 'open' || room.guest_id) return { err: 'ROOM_FULL', msg: 'الغرفة ممتلئة أو بدأت بالفعل' };
  if (user.coins < room.entry) return { err: 'INSUFFICIENT_FUNDS', msg: 'رصيدك لا يكفي رسوم الدخول' };
  const state = games.newState(room.game);
  const res = stmt.roomJoin.run(user.id, JSON.stringify(state), now(), roomId);
  if (!res.changes) return { err: 'ROOM_FULL', msg: 'سبقك لاعب آخر للغرفة' };
  walletMove(user.id, -room.entry, 'دخول غرفة ' + games.GAMES[room.game].name_ar, 'room:' + roomId);
  const full = stmt.roomById.get(roomId);
  rt.emitMany([full.host_id, user.id], 'room:update', { room: publicRoom(full, user.id) });
  notify(full.host_id, 'room', 'انضم لاعب إلى غرفتك', user.username + ' جاهز — بدأت المباراة!');
  return { ok: true, room: publicRoom(full, user.id) };
}
function joinByCode(user, code){
  const room = db.prepare(`SELECT * FROM rooms WHERE code = ? AND status != 'closed' ORDER BY id DESC`).get(String(code).toUpperCase());
  if (!room) return { err: 'NOT_FOUND', msg: 'لا توجد غرفة بهذا الرمز' };
  if (room.host_id === user.id || room.guest_id === user.id) return { ok: true, room: publicRoom(room, user.id) };
  return joinRoom(user, room.id);
}

/* ---------- practice vs AI ---------- */
function practice(user, game){
  if (!games.GAMES[game] || games.GAMES[game].soon) return { err: 'UNKNOWN_GAME' };
  if (user.coins < cfgEntry()) return { err: 'INSUFFICIENT_FUNDS', msg: 'رصيدك لا يكفي رسوم الدخول' };
  if (cleanStaleRoom(user.id)) return { err: 'ALREADY_IN_ROOM', msg: 'لديك غرفة أو مباراة جارية — عد إليها أو غادرها من اللوبي' };
  stmt.qDel.run(user.id);
  const state = games.newState(game);
  const t = now();
  let id;
  tx(() => {
    id = Number(stmt.roomIns.run(roomCode(), game, user.id, null, 'playing', 1, 'public', JSON.stringify(state), 1, cfgEntry(), cfgEntry() * 2, t, t).lastInsertRowid);
    walletMove(user.id, -cfgEntry(), 'تدريب ضد الحاسوب', 'room:' + id);
  })();
  return { ok: true, room: publicRoom(stmt.roomById.get(id), user.id) };
}

/* ---------- moves ---------- */
function activeRoomOf(userId){
  return db.prepare(`SELECT * FROM rooms WHERE status != 'closed' AND (host_id = ? OR guest_id = ?) ORDER BY id DESC LIMIT 1`).get(userId, userId);
}

function slotOf(room, userId){
  if (room.host_id === userId) return 1;
  if (room.guest_id === userId) return 2;
  return 0;
}

function move(user, roomId, body){
  const room = stmt.roomById.get(roomId);
  if (!room) return { err: 'NOT_FOUND' };
  const slot = slotOf(room, user.id);
  if (!slot) return { err: 'NOT_PARTICIPANT' };
  if (room.status !== 'playing') return { err: 'NOT_PLAYING' };
  const eng = games.engineOf(room.game);
  let state;
  try { state = JSON.parse(room.state); } catch(e){ return { err: 'STATE_ERROR' }; }

  /* pool 9-second shot clock: expired → foul, persist + broadcast, reject shot */
  if (room.game === 'pool8' && games.POOL.clockCheck(state, slot)){
    stmt.roomSetState.run(JSON.stringify(state), state.turn, room.move_count, now(), roomId);
    const upd0 = stmt.roomById.get(roomId);
    broadcastRoom(upd0);
    if (upd0.vs_ai && JSON.parse(upd0.state).turn === 2) setTimeout(() => aiMove(roomId), 650);
    return { err: 'SHOT_CLOCK', msg: 'انتهت الـ9 ثوانٍ — فاول وتنقل الدور للخصم' };
  }

  const v = games.validMove(room.game, body || {});
  if (!v.ok) return v;
  const res = eng.apply(state, slot, v.move);
  if (!res.ok) return { err: res.reason, msg: ERR_AR[res.reason] || res.msg || 'حركة غير صالحة' };
  const moveNo = room.move_count + 1;
  stmt.roomSetState.run(JSON.stringify(state), state.turn, moveNo, now(), roomId);

  if (res.won || res.draw){
    settle(room, state, res.won ? slot : 0, !!res.draw);
  } else if (room.game === 'reversi'){
    advancePasses(roomId);
    const cur = stmt.roomById.get(roomId);
    if (cur && cur.vs_ai && cur.status === 'playing'){
      try { if (JSON.parse(cur.state).turn === 2) setTimeout(() => aiMove(roomId), 650); } catch(e){}
    }
  } else if (room.vs_ai && state.turn === 2){
    setTimeout(() => aiMove(roomId), 650);
  }
  const upd = stmt.roomById.get(roomId);
  broadcastRoom(upd);
  return { ok: true, state: safeState(upd, user.id) };
}

/* reversi: auto-pass stuck players; finish by disc count on double pass */
function advancePasses(roomId){
  const room = stmt.roomById.get(roomId);
  if (!room || room.status !== 'playing' || room.game !== 'reversi') return;
  let state;
  try { state = JSON.parse(room.state); } catch(e){ return; }
  const eng = games.engineOf('reversi');
  let changed = false;
  while (!state.over){
    if (eng.legal(state).length > 0) break;
    state.passes = (state.passes || 0) + 1;
    changed = true;
    if (state.passes >= 2){ games.RV._finish(state); break; }
    state.turn = 3 - state.turn;
  }
  if (changed){
    stmt.roomSetState.run(JSON.stringify(state), state.turn, room.move_count, now(), roomId);
    if (state.over) settle(room, state, state.winner, state.winner === 0);
    broadcastRoom(stmt.roomById.get(roomId));
  }
}

function aiMove(roomId){
  const room = stmt.roomById.get(roomId);
  if (!room || room.status !== 'playing') return;
  const eng = games.engineOf(room.game);
  let state;
  try { state = JSON.parse(room.state); } catch(e){ return; }
  if (state.over || state.turn !== 2) return;
  const mv = eng.ai(state);
  if (mv === null){ advancePasses(roomId); return; }
  const res = eng.apply(state, 2, mv);
  if (!res.ok){ advancePasses(roomId); return; }
  stmt.roomSetState.run(JSON.stringify(state), state.turn, room.move_count + 1, now(), roomId);
  if (res.won || res.draw){
    settle(room, state, res.won ? 2 : 0, !!res.draw);
  } else {
    advancePasses(roomId);           // human may be stuck → auto-pass back to AI
  }
  const cur = stmt.roomById.get(roomId);
  if (cur && cur.vs_ai && cur.status === 'playing'){
    try { if (JSON.parse(cur.state).turn === 2) setTimeout(() => aiMove(roomId), 550); } catch(e){}
  }
  broadcastRoom(cur);
}

/* ---------- settlement (atomic) ---------- */
function settle(room, state, winnerSlot, draw){
  const host = q.userById.get(room.host_id);
  const guest = room.guest_id ? q.userById.get(room.guest_id) : null;
  const t = now();
  tx(() => {
    if (room.vs_ai){
      if (draw) walletMove(host.id, room.entry, 'تعادل ضد الحاسوب — استرجاع', 'room:' + room.id);
      else if (winnerSlot === 1) walletMove(host.id, require('./config').C4_AI_WIN, 'فوز ضد الحاسوب', 'room:' + room.id);
    } else if (draw){
      walletMove(host.id, room.entry, 'تعادل — استرجاع الرسوم', 'room:' + room.id);
      walletMove(guest.id, room.entry, 'تعادل — استرجاع الرسوم', 'room:' + room.id);
    } else {
      const winner = winnerSlot === 1 ? host : guest;
      walletMove(winner.id, room.pot, 'جائزة الفوز — ' + room.game, 'room:' + room.id);
    }

    const dHost = applyRating(host, guest, draw ? 0 : (winnerSlot === 1 ? 1 : -1), room.vs_ai);
    if (guest && !room.vs_ai) applyRating(guest, host, draw ? 0 : (winnerSlot === 2 ? 1 : -1), false);

    const winnerId = draw ? null : (winnerSlot === 1 ? host.id : (guest ? guest.id : null));
    stmt.matchIns.run(room.id, room.game, host.id, guest ? guest.id : null, winnerId, dHost, t);
    stmt.roomClose.run(t, t, room.id);

    /* notifications + achievements (real, data-driven) */
    const wu = draw ? null : q.userById.get(winnerId);
    if (room.vs_ai){
      if (winnerSlot === 1){
        notify(host.id, 'win', 'فوز رائع! 🏆', '+' + require('./config').C4_AI_WIN + ' عملة فيكسورا أُضيفت لمحفظتك.');
        checkAchievements(host);
      } else if (!draw){
        notify(host.id, 'loss', 'خسارة هذه المرة', 'جرّب مجددًا — الحظ يضرّب من جديد.');
      }
    } else if (wu){
      notify(wu.id, 'win', 'فوز رائع! 🏆', '+' + room.pot + ' عملة فيكسورا أُضيفت لمحفظتك.');
      checkAchievements(wu);
    }
  })();
}
function applyRating(u, opp, outcome, vsAi){
  const K = require('./config').ELO_K;
  const oppR = vsAi ? 1100 : opp.rating;
  const exp = 1 / (1 + Math.pow(10, (oppR - u.rating) / 400));
  const delta = Math.round(K * (outcome * 0.5 + 0.5 - exp));   // outcome: 1 win, -1 loss, 0 draw → score 1/0/0.5
  const nr = Math.max(100, u.rating + delta);
  const wins = outcome > 0 ? 1 : 0;
  const losses = outcome < 0 ? 1 : 0;
  const streak = outcome > 0 ? u.streak + 1 : 0;
  const xp = outcome > 0 ? 60 : (outcome === 0 ? 25 : 15);
  stmt.userUpd.run(wins, losses, xp, nr, streak, streak, u.id);
  return delta;
}
function checkAchievements(u){
  const fresh = q.userById.get(u.id);
  const got = JSON.parse(fresh.achievements || '[]');
  const add = [];
  if (fresh.wins >= 1 && !got.includes('firstwin')) add.push(['firstwin', 'أول فوز', 'فزت بأول مباراة رسمية في فيكسورا']);
  if (fresh.streak >= 3 && !got.includes('streak3')) add.push(['streak3', 'ثلاثية نارية', 'ثلاثة انتصارات متتالية']);
  if (fresh.coins >= 25000 && !got.includes('rich')) add.push(['rich', 'ثري فيكسورا', 'رصيدك تجاوز 25,000 عملة']);
  if (add.length){
    add.forEach(a => { got.push(a[0]); notify(fresh.id, 'إنجاز جديد: ' + a[1], a[2]); });
    db.prepare('UPDATE users SET achievements = ? WHERE id = ?').run(JSON.stringify(got), fresh.id);
    rt.emit(fresh.id, 'ach:new', { achievements: got });
  }
}

/* ---------- chat ---------- */
const EMOJI_OWNED_CHECK = /:([a-z0-9_]+):/g;
function chat(user, roomId, text){
  const room = stmt.roomById.get(roomId);
  if (!room) return { err: 'NOT_FOUND' };
  if (!slotOf(room, user.id)) return { err: 'NOT_PARTICIPANT' };
  const clean = String(text || '').trim().slice(0, 240);
  if (!clean) return { err: 'EMPTY' };
  /* premium emoji packs must be owned */
  let m, packs = [];
  EMOJI_OWNED_CHECK.lastIndex = 0;
  while ((m = EMOJI_OWNED_CHECK.exec(clean))) packs.push(m[1]);
  for (const p of packs){
    if (p === 'vex') continue; // free starter emojis
    const it = q.itemById.get(p);
    if (!it || it.kind !== 'emoji') return { err: 'BAD_PACK', msg: 'حزمة إيموجي غير معروفة' };
    if (!q.invHas.get(user.id, p)) return { err: 'PACK_NOT_OWNED', msg: 'هذه حزمة إيموجي مدفوعة — اشترها من المتجر' };
  }
  stmt.chatIns.run(roomId, user.id, user.username, clean, now());
  const msg = { roomId, userId: user.id, name: user.username, text: clean, at: now() };
  const targets = [room.host_id];
  if (room.guest_id) targets.push(room.guest_id);
  rt.emitMany(targets, 'chat:new', msg);
  return { ok: true, msg };
}
function chatHistory(roomId){ return stmt.chatByRoom.all(roomId).reverse(); }

/* ---------- projections ---------- */
function safeState(room, forUserId){
  let state;
  try { state = JSON.parse(room.state); } catch(e){ state = games.newState(room.game); }
  const host = q.userById.get(room.host_id);
  const guest = room.guest_id ? q.userById.get(room.guest_id) : null;
  const out = {
    id: room.id, code: room.code, game: room.game, status: room.status, vs_ai: !!room.vs_ai,
    entry: room.entry, pot: room.pot, move_count: room.move_count,
    board: state.b || null, turn: state.turn, over: state.over, winner: state.winner, winCells: state.win || [], last: state.last,
    you: slotOf(room, forUserId),
    host: { id: host.id, username: host.username, rating: host.rating, hue: host.hue },
    guest: guest ? { id: guest.id, username: guest.username, rating: guest.rating, hue: guest.hue } : (room.vs_ai ? { id: 0, username: 'VEXORA AI', rating: 1100, hue: 200 } : null),
    created_at: room.created_at
  };
  /* game-specific views */
  if (room.game === 'chess'){
    out.turnColor = state.turn;
    out.moves = games.CHESS.legal(state);
    out.check = games.CH.inCheck(state, state.turn);
  }
  if (room.game === 'backgammon'){
    out.pts = state.pts; out.bars = [state.wBar, state.bBar]; out.offs = [state.wOff, state.bOff];
    out.dice = state.dice; out.moves = games.TABLA.legal(state);
  }
  if (room.game === 'pool8'){
    out.balls = state.balls; out.groups = state.groups; out.lastShot = state.lastShot;
    out.aimable = games.P.allStopped(state.balls);
    out.turnStartedAt = state.turnStartedAt || 0;
    out.shotClock = games.SHOT_CLOCK_MS;
    out.foulBy = state.foulBy || 0;
    out.pocketed = state.balls.filter(b => b.pocketed && b.id !== 0).map(b => b.id);
  }
  return out;
}
function publicRoom(room, forUserId){
  const host = q.userById.get(room.host_id);
  return {
    id: room.id, code: room.code, game: room.game, status: room.status, vs_ai: !!room.vs_ai,
    entry: room.entry, pot: room.pot, privacy: room.privacy,
    host: { id: host.id, username: host.username, rating: host.rating, hue: host.hue },
    seats: 1 + (room.guest_id ? 1 : 0),
    created_at: room.created_at,
    you: forUserId ? slotOf(room, forUserId) : 0,
    state: room.status === 'playing' && forUserId ? safeState(room, forUserId) : null
  };
}
function broadcastRoom(room){
  rt.emit(room.host_id, 'room:update', { room: safeState(room, room.host_id) });
  if (room.guest_id) rt.emit(room.guest_id, 'room:update', { room: safeState(room, room.guest_id) });
}
function leaveRoom(user, roomId){
  const room = stmt.roomById.get(roomId);
  if (!room) return { err: 'NOT_FOUND' };
  if (!slotOf(room, user.id)) return { err: 'NOT_PARTICIPANT' };
  if (room.status === 'playing' && !room.vs_ai){
    /* leaving a live match = conceding */
    const other = room.host_id === user.id ? room.guest_id : room.host_id;
    let state;
    try { state = JSON.parse(room.state); } catch(e){ state = games.newState(room.game); }
    state.over = true; state.winner = room.host_id === user.id ? 2 : 1;
    stmt.roomSetState.run(JSON.stringify(state), 0, room.move_count, now(), roomId);
    const winnerSlot = state.winner;
    settle(room, state, winnerSlot, false);
    if (other) rt.emit(other, 'room:left', { roomId, by: user.username });
    broadcastRoom(stmt.roomById.get(roomId));
    return { ok: true, conceded: true };
  }
  if (room.status === 'playing' && room.vs_ai){
    /* abandoning AI practice mid-game: close the table (entry already spent) */
    let state;
    try { state = JSON.parse(room.state); } catch(e){ state = games.newState(room.game); }
    state.over = true; state.winner = 2;                 /* AI takes the abandoned table */
    stmt.roomSetState.run(JSON.stringify(state), 0, room.move_count, now(), roomId);
    stmt.roomClose.run(now(), now(), roomId);
    broadcastRoom(stmt.roomById.get(roomId));
    return { ok: true, abandoned: true };
  }
  if (room.status === 'open' && room.host_id === user.id){
    tx(() => {
      stmt.roomClose.run(now(), now(), roomId);
      walletMove(user.id, room.entry, 'إلغاء غرفة — استرجاع الرسوم', 'room:' + roomId);
    })();
    return { ok: true, refunded: true };
  }
  return { ok: true };
}

const ERR_AR = {
  NOT_YOUR_TURN: 'ليس دورك الآن',
  COLUMN_FULL: 'هذا العمود ممتلئ',
  BAD_COLUMN: 'عمود غير صالح',
  GAME_OVER: 'انتهت المباراة'
};

module.exports = { enqueue, cancel, tick, createRoom, joinRoom, joinByCode, practice, move, chat, chatHistory, safeState, publicRoom, activeRoomOf, leaveRoom, cleanStaleRoom, sweepStaleRooms, poolClockSweep, leaveActive, openRoomsStmt: stmt, GAMES: games.GAMES };
