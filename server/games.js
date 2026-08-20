'use strict';
/* ============================================================
   VEXORA — Game engines (server-authoritative)
   Each engine exposes:
     newState()                    → fresh state (JSON-safe)
     valid(body)                   → normalized move | null (invalid)
     apply(state, slot, move)      → {ok, reason?, won?, draw?}
     legal(state)                  → legal moves for state.turn (or null)
     ai(state)                     → server-AI move | null
   The board lives ONLY on the server.
   ============================================================ */
const { now } = require('./db');

/* ============================================================
   ENGINE: VEXORA Connect (four-in-a-row) — 7×6
   move: integer column 0-6
   ============================================================ */
const C4 = {
  newState(){
    return { b: Array.from({ length: 6 }, () => new Array(7).fill(0)), turn: 1, over: false, winner: 0, win: [], last: null };
  },
  valid(body){
    const c = Number(body && body.col);
    return Number.isInteger(c) && c >= 0 && c <= 6 ? c : null;
  },
  apply(state, slot, col){
    if (state.over) return { ok: false, reason: 'GAME_OVER' };
    if (state.turn !== slot) return { ok: false, reason: 'NOT_YOUR_TURN' };
    if (!Number.isInteger(col) || col < 0 || col > 6) return { ok: false, reason: 'BAD_COLUMN' };
    let row = -1;
    for (let r = 5; r >= 0; r--){ if (state.b[r][col] === 0){ row = r; break; } }
    if (row < 0) return { ok: false, reason: 'COLUMN_FULL' };
    state.b[row][col] = slot;
    state.last = [row, col];
    const win = c4Win(state.b, slot);
    if (win){ state.over = true; state.winner = slot; state.win = win; return { ok: true, won: true }; }
    if (state.b.every(rw => rw.every(v => v !== 0))){ state.over = true; state.winner = 0; return { ok: true, draw: true }; }
    state.turn = slot === 1 ? 2 : 1;
    return { ok: true };
  },
  legal(state){
    const out = [];
    for (let c = 0; c < 7; c++) if (state.b[0][c] === 0) out.push(c);
    return out;
  },
  ai(state){
    const order = [3, 2, 4, 1, 5, 0, 6];
    for (const p of [2, 1]){                       // win first, then block
      for (const c of order){
        const t = { b: state.b.map(r => r.slice()), turn: p, over: false };
        if (C4._silentWin(t, p, c)) return c;
      }
    }
    const open = order.filter(c => state.b[0][c] === 0);
    return open.length ? open[Math.floor(Math.random() * open.length)] : null;
  },
  _silentWin(t, p, c){
    let row = -1;
    for (let r = 5; r >= 0; r--){ if (t.b[r][c] === 0){ row = r; break; } }
    if (row < 0) return false;
    t.b[row][c] = p;
    return !!c4Win(t.b, p);
  }
};
function c4Win(b, p){
  const dirs = [[0,1],[1,0],[1,1],[1,-1]];
  for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++){
    for (const d of dirs){
      const cells = [[r,c]];
      for (let k = 1; k < 4; k++){
        const rr = r + d[0]*k, cc = c + d[1]*k;
        if (rr < 0 || rr > 5 || cc < 0 || cc > 6 || b[rr][cc] !== p) break;
        cells.push([rr,cc]);
      }
      if (cells.length === 4) return cells;
    }
  }
  return null;
}

/* ============================================================
   ENGINE: VEXORA Reversi (أوثيلو) — 8×8
   move: [row, col]  ·  p1 = black (first), p2 = white
   Auto-pass when a player has no legal moves; game ends when
   both pass consecutively or the board fills. Winner = majority.
   ============================================================ */
const RV_DIRS = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
const RV_W = [
  [120,-20, 20,  5,  5, 20,-20,120],
  [-20,-40, -5, -5, -5, -5,-40,-20],
  [ 20, -5, 15,  3,  3, 15, -5, 20],
  [  5, -5,  3,  3,  3,  3, -5,  5],
  [  5, -5,  3,  3,  3,  3, -5,  5],
  [ 20, -5, 15,  3,  3, 15, -5,  20],
  [-20,-40, -5, -5, -5, -5,-40,-20],
  [120,-20, 20,  5,  5, 20,-20,120]
];
function rvFlips(b, r, c, p){
  if (r < 0 || r > 7 || c < 0 || c > 7 || b[r][c] !== 0) return null;
  const all = [];
  for (const d of RV_DIRS){
    const line = [];
    let rr = r + d[0], cc = c + d[1];
    while (rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr][cc] === 3 - p){ line.push([rr, cc]); rr += d[0]; cc += d[1]; }
    if (line.length && rr >= 0 && rr < 8 && cc >= 0 && cc < 8 && b[rr][cc] === p) all.push.apply(all, line);
  }
  return all.length ? all : null;
}
const RV = {
  newState(){
    const b = Array.from({ length: 8 }, () => new Array(8).fill(0));
    b[3][3] = 2; b[3][4] = 1; b[4][3] = 1; b[4][4] = 2;
    return { b, turn: 1, over: false, winner: 0, win: [], last: null, passes: 0 };
  },
  valid(body){
    const r = Number(body && body.r), c = Number(body && body.c);
    return (Number.isInteger(r) && Number.isInteger(c) && r >= 0 && r < 8 && c >= 0 && c < 8) ? [r, c] : null;
  },
  apply(state, slot, m){
    if (state.over) return { ok: false, reason: 'GAME_OVER' };
    if (state.turn !== slot) return { ok: false, reason: 'NOT_YOUR_TURN' };
    const [r, c] = m;
    const flips = rvFlips(state.b, r, c, slot);
    if (!flips) return { ok: false, reason: 'ILLEGAL_MOVE', msg: 'هذه الحركة غير قانونية في أوثيلو' };
    state.b[r][c] = slot;
    flips.forEach(f => { state.b[f[0]][f[1]] = slot; });
    state.last = [r, c];
    state.passes = 0;
    state.turn = 3 - slot;
    const full = state.b.every(row => row.every(v => v !== 0));
    if (full) return RV._finish(state);
    return { ok: true };
  },
  legal(state){
    const out = [];
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++){
      if (state.b[r][c] === 0 && rvFlips(state.b, r, c, state.turn)) out.push([r, c]);
    }
    return out;
  },
  ai(state){
    const moves = RV.legal(state);
    if (!moves.length) return null;
    let best = null, bestScore = -1e9;
    for (const m of moves){
      const flips = rvFlips(state.b, m[0], m[1], state.turn).length;
      const score = RV_W[m[0]][m[1]] * 10 - flips * 2 + Math.random() * 8;
      if (score > bestScore){ bestScore = score; best = m; }
    }
    return best;
  },
  _finish(state){
    let c1 = 0, c2 = 0;
    state.b.forEach(row => row.forEach(v => { if (v === 1) c1++; else if (v === 2) c2++; }));
    state.over = true;
    state.winner = c1 > c2 ? 1 : c2 > c1 ? 2 : 0;
    return state.winner === 0 ? { ok: true, draw: true } : { ok: true, won: true };
  },
  counts(state){
    let c1 = 0, c2 = 0;
    state.b.forEach(row => row.forEach(v => { if (v === 1) c1++; else if (v === 2) c2++; }));
    return [c1, c2];
  }
};

/* ============================================================
   ENGINE: VEXORA Chess (شطرنج) — move: {from, to} (0-63)
   p1 = white (host), p2 = black
   ============================================================ */
const CH = require('./games-chess');
const CHESS = {
  newState(){ return CH.initial(); },
  valid(b){
    const f = Number(b && b.from), t = Number(b && b.to);
    return (Number.isInteger(f) && f >= 0 && f < 64 && Number.isInteger(t) && t >= 0 && t < 64) ? { from: f, to: t, promo: b.promo } : null;
  },
  apply(st, slot, m){
    const res = CH.move(st, slot === 1 ? 'w' : 'b', m.from, m.to, m.promo);
    if (!res.ok) return res;
    Object.assign(st, res.state);
    if (res.won){ st.winner = slot; return { ok: true, won: true }; }
    if (res.draw){ st.winner = 0; return { ok: true, draw: true }; }
    return { ok: true };
  },
  legal(st){ return CH.legal(st).concat(CH.castlingMoves(st)); },
  ai(st){ const m = CH.bestMove(st, st.turn); return m ? { from: m.from, to: m.to } : null; }
};

/* ============================================================
   ENGINE: VEXORA Backgammon (طاولة الزهر) — move: {from, to}
   ============================================================ */
const BG = require('./games-bg');
const TABLA = {
  newState(){ return BG.initial(); },
  valid(b){
    const f = Number(b && b.from), t = Number(b && b.to);
    return (Number.isInteger(f) && f >= 0 && f <= 25 && Number.isInteger(t) && t >= 0 && t <= 25) ? { from: f, to: t } : null;
  },
  apply(st, slot, m){
    const res = BG.apply(st, slot, m);
    if (!res.ok) return res;
    Object.assign(st, res.state);
    if (res.won) return { ok: true, won: true };
    return { ok: true };
  },
  legal(st){ return BG.legal(st); },
  ai(st){ return BG.ai(st); }
};

/* ============================================================
   ENGINE: VEXORA 8-Ball Pool (بلياردو ٨) — shot: {angle°, power 1-100}
   server-authoritative physics (shared module with the client)
   ============================================================ */
const P = require('../public/pool-physics');
const POOL = {
  newState(){
    return { balls: P.rackPositions(), turn: 1, over: false, winner: 0, groups: { 1: null, 2: null }, last: null, lastShot: null };
  },
  valid(b){
    const a = Number(b && b.angle), p = Number(b && b.power);
    return (Number.isFinite(a) && Number.isFinite(p) && p >= 1 && p <= 100) ? { angle: a, power: p } : null;
  },
  apply(st, slot, shot){
    if (st.over) return { ok: false, reason: 'GAME_OVER' };
    if (st.turn !== slot) return { ok: false, reason: 'NOT_YOUR_TURN' };
    if (!P.allStopped(st.balls)) return { ok: false, reason: 'BALLS_MOVING' };
    const before = new Set(st.balls.filter(x => x.pocketed).map(x => x.id));
    const cue = st.balls.find(x => x.id === 0);
    if (!cue) return { ok: false, reason: 'NO_CUE' };
    const speed = shot.power * 0.062;
    const rad = shot.angle * Math.PI / 180;
    cue.vx = Math.cos(rad) * speed;
    cue.vy = Math.sin(rad) * speed;
    st.lastShot = { by: slot, angle: shot.angle, power: shot.power };
    st.last = null;
    P.simulate(st.balls, 1500);
    const pocketedNow = st.balls.filter(x => x.pocketed && !before.has(x.id)).map(x => x.id);
    const cueIn = pocketedNow.indexOf(0) >= 0;
    const pocketedBalls = pocketedNow.filter(id => id !== 0);
    // re-spot cue ball
    if (cueIn){
      cue.pocketed = false; cue.vx = 0; cue.vy = 0;
      let x = P.W * 0.25, y = P.H / 2;
      while (st.balls.some(b => !b.pocketed && b.id !== 0 && Math.abs(b.x - x) < 2.8 && Math.abs(b.y - y) < 2.8)) x += 3;
      cue.x = x; cue.y = y;
    }
    // group assignment (first legal pocket after break)
    const first = pocketedBalls.find(id => id !== 8);
    if (st.groups[1] === null && first !== undefined && !cueIn){
      const g1 = first < 8 ? 'solid' : 'stripe';
      st.groups[1] = g1;
      st.groups[2] = g1 === 'solid' ? 'stripe' : 'solid';
    }
    // 8-ball win/lose
    if (pocketedBalls.indexOf(8) >= 0){
      const g = st.groups[slot] || 'solid';
      const remaining = st.balls.filter(b => b.id !== 0 && b.id !== 8 && !b.pocketed &&
        ((g === 'solid' && b.id < 8) || (g === 'stripe' && b.id > 8))).length;
      st.over = true;
      st.winner = (remaining === 0 && !cueIn) ? slot : 3 - slot;
      return st.winner === slot ? { ok: true, won: true } : { ok: true, won: true };  // game over either way
    }
    // continue turn?
    const g = st.groups[slot];
    const ownPot = g && pocketedBalls.some(id => (g === 'solid' ? id < 8 : id > 8));
    const keep = !cueIn && (ownPot || (!g && pocketedBalls.length > 0));
    if (!keep) st.turn = 3 - slot;
    st.last = [Math.round(cue.x), Math.round(cue.y)];
    return { ok: true };
  },
  legal(st){ return null; },
  ai(st){
    const mine = g => st.balls.filter(b => !b.pocketed && b.id !== 0 && (g ? (g === 'solid' ? b.id < 8 : b.id > 8) : true));
    const g = st.groups[2];
    let targets = mine(g && g !== undefined ? g : null);
    const cue = st.balls.find(x => x.id === 0);
    if (!targets.length) targets = st.balls.filter(b => !b.pocketed && b.id !== 0);
    if (!targets.length) return null;
    const t = targets[Math.floor(Math.random() * Math.min(3, targets.length))];
    const pk = P.POCKETS[Math.floor(Math.random() * 6)];
    const dx = t.x - pk.x, dy = t.y - pk.y;
    const dl = Math.sqrt(dx * dx + dy * dy) || 1;
    const aimX = t.x + dx / dl * 2 * P.R, aimY = t.y + dy / dl * 2 * P.R;
    let ang = Math.atan2(aimY - cue.y, aimX - cue.x) * 180 / Math.PI;
    ang += (Math.random() * 7 - 3.5);                                     // human-ish error
    return { angle: ang, power: 40 + Math.random() * 25 };
  }
};

/* ============================================================
   Catalog
   ============================================================ */
const GAMES = {
  connect4:  { id: 'connect4',  name_ar: 'فيكسورا كونكت', name_en: 'VEXORA Connect',  entry: true,  engine: C4 },
  reversi:   { id: 'reversi',   name_ar: 'أوثيلو',        name_en: 'VEXORA Reversi',  entry: true,  engine: RV },
  pool8:     { id: 'pool8',     name_ar: 'بلياردو ٨',     name_en: 'VEXORA 8-Ball',   entry: true,  engine: POOL },
  chess:     { id: 'chess',     name_ar: 'شطرنج',         name_en: 'VEXORA Chess',    entry: true,  engine: CHESS },
  backgammon:{ id: 'backgammon',name_ar: 'طاولة الزهر',   name_en: 'VEXORA Backgammon', entry: true,  engine: TABLA },
  checkers:  { id: 'checkers',  name_ar: 'دامة',          name_en: 'VEXORA Checkers', entry: false, soon: true },
  durak:     { id: 'durak',     name_ar: 'دوراك',         name_en: 'VEXORA Durak',    entry: false, soon: true },
  domino:    { id: 'domino',    name_ar: 'دومينو',        name_en: 'VEXORA Domino',   entry: false, soon: true },
  rummy:     { id: 'rummy',     name_ar: 'رامي',          name_en: 'VEXORA Rummy',    entry: false, soon: true },
  darts:     { id: 'darts',     name_ar: 'دارتس',         name_en: 'VEXORA Darts',    entry: false, soon: true },
  pool9:     { id: 'pool9',     name_ar: 'بلياردو ٩',     name_en: 'VEXORA 9-Ball',   entry: false, soon: true }
};

const engineOf = game => (GAMES[game] && GAMES[game].engine) || C4;
const newState = game => engineOf(game).newState();
const validMove = (game, body) => { const v = engineOf(game).valid(body); return v === null ? { err: 'BAD_MOVE', msg: 'حركة غير صالحة' } : { ok: true, move: v }; };

module.exports = { GAMES, newState, validMove, engineOf, C4, RV, rvFlips, CHESS, TABLA, POOL, CH, BG, P };
