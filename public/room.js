'use strict';
/* ============================================================
   VEXORA — game room (live) + admin dashboard
   Board state arrives from the server; moves are validated
   server-side and pushed back over realtime.
   ============================================================ */


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

/* ---------- open room ---------- */
async function openRoom(roomId, silent){
  try {
    const j = await api('GET', '/rooms/' + roomId);
    S.roomView = sanitizeRoom(j.room, null);
    S.roomChat = Array.isArray(j.chat) ? j.chat : [];
    navigate('room');
  } catch(e){ toast('تعذر فتح الغرفة', e.message, 'err'); }
}
function viewRoomEntry(){
  if (!S.roomView) { setTimeout(() => navigate('lobby'), 10); return '<div class="wrap"><div class="empty">لا توجد غرفة نشطة</div></div>'; }
  return roomHTML();
}

/* ---------- room view ---------- */
function gameBoardHTML(r){
  if (r.game === 'chess') return chBoardHTML(r);
  if (r.game === 'backgammon') return bgBoardHTML(r);
  if (r.game === 'pool8') return poolBoardHTML(r);
  if (r.game === 'reversi') return rvBoardHTML(r);
  return c4BoardHTML(r);
}

/* ============ CHESS (شطرنج) ============ */
const CH_PIECES = { K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟' };
let chSel = null;
function chMyColor(r){ return r.you === 2 ? 'b' : 'w'; }
function chBoardHTML(r){
  const my = chMyColor(r);
  const flip = my === 'b';
  const myTurn = !r.over && r.turnColor === my && r.you !== 0 && r.status === 'playing';
  const moves = r.moves || [];
  const targets = chSel !== null ? (moves || []).filter(m => m.from === chSel) : [];
  let cells = '';
  for (let v = 0; v < 64; v++){
    const i = flip ? 63 - v : v;
    const row = i >> 3, col = i & 7;
    const dark = (row + col) % 2 === 1;
    const p = r.board ? r.board[i] : '.';
    const isTgt = targets.some(m => m.to === i);
    const own = p !== '.' && ((p === p.toUpperCase()) === (my === 'w'));
    const clickable = myTurn && (isTgt || own);
    const lastM = r.last && (r.last[0] === i || r.last[1] === i);
    cells += '<div class="ch-sq' + (dark ? ' dk' : '')
      + (chSel === i ? ' sel' : '') + (isTgt ? ' tgt' : '') + (lastM ? ' lastm' : '')
      + '" ' + (clickable ? 'onclick="chTap(' + i + ')"' : '') + '>'
      + (p !== '.' ? '<span class="pc ' + (p === p.toUpperCase() ? 'pw' : 'pb') + '">' + CH_PIECES[p] + '</span>' : '')
      + '</div>';
  }
  const status = r.over
    ? (r.winner === 0 ? 'تعادل — لا نقلات قانونية' : (r.winner === r.you ? '🏆 كش مات — فزت!' : 'كش مات — خسرت'))
    : (myTurn ? '<b>دورك' + (r.check ? ' — كش!' : '') + '</b>' : 'دور الخصم…' + (r.check ? ' (كش)' : ''));
  const who = 'أنت بالأبيض ♔' ; const who2 = 'أنت بالأسود ♚';
  return '<div class="gstat">' + status + ' <span class="sub2">' + (my === 'w' ? who : who2) + ' · دخول ' + fmt(r.entry) + ' · جائزة ' + fmt(r.pot) + '</span></div>'
    + '<div class="ch-board" dir="ltr">' + cells + '</div>'
    + (r.over ? endButtonsHTML(r) : '')
    + '<script>chArmDrag&&chArmDrag()<' + '/script>';
}
function endButtonsHTML(r){
  return '<div style="display:flex;gap:10px;margin-top:14px"><button class="btn ghost wfull" onclick="leaveRoomUI(' + r.id + ')">مغادرة</button>'
    + '<button class="btn primary wfull" onclick="practiceAI(\'' + r.game + '\')">مباراة جديدة</button></div>';
}
function chArmDrag(){
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

async function chTap(i){
  const r = S.roomView;
  if (!r || r.over) return;
  const my = chMyColor(r);
  const moves = r.moves || [];
  if (chSel !== null && moves.some(m => m.from === chSel && m.to === i)){
    const from = chSel; chSel = null;
    try {
      const j = await api('POST', '/rooms/' + r.id + '/move', { from, to: i });
      if (j.state){ S.roomView = Object.assign({}, S.roomView, j.state); renderRoom(); }
    } catch(e){ toast('حركة مرفوضة', e.message, 'err'); }
    return;
  }
  const p = r.board ? r.board[i] : '.';
  const own = p !== '.' && ((p === p.toUpperCase()) === (my === 'w'));
  chSel = own ? i : null;
  renderRoom();
}

/* ============ BACKGAMMON (طاولة الزهر) ============ */
let bgSel = null;
function bgBoardHTML(r){
  const myTurn = !r.over && r.turn === r.you && r.you !== 0 && r.status === 'playing';
  const moves = r.moves || [];
  const targets = bgSel !== null ? (moves || []).filter(m => m.from === bgSel) : [];
  const ptHTML = (pt, top) => {
    const v = (r.pts && r.pts[pt]) || 0;
    const count = Math.abs(v), white = v > 0;
    const canSel = myTurn && moves.some(m => m.from === pt);
    const isTgt = targets.some(m => m.to === pt);
    let stack = '';
    for (let i = 0; i < Math.min(count, 5); i++) stack += '<i class="chk' + (white ? ' cw' : ' cb') + '"></i>';
    if (count > 5) stack += '<b class="chk-n num">' + count + '</b>';
    return '<div class="pt' + (top ? ' top' : '') + (bgSel === pt ? ' sel' : '') + (isTgt ? ' tgt' : '') + '"'
      + ((canSel || isTgt) ? ' onclick="bgTap(' + pt + ')"' : '') + '>'
      + '<span class="tri"></span><span class="stack">' + stack + '</span></div>';
  };
  const barMe = r.you === 2 ? r.bars[1] : r.bars[0];
  const barOpp = r.you === 2 ? r.bars[0] : r.bars[1];
  const myBarSel = myTurn && barMe > 0 && moves.some(m => m.from === 25);
  const diceHTML = (r.dice || []).map(d => '<span class="die num">' + d + '</span>').join(' ') || '—';
  const offMe = r.you === 2 ? r.offs[1] : r.offs[0];
  const status = r.over
    ? (r.winner === r.you ? '🏆 فزت! أخرجت كل حجرك' : 'خسرت — الخصم أخرج كل أحجاره')
    : (myTurn ? '<b>دورك</b> — اختر حجرًا ثم الوجه' : 'دور الخصم…');
  return '<div class="gstat">' + status + '<span class="sub2">دخول ' + fmt(r.entry) + ' · جائزة ' + fmt(r.pot) + '</span></div>'
    + '<div class="bg-top"><span>النرد: ' + diceHTML + '</span><span>أخرجتَ: <b class="num">' + offMe + '/15</b></span></div>'
    + '<div class="bg-board" dir="ltr">'
    + '<div class="bg-row">' + [12,11,10,9,8,7,6,5,4,3,2,1].map(p => ptHTML(p, true)).join('') + '</div>'
    + '<div class="bg-mid">'
    + '<div class="bg-bar' + (myBarSel ? ' sel' : '') + '"' + (myBarSel ? ' onclick="bgTap(25)"' : '') + '>'
    + '<div class="barlab">الحاجز</div>' + (barMe || barOpp ? '<div class="barnums">فيه <b class="num">' + barMe + '</b> لك · <b class="num">' + barOpp + '</b> للخصم</div>' : '<div class="barnums sub2">اضغط للدخول من الحاجز</div>') + '</div></div>'
    + '<div class="bg-row">' + [13,14,15,16,17,18,19,20,21,22,23,24].map(p => ptHTML(p, false)).join('') + '</div>'
    + '</div>'
    + '<div class="bg-note sub2">' + (r.you === 1 ? 'أنت تتحرك ⟵ نحو اليمين-أسفل (بيتك 1-6)' : 'أنت تتحرك نحو الأعلى-يسار (بيتك 19-24)') + ' · النرد يُرمى تلقائيًا</div>'
    + (r.over ? endButtonsHTML(r) : '');
}
async function bgTap(pt){
  const r = S.roomView;
  if (!r || r.over) return;
  const moves = r.moves || [];
  if (bgSel !== null && moves.some(m => m.from === bgSel && m.to === pt)){
    const from = bgSel; bgSel = null;
    try {
      const j = await api('POST', '/rooms/' + r.id + '/move', { from, to: pt });
      if (j.state){ S.roomView = Object.assign({}, S.roomView, j.state); renderRoom(); }
    } catch(e){ toast('حركة مرفوضة', e.message, 'err'); }
    return;
  }
  bgSel = moves.some(m => m.from === pt) ? pt : null;
  renderRoom();
}

/* ============ 8-BALL POOL v2 (Gamezer-style) ============ */
const POOL_COLORS = { 1:'#f5c518',2:'#1f6feb',3:'#e5484d',4:'#8b5cf6',5:'#f28c28',6:'#2ea043',7:'#8b1a1a',8:'#111',9:'#f5c518',10:'#1f6feb',11:'#e5484d',12:'#8b5cf6',13:'#f28c28',14:'#2ea043',15:'#8b1a1a' };
let poolToken = 0;
let poolSpin = 0;      /* -1 draw · 0 none · +1 follow */
let poolClockRAF = 0;

function poolBoardHTML(r){
  return '<div class="gstat" id="pool-status"></div>'
    + '<div class="pool-hud" id="pool-hud"></div>'
    + '<div class="pool-clockwrap"><div class="pool-clock" id="pool-clock"></div><span class="pool-clocklbl num" id="pool-clocklbl">9.0</span></div>'
    + '<div class="pool-wrap"><canvas id="pool-canvas"></canvas></div>'
    + '<div class="pool-tools" id="pool-tools">'
    + '<button class="spin-btn' + (poolSpin === -1 ? ' on' : '') + '" onclick="poolSetSpin(-1)">⬆ رجوع<br><small>(Draw)</small></button>'
    + '<button class="spin-btn' + (poolSpin === 0 ? ' on' : '') + '" onclick="poolSetSpin(0)">● بلا<br><small>(عادي)</small></button>'
    + '<button class="spin-btn' + (poolSpin === 1 ? ' on' : '') + '" onclick="poolSetSpin(1)">⬇ تقدم<br><small>(Follow)</small></button>'
    + '</div>'
    + '<div class="pool-hint sub2">اسحب من كرة الضرب لتصويب العصا · طول السحب = القوة · لديك 9 ثوانٍ لكل ضربة</div>'
    + (r.over ? endButtonsHTML(r) : '');
}
function poolSetSpin(v){
  poolSpin = v;
  document.querySelectorAll('.spin-btn').forEach(b => b.classList.remove('on'));
  if (event && event.currentTarget) event.currentTarget.classList.add('on');
  else { const btns = document.querySelectorAll('.spin-btn'); if (btns[v + 1]) btns[v + 1].classList.add('on'); }
}

function poolInit(){
  const r = S.roomView;
  const cv = document.getElementById('pool-canvas');
  if (!cv || !r || !r.balls){ return; }
  const token = ++poolToken;
  const P = window.PoolPhysics;
  const wrap = cv.parentElement;
  let aim = null;

  function fit(){
    let w = wrap.clientWidth || cv.clientWidth || 0;
    if (w < 60) w = Math.min(360, (document.getElementById('root') || {}).clientWidth || 320);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.max(120, Math.round(w * dpr));
    cv.height = Math.max(70, Math.round(w * 0.54 * dpr));
    cv.style.width = '100%';
    cv.style.height = Math.round(w * 0.54) + 'px';
    cv.style.maxWidth = '640px';
    cv.style.margin = '0 auto';
    cv.style.display = 'block';
  }

  function toUnits(px, py){
    return { x: px / cv.clientWidth * P.W, y: py / cv.clientWidth * P.W };
  }

  function drawBall(ctx, b, s){
    const x = b.x * s, y = b.y * s, rad = P.R * s;
    ctx.save();
    /* shadow */
    ctx.beginPath(); ctx.arc(x + rad * 0.18, y + rad * 0.28, rad * 1.02, 0, 7);
    ctx.fillStyle = 'rgba(0,0,0,.38)'; ctx.fill();
    const id = b.id;
    const col = POOL_COLORS[id] || '#999';
    const g = ctx.createRadialGradient(x - rad * 0.35, y - rad * 0.4, rad * 0.1, x, y, rad * 1.05);
    if (id === 0){ g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#e9edef'); g.addColorStop(1, '#b9c2c9'); }
    else if (id === 8){ g.addColorStop(0, '#4a4a55'); g.addColorStop(0.4, '#1a1a22'); g.addColorStop(1, '#000'); }
    else if (id > 8){ g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, '#eef1f4'); g.addColorStop(1, '#c3cad1'); }
    else { g.addColorStop(0, lightenHex(col, 0.45)); g.addColorStop(0.5, col); g.addColorStop(1, darkenHex(col, 0.45)); }
    ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fillStyle = g; ctx.fill();
    if (id > 8 && id !== 0 && id !== 8){          /* stripe band */
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.clip();
      const bg = ctx.createLinearGradient(x - rad, y, x + rad, y);
      bg.addColorStop(0, darkenHex(col, .25)); bg.addColorStop(.5, col); bg.addColorStop(1, darkenHex(col, .25));
      ctx.fillStyle = bg; ctx.fillRect(x - rad, y - rad * 0.52, rad * 2, rad * 1.04); ctx.restore();
    }
    if (id === 8){                                 /* white 8 disc */
      ctx.beginPath(); ctx.arc(x, y, rad * 0.44, 0, 7); ctx.fillStyle = '#f4f6f8'; ctx.fill();
    }
    if (id !== 0 && rad > 5){
      ctx.fillStyle = (id === 8) ? '#111' : '#fff';
      ctx.font = '900 ' + Math.max(7, Math.round(rad * 0.95)) + 'px Segoe UI,Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(id === 8 ? 8 : (id > 8 ? id - 8 : id)), x, y + rad * 0.05);
    }
    /* specular highlight */
    ctx.beginPath(); ctx.arc(x - rad * 0.38, y - rad * 0.42, rad * 0.24, 0, 7);
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill();
    ctx.beginPath(); ctx.arc(x + rad * 0.3, y + rad * 0.35, rad * 0.12, 0, 7);
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fill();
    ctx.restore();
  }
  function lightenHex(h, f){ return shadeHex(h, f); }
  function darkenHex(h, f){ return shadeHex(h, -f); }
  function shadeHex(h, f){
    const n = parseInt(h.slice(1), 16);
    let r = (n >> 16) & 255, g2 = (n >> 8) & 255, b = n & 255;
    r = Math.round(Math.min(255, Math.max(0, r + 255 * f)));
    g2 = Math.round(Math.min(255, Math.max(0, g2 + 255 * f)));
    b = Math.round(Math.min(255, Math.max(0, b + 255 * f)));
    return 'rgb(' + r + ',' + g2 + ',' + b + ')';
  }

  function draw(){
    if (cv.width < 10 || cv.height < 10){ fit(); }
    const ctx = cv.getContext('2d');
    const s = cv.width / P.W;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    /* wooden frame */
    const wood = ctx.createLinearGradient(0, 0, 0, cv.height);
    wood.addColorStop(0, '#6b4423'); wood.addColorStop(.5, '#8a5a2b'); wood.addColorStop(1, '#543316');
    ctx.fillStyle = wood;
    roundRect(ctx, 0, 0, cv.width, cv.height, s * 3); ctx.fill();
    /* metal corner accents */
    ctx.fillStyle = 'rgba(220,228,235,.9)';
    for (const p of [[0,0],[cv.width,0],[0,cv.height],[cv.width,cv.height]]){
      ctx.save(); ctx.beginPath();
      ctx.arc(p[0] === 0 ? s * 2.2 : cv.width - s * 2.2, p[1] === 0 ? s * 2.2 : cv.height - s * 2.2, s * 1.1, 0, 7);
      ctx.fillStyle = 'rgba(210,220,230,.95)'; ctx.fill(); ctx.restore();
    }
    /* rail sights (diamonds) */
    ctx.fillStyle = 'rgba(240,244,248,.85)';
    for (let i = 1; i <= 3; i++){
      const fx = cv.width * (i / 4);
      diamond(ctx, fx, s * 1.1, s * 0.5); diamond(ctx, fx, cv.height - s * 1.1, s * 0.5);
      diamond(ctx, s * 1.1, cv.height * (i / 4 + .125), s * 0.5);
      diamond(ctx, cv.width - s * 1.1, cv.height * (i / 4 + .125), s * 0.5);
    }
    /* felt */
    const felt = ctx.createRadialGradient(cv.width / 2, cv.height / 2, s * 4, cv.width / 2, cv.height / 2, cv.width * 0.62);
    felt.addColorStop(0, '#1d6b47'); felt.addColorStop(.7, '#155939'); felt.addColorStop(1, '#0d3f28');
    ctx.fillStyle = felt;
    roundRect(ctx, s * 2.1, s * 2.1, cv.width - s * 4.2, cv.height - s * 4.2, s * 1.6); ctx.fill();
    /* baulk line + D */
    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = Math.max(1, s * 0.14);
    ctx.beginPath(); ctx.moveTo(cv.width * 0.25, s * 2.1); ctx.lineTo(cv.width * 0.25, cv.height - s * 2.1); ctx.stroke();
    ctx.beginPath(); ctx.arc(cv.width * 0.25, cv.height / 2, cv.height * 0.18, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke();
    /* pockets with depth */
    for (const p of P.POCKETS){
      const px = p.x * s, py = p.y * s;
      const pg = ctx.createRadialGradient(px, py - P.PR * s * 0.25, P.PR * s * 0.15, px, py, P.PR * s * 1.25);
      pg.addColorStop(0, '#000'); pg.addColorStop(.7, '#0a0f0c'); pg.addColorStop(1, '#1c2a22');
      ctx.beginPath(); ctx.arc(px, py, P.PR * s * 1.22, 0, 7); ctx.fillStyle = pg; ctx.fill();
      ctx.beginPath(); ctx.arc(px, py, P.PR * s, 0, 7); ctx.strokeStyle = 'rgba(255,222,150,.5)'; ctx.lineWidth = Math.max(1, s * 0.16); ctx.stroke();
    }
    /* balls */
    for (const b of r.balls){ if (!b.pocketed) drawBall(ctx, b, s); }
    /* aim + cue stick */
    const cue = r.balls.find(b => b.id === 0);
    if (aim && cue && !cue.pocketed){
      const dx = aim.x - cue.x, dy = aim.y - cue.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0.5){
        const ux = dx / len, uy = dy / len;
        ctx.strokeStyle = 'rgba(34,211,238,.95)'; ctx.lineWidth = Math.max(1.5, s * 0.12);
        ctx.setLineDash([s * 1.1, s * 0.7]);
        ctx.beginPath(); ctx.moveTo(cue.x * s, cue.y * s);
        ctx.lineTo((cue.x + ux * len) * s, (cue.y + uy * len) * s);
        ctx.stroke(); ctx.setLineDash([]);
        /* stick: wood shaft + cyan tip */
        const back = 4.2 + Math.min(13, len * 0.24);
        const sg = ctx.createLinearGradient((cue.x - ux * back) * s, (cue.y - uy * back) * s, (cue.x - ux * (back + 10)) * s, (cue.y - uy * (back + 10)) * s);
        sg.addColorStop(0, '#d9c39a'); sg.addColorStop(1, '#7a5a33');
        ctx.strokeStyle = sg; ctx.lineWidth = Math.max(2, s * 0.24);
        ctx.beginPath();
        ctx.moveTo((cue.x - ux * back) * s, (cue.y - uy * back) * s);
        ctx.lineTo((cue.x - ux * (back + 10)) * s, (cue.y - uy * (back + 10)) * s);
        ctx.stroke();
        ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = Math.max(2, s * 0.26);
        ctx.beginPath();
        ctx.moveTo((cue.x - ux * (back - 0.5)) * s, (cue.y - uy * (back - 0.5)) * s);
        ctx.lineTo((cue.x - ux * back) * s, (cue.y - uy * back) * s);
        ctx.stroke();
      }
    }
  }
  function roundRect(ctx, x, y, w, h, rad){
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }
  function diamond(ctx, x, y, s2){
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
    ctx.fillRect(-s2 / 2, -s2 / 2, s2, s2); ctx.restore();
  }

  function status(){
    const el = document.getElementById('pool-status');
    if (!el) return;
    const r2 = S.roomView;
    const myTurn = !r2.over && r2.turn === r2.you && r2.aimable && r2.you !== 0;
    let g = '';
    const grp = r2.groups && r2.groups[r2.you];
    if (grp) g = ' · فئتك: ' + (grp === 'solid' ? 'سادة ١-٧' : 'مخططة ٩-١٥');
    el.innerHTML = r2.over
      ? (r2.winner === r2.you ? '🏆 فزت!' : r2.winner === 0 ? 'تعادل' : 'خسرت')
      : (myTurn ? '<b>دورك</b> — صوّب واضرب' + g : (r2.aimable ? 'دور الخصم…' + g : 'الكرات تتحرك…' + g));
    el.className = 'gstat';
  }

  function hud(){
    const el = document.getElementById('pool-hud');
    if (!el) return;
    const r2 = S.roomView;
    const mine = r2.groups && r2.groups[r2.you];
    const theirs = r2.groups && r2.groups[3 - r2.you];
    const chips = (ids) => ids.map(id =>
      '<span class="pball ' + (id > 8 ? 'stripe' : id === 8 ? 'eight' : 'solid') + '" style="--pc:' + (POOL_COLORS[id] || '#999') + '">' + (id === 8 ? '8' : (id > 8 ? id - 8 : id)) + '</span>'
    ).join('');
    const mineIds = (r2.pocketed || []).filter(id => mine === 'solid' ? id < 8 : id > 8);
    const theirIds = (r2.pocketed || []).filter(id => theirs === 'solid' ? id < 8 : id > 8);
    el.innerHTML =
      '<div class="phud-side"><b>أسقطتَ ' + (mine ? mineIds.length + '/7' : (r2.pocketed || []).length) + '</b><div class="pchips">' + (chips(mineIds) || '<i class="sub2">—</i>') + '</div></div>'
      + '<div class="phud-score num">' + (r2.you === r2.turn ? '🔵' : '⚪') + '</div>'
      + '<div class="phud-side"><b>أسقط الخصم ' + (theirs ? theirIds.length + '/7' : '') + '</b><div class="pchips">' + (chips(theirIds) || '<i class="sub2">—</i>') + '</div></div>';
  }

  function clock(){
    const bar = document.getElementById('pool-clock');
    const lbl = document.getElementById('pool-clocklbl');
    if (!bar || !lbl) return;
    const r2 = S.roomView;
    if (r2.over || r2.turn !== r2.you || r2.you === 0 || !r2.aimable){
      bar.style.width = '100%'; bar.classList.remove('low'); lbl.textContent = '—';
      return;
    }
    const left = Math.max(0, r2.shotClock - (Date.now() - (r2.turnStartedAt || Date.now())));
    const pct = left / r2.shotClock * 100;
    bar.style.width = pct + '%';
    bar.classList.toggle('low', pct < 33);
    lbl.textContent = (left / 1000).toFixed(1);
    if (token === poolToken && left > 0){ requestAnimationFrame(clock); }
  }

  function anim(){
    if (token !== poolToken) return;
    const r2 = S.roomView;
    if (r2.balls && !P.allStopped(r2.balls)){
      P.step(r2.balls);
      draw(); status(); hud();
      requestAnimationFrame(anim);
    } else { draw(); status(); hud(); }
  }

  fit(); draw(); status(); hud(); clock();
  window.addEventListener('resize', () => { if (token === poolToken){ fit(); draw(); } });
  if (r.balls && !P.allStopped(r.balls)) requestAnimationFrame(anim);

  const myTurnNow = () => !S.roomView.over && S.roomView.turn === S.roomView.you && S.roomView.aimable && S.roomView.you !== 0;
  if (myTurnNow()){
    cv.style.touchAction = 'none';
    const pos = e => { const rc = cv.getBoundingClientRect(); return toUnits(e.clientX - rc.left, e.clientY - rc.top); };
    cv.onpointerdown = e => { if (!myTurnNow()) return; aim = pos(e); cv.setPointerCapture(e.pointerId); draw(); };
    cv.onpointermove = e => { if (aim){ aim = pos(e); draw(); } };
    cv.onpointerup = async e => {
      if (!aim) return;
      const r3 = S.roomView;
      const cue = r3.balls.find(b => b.id === 0);
      const dx = aim.x - cue.x, dy = aim.y - cue.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      aim = null;
      if (len < 1.5){ draw(); return; }
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      const power = Math.max(8, Math.min(100, len * 1.15));
      const speed = power * 0.062;
      cue.vx = Math.cos(angle * Math.PI / 180) * speed;
      cue.vy = Math.sin(angle * Math.PI / 180) * speed;
      requestAnimationFrame(anim);
      try {
        const j = await api('POST', '/rooms/' + r3.id + '/move', { angle, power, spin: poolSpin });
        if (j.state){ S.roomView = sanitizeRoom(j.state, S.roomView); }
      } catch(err){
        toast('ضربة مرفوضة', err.message, 'err');
        if (err && err.code === 'SHOT_CLOCK'){ S.roomView.turn = 3 - S.roomView.you; }
      }
      if (S.route === 'room' && S.roomView.game === 'pool8'){ chSel = null; bgSel = null; renderRoom(); }
    };
  } else { cv.onpointerdown = cv.onpointermove = cv.onpointerup = null; }
}

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
    : gameBoardHTML(r);

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
    + '<div style="margin-top:14px" id="c4-status">' + (['chess','backgammon','pool8'].indexOf(r.game) >= 0 ? '' : statusHTML) + '</div>'
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
  const board = Array.isArray(r.board) ? r.board : [];
  return '<div class="c4-board">' + board.map((row, ri) => row.map((cell, ci) => {
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
  const cells = (Array.isArray(r.board) ? r.board : []).map((row, ri) => row.map((cell, ci) => {
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
  chSel = null; bgSel = null;
  const root = $('#root');
  if (root){ root.innerHTML = headerHTML() + roomHTML() + footerHTML() + drawerHTML() + bottomNavHTML(); }
  if (S.roomView.game === 'pool8') poolInit();
}
/* full render() rebuilds the DOM too — the MutationObserver below re-arms the
   pool canvas renderer, otherwise the canvas stays black */

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
  if ((r === 'lobby' || r === 'chat') && !S.chatRooms && typeof loadChatRooms === 'function') loadChatRooms();
  if (r === 'store' && !S.storeItems) loadStore();
  if (r === 'wallet') loadWallet();
  if (r === 'friends') loadFriends();
  if (r === 'room' && S.roomView) { refreshLobbyBits(); }
};


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
