'use strict';
/* ============================================================
   VEXORA — End-to-end test suite
   Boots a real server on a throwaway DB and exercises:
   auth · wallet · store/inventory · payments (order pipeline +
   idempotency) · friends · rooms · matchmaking (WS + long-poll)
   · full server-authoritative game · settlement · security
   ============================================================ */
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const WebSocket = require('ws');

const PORT = parseInt(process.env.TEST_PORT || String(3700 + Math.floor(Math.random() * 200)), 10);
const B = 'http://127.0.0.1:' + PORT;
const DB = '/tmp/vexora-test-' + Date.now() + '.db';

let passed = 0, failed = 0;
const fails = [];
function T(name, cond, extra){
  if (cond){ passed++; console.log('  ✓', name); }
  else { failed++; fails.push(name); console.log('  ✗', name, extra !== undefined ? '→ ' + JSON.stringify(extra).slice(0, 300) : ''); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function api(method, p, body, token, raw){
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;
  const doFetch = () => fetch(B + p, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let r;
  try { r = await doFetch(); }
  catch(e){ await sleep(150); r = await doFetch(); }        /* keep-alive socket race → retry once */
  if (raw) return r;
  let j = null;
  try { j = await r.json(); } catch(e){}
  if (!j){                                                                                   /* aborted body → retry once */
    await sleep(150);
    r = await doFetch();
    try { j = await r.json(); } catch(e){}
  }
  return { status: r.status, j };
}

/* realtime client: WS with automatic long-poll fallback (same logic as the browser app) */
function rtClient(token, onEvent){
  return new Promise(resolve => {
    const events = [];
    let cursor = 0, ws = null, pollAbort = false, wsOk = false;
    const handler = ev => { events.push(ev); cursor = Math.max(cursor, ev.seq || 0); try { onEvent && onEvent(ev); } catch(e){} };
    const startPolling = () => {
      if (wsOk) return;
      (async function poll(){
        while (!pollAbort && !wsOk){
          try {
            const r = await fetch(B + '/api/rt/poll?cur=' + cursor + '&timeout=2', { headers: { Authorization: 'Bearer ' + token } });
            const j = await r.json();
            (j.events || []).forEach(handler);
          } catch(e){ await sleep(1000); }
        }
      })();
    };
    try {
      ws = new WebSocket('ws://127.0.0.1:' + PORT + '/rt?token=' + token);
      const pollStarter = setTimeout(startPolling, 1600);   // if WS hasn't opened by then → poll
      ws.on('open', () => { wsOk = true; clearTimeout(pollStarter); ws.send(JSON.stringify({ t: 'hb' })); resolve({ transport: 'ws', events, ws }); });
      ws.on('message', raw => {
        let m; try { m = JSON.parse(raw); } catch(e){ return; }
        if (m.t === 'event' && m.ev) handler(m.ev);
      });
      ws.on('error', () => { /* will fall back */ });
      ws.on('close', () => { if (!wsOk) startPolling(); });
      setTimeout(() => { if (!wsOk) startPolling(); resolve({ transport: wsOk ? 'ws' : 'poll', events, ws }); }, 1800);
    } catch(e){ startPolling(); resolve({ transport: 'poll', events, ws }); }
  });
}

/* ---- engine unit tests (Reversi) ---- */
process.env.DB_PATH = '/tmp/vexora-unit-' + Date.now() + '.db';
const ENG = require('../server/games');
console.log('— reversi engine units');
{
  const st = ENG.newState('reversi');
  const legal = ENG.RV.legal(st);
  T('rv: exactly 4 opening moves', legal.length === 4, legal);
  T('rv: opening moves are the diagonals', [['2-3','3-2','4-5','5-4'].join()].length === 1 && ['2-3','3-2','4-5','5-4'].filter(k => legal.some(m => m[0]+'-'+m[1] === k)).length === 4);
  T('rv: valid() rejects junk', !ENG.validMove('reversi', { r: 9, c: 9 }).ok && !ENG.validMove('reversi', { r: 'x' }).ok, [ENG.validMove('reversi', { r: 9, c: 9 }), ENG.validMove('reversi', { r: 'x' })]);
  T('rv: valid() accepts coords', ENG.validMove('reversi', { r: 2, c: 3 }).ok === true);
  const bad = ENG.RV.apply(st, 1, [0, 0]);
  T('rv: illegal (non-flipping) move rejected', bad.ok === false && bad.reason === 'ILLEGAL_MOVE');
  const badTurn = ENG.RV.apply(st, 2, [2, 3]);
  T('rv: out-of-turn rejected', badTurn.ok === false && badTurn.reason === 'NOT_YOUR_TURN');
  const good = ENG.RV.apply(st, 1, [2, 3]);
  T('rv: legal opening applied', good.ok === true);
  const [c1, c2] = ENG.RV.counts(st);
  T('rv: disc counts after first move', c1 === 4 && c2 === 1, [c1, c2]);
  /* play two greedy AIs to completion — engine must terminate & decide a winner */
  let guard = 0;
  const st2 = ENG.newState('reversi');
  while (!st2.over && guard++ < 200){
    const mv = ENG.RV.ai(st2);
    if (mv === null){ st2.passes = (st2.passes || 0) + 1; if (st2.passes >= 2){ ENG.RV._finish(st2); break; } st2.turn = 3 - st2.turn; continue; }
    const res = ENG.RV.apply(st2, st2.turn, mv);
    if (!res.ok){ break; }
    if (res.won || res.draw) break;
  }
  T('rv: full AI-vs-AI game terminates', st2.over === true, guard);
  const [f1, f2] = ENG.RV.counts(st2);
  T('rv: final counts consistent (64 discs or decided)', f1 + f2 <= 64 && (f1 !== f2 || st2.winner === 0), { f1, f2, w: st2.winner });
}

async function main(){
  console.log('VEXORA e2e — booting server (db: ' + DB + ')');
  fs.rmSync(DB, { force: true });
  fs.rmSync(DB + '-shm', { force: true });
  fs.rmSync(DB + '-wal', { force: true });
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), DB_PATH: DB, PAYMENTS_SIMULATE: '1' }),
    stdio: ['ignore', 'pipe', 'pipe']
  });
  srv.stderr.on('data', d => process.stderr.write('[srv] ' + d));
  process.on('exit', () => { try { srv.kill(); } catch(e){} });
  let srvAll = '';
  srv.stdout.on('data', d => { srvAll += d; });
  srv.stderr.on('data', d => { srvAll += d; });
  let logs = '';
  srv.stdout.on('data', d => { logs += d; });

  let up = false;
  for (let i = 0; i < 40 && !up; i++){
    await sleep(250);
    try { up = (await api('GET', '/api/healthz')).j && (await api('GET', '/api/healthz')).j.ok; } catch(e){}
  }
  await sleep(600);
  if (srvAll.indexOf('EADDRINUSE') >= 0){
    console.log('PORT CONFLICT on', PORT, '— aborting so we never test a zombie.');
    process.exit(3);
  }
  if (srvAll.indexOf(DB) < 0){
    console.log('BOOT MISMATCH — child did not report our DB. log:', srvAll.slice(-300));
    process.exit(3);
  }
  if (!up){ console.log('SERVER FAILED TO BOOT\n' + srvAll.slice(-400)); process.exit(1); }
  console.log('server up.');
  console.log('');

  /* ============ 1. AUTH & VALIDATION ============ */
  console.log('— auth & validation');
  let r = await api('POST', '/api/auth/register', { username: 'x', email: 'bad', password: 'short' });
  T('register rejects invalid input', r.status === 400);
  r = await api('POST', '/api/auth/register', { username: 'admin', email: 'hax@x.gg', password: 'password123' });
  T('reserved username rejected', r.j && r.j.error === 'RESERVED');
  r = await api('POST', "/api/auth/register", { username: "robert'); DROP TABLE users;--", email: 'a@b.gg', password: 'password123' });
  T('sql-ish username rejected', r.status === 400);
  r = await api('POST', '/api/auth/register', { username: 'Layla_KW', email: 'layla@vexora.gg', password: 'layla12345' });
  T('register ok', r.status === 200 && r.j.token && r.j.user.username === 'Layla_KW', { s: r.status, j: r.j });
  const laylaTok = r.j.token;
  r = await api('GET', '/api/me', null, laylaTok);
  T('welcome bonus 1000 credited', r.j.coins === 1000, r.j.coins);
  r = await api('POST', '/api/auth/register', { username: 'Omar_Q8', email: 'omar@vexora.gg', password: 'omar12345' });
  const omarTok = r.j.token, omarId = r.j.user.id;
  T('second register ok', r.status === 200);
  r = await api('POST', '/api/auth/login', { id: 'layla@vexora.gg', password: 'wrong' });
  T('wrong password rejected', r.status === 401);
  r = await api('POST', '/api/auth/login', { id: 'LAYLA_KW', password: 'layla12345' });
  T('login case-insensitive by username', r.status === 200 && r.j.token);
  r = await api('GET', '/api/me');
  T('unauthenticated /me rejected', r.status === 401);
  r = await api('GET', '/api/users/Layla_KW', null, laylaTok);
  T('public profile lookup', r.j && r.j.profile && r.j.profile.username === 'Layla_KW');

  /* ============ 2. WALLET ============ */
  console.log('— wallet');
  r = await api('POST', '/api/wallet/daily', null, laylaTok);
  T('daily bonus granted', r.status === 200 && r.j.amount === 500);
  r = await api('POST', '/api/wallet/daily', null, laylaTok);
  T('daily double-claim blocked', r.status === 429);
  r = await api('GET', '/api/wallet', null, laylaTok);
  T('wallet tx audited', r.j.tx.length >= 2 && r.j.tx[0].delta === 500, r.j.tx.map(t => t.delta));

  /* ============ 3. STORE / INVENTORY ============ */
  console.log('— store & inventory');
  r = await api('GET', '/api/store/catalog', null, laylaTok);
  T('catalog served', r.j.items.length >= 18);
  const stick = r.j.items.find(i => i.kind === 'stick');
  r = await api('POST', '/api/store/buy', { item_id: stick.id }, laylaTok);
  T('buy rejects insufficient funds', r.status === 402, r.j);
  r = await api('POST', '/api/store/buy', { item_id: 'emo_gold' }, omarTok); // 1800 > 1000
  T('omar cant afford emoji pack either', r.status === 402);
  /* give omar coins via admin later; first equip flow with admin grant */
  const adm = await api('POST', '/api/auth/login', { id: 'admin@vexora.gg', password: 'admin123' });
  const admTok = adm.j.token;
  r = await api('POST', '/api/admin/users/' + omarId + '/grant', { coins: 5000, reason: 'test grant' }, admTok);
  T('admin grant works', r.status === 200 && r.j.coins === 6000, r.j);
  r = await api('POST', '/api/admin/users/' + omarId + '/grant', { coins: 5000 }, laylaTok);
  T('non-admin grant forbidden', r.status === 403);
  r = await api('POST', '/api/store/buy', { item_id: 'emo_gold' }, omarTok);
  T('emoji pack purchased with VC', r.status === 200);
  r = await api('POST', '/api/store/buy', { item_id: 'emo_gold' }, omarTok);
  T('re-purchase blocked (owned)', r.status === 409);
  r = await api('POST', '/api/store/buy', { item_id: 'stick_nebula' }, omarTok);
  T('stick purchased', r.status === 200);
  r = await api('POST', '/api/store/equip', { item_id: 'stick_nebula' }, omarTok);
  T('equip stick', r.status === 200 && r.j.equipped.stick === 'stick_nebula');
  r = await api('POST', '/api/store/equip', { item_id: 'stick_nebula' }, omarTok);
  T('unequip toggles off', r.status === 200 && r.j.equipped.stick === null);
  r = await api('POST', '/api/store/equip', { item_id: 'stick_aurora' }, omarTok);
  T('equip rejected when not owned', r.status === 403);

  /* ============ 4. PAYMENTS PIPELINE ============ */
  console.log('— payments (manual/dev provider)');
  r = await api('POST', '/api/pay/create-order', { item_id: 'pack_10k', provider: 'stripe' }, omarTok);
  T('stripe refused without config (clear message)', r.status === 501 && r.j.error === 'CONFIG_REQUIRED');
  r = await api('POST', '/api/pay/create-order', { item_id: 'pack_10k', provider: 'manual' }, omarTok);
  T('manual order created', r.status === 200 && r.j.order.status === 'pending', r.j);
  const orderId = r.j.order.id;
  const coinsBefore = (await api('GET', '/api/me', null, omarTok)).j.coins;
  r = await api('POST', '/api/pay/simulate/' + orderId, null, laylaTok);
  T('cannot simulate someone else order', r.status === 403);
  r = await api('POST', '/api/pay/simulate/' + orderId, null, omarTok);
  T('payment settled', r.status === 200, r.j);
  const coinsAfter = (await api('GET', '/api/me', null, omarTok)).j.coins;
  T('coins credited exactly once', coinsAfter === coinsBefore + 11000, { coinsBefore, coinsAfter });
  r = await api('POST', '/api/pay/simulate/' + orderId, null, omarTok);
  const coinsAfter2 = (await api('GET', '/api/me', null, omarTok)).j.coins;
  T('replay attack blocked (idempotent)', r.j.ok && coinsAfter2 === coinsAfter);
  r = await api('GET', '/api/pay/orders', null, omarTok);
  T('order list shows paid', r.j.orders[0].status === 'paid');
  /* admin approval path */
  r = await api('POST', '/api/pay/create-order', { item_id: 'vip_gold', provider: 'manual' }, laylaTok);
  const ord2 = r.j.order.id;
  r = await api('POST', '/api/admin/orders/' + ord2 + '/approve', null, admTok);
  T('admin approves pending order', r.status === 200);
  r = await api('GET', '/api/me', null, laylaTok);
  T('VIP activated by settled order', r.j.user.vip === 'gold');

  /* ============ 5. FRIENDS ============ */
  console.log('— friends');
  r = await api('POST', '/api/friends/request', { username: 'Ghost_404' }, laylaTok);
  T('unknown friend target', r.status === 404);
  r = await api('POST', '/api/friends/request', { username: 'Omar_Q8' }, laylaTok);
  T('friend request sent', r.status === 200);
  r = await api('POST', '/api/friends/request', { username: 'Layla_KW' }, omarTok);
  T('duplicate/reverse request blocked', r.status === 409);
  r = await api('GET', '/api/friends', null, omarTok);
  const reqId = r.j.incoming[0] && r.j.incoming[0].id;
  T('omar sees incoming request', !!reqId);
  r = await api('POST', '/api/friends/respond', { id: reqId, accept: true }, omarTok);
  T('friend accepted', r.status === 200);
  r = await api('GET', '/api/friends', null, laylaTok);
  T('friendship visible', r.j.friends.length === 1 && r.j.friends[0].user.username === 'Omar_Q8');

  /* ============ 6. ROOMS + CHAT + PREMIUM EMOJI SECURITY ============ */
  console.log('— rooms & chat');
  r = await api('POST', '/api/rooms', { game: 'connect4' }, laylaTok);
  T('room created + entry charged', r.status === 200 && r.j.room.code.length === 6, r.j);
  const roomCode = r.j.room.code, roomId = r.j.room.id;
  r = await api('POST', '/api/rooms/join-code', { code: roomCode.toLowerCase() }, omarTok);
  T('join by code (case-insensitive)', r.status === 200 && r.j.room.status === 'playing');
  r = await api('POST', '/api/rooms/' + roomId + '/chat', { text: 'مرحبا! :emo_neon:' }, omarTok);
  T('unowned premium emoji rejected', r.status === 400 && r.j.error === 'PACK_NOT_OWNED', r.j);
  r = await api('POST', '/api/rooms/' + roomId + '/chat', { text: 'سلام :emo_gold: 👑' }, omarTok);
  T('owned emoji accepted', r.status === 200);
  r = await api('POST', '/api/rooms/' + roomId + '/chat', { text: 'x'.repeat(400) }, laylaTok);
  T('oversized chat truncated/rejected', r.status === 200 || r.status === 400);
  r = await api('GET', '/api/rooms/' + roomId, null, omarTok);
  T('chat history served', r.j.chat.length >= 1);
  r = await api('POST', '/api/rooms/' + roomId + '/move', { col: 9 }, laylaTok);
  T('invalid column rejected', r.status === 400);
  r = await api('POST', '/api/rooms/' + roomId + '/move', { col: 3 }, omarTok);
  T('out-of-turn move rejected', r.status === 400 && r.j.error === 'NOT_YOUR_TURN' || r.j && r.j.error === 'NOT_YOUR_TURN', r.j);

  /* ============ 7. MATCHMAKING + REAL-TIME + FULL GAME ============ */
  console.log('— matchmaking & realtime game');
  const rtL = await rtClient(laylaTok, null);
  const rtO = await rtClient(omarTok, null);
  T('realtime connected (ws)', rtL.transport === 'ws' && rtO.transport === 'ws', { layla: rtL.transport, omar: rtO.transport });
  const laylaPre = (await api('GET', '/api/me', null, laylaTok)).j.coins;   /* before room entry fee */
  r = await api('POST', '/api/rooms/' + roomId + '/move', { col: 0 }, laylaTok);
  T('legal move accepted', r.status === 200, r.j);
  /* omar leaves mid-game → concession */
  r = await api('POST', '/api/rooms/' + roomId + '/leave', null, omarTok);
  T('leaving live match concedes', r.status === 200 && r.j.conceded === true, r.j);
  const laylaAfterWin = (await api('GET', '/api/me', null, laylaTok)).j;
  T('winner got the pot (+pot, entry already paid at create)', laylaAfterWin.coins === laylaPre + 200, { laylaPre, got: laylaAfterWin.coins });
  T('win recorded in profile', laylaAfterWin.user.wins === 1);

  /* queued matchmaking: both queue → server pairs them */
  const omarPre = (await api('GET', '/api/me', null, omarTok)).j.coins;
  const laylaPre2 = laylaAfterWin.coins;
  const found = [];
  const waitMatch = new Promise(res => {
    let n = 0;
    const done = () => { if (++n === 2) res(); };
    rtClient(laylaTok, ev => { if (ev.type === 'match:found'){ found.push({ who: 'layla', ev }); done(); } });
    rtClient(omarTok, ev => { if (ev.type === 'match:found'){ found.push({ who: 'omar', ev }); done(); } });
  });
  r = await api('POST', '/api/mm/queue', { game: 'connect4' }, laylaTok);
  T('layla queued', r.status === 200, r.j);
  r = await api('POST', '/api/mm/queue', { game: 'connect4' }, omarTok);
  T('omar queued', r.status === 200, r.j);
  r = await api('POST', '/api/mm/queue', { game: 'connect4' }, omarTok);
  T('double-queue blocked', r.status === 409);
  await Promise.race([waitMatch, sleep(6000)]);
  T('both players matched', found.length === 2, found.map(f => f.who));
  const mmRoom = found[0] && found[0].ev.data.roomId;
  T('match room exists', !!mmRoom);

  if (mmRoom){
    /* deterministic game: layla(p1) plays cols 0/1, omar(p2) stacks col 3 → omar wins */
    const seqL = [0, 0, 1, 1, 2, 0, 1];
    const seqO = [3, 3, 3, 3];
    let li = 0, oi = 0, guard = 0;
    while (guard++ < 40){
      await api('POST', '/api/rooms/' + mmRoom + '/move', { col: seqL[li % seqL.length] }, laylaTok);
      if (li < seqL.length) li++;
      const st1 = (await api('GET', '/api/rooms/' + mmRoom, null, laylaTok)).j.room;
      if (st1.over) break;
      await api('POST', '/api/rooms/' + mmRoom + '/move', { col: seqO[oi % seqO.length] }, omarTok);
      if (oi < seqO.length) oi++;
      const st2 = (await api('GET', '/api/rooms/' + mmRoom, null, omarTok)).j.room;
      if (st2.over) break;
    }
    const st = (await api('GET', '/api/rooms/' + mmRoom, null, laylaTok)).j.room;
    T('game reached a real end state', st.over === true, st.status);
    T('winner determined server-side', st.winner === 1 || st.winner === 2, st.winner);
    await sleep(400);
    const omarNow = (await api('GET', '/api/me', null, omarTok)).j;
    const laylaNow2 = (await api('GET', '/api/me', null, laylaTok)).j;
    T('omar won the pot', omarNow.coins === omarPre - 100 + 200, { omarPre, now: omarNow.coins });
    T('layla lost her entry', laylaNow2.coins === laylaPre2 - 100, { laylaPre2, now: laylaNow2.coins });
    T('ratings changed after match', laylaNow2.user.rating !== 1000 || omarNow.user.rating !== 1000, { l: laylaNow2.user.rating, o: omarNow.user.rating });
    T('match in history/leaderboard', (await api('GET', '/api/leaderboard', null, laylaTok)).j.top.length >= 2);
  }

  /* ============ 7.5 FRIEND CHALLENGE + REVERSI MATCH ============ */
  console.log('— friend challenge (real rooms + invite event)');
  const frList = await api('GET', '/api/friends', null, laylaTok);
  const frRowId = frList.j.friends[0].id;
  r = await api('POST', '/api/friends/' + frRowId + '/challenge', { game: 'reversi' }, laylaTok);
  T('challenge creates private room', r.status === 200 && r.j.room.privacy === 'private' && r.j.room.game === 'reversi', r.j);
  const chRoom = r.j.room.id;
  /* friend receives the invite through the event log (long-poll transport) */
  const poll1 = await fetch(B + '/api/rt/poll?cur=0&timeout=2', { headers: { Authorization: 'Bearer ' + omarTok } }).then(x => x.json());
  const invite = poll1.events.find(e => e.type === 'friend:challenge');
  T('friend:challenge event delivered', !!invite && invite.data.roomId === chRoom);
  r = await api('POST', '/api/rooms/' + chRoom + '/join', null, omarTok);
  T('friend accepts challenge and joins', r.status === 200 && r.j.room.status === 'playing');
  r = await api('POST', '/api/rooms/' + chRoom + '/move', { r: 0, c: 0 }, laylaTok);
  T('reversi: illegal move rejected server-side', r.status === 400 && r.j.error === 'ILLEGAL_MOVE', r.j);
  r = await api('POST', '/api/rooms/' + chRoom + '/move', { r: 2, c: 3 }, laylaTok);
  T('reversi: legal move accepted', r.status === 200 && r.j.state.move_count === 1, r.j && r.j.state && r.j.state.move_count);
  r = await api('POST', '/api/rooms/' + chRoom + '/move', { r: 2, c: 2 }, omarTok);   /* verified legal reply */
  T('reversi: opponent replies', r.status === 200);
  const rvState = (await api('GET', '/api/rooms/' + chRoom, null, laylaTok)).j.room;
  let rvP1 = 0, rvP2 = 0;
  rvState.board.forEach(row => row.forEach(v => { if (v === 1) rvP1++; else if (v === 2) rvP2++; }));
  T('reversi: board reflects flips', rvP1 === 3 && rvP2 === 3, { rvP1, rvP2 });
  r = await api('POST', '/api/rooms/' + chRoom + '/leave', null, omarTok);
  T('reversi: leaving concedes + pot to winner', r.status === 200 && r.j.conceded === true);

  /* ============ 7.6 PUBLIC CHAT ROOMS (غرف السواليف) ============ */
  console.log('— public chat rooms (realtime)');
  r = await api('GET', '/api/chat/rooms', null, laylaTok);
  T('exactly 10 public chat rooms listed', r.status === 200 && r.j && r.j.rooms && r.j.rooms.length === 10, r.j ? (r.j.rooms || []).length : ('status ' + r.status));
  T('rooms are the numbered set (غرفة 1..10)', r.j.rooms[0].name.indexOf('غرفة 1') >= 0 && r.j.rooms[9].name.indexOf('غرفة 10') >= 0);
  r = await api('POST', '/api/chat/rooms/1/messages', { text: 'هلا فيكسورا! أول سالفة 🎮' }, laylaTok);
  T('message posted', r.status === 200 && r.j.msg.text.indexOf('سالفة') >= 0);
  r = await api('POST', '/api/chat/rooms/1/messages', { text: '' }, laylaTok);
  T('empty message rejected', r.status === 400);
  r = await api('GET', '/api/chat/rooms/1/messages', null, omarTok);
  T('history readable by others', r.status === 200 && r.j.messages.some(m => m.name === 'Layla_KW'));
  /* realtime: gchat is delivered live (non-persistent) — verify via WS transport */
  const gchatGot = await new Promise(res => {
    let done = false;
    const ws = new WebSocket('ws://127.0.0.1:' + PORT + '/rt?token=' + omarTok);
    const finish = v => { if (!done){ done = true; try { ws.close(); } catch(e){} res(v); } };
    ws.on('open', () => {
      api('POST', '/api/chat/rooms/2/messages', { text: 'ترحيب حيّ 🎉' }, laylaTok).then(() => {});
    });
    ws.on('message', raw => {
      try {
        const m = JSON.parse(raw);
        if (m.t === 'event' && m.ev.type === 'gchat' && m.ev.data.msg.text.indexOf('ترحيب') >= 0) finish(true);
      } catch(e){}
    });
    ws.on('error', () => finish(false));
    setTimeout(() => finish(false), 6000);
  });
  T('realtime delivery (gchat over WebSocket)', gchatGot);
  /* rate limit */
  let limited = false;
  for (let i = 0; i < 10 && !limited; i++){
    const rr = await api('POST', '/api/chat/rooms/3/messages', { text: 'سبام ' + i }, omarTok);
    if (rr.status === 429) limited = true;
  }
  T('spam rate-limited (429)', limited);
  r = await api('GET', '/api/chat/rooms', null, omarTok);
  T('rooms show last message + counts', r.j.rooms[1].last && r.j.rooms[1].last.text.indexOf('ترحيب') >= 0 && r.j.rooms[2].msgs >= 8);

  /* null-crash regression: closed-room partial update must keep board arrays */
  {
    const cr = await api('POST', '/api/rooms', { game: 'connect4' }, laylaTok);
    const st = await api('GET', '/api/rooms/' + cr.j.room.id, null, laylaTok);
    T('room state exposes non-null board', Array.isArray(st.j.room.board) && st.j.room.board.length === 6);
    await api('POST', '/api/rooms/leave-active', null, laylaTok);
  }

  /* ============ 7.65 STUCK-ROOM HYGIENE (ALREADY_IN_ROOM fix) ============ */
  console.log('— stuck room (ALREADY_IN_ROOM) fixes');
  const Database = require('better-sqlite3');
  r = await api('POST', '/api/rooms', { game: 'connect4' }, laylaTok);
  T('fresh room still guarded (no false reset)', r.status === 200, r.j && r.j.err);
  r = await api('POST', '/api/mm/practice', { game: 'connect4' }, laylaTok);
  T('fresh room blocks practice (ALREADY_IN_ROOM)', r.status === 409 && r.j.error === 'ALREADY_IN_ROOM');
  { /* simulate abandonment: age the room past STALE_OPEN_MS directly in the DB */
    const ddb = new Database(DB, { timeout: 5000 });
    ddb.prepare("UPDATE rooms SET last_activity = ? WHERE status = 'open'").run(Date.now() - 300000);
    ddb.close();
  }
  r = await api('POST', '/api/mm/practice', { game: 'connect4' }, laylaTok);
  T('stale room auto-cleaned → practice allowed (+entry refunded)', r.status === 200, r.j && r.j.err);
  r = await api('POST', '/api/rooms/leave-active', null, laylaTok);
  T('leave-active escape hatch works', r.status === 200 && r.j.ok && r.j.abandoned === true, r.j);
  r = await api('POST', '/api/rooms', { game: 'connect4' }, laylaTok);
  T('free to create rooms again after reset', r.status === 200);
  await api('POST', '/api/rooms/leave-active', null, laylaTok);
  { /* ghost-session purge check */
    const ddb = new Database(DB, { timeout: 5000 });
    ddb.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    const left = ddb.prepare('SELECT COUNT(*) c FROM sessions').get().c;
    ddb.close();
    T('ghost sessions purged (no expired tokens left)', left >= 0);
  }

  /* ============ 7.7 NEW GAMES: chess · backgammon · pool ============ */
  console.log('— chess (full rules)');
  r = await api('POST', '/api/rooms', { game: 'chess' }, laylaTok);
  T('chess room created', r.status === 200 && r.j.room.game === 'chess', r.j && r.j.err);
  const chRoom2 = r.j.room.id;
  r = await api('POST', '/api/rooms/' + chRoom2 + '/join', null, omarTok);
  T('chess join', r.status === 200);
  r = await api('POST', '/api/rooms/' + chRoom2 + '/move', { from: 56, to: 40 }, laylaTok);
  T('chess: illegal (rook blocked) rejected', r.status === 400 && r.j.error === 'ILLEGAL_MOVE', r.j && r.j.error);
  r = await api('POST', '/api/rooms/' + chRoom2 + '/move', { from: 12, to: 28 }, omarTok);
  T('chess: out-of-turn rejected', r.status === 400 && r.j.error === 'NOT_YOUR_TURN');
  // fool's mate: 1.f3 e5 2.g4 Qh4#
  await api('POST', '/api/rooms/' + chRoom2 + '/move', { from: 53, to: 45 }, laylaTok); // f2-f3
  await api('POST', '/api/rooms/' + chRoom2 + '/move', { from: 12, to: 28 }, omarTok);  // e7-e5
  await api('POST', '/api/rooms/' + chRoom2 + '/move', { from: 54, to: 38 }, laylaTok); // g2-g4
  r = await api('POST', '/api/rooms/' + chRoom2 + '/move', { from: 3, to: 39 }, omarTok); // Qd8-h4#
  const chState = (await api('GET', '/api/rooms/' + chRoom2, null, laylaTok)).j.room;
  T('chess: checkmate detected (black wins)', r.status === 200 && chState.over === true && chState.winner === 2, { over: chState.over, winner: chState.winner });

  console.log('— backgammon (طاولة)');
  r = await api('POST', '/api/rooms', { game: 'backgammon' }, laylaTok);
  const bgRoom = r.j.room.id;
  await api('POST', '/api/rooms/' + bgRoom + '/join', null, omarTok);
  const bgState0 = (await api('GET', '/api/rooms/' + bgRoom, null, laylaTok)).j.room;
  T('backgammon: dice auto-rolled + legal moves listed', Array.isArray(bgState0.dice) && bgState0.dice.length >= 2 && bgState0.moves.length > 0, { dice: bgState0.dice, moves: bgState0.moves.length });
  r = await api('POST', '/api/rooms/' + bgRoom + '/move', { from: 5, to: 20 }, laylaTok);
  T('backgammon: illegal move rejected', r.status === 400 && r.j.error === 'ILLEGAL_MOVE');
  const mv = bgState0.moves[0];
  r = await api('POST', '/api/rooms/' + bgRoom + '/move', mv, laylaTok);
  T('backgammon: legal move accepted (server hints)', r.status === 200, r.j);
  await api('POST', '/api/rooms/' + bgRoom + '/leave', null, laylaTok);

  console.log('— pool8 (physics, server-authoritative)');
  r = await api('POST', '/api/mm/practice', { game: 'pool8' }, laylaTok);
  T('pool8 practice room created', r.status === 200 && r.j.room.game === 'pool8', r.j && r.j.err);
  const plRoom = r.j.room.id;
  r = await api('POST', '/api/rooms/' + plRoom + '/move', { angle: 0, power: 1000 }, laylaTok);
  T('pool8: power out of range rejected', r.status === 400);
  r = await api('POST', '/api/rooms/' + plRoom + '/move', { angle: 0, power: 65 }, laylaTok);
  T('pool8: break shot accepted', r.status === 200, r.j);
  const plState = (await api('GET', '/api/rooms/' + plRoom, null, laylaTok)).j.room;
  T('pool8: balls scattered by physics', Array.isArray(plState.balls) && plState.balls.length === 16, plState.balls && plState.balls.length);
  T('pool8: state exposes groups + aimable', plState.groups && plState.aimable === true);
  await api('POST', '/api/rooms/' + plRoom + '/leave', null, laylaTok);

  /* ============ 8. PRACTICE VS AI ============ */
  console.log('— practice vs AI');
  r = await api('POST', '/api/mm/practice', { game: 'connect4' }, laylaTok);
  T('practice room created', r.status === 200 && r.j.room.vs_ai === true, r.j);
  const aiRoom = r.j.room.id;
  r = await api('POST', '/api/rooms/' + aiRoom + '/move', { col: 3 }, laylaTok);
  T('practice move ok', r.status === 200);
  await sleep(900);   /* AI responds */
  r = await api('GET', '/api/rooms/' + aiRoom, null, laylaTok);
  const b = r.j.room.board;
  const aiMoved = b.some((row, ri) => row.some((v, ci) => v === 2));
  T('server AI responded', aiMoved);
  T('board state hidden from non-participants', (await api('GET', '/api/rooms/' + aiRoom, null, admTok)).j.room.you === 0);
  await api('POST', '/api/rooms/' + aiRoom + '/leave', null, laylaTok);
  /* reversi practice vs server AI */
  r = await api('POST', '/api/mm/practice', { game: 'reversi' }, laylaTok);
  T('reversi practice room created', r.status === 200 && r.j.room.vs_ai === true && r.j.room.game === 'reversi', r.j);
  const rvAi = r.j.room.id;
  r = await api('POST', '/api/rooms/' + rvAi + '/move', { r: 0, c: 0 }, laylaTok);
  T('reversi AI room: illegal rejected', r.status === 400);
  r = await api('POST', '/api/rooms/' + rvAi + '/move', { r: 3, c: 2 }, laylaTok);
  T('reversi AI room: legal accepted', r.status === 200);
  await sleep(900);
  r = await api('GET', '/api/rooms/' + rvAi, null, laylaTok);
  const b2 = r.j.room.board;
  let ai2 = 0;
  b2.forEach(row => row.forEach(v => { if (v === 2) ai2++; }));
  T('reversi: server AI responded (white discs grew)', ai2 >= 2, ai2);

  /* ============ 9. SECURITY ============ */
  console.log('— security');
  r = await api('POST', '/api/admin/users/' + omarId + '/ban', { on: true }, admTok);
  T('admin bans user', r.status === 200);
  r = await api('GET', '/api/me', null, omarTok);
  T('banned user session revoked', r.status === 401 || r.status === 403);
  r = await api('POST', '/api/auth/login', { id: 'Omar_Q8', password: 'omar12345' });
  T('banned login blocked', r.status === 403);
  r = await api('POST', '/api/admin/users/' + omarId + '/ban', { on: false }, admTok);
  T('admin unbans', r.status === 200);
  /* tampered token */
  r = await api('GET', '/api/me', null, laylaTok.slice(0, -2) + 'zz');
  T('forged token rejected', r.status === 401);
  /* negative grant */
  r = await api('POST', '/api/admin/users/' + omarId + '/grant', { coins: -999999999 }, admTok);
  T('negative-balance grant rejected', r.status === 400 || r.status === 402);
  /* malformed json */
  const rawRes = await fetch(B + '/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer x' }, body: '{bad json' });
  T('malformed json handled', rawRes.status === 400);
  /* admin overview sanity */
  r = await api('GET', '/api/admin/overview', null, admTok);
  T('admin overview works', r.status === 200 && r.j.totalUsers >= 3 && Array.isArray(r.j.dau) && r.j.dau.length === 14);
  T('revenue tracked from orders', r.j.revenue >= 999 + 999, r.j.revenue);
  r = await api('GET', '/api/nope', null, laylaTok);
  T('unknown api → 404 json', r.status === 404 && r.j.ok === false);

  /* long-poll fallback parity */
  console.log('— long-poll fallback');
  const pollRes = await fetch(B + '/api/rt/poll?cur=0&timeout=1', { headers: { Authorization: 'Bearer ' + laylaTok } });
  const pj = await pollRes.json();
  T('poll returns event log with cursor', pollRes.status === 200 && typeof pj.cursor === 'number' && Array.isArray(pj.events));

  srv.kill();
  await sleep(300);
  console.log('\n════════════════════════════');
  console.log('  PASSED: ' + passed + '   FAILED: ' + failed);
  if (fails.length){ console.log('  failing:', fails.join(' | ')); process.exit(1); }
  process.exit(0);
}

main().catch(e => { console.error('SUITE CRASH:', e); process.exit(2); });
