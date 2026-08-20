#!/usr/bin/env python3
# client: null-crash guard + chat rooms UI + portrait extra

# ================= room.js: sanitize room objects (fix .map on null) =================
r = open('public/room.js', encoding='utf-8').read()

sanitize = """
/* guard: room objects from partial events (room:update close/leave) may lack
   board/balls/moves — never let .map() run on null (hotfix for
   "Cannot read properties of null (reading 'map')") */
function sanitizeRoom(obj, prev){
  if (!obj || typeof obj !== 'object') return obj;
  const base = prev && typeof prev === 'object' ? prev : {};
  obj.board = Array.isArray(obj.board) ? obj.board : (Array.isArray(base.board) ? base.board : []);
  obj.balls = Array.isArray(obj.balls) ? obj.balls : (Array.isArray(base.balls) ? base.balls : []);
  obj.moves = Array.isArray(obj.moves) ? obj.moves : (Array.isArray(base.moves) ? base.moves : []);
  obj.winCells = Array.isArray(obj.winCells) ? obj.winCells : (Array.isArray(base.winCells) ? base.winCells : []);
  obj.pts = Array.isArray(obj.pts) ? obj.pts : (Array.isArray(base.pts) ? base.pts : []);
  obj.dice = Array.isArray(obj.dice) ? obj.dice : (Array.isArray(base.dice) ? base.dice : []);
  if (!obj.host && base.host) obj.host = base.host;
  if (!obj.guest && base.guest) obj.guest = base.guest;
  if (typeof obj.turn === 'undefined') obj.turn = base.turn !== undefined ? base.turn : 1;
  return obj;
}

/* ---------- open room ---------- */"""
anchor = "/* ---------- open room ---------- */"
assert anchor in r, 'open room anchor'
r = r.replace(anchor, sanitize, 1)

# openRoom: sanitize after fetch
old_open = """  try {
    const j = await api('GET', '/rooms/' + roomId);
    S.roomView = j.room;
    S.roomChat = j.chat || [];
    navigate('room');
  } catch(e){ toast('تعذر فتح الغرفة', e.message, 'err'); }"""
new_open = """  try {
    const j = await api('GET', '/rooms/' + roomId);
    S.roomView = sanitizeRoom(j.room, null);
    S.roomChat = Array.isArray(j.chat) ? j.chat : [];
    navigate('room');
  } catch(e){ toast('تعذر فتح الغرفة', e.message, 'err'); }"""
assert old_open in r
r = r.replace(old_open, new_open)

# board guards in renderers
r = r.replace("function c4BoardHTML(r){\n  return '<div class=\"c4-board\">' + r.board.map(", "function c4BoardHTML(r){\n  const board = Array.isArray(r.board) ? r.board : [];\n  return '<div class=\"c4-board\">' + board.map(")
r = r.replace("const legal = myTurn ? (() => { const out = [];", "const legal = myTurn ? (() => { const out = [];")
r = r.replace("const cells = r.board.map((row, ri) => row.map((cell, ci) => {", "const cells = (Array.isArray(r.board) ? r.board : []).map((row, ri) => row.map((cell, ci) => {")
r = r.replace("const rvLegal = legalSet", "const rvLegal = legalSet")

# moves guard everywhere .moves is used
r = r.replace("const targets = chSel !== null ? moves.filter(m => m.from === chSel) : [];", "const targets = chSel !== null ? (moves || []).filter(m => m.from === chSel) : [];")
r = r.replace("const targets = bgSel !== null ? moves.filter(m => m.from === bgSel) : [];", "const targets = bgSel !== null ? (moves || []).filter(m => m.from === bgSel) : [];")

open('public/room.js','w',encoding='utf-8').write(r)
print('room.js sanitized')

# ================= core.js: room:update merge + gchat event + chat route =================
c = open('public/core.js', encoding='utf-8').read()

old_ru = """    case 'room:update':
      if (S.roomView && S.roomView.id === d.room.id){ S.roomView = d.room; renderRoom(); }
      if (S.route === 'lobby') refreshLobbyBits();
      break;"""
new_ru = """    case 'room:update':
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
      break;"""
assert old_ru in c, 'room:update anchor'
c = c.replace(old_ru, new_ru)

# state init
old_state = "const S = {\n  token: null, me: null, config: null, presence: { online: 0, counts: {}, openRooms: 0 },"
new_state = "const S = {\n  token: null, me: null, config: null, presence: { online: 0, counts: {}, openRooms: 0 },\n  chatRooms: null, chatOpenId: null, chatMsgs: {}, chatUnread: {},"
assert old_state in c
c = c.replace(old_state, new_state)

# route support: chat + chatRoom
old_routes = "if (['lobby', 'store', 'wallet', 'profile', 'friends', 'admin', 'room'].indexOf(h) >= 0) return h;"
new_routes = "if (['lobby', 'store', 'wallet', 'profile', 'friends', 'admin', 'room', 'chat'].indexOf(h) >= 0) return h;"
assert old_routes in c
c = c.replace(old_routes, new_routes)

# render map: add chat view
old_views = "friends: typeof viewFriends === 'function' ? viewFriends : null, room: typeof viewRoomEntry === 'function' ? viewRoomEntry : null,"
new_views = "friends: typeof viewFriends === 'function' ? viewFriends : null, room: typeof viewRoomEntry === 'function' ? viewRoomEntry : null, chat: typeof viewChat === 'function' ? viewChat : null,"
assert old_views in c
c = c.replace(old_views, new_views)

# titles
c = c.replace("  admin: 'لوحة الإدارة — NoirCue'\n};", "  admin: 'لوحة الإدارة — NoirCue',\n  chat: 'غرف السواليف — نواركيو'\n};")

# header nav + drawer add chat (desktop nav)
old_nav = "navLink('lobby', 'home', 'اللوبي') + navLink('store', 'store', 'المتجر') + navLink('wallet', 'wallet', 'المحفظة') + navLink('friends', 'users', 'الأصدقاء')"
new_nav = "navLink('lobby', 'home', 'اللوبي') + navLink('chat', 'send', 'السواليف') + navLink('store', 'store', 'المتجر') + navLink('wallet', 'wallet', 'المحفظة') + navLink('friends', 'users', 'الأصدقاء')"
assert old_nav in c
c = c.replace(old_nav, new_nav)

old_drawer = "    + it('lobby', 'home', 'اللوبي') + it('store', 'store', 'المتجر') + it('wallet', 'wallet', 'المحفظة') + it('friends', 'users', 'الأصدقاء') + it('profile', 'user', 'ملفي')"
new_drawer = "    + it('lobby', 'home', 'اللوبي') + it('chat', 'send', 'غرف السواليف') + it('store', 'store', 'المتجر') + it('wallet', 'wallet', 'المحفظة') + it('friends', 'users', 'الأصدقاء') + it('profile', 'user', 'ملفي')"
assert old_drawer in c
c = c.replace(old_drawer, new_drawer)

old_bnav = "return '<nav class=\"bottom-nav\">' + it('lobby', 'home', 'اللوبي') + it('store', 'store', 'المتجر') + it('wallet', 'wallet', 'المحفظة') + it('friends', 'users', 'الأصدقاء') + (u.role === 'admin' ? it('admin', 'shield', 'الإدارة') : it('profile', 'user', 'ملفي')) + '</nav>';"
new_bnav = "return '<nav class=\"bottom-nav\">' + it('lobby', 'home', 'اللوبي') + it('chat', 'send', 'السواليف') + it('store', 'store', 'المتجر') + it('wallet', 'wallet', 'المحفظة') + it('friends', 'users', 'الأصدقاء') + (u.role === 'admin' ? it('admin', 'shield', 'الإدارة') : it('profile', 'user', 'ملفي')) + '</nav>';"
assert old_bnav in c
c = c.replace(old_bnav, new_bnav)

# notifications guard in header
c = c.replace("const notifs = S.me.notifications || [];", "const notifs = (S.me && S.me.notifications) || [];")

open('public/core.js','w',encoding='utf-8').write(c)
print('core.js ok')

# ================= views.js: chat rooms lobby section + chat view =================
v = open('public/views.js', encoding='utf-8').read()

# lobby section (before the closing of lobby markup): insert after open-rooms block
old_lobby_tail = """    + '<div style="margin-top:34px"><h3 class="section-title">' + icon('door', 20) + ' غرف مفتوحة</h3>'
    + '<div class="section-sub">انضم لغرفة عامة أو أنشئ غرفتك وشارك الرمز</div>'
    + '<div id="rooms-list">' + roomCards() + '</div></div>'
    + '</div>'"""
new_lobby_tail = """    + '<div style="margin-top:34px"><h3 class="section-title">' + icon('door', 20) + ' غرف مفتوحة</h3>'
    + '<div class="section-sub">انضم لغرفة عامة أو أنشئ غرفتك وشارك الرمز</div>'
    + '<div id="rooms-list">' + roomCards() + '</div></div>'
    + '<div style="margin-top:34px">'
    + '<h3 class="section-title">' + icon('send', 20) + ' غرف السواليف <span class="chip playable">10 غرف · آني</span></h3>'
    + '<div class="section-sub">دردشة عامة مباشرة لكل الأعضاء — ادخل وسولف مع اللاعبين</div>'
    + '<div class="gchat-grid" id="gchat-list">' + gchatCards() + '</div></div>'
    + '</div>'"""
assert old_lobby_tail in v
v = v.replace(old_lobby_tail, new_lobby_tail)

# roomCards / lbRows guards
v = v.replace("function roomCards(){\n  if (!S.lobbyRooms.length)", "function roomCards(){\n  const rooms = Array.isArray(S.lobbyRooms) ? S.lobbyRooms : [];\n  if (!rooms.length)")
v = v.replace("return '<div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:13px\">'\n    + S.lobbyRooms.map(r =>", "return '<div style=\"display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:13px\">'\n    + rooms.map(r =>")
v = v.replace("function lbRows(){\n  const top = S.leaderboard || [];", "function lbRows(){\n  const top = Array.isArray(S.leaderboard) ? S.leaderboard : [];")

# append chat views + logic
v += """

/* ============================================================
   غرف السواليف — public chat rooms (realtime)
   ============================================================ */
async function loadChatRooms(){
  try {
    const j = await api('GET', '/chat/rooms');
    S.chatRooms = j.rooms || [];
    if (S.route === 'lobby'){
      const el = document.getElementById('gchat-list');
      if (el) el.innerHTML = gchatCards();
    }
  } catch(e){ /* offline tolerant */ }
}
function gchatCards(){
  const rooms = Array.isArray(S.chatRooms) ? S.chatRooms : [];
  if (!rooms.length) return '<div class="empty">جارٍ تحميل الغرف…</div>';
  return rooms.map(rm => {
    const unread = S.chatUnread[rm.id] || 0;
    return '<div class="gchat-card" onclick="openChatRoom(' + rm.id + ')">'
      + '<span class="gemoji">' + rm.emoji + '</span>'
      + '<div class="gmeta"><b>' + esc(rm.name) + (unread ? ' <span class="unread-badge num">' + unread + '</span>' : '') + '</b>'
      + '<span class="glast">' + (rm.last ? esc(rm.last.name) + ': ' + esc(rm.last.text).slice(0, 44) : 'ابدأ السالفة الأولى ✓') + '</span>'
      + '<span class="gcount num">' + fmt(rm.msgs) + ' رسالة</span></div>'
      + '<span class="ggo">' + icon('arrow', 16) + '</span></div>';
  }).join('');
}
function viewChat(){
  if (!S.chatOpenId){
    return shell('<h2 class="title">غرف السواليف</h2>'
      + '<div class="section-sub" style="margin-bottom:14px">10 غرف دردشة عامة — تواصل آني مع كل لاعبي نواركيو</div>'
      + '<div class="gchat-grid" style="grid-template-columns:1fr">' + gchatCards() + '</div>', 'السواليف');
  }
  const rm = (S.chatRooms || []).find(x => x.id === S.chatOpenId) || { name: 'غرفة', emoji: '💬' };
  const msgs = S.chatMsgs[S.chatOpenId] || [];
  const msgsHTML = msgs.length ? msgs.map(m =>
    '<div class="gmsg' + (m.name === S.me.user.username ? ' me' : '') + '"><b>' + esc(m.name) + '</b>' + esc(m.text) + '<i>' + ago(m.created_at) + '</i></div>'
  ).join('') : '<div class="empty">لا رسائل بعد — اكتب أول سالفة 👇</div>';
  return shell(
    '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">'
    + '<button class="btn ghost small" onclick="closeChatRoom()">' + icon('arrow', 14) + ' الغرف</button>'
    + '<span class="gemoji" style="width:34px;height:34px;font-size:18px">' + rm.emoji + '</span>'
    + '<div style="flex:1"><b>' + esc(rm.name) + '</b><div class="sub" style="font-size:11px">دردشة آنية · ' + fmt(rm.msgs || 0) + ' رسالة</div></div>'
    + '<span class="onl-dot"></span></div>'
    + '<div class="card gchat-window"><div class="gmsgs" id="gmsgs">' + msgsHTML + '</div>'
    + '<div class="gr-input"><input id="gchat-inp" maxlength="400" placeholder="اكتب سالفتك…" onkeydown="if(event.key===\'Enter\')sendGchat()">'
    + '<button class="btn primary small" onclick="sendGchat()">' + icon('send', 15) + '</button></div></div>',
    'السواليف');
}
async function openChatRoom(id){
  S.chatOpenId = id;
  S.chatUnread[id] = 0;
  if (!S.chatMsgs[id]){
    try {
      const j = await api('GET', '/chat/rooms/' + id + '/messages');
      S.chatMsgs[id] = j.messages || [];
    } catch(e){ S.chatMsgs[id] = []; }
  }
  navigate('chat');
}
function closeChatRoom(){ S.chatOpenId = null; navigate('chat'); }
function appendGchatMsg(m){
  const box = document.getElementById('gmsgs');
  if (box){
    box.insertAdjacentHTML('beforeend', '<div class="gmsg' + (m.name === S.me.user.username ? ' me' : '') + '"><b>' + esc(m.name) + '</b>' + esc(m.text) + '<i>الآن</i></div>');
    box.scrollTop = box.scrollHeight;
  }
}
async function sendGchat(){
  const inp = document.getElementById('gchat-inp');
  const text = (inp ? inp.value : '').trim();
  if (!text || !S.chatOpenId) return;
  try {
    await api('POST', '/chat/rooms/' + S.chatOpenId + '/messages', { text });
    inp.value = '';
  } catch(e){ toast('لم تُرسل', e.message, 'err'); }
}
"""
open('public/views.js','w',encoding='utf-8').write(v)
print('views.js ok')

# navigate hook: load rooms when entering lobby/chat
v2 = open('public/views.js', encoding='utf-8').read()
old_hook = """navigate = function(r){
  _origNavigate(r);
  if (r === 'store' && !S.storeItems) loadStore();"""
new_hook = """navigate = function(r){
  _origNavigate(r);
  if (r === 'lobby' && !S.chatRooms) loadChatRooms();
  if (r === 'chat' && !S.chatRooms) loadChatRooms();
  if (r === 'store' && !S.storeItems) loadStore();"""
assert old_hook in v2
v2 = v2.replace(old_hook, new_hook)
open('public/views.js','w',encoding='utf-8').write(v2)
print('views hook ok')

# ================= CSS: chat styles + portrait extras =================
css = open('public/style.css', encoding='utf-8').read()
css += """

/* ============================================================
   غرف السواليف — public chat rooms
   ============================================================ */
.gchat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px;margin-top:14px}
.gchat-card{display:flex;align-items:center;gap:12px;padding:14px;border-radius:16px;border:1px solid var(--line);background:var(--surface);cursor:pointer;transition:.18s;min-width:0}
.gchat-card:hover{border-color:rgba(34,211,238,.5);transform:translateY(-2px)}
.gemoji{width:44px;height:44px;border-radius:13px;background:var(--grad-soft);display:flex;align-items:center;justify-content:center;font-size:21px;flex-shrink:0}
.gmeta{flex:1;min-width:0;display:flex;flex-direction:column;gap:3px}
.gmeta b{font-size:14px}
.glast{font-size:12px;color:var(--muted);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gcount{font-size:10.5px;color:var(--muted)}
.ggo{color:var(--cyan)}
.unread-badge{background:var(--cyan);color:#04222a;border-radius:99px;font-size:10px;padding:1px 7px;font-weight:900}
.gchat-window{display:flex;flex-direction:column;height:min(60vh,480px);padding:14px}
.gmsgs{flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:9px;padding:4px 2px}
.gmsg{max-width:86%;padding:9px 13px;border-radius:14px;background:var(--glass);border:1px solid var(--line);font-size:13.5px;line-height:1.65}
.gmsg.me{align-self:flex-start;background:linear-gradient(135deg,rgba(139,92,246,.22),rgba(34,211,238,.12));border-color:rgba(139,92,246,.4)}
.gmsg b{font-size:11.5px;color:var(--cyan);display:block}
.gmsg i{display:block;font-style:normal;font-size:10px;color:var(--muted);margin-top:3px;text-align:left}

/* portrait chat fitting */
@media (orientation: portrait){
  .gchat-grid{grid-template-columns:minmax(0,1fr)}
  .gchat-window{height:min(62vh,440px)}
}

/* extra portrait hardening: buttons/hero/stats never overlap */
@media (orientation: portrait){
  .hero-cta{flex-direction:column}
  .hero-cta .btn{width:100%}
  .hero-stats{gap:16px}
  .hstat b{font-size:18px}
  .packs-grid,.vip-grid,.cos-grid,.inv-grid{grid-template-columns:repeat(auto-fill,minmax(140px,1fr))}
  .games-grid{grid-template-columns:repeat(auto-fill,minmax(150px,1fr))}
  .auth{grid-template-columns:1fr}
  .auth-brand{display:none}
  .admin-tabs{width:100%}
  .admin-top{flex-direction:column;align-items:stretch}
  .tbl-wrap{max-width:100%}
  table.vt{min-width:520px}
  .bottom-nav{grid-template-columns:repeat(6,1fr)}
}
@media (orientation: portrait) and (max-width:380px){
  .bottom-nav{grid-template-columns:repeat(3,1fr);padding-bottom:calc(10px + env(safe-area-inset-bottom))}
  .gcard .play{font-size:11px;padding:8px 10px}
}
"""
open('public/style.css','w',encoding='utf-8').write(css)
print('css ok')
print('CLIENT DONE')
