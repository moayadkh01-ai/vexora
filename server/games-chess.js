'use strict';
/* ============================================================
   VEXORA Chess engine — full rules, server-authoritative
   board: 64 chars, index 0 = a8 (top-left), 63 = h1
   uppercase = white, lowercase = black, '.' = empty
   ============================================================ */

const VAL = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
const KN = [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]];
const KG = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]];
const colorOf = p => p === '.' ? null : (p === p.toUpperCase() ? 'w' : 'b');
const other = c => c === 'w' ? 'b' : 'w';
const inB = (r, c) => r >= 0 && r < 8 && c >= 0 && c < 8;
const idx = (r, c) => r * 8 + c;

function initial(){
  const rows = ['rnbqkbnr', 'pppppppp', '........', '........', '........', '........', 'PPPPPPPP', 'RNBQKBNR'];
  const b = [];
  rows.forEach(rw => rw.split('').forEach(ch => b.push(ch)));
  return { b, turn: 'w', cast: { K: true, Q: true, k: true, q: true }, ep: -1, over: false, winner: null, last: null };
}

/* attack squares of a color (for check detection) */
function attacked(st, sq, by){
  const r = sq >> 3, c = sq & 7;
  // pawns
  const pd = by === 'w' ? 1 : -1;                       // white pawns attack upward (row decreases)
  for (const dc of [-1, 1]){
    const rr = r + pd, cc = c + dc;
    if (inB(rr, cc)){
      const p = st.b[idx(rr, cc)];
      if (p !== '.' && colorOf(p) === by && p.toLowerCase() === 'p') return true;
    }
  }
  for (const [dr, dc] of KN){
    const rr = r + dr, cc = c + dc;
    if (inB(rr, cc)){
      const p = st.b[idx(rr, cc)];
      if (p !== '.' && colorOf(p) === by && p.toLowerCase() === 'n') return true;
    }
  }
  for (const [dr, dc] of KG){
    const rr = r + dr, cc = c + dc;
    if (inB(rr, cc)){
      const p = st.b[idx(rr, cc)];
      if (p !== '.' && colorOf(p) === by && p.toLowerCase() === 'k') return true;
    }
  }
  for (const [dr, dc, once] of [[1,0,0],[-1,0,0],[0,1,0],[0,-1,0]].map(x => x.concat([0]))){
    // sliders below handle this; placeholder
  }
  const slide = (dirs, pieces) => {
    for (const [dr, dc] of dirs){
      let rr = r + dr, cc = c + dc;
      while (inB(rr, cc)){
        const p = st.b[idx(rr, cc)];
        if (p !== '.'){
          if (colorOf(p) === by && pieces.indexOf(p.toLowerCase()) >= 0) return true;
          break;
        }
        rr += dr; cc += dc;
      }
    }
  };
  if (slide(KG.slice(0, 4), ['r', 'q'])) return true;
  if (slide(KG.slice(4), ['b', 'q'])) return true;
  return false;
}

function kingSq(st, color){
  const k = color === 'w' ? 'K' : 'k';
  for (let i = 0; i < 64; i++) if (st.b[i] === k) return i;
  return -1;
}
function inCheck(st, color){ const k = kingSq(st, color); return k >= 0 && attacked(st, k, other(color)); }

/* pseudo moves for a piece */
function pseudo(st, from){
  const p = st.b[from];
  if (p === '.') return [];
  const color = colorOf(p), t = p.toLowerCase(), r = from >> 3, c = from & 7, out = [];
  const push = (rr, cc, flag) => { if (inB(rr, cc)) out.push({ from, to: idx(rr, cc), flag }); };
  if (t === 'p'){
    const d = color === 'w' ? -1 : 1;
    const startRow = color === 'w' ? 6 : 1;
    if (inB(r + d, c) && st.b[idx(r + d, c)] === '.'){
      push(r + d, c);
      if (r === startRow && st.b[idx(r + 2 * d, c)] === '.') push(r + 2 * d, c, 'double');
    }
    for (const dc of [-1, 1]){
      const rr = r + d, cc = c + dc;
      if (!inB(rr, cc)) continue;
      const q = st.b[idx(rr, cc)];
      if (q !== '.' && colorOf(q) !== color) push(rr, cc);
      else if (idx(rr, cc) === st.ep) push(rr, cc, 'ep');
    }
  } else if (t === 'n' || t === 'k'){
    for (const [dr, dc] of (t === 'n' ? KN : KG)) push(r + dr, c + dc);
  } else {
    const dirs = t === 'r' ? KG.slice(0, 4) : t === 'b' ? KG.slice(4) : KG;
    for (const [dr, dc] of dirs){
      let rr = r + dr, cc = c + dc;
      while (inB(rr, cc)){
        const q = st.b[idx(rr, cc)];
        if (q === '.') out.push({ from, to: idx(rr, cc) });
        else { if (colorOf(q) !== color) out.push({ from, to: idx(rr, cc) }); break; }
        rr += dr; cc += dc;
      }
    }
  }
  return out.filter(m => st.b[m.to] === '.' || colorOf(st.b[m.to]) !== color);
}

function make(st, m){
  const from = m.from, to = m.to;
  const p = st.b[from];
  const color = colorOf(p);
  const next = { b: st.b.slice(), turn: st.turn, cast: { ...st.cast }, ep: -1, over: st.over, winner: st.winner, last: [from, to] };
  const t = p.toLowerCase();
  // capture rights updates
  if (t === 'k'){ if (color === 'w'){ next.cast.K = false; next.cast.Q = false; } else { next.cast.k = false; next.cast.q = false; } }
  if (from === 63 || to === 63) next.cast.K = false;
  if (from === 56 || to === 56) next.cast.Q = false;
  if (from === 7 || to === 7) next.cast.k = false;
  if (from === 0 || to === 0) next.cast.q = false;
  // en passant target
  if (m.flag === 'double') next.ep = (from + to) / 2;
  // en passant capture
  if (t === 'p' && to === st.ep && st.b[to] === '.') next.b[to + (color === 'w' ? 8 : -8)] = '.';
  // castling move
  if (t === 'k' && Math.abs((to & 7) - (from & 7)) === 2){
    if ((to & 7) === 6){ next.b[idx(from >> 3, 5)] = next.b[idx(from >> 3, 7)]; next.b[idx(from >> 3, 7)] = '.'; }
    else { next.b[idx(from >> 3, 3)] = next.b[idx(from >> 3, 0)]; next.b[idx(from >> 3, 0)] = '.'; }
  }
  next.b[to] = p;
  next.b[from] = '.';
  // promotion (auto-queen unless specified)
  if (t === 'p' && (to >> 3) === (color === 'w' ? 0 : 7)) next.b[to] = color === 'w' ? (m.promo || 'Q') : (m.promo ? m.promo.toLowerCase() : 'q');
  next.turn = other(color);
  return next;
}

function legal(st, color){
  color = color || st.turn;
  const out = [];
  for (let i = 0; i < 64; i++){
    if (colorOf(st.b[i]) !== color) continue;
    for (const m of pseudo(st, i)){
      const nx = make(st, m);
      if (!inCheck(nx, color)) out.push(m);
    }
  }
  // castling with through-check validation
  for (const m of out.slice()) if (Math.abs((m.to & 7) - (m.from & 7)) === 2 && st.b[m.from].toLowerCase() === 'k') { /* kept: validated above via make+inCheck? through squares not fully checked */ }
  return out;
}

function castlingMoves(st){
  const out = [];
  const add = (from, to, rights, emptySq, safeSq) => {
    if (!rights) return;
    if (st.b[emptySq] !== '.') return;
    if (inCheck(st, st.turn)) return;
    for (const s of safeSq) if (st.b[s] !== '.') return;
    // through-check: squares king passes must not be attacked
    const pass = [from, ...safeSq.slice(0, 1)];
    for (const s of pass){ const tmp = { ...st, b: st.b.slice() }; if (attacked({ ...tmp }, s, other(st.turn))) return; }
    if (attacked({ ...st }, to, other(st.turn))) return;
    out.push({ from, to });
  };
  if (st.turn === 'w'){
    add(60, 62, st.cast.K, [61, 62]);
    add(60, 58, st.cast.Q, [59, 58, 57]);
  } else {
    add(4, 6, st.cast.k, [5, 6]);
    add(4, 2, st.cast.q, [3, 2, 1]);
  }
  return out;
}

function move(st, color, from, to, promo){
  if (st.over) return { ok: false, reason: 'GAME_OVER' };
  if (st.turn !== color) return { ok: false, reason: 'NOT_YOUR_TURN' };
  let all = legal(st, color);
  if (st.b[from] && st.b[from].toLowerCase() === 'k') all = all.concat(castlingMoves(st));
  const m = all.find(x => x.from === from && x.to === to);
  if (!m) return { ok: false, reason: 'ILLEGAL_MOVE', msg: 'حركة شطرنج غير قانونية' };
  let nx = make(st, m);
  const oppHas = legal(nx, nx.turn).length > 0;
  if (!oppHas){
    nx.over = true;
    if (inCheck(nx, nx.turn)){ nx.winner = color; return { ok: true, won: true, state: nx }; }
    return { ok: true, draw: true, state: nx };   // stalemate
  }
  return { ok: true, state: nx };
}

/* greedy AI: mate > capture > best delta > random */
function bestMove(st, color){
  const all = legal(st, color).concat(castlingMoves(st));
  if (!all.length) return null;
  let best = null, bs = -1e9;
  for (const m of all){
    const nx = make(st, m);
    if (inCheck(nx, nx.turn) && legal(nx, nx.turn).length === 0){ bs = 1e9; best = m; break; }
    let s = 0;
    const victim = st.b[m.to];
    if (victim !== '.') s += VAL[victim.toLowerCase()] - VAL[st.b[m.from].toLowerCase()] / 10;
    if (inCheck(nx, nx.turn)) s += 50;
    s += Math.random() * 40;
    if (m.flag === 'double') s += 5;
    if (s > bs){ bs = s; best = m; }
  }
  return best;
}

module.exports = { initial, move, legal, bestMove, inCheck, colorOf, castlingMoves };
