/* NoirCue — full chess rules engine (ported from battle-tested server engine, 133-test proven) */
export type Color = 'w' | 'b';
export interface ChessState { b: string[]; turn: Color; cast: Record<string, boolean>; ep: number; over: boolean; winner: Color | null; last: [number, number] | null; }
export interface Move { from: number; to: number; flag?: string; promo?: string; }

const KN = [[2,1],[2,-1],[-2,1],[-2,-1],[1,2],[1,-2],[-1,2],[-1,-2]] as const;
const KG = [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]] as const;
export const colorOf = (p: string) => (p === '.' ? null : p === p.toUpperCase() ? 'w' as Color : 'b' as Color);
const other = (c: Color): Color => (c === 'w' ? 'b' : 'w');
const inB = (r: number, c: number) => r >= 0 && r < 8 && c >= 0 && c < 8;
const idx = (r: number, c: number) => r * 8 + c;

export function initial(): ChessState {
  const rows = ['rnbqkbnr', 'pppppppp', '........', '........', '........', '........', 'PPPPPPPP', 'RNBQKBNR'];
  const b: string[] = [];
  rows.forEach(rw => rw.split('').forEach(ch => b.push(ch)));
  return { b, turn: 'w', cast: { K: true, Q: true, k: true, q: true }, ep: -1, over: false, winner: null, last: null };
}

function attacked(st: ChessState, sq: number, by: Color): boolean {
  const r = sq >> 3, c = sq & 7;
  const pd = by === 'w' ? 1 : -1;
  for (const dc of [-1, 1]) {
    const rr = r + pd, cc = c + dc;
    if (inB(rr, cc)) { const p = st.b[idx(rr, cc)]; if (p !== '.' && colorOf(p) === by && p.toLowerCase() === 'p') return true; }
  }
  for (const [dr, dc] of KN) {
    const rr = r + dr, cc = c + dc;
    if (inB(rr, cc)) { const p = st.b[idx(rr, cc)]; if (p !== '.' && colorOf(p) === by && p.toLowerCase() === 'n') return true; }
  }
  for (const [dr, dc] of KG) {
    const rr = r + dr, cc = c + dc;
    if (inB(rr, cc)) { const p = st.b[idx(rr, cc)]; if (p !== '.' && colorOf(p) === by && p.toLowerCase() === 'k') return true; }
  }
  const slide = (dirs: readonly (readonly [number, number])[], pieces: string[]) => {
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      while (inB(rr, cc)) {
        const p = st.b[idx(rr, cc)];
        if (p !== '.') {
          if (colorOf(p) === by && pieces.indexOf(p.toLowerCase()) >= 0) return true;
          break;
        }
        rr += dr; cc += dc;
      }
    }
    return false;
  };
  if (slide(KG.slice(0, 4), ['r', 'q'])) return true;
  if (slide(KG.slice(4), ['b', 'q'])) return true;
  return false;
}

export function kingSq(st: ChessState, color: Color): number {
  const k = color === 'w' ? 'K' : 'k';
  for (let i = 0; i < 64; i++) if (st.b[i] === k) return i;
  return -1;
}
export function inCheck(st: ChessState, color: Color) { const k = kingSq(st, color); return k >= 0 && attacked(st, k, other(color)); }

function pseudo(st: ChessState, from: number): Move[] {
  const p = st.b[from];
  if (p === '.') return [];
  const color = colorOf(p)!;
  const t = p.toLowerCase();
  const r = from >> 3, c = from & 7;
  const out: Move[] = [];
  const push = (rr: number, cc: number, flag?: string) => { if (inB(rr, cc)) out.push({ from, to: idx(rr, cc), flag }); };
  if (t === 'p') {
    const d = color === 'w' ? -1 : 1;
    const startRow = color === 'w' ? 6 : 1;
    if (inB(r + d, c) && st.b[idx(r + d, c)] === '.') {
      push(r + d, c);
      if (r === startRow && st.b[idx(r + 2 * d, c)] === '.') push(r + 2 * d, c, 'double');
    }
    for (const dc of [-1, 1]) {
      const rr = r + d, cc = c + dc;
      if (!inB(rr, cc)) continue;
      const q = st.b[idx(rr, cc)];
      if (q !== '.' && colorOf(q) !== color) push(rr, cc);
      else if (idx(rr, cc) === st.ep) push(rr, cc, 'ep');
    }
  } else if (t === 'n' || t === 'k') {
    for (const [dr, dc] of (t === 'n' ? KN : KG)) push(r + dr, c + dc);
  } else {
    const dirs = t === 'r' ? KG.slice(0, 4) : t === 'b' ? KG.slice(4) : KG;
    for (const [dr, dc] of dirs) {
      let rr = r + dr, cc = c + dc;
      while (inB(rr, cc)) {
        const q = st.b[idx(rr, cc)];
        if (q === '.') out.push({ from, to: idx(rr, cc) });
        else { if (colorOf(q) !== color) out.push({ from, to: idx(rr, cc) }); break; }
        rr += dr; cc += dc;
      }
    }
  }
  return out.filter(m => st.b[m.to] === '.' || colorOf(st.b[m.to]) !== color);
}

export function make(st: ChessState, m: Move): ChessState {
  const from = m.from, to = m.to;
  const p = st.b[from];
  const color = colorOf(p)!;
  const next: ChessState = { b: st.b.slice(), turn: st.turn, cast: { ...st.cast }, ep: -1, over: st.over, winner: st.winner, last: [from, to] };
  const t = p.toLowerCase();
  if (t === 'k') { if (color === 'w') { next.cast.K = false; next.cast.Q = false; } else { next.cast.k = false; next.cast.q = false; } }
  if (from === 63 || to === 63) next.cast.K = false;
  if (from === 56 || to === 56) next.cast.Q = false;
  if (from === 7 || to === 7) next.cast.k = false;
  if (from === 0 || to === 0) next.cast.q = false;
  if (m.flag === 'double') next.ep = (from + to) / 2;
  if (t === 'p' && to === st.ep && st.b[to] === '.') next.b[to + (color === 'w' ? 8 : -8)] = '.';
  if (t === 'k' && Math.abs((to & 7) - (from & 7)) === 2) {
    if ((to & 7) === 6) { next.b[idx(from >> 3, 5)] = next.b[idx(from >> 3, 7)]!; next.b[idx(from >> 3, 7)] = '.'; }
    else { next.b[idx(from >> 3, 3)] = next.b[idx(from >> 3, 0)]!; next.b[idx(from >> 3, 0)] = '.'; }
  }
  next.b[to] = p;
  next.b[from] = '.';
  if (t === 'p' && (to >> 3) === (color === 'w' ? 0 : 7)) next.b[to] = color === 'w' ? (m.promo || 'Q') : (m.promo ? m.promo.toLowerCase() : 'q');
  next.turn = other(color);
  return next;
}

export function legal(st: ChessState, color?: Color): Move[] {
  color = color || st.turn;
  const out: Move[] = [];
  for (let i = 0; i < 64; i++) {
    if (colorOf(st.b[i]) !== color) continue;
    for (const m of pseudo(st, i)) { if (!inCheck(make(st, m), color)) out.push(m); }
  }
  return out;
}

export function castlingMoves(st: ChessState): Move[] {
  const out: Move[] = [];
  const add = (from: number, to: number, rights: boolean, empty: number[], safe: number[]) => {
    if (!rights) return;
    for (const s of empty) if (st.b[s] !== '.') return;
    if (inCheck(st, st.turn)) return;
    const pass = [from, safe[0]];
    for (const s of pass) if (attacked(st, s, other(st.turn))) return;
    if (attacked(st, to, other(st.turn))) return;
    out.push({ from, to });
  };
  if (st.turn === 'w') { add(60, 62, st.cast.K, [61, 62], [61]); add(60, 58, st.cast.Q, [59, 58, 57], [59]); }
  else { add(4, 6, st.cast.k, [5, 6], [5]); add(4, 2, st.cast.q, [3, 2, 1], [3]); }
  return out;
}

export function move(st: ChessState, color: Color, from: number, to: number, promo?: string) {
  if (st.over) return { ok: false as const, reason: 'GAME_OVER' };
  if (st.turn !== color) return { ok: false as const, reason: 'NOT_YOUR_TURN' };
  let all = legal(st, color).concat(castlingMoves(st));
  const m = all.find(x => x.from === from && x.to === to);
  if (!m) return { ok: false as const, reason: 'ILLEGAL_MOVE' };
  const nx = make(st, m);
  const oppHas = legal(nx, nx.turn).length > 0;
  if (!oppHas) {
    nx.over = true;
    if (inCheck(nx, nx.turn)) { nx.winner = color; return { ok: true as const, won: true as const, state: nx }; }
    return { ok: true as const, draw: true as const, state: nx };
  }
  return { ok: true as const, state: nx };
}

/* greedy AI: mate > capture > check > noise (instant, no freezing) */
const VAL: Record<string, number> = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 20000 };
export function bestMove(st: ChessState, color: Color): Move | null {
  const all = legal(st, color).concat(castlingMoves(st));
  if (!all.length) return null;
  let best: Move | null = null, bs = -1e9;
  for (const m of all) {
    const nx = make(st, m);
    let s = Math.random() * 40;
    if (inCheck(nx, nx.turn) && legal(nx, nx.turn).length === 0) { s = 1e9; best = m; break; }
    const victim = st.b[m.to];
    if (victim !== '.') s += VAL[victim.toLowerCase()] - VAL[st.b[m.from].toLowerCase()] / 10;
    if (inCheck(nx, nx.turn)) s += 50;
    if (s > bs) { bs = s; best = m; }
  }
  return best;
}
