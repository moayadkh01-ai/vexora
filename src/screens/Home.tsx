import React, { useEffect, useState } from 'react';
import { API, fmt } from '../api';
import { Me } from '../App';
import { toast } from '../toast';

export default function HomeScreen({ me, onGo, onRefresh }: { me: Me; onGo: (t: any) => void; onRefresh: () => void }) {
  const [online, setOnline] = useState(0);
  const [rooms, setRooms] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      try { const j = await API.get('/rooms'); setRooms(j.rooms || []); } catch (e) {}
      try { const c = await fetch('/api/config').then(r => r.json()); setOnline((window as any).VX_CFG?.presence || 0); } catch (e) {}
    };
    load();
    const iv = setInterval(load, 15000);
    return () => clearInterval(iv);
  }, []);

  const u = me.user;
  return (
    <>
      <div className="card glow" style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: 'var(--cyan)', letterSpacing: '.2em', fontWeight: 800 }}>أهلاً بك، {u.username}</div>
        <h2 style={{ fontSize: 20, margin: '6px 0 4px' }}>حلبة <span style={{ background: 'var(--grad)', WebkitBackgroundClip: 'text', color: 'transparent' }}>فيكسورا</span></h2>
        <div className="sub">٥ ألعاب مباشرة · دردشة حية · عملات فيكسورا</div>
      </div>

      <div className="statgrid" style={{ marginBottom: 14 }}>
        <div className="statbox"><b className="num">{u.rating}</b><span>التقييم</span></div>
        <div className="statbox"><b className="num">{u.wins}–{u.losses}</b><span>فوز / خسارة</span></div>
        <div className="statbox"><b className="num">{fmt(me.coins)}</b><span>الرصيد</span></div>
        <div className="statbox"><b>{rooms.length}</b><span>غرف ألعاب مفتوحة</span></div>
      </div>

      <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 800, letterSpacing: '.1em', margin: '4px 0 10px' }}>الألعاب — اضغط للعب فورًا</div>

      <div className="gamecard" onClick={() => onGo('pool')}>
        <div className="gi" style={{ background: 'linear-gradient(160deg,#0d3b2e,#071a14)' }}>🎱</div>
        <div className="gt"><b>بلياردو ٨</b><span>طاولة طولية · فيزياء 60FPS · سبين بالسحب</span></div>
        <button className="btn primary small">العب</button>
      </div>
      <div className="gamecard" onClick={() => onGo('chess')}>
        <div className="gi" style={{ background: 'linear-gradient(160deg,#3d4266,#14172b)' }}>♞</div>
        <div className="gt"><b>شطرنج</b><span>مؤقت 13 ثانية · ضد الحاسوب أو أونلاين</span></div>
        <button className="btn primary small">العب</button>
      </div>
      <div className="gamecard" onClick={() => onGo('rooms')}>
        <div className="gi" style={{ background: 'linear-gradient(160deg,#4a3a2a,#1c150d)' }}>🛋️</div>
        <div className="gt"><b>الغرف — دردشة حية</b><span>10 غرف · رسائل فورية عبر WebSockets</span></div>
        <button className="btn primary small">ادخل</button>
      </div>
      <div className="gamecard" onClick={() => onGo('me')}>
        <div className="gi" style={{ background: 'linear-gradient(160deg,#20306b,#0b0e1c)' }}>🛍️</div>
        <div className="gt"><b>المتجر والمحفظة</b><span>مكافأة يومية · حزم عملات · عصي وإيموجي</span></div>
        <button className="btn gold small">المتجر</button>
      </div>
    </>
  );
}
