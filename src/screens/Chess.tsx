/* ChessEngine screen — full rules (castling/EP/promotion/check/mate), 13s clock,
   instant AI (async, never freezes), online mode via server rooms. */
import React, { useEffect, useRef, useState } from 'react';
import { API } from '../api';
import { Me } from '../App';
import { toast } from '../toast';
import * as CH from '../lib/chess';

const PIECES: Record<string, string> = { K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟' };
const CLOCK = 13;

export default function ChessScreen({ me }: { me: Me }) {
  const [mode, setMode] = useState<'local' | 'online'>('local');
  return (
    <>
      <div className="spinbtnrow" style={{ marginBottom: 12 }}>
        <button className={'modebtn' + (mode === 'local' ? ' on' : '')} onClick={() => setMode('local')}>🎮 ضد الحاسوب (فوري)</button>
        <button className={'modebtn' + (mode === 'online' ? ' on' : '')} onClick={() => setMode('online')}>🌐 أونلاين (برصيد)</button>
      </div>
      {mode === 'local' ? <LocalChess /> : <OnlineChess me={me} />}
    </>
  );
}

function Board({ st, my, onMove, sel, interactive, last, flip }: {
  st: CH.ChessState; my: CH.Color; interactive: boolean;
  sel: number | null; last: [number, number] | null; flip: boolean;
  onMove: (from: number, to: number) => void; onSelect: never extends never ? never : any;
}) { return null; }

function LocalChess() {
  const [st, setSt] = useState<CH.ChessState>(() => CH.initial());
  const [sel, setSel] = useState<number | null>(null);
  const [clock, setClock] = useState(CLOCK);
  const clockT = useRef(Date.now());
  const [thinking, setThinking] = useState(false);
  const my: CH.Color = 'w';

  const moves = st.over ? [] : CH.legal(st, my).concat(CH.castlingMoves(st));
  const targets = sel !== null ? moves.filter(m => m.from === sel) : [];

  const doMove = (from: number, to: number) => {
    const res = CH.move(st, my, from, to, 'Q');
    if (!res.ok) { toast('حركة غير قانونية'); return; }
    setSt(res.state!);
    setSel(null);
    clockT.current = Date.now();
    if (!res.state!.over) {
      setThinking(true);
      setTimeout(() => {
        const bm = CH.bestMove(res.state!, 'b');
        if (bm) {
          const r2 = CH.move(res.state!, 'b', bm.from, bm.to, bm.promo || 'Q');
          if (r2.state) setSt(r2.state);
        }
        setThinking(false);
        clockT.current = Date.now();
      }, 220);
    }
  };

  useEffect(() => {
    const iv = setInterval(() => {
      if (st.over || st.turn !== my) { setClock(CLOCK); return; }
      const left = Math.max(0, CLOCK - (Date.now() - clockT.current) / 1000);
      setClock(left);
      if (left <= 0) {
        clockT.current = Date.now();
        setSt(s => ({ ...s, turn: 'b' }));
        toast('⏱ انتهت الـ13 ثانية', 'انتقل الدور للحاسوب');
        const bm = CH.bestMove(st, 'b');
        if (bm) { const r = CH.move(st, 'b', bm.from, bm.to, 'Q'); if (r.state) setTimeout(() => setSt(r.state!), 250); }
      }
    }, 250);
    return () => clearInterval(iv);
  }, [st]);

  const tap = (i: number) => {
    if (st.over || st.turn !== my || thinking) return;
    if (sel !== null && targets.some(m => m.to === i)) { doMove(sel, i); return; }
    const p = st.b[i];
    if (p !== '.' && CH.colorOf(p) === my) setSel(i); else setSel(null);
  };

  const captured = (color: CH.Color) => {
    const init: Record<string, number> = { P: 8, N: 2, B: 2, R: 2, Q: 1 };
    const have: Record<string, number> = { P: 0, N: 0, B: 0, R: 0, Q: 0 };
    st.b.forEach(p => { if (p !== '.' && CH.colorOf(p) === color && have[p.toUpperCase()] !== undefined) have[p.toUpperCase()]++; });
    const out: string[] = [];
    for (const k of ['Q', 'R', 'B', 'N', 'P']) for (let i = 0; i < init[k] - have[k]; i++) out.push(PIECES[color === 'w' ? k.toLowerCase() : k]);
    return out;
  };

  const cells = [];
  for (let v = 0; v < 64; v++) {
    const i = v; /* white at bottom */
    const dark = ((i >> 3) + (i & 7)) % 2 === 1;
    const p = st.b[i];
    const own = p !== '.' && CH.colorOf(p) === my;
    const isTgt = targets.some(m => m.to === i);
    cells.push(
      <div key={i} className={'sq' + (dark ? ' dk' : '') + (sel === i ? ' sel' : '') + (isTgt ? ' tgt' : '') + (st.last && (st.last[0] === i || st.last[1] === i) ? ' last' : '')}
        onClick={() => tap(i)} style={{ cursor: own || isTgt ? 'pointer' : 'default' }}>
        {p !== '.' ? <span className={p === p.toUpperCase() ? 'pw' : 'pb'}>{PIECES[p]}</span> : null}
      </div>
    );
  }

  return (
    <div className="chwrap">
      <div className="plbar">
        <span className="av">A</span>
        <span className="nm">VEXORA AI<span>تصنيف 1100</span></span>
        <span style={{ fontSize: 15, color: 'var(--muted)' }}>{captured('b').join('')}</span>
      </div>
      <div className="board">
        {cells}
        {st.over && (
          <div className="gameover">
            <span>{st.winner === null ? '🤝' : st.winner === my ? '🏆' : '💔'}</span>
            <span style={{ fontSize: 14 }}>{st.winner === null ? 'تعادل (خنق الملك)' : st.winner === my ? 'كش مات — فزت!' : 'كش مات — خسرت'}</span>
            <button className="btn primary small" onClick={() => { setSt(CH.initial()); clockT.current = Date.now(); }}>مباراة جديدة</button>
          </div>
        )}
      </div>
      <div className="plbar">
        <span className="av" style={{ background: 'var(--grad)' }}>أ</span>
        <span className="nm">أنت<span>الأبيض ♔ · {CH.inCheck(st, my) ? '⚠️ كش!' : thinking ? 'الحاسوب يفكر…' : st.turn === my ? 'دورك' : '…'}</span></span>
        <span style={{ fontSize: 15, color: 'var(--muted)' }}>{captured('w').join('')}</span>
        <span className={'ck' + (st.turn === my && !st.over ? ' on' : '') + (clock <= 3 ? ' low' : '')}>{clock.toFixed(0)}ث</span>
      </div>
    </div>
  );
}

function OnlineChess({ me }: { me: Me }) {
  const [room, setRoom] = useState<any | null>(null);
  const [sel, setSel] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const stRef = useRef<any>(null);
  const [tick, setTick] = useState(0);

  const start = async () => {
    setBusy(true);
    try {
      const j = await API.post('/mm/practice', { game: 'chess' });
      const full = await API.get('/rooms/' + j.room.id);
      stRef.current = full.room;
      setRoom(full.room);
    } catch (e: any) { toast('تعذر البدء', e.message); }
    setBusy(false);
  };

  const r = stRef.current;
  const my: CH.Color = r && r.you === 2 ? 'b' : 'w';
  const moves = r && !r.over ? (r.moves || []) : [];
  const targets = sel !== null ? moves.filter((m: any) => m.from === sel) : [];

  const doMove = async (from: number, to: number) => {
    try {
      const j = await API.post('/rooms/' + r.id + '/move', { from, to, promo: 'Q' });
      if (j.state) stRef.current = { ...stRef.current, ...j.state };
    } catch (e: any) { toast('حركة مرفوضة', e.message); }
    setSel(null);
    setTick(x => x + 1);
  };

  if (!room) return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 40 }}>♞</div>
      <b>شطرنج أونلاين</b>
      <div className="sub" style={{ margin: '8px 0 14px' }}>دخول 100 عملة · جائزة 150 · الحكم على الخادم · رد الحاسوب فوري</div>
      <button className="btn primary wfull" disabled={busy || me.coins < 100} onClick={start}>{busy ? '…' : me.coins < 100 ? 'رصيدك لا يكفي' : 'ابدأ'}</button>
    </div>
  );

  const myTurn = !r.over && r.turnColor === my;
  const tap = (i: number) => {
    if (!myTurn) return;
    if (sel !== null && targets.some((m: any) => m.to === i)) { doMove(sel, i); return; }
    const p = r.board ? r.board[i] : '.';
    const own = p !== '.' && ((p === p.toUpperCase()) === (my === 'w'));
    setSel(own ? i : null);
  };

  const cells = [];
  for (let i = 0; i < 64; i++) {
    const dark = ((i >> 3) + (i & 7)) % 2 === 1;
    const p = r.board ? r.board[i] : '.';
    const own = p !== '.' && ((p === p.toUpperCase()) === (my === 'w'));
    const isTgt = targets.some((m: any) => m.to === i);
    const last = r.last && (r.last[0] === i || r.last[1] === i);
    cells.push(
      <div key={i} className={'sq' + (dark ? ' dk' : '') + (sel === i ? ' sel' : '') + (isTgt ? ' tgt' : '') + (last ? ' last' : '')}
        onClick={() => tap(i)} style={{ cursor: own || isTgt ? 'pointer' : 'default' }}>
        {p !== '.' ? <span className={p === p.toUpperCase() ? 'pw' : 'pb'}>{PIECES[p]}</span> : null}
      </div>
    );
  }

  return (
    <div className="chwrap" key={tick}>
      <div className="plbar">
        <span className="av">A</span>
        <span className="nm">VEXORA AI<span>تصنيف 1100 · {r.vs_ai ? 'تدريب' : 'أونلاين'}</span></span>
        <span className={'ck' + (myTurn ? ' on' : '')}>{r.check ? 'كش! ⚠️' : myTurn ? 'دورك' : 'دور الخصم…'}</span>
      </div>
      <div className="board">
        {cells}
        {r.over && <div className="gameover"><span>{r.winner === r.you ? '🏆' : r.winner === 0 ? '🤝' : '💔'}</span>
          <span style={{ fontSize: 14 }}>{r.winner === r.you ? 'فزت!' : r.winner === 0 ? 'تعادل' : 'خسرت'}</span>
          <button className="btn primary small" onClick={() => { stRef.current = null; setRoom(null); }}>جديدة</button></div>}
      </div>
      <button className="btn ghost wfull" style={{ marginTop: 10 }} onClick={async () => { try { await API.post('/rooms/leave-active'); } catch (e) {} setRoom(null); stRef.current = null; }}>مغادرة</button>
    </div>
  );
}
