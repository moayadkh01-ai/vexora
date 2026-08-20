'use strict';
/* ============================================================
   VEXORA — client core
   API · state · realtime (WS → long-poll fallback) · router ·
   header/footer · boot · auth. Arabic RTL player interface.
   ============================================================ */

/* ---------- tiny helpers ---------- */
const $ = s => document.querySelector(s);
const fmt = n => Math.round(n).toLocaleString('en-US');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const ago = t => {
  const s = Math.max(1, Math.floor((Date.now() - t) / 1000));
  if (s < 60) return 'الآن';
  const m = Math.floor(s / 60); if (m < 60) return 'قبل ' + m + ' د';
  const h = Math.floor(m / 60); if (h < 24) return 'قبل ' + h + ' س';
  return 'قبل ' + Math.floor(h / 24) + ' يوم';
};

/* ---------- brand: logo & coin ---------- */
function logoMark(s = 42){
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 96 96" style="flex-shrink:0">'
    + '<defs><linearGradient id="vmk' + s + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset=".52" stop-color="#6366f1"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs>'
    + '<path d="M48 3 L86 25 V71 L48 93 L10 71 V25 Z" fill="url(#vmk' + s + ')"/>'
    + '<path d="M25 31 H38.5 L48 53.5 L57.5 31 H71 L48 77 Z" fill="#05070f"/></svg>';
}
function logoFull(mk = 38, fs = 22){
  return '<div style="display:flex;align-items:center;gap:11px">' + logoMark(mk)
    + '<div><span style="font-size:' + fs + 'px;font-weight:900;letter-spacing:.24em">VEXORA</span>'
    + '<span style="display:block;font-size:' + (fs * .36) + 'px;letter-spacing:.4em;color:#98a2c0;font-weight:700;margin-top:2px">فيكسورا</span></div></div>';
}
function coinSVG(s = 20){
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 40 40" style="flex-shrink:0">'
    + '<defs><linearGradient id="vcg' + s + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset=".5" stop-color="#ffc945"/><stop offset="1" stop-color="#e88f0c"/></linearGradient></defs>'
    + '<circle cx="20" cy="20" r="18" fill="url(#vcg' + s + ')"/>'
    + '<circle cx="20" cy="20" r="14.5" fill="none" stroke="rgba(66,42,2,.35)" stroke-width="1.6"/>'
    + '<path d="M12 13h4.6L20 20l3.4-7H28l-8 15-8-15z" fill="#3a2703"/></svg>';
}

/* ---------- icons ---------- */
const ICONS = {
  home:'<path d="M3 11.2 12 3l9 8.2"/><path d="M5.5 9.8V21h4.7v-6h3.6v6h4.7V9.8"/>',
  store:'<path d="M5.5 8h13l1.2 12.5H4.3L5.5 8z"/><path d="M8.5 10.5V7a3.5 3.5 0 0 1 7 0v3.5"/>',
  wallet:'<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M3 10h18"/><circle cx="16.5" cy="15" r="1.4"/>',
  user:'<circle cx="12" cy="8" r="4"/><path d="M4.5 20.5c1.3-3.6 4-5.5 7.5-5.5s6.2 1.9 7.5 5.5"/>',
  users:'<circle cx="9" cy="8.5" r="3.5"/><path d="M2.5 20c1.1-3.2 3.5-4.9 6.5-4.9s5.4 1.7 6.5 4.9"/><path d="M16 5.4a3.5 3.5 0 0 1 0 6.4M17.8 15.4c1.7.8 2.9 2.2 3.7 4.1"/>',
  shield:'<path d="M12 3l7 3v6c0 4.5-3 7.8-7 9-4-1.2-7-4.5-7-9V6l7-3z"/><path d="M9 12l2.2 2.2L15.5 9.7"/>',
  bell:'<path d="M6 16v-5a6 6 0 0 1 12 0v5l1.8 2.6H4.2L6 16z"/><path d="M10 21a2.2 2.2 0 0 0 4 0"/>',
  menu:'<path d="M4 7h16M4 12h16M4 17h16"/>',
  x:'<path d="M6 6l12 12M18 6 6 18"/>',
  check:'<path d="M5 12.5 10 17.5 19 7"/>',
  trophy:'<path d="M7 4h10v5a5 5 0 0 1-10 0V4z"/><path d="M7 5H4.5a3 3 0 0 0 3 4M17 5h2.5a3 3 0 0 1-3 4"/><path d="M12 14v3M8.5 20h7M10 17h4"/>',
  flame:'<path d="M12 3s5.5 4.2 5.5 9a5.5 5.5 0 0 1-11 0C6.5 9 9.3 7 9.6 4.2c.9 1 1.4 2.2 1.1 3.6C12.4 6.3 12 4.6 12 3z"/>',
  bolt:'<path d="M13 2 4.5 13.5H11L9.5 22 18.5 10H12L13 2z"/>',
  chart:'<path d="M4 4v16h16"/><path d="M7.5 15.5 11 11l3 3 5.5-6.5"/>',
  logout:'<path d="M9 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H9"/><path d="M14 8l4 4-4 4M18 12H8"/>',
  plus:'<path d="M12 5v14M5 12h14"/>',
  gift:'<rect x="4" y="10" width="16" height="10" rx="2"/><path d="M12 10v10M4 10h16"/><path d="M12 10c0-3-1.5-5-3-5s-2.8 1.5-1.8 3M12 10c0-3 1.5-5 3-5s2.8 1.5 1.8 3"/>',
  crown:'<path d="M4 8l4 3.5L12 5l4 6.5L20 8l-1.5 10h-13L4 8z"/>',
  star:'<path d="M12 3l2.7 5.6 6.1.8-4.5 4.3 1.1 6-5.4-3-5.4 3 1.1-6L3.2 9.4l6.1-.8L12 3z"/>',
  clock:'<circle cx="12" cy="12" r="8.5"/><path d="M12 7v5.5l3.5 2"/>',
  search:'<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5 21 21"/>',
  mail:'<rect x="3" y="5" width="18" height="14" rx="3"/><path d="M4 7.5l8 6 8-6"/>',
  lock:'<rect x="5" y="10.5" width="14" height="10" rx="2.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5"/>',
  arrow:'<path d="M4 12h15M13 6l6 6-6 6"/>',
  gamepad:'<rect x="2.5" y="7.5" width="19" height="10.5" rx="5"/><path d="M8 10.5v4M6 12.5h4"/><circle cx="15.5" cy="11.5" r="1" fill="currentColor"/><circle cx="17.8" cy="14" r="1" fill="currentColor"/>',
  coins:'<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M9 15v3c0 1.7 2.7 3 6 3s6-1.3 6-3v-5c0-1.4-1.6-2.5-4-2.9"/><path d="M15 13v4c0 1.7 2.7 3 6 3"/>',
  swap:'<path d="M7 4v13M3.5 13.5 7 17.5l3.5-4M17 20V7M13.5 10.5 17 6.5l3.5 4"/>',
  send:'<path d="M21 3 10 14M21 3l-7 19-4-8-8-4 19-7z"/>',
  smile:'<circle cx="12" cy="12" r="8.5"/><path d="M8.5 14.5c.9 1.5 2 2.2 3.5 2.2s2.6-.7 3.5-2.2"/><circle cx="9" cy="9.5" r=".8" fill="currentColor"/><circle cx="15" cy="9.5" r=".8" fill="currentColor"/>',
  door:'<path d="M13 4h6v16h-6M13 12H3M6.5 8.5 3 12l3.5 3.5"/>',
  globe:'<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.6 2.3 3.9 5.1 3.9 8.5s-1.3 6.2-3.9 8.5c-2.6-2.3-3.9-5.1-3.9-8.5s1.3-6.2 3.9-8.5z"/>'
};
function icon(n, s = 18){
  return '<svg width="' + s + '" height="' + s + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0">' + (ICONS[n] || '') + '</svg>';
}

/* ---------- state ---------- */
const S = {
  token: null, me: null, config: null, presence: { online: 0, counts: {}, openRooms: 0 },
  chatRooms: null, chatOpenId: null, chatMsgs: {}, chatUnread: {},
  route: 'lobby', authTab: 'login', rt: null, cursor: 0, transport: '—',
  roomView: null, storeTab: 'packs', friends: null, leaderboard: null, lobbyRooms: []
};
try { S.token = localStorage.getItem('vexora_token') || null; } catch(e){}
window.S = S;   /* expose state for debugging/tests (server never trusts it) */

/* ---------- API client ---------- */
async function api(method, path, body){
  const headers = { 'Content-Type': 'application/json' };
  if (S.token) headers.Authorization = 'Bearer ' + S.token;
  const r = await fetch('/api' + path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  let j = null;
  try { j = await r.json(); } catch(e){}
  if (r.status === 401 && S.me){ S.me = null; try{ localStorage.removeItem('vexora_token'); }catch(_){ } S.token = null; navigate('auth'); throw new Error((j && j.msg) || 'انتهت الجلسة'); }
  if (!r.ok || !j || j.ok === false) throw Object.assign(new Error((j && j.msg) || (j && j.error) || 'خطأ غير متوقع'), { code: j && j.error, status: r.status });
  return j;
}

/* ---------- toasts / modal ---------- */
/* ALREADY_IN_ROOM → refresh state so the lobby banner shows escape buttons */
async function roomLockHint(err){
  if (err && err.code === 'ALREADY_IN_ROOM'){
    await refreshMe();
    if (S.route !== 'lobby') navigate('lobby'); else render();
    toast('لديك غرفة أو مباراة جارية', 'استخدم أزرار «العودة للغرفة» أو «مغادرة وإعادة تعيين» في أعلى اللوبي', 'info');
    return true;
  }
  return false;
}

function toast(title, msg, type){
  type = type || 'ok';
  const ic = { ok: 'check', err: 'x', coin: 'coins', info: 'bolt' }[type] || 'check';
  const col = { ok: '#34d399', err: '#fb7185', coin: '#ffc945', info: '#22d3ee' }[type];
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = '<div style="width:34px;height:34px;border-radius:11px;background:' + col + '22;color:' + col + ';display:flex;align-items:center;justify-content:center;flex-shrink:0">' + icon(ic, 17) + '</div><div><b>' + esc(title) + '</b>' + (msg ? '<span>' + esc(msg) + '</span>' : '') + '</div>';
  $('#toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 320); }, 3600);
}
function openModal(html, wide){
  $('#modal-root').innerHTML = '<div class="modal-ov" onclick="if(event.target===this)closeModal()"><div class="modal' + (wide ? ' wide' : '') + '">'
    + '<button class="modal-x" onclick="closeModal()">' + icon('x', 18) + '</button>' + html + '</div></div>';
}
function closeModal(){ $('#modal-root').innerHTML = ''; }

/* ---------- realtime: WebSocket with long-poll fallback ---------- */
function rtConnect(){
  if (S.rt){ try { S.rt.close(); } catch(e){} S.rt = null; }
  if (!S.token) return;
  let opened = false, pollTimer = null, ws = null;
  const onEvent = ev => handleEvent(ev);

  const startPolling = () => {
    if (opened || pollTimer) return;
    S.transport = 'poll';
    (async function poll(){
      if (pollTimer === 'stop') return;
      try {
        const r = await fetch('/api/rt/poll?cur=' + S.cursor + '&timeout=20', { headers: { Authorization: 'Bearer ' + S.token } });
        const j = await r.json();
        if (j && j.events) j.events.forEach(onEvent);
        S.cursor = Math.max(S.cursor, (j && j.cursor) || S.cursor);
      } catch(e){ await new Promise(r => setTimeout(r, 1500)); }
      pollTimer = setTimeout(poll, 300);
    })();
  };

  try {
    const proto = location.protocol === 'https:' ? 'wss://' : 'ws://';
    ws = new WebSocket(proto + location.host + '/rt?token=' + encodeURIComponent(S.token));
    S.rt = ws;
    const fallback = setTimeout(() => { if (!opened){ try{ ws.close(); }catch(e){} startPolling(); } }, 4000);
    ws.onopen = () => { opened = true; clearTimeout(fallback); S.transport = 'ws'; setStatus('متصل'); hb(); };
    ws.onmessage = raw => {
      let m; try { m = JSON.parse(raw.data); } catch(e){ return; }
      if (m.t === 'event' && m.ev) onEvent(m.ev);
    };
    ws.onclose = () => { if (opened){ setStatus('إعادة الاتصال…', true); setTimeout(rtConnect, 1500); } };
    ws.onerror = () => { if (!opened){ startPolling(); } };
  } catch(e){ startPolling(); }

  function hb(){ if (ws && ws.readyState === 1){ ws.send('{"t":"hb"}'); setTimeout(hb, 20000); } }
}
function setStatus(txt, warn){ if (!document || !document.body) return; const el = $('#conn-status'); if (el){ el.textContent = txt; el.style.color = warn ? '#fda4af' : '#6ee7c0'; } }

function handleEvent(ev){
  if (!document || !document.body) return;   /* page closing/closed — ignore late events */
  const d = ev.data || {};
  if (ev.seq) S.cursor = Math.max(S.cursor, ev.seq);
  switch (ev.type){
    case 'match:found':
      toast('تم إيجاد خصم! ⚡', 'ضد ' + d.vs.username + ' — جارٍ فتح الغرفة');
      openRoom(d.roomId, true);
      break;
    case 'room:update':
      if (S.roomView && S.roomView.id === d.room.id){
        S.roomView = (typeof sanitizeRoom === 'function' ? sanitizeRoom(d.room, S.roomView) : d.room);
        renderRoom();
      }
      if (S.route === 'lobby') refreshLobbyBits();
      break;
    case 'gchat':                                   /* public chat rooms realtime */
      {
        const m = d.msg;
        if (!m) break;
        if (!S.chatMsgs[m.room_id]) S.chatMsgs[m.room_id] = [];
        if (!S.chatMsgs[m.room_id].some(x => x.id === m.id)){ S.chatMsgs[m.room_id].push(m); if (S.chatMsgs[m.room_id].length > 80) S.chatMsgs[m.room_id].shift(); }
        if (S.route === 'chat' && S.chatOpenId === m.room_id) appendGchatMsg(m);
        else if (S.route === 'lobby' && S.chatRooms) loadChatRooms();
        if (S.me && m.name !== S.me.user.username && (S.route !== 'chat' || S.chatOpenId !== m.room_id)){
          /* light badge: update unread per room */
          S.chatUnread[m.room_id] = (S.chatUnread[m.room_id] || 0) + 1;
        }
      }
      break;
    case 'chat:new':
      if (S.roomView && S.roomView.id === d.roomId) appendChat(d);
      break;
    case 'room:left':
      if (S.roomView && S.roomView.id === d.roomId) toast('خرج الخصم', d.by + ' غادر المباراة — فزت بالجائزة');
      break;
    case 'wallet:update':
      if (S.me) refreshMe();
      break;
    case 'presence':
      S.presence = d;
      updatePresenceUI();
      break;
    case 'friend:req':
      toast('طلب صداقة جديد', 'من ' + (d.from && d.from.username));
      loadFriends(); if (S.route === 'friends') render();
      break;
    case 'friend:challenge':
      if (typeof showChallengeModal === 'function') showChallengeModal(d);
      break;
    case 'friend:accepted':
      toast('تم قبول طلب الصداقة', d.by + ' أصبح صديقك');
      loadFriends(); if (S.route === 'friends') render();
      break;
    case 'queue:joined': break;
    case 'queue:left':
      if (d.reason === 'INSUFFICIENT_FUNDS') toast('خرجت من الطابور', 'رصيدك لا يكفي رسوم الدخول', 'err');
      break;
    case 'force:logout':
      doLogoutLocal(); toast('تم تسجيل خروجك', 'تواصل مع دعم فيكسورا', 'err');
      break;
  }
}

/* ---------- data refresh ---------- */
async function refreshMe(){
  try {
    const j = await api('GET', '/me');
    S.me = j;
    const hc = $('#hdr-coins'); if (hc) hc.textContent = fmt(j.coins);
    const nm = $('#hdr-name'); if (nm) nm.textContent = j.user.username;
  } catch(e){ if (e.status !== 401) console.warn(e.message); }
}
async function loadFriends(){ try { S.friends = (await api('GET', '/friends')); } catch(e){ S.friends = { friends: [], incoming: [], outgoing: [] }; } }
async function refreshLobbyBits(){
  try {
    const [lb, rooms] = await Promise.all([api('GET', '/leaderboard'), api('GET', '/rooms')]);
    S.leaderboard = lb.top; S.lobbyRooms = rooms.rooms;
    if (S.route === 'lobby'){ const l = $('#lb-list'); if (l) l.innerHTML = lbRows(); const rl = $('#rooms-list'); if (rl) rl.innerHTML = roomCards(); }
  } catch(e){}
}
function updatePresenceUI(){
  const e = $('#online-now'); if (e) e.textContent = fmt(S.presence.online);
  const r = $('#open-rooms-count'); if (r) r.textContent = fmt(S.presence.openRooms);
  document.querySelectorAll('[data-gc]').forEach(el => {
    const c = S.presence.counts[el.getAttribute('data-gc')];
    el.textContent = c ? fmt(c) : '٠';
  });
}

/* ---------- router ---------- */
const TITLES = {
  lobby: 'اللوبي الرئيسي — فيكسورا',
  store: 'متجر فيكسورا',
  wallet: 'محفظة عملات فيكسورا',
  profile: 'ملفي الشخصي',
  friends: 'الأصدقاء',
  room: 'غرفة اللعب',
  admin: 'لوحة الإدارة — VEXORA',
  chat: 'غرف السواليف — فيكسورا'
};
function navigate(r){
  if (!S.me && r !== 'auth') r = 'auth';
  S.route = r;
  if (r === 'lobby') refreshLobbyBits();
  render();
  window.scrollTo(0, 0);
  try { location.hash = '#/' + r; } catch(e){}
}
function routeFromHash(){
  const h = (location.hash || '').replace('#/', '');
  if (['lobby', 'store', 'wallet', 'profile', 'friends', 'admin', 'room', 'chat'].indexOf(h) >= 0) return h;
  return null;
}
window.addEventListener('hashchange', () => {
  const h = routeFromHash();
  if (h && h !== S.route) navigate(h);
});

/* ---------- render root ---------- */
function render(){
  const root = $('#root');
  document.title = (TITLES[S.route] || 'فيكسورا') + ' | VEXORA';
  if (!S.me){ S.route = 'auth'; document.title = 'تسجيل الدخول — فيكسورا'; root.innerHTML = viewAuth(); return; }
  const views = { lobby: typeof viewLobby === 'function' ? viewLobby : null, store: typeof viewStore === 'function' ? viewStore : null, wallet: typeof viewWallet === 'function' ? viewWallet : null, profile: typeof viewProfile === 'function' ? viewProfile : null, friends: typeof viewFriends === 'function' ? viewFriends : null, room: typeof viewRoomEntry === 'function' ? viewRoomEntry : null, chat: typeof viewChat === 'function' ? viewChat : null, admin: typeof viewAdmin === 'function' ? viewAdmin : null };
  const body = (views[S.route] || views.lobby)();
  root.innerHTML = headerHTML() + body + footerHTML() + drawerHTML() + bottomNavHTML();
}

/* ---------- header / drawer / footer ---------- */
function headerHTML(){
  const u = S.me.user;
  const unread = S.me.unread || 0;
  const notifs = (S.me && S.me.notifications) || [];
  return '<header class="hdr"><div class="wrap hdr-in">'
    + '<a class="hdr-logo" href="#/lobby" onclick="navigate(\'lobby\')" aria-label="فيكسورا">' + logoFull(38, 21) + '</a>'
    + '<nav class="hdr-nav">'
    + navLink('lobby', 'home', 'اللوبي') + navLink('chat', 'send', 'السواليف') + navLink('store', 'store', 'المتجر') + navLink('wallet', 'wallet', 'المحفظة') + navLink('friends', 'users', 'الأصدقاء')
    + (u.role === 'admin' ? navLink('admin', 'shield', 'الإدارة') : '')
    + '</nav>'
    + '<div class="hdr-spacer"></div>'
    + '<span id="conn-status" style="font-size:10.5px;font-weight:800;letter-spacing:.04em;color:#6ee7c0"></span>'
    + '<button class="coin-pill" onclick="navigate(\'wallet\')" title="محفظة عملات فيكسورا">' + coinSVG(21) + '<span class="num" id="hdr-coins">' + fmt(S.me.coins) + '</span></button>'
    + '<div style="position:relative"><button class="icon-btn" onclick="toggleDD(event)" aria-label="الإشعارات">' + icon('bell', 21) + (unread ? '<span class="dot"></span>' : '') + '</button>'
    + '<div class="dd" id="notifdd" style="display:none"><div class="dd-h">' + icon('bell', 15) + ' الإشعارات <button onclick="markAllRead()">تحديد الكل كمقروء</button></div>'
    + '<div class="dd-list">' + (notifs.length ? notifs.map(n =>
        '<div class="notif' + (n.read ? '' : ' unread') + '"><div class="nic" style="background:var(--grad-soft);color:var(--cyan)">' + icon(n.type === 'win' ? 'trophy' : n.type === 'friend' ? 'users' : n.type === 'match' ? 'bolt' : n.type === 'purchase' ? 'store' : n.type === 'ach' ? 'star' : 'gift', 17) + '</div>'
        + '<div><div class="nt">' + esc(n.title) + '</div><div class="nb">' + esc(n.body) + '</div><div class="nw">' + ago(n.at) + '</div></div></div>').join('')
      : '<div class="empty">لا إشعارات بعد</div>') + '</div></div></div>'
    + '<div style="position:relative"><button class="hdr-user' + (u.vip ? ' vip' : '') + '" onclick="toggleDD(event)">'
    + avatarHTML(u, 38, true)
    + '<span style="text-align:right"><span class="nm" id="hdr-name">' + esc(u.username) + '</span><span class="lv num">مستوى ' + u.level + (u.vip ? ' · VIP' : '') + '</span></span></button>'
    + '<div class="dd user-menu" id="userdd" style="display:none">'
    + '<button class="mi" onclick="hideDDs();navigate(\'profile\')">' + icon('user', 17) + ' ملفي الشخصي</button>'
    + '<button class="mi" onclick="hideDDs();navigate(\'wallet\')">' + icon('wallet', 17) + ' محفظة العملات</button>'
    + '<button class="mi" onclick="hideDDs();navigate(\'store\')">' + icon('store', 17) + ' متجر فيكسورا</button>'
    + (u.role === 'admin' ? '<button class="mi" onclick="hideDDs();navigate(\'admin\')">' + icon('shield', 17) + ' لوحة الإدارة</button>' : '')
    + '<div style="height:1px;background:var(--line);margin:7px 4px"></div>'
    + '<button class="mi out" onclick="logout()">' + icon('logout', 17) + ' تسجيل الخروج</button>'
    + '</div></div>'
    + '<button class="icon-btn burger" onclick="toggleDrawer()" aria-label="القائمة">' + icon('menu', 22) + '</button>'
    + '</div></header>';
}
function avatarHTML(u, size, withRing){
  const vip = u.vip || (S.me && S.me.user.vip);
  const ring = withRing && vip ? (vip === 'plat' ? ' ring-vip' : ' ring-gold') : '';
  const s = size || 38, fs = Math.round(s * .42);
  return '<span class="ava' + ring + '" style="width:' + s + 'px;height:' + s + 'px;font-size:' + fs + 'px;border-radius:' + Math.round(s * .32) + 'px;'
    + 'background:linear-gradient(135deg,hsl(' + (u.hue || 220) + ',70%,55%),hsl(' + ((u.hue || 220) + 60) % 360 + ',70%,45%))">'
    + esc((u.username || 'V')[0].toUpperCase()) + '</span>';
}
function navLink(r, ic, label){
  return '<a href="#/' + r + '" class="' + (S.route === r ? 'active' : '') + '" onclick="navigate(\'' + r + '\')">' + icon(ic, 16) + label + '</a>';
}
function toggleDD(e){
  if (e) e.stopPropagation();
  const el = e.currentTarget.nextElementSibling;
  const open = el.style.display === 'block';
  hideDDs();
  if (!open) el.style.display = 'block';
}
function hideDDs(){ document.querySelectorAll('.dd').forEach(el => el.style.display = 'none'); }
document.addEventListener('click', e => { if (!e.target.closest('.hdr-user') && !e.target.closest('.icon-btn') && !e.target.closest('.dd')) hideDDs(); });
async function markAllRead(){ try { await api('POST', '/notifs/read', { all: true }); S.me.unread = 0; S.me.notifications.forEach(n => n.read = true); render(); } catch(e){} }
function toggleDrawer(){ const d = $('#drawer'); if (d) d.classList.toggle('open'); }
function closeDrawer(){ const d = $('#drawer'); if (d) d.classList.remove('open'); }
function drawerHTML(){
  const u = S.me.user;
  const it = (r, ic, lb) => '<a href="#/' + r + '" class="' + (S.route === r ? 'active' : '') + '" onclick="navigate(\'' + r + '\')">' + icon(ic, 19) + lb + '</a>';
  return '<div class="drawer" id="drawer"><div class="dk" onclick="closeDrawer()"></div><div class="db">'
    + '<div style="padding:6px 8px 16px">' + logoFull(34, 19) + '</div>'
    + it('lobby', 'home', 'اللوبي') + it('chat', 'send', 'غرف السواليف') + it('store', 'store', 'المتجر') + it('wallet', 'wallet', 'المحفظة') + it('friends', 'users', 'الأصدقاء') + it('profile', 'user', 'ملفي')
    + (u.role === 'admin' ? it('admin', 'shield', 'لوحة الإدارة') : '')
    + '<div style="flex:1"></div>'
    + '<button class="btn ghost wfull" onclick="logout()">' + icon('logout', 16) + ' تسجيل الخروج</button></div></div>';
}
function bottomNavHTML(){
  const u = S.me.user;
  const it = (r, ic, lb) => '<a href="#/' + r + '" class="' + (S.route === r ? 'active' : '') + '" onclick="navigate(\'' + r + '\')">' + icon(ic, 19) + lb + '</a>';
  return '<nav class="bottom-nav">' + it('lobby', 'home', 'اللوبي') + it('chat', 'send', 'السواليف') + it('store', 'store', 'المتجر') + it('wallet', 'wallet', 'المحفظة') + it('friends', 'users', 'الأصدقاء') + (u.role === 'admin' ? it('admin', 'shield', 'الإدارة') : it('profile', 'user', 'ملفي')) + '</nav>';
}
function footerHTML(){
  return '<footer class="ftr"><div class="wrap">'
    + '<div class="ftr-main">'
    + '<div class="ftr-brand">' + logoFull(40, 22)
    + '<p>فيكسورا — منصة الألعاب المتميزة. العب بلا حدود ضد لاعبين من كل العالم، واجمع عملات فيكسورا واشتري من المتجر الرسمي.</p>'
    + '<div style="font-size:12.5px;color:#98a2c0">VEXORA Games · <span class="num">© 2026</span></div></div>'
    + '<div><h5>الألعاب</h5><ul><li><span>بلياردو ٨ — قريبًا</span></li><li><span>شطرنج — قريبًا</span></li><li><span>طاولة — قريبًا</span></li><li><span>فيكسورا كونكت — متاح الآن</span></li></ul></div>'
    + '<div><h5>المنصة</h5><ul>'
    + '<li><a href="#/store" onclick="navigate(\'store\')">متجر فيكسورا</a></li>'
    + '<li><a href="#/wallet" onclick="navigate(\'wallet\')">محفظة العملات</a></li>'
    + '<li><a href="#/friends" onclick="navigate(\'friends\')">الأصدقاء</a></li>'
    + '<li><a href="#/profile" onclick="navigate(\'profile\')">ملفي الشخصي</a></li></ul></div>'
    + '<div><h5>الدعم</h5><ul><li><span>مركز المساعدة — قريبًا</span></li><li><span>اللعب النظيف والأمان</span></li><li><span>شروط الاستخدام</span></li><li><span>الخصوصية</span></li></ul></div>'
    + '</div>'
    + '<div class="ftr-bot"><p>VEXORA وعملات فيكسورا علامات تجارية لشركة VEXORA Entertainment · <span class="num">© 2026</span> · <span class="num" dir="ltr">' + (window.VX_BUILD || '') + '</span></p><div>العب بلا حدود</div></div>'
    + '</div></footer>';
}

/* ---------- boot ---------- */
function viewBoot(){
  const letters = 'VEXORA'.split('').map((ch, i) => '<span style="animation-delay:' + (0.25 + i * .09) + 's" class="grad-text">' + ch + '</span>').join('');
  return '<div class="boot">'
    + '<div style="filter:drop-shadow(0 0 34px rgba(99,102,241,.55))">' + logoMark(120) + '</div>'
    + '<div class="wm">' + letters + '</div>'
    + '<div class="tag">منصة الألعاب المتميزة</div>'
    + '<div class="bar"><i></i></div>'
    + '<div class="boot-status" id="boot-msg">جارٍ الاتصال بالخادم…</div>'
    + '<div class="foot">VEXORA Games · فيكسورا · العب بلا حدود</div></div>';
}
function viewConnFail(){
  return '<div class="boot"><div>' + logoMark(96) + '</div>'
    + '<div style="font-size:22px;font-weight:900;margin-top:18px">تعذر الاتصال بخادم فيكسورا</div>'
    + '<div style="color:#98a2c0;font-size:14px;margin:12px 0 22px;max-width:420px;text-align:center;line-height:1.8">هذه الواجهة تعمل مع خادم فيكسورا. شغّل الخادم بالأمر <b class="num" style="direction:ltr;display:inline-block">npm start</b> ثم أعد المحاولة.</div>'
    + '<button class="btn primary" onclick="location.reload()">' + icon('bolt', 16) + ' إعادة المحاولة</button></div>';
}

/* ---------- auth ---------- */
function viewAuth(){
  const isLogin = S.authTab === 'login';
  return '<div class="auth">'
    + '<div class="auth-brand">'
    + '<div>' + logoFull(52, 30) + '</div>'
    + '<h1>ادخل حلبة <span class="grad-text">فيكسورا</span></h1>'
    + '<p class="lead">حساب واحد لكل الطاولات والحلبات. اصعد في الترتيب، اجمع <b style="color:var(--gold)">عملات فيكسورا</b> والتعب ضد لاعبين حقيقيين مباشرة.</p>'
    + '<div class="auth-feats">'
    + '<div class="auth-feat"><div class="fic">' + icon('bolt', 20) + '</div><div><b>مطابقة فورية</b><span>خصم حقيقي في ثوانٍ عبر WebSockets</span></div></div>'
    + '<div class="auth-feat"><div class="fic">' + icon('trophy', 20) + '</div><div><b>جوائز حقيقية</b><span>الجائزة تُحسم على الخادم وتدخل محفظتك</span></div></div>'
    + '<div class="auth-feat"><div class="fic">' + icon('shield', 20) + '</div><div><b>حساب محمي</b><span>محفظتك وأرصدتك محفوظة على الخادم</span></div></div>'
    + '</div></div>'
    + '<div class="auth-panel"><div class="auth-card">'
    + '<div class="eyebrow">عضوية فيكسورا · حساب حقيقي</div>'
    + '<div class="auth-tabs"><button class="' + (isLogin ? 'on' : '') + '" onclick="setAuthTab(\'login\')">تسجيل الدخول</button><button class="' + (!isLogin ? 'on' : '') + '" onclick="setAuthTab(\'register\')">حساب جديد</button></div>'
    + (isLogin ? loginForm() : registerForm())
    + '<div class="auth-copy">محمي بنظام VEXORA SecurePlay™<span>فيكسورا — منصة الألعاب المتكاملة</span></div>'
    + '</div></div></div>';
}
function loginForm(){
  return '<div class="field"><label>البريد الإلكتروني أو اسم المستخدم</label><div class="inp">' + icon('mail', 17) + '<input id="lg-id" type="text" placeholder="player@vexora.gg"></div><div class="fmsg" id="lg-id-e"></div></div>'
    + '<div class="field"><label>كلمة المرور</label><div class="inp">' + icon('lock', 17) + '<input id="lg-pw" type="password" placeholder="••••••••"></div><div class="fmsg" id="lg-pw-e"></div></div>'
    + '<button class="btn primary big wfull" id="lg-btn" onclick="doLogin()">' + icon('arrow', 18) + ' دخول إلى فيكسورا</button>'
    + '<div class="auth-alt">أو</div>'
    + '<button class="btn ghost wfull" onclick="quickAccount()">' + icon('bolt', 16) + ' إنشاء حساب فوري واللعب</button>';
}
function registerForm(){
  return '<div class="field"><label>اسم المستخدم</label><div class="inp">' + icon('user', 17) + '<input id="rg-u" type="text" placeholder="مثال: Falcon_KW" maxlength="20"></div><div class="fmsg" id="rg-u-e"></div></div>'
    + '<div class="field"><label>البريد الإلكتروني</label><div class="inp">' + icon('mail', 17) + '<input id="rg-e" type="email" placeholder="you@example.com"></div><div class="fmsg" id="rg-e-e"></div></div>'
    + '<div class="field"><label>كلمة المرور</label><div class="inp">' + icon('lock', 17) + '<input id="rg-pw" type="password" placeholder="٨ أحرف على الأقل"></div><div class="fmsg" id="rg-pw-e"></div></div>'
    + '<div class="field"><label>تأكيد كلمة المرور</label><div class="inp">' + icon('lock', 17) + '<input id="rg-pw2" type="password" placeholder="أعد كتابة كلمة المرور"></div><div class="fmsg" id="rg-pw2-e"></div></div>'
    + '<button class="btn primary big wfull" id="rg-btn" onclick="doRegister()">' + icon('bolt', 18) + ' إنشاء حساب فيكسورا</button>'
    + '<div class="auth-alt">الأعضاء الجدد يحصلون على</div>'
    + '<div class="tourn" style="text-align:center">' + coinSVG(30) + '<b style="font-size:19px;color:var(--gold)"><span class="num">+1,000</span> عملة فيكسورا</b><div style="font-size:12px;color:var(--muted);margin-top:4px">مكافأة ترحيب تُضاف فورًا إلى محفظتك</div></div>';
}
function setAuthTab(t){ S.authTab = t; render(); }
function fieldErr(id, msg){ const e = $('#' + id + '-e'); if (e){ e.textContent = msg; e.classList.add('show'); e.parentElement.classList.add('err'); } }
function clearErrs(){ document.querySelectorAll('.fmsg.show,.inp.err').forEach(el => el.classList.remove('show', 'err')); }
function btnBusy(id, label){ const b = $('#' + id); if (b){ b.innerHTML = '<span class="spinner"></span> ' + label; b.disabled = true; } }

async function doLogin(){
  clearErrs();
  const idv = ($('#lg-id').value || '').trim(), pw = $('#lg-pw').value || '';
  if (!idv) return fieldErr('lg-id', 'أدخل معرفك');
  if (!pw) return fieldErr('lg-pw', 'أدخل كلمة المرور');
  btnBusy('lg-btn', 'جارٍ الدخول…');
  try {
    const j = await api('POST', '/auth/login', { id: idv, password: pw });
    onAuthed(j);
  } catch(e){ $('#' + 'lg-btn').disabled = false; $('#lg-btn').innerHTML = icon('arrow', 18) + ' دخول إلى فيكسورا'; fieldErr('lg-pw', e.message); }
}
async function doRegister(){
  clearErrs();
  const un = ($('#rg-u').value || '').trim(), em = ($('#rg-e').value || '').trim();
  const p1 = $('#rg-pw').value || '', p2 = $('#rg-pw2').value || '';
  let bad = false;
  if (un.length < 3) { fieldErr('rg-u', '٣–٢٠ حرفًا'); bad = true; }
  if (!/^\S+@\S+\.\S+$/.test(em)) { fieldErr('rg-e', 'بريد غير صالح'); bad = true; }
  if (p1.length < 8) { fieldErr('rg-pw', '٨ أحرف على الأقل'); bad = true; }
  if (p1 !== p2) { fieldErr('rg-pw2', 'كلمتا المرور غير متطابقتين'); bad = true; }
  if (bad) return;
  btnBusy('rg-btn', 'جارٍ الإنشاء…');
  try {
    const j = await api('POST', '/auth/register', { username: un, email: em, password: p1 });
    onAuthed(j);
  } catch(e){ $('#rg-btn').disabled = false; $('#rg-btn').innerHTML = icon('bolt', 18) + ' إنشاء حساب فيكسورا'; fieldErr(e.code === 'BAD_EMAIL' ? 'rg-e' : e.code === 'WEAK_PASSWORD' ? 'rg-pw' : 'rg-u', e.message); }
}
async function quickAccount(){
  const n = 'Player_' + Math.floor(10000 + Math.random() * 89999);
  try {
    const j = await api('POST', '/auth/register', { username: n, email: n.toLowerCase() + '@quick.vexora.gg', password: 'vexora-' + Math.floor(1000 + Math.random() * 8999) });
    onAuthed(j);
  } catch(e){ toast('تعذر إنشاء حساب', e.message, 'err'); }
}
function onAuthed(j){
  S.token = j.token;
  try { localStorage.setItem('vexora_token', j.token); } catch(e){}
  rtConnect();
  if (typeof loadStore === 'function') loadStore();   /* catalog needed for stickers/equips */
  refreshMe().then(() => {
    navigate('lobby');
    if (S.me.activeRoom && typeof openRoom === 'function'){
      toast('لديك مباراة جارية', 'جارٍ إعادتك إلى غرفتك…', 'info');
      openRoom(S.me.activeRoom.id);
    } else {
      toast('أهلاً بك في فيكسورا', j.user.username + ' — اللوبي جاهز');
    }
  });
}
function doLogoutLocal(){ S.me = null; S.token = null; S.roomView = null; try { localStorage.removeItem('vexora_token'); } catch(e){} if (S.rt){ try{ S.rt.close(); }catch(e){} S.rt = null; } }
async function logout(){
  try { await api('POST', '/auth/logout'); } catch(e){}
  doLogoutLocal();
  toast('تم تسجيل الخروج', 'نراك في الحلبة قريبًا', 'info');
  navigate('auth');
}

/* ---------- init ---------- */
async function init(){
  $('#root').innerHTML = viewBoot();
  try {
    S.config = await (await fetch('/api/config')).json();
  } catch(e){
    $('#root').innerHTML = viewConnFail(); return;
  }
  const msg = $('#boot-msg');
  if (msg) msg.textContent = 'متصل ✓ جارٍ تحضير الحلبة…';
  if (S.token){
    try {
      S.me = await api('GET', '/me');
      rtConnect();
      navigate(routeFromHash() || 'lobby');
      if (S.me.activeRoom && typeof openRoom === 'function'){
        toast('لديك مباراة جارية', 'جارٍ إعادتك إلى غرفتك…', 'info');
        openRoom(S.me.activeRoom.id);
      }
      return;
    } catch(e){ S.token = null; }
  }
  navigate('auth');
}
init();
