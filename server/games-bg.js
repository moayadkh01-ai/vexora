'use strict';
/* ============================================================
   VEXORA Backgammon (طاولة الزهر) — server-authoritative
   points[1..24]: +n = white checkers, -n = black checkers
   White moves 24 → 1 (home 1-6), black moves 1 → 24 (home 19-24)
   Dice auto-rolled server-side at turn start; if a player has no
   legal move the turn passes automatically.
   move: {from, to}  · from 25 = bar (entry)  · to 0 = bear off
   ============================================================ */

const START = [0, 2, 0, 0, 0, 0, -5, 0, -3, 0, 0, 0, 5, -5, 0, 0, 0, 3, 0, 5, 0, 0, 0, 0, -2];
// index:      0  1  2  3  4  5   6  7   8  9 10 11 12  13 14 15 16 17 18 19 20 21 22 23 24
// white: 24:2? standard start — let me place: white on 24(2),13(5),8(3),6(5) — black mirror 1(2),12(5),17(3),19(5)

function initialBoard(){
  const pts = new Array(25).fill(0);
  // white (positive): 24→1 direction
  pts[24] += 2; pts[13] += 5; pts[8] += 3; pts[6] += 5;
  // black (negative): 1→24 direction
  pts[1] -= 2; pts[12] -= 5; pts[17] -= 3; pts[19] -= 5;
  return pts;
}

function roll(){
  const d1 = 1 + Math.floor(Math.random() * 6);
  const d2 = 1 + Math.floor(Math.random() * 6);
  return d1 === d2 ? [d1, d1, d1, d1] : [d1, d2];
}

function initial(){
  return { pts: initialBoard(), wBar: 0, bBar: 0, wOff: 0, bOff: 0, turn: 1, dice: roll(), over: false, winner: 0, last: null };
}

function colorCount(st, pt, white){
  const v = st.pts[pt];
  return white ? Math.max(0, v) : Math.max(0, -v);
}

function homeComplete(st, white){
  if (white ? st.wBar : st.bBar) return false;
  const [lo, hi] = white ? [1, 6] : [19, 24];
  for (let p = 1; p <= 24; p++){
    if (p >= lo && p <= hi) continue;
    if (colorCount(st, p, white) > 0) return false;
  }
  return true;
}

/* generate legal {from,to} for current turn+dice */
function legal(st){
  const out = [];
  const white = st.turn === 1;
  const bar = white ? st.wBar : st.bBar;
  const dir = white ? -1 : 1;
  const dice = [...new Set(st.dice)];
  if (bar > 0){
    for (const d of dice){
      const to = white ? 25 - d : d;                  // entry point from bar
      const v = st.pts[to];
      if (white ? v >= -1 : v <= 1) out.push({ from: 25, to });
    }
    return out;
  }
  for (let from = 1; from <= 24; from++){
    if (colorCount(st, from, white) === 0) continue;
    for (const d of dice){
      const to = from + dir * d;
      if (to >= 1 && to <= 24){
        const v = st.pts[to];
        if (white ? v >= -1 : v <= 1) out.push({ from, to });
      } else {
        // bear off
        if (!homeComplete(st, white)) continue;
        const pip = white ? from : 25 - from;
        if (pip === d) out.push({ from, to: 0 });
        else if (pip < d){
          // only if no checkers farther away
          let farther = false;
          for (let p = 1; p <= 24; p++){
            const pp = white ? p : 25 - p;
            if (pp > pip && colorCount(st, p, white) > 0){ farther = true; break; }
          }
          if (!farther) out.push({ from, to: 0 });
        }
      }
    }
  }
  return out;
}

function apply(st, slot, mv){
  if (st.over) return { ok: false, reason: 'GAME_OVER' };
  if (st.turn !== slot) return { ok: false, reason: 'NOT_YOUR_TURN' };
  const white = slot === 1;
  const dist = mv.from === 25 ? (white ? 25 - mv.to : mv.to) : (white ? (mv.from - mv.to) : (mv.to - mv.from));
  if (mv.to !== 0 && !st.dice.includes(dist)) return { ok: false, reason: 'ILLEGAL_MOVE', msg: 'المسافة لا تطابق نردًا متاحًا' };
  const ok = legal(st).some(m => m.from === mv.from && m.to === mv.to);
  if (!ok) return { ok: false, reason: 'ILLEGAL_MOVE', msg: 'حركة طاولة غير قانونية' };

  const next = { pts: st.pts.slice(), wBar: st.wBar, bBar: st.bBar, wOff: st.wOff, bOff: st.bOff, turn: st.turn, dice: st.dice.slice(), over: st.over, winner: st.winner, last: [mv.from, mv.to] };
  // remove checker from origin
  if (mv.from === 25){ if (white) next.wBar--; else next.bBar--; }
  else next.pts[mv.from] -= white ? 1 : -1;
  // place
  if (mv.to === 0){
    if (white) next.wOff++; else next.bOff++;
  } else {
    const v = next.pts[mv.to];
    if (white && v === -1){ next.pts[mv.to] = 0; next.bBar++; }        // hit black blot
    else if (!white && v === 1){ next.pts[mv.to] = 0; next.wBar++; }   // hit white blot
    next.pts[mv.to] += white ? 1 : -1;
  }
  // consume a die (bear-off uses the die equal-or-greater)
  const use = mv.to === 0 ? (next.dice.find(d => d === dist) ? dist : Math.max(...next.dice.filter(d => d >= dist))) : dist;
  const di = next.dice.indexOf(use);
  if (di >= 0) next.dice.splice(di, 1);

  // win?
  if (next.wOff >= 15){ next.over = true; next.winner = 1; return { ok: true, won: true, state: next }; }
  if (next.bOff >= 15){ next.over = true; next.winner = 2; return { ok: true, won: true, state: next }; }

  // dice exhausted (or no legal moves remain) → next turn with fresh roll
  const done = next.dice.length === 0 || legal(next).length === 0;
  if (done){
    let guard = 0;
    next.turn = 3 - next.turn;
    next.dice = roll();
    while (legal(next).length === 0 && guard++ < 8){    // no moves at all → pass automatically
      next.turn = 3 - next.turn;
      next.dice = roll();
    }
  }
  return { ok: true, state: next };
}

/* greedy AI: bear off > hit > make point > advance */
function ai(st){
  const white = st.turn === 1;
  const moves = legal(st);
  if (!moves.length) return null;
  let best = null, bs = -1e9;
  for (const m of moves){
    let s = Math.random() * 5;
    if (m.to === 0) s += 50;
    else {
      const v = st.pts[m.to];
      if (white ? v === -1 : v === 1) s += 30;                       // hit
      if (white ? v === 1 : v === -1) s += 18;                       // make a point
      if (white ? v >= 2 : v <= -2) s -= 8;                          // stack
      s += (white ? (25 - m.to) : m.to) * 0.3;                       // advance
    }
    if (m.from === 25) s += 25;                                      // enter from bar first
    if (s > bs){ bs = s; best = m; }
  }
  return best;
}

module.exports = { initial, legal, apply, ai };
