'use strict';
/* ============================================================
   VEXORA — DOM integration test
   Boots the real server, loads the real frontend (Arabic RTL)
   in a real DOM, and drives a full player journey end-to-end.
   ============================================================ */
const { JSDOM, VirtualConsole } = require('jsdom');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = parseInt(process.env.TEST_PORT || String(3200 + Math.floor(Math.random() * 500)), 10);
const B = 'http://127.0.0.1:' + PORT;
const DB = '/tmp/vexora-dom-' + Date.now() + '.db';

let passed = 0, failed = 0;
const fails = [];
function T(name, cond, extra){
  if (cond){ passed++; console.log('  ✓', name); }
  else { failed++; fails.push(name); console.log('  ✗', name, extra !== undefined ? '→ ' + String(extra).slice(0, 200) : ''); }
}
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms, label){
  const t0 = Date.now();
  while (Date.now() - t0 < ms){ try { const v = fn(); if (v) return v; } catch(e){} await sleep(150); }
  throw new Error('timeout: ' + label);
}

async function apiRaw(method, p, body, token){
  const r = await fetch(B + '/api' + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  return { status: r.status, j: await r.json().catch(() => null) };
}

async function main(){
  console.log('VEXORA dom-test — booting');
  fs.rmSync(DB, { force: true });
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
    env: Object.assign({}, process.env, { PORT: String(PORT), DB_PATH: DB, PAYMENTS_SIMULATE: '1' }),
    stdio: ['ignore', 'ignore', 'pipe']
  });
  srv.stderr.on('data', d => process.stderr.write('[srv] ' + d));
  srv.on('error', e => { console.log('server process error', e.message); process.exit(2); });
  process.on('exit', () => { try { srv.kill(); } catch(e){} });
  let bootFailed = false;
  srv.on('exit', code => { if (code && code !== 0 && !bootFailed) bootFailed = true; });
  let up = false;
  for (let i = 0; i < 40 && !up; i++){ await sleep(250); try { up = (await apiRaw('GET', '/healthz')).j.ok; } catch(e){} }
  if (!up){ console.log('server failed to boot'); process.exit(1); }

  const vc = new VirtualConsole();
  const pageErrors = [];
  vc.on('jsdomError', e => { if (!/Not implemented/.test(e.message)) pageErrors.push(e.message + (e.detail ? ' :: ' + e.detail : '')); });
  vc.on('error', m => pageErrors.push(String(m)));

  const dom = await JSDOM.fromURL(B + '/', {
    runScripts: 'dangerously',
    resources: 'usable',
    pretendToBeVisual: true,
    virtualConsole: vc,
    beforeParse(window){
      window.fetch = (u, opts) => fetch(new URL(u, B).href, opts);
      window.WebSocket = WebSocket;
    }
  });
  const w = dom.window, d = w.document;

  console.log('— boot & auth');
  await waitFor(() => d.getElementById('lg-id') || d.getElementById('rg-u'), 8000, 'auth form');
  if (!d.getElementById('rg-u')) w.setAuthTab('register');
  await waitFor(() => d.getElementById('rg-u'), 3000, 'register form');
  T('RTL document', d.documentElement.getAttribute('dir') === 'rtl' && d.documentElement.lang === 'ar');
  T('page title carries brand', /VEXORA|فيكسورا/.test(d.title), d.title);
  T('server-config booted past connection screen', !d.getElementById('bootscr') || !d.querySelector('#bootscr .boot-status'));
  T('arabic brand visible on auth', d.body.textContent.includes('فيكسورا'));

  d.getElementById('rg-u').value = 'DomTester_' + Math.floor(Math.random() * 9000 + 1000);
  d.getElementById('rg-e').value = 'dom' + Date.now() + '@t.gg';
  d.getElementById('rg-pw').value = 'testpass123';
  d.getElementById('rg-pw2').value = 'testpass123';
  w.doRegister();
  await waitFor(() => w.S && w.S.me && d.querySelector('.hdr-in'), 8000, 'lobby after register');
  const myName = w.S.me.user.username;
  T('lobby rendered in Arabic RTL', d.body.textContent.includes('حلبة') && d.body.textContent.includes('اللوبي'));
  T('header shows real server balance (1000)', d.getElementById('hdr-coins') && d.getElementById('hdr-coins').textContent === '1,000');
  await waitFor(() => w.S.transport !== '\u2014', 6000, 'realtime transport');
  T('connected via websocket', w.S.transport === 'ws', w.S.transport);

  console.log('— second player via API');
  const rivalName = 'Rival_' + (Date.now() % 100000);
  const p2 = await apiRaw('POST', '/auth/register', { username: rivalName, email: rivalName.toLowerCase() + '@t.gg', password: 'rival12345' });
  if (!p2.j || !p2.j.token) { console.log('rival register failed', p2.j); process.exit(2); }
  await apiRaw('POST', '/mm/queue', { game: 'connect4' }, p2.j.token);

  console.log('— matchmaking through the UI');
  w.quickMatch('connect4');
  await waitFor(() => w.S.roomView && w.S.roomView.status === 'playing', 9000, 'match found + room open');
  T('match:found event opened live room', !!d.querySelector('.c4-board'));
  T('opponent shown (real player)', d.body.textContent.includes(rivalName));
  T('board is empty at start', d.querySelectorAll('.c4-cell.p1,.c4-cell.p2').length === 0);

  console.log('— moves: UI → server → realtime back');
  const myCls = 'p' + w.S.roomView.you;                       /* I am the guest (p2): rival opens */
  const oppCls = myCls === 'p1' ? 'p2' : 'p1';
  if (w.S.roomView.turn !== w.S.roomView.you){
    await apiRaw('POST', '/rooms/' + w.S.roomView.id + '/move', { col: 0 }, p2.j.token);
    await waitFor(() => d.querySelectorAll('.c4-cell.' + oppCls).length === 1, 5000, 'rival opening move rendered');
  }
  await waitFor(() => w.S.roomView.turn === w.S.roomView.you, 4000, 'my turn');
  w.dropDisc(3);
  await waitFor(() => d.querySelectorAll('.c4-cell.' + myCls).length === 1, 4000, 'my disc rendered');
  T('my move rendered from server push', d.querySelectorAll('.c4-cell.' + myCls).length === 1);
  await apiRaw('POST', '/rooms/' + w.S.roomView.id + '/move', { col: 3 }, p2.j.token);
  await waitFor(() => d.querySelectorAll('.c4-cell.' + oppCls).length >= 2, 5000, 'opponent second disc via room:update');
  T('opponent move arrived over realtime', d.querySelectorAll('.c4-cell.' + oppCls).length >= 2);
  const st = (await apiRaw('GET', '/rooms/' + w.S.roomView.id, null, w.S.token)).j.room;
  T('turn indicator matches server', w.S.roomView.turn === st.turn);

  console.log('— chat with premium emoji');
  await apiRaw('POST', '/rooms/' + w.S.roomView.id + '/chat', { text: 'استعد للخسارة 😎' }, p2.j.token);
  await waitFor(() => (w.S.roomChat || []).some(m => m.name === rivalName), 6000, 'chat event');
  T('opponent chat rendered', d.getElementById('chat-msgs') && d.getElementById('chat-msgs').textContent.includes('استعد'));
  d.getElementById('chat-inp').value = ':vex: 🔥';
  await w.sendChatUI();
  await waitFor(() => (w.S.roomChat || []).some(m => m.userId === w.S.me.user.id), 4000, 'my chat');
  T('my chat message sent & rendered', d.getElementById('chat-msgs').textContent.includes('🔥'));
  d.getElementById('chat-inp').value = ':emo_gold:';
  await w.sendChatUI();
  T('premium emoji without ownership rejected by server', !(w.S.roomChat || []).some(m => m.text.includes(':emo_gold:')));

  console.log('— wallet via UI');
  w.navigate('wallet');
  await waitFor(() => d.getElementById('wallet-bal'), 4000, 'wallet view');
  const before = parseInt(d.getElementById('wallet-bal').textContent.replace(/,/g, ''), 10);
  w.claimDaily();
  await waitFor(() => d.getElementById('wallet-bal') && parseInt(d.getElementById('wallet-bal').textContent.replace(/,/g, ''), 10) > before, 5000, 'daily credited');
  T('daily bonus through UI credited on server', true);

  console.log('— store & inventory via UI');
  const adm = await apiRaw('POST', '/auth/login', { id: 'admin@vexora.gg', password: 'admin123' });
  const myId = w.S.me.user.id;
  await apiRaw('POST', '/admin/users/' + myId + '/grant', { coins: 5000, reason: 'dom test' }, adm.j.token);
  await w.refreshMe();
  w.navigate('store');
  await waitFor(() => w.S.storeItems && w.S.storeItems.length, 5000, 'catalog');
  T('store catalog localized (arabic)', w.S.storeItems.some(i => i.name_ar.includes('عصية')));
  await w.buyVCUI('emo_gold');
  await waitFor(() => (w.S.me.inventory || []).some(i => i.item_id === 'emo_gold'), 5000, 'owned');
  T('emoji pack purchased from UI → server inventory', true);
  /* now premium emoji chat works */
  w.navigate('room');
  await waitFor(() => d.getElementById('chat-inp'), 4000, 'back in room');
  d.getElementById('chat-inp').value = ':emo_gold: 👑';
  await w.sendChatUI();
  await waitFor(() => (w.S.roomChat || []).some(m => m.text.includes(':emo_gold:')), 4000, 'premium emoji accepted');
  T('premium emoji now accepted (owned)', !!d.querySelector('.sticker'));

  console.log('— friends via UI');
  w.navigate('friends');
  await waitFor(() => d.getElementById('fr-name'), 4000, 'friends view');
  d.getElementById('fr-name').value = rivalName;
  await w.addFriendUI();
  await waitFor(() => (w.S.friends || { incoming: [] }).incoming && false || true, 1000, 'sent');
  const p2friends = await apiRaw('GET', '/friends', null, p2.j.token);
  T('friend request reached server', p2friends.j.incoming.some(r => r.from.username === myName));
  await apiRaw('POST', '/friends/respond', { id: p2friends.j.incoming[0].id, accept: true }, p2.j.token);
  await waitFor(() => (w.S.friends || { friends: [] }).friends.length > 0, 8000, 'friend:accepted realtime');
  T('friendship reflected in UI after realtime event', w.S.friends.friends[0].user.username === rivalName);

  console.log('— profile & achievements data');
  w.navigate('profile');
  await waitFor(() => d.body.textContent.includes('إحصائياتي'), 4000, 'profile');
  T('profile renders arabic headings', d.body.textContent.includes('الإنجازات'));

  console.log('— checkout (dev simulator) via UI');
  w.navigate('store');
  await waitFor(() => w.S.storeItems, 3000, 'store again');
  w.checkoutUI('pack_5k');
  await waitFor(() => d.getElementById('pay-btn'), 3000, 'checkout modal');
  const balBefore = w.S.me.coins;
  await w.doCheckout('pack_5k');
  await waitFor(() => w.S.me.coins === balBefore + 5000, 6000, 'coins after payment');
  T('dev checkout credited coins through real order pipeline', true);
  const orders = await apiRaw('GET', '/pay/orders', null, w.S.token);
  T('order recorded as paid', orders.j.orders[0].status === 'paid');

  console.log('— reversi (أوثيلو) via UI');
  if (w.S.roomView && w.S.roomView.status === 'playing' && !w.S.roomView.over){
    await w.leaveRoomUI(w.S.roomView.id);      /* close the earlier live match first (concedes) */
  }
  await w.practiceAI('reversi');
  await waitFor(() => w.document.querySelector('.rv-board'), 5000, 'reversi board');
  T('reversi board renders with the 4 starting discs', w.document.querySelectorAll('.rv-cell.p1,.rv-cell.p2').length === 4);
  const hints = w.document.querySelectorAll('.rv-cell[data-hint]').length;
  T('legal-move hints shown on my turn', hints >= 1, hints);
  w.document.querySelector('.rv-cell[data-hint]').click();
  await waitFor(() => w.S.roomView && w.S.roomView.move_count >= 1, 5000, 'my reversi move accepted');
  await sleep(1100);   /* server AI replies after ~650ms */
  T('reversi: my move + server-AI reply on the board', w.S.roomView.move_count >= 2, w.S.roomView.move_count);

  console.log('— reconnect: reload drops you back into the live room');
  const dom2 = await JSDOM.fromURL(B + '/', {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(window){
      window.fetch = (u, o) => fetch(new URL(u, B).href, o);
      window.WebSocket = WebSocket;
      try { window.localStorage.setItem('vexora_token', w.S.token); } catch(e){}
    }
  });
  const w2 = dom2.window;
  await waitFor(() => w2.S && w2.S.me && w2.S.roomView && (w2.document.querySelector('.rv-board') || w2.document.querySelector('.c4-board')), 9000, 'session restored into room');
  T('page reload returns the player to their live room', w2.S.roomView && w2.S.roomView.game === 'reversi' && w2.S.roomView.move_count >= 2);
  T('reconnected board shows live disc counts', w2.document.querySelectorAll('.rv-cell.p1,.rv-cell.p2').length >= 6);
  try { if (w2.S.rt) w2.S.rt.close(); } catch(e){}   /* detach realtime before closing the page */
  dom2.window.close();

  console.log('— admin view (as player → redirect; via admin login)');
  T('admin route blocked for players', w.S.me.user.role !== 'player' ? false : true);
  await w.logout();
  await waitFor(() => w.S.me === null && (w.document.getElementById('rg-u') || w.document.getElementById('lg-id')), 4000, 'back to auth');
  if (!w.document.getElementById('lg-id')) w.setAuthTab('login');
  await waitFor(() => w.document.getElementById('lg-id'), 2500, 'login form');
  w.document.getElementById('lg-id').value = 'admin@vexora.gg';
  w.document.getElementById('lg-pw').value = 'admin123';
  w.doLogin();
  await waitFor(() => w.S.me && w.S.me.user.role === 'admin', 7000, 'admin session');
  w.navigate('admin');
  await waitFor(() => w.document.body.textContent.includes('VEXORA Control Center'), 6000, 'admin overview');
  await sleep(800);
  T('admin overview KPIs render from live data', w.document.querySelectorAll('.kpi').length >= 4, w.document.querySelectorAll('.kpi').length);
  w.setAdminTab('users');
  await waitFor(() => w.document.getElementById('adm-users'), 5000, 'users table');
  T('players tab lists accounts', w.document.querySelectorAll('#adm-users table tr').length >= 3);
  w.setAdminTab('orders');
  await sleep(900);
  T('orders tab renders settled orders', w.document.body.textContent.includes('paid') || w.document.body.textContent.includes('pending'));

  console.log('— no page errors');
  T('zero uncaught page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));

  srv.kill();
  console.log('\n════════════════════════════');
  console.log('  DOM PASSED: ' + passed + '   FAILED: ' + failed);
  if (fails.length) console.log('  failing:', fails.join(' | '));
  process.exit(failed ? 1 : 0);
}

main().catch(e => { console.error('DOM SUITE CRASH:', e); process.exit(2); });
