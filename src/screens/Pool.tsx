/* PoolEngine — client-side 60FPS canvas engine (vertical table, CCD physics,
   3D-shaded balls, spin widget, shot clock) + online mode via server rooms. */
import React, { useEffect, useRef, useState } from 'react';
import { API, fmt } from '../api';
import { Me } from '../App';
import { toast } from '../toast';
import { P } from '../lib/poolPhysicsLoader';

const COLORS: Record<number, string> = { 1:'#f5c518',2:'#1f6feb',3:'#e5484d',4:'#8b5cf6',5:'#f28c28',6:'#2ea043',7:'#8b1a1a',8:'#111',9:'#f5c518',10:'#1f6feb',11:'#e5484d',12:'#8b5cf6',13:'#f28c28',14:'#2ea043',15:'#8b1a1a' };
const CLOCK = 9;

function shade(hex: string, f: number) {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.min(255, Math.max(0, ((n >> 16) & 255) + 255 * f));
  const g = Math.min(255, Math.max(0, ((n >> 8) & 255) + 255 * f));
  const b = Math.min(255, Math.max(0, (n & 255) + 255 * f));
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

type Mode = 'local' | 'online';

export default function PoolScreen({ me, onRefresh }: { me: Me; onRefresh: () => void }) {
  const [mode, setMode] = useState<Mode>('local');
  return (
    <>
      <div className="spinbtnrow" style={{ marginBottom: 12 }}>
        <button className={'modebtn' + (mode === 'local' ? ' on' : '')} onClick={() => setMode('local')}>🎮 تدريب محلي (60FPS)</button>
        <button className={'modebtn' + (mode === 'online' ? ' on' : '')} onClick={() => setMode('online')}>🌐 أونلاين (برصيد)</button>
      </div>
      {mode === 'local' ? <LocalPool /> : <OnlinePool me={me} onRefresh={onRefresh} />}
    </>
  );
}

/* ============ LOCAL (pure client engine, free, vs AI) ============ */
function LocalPool() {
  const cvRef = useRef<HTMLCanvasElement>(null);
  const spinRef = useRef<HTMLCanvasElement>(null);
  const st = useRef<any>(null);
  const aim = useRef<{ x: number; y: number } | null>(null);
  const spin = useRef({ x: 0, y: 0 });
  const raf = useRef(0);
  const [turn, setTurn] = useState(1);           /* 1 = you, 2 = AI */
  const [over, setOver] = useState<0 | 1 | 2>(0);
  const [clock, setClock] = useState(CLOCK);
  const clockT = useRef(Date.now());
  const [pocketed, setPocketed] = useState<number[]>([]);
  const [group, setGroup] = useState<string | null>(null);
  const [, force] = useState(0);

  const drawBall = (ctx: CanvasRenderingContext2D, b: any, s: number) => {
    const x = b.x * s, y = b.y * s, rad = P.R * s;
    ctx.beginPath(); ctx.arc(x + rad * .16, y + rad * .26, rad * 1.02, 0, 7); ctx.fillStyle = 'rgba(0,0,0,.38)'; ctx.fill();
    const id = b.id, col = COLORS[id] || '#999';
    const g = ctx.createRadialGradient(x - rad * .35, y - rad * .42, rad * .1, x, y, rad * 1.05);
    if (id === 0) { g.addColorStop(0, '#fff'); g.addColorStop(.55, '#e9edef'); g.addColorStop(1, '#b9c2c9'); }
    else if (id === 8) { g.addColorStop(0, '#4a4a55'); g.addColorStop(.4, '#1a1a22'); g.addColorStop(1, '#000'); }
    else if (id > 8) { g.addColorStop(0, '#fff'); g.addColorStop(.45, '#eef1f4'); g.addColorStop(1, '#c3cad1'); }
    else { g.addColorStop(0, shade(col, .45)); g.addColorStop(.5, col); g.addColorStop(1, shade(col, -.45)); }
    ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fillStyle = g; ctx.fill();
    if (id > 8 && id !== 8) {
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.clip();
      ctx.fillStyle = col; ctx.fillRect(x - rad, y - rad * .52, rad * 2, rad * 1.04); ctx.restore();
    }
    if (id === 8) { ctx.beginPath(); ctx.arc(x, y, rad * .44, 0, 7); ctx.fillStyle = '#f4f6f8'; ctx.fill(); }
    if (id !== 0 && rad > 5) {
      ctx.fillStyle = id === 8 ? '#111' : '#fff';
      ctx.font = '900 ' + Math.max(7, rad * .95) + 'px Segoe UI';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(id === 8 ? 8 : id > 8 ? id - 8 : id), x, y + rad * .05);
    }
    ctx.beginPath(); ctx.arc(x - rad * .38, y - rad * .42, rad * .24, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill();
  };

  const draw = () => {
    const cv = cvRef.current; if (!cv || !st.current) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const s = cv.width / P.W;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    /* wooden frame */
    const wood = ctx.createLinearGradient(0, 0, 0, cv.height);
    wood.addColorStop(0, '#6b4423'); wood.addColorStop(.5, '#8a5a2b'); wood.addColorStop(1, '#543316');
    ctx.fillStyle = wood; ctx.fillRect(0, 0, cv.width, cv.height);
    /* felt with center light */
    const felt = ctx.createRadialGradient(cv.width / 2, cv.height * .42, s * 5, cv.width / 2, cv.height / 2, cv.width * 1.25);
    felt.addColorStop(0, '#267a52'); felt.addColorStop(.5, '#1d6b47'); felt.addColorStop(.82, '#155939'); felt.addColorStop(1, '#0d3f28');
    ctx.fillStyle = felt;
    const r = s * 2.1;
    ctx.beginPath();
    ctx.moveTo(r + s * 2.1, s * 2.1);
    ctx.arcTo(cv.width - s * 2.1, s * 2.1, cv.width - s * 2.1, cv.height - s * 2.1, s * 1.6);
    ctx.arcTo(cv.width - s * 2.1, cv.height - s * 2.1, s * 2.1, cv.height - s * 2.1, s * 1.6);
    ctx.arcTo(s * 2.1, cv.height - s * 2.1, s * 2.1, s * 2.1, s * 1.6);
    ctx.arcTo(s * 2.1, s * 2.1, cv.width - s * 2.1, s * 2.1, s * 1.6);
    ctx.closePath(); ctx.fill();
    /* pockets */
    for (const pk of P.POCKETS) {
      const px = pk.x * s, py = pk.y * s;
      const pg = ctx.createRadialGradient(px, py - P.PR * s * .25, P.PR * s * .15, px, py, P.PR * s * 1.25);
      pg.addColorStop(0, '#000'); pg.addColorStop(.7, '#0a0f0c'); pg.addColorStop(1, '#1c2a22');
      ctx.beginPath(); ctx.arc(px, py, P.PR * s * 1.22, 0, 7); ctx.fillStyle = pg; ctx.fill();
      ctx.beginPath(); ctx.arc(px, py, P.PR * s, 0, 7); ctx.strokeStyle = 'rgba(255,222,150,.5)'; ctx.lineWidth = Math.max(1, s * .16); ctx.stroke();
    }
    for (const b of st.current.balls) if (!b.pocketed) drawBall(ctx, b, s);
    /* aim + cue */
    const cue = st.current.balls.find((b: any) => b.id === 0);
    if (aim.current && cue && !cue.pocketed && turn === 1 && !over) {
      const dx = aim.current.x - cue.x, dy = aim.current.y - cue.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > .5) {
        const ux = dx / len, uy = dy / len;
        ctx.strokeStyle = 'rgba(34,211,238,.95)'; ctx.lineWidth = Math.max(1.5, s * .12);
        ctx.setLineDash([s * 1.1, s * .7]);
        ctx.beginPath(); ctx.moveTo(cue.x * s, cue.y * s); ctx.lineTo((cue.x + ux * len) * s, (cue.y + uy * len) * s); ctx.stroke();
        ctx.setLineDash([]);
        const back = 4.2 + Math.min(13, len * .24);
        ctx.strokeStyle = '#c8a06a'; ctx.lineWidth = Math.max(2, s * .24);
        ctx.beginPath();
        ctx.moveTo((cue.x - ux * back) * s, (cue.y - uy * back) * s);
        ctx.lineTo((cue.x - ux * (back + 10)) * s, (cue.y - uy * (back + 10)) * s);
        ctx.stroke();
      }
    }
  };

  const loop = () => {
    if (!st.current) return;
    if (!P.allStopped(st.current.balls)) {
      P.step(st.current.balls);
      raf.current = requestAnimationFrame(loop);
    }
    draw();
  };

  const settle = () => {
    const balls = st.current.balls;
    const pk = balls.filter((b: any) => b.pocketed && b.id !== 0).map((b: any) => b.id);
    setPocketed(pk);
    const cueIn = balls.find((b: any) => b.id === 0).pocketed;
    if (cueIn) { const c = balls.find((b: any) => b.id === 0); c.pocketed = false; c.x = P.W / 2; c.y = P.H * .75; }
    if (pk.includes(8)) {
      const g = group || 'solid';
      const remain = balls.filter((b: any) => !b.pocketed && b.id !== 0 && b.id !== 8 && (g === 'solid' ? b.id < 8 : b.id > 8)).length;
      setOver(remain === 0 && !cueIn ? 1 : 2);
      return;
    }
    if (!group && pk.length && !cueIn) setGroup(pk.find(id => id !== 8)! < 8 ? 'solid' : 'stripe');
    const g = group || (pk.length && !cueIn ? (pk.find(id => id !== 8)! < 8 ? 'solid' : 'stripe') : null);
    const own = g ? pk.some(id => (g === 'solid' ? id < 8 : id > 8)) : pk.length > 0;
    const keep = !cueIn && own;
    setTurn(keep ? turn : (turn === 1 ? 2 : 1));
    clockT.current = Date.now();
    if (!keep && (turn === 1)) setTimeout(aiShoot, 700);
    if (!keep && turn === 2) { /* AI just played */ }
  };

  const aiShoot = () => {
    if (over || !st.current) return;
    const balls = st.current.balls;
    const g = group;
    let targets = balls.filter((b: any) => !b.pocketed && b.id !== 0 && (g ? (g === 'solid' ? b.id > 8 : b.id < 8) : true));
    if (!targets.length) targets = balls.filter((b: any) => !b.pocketed && b.id !== 0);
    if (!targets.length) return;
    const t = targets[Math.floor(Math.random() * Math.min(3, targets.length))];
    const pk = P.POCKETS[Math.floor(Math.random() * 6)];
    const dx = t.x - pk.x, dy = t.y - pk.y;
    const dl = Math.sqrt(dx * dx + dy * dy) || 1;
    const cue = balls.find((b: any) => b.id === 0);
    const aimX = t.x + dx / dl * 2 * P.R, aimY = t.y + dy / dl * 2 * P.R;
    let ang = Math.atan2(aimY - cue.y, aimX - cue.x);
    ang += (Math.random() * .12 - .06);
    const speed = 2.6 + Math.random() * 1.4;
    cue.vx = Math.cos(ang) * speed; cue.vy = Math.sin(ang) * speed;
    loop();
    const watch = setInterval(() => {
      if (P.allStopped(balls)) { clearInterval(watch); settle(); force(x => x + 1); }
    }, 120);
  };

  const shoot = (angleDeg: number, power: number) => {
    const cue = st.current.balls.find((b: any) => b.id === 0);
    const speed = power * .062;
    cue.spinX = spin.current.x; cue.spinY = spin.current.y; cue._spinUsed = false;
    cue.vx = Math.cos(angleDeg * Math.PI / 180) * speed;
    cue.vy = Math.sin(angleDeg * Math.PI / 180) * speed;
    loop();
    const watch = setInterval(() => {
      if (P.allStopped(st.current.balls)) { clearInterval(watch); settle(); force(x => x + 1); }
    }, 120);
  };

  /* spin widget */
  const drawSpin = () => {
    const cv = spinRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    const dpr = Math.min(2, devicePixelRatio || 1);
    if (cv.width !== 120 * dpr) { cv.width = 120 * dpr; cv.height = 120 * dpr; cv.style.width = '120px'; cv.style.height = '120px'; }
    const s = cv.width / 120;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    const cx = 60 * s, cy = 60 * s, rad = 46 * s;
    const g = ctx.createRadialGradient(cx - 14 * s, cy - 16 * s, 4 * s, cx, cy, rad * 1.08);
    g.addColorStop(0, '#fff'); g.addColorStop(.55, '#eceff2'); g.addColorStop(1, '#b9c2c9');
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 7); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.15)';
    ctx.beginPath(); ctx.moveTo(cx - rad + 6 * s, cy); ctx.lineTo(cx + rad - 6 * s, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - rad + 6 * s); ctx.lineTo(cx, cy + rad - 6 * s); ctx.stroke();
    const dx = cx + spin.current.x * (rad - 12 * s), dy = cy + spin.current.y * (rad - 12 * s);
    ctx.beginPath(); ctx.arc(dx, dy, 8 * s, 0, 7);
    ctx.fillStyle = '#f43f5e'; ctx.shadowColor = 'rgba(244,63,94,.8)'; ctx.shadowBlur = 10 * s; ctx.fill(); ctx.shadowBlur = 0;
  };

  useEffect(() => {
    st.current = { balls: P.rackPositions() };
    const cv = cvRef.current!;
    const fit = () => {
      const w = cv.parentElement!.clientWidth || 320;
      const dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = Math.round(w * dpr);
      cv.height = Math.round(w * 2 * dpr);
      cv.style.height = Math.round(w * 2) + 'px';
      draw();
    };
    fit();
    window.addEventListener('resize', fit);
    drawSpin();

    const pos = (e: PointerEvent) => {
      const rc = cv.getBoundingClientRect();
      return { x: (e.clientX - rc.left) / rc.width * P.W, y: (e.clientY - rc.top) / rc.width * P.W };
    };
    let aiming = false;
    cv.onpointerdown = e => { if (turn === 1 && !over && st.current && P.allStopped(st.current.balls)) { aiming = true; aim.current = pos(e); cv.setPointerCapture(e.pointerId); draw(); } };
    cv.onpointermove = e => { if (aiming) { aim.current = pos(e); draw(); } };
    cv.onpointerup = () => {
      if (!aiming || !aim.current) return;
      const cue = st.current.balls.find((b: any) => b.id === 0);
      const dx = aim.current.x - cue.x, dy = aim.current.y - cue.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      aim.current = null; aiming = false;
      if (len < 1.5) { draw(); return; }
      shoot(Math.atan2(dy, dx) * 180 / Math.PI, Math.max(8, Math.min(100, len * 1.15)));
    };

    /* spin widget drag */
    const scv = spinRef.current!;
    let sdrag = false;
    const setSpin = (e: PointerEvent) => {
      const rc = scv.getBoundingClientRect();
      const x = ((e.clientX - rc.left) / rc.width * 120 - 60) / 34;
      const y = ((e.clientY - rc.top) / rc.height * 120 - 60) / 34;
      const l = Math.sqrt(x * x + y * y), k = l > 1 ? 1 / l : 1;
      spin.current = { x: x * k, y: y * k };
      drawSpin();
    };
    scv.onpointerdown = e => { sdrag = true; scv.setPointerCapture(e.pointerId); setSpin(e); };
    scv.onpointermove = e => { if (sdrag) setSpin(e); };
    scv.onpointerup = () => { sdrag = false; };

    const clockIv = setInterval(() => {
      if (over || turn !== 1) { setClock(CLOCK); return; }
      const left = Math.max(0, CLOCK - (Date.now() - clockT.current) / 1000);
      setClock(left);
      if (left <= 0) { clockT.current = Date.now(); setTurn(2); toast('⏱ انتهت الـ9 ثوانٍ', 'فاول — انتقل الدور للحاسوب'); setTimeout(aiShoot, 600); }
    }, 200);

    return () => { clearInterval(clockIv); cancelAnimationFrame(raf.current); window.removeEventListener('resize', fit); };
  }, []);

  useEffect(() => { drawSpin(); }, []);

  const pocketedByMe = pocketed.filter(id => group ? (group === 'solid' ? id < 8 : id > 8) : true);
  return (
    <>
      <div className="poolhud">
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}>
          <b style={{ fontSize: 10.5 }}>أسقطتَ {pocketedByMe.length}/7</b>
          {pocketedByMe.map(id => <span key={id} className="pball" style={{ background: COLORS[id], ...(id > 8 ? { background: `linear-gradient(to bottom,#eee 20%,${COLORS[id]} 20%,${COLORS[id]} 80%,#eee 80%)` } : {}) }}>{id === 8 ? 8 : id > 8 ? id - 8 : id}</span>)}
        </div>
        <b style={{ fontSize: 11, color: over ? 'var(--gold)' : turn === 1 ? 'var(--cyan)' : 'var(--muted)' }}>
          {over ? (over === 1 ? '🏆 فزت!' : 'خسرت') : turn === 1 ? 'دورك — اسحب للتسديد' : 'الحاسوب يسدد…'}
        </b>
      </div>
      <div className="clockbar" style={{ margin: '8px 0' }}>
        <div className={'clockfill' + (clock < 3 ? ' low' : '')} style={{ width: (clock / CLOCK * 100) + '%' }} />
      </div>
      <canvas ref={cvRef} className="poolcv" />
      <div className="spinrow">
        <canvas id="spinball-canvas" ref={spinRef} />
        <div>
          <b style={{ fontSize: 13 }}>تحكم السبين على الكرة البيضاء</b>
          <div className="sub">اسحب النقطة الحمراء — أعلى = رجوع (Draw)، أسفل = تقدم (Follow)، الجوانب = دوران</div>
        </div>
      </div>
      {over ? (
        <button className="btn primary wfull" style={{ marginTop: 12 }} onClick={() => window.location.reload()}>مباراة جديدة</button>
      ) : null}
    </>
  );
}

/* ============ ONLINE (server rooms, real coins) ============ */
function OnlinePool({ me, onRefresh }: { me: Me; onRefresh: () => void }) {
  const [busy, setBusy] = useState(false);
  const [room, setRoom] = useState<any | null>(null);
  const cvRef = useRef<HTMLCanvasElement>(null);
  const st = useRef<any>(null);
  const aim = useRef<{ x: number; y: number } | null>(null);
  const spin = useRef({ x: 0, y: 0 });
  const spinRef = useRef<HTMLCanvasElement>(null);
  const [msg, setMsg] = useState('');

  const start = async () => {
    setBusy(true);
    try {
      const j = await API.post('/mm/practice', { game: 'pool8' });
      const full = await API.get('/rooms/' + j.room.id);
      st.current = full.room;
      setRoom(full.room);
    } catch (e: any) { toast('تعذر البدء', e.message); }
    setBusy(false);
  };

  const drawSpin = () => {
    const cv = spinRef.current; if (!cv) return;
    const ctx = cv.getContext('2d'); if (!ctx) return;
    if (cv.width !== 120) { cv.width = 120; cv.height = 120; }
    ctx.clearRect(0, 0, 120, 120);
    const g = ctx.createRadialGradient(46, 44, 4, 60, 60, 50);
    g.addColorStop(0, '#fff'); g.addColorStop(.55, '#eceff2'); g.addColorStop(1, '#b9c2c9');
    ctx.beginPath(); ctx.arc(60, 60, 46, 0, 7); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,.15)';
    ctx.beginPath(); ctx.moveTo(20, 60); ctx.lineTo(100, 60); ctx.moveTo(60, 20); ctx.lineTo(60, 100); ctx.stroke();
    ctx.beginPath(); ctx.arc(60 + spin.current.x * 34, 60 + spin.current.y * 34, 8, 0, 7);
    ctx.fillStyle = '#f43f5e'; ctx.fill();
  };
  useEffect(drawSpin);

  useEffect(() => {
    if (!room) return;
    const cv = cvRef.current!;
    const draw = () => {
      const r = st.current; if (!r) return;
      const s = cv.width / P.W;
      const ctx = cv.getContext('2d'); if (!ctx) return;
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      const wood = ctx.createLinearGradient(0, 0, 0, cv.height);
      wood.addColorStop(0, '#6b4423'); wood.addColorStop(.5, '#8a5a2b'); wood.addColorStop(1, '#543316');
      ctx.fillStyle = wood; ctx.fillRect(0, 0, cv.width, cv.height);
      const felt = ctx.createRadialGradient(cv.width / 2, cv.height * .42, s * 5, cv.width / 2, cv.height / 2, cv.width * 1.25);
      felt.addColorStop(0, '#267a52'); felt.addColorStop(.5, '#1d6b47'); felt.addColorStop(.82, '#155939'); felt.addColorStop(1, '#0d3f28');
      ctx.fillStyle = felt; ctx.fillRect(s * 2.1, s * 2.1, cv.width - s * 4.2, cv.height - s * 4.2);
      for (const pk of P.POCKETS) {
        ctx.beginPath(); ctx.arc(pk.x * s, pk.y * s, P.PR * s * 1.2, 0, 7); ctx.fillStyle = '#000'; ctx.fill();
      }
      for (const b of r.balls) {
        if (b.pocketed) continue;
        const x = b.x * s, y = b.y * s, rad = P.R * s, col = COLORS[b.id] || '#999';
        const g = ctx.createRadialGradient(x - rad * .35, y - rad * .42, rad * .1, x, y, rad * 1.05);
        if (b.id === 0) { g.addColorStop(0, '#fff'); g.addColorStop(1, '#b9c2c9'); }
        else if (b.id === 8) { g.addColorStop(0, '#4a4a55'); g.addColorStop(1, '#000'); }
        else if (b.id > 8) { g.addColorStop(0, '#fff'); g.addColorStop(1, '#c3cad1'); }
        else { g.addColorStop(0, shade(col, .45)); g.addColorStop(.5, col); g.addColorStop(1, shade(col, -.45)); }
        ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fillStyle = g; ctx.fill();
        if (b.id > 8 && b.id !== 8) { ctx.save(); ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.clip(); ctx.fillStyle = col; ctx.fillRect(x - rad, y - rad * .52, rad * 2, rad * 1.04); ctx.restore(); }
      }
      const cue = r.balls.find((b: any) => b.id === 0);
      if (aim.current && cue) {
        const dx = aim.current.x - cue.x, dy = aim.current.y - cue.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len > .5) {
          ctx.strokeStyle = 'rgba(34,211,238,.95)'; ctx.lineWidth = 2;
          ctx.setLineDash([s, s * .6]);
          ctx.beginPath(); ctx.moveTo(cue.x * s, cue.y * s); ctx.lineTo((cue.x + dx / len * len) * s, (cue.y + dy / len * len) * s); ctx.stroke();
          ctx.setLineDash([]);
        }
      }
    };
    const fit = () => {
      const w = cv.parentElement!.clientWidth || 320;
      const dpr = Math.min(2, devicePixelRatio || 1);
      cv.width = Math.round(w * dpr); cv.height = Math.round(w * 2 * dpr);
      cv.style.height = Math.round(w * 2) + 'px';
      draw();
    };
    fit();
    window.addEventListener('resize', fit);
    let raf = 0;
    const loop = () => {
      if (st.current.balls && !P.allStopped(st.current.balls)) { P.step(st.current.balls); raf = requestAnimationFrame(loop); }
      draw();
    };
    loop();
    const myTurn = () => st.current && !st.current.over && st.current.turn === st.current.you && st.current.aimable;
    const pos = (e: PointerEvent) => { const rc = cv.getBoundingClientRect(); return { x: (e.clientX - rc.left) / rc.width * P.W, y: (e.clientY - rc.top) / rc.width * P.W }; };
    let aiming = false;
    cv.onpointerdown = e => { if (myTurn()) { aiming = true; aim.current = pos(e); cv.setPointerCapture(e.pointerId); draw(); } };
    cv.onpointermove = e => { if (aiming) { aim.current = pos(e); draw(); } };
    cv.onpointerup = async () => {
      if (!aiming || !aim.current || !myTurn()) return;
      const cue = st.current.balls.find((b: any) => b.id === 0);
      const dx = aim.current.x - cue.x, dy = aim.current.y - cue.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      aim.current = null; aiming = false;
      if (len < 1.5) { draw(); return; }
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      const power = Math.max(8, Math.min(100, len * 1.15));
      cue.vx = Math.cos(angle * Math.PI / 180) * power * .062;
      cue.vy = Math.sin(angle * Math.PI / 180) * power * .062;
      loop();
      try {
        const j = await API.post('/rooms/' + st.current.id + '/move', { angle, power, spinX: spin.current.x, spinY: spin.current.y });
        if (j.state) st.current = { ...st.current, ...j.state };
      } catch (e: any) { toast('ضربة مرفوضة', e.message); }
      loop();
    };
    const scv = spinRef.current!;
    let sd = false;
    const setS = (e: PointerEvent) => {
      const rc = scv.getBoundingClientRect();
      let x = ((e.clientX - rc.left) / rc.width * 120 - 60) / 34;
      let y = ((e.clientY - rc.top) / rc.height * 120 - 60) / 34;
      const l = Math.hypot(x, y), k = l > 1 ? 1 / l : 1;
      spin.current = { x: x * k, y: y * k };
      drawSpin();
    };
    scv.onpointerdown = e => { sd = true; scv.setPointerCapture(e.pointerId); setS(e); };
    scv.onpointermove = e => { if (sd) setS(e); };
    scv.onpointerup = () => { sd = false; };
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', fit); };
  }, [room]);

  if (!room) return (
    <div className="card" style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 40 }}>🎱</div>
      <b>مباراة بلياردو أونلاين</b>
      <div className="sub" style={{ margin: '8px 0 14px' }}>دخول 100 عملة · جائزة 150 · حكم على الخادم (لا غش) · عداد 9 ثوانٍ</div>
      <button className="btn primary wfull" disabled={busy || me.coins < 100} onClick={start}>{busy ? '…' : me.coins < 100 ? 'رصيدك لا يكفي' : 'ابدأ المباراة'}</button>
    </div>
  );

  const r = st.current;
  const myTurn = r && !r.over && r.turn === r.you && r.aimable;
  return (
    <>
      <div className="poolhud">
        <b style={{ fontSize: 10.5 }}>{r.over ? (r.winner === r.you ? '🏆 فزت! +150' : 'خسرت') : myTurn ? 'دورك — اسحب للتسديد' : r.aimable ? 'دور الخصم…' : 'الكرات تتحرك…'}</b>
        <span className="num" style={{ fontSize: 10, color: 'var(--muted)' }}>{msg || ('غرفة ' + r.code)}</span>
      </div>
      <canvas ref={cvRef} className="poolcv" />
      <div className="spinrow">
        <canvas id="spinball-canvas" ref={spinRef} />
        <div><b style={{ fontSize: 13 }}>السبين (يُحسب على الخادم)</b><div className="sub">اسحب النقطة الحمراء لتحديد نقطة الضرب</div></div>
      </div>
      <button className="btn ghost wfull" style={{ marginTop: 10 }} onClick={async () => { try { await API.post('/rooms/leave-active'); } catch (e) {} onRefresh(); setRoom(null); st.current = null; }}>مغادرة</button>
    </>
  );
}
