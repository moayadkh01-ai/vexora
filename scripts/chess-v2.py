#!/usr/bin/env python3
# v2026.08.20.8 — Full interactive chess rebuild: click+drag, green legal dots,
# promotion picker, game-over overlay, player bars with rating/clock/captured,
# AI + realtime moves. Server already has full rules (castling/EP/promo/mate) tested.

r = open('public/room.js', encoding='utf-8').read()

# ---- replace chess renderer block ----
start = r.index('const CH_PIECES =')
end = r.index('/* ============ BACKGAMMON')
new_chess = '''const CH_PIECES = { K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟' };
const CH_VAL = { p:1, n:3, b:3, r:5, q:9, k:0 };
let chSel = null;
let chDrag = null;      /* {from, ghostEl} */
function chMyColor(r){ return r.you === 2 ? 'b' : 'w'; }

function chCapturedHTML(r, forColor){
  /* pieces of forColor captured by opponent = missing from board vs initial set */
  const init = { P:8, N:2, B:2, R:2, Q:1, K:0 };
  const have = { P:0, N:0, B:0, R:0, Q:0, K:0 };
  (r.board || []).forEach(p => { if (p !== '.' && (p === p.toUpperCase()) === (forColor === 'w') && have[p.toUpperCase()] !== undefined) have[p.toUpperCase()]++; });
  const out = [];
  for (const k of ['Q','R','B','N','P']){
    for (let i = 0; i < Math.max(0, init[k] - have[k]); i++){
      out.push('<span class="cap-pc ' + (forColor === 'w' ? 'cw' : 'cb') + '">' + CH_PIECES[forColor === 'w' ? k.toLowerCase() : k] + '</span>');
    }
  }
  return out.join('') || '<i class="sub2">—</i>';
}

function chMaterialDiff(r, color){
  let mine = 0, theirs = 0;
  (r.board || []).forEach(p => {
    if (p === '.') return;
    const v = CH_VAL[p.toLowerCase()] || 0;
    if ((p === p.toUpperCase()) === (color === 'w')) mine += v; else theirs += v;
  });
  return mine - theirs;
}

function chBoardHTML(r){
  const my = chMyColor(r);
  const flip = my === 'b';
  const myTurn = !r.over && r.turnColor === my && r.you !== 0 && r.status === 'playing';
  const moves = r.moves || [];
  const targets = chSel !== null ? moves.filter(m => m.from === chSel) : [];
  const promoTargets = targets.filter(m => m.promo);
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
    const isSel = chSel === i;
    const coordL = (flip ? col === 7 : col === 0) ? '<i class="coord cl">' + (8 - row) + '</i>' : '';
    const coordN = (flip ? row === 0 : row === 7) ? '<i class="coord cn">' + 'abcdefgh'[col] + '</i>' : '';
    cells += '<div class="ch-sq' + (dark ? ' dk' : '')
      + (isSel ? ' sel' : '') + (isTgt ? ' tgt' : '') + (lastM ? ' lastm' : '')
      + (own && myTurn ? ' own' : '')
      + '" data-i="' + i + '"'
      + (clickable ? ' onclick="chTap(' + i + ')"' : '')
      + ' ontouchstart="chTouchStart(event,' + i + ')" ontouchmove="chTouchMove(event)" ontouchend="chTouchEnd(event,' + i + ')"'
      + ' onpointerdown="chPtrDown(event,' + i + ')"'
      + '>'
      + coordL + coordN
      + (p !== '.' ? '<span class="pc ' + (p === p.toUpperCase() ? 'pw' : 'pb') + '" data-i="' + i + '">' + CH_PIECES[p] + '</span>' : '')
      + '</div>';
  }
  const opp = r.you === 2 ? r.host : r.guest;
  const me = { username: S.me.user.username, rating: S.me.user.rating };
  const oppBar = '<div class="chp-bar">' + chPlayerSide(opp, r, false, my) + chClockHTML(r, false) + '<div class="chp-cap">' + chCapturedHTML(r, my === 'w' ? 'b' : 'w') + '</div></div>';
  const myBar = '<div class="chp-bar me">' + chPlayerSide(me, r, true, my) + chClockHTML(r, true) + '<div class="chp-cap">' + chCapturedHTML(r, my) + '</div></div>';
  const status = r.over
    ? (r.winner === 0 ? 'تعادل — خنق الملك (Stalemate)' : (r.winner === r.you ? '🏆 كش مات — فزت!' : 'كش مات — خسرت'))
    : (myTurn ? '<b>دورك' + (r.check ? ' — كش! ⚠️' : '') + '</b>' : 'دور الخصم…' + (r.check ? ' (كش للخصم) ⚠️' : ''));
  const overlay = r.over
    ? '<div class="ch-over"><div class="ch-over-in"><div style="font-size:44px">' + (r.winner === 0 ? '🤝' : r.winner === r.you ? '🏆' : '💔') + '</div>'
      + '<b>' + (r.winner === 0 ? 'تعادل' : r.winner === r.you ? 'فوز رائع!' : 'خسارة') + '</b>'
      + '<div class="sub2">' + (r.winner === 0 ? 'خنق الملك — لا نقلات قانونية' : 'كش مات') + '</div>'
      + '<button class="btn primary small" style="margin-top:10px" onclick="practiceAI(\\'chess\\')">مباراة جديدة</button>'
      + '<button class="btn ghost small" style="margin-top:8px" onclick="leaveRoomUI(' + r.id + ')">مغادرة</button></div></div>'
    : '';
  return oppBar
    + '<div class="ch-stage">'
    + '<div class="ch-board ' + (flip ? 'flip' : '') + '" dir="ltr">' + cells + overlay + '</div>'
    + '</div>'
    + myBar
    + '<div class="gstat">' + status + '<span class="sub2">' + (my === 'w' ? 'أنت بالأبيض ♔' : 'أنت بالأسود ♚') + ' · ' + (r.vs_ai ? 'ضد الحاسوب' : 'أونلاين') + '</span></div>';
}
function chPlayerSide(p, r, isMe, myColor){
  if (!p) return '<div class="chp-name"><b>الخصم</b></div>';
  return '<span class="ava chava' + (isMe ? ' me' : '') + '" style="width:34px;height:34px;font-size:14px;border-radius:10px">' + esc((p.username || '?')[0].toUpperCase()) + '</span>'
    + '<div class="chp-name"><b>' + esc(p.username) + (isMe ? ' (أنت)' : '') + '</b>'
    + '<span class="chp-elo num">' + (p.rating || 1000) + (myColor ? '' : '') + '</span></div>';
}
function chClockHTML(r, isMine){
  /* shot-clock style per-move timer (chess uses a soft 30s suggest timer; server has no chess clock) */
  return '<div class="chp-clock' + (isMine && !r.over && r.turnColor === (chMyColor(r)) ? ' on' : '') + '">' + icon('clock', 14) + '</div>';
}

/* ---------- interaction: click-to-move + drag & drop ---------- */
function chLegalTargets(from){ const r = S.roomView; return (r.moves || []).filter(m => m.from === from); }
function chSelect(i){ chSel = i; renderRoom(); }
async function chTryMove(from, to){
  const r = S.roomView;
  if (!r || r.over) return;
  const mv = (r.moves || []).find(m => m.from === from && m.to === to);
  if (!mv) return;
  const isPromo = (r.board[from].toLowerCase() === 'p') && ((to >> 3) === (r.you === 2 ? 7 : 0));
  let promo;
  if (isPromo){ promo = await chPromoPicker(); if (!promo){ renderRoom(); return; } }
  chSel = null;
  try {
    const body = { from, to };
    if (promo) body.promo = promo;
    const j = await api('POST', '/rooms/' + r.id + '/move', body);
    if (j.state){ S.roomView = sanitizeRoom(j.state, S.roomView); }
  } catch(e){ toast('حركة مرفوضة', e.message, 'err'); }
  renderRoom();
}
function chPromoPicker(){
  return new Promise(res => {
    openModal('<div style="text-align:center"><b style="font-size:15px">ترقية البيدق — اختر قطعة</b>'
      + '<div class="promo-row">'
      + '<button class="promo-btn" onclick="chPromoPick(\\'Q\\')">♕<small>ملكة</small></button>'
      + '<button class="promo-btn" onclick="chPromoPick(\\'R\\')">♖<small>رخ</small></button>'
      + '<button class="promo-btn" onclick="chPromoPick(\\'B\\')">♗<small>فيل</small></button>'
      + '<button class="promo-btn" onclick="chPromoPick(\\'N\\')">♘<small>حصان</small></button>'
      + '</div></div>');
    window.__chPromoRes = res;
  });
}
function chPromoPick(v){ closeModal(); if (window.__chPromoRes){ window.__chPromoRes(v); window.__chPromoRes = null; } }

async function chTap(i){
  const r = S.roomView;
  if (!r || r.over) return;
  const my = chMyColor(r);
  if (chSel !== null && chLegalTargets(chSel).some(m => m.to === i)){ chTryMove(chSel, i); return; }
  const p = r.board ? r.board[i] : '.';
  const own = p !== '.' && ((p === p.toUpperCase()) === (my === 'w'));
  chSelect(own && !r.over && r.turnColor === my ? i : null);
}

/* drag & drop (pointer events → works for touch + mouse) */
let chDragFrom = null, chDragGhost = null;
function chPtrDown(e, i){
  if (e.pointerType === 'mouse' && e.button !== 0) return;
  const r = S.roomView;
  if (!r || r.over) return;
  const my = chMyColor(r);
  if (r.turnColor !== my) return;
  const p = r.board ? r.board[i] : '.';
  const own = p !== '.' && ((p === p.toUpperCase()) === (my === 'w'));
  if (!own) return;
  chDragFrom = i;
  if (chSel !== i) chSelect(i);
  const pc = e.target.closest('.ch-sq');
  if (pc){
    const ghost = pc.querySelector('.pc');
    if (ghost){ ghost.classList.add('dragging'); chDragGhost = ghost; }
  }
}
function chTouchStart(e, i){ /* selection handled by pointerdown; prevent scroll while dragging piece */
  if (chDragFrom !== null && chDragFrom === i) e.preventDefault();
}
function chTouchMove(e){
  if (chDragFrom === null) return;
  const t = e.touches[0];
  if (chDragGhost){
    chDragGhost.style.position = 'fixed';
    chDragGhost.style.left = (t.clientX - 22) + 'px';
    chDragGhost.style.top = (t.clientY - 22) + 'px';
    chDragGhost.style.fontSize = '9vmin';
    chDragGhost.style.zIndex = '99';
    chDragGhost.style.pointerEvents = 'none';
  }
  e.preventDefault();
}
function chTouchEnd(e, i){
  if (chDragFrom === null) return;
  const t = e.changedTouches[0];
  const el = document.elementFromPoint(t.clientX, t.clientY);
  if (chDragGhost){ chDragGhost.classList.remove('dragging'); chDragGhost.style.cssText = ''; chDragGhost = null; }
  const from = chDragFrom; chDragFrom = null;
  const sq = el && (el.closest ? el.closest('.ch-sq') : null);
  if (sq && sq.dataset && sq.dataset.i !== undefined){
    const to = Number(sq.dataset.i);
    if (to !== from && chLegalTargets(from).some(m => m.to === to)) chTryMove(from, to);
  }
}
/* mouse drag via pointer capture */
document.addEventListener('pointermove', e => {
  if (chDragFrom === null || e.pointerType === 'touch') return;
  if (chDragGhost){
    chDragGhost.style.position = 'fixed';
    chDragGhost.style.left = (e.clientX - 22) + 'px';
    chDragGhost.style.top = (e.clientY - 22) + 'px';
    chDragGhost.style.fontSize = '9vmin';
    chDragGhost.style.zIndex = '99';
    chDragGhost.style.pointerEvents = 'none';
  }
});
document.addEventListener('pointerup', e => {
  if (chDragFrom === null || e.pointerType === 'touch') return;
  if (chDragGhost){ chDragGhost.classList.remove('dragging'); chDragGhost.style.cssText = ''; chDragGhost = null; }
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const from = chDragFrom; chDragFrom = null;
  const sq = el && (el.closest ? el.closest('.ch-sq') : null);
  if (sq && sq.dataset && sq.dataset.i !== undefined){
    const to = Number(sq.dataset.i);
    if (to !== from && chLegalTargets(from).some(m => m.to === to)) chTryMove(from, to);
  }
});

'''
r = r[:start] + new_chess + r[end:]

# remove old chArmDrag stub + inline re-arm script
r = r.replace("""function chArmDrag(){
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

""", "")
r = r.replace("""    + '<script>chArmDrag&&chArmDrag()<' + '/script>';""", "")
open('public/room.js','w',encoding='utf-8').write(r)
print('chess UI rebuilt')
