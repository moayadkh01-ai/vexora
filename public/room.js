'use strict';
/* ============================================================
   VEXORA — game room (live) + admin dashboard
   Board state arrives from the server; moves are validated
   server-side and pushed back over realtime.
   ============================================================ */

/* ---------- open room ---------- */
async function openRoom(roomId, silent){
  try {
    const j = await api('GET', '/rooms/' + roomId);
    S.roomView = j.room;
    S.roomChat = j.chat || [];
    navigate('room');
  } catch(e){ toast('تعذر فتح الغرفة', e.message, 'err'); }
}
function viewRoomEntry(){
  if (!S.roomView) { setTimeout(() => navigate('lobby'), 10); return '<div class="wrap"><div class="empty">لا توجد غرفة نشطة</div></div>'; }
  return roomHTML();
}

/* ---------- room view ---------- */
function roomHTML(){
  const r = S.roomView;
  const you = r.you;
  const myTurn = !r.over && r.turn === you;
  const equippedStick = (S.me.user.equipped || {}).stick;
  const stickName = id => { const it = (S.storeItems || []).find(x => x.id === id); return it ? it.name_ar : ''; };
  const chat = S.roomChat || [];
  const chatHTML = chat.length ? chat.map(m =>
    '<div class="cmsg' + (m.userId === S.me.user.id ? ' me' : '') + '"><b>' + esc(m.name) + '</b>' + renderChatText(m.text) + '</div>').join('')
    : '<div class="empty" style="padding:20px">لا رسائل — قل مرحبا!</div>';

  const statusHTML = r.over
    ? '<div style="text-align:center;font-size:17px;font-weight:900;color:' + (r.winner === 0 ? 'var(--gold)' : r.winner === you ? 'var(--green)' : 'var(--red)') + '">'
      + (r.winner === 0 ? 'تعادل — استُرجعت رسوم الدخول' : r.winner === you ? icon('trophy', 20) + ' فزت! +' + fmt(r.pot) + ' عملة' : 'خسرت هذه المرة') + '</div>'
      + '<div style="display:flex;gap:10px;margin-top:16px"><button class="btn ghost wfull" onclick="leaveRoomUI(' + r.id + ')">' + icon('door', 16) + ' مغادرة</button>'
      + '<button class="btn primary wfull" onclick="practiceAI(\'' + r.game + '\')">' + icon('bolt', 16) + ' مباراة جديدة</button></div>'
    : '<div class="c4-status"><span class="turn"><span class="c4-dotp ' + (r.turn === 1 ? 'c1' : 'c2') + '"></span>'
      + (r.status === 'open' ? '<b>بانتظار خصم…</b> شارك الرمز' : myTurn ? '<b>دورك</b> — اختر عمودًا' : '<b>دور الخصم…</b>')
      + '</span><span style="color:var(--muted);font-size:12.5px" class="num">دخول ' + fmt(r.entry) + ' · جائزة ' + fmt(r.pot) + '</span></div>';

  const boardHTML = r.status === 'open'
    ? '<div style="text-align:center;padding:44px 10px"><div class="code-badge" style="font-size:26px;padding:14px 26px">' + esc(r.code) + '</div>'
      + '<div style="color:var(--muted);font-size:13px;margin-top:14px">أرسل هذا الرمز لصديقك لينضم عبر «الانضمام برمز»</div>'
      + '<button class="btn ghost" style="margin-top:16px" onclick="leaveRoomUI(' + r.id + ')">' + icon('x', 15) + ' إلغاء الغرفة (استرجاع الرسوم)</button></div>'
    : (r.game === 'reversi' ? rvBoardHTML(r) : c4BoardHTML(r));

  return '<div class="wrap">'
    + '<div style="display:flex;align-items:center;gap:12px;margin-top:22px;flex-wrap:wrap">'
    + '<button class="btn ghost small" onclick="confirmLeaveUI(' + r.id + ')">' + icon('door', 14) + ' خروج</button>'
    + '<span class="chip classic">' + gameName(r.game) + '</span>'
    + (r.vs_ai ? '<span class="chip new">تدريب ضد الحاسوب</span>' : '<span class="chip playable">مباراة مباشرة</span>')
    + '<span style="font-size:12px;color:var(--muted)">رمز الغرفة <span class="code-badge" style="padding:4px 10px;font-size:12px">' + esc(r.code) + '</span></span>'
    + (equippedStick ? '<span class="chip gold">' + icon('gamepad', 13) + ' ' + esc(stickName(equippedStick)) + '</span>' : '')
    + '</div>'
    + '<div class="gr-room">'
    + '<div><div class="card panel">'
    + vsBar(r, you)
    + '<div style="margin-top:16px" id="c4-wrap">' + boardHTML + '</div>'
    + '<div style="margin-top:14px" id="c4-status">' + statusHTML + '</div>'
    + '</div></div>'
    + '<div class="gr-side">'
    + '<div class="card panel gr-chat" style="position:relative">'
    + '<h3 style="margin-bottom:8px">' + icon('send', 15) + ' دردشة الغرفة</h3>'
    + '<div class="msgs" id="chat-msgs">' + chatHTML + '</div>'
    + '<div class="gr-input">'
    + '<button class="icon-btn" style="border:1px solid var(--line)" onclick="toggleEmojiPop(event)" title="إيموجي">' + icon('smile', 20) + '</button>'
    + '<input id="chat-inp" placeholder="اكتب رسالة…" maxlength="240" onkeydown="if(event.key===\'Enter\')sendChatUI()">'
    + '<button class="btn primary small" onclick="sendChatUI()">' + icon('send', 15) + '</button></div>'
    + '<div id="emoji-pop"></div>'
    + '</div>'
    + '<div class="card panel"><h3>' + icon('shield', 15) + ' مباراة عادلة</h3>'
    + '<div style="font-size:12.5px;color:var(--muted);line-height:1.75">اللوحة والحكم على الخادم فقط — لا يمكن التلاعب من أي طرف. مغادرة مباراة جارية تُحتسب استسلامًا.</div></div>'
    + '</div></div>'
    + '<div style="height:30px"></div></div>';
}
function vsBar(r, you){
  const me = { username: S.me.user.username, rating: S.me.user.rating, hue: S.me.user.hue };
  const opp = you === 1 ? r.guest : r.host;
  const myTurnGlow = !r.over && r.turn === you ? ' turn-glow' : '';
  const oppTurnGlow = !r.over && r.status === 'playing' && r.turn !== you ? ' turn-glow' : '';
  return '<div class="vsbar">'
    + '<div class="mm-side' + myTurnGlow + '" style="display:flex;align-items:center;gap:10px;border-radius:12px;padding:8px">' + avatarHTML(me, 44, false)
    + '<div><b>' + esc(me.username) + ' <span style="color:var(--cyan);font-size:11px">(أنت)</span></b><div style="font-size:11.5px;color:var(--muted)" class="num">تصنيف ' + me.rating + '</div></div></div>'
    + '<div class="vs num" style="font-size:19px;font-weight:900;color:var(--cyan)">VS</div>'
    + '<div class="mm-side' + oppTurnGlow + '" style="display:flex;align-items:center;gap:10px;border-radius:12px;padding:8px;justify-content:flex-end">'
    + (opp ? '<div style="text-align:left"><b>' + esc(opp.username) + '</b><div style="font-size:11.5px;color:var(--muted)" class="num">تصنيف ' + opp.rating + '</div></div>' + avatarHTML(opp, 44, false)
      : '<div style="color:var(--muted);font-size:13px">بانتظار خصم…</div>')
    + '</div></div>';
}

/* ---------- moves (per-game) ---------- */
function c4BoardHTML(r){
  return '<div class="c4-board">' + r.board.map((row, ri) => row.map((cell, ci) => {
    const winC = (r.winCells || []).some(w => w[0] === ri && w[1] === ci);
    const last = r.last && r.last[0] === ri && r.last[1] === ci;
    return '<div class="c4-cell' + (cell === 1 ? ' p1' : cell === 2 ? ' p2' : '') + (winC ? ' win' : '') + (last ? ' last' : '') + '" onclick="dropDisc(' + ci + ')"></div>';
  }).join('')).join('') + '</div>';
}
/* reversi: mirror of the server legality rule — hints only; the server still judges */
function rvFlipsClient(b, rr, cc, p){
  if (rr < 0 || rr > 7 || cc < 0 || cc > 7 || b[rr][cc] !== 0) return null;
  const dirs = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
  const all = [];
  for (const d of dirs){
    const line = [];
    let x = rr + d[0], y = cc + d[1];
    while (x >= 0 && x < 8 && y >= 0 && y < 8 && b[x][y] === 3 - p){ line.push(1); x += d[0]; y += d[1]; }
    if (line.length && x >= 0 && x < 8 && y >= 0 && y < 8 && b[x][y] === p) all.push(1);
  }
  return all.length ? all : null;
}
function rvBoardHTML(r){
  const myTurn = !r.over && r.turn === r.you && r.status === 'playing';
  const legal = myTurn ? (() => { const out = [];
    for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) if (r.board[i][j] === 0 && rvFlipsClient(r.board, i, j, r.you)) out.push(i + '-' + j);
    return out; })() : [];
  const legalSet = {};
  legal.forEach(k => legalSet[k] = 1);
  const counts = [0, 0];
  r.board.forEach(row => row.forEach(v => { if (v === 1) counts[0]++; else if (v === 2) counts[1]++; }));
  const cells = r.board.map((row, ri) => row.map((cell, ci) => {
    const hint = legalSet[ri + '-' + ci];
    const last = r.last && r.last[0] === ri && r.last[1] === ci;
    return '<div class="rv-cell' + (cell === 1 ? ' p1' : cell === 2 ? ' p2' : '') + (last ? ' last' : '') + '"'
      + (hint ? ' data-hint="1" onclick="rvMove(' + ri + ',' + ci + ')"' : '') + '></div>';
  }).join('')).join('');
  return '<div class="rv-board">' + cells + '</div>'
    + '<div class="rv-counts"><span class="cnt"><span class="c4-dotp c1"></span><b class="num">' + counts[0] + '</b></span>'
    + '<span class="cnt"><span class="c4-dotp c2"></span><b class="num">' + counts[1] + '</b></span></div>';
}
async function rvMove(rr, cc){ return sendMove({ r: rr, c: cc }); }
async function dropDisc(col){ return sendMove({ col }); }
async function sendMove(body){
  const r = S.roomView;
  if (!r || r.over || r.turn !== r.you || r.status !== 'playing') return;
  try {
    const j = await api('POST', '/rooms/' + r.id + '/move', body);
    if (j.state){ S.roomView = Object.assign({}, S.roomView, j.state); renderRoom(); }
  } catch(e){ toast('حركة مرفوضة', e.message, 'err'); }
}
function renderRoom(){
  if (S.route !== 'room' || !S.roomView) return;
  const root = $('#root');
  if (root){ root.innerHTML = headerHTML() + roomHTML() + footerHTML() + drawerHTML() + bottomNavHTML(); }
}

/* ---------- chat ---------- */
function renderChatText(text){
  return esc(text).replace(/:([a-z0-9_]+):/g, (m, id) => {
    const it = (S.storeItems || []).find(x => x.id === id);
    if (it && it.kind === 'emoji'){
      try {
        const em = JSON.parse(it.meta || '{}').emojis || [];
        if (em.length) return '<span class="sticker">' + em.join('') + '</span>';
      } catch(e){}
    }
    return m;
  });
}
async function sendChatUI(){
  const inp = $('#chat-inp');
  const text = (inp ? inp.value : '').trim();
  if (!text || !S.roomView) return;
  try {
    await api('POST', '/rooms/' + S.roomView.id + '/chat', { text });
    inp.value = '';
  } catch(e){ toast('لم تُرسل الرسالة', e.message, 'err'); }
}
function appendChat(m){
  if (!S.roomChat) S.roomChat = [];
  S.roomChat.push(m);
  if (S.roomChat.length > 80) S.roomChat.shift();
  const box = $('#chat-msgs');
  if (box){ box.insertAdjacentHTML('beforeend', '<div class="cmsg' + (m.userId === S.me.user.id ? ' me' : '') + '"><b>' + esc(m.name) + '</b>' + renderChatText(m.text) + '</div>'); box.scrollTop = box.scrollHeight; }
}
function toggleEmojiPop(e){
  if (e) e.stopPropagation();
  const pop = $('#emoji-pop');
  if (pop.innerHTML){ pop.innerHTML = ''; return; }
  const inv = (S.me.inventory || []).filter(i => i.kind === 'emoji');
  const packs = [{ item_id: 'vex', name_ar: 'وجوه فيكسورا الأساسية' }].concat(inv.map(i => ({ item_id: i.item_id, name_ar: i.name_ar })));
  const store = S.storeItems || [];
  let html = packs.map(p => {
    const it = store.find(x => x.id === p.item_id);
    let em = [];
    try { em = JSON.parse((it && it.meta) || '{}').emojis || ['🎮','🔥','😂']; } catch(err){ em = ['🎮']; }
    return '<div class="pack-lbl">' + esc(p.name_ar) + '</div><div class="eg">'
      + em.map(x => '<button onclick="pickEmoji(\'' + x + '\',\'' + p.item_id + '\')">' + x + '</button>').join('') + '</div>';
  }).join('');
  pop.innerHTML = '<div class="emoji-pop">' + html + '</div>';
}
function pickEmoji(ch, pack){
  const inp = $('#chat-inp');
  if (inp){ inp.value += ' ' + ch; inp.focus(); }
  $('#emoji-pop').innerHTML = '';
}

/* ---------- leave ---------- */
function confirmLeaveUI(id){
  const r = S.roomView;
  if (r && r.status === 'playing' && !r.over && !r.vs_ai){
    openModal('<div style="text-align:center;padding-top:8px"><h3 style="font-size:19px;margin-bottom:8px">مغادرة المباراة؟</h3>'
      + '<div style="color:var(--muted);font-size:13.5px;line-height:1.7">المغادرة الآن تُحتسب <b style="color:var(--red)">استسلامًا</b> وتفوز بالجائزة للخصم.</div>'
      + '<div style="display:flex;gap:10px;margin-top:18px"><button class="btn ghost wfull" onclick="closeModal()">بقاء</button>'
      + '<button class="btn danger wfull" onclick="closeModal();leaveRoomUI(' + id + ')">مغادرة واستسلام</button></div></div>');
  } else leaveRoomUI(id);
}
async function leaveRoomUI(id){
  try {
    const j = await api('POST', '/rooms/' + id + '/leave');
    if (j.conceded) toast('غادرت المباراة', 'احتُسبت خسارة', 'info');
    else if (j.refunded) toast('أُغلقت الغرفة', 'استُرجعت رسوم الدخول', 'info');
  } catch(e){ /* ignore */ }
  S.roomView = null; S.roomChat = [];
  await refreshMe();
  navigate('lobby');
}

/* ============================================================
   ADMIN DASHBOARD (staff-facing — English/LTR island)
   ============================================================ */
let adminTab = 'overview', adminQuery = '', adminData = null, adminUsers = null, adminOrders = null;
function setAdminTab(t){ adminTab = t; render(); }
function viewAdmin(){
  if (S.me.user.role !== 'admin') { setTimeout(() => navigate('lobby'), 10); return '<div class="wrap"><div class="empty">صلاحيات غير كافية</div></div>'; }
  loadAdmin();
  const body = { overview: adminOverview, users: adminUsersView, orders: adminOrdersView }[adminTab]();
  return '<div class="wrap admin-ltr" style="padding-top:24px;padding-bottom:26px">'
    + '<div class="admin-top"><span class="chip classic">' + icon('shield', 13) + ' VEXORA Control Center</span>'
    + '<div class="admin-tabs">'
    + [['overview', 'Overview'], ['users', 'Players'], ['orders', 'Orders']].map(t =>
      '<button class="' + (adminTab === t[0] ? 'on' : '') + '" onclick="setAdminTab(\'' + t[0] + '\')">' + t[1] + '</button>').join('')
    + '</div><div class="hdr-spacer"></div>'
    + '<div style="display:flex;align-items:center;gap:10px;font-size:12.5px;color:var(--muted)"><span class="live-dot"></span>Live SQLite · ' + (S.transport === 'ws' ? 'WebSocket' : 'long-poll')
    + '<a class="btn gold small" href="/api/admin/db-backup?token=' + encodeURIComponent(S.token) + '" download>⬇ Download DB backup</a>'
    + '<a class="btn ghost small" href="/api/admin/db-backup?token=' + encodeURIComponent(S.token) + '" target="_blank" rel="noopener">view</a>'
    + '</div></div>'
    + body + '</div>';
}
async function loadAdmin(){
  try {
    let fetched = false;
    if (adminTab === 'overview' && !adminData){ adminData = await api('GET', '/admin/overview'); fetched = true; }
    if (adminTab === 'users' && !adminUsers){ adminUsers = await api('GET', '/admin/users'); fetched = true; }
    if (adminTab === 'orders' && !adminOrders){ adminOrders = await api('GET', '/admin/orders'); fetched = true; }
    if (fetched && S.route === 'admin' && S.me && S.me.user.role === 'admin') render();
  } catch(e){ console.warn('admin load', e.message); }
}
function adminOverview(){
  if (!adminData) return '<div class="empty">Loading…</div>';
  const d = adminData;
  const maxDau = Math.max.apply(null, [1].concat(d.dau.map(x => x.count)));
  return '<div class="kpis">'
    + kpi('users', 'rgba(34,211,238,.13)', 'var(--cyan)', fmt(d.online), 'Online now')
    + kpi('gamepad', 'rgba(139,92,246,.16)', 'var(--violet)', fmt(d.totalUsers), 'Accounts')
    + kpi('bolt', 'rgba(52,211,153,.13)', 'var(--green)', fmt(d.matches24), 'Matches · 24h')
    + kpi('coins', 'rgba(255,201,69,.13)', 'var(--gold)', '$' + (d.revenue / 100).toFixed(2), 'Store revenue')
    + kpi('door', 'rgba(139,92,246,.16)', 'var(--violet)', fmt(d.activeRooms), 'Active rooms')
    + kpi('clock', 'rgba(150,163,220,.12)', 'var(--muted)', fmt(d.pending), 'Pending orders')
    + '</div>'
    + '<div class="charts">'
    + '<div class="card chart-card"><h4>Active players <span class="chip classic">14 days</span></h4>'
    + svgBarsSimple(d.dau.map(x => x.count), d.dau.map(x => x.day), maxDau)
    + '</div>'
    + '<div class="card chart-card"><h4>Matches by game</h4>'
    + (d.byGame.length ? d.byGame.map(g => '<div class="topgame"><div class="tg-t"><b>' + g.game + '</b><span>' + g.c + '</span></div>'
      + '<div class="wrbar" style="max-width:none"><i style="width:' + (g.c / d.byGame[0].c * 100) + '%"></i></div></div>').join('') : '<div class="empty">No matches yet</div>')
    + '</div></div>'
    + '<div class="card tx-card" style="margin-top:16px"><h3>Latest wallet movements</h3>'
    + (d.recentTx.length ? d.recentTx.map(t => '<div class="tx-row"><div class="ti"><b>' + esc(t.username) + '</b><span>' + esc(t.reason) + '</span></div>'
      + '<div class="ta ' + (t.delta >= 0 ? 'plus' : 'minus') + '">' + (t.delta >= 0 ? '+' : '') + fmt(t.delta) + '</div></div>').join('') : '<div class="empty">—</div>')
    + '</div>';
}
function kpi(ic, bg, col, val, lbl){
  return '<div class="card kpi"><div class="ic" style="background:' + bg + ';color:' + col + '">' + icon(ic, 20) + '</div><b>' + val + '</b><span>' + lbl + '</span></div>';
}
function svgBarsSimple(data, labels, max){
  const w = 560, h = 190, bw = (w - 30) / data.length;
  return '<svg viewBox="0 0 ' + w + ' ' + h + '" width="100%" style="display:block">'
    + data.map((v, i) => {
      const bh = (v / max) * (h - 46);
      const x = 15 + i * bw + bw * .18, y = h - 26 - bh;
      return '<rect x="' + x.toFixed(1) + '" y="' + y.toFixed(1) + '" width="' + (bw * .64).toFixed(1) + '" height="' + Math.max(2, bh).toFixed(1) + '" rx="5" fill="url(#admg)"/>'
        + '<text x="' + (x + bw * .32) + '" y="' + (h - 8) + '" font-size="9" fill="#98a2c0" text-anchor="middle">' + labels[i] + '</text>'
        + (v ? '<text x="' + (x + bw * .32) + '" y="' + (y - 6) + '" font-size="9.5" fill="#eef1fb" text-anchor="middle">' + v + '</text>' : '');
    }).join('')
    + '<defs><linearGradient id="admg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#22d3ee"/><stop offset="1" stop-color="#22d3ee" stop-opacity=".25"/></linearGradient></defs></svg>';
}
function adminUsersView(){
  if (!adminUsers) return '<div class="empty">Loading…</div>';
  return '<div style="display:flex;gap:12px;align-items:center;margin:18px 0 14px;flex-wrap:wrap">'
    + '<div class="admin-search">' + icon('search', 16) + '<input placeholder="Search username / email…" value="' + esc(adminQuery) + '" oninput="adminQuery=this.value;adminUsersFilter(this.value)"></div>'
    + '<span style="font-size:12.5px;color:var(--muted)">' + adminUsers.users.length + ' shown</span></div>'
    + '<div class="card" style="padding:6px" id="adm-users">' + adminUsersRender(adminUsers.users) + '</div>';
}
function adminUsersRender(list){
  return '<div class="tbl-wrap" style="border:none"><table class="vt"><tr><th>Player</th><th>Email</th><th>Coins</th><th>Rating</th><th>W/L</th><th>Status</th><th>Actions</th></tr>'
    + list.map(u => '<tr>'
      + '<td><b>' + esc(u.username) + '</b>' + (u.role === 'admin' ? ' <span class="chip classic">admin</span>' : '') + '</td>'
      + '<td style="color:var(--muted)">' + esc(u.email) + '</td>'
      + '<td style="color:var(--gold);font-weight:700">' + fmt(u.coins) + '</td>'
      + '<td>' + u.rating + '</td><td>' + u.wins + '/' + u.losses + '</td>'
      + '<td><span class="st ' + (u.banned ? 'off' : u.online ? 'on' : 'pend') + '"><i></i>' + (u.banned ? 'Banned' : u.online ? 'Online' : 'Offline') + '</span></td>'
      + '<td style="display:flex;gap:6px">' + (u.role !== 'admin'
        ? '<button class="btn small ' + (u.banned ? 'ghost' : 'danger') + '" onclick="adminBan(' + u.id + ',' + (u.banned ? 'false' : 'true') + ')">' + (u.banned ? 'Unban' : 'Ban') + '</button>'
          + '<button class="btn ghost small" onclick="adminGrantUI(' + u.id + ',\'' + esc(u.username) + '\')">Grant</button>'
        : '<span style="color:var(--muted);font-size:12px">—</span>')
      + '</td></tr>').join('') + '</table></div>';
}
function adminUsersFilter(q){
  const box = $('#adm-users'); if (!box || !adminUsers) return;
  const ql = q.toLowerCase();
  box.innerHTML = adminUsersRender(adminUsers.users.filter(u => !ql || u.username.toLowerCase().indexOf(ql) >= 0 || u.email.toLowerCase().indexOf(ql) >= 0));
}
async function adminBan(id, on){
  try { await api('POST', '/admin/users/' + id + '/ban', { on }); adminUsers = await api('GET', '/admin/users'); adminUsersFilter(adminQuery); toast(on ? 'Player banned' : 'Player unbanned', '', on ? 'err' : 'ok'); }
  catch(e){ toast('Failed', e.message, 'err'); }
}
function adminGrantUI(id, name){
  openModal('<div style="text-align:center;padding-top:8px" class="admin-ltr"><h3 style="font-size:19px">Grant VEXORA Coins</h3>'
    + '<div style="color:var(--muted);font-size:13px;margin:6px 0 14px">to <b>' + esc(name) + '</b></div>'
    + '<div class="field" style="text-align:left"><label>Amount (+/-)</label><div class="inp">' + icon('coins', 17) + '<input id="gr-amt" type="number" value="1000"></div></div>'
    + '<div class="field" style="text-align:left"><label>Reason</label><div class="inp">' + icon('mail', 17) + '<input id="gr-reason" placeholder="support / promo" value="manual adjustment"></div></div>'
    + '<div style="display:flex;gap:10px"><button class="btn ghost wfull" onclick="closeModal()">Cancel</button>'
    + '<button class="btn gold wfull" onclick="adminGrantDo(' + id + ')">Apply</button></div></div>');
}
async function adminGrantDo(id){
  const amt = Number(($('#gr-amt') ? $('#gr-amt').value : '0'));
  const reason = $('#gr-reason') ? $('#gr-reason').value : '';
  try {
    await api('POST', '/admin/users/' + id + '/grant', { coins: amt, reason });
    closeModal(); toast('Granted', fmt(amt) + ' VC applied', 'coin');
    adminUsers = null; adminData = null; render();
  } catch(e){ toast('Failed', e.message, 'err'); }
}
function adminOrdersView(){
  if (!adminOrders) return '<div class="empty">Loading…</div>';
  return '<div class="card" style="padding:6px;margin-top:16px"><div class="tbl-wrap" style="border:none"><table class="vt">'
    + '<tr><th>Order</th><th>Player</th><th>Item</th><th>Amount</th><th>Provider</th><th>Status</th><th>Action</th></tr>'
    + adminOrders.orders.map(o => '<tr><td style="font-family:monospace;font-size:11px">' + esc(o.id.slice(0, 12)) + '…</td>'
      + '<td><b>' + esc(o.username) + '</b></td><td>' + esc(o.name_ar) + '</td>'
      + '<td style="color:var(--gold);font-weight:700">$' + (o.amount_cents / 100).toFixed(2) + '</td>'
      + '<td>' + o.provider + '</td>'
      + '<td><span class="st ' + (o.status === 'paid' ? 'on' : o.status === 'pending' ? 'pend' : 'off') + '"><i></i>' + o.status + '</span></td>'
      + '<td>' + (o.status === 'pending' && o.provider === 'manual'
        ? '<button class="btn primary small" onclick="adminApproveOrder(\'' + o.id + '\')">Approve payment</button>' : '—')
      + '</td></tr>').join('')
    + '</table></div></div>';
}
async function adminApproveOrder(id){
  try { await api('POST', '/admin/orders/' + id + '/approve'); toast('Order settled', 'Items credited', 'coin'); adminOrders = null; adminData = null; render(); }
  catch(e){ toast('Failed', e.message, 'err'); }
}

/* ---------- route hooks (data load on navigation) ---------- */
const _origNavigate = navigate;
navigate = function(r){
  _origNavigate(r);
  if (r === 'store' && !S.storeItems) loadStore();
  if (r === 'wallet') loadWallet();
  if (r === 'friends') loadFriends();
  if (r === 'room' && S.roomView) { refreshLobbyBits(); }
};
