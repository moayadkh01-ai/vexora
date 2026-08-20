#!/usr/bin/env python3
# v2026.08.20.6 — pool black-canvas fix, chess drag+click, neon bottom nav, «الغرف» tab

BUILD = 'v2026.08.20.6'

# ================= 1) room.js: pool fixes + chess drag =================
r = open('public/room.js', encoding='utf-8').read()

# 1a) poolInit: robust sizing (fix black canvas when clientWidth=0 or full render() path)
old_fit = """  function fit(){
    const w = wrap.clientWidth;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr);
    cv.height = Math.round(w * 0.52 * dpr);
    cv.style.height = Math.round(w * 0.52) + 'px';
  }"""
new_fit = """  function fit(){
    let w = wrap.clientWidth || cv.clientWidth || 0;
    if (w < 60) w = Math.min(360, (document.getElementById('root') || {}).clientWidth || 320);   /* fallback: never 0 → fixes black canvas */
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.max(120, Math.round(w * dpr));
    cv.height = Math.max(70, Math.round(w * 0.52 * dpr));
    cv.style.width = '100%';
    cv.style.height = Math.round(w * 0.52) + 'px';
    cv.style.maxWidth = '640px';
    cv.style.margin = '0 auto';
    cv.style.display = 'block';
    cv.style.background = '#14452f';
  }"""
assert old_fit in r, 'fit anchor'
r = r.replace(old_fit, new_fit)

# 1b) draw() must clear with felt (in case of zero-size draws) — force table proportions
old_draw_head = """  function draw(){
    const ctx = cv.getContext('2d');
    const s = cv.width / P.W;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cv.width, cv.height);"""
new_draw_head = """  function draw(){
    if (cv.width < 10 || cv.height < 10){ fit(); }
    const ctx = cv.getContext('2d');
    const s = cv.width / P.W;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#0b3d2b';
    ctx.fillRect(0, 0, cv.width, cv.height);"""
assert old_draw_head in r, 'draw anchor'
r = r.replace(old_draw_head, new_draw_head)

# 1c) re-init pool after EVERY render path (full render() also rebuilds DOM — that caused the black canvas)
old_rr = """function renderRoom(){
  if (S.route !== 'room' || !S.roomView) return;
  chSel = null; bgSel = null;
  const root = $('#root');
  if (root){ root.innerHTML = headerHTML() + roomHTML() + footerHTML() + drawerHTML() + bottomNavHTML(); }
  if (S.roomView.game === 'pool8') poolInit();
}"""
new_rr = """function renderRoom(){
  if (S.route !== 'room' || !S.roomView) return;
  chSel = null; bgSel = null;
  const root = $('#root');
  if (root){ root.innerHTML = headerHTML() + roomHTML() + footerHTML() + drawerHTML() + bottomNavHTML(); }
  if (S.roomView.game === 'pool8') poolInit();
}
/* full render() rebuilds the DOM too — any path landing on the room view must
   re-attach the pool canvas renderer, otherwise the canvas stays black */
const _origRenderRoomOnly = null;
const _origCoreRender = typeof render !== 'undefined' ? render : null;"""
assert old_rr in r, 'renderRoom anchor'
r = r.replace(old_rr, new_rr)

# after-load hook: re-init pool if render() (not renderRoom) rebuilt the page
r += """

/* re-arm pool canvas after full page renders (mark-read, nav, etc.) */
(function(){
  const mo = new MutationObserver(() => {
    if (S.route === 'room' && S.roomView && S.roomView.game === 'pool8' && document.getElementById('pool-canvas') && !document.getElementById('pool-canvas').__armed){
      document.getElementById('pool-canvas').__armed = true;
      poolInit();
    }
  });
  if (document.getElementById('root')) mo.observe(document.getElementById('root'), { childList: true, subtree: true });
})();
"""

# 1d) chess: add drag-to-move on top of click-to-move
old_chtap = "async function chTap(i){"
new_chtap = """function chArmDrag(){
  /* drag pieces (touch/mouse) — pointerdown on own piece, pointerup on target */
  const board = document.querySelector('.ch-board');
  if (!board || board.__dragArmed) return;
  board.__dragArmed = true;
  board.addEventListener('pointerdown', e => {
    const sq = e.target.closest('.ch-sq');
    if (!sq) return;
    const r = S.roomView;
    if (!r || r.over) return;
    const my = chMyColor(r);
    const idxs = [].indexOf.call(board.children, sq);
    if (idxs < 0) return;
    const i = (my === 'b') ? 63 - idxs : idxs;
    const p = r.board ? r.board[i] : '.';
    const own = p !== '.' && ((p === p.toUpperCase()) === (my === 'w'));
    if (own && chSel !== i){ chTap(i); }
  });
}

async function chTap(i){"""
assert old_chtap in r, 'chTap anchor'
r = r.replace(old_chtap, new_chtap, 1)

# call chArmDrag at the end of chBoardHTML
old_ch_end = """    + '<div class="ch-board" dir="ltr">' + cells + '</div>'
    + (r.over ? endButtonsHTML(r) : '');"""
new_ch_end = """    + '<div class="ch-board" dir="ltr">' + cells + '</div>'
    + (r.over ? endButtonsHTML(r) : '')
    + '<script>chArmDrag&&chArmDrag()<' + '/script>';"""
assert old_ch_end in r
r = r.replace(old_ch_end, new_ch_end)

open('public/room.js','w',encoding='utf-8').write(r)
print('room.js ok')

# ================= 2) core.js: bottom nav «الغرف» + neon orbs =================
c = open('public/core.js', encoding='utf-8').read()

old_bnav = """function bottomNavHTML(){
  const u = S.me.user;
  const it = (r, ic, lb) => '<a href="#/' + r + '" class="' + (S.route === r ? 'active' : '') + '" onclick="navigate(\\'' + r + '\\')">' + icon(ic, 19) + lb + '</a>';
  return '<nav class="bottom-nav">' + it('lobby', 'home', 'اللوبي') + it('chat', 'send', 'السواليف') + it('store', 'store', 'المتجر') + it('wallet', 'wallet', 'المحفظة') + it('friends', 'users', 'الأصدقاء') + (u.role === 'admin' ? it('admin', 'shield', 'الإدارة') : it('profile', 'user', 'ملفي')) + '</nav>';
}"""
new_bnav = """function bottomNavHTML(){
  const u = S.me.user;
  const it = (r, ic, lb) => '<a href="#/' + r + '" class="' + (S.route === r ? 'active' : '') + '" onclick="navigate(\\'' + r + '\\')">'
    + '<span class="nav-orb"><span class="nav-orb-in">' + icon(ic, 19) + '</span></span><span class="nav-lb">' + lb + '</span></a>';
  return '<nav class="bottom-nav">' + it('lobby', 'home', 'اللوبي') + it('chat', 'send', 'الغرف') + it('store', 'store', 'المتجر') + it('wallet', 'wallet', 'المحفظة') + it('friends', 'users', 'الأصدقاء') + (u.role === 'admin' ? it('admin', 'shield', 'الإدارة') : it('profile', 'user', 'ملفي')) + '</nav>';
}"""
assert old_bnav in c, 'bottom nav anchor'
c = c.replace(old_bnav, new_bnav)

# drawer + header: rename السواليف → الغرف
c = c.replace("it('chat', 'send', 'غرف السواليف')", "it('chat', 'send', 'الغرف')")
c = c.replace("navLink('chat', 'send', 'السواليف')", "navLink('chat', 'send', 'الغرف')")
c = c.replace("chat: 'غرف السواليف — نواركيو'", "chat: 'الغرف — نواركيو'")

open('public/core.js','w',encoding='utf-8').write(c)
print('core.js ok')

# ================= 3) views.js: remove chat from lobby + numbered neon rooms =================
v = open('public/views.js', encoding='utf-8').read()

old_lobby_chat = """    + '<div style="margin-top:34px">'
    + '<h3 class="section-title">' + icon('send', 20) + ' غرف السواليف <span class="chip playable">10 غرف · آني</span></h3>'
    + '<div class="section-sub">دردشة عامة مباشرة لكل الأعضاء — ادخل وسولف مع اللاعبين</div>'
    + '<div class="gchat-grid" id="gchat-list">' + gchatCards() + '</div></div>'
"""
new_lobby_chat = """    + '<div style="margin-top:26px;text-align:center" class="card">'
    + '<span style="font-size:30px">🛋️</span><b style="display:block;margin:6px 0 4px">غرف الدردشة انتقلت لتبويب «الغرف»</b>'
    + '<div class="sub">10 غرف حية بالنقر على تبويب الغرف بالأسفل</div>'
    + '<button class="btn primary small" style="margin-top:10px" onclick="navigate(\\'chat\\')">' + icon('send', 14) + ' افتح الغرف الآن</button></div>'
"""
assert old_lobby_chat in v, 'lobby chat anchor'
v = v.replace(old_lobby_chat, new_lobby_chat)

# rooms list card → neon animated border + numbered names display
old_cards = """function gchatCards(){
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
}"""
new_cards = """function roomDisplayName(rm){
  return 'غرفة ' + rm.id;
}
function gchatCards(){
  const rooms = Array.isArray(S.chatRooms) ? S.chatRooms : [];
  if (!rooms.length) return '<div class="empty">جارٍ تحميل الغرف…</div>';
  return rooms.map(rm => {
    const unread = S.chatUnread[rm.id] || 0;
    return '<div class="gchat-card neon-card" onclick="openChatRoom(' + rm.id + ')">'
      + '<span class="gemoji">' + rm.emoji + '</span>'
      + '<div class="gmeta"><b><span class="num">' + roomDisplayName(rm) + '</span>' + (unread ? ' <span class="unread-badge num">' + unread + '</span>' : '') + '</b>'
      + '<span class="glast">' + (rm.last ? esc(rm.last.name) + ': ' + esc(rm.last.text).slice(0, 44) : 'ابدأ أول دردشة ✓') + '</span>'
      + '<span class="gcount num">' + fmt(rm.msgs) + ' رسالة</span></div>'
      + '<span class="ggo">' + icon('arrow', 16) + '</span></div>';
  }).join('');
}"""
assert old_cards in v, 'gchat cards anchor'
v = v.replace(old_cards, new_cards)

# chat tab title text
v = v.replace("'<h2 class=\"title\">غرف السواليف</h2>'", "'<h2 class=\"title\">الغرف</h2>'")
v = v.replace("'10 غرف دردشة عامة — تواصل آني مع كل لاعبي نواركيو'", "'10 غرف دردشة حية — اختر غرفتك وابدأ السوالف فورًا'")
open('public/views.js','w',encoding='utf-8').write(v)
print('views.js ok')

# ================= 4) seed.js: numbered room names =================
sd = open('server/seed.js', encoding='utf-8').read()
renames = [
  ("'ديوانية نواركيو', '🛋️', 1", "'غرفة 1 — الديوانية', '🛋️', 1"),
  ("'السوالف العامة', '💬', 2", "'غرفة 2 — السوالف', '💬', 2"),
  ("'ساحة التحدي', '⚔️', 3", "'غرفة 3 — التحدي', '⚔️', 3"),
  ("'استراحة الألعاب', '☕', 4", "'غرفة 4 — الاستراحة', '☕', 4"),
  ("'سالفة البلياردو والطاولة', '🎱', 5", "'غرفة 5 — البلياردو والطاولة', '🎱', 5"),
  ("'سالفة الشطرنج والذكاء', '♞', 6", "'غرفة 6 — الشطرنج', '♞', 6"),
  ("'البطولات والجوائز', '🏆', 7", "'غرفة 7 — البطولات', '🏆', 7"),
  ("'الترحيب بالأعضاء الجدد', '👋', 8", "'غرفة 8 — الترحيب', '👋', 8"),
  ("'الاقتراحات والدعم', '🛠️', 9", "'غرفة 9 — الدعم', '🛠️', 9"),
  ("'دردشة حرة', '🌍', 10", "'غرفة 10 — حرة', '🌍', 10"),
]
for a, b in renames:
    if a in sd: sd = sd.replace(a, b)
open('server/seed.js','w',encoding='utf-8').write(sd)
print('seed ok (numbered)')

# ================= 5) gchat broadcast → persisted events (long-poll users get it too) =================
a = open('server/api.js', encoding='utf-8').read()
old_bc = "  rt.onlineUserIds().forEach(uid => rt.deliverOnly(uid, { seq: 0, type: 'gchat', data: { msg }, at: now() }));"
new_bc = "  rt.onlineUserIds().forEach(uid => rt.emit(uid, 'gchat', { msg }));   /* persisted → reaches WS + long-poll users */"
assert old_bc in a, 'broadcast anchor'
a = a.replace(old_bc, new_bc)
open('server/api.js','w',encoding='utf-8').write(a)
print('api ok (gchat via emit)')

# ================= 6) CSS: neon orbs bottom nav + neon room cards =================
css = open('public/style.css', encoding='utf-8').read()
css += """

/* ============================================================
   v2026.08.20.6 — neon circular bottom nav + neon room cards
   ============================================================ */
.bottom-nav{gap:2px;padding:8px 4px calc(8px + env(safe-area-inset-bottom))}
.bottom-nav a{gap:4px}
.nav-lb{font-size:9px;font-weight:800;letter-spacing:.02em}
.nav-orb{position:relative;width:42px;height:42px;border-radius:50%;display:flex;align-items:center;justify-content:center;
  background:rgba(10,13,28,.85);transition:.25s}
.nav-orb::before{content:"";position:absolute;inset:-2.5px;border-radius:50%;z-index:-1;
  background:conic-gradient(#8b5cf6,#22d3ee,#6366f1,#8b5cf6);opacity:.35;transition:.3s;animation:orbSpin 6s linear infinite}
.nav-orb::after{content:"";position:absolute;inset:1.5px;border-radius:50%;z-index:-1;background:#0a0d1c;transition:.3s}
@keyframes orbSpin{to{transform:rotate(360deg)}}
.bottom-nav a.active .nav-orb{background:rgba(16,19,38,.95);box-shadow:0 0 18px rgba(34,211,238,.45),0 0 34px rgba(139,92,246,.25);transform:translateY(-3px) scale(1.06)}
.bottom-nav a.active .nav-orb::before{opacity:1;inset:-3.5px;animation-duration:2.2s}
.bottom-nav a.active .nav-orb::after{background:radial-gradient(circle at 35% 30%,#1a2142,#0a0d1c)}
.bottom-nav a.active .nav-orb-in{color:var(--cyan);filter:drop-shadow(0 0 6px rgba(34,211,238,.8))}
.bottom-nav a.active .nav-lb{color:var(--cyan)}
.nav-orb:active{transform:scale(.92)}

/* neon animated-border room cards */
.neon-card{position:relative;overflow:hidden;border:1px solid transparent;background-clip:padding-box}
.neon-card::before{content:"";position:absolute;inset:-120%;z-index:-1;
  background:conic-gradient(#8b5cf6,#22d3ee,#f59e0b,#22d3ee,#8b5cf6);animation:neonFlow 5s linear infinite}
.neon-card::after{content:"";position:absolute;inset:1.5px;z-index:-1;border-radius:15px;
  background:linear-gradient(160deg,rgba(16,19,38,.97),rgba(10,13,28,.97));backdrop-filter:blur(6px)}
@keyframes neonFlow{to{transform:rotate(360deg)}}
.neon-card:hover{box-shadow:0 0 22px rgba(139,92,246,.35),0 0 40px rgba(34,211,238,.18);transform:translateY(-3px)}

/* portrait: rooms list single column, orbs slightly smaller */
@media (orientation: portrait){
  .gchat-grid{grid-template-columns:minmax(0,1fr)}
  .nav-orb{width:40px;height:40px}
}
@media (orientation: portrait) and (max-width:380px){
  .nav-orb{width:36px;height:36px}
  .nav-lb{font-size:8px}
}
"""
open('public/style.css','w',encoding='utf-8').write(css)
print('css ok')

# ================= 7) build stamp bump =================
h = open('public/index.html', encoding='utf-8').read()
import re
h = re.sub(r'v2026\.08\.20\.\d+', BUILD, h)
open('public/index.html','w',encoding='utf-8').write(h)
print('index stamped →', BUILD)
print('ALL DONE')
