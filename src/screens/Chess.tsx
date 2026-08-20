/* NoirCue Chess — fixed container, 13s clock, instant AI, full rules */
import React, { useEffect, useRef, useState } from 'react';
import { Me } from '../App';
import * as CH from '../lib/chess';

const PC: Record<string,string> = { K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟' };
const CLOCK = 13;

export default function ChessScreen({ me, onBack }: { me: Me; onBack: () => void }) {
  const [st, setSt] = useState<CH.ChessState>(() => CH.initial());
  const [sel, setSel] = useState<number | null>(null);
  const [clock, setClock] = useState(CLOCK);
  const [thinking, setThinking] = useState(false);
  const clockT = useRef(Date.now());
  const my: CH.Color = 'w';

  const moves = st.over ? [] : CH.legal(st, my).concat(CH.castlingMoves(st));
  const targets = sel !== null ? moves.filter(m => m.from === sel) : [];

  const doMove = (from: number, to: number) => {
    const res = CH.move(st, my, from, to, 'Q');
    if (!res.ok) return;
    setSt(res.state!); setSel(null); clockT.current = Date.now();
    if (!res.state!.over) {
      setThinking(true);
      setTimeout(() => {
        const bm = CH.bestMove(res.state!, 'b');
        if (bm) { const r2 = CH.move(res.state!, 'b', bm.from, bm.to, 'Q'); if (r2.state) setSt(r2.state); }
        setThinking(false); clockT.current = Date.now();
      }, 180);
    }
  };

  useEffect(() => {
    const iv = setInterval(() => {
      if (st.over || st.turn !== my) { setClock(CLOCK); return; }
      const left = Math.max(0, CLOCK - (Date.now()-clockT.current)/1000);
      setClock(left);
      if (left <= 0) {
        clockT.current = Date.now();
        setSt(s => ({ ...s, turn: 'b' }));
        const bm = CH.bestMove(st, 'b');
        if (bm) { const r = CH.move(st, 'b', bm.from, bm.to, 'Q'); if (r.state) setTimeout(() => setSt(r.state!), 200); }
      }
    }, 250);
    return () => clearInterval(iv);
  }, [st]);

  const tap = (i: number) => {
    if (st.over || st.turn !== my || thinking) return;
    if (sel !== null && targets.some(m => m.to === i)) { doMove(sel, i); return; }
    const p = st.b[i];
    setSel(p !== '.' && CH.colorOf(p) === my ? i : null);
  };

  const captured = (color: CH.Color) => {
    const init: Record<string,number> = { P:8,N:2,B:2,R:2,Q:1 };
    const have: Record<string,number> = { P:0,N:0,B:0,R:0,Q:0 };
    st.b.forEach(p => { if (p!=='.' && CH.colorOf(p)===color && have[p.toUpperCase()]!==undefined) have[p.toUpperCase()]++; });
    const out: string[] = [];
    for (const k of ['Q','R','B','N','P']) for (let i=0;i<init[k]-have[k];i++) out.push(PC[color==='w'?k.toLowerCase():k]);
    return out;
  };

  return (
    <div className="chwrap">
      <div className="plbar">
        <span className="av">AI</span>
        <span className="nm">NoirCue AI<span>تصنيف 1100</span></span>
        <span style={{ fontSize: 13, color: 'var(--muted)' }}>{captured('b').join('')}</span>
      </div>
      <div className="boardwrap">
        <div className="board">
          {Array.from({ length: 64 }, (_, i) => {
            const dark = ((i>>3)+(i&7))%2===1;
            const p = st.b[i];
            const own = p!=='.' && CH.colorOf(p)===my;
            const isT = targets.some(m=>m.to===i);
            const last = st.last && (st.last[0]===i || st.last[1]===i);
            return (
              <div key={i} className={'sq '+(dark?'d':'l')+(sel===i?' sel':'')+(isT?' tgt':'')+(last?' last':'')}
                onClick={() => tap(i)} style={{ cursor: own||isT ? 'pointer' : 'default' }}>
                {p!=='.' ? <span className={p===p.toUpperCase()?'pw':'pb'}>{PC[p]}</span> : null}
              </div>
            );
          })}
          {st.over && (
            <div className="gameover">
              <span>{st.winner===null?'🤝':st.winner===my?'🏆':'💔'}</span>
              <span style={{fontSize:13}}>{st.winner===null?'تعادل':st.winner===my?'كش مات — فزت!':'كش مات — خسرت'}</span>
              <button className="btn primary small" onClick={()=>{setSt(CH.initial());clockT.current=Date.now();}}>جديدة</button>
            </div>
          )}
        </div>
      </div>
      <div className="plbar">
        <span className="av" style={{background:'var(--grad)',color:'#1a1a0e'}}>أ</span>
        <span className="nm">أنت<span>{CH.inCheck(st,my) ? '⚠️ كش!' : thinking ? 'AI يفكر…' : st.turn===my ? 'دورك' : '…'}</span></span>
        <span style={{fontSize:13,color:'var(--muted)'}}>{captured('w').join('')}</span>
        <span className={'ck'+(st.turn===my&&!st.over?' on':'')+(clock<=3?' low':'')}>{clock.toFixed(0)}ث</span>
      </div>
      <button className="btn ghost wfull" style={{marginTop:8}} onClick={onBack}>رجوع</button>
    </div>
  );
}
