import React, { useEffect, useState } from 'react';
import { API, fmt } from '../api';
import { Me } from '../App';

export default function HomeScreen({ me, onGo }: { me: Me; onGo: (t: any) => void }) {
  const [lb, setLb] = useState<any[]>([]);
  const [rooms, setRooms] = useState(0);
  useEffect(() => {
    const load = async () => {
      try { const j = await API.get('/leaderboard'); setLb(j.top || []); } catch (e) {}
      try { const j = await API.get('/rooms'); setRooms((j.rooms || []).length); } catch (e) {}
    };
    load();
  }, []);
  const u = me.user;
  return (
    <>
      <div className="card glow" style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 10, color: 'var(--gold)', fontWeight: 800, letterSpacing: '.15em' }}>أهلاً بك، {u.username}</div>
        <h2 style={{ fontSize: 18, margin: '5px 0 3px' }}>حلبة <span style={{ color: 'var(--gold)' }}>NoirCue</span></h2>
        <div className="sub">5 ألعاب مباشرة · غرف حية · عملات NoirCue</div>
      </div>
      <div className="statgrid">
        <div className="statbox"><b className="num">{u.rating}</b><span>التقييم</span></div>
        <div className="statbox"><b className="num">{u.wins}–{u.losses}</b><span>ف/خ</span></div>
        <div className="statbox"><b className="num">{fmt(me.coins)}</b><span>الرصيد</span></div>
        <div className="statbox"><b>{rooms}</b><span>غرف مفتوحة</span></div>
      </div>
      <div style={{ fontSize: 11, color: 'var(--muted)', fontWeight: 800, margin: '2px 0 9px' }}>الألعاب</div>
      <div className="gamecard" onClick={() => onGo('pool')}>
        <div className="gi" style={{ background: 'linear-gradient(160deg,#0d2a1e,#07130d)' }}>🎱</div>
        <div className="gt"><b>بلياردو 8</b><span>طاولة طولية · فيزياء 60FPS · سبين</span></div>
        <button className="btn primary small">العب</button>
      </div>
      <div className="gamecard" onClick={() => onGo('chess')}>
        <div className="gi" style={{ background: 'linear-gradient(160deg,#2a2a36,#101018)' }}>♞</div>
        <div className="gt"><b>شطرنج</b><span>مؤقت 13 ثانية · ضد الحاسوب أو أونلاين</span></div>
        <button className="btn primary small">العب</button>
      </div>
      <div className="gamecard" onClick={() => onGo('rooms')}>
        <div className="gi" style={{ background: 'linear-gradient(160deg,#2a2418,#120e08)' }}>🛋️</div>
        <div className="gt"><b>غرف الدردشة</b><span>10 غرف حية · NoirCue Chat</span></div>
        <button className="btn primary small">ادخل</button>
      </div>
      {lb.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <b style={{ fontSize: 12, color: 'var(--gold)', letterSpacing: '.1em' }}>🏆 المتصدرون</b>
          {lb.slice(0, 5).map((p, i) => (
            <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0', borderBottom: '1px solid rgba(212,175,55,.05)' }}>
              <b style={{ color: i < 3 ? 'var(--gold)' : 'var(--muted)', width: 18, fontSize: 12 }}>{i + 1}</b>
              <span style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>{p.username}</span>
              <span className="num" style={{ fontSize: 11.5, color: 'var(--muted)' }}>{p.rating}</span>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
