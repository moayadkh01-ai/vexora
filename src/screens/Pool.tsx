/* NoirCue Pool — clean vertical canvas engine: 60FPS local, spin widget, power bar */
import React, { useEffect, useRef, useState } from 'react';
import { API, fmt } from '../api';
import { Me } from '../App';
import { toast } from '../toast';
const P: any = (typeof window !== 'undefined' && (window as any).PoolPhysics) || {};

const COL: Record<number, string> = { 1:'#f5c518',2:'#1f6feb',3:'#e5484d',4:'#8b5cf6',5:'#f28c28',6:'#2ea043',7:'#8b1a1a',8:'#111',9:'#f5c518',10:'#1f6feb',11:'#e5484d',12:'#8b5cf6',13:'#f28c28',14:'#2ea043',15:'#8b1a1a' };
const CLOCK = 9;

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgb(${Math.min(255,((n>>16)&255)+255*f)|0},${Math.min(255,((n>>8)&255)+255*f)|0},${Math.min(255,(n&255)+255*f)|0})`;
}

export default function PoolScreen({ me, onBack, onRefresh }: { me: Me; onBack: () => void; onRefresh: () => void }) {
  const [online, setOnline] = useState(false);
  const cv = useRef<HTMLCanvasElement>(null);
  const spin = useRef<HTMLCanvasElement>(null);
  const st = useRef<any>(null);
  const aim = useRef<{ x: number; y: number } | null>(null);
  const sp = useRef({ x: 0, y: 0 });
  const [power, setPower] = useState(0);
  const [turn, setTurn] = useState(1);
  const [over, setOver] = useState<0 | 1 | 2>(0);
  const [clock, setClock] = useState(CLOCK);
  const clockT = useRef(Date.now());
  const [, force] = useState(0);

  const drawBall = (ctx: CanvasRenderingContext2D, b: any, s: number) => {
    const x = b.x * s, y = b.y * s, r = P.R * s;
    ctx.beginPath(); ctx.arc(x + r*.14, y + r*.24, r, 0, 7); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fill();
    const c = COL[b.id] || '#999';
    const g = ctx.createRadialGradient(x - r*.35, y - r*.4, r*.1, x, y, r*1.05);
    if (b.id === 0) { g.addColorStop(0,'#fff'); g.addColorStop(.6,'#e8ebef'); g.addColorStop(1,'#b0b8be'); }
    else if (b.id === 8) { g.addColorStop(0,'#4a4a50'); g.addColorStop(.5,'#1a1a20'); g.addColorStop(1,'#000'); }
    else if (b.id > 8) { g.addColorStop(0,'#fff'); g.addColorStop(.5,'#e8ebef'); g.addColorStop(1,'#bcc4ca'); }
    else { g.addColorStop(0,shade(c,.4)); g.addColorStop(.55,c); g.addColorStop(1,shade(c,-.4)); }
    ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fillStyle = g; ctx.fill();
    if (b.id > 8 && b.id !== 8) { ctx.save(); ctx.beginPath(); ctx.arc(x,y,r,0,7); ctx.clip(); ctx.fillStyle = c; ctx.fillRect(x-r,y-r*.5,r*2,r); ctx.restore(); }
    if (b.id === 8) { ctx.beginPath(); ctx.arc(x,y,r*.42,0,7); ctx.fillStyle = '#f0ede4'; ctx.fill(); }
    if (b.id !== 0 && r > 5) {
      ctx.fillStyle = b.id === 8 ? '#111' : '#fff'; ctx.font = '800 ' + Math.max(6,r*.9) + 'px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(b.id === 8 ? 8 : b.id > 8 ? b.id - 8 : b.id), x, y);
    }
    ctx.beginPath(); ctx.arc(x - r*.36, y - r*.4, r*.22, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill();
  };

  const draw = () => {
    const c = cv.current; if (!c || !st.current || !P.W) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    const s = c.width / P.W;
    ctx.setTransform(1,0,0,1,0,0);
    /* wood frame */
    const wg = ctx.createLinearGradient(0, 0, 0, c.height);
    wg.addColorStop(0,'#3a2610'); wg.addColorStop(.5,'#54330f'); wg.addColorStop(1,'#2e1d0a');
    ctx.fillStyle = wg; ctx.fillRect(0, 0, c.width, c.height);
    /* rail accents */
    ctx.fillStyle = 'rgba(212,175,55,.35)';
    for (let i = 1; i < 4; i++) {
      ctx.save(); ctx.translate(c.width * i / 4, s * 1.1); ctx.rotate(Math.PI/4); ctx.fillRect(-s*.2,-s*.2,s*.4,s*.4); ctx.restore();
      ctx.save(); ctx.translate(c.width * i / 4, c.height - s * 1.1); ctx.rotate(Math.PI/4); ctx.fillRect(-s*.2,-s*.2,s*.4,s*.4); ctx.restore();
    }
    /* felt — radial center light */
    const fg = ctx.createRadialGradient(c.width/2, c.height*.45, s*3, c.width/2, c.height/2, c.width*1.4);
    fg.addColorStop(0,'#1e5c3a'); fg.addColorStop(.5,'#175030'); fg.addColorStop(.85,'#113d24'); fg.addColorStop(1,'#0c2e1b');
    ctx.fillStyle = fg; ctx.fillRect(s*2, s*2, c.width - s*4, c.height - s*4);
    /* baulk */
    ctx.strokeStyle = 'rgba(255,255,255,.15)'; ctx.lineWidth = Math.max(1, s*.1);
    ctx.beginPath(); ctx.moveTo(s*2, c.height*.72); ctx.lineTo(c.width-s*2, c.height*.72); ctx.stroke();
    /* 3D pockets */
    for (const pk of P.POCKETS) {
      const px = pk.x*s, py = pk.y*s, pr = P.PR*s;
      ctx.beginPath(); ctx.arc(px, py, pr*1.25, 0, 7); ctx.fillStyle = '#050805'; ctx.fill();
      const pg = ctx.createRadialGradient(px-pr*.2, py-pr*.25, pr*.1, px, py, pr*1.1);
      pg.addColorStop(0,'#1a1a1a'); pg.addColorStop(.7,'#0a0a0a'); pg.addColorStop(1,'#222');
      ctx.beginPath(); ctx.arc(px, py, pr, 0, 7); ctx.fillStyle = pg; ctx.fill();
      ctx.beginPath(); ctx.arc(px, py, pr, 0, 7); ctx.strokeStyle = 'rgba(212,175,55,.4)'; ctx.lineWidth = Math.max(1, s*.12); ctx.stroke();
    }
    for (const b of st.current.balls) if (!b.pocketed) drawBall(ctx, b, s);
    /* aim + cue */
    const cue = st.current.balls.find((b: any) => b.id === 0);
    if (aim.current && cue && !cue.pocketed && turn === 1 && !over) {
      const dx = aim.current.x - cue.x, dy = aim.current.y - cue.y;
      const len = Math.hypot(dx, dy);
      if (len > .4) {
        const ux = dx/len, uy = dy/len;
        ctx.strokeStyle = 'rgba(212,175,55,.9)'; ctx.lineWidth = Math.max(1.3, s*.1);
        ctx.setLineDash([s, s*.6]);
        ctx.beginPath(); ctx.moveTo(cue.x*s, cue.y*s); ctx.lineTo((cue.x+ux*len)*s, (cue.y+uy*len)*s); ctx.stroke();
        ctx.setLineDash([]);
        const back = 4 + Math.min(12, len*.22);
        ctx.strokeStyle = '#8a6a30'; ctx.lineWidth = Math.max(2, s*.2);
        ctx.beginPath();
        ctx.moveTo((cue.x-ux*back)*s, (cue.y-uy*back)*s);
        ctx.lineTo((cue.x-ux*(back+9))*s, (cue.y-uy*(back+9))*s);
        ctx.stroke();
        ctx.strokeStyle = '#d4af37'; ctx.lineWidth = Math.max(2, s*.22);
        ctx.beginPath(); ctx.moveTo((cue.x-ux*(back-.3))*s, (cue.y-uy*(back-.3))*s); ctx.lineTo((cue.x-ux*back)*s, (cue.y-uy*back)*s); ctx.stroke();
      }
    }
  };

  const loop = () => {
    if (!st.current) return;
    if (!P.allStopped(st.current.balls)) { P.step(st.current.balls); requestAnimationFrame(loop); }
    draw();
  };

  const settle = () => {
    const balls = st.current.balls;
    const pk = balls.filter((b: any) => b.pocketed && b.id !== 0).map((b: any) => b.id);
    const cueIn = balls.find((b: any) => b.id === 0).pocketed;
    if (cueIn) { const c = balls.find((b: any) => b.id === 0); c.pocketed = false; c.x = P.W/2; c.y = P.H*.75; c.vx = c.vy = 0; }
    if (pk.includes(8)) {
      const g = st.current.group || 'solid';
      const rem = balls.filter((b: any) => !b.pocketed && b.id !== 0 && b.id !== 8 && (g === 'solid' ? b.id < 8 : b.id > 8)).length;
      setOver(rem === 0 && !cueIn ? 1 : 2); return;
    }
    if (!st.current.group && pk.length && !cueIn) st.current.group = pk[0] < 8 ? 'solid' : 'stripe';
    const g = st.current.group;
    const keep = !cueIn && pk.some(id => g ? (g === 'solid' ? id < 8 : id > 8) : true);
    if (!keep && turn === 1) { setTurn(2); clockT.current = Date.now(); setTimeout(aiShoot, 650); }
    else clockT.current = Date.now();
  };

  const aiShoot = () => {
    if (over || !st.current) return;
    const balls = st.current.balls, g = st.current.group;
    let targets = balls.filter((b: any) => !b.pocketed && b.id !== 0 && (g ? (g === 'solid' ? b.id > 8 : b.id < 8) : true));
    if (!targets.length) targets = balls.filter((b: any) => !b.pocketed && b.id !== 0);
    if (!targets.length) return;
    const t = targets[Math.floor(Math.random()*Math.min(3, targets.length))];
    const pk = P.POCKETS[Math.floor(Math.random()*6)];
    const d = Math.hypot(t.x-pk.x, t.y-pk.y) || 1;
    const cue = balls.find((b: any) => b.id === 0);
    const ax = t.x + (t.x-pk.x)/d*2*P.R, ay = t.y + (t.y-pk.y)/d*2*P.R;
    let ang = Math.atan2(ay-cue.y, ax-cue.x) + (Math.random()*.12-.06);
    cue.vx = Math.cos(ang)*(2.5+Math.random()*1.5); cue.vy = Math.sin(ang)*(2.5+Math.random()*1.5);
    loop();
    const w = setInterval(() => { if (P.allStopped(balls)) { clearInterval(w); settle(); setTurn(1); clockT.current = Date.now(); force(x=>x+1); } }, 120);
  };

  const drawSpin = () => {
    const c = spin.current; if (!c) return;
    const ctx = c.getContext('2d'); if (!ctx) return;
    if (c.width !== 110) { c.width = 110; c.height = 110; c.style.width = '110px'; c.style.height = '110px'; }
    ctx.clearRect(0,0,110,110);
    const g = ctx.createRadialGradient(42,40,3,55,55,50);
    g.addColorStop(0,'#fff'); g.addColorStop(.6,'#eceff2'); g.addColorStop(1,'#b0b8be');
    ctx.beginPath(); ctx.arc(55,55,43,0,7); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.12)';
    ctx.beginPath(); ctx.moveTo(20,55); ctx.lineTo(90,55); ctx.moveTo(55,20); ctx.lineTo(55,90); ctx.stroke();
    ctx.beginPath(); ctx.arc(55+sp.current.x*32, 55+sp.current.y*32, 7, 0, 7);
    ctx.fillStyle = '#e05c6e'; ctx.shadowColor = 'rgba(224,92,110,.7)'; ctx.shadowBlur = 8; ctx.fill(); ctx.shadowBlur = 0;
  };

  useEffect(() => {
    if (!P.W) return;
    st.current = { balls: P.rackPositions(), group: null };
    const c = cv.current!;
    const fit = () => {
      /* viewport fix: fit between top bar and bottom nav */
      const maxW = 420;
      const availH = window.innerHeight - 140;   /* topbar(~56) + bottomnav(~70) + margins */
      let w = Math.min(c.parentElement?.clientWidth || 300, maxW);
      /* table aspect 1:2 — ensure height fits within available space */
      if (w * 2 > availH) w = availH / 2;
      const dpr = Math.min(2, devicePixelRatio || 1);
      c.width = Math.round(w * dpr);
      c.height = Math.round(w * 2 * dpr);
      c.style.width = Math.round(w) + 'px';
      c.style.height = Math.round(w * 2) + 'px';
      c.style.maxWidth = maxW + 'px';
      c.style.margin = '0 auto';
      c.style.display = 'block';
      c.style.overflow = 'hidden';
      draw();
    };
    fit(); drawSpin();
    window.addEventListener('resize', fit);
    const pos = (e: PointerEvent) => { const rc = c.getBoundingClientRect(); return { x: (e.clientX-rc.left)/rc.width*P.W, y: (e.clientY-rc.top)/rc.width*P.W }; };
    let am = false;
    c.onpointerdown = e => { if (turn===1 && !over && P.allStopped(st.current.balls)) { am = true; aim.current = pos(e); c.setPointerCapture(e.pointerId); draw(); } };
    c.onpointermove = e => { if (am) { aim.current = pos(e); const cue = st.current.balls.find((b:any)=>b.id===0); const l = Math.hypot(aim.current.x-cue.x, aim.current.y-cue.y); setPower(Math.min(100, Math.max(0, l*1.15))); draw(); } };
    c.onpointerup = () => {
      if (!am || !aim.current) return;
      const cue = st.current.balls.find((b:any)=>b.id===0);
      const dx = aim.current.x-cue.x, dy = aim.current.y-cue.y;
      const len = Math.hypot(dx,dy);
      aim.current = null; am = false; setPower(0);
      if (len < 1.3) { draw(); return; }
      const p = Math.max(8, Math.min(100, len*1.15));
      cue.spinX = sp.current.x; cue.spinY = sp.current.y; cue._spinUsed = false;
      cue.vx = Math.cos(Math.atan2(dy,dx))*p*.062; cue.vy = Math.sin(Math.atan2(dy,dx))*p*.062;
      loop();
      const w = setInterval(() => { if (P.allStopped(st.current.balls)) { clearInterval(w); settle(); force(x=>x+1); } }, 120);
    };
    const sc = spin.current!;
    let sd = false;
    const setS = (e: PointerEvent) => {
      const rc = sc.getBoundingClientRect();
      let x = ((e.clientX-rc.left)/rc.width*110-55)/30, y = ((e.clientY-rc.top)/rc.height*110-55)/30;
      const l = Math.hypot(x,y), k = l>1 ? 1/l : 1;
      sp.current = { x: x*k, y: y*k }; drawSpin();
    };
    sc.onpointerdown = e => { sd = true; sc.setPointerCapture(e.pointerId); setS(e); };
    sc.onpointermove = e => { if (sd) setS(e); };
    sc.onpointerup = () => { sd = false; };
    const iv = setInterval(() => {
      if (over || turn !== 1) { setClock(CLOCK); return; }
      const l = Math.max(0, CLOCK - (Date.now()-clockT.current)/1000);
      setClock(l);
      if (l <= 0) { clockT.current = Date.now(); setTurn(2); toast('⏱ فاول — انتقل الدور'); setTimeout(aiShoot, 600); }
    }, 200);
    return () => { clearInterval(iv); window.removeEventListener('resize', fit); };
  }, []);

  const pk = (st.current?.balls || []).filter((b:any) => b.pocketed && b.id !== 0).map((b:any) => b.id);
  const g = st.current?.group;
  const mine = pk.filter(id => g ? (g==='solid'? id<8 : id>8) : true);
  return (
    <>
      <div className="poolhud">
        <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
          <b style={{ fontSize: 10 }}>{mine.length}/7</b>
          {mine.map(id => <span key={id} className="pball" style={{ background: COL[id] }}>{id>8?id-8:id}</span>)}
        </div>
        <b style={{ color: over ? 'var(--gold)' : turn===1 ? 'var(--gold)' : 'var(--muted)', fontSize: 10.5 }}>
          {over ? (over===1?'🏆 فزت!':'خسرت') : turn===1 ? 'دورك' : 'الحاسوب…'}
        </b>
      </div>
      <div className="clockbar" style={{ margin: '7px 0' }}><div className={'clockfill'+(clock<3?' low':'')} style={{ width: (clock/CLOCK*100)+'%' }} /></div>
      <div className="powerbar"><div className="powerfill" style={{ width: power+'%' }} /></div>
      <canvas ref={cv} className="poolcv" />
      <div className="spinrow">
        <canvas id="spinball-canvas" ref={spin} />
        <div><b style={{ fontSize: 12.5 }}>السبين</b><div className="sub">اسحب النقطة — أعلى=رجوع، أسفل=تقدم، جوانب=دوران</div></div>
      </div>
      {over ? <button className="btn primary wfull" style={{marginTop:10}} onClick={() => { st.current = { balls: P.rackPositions(), group: null }; setOver(0); setTurn(1); clockT.current = Date.now(); draw(); }}>مباراة جديدة</button>
            : <button className="btn ghost wfull" style={{marginTop:10}} onClick={onBack}>رجوع</button>}
    </>
  );
}
