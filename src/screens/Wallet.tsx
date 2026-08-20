import React, { useEffect, useState } from 'react';
import { API, fmt } from '../api';
import { Me } from '../App';
import { toast } from '../toast';

export default function WalletScreen({ me, onRefresh }: { me: Me; onRefresh: () => void }) {
  const [w, setW] = useState<any>(null);
  const load = async () => { try { setW(await API.get('/wallet')); } catch (e) {} };
  useEffect(() => { load(); }, []);
  const daily = async () => {
    try { const j = await API.post('/wallet/daily'); toast('+' + fmt(j.amount) + ' عملة'); onRefresh(); load(); }
    catch (e: any) { toast('غير متاح', e.message); }
  };
  return (
    <>
      <div className="card glow" style={{ textAlign: 'center', borderColor: 'rgba(212,175,55,.3)', padding: 20 }}>
        <div style={{ fontSize: 10, color: 'var(--gold)', fontWeight: 800, letterSpacing: '.2em' }}>محفظة عملات NoirCue</div>
        <div style={{ fontSize: 34, fontWeight: 900, color: 'var(--gold)', margin: '6px 0' }} className="num">{fmt(me.coins)}</div>
        <div className="sub">محفوظة على الخادم · كل حركة مسجلة</div>
        <button className={'btn ' + (w && w.can_daily ? 'primary' : 'ghost')} style={{ marginTop: 10 }} disabled={!(w && w.can_daily)} onClick={daily}>
          🎁 {w && w.can_daily ? 'استلم المكافأة اليومية' : 'استلمتها — عد لاحقًا'}
        </button>
      </div>
      {w && w.tx && w.tx.length > 0 && (
        <div className="card" style={{ marginTop: 12 }}>
          <b style={{ fontSize: 12, color: 'var(--gold)' }}>آخر المعاملات</b>
          {w.tx.slice(0, 15).map((t: any, i: number) => (
            <div key={i} className="txrow">
              <div className="ti"><b>{t.reason}</b><span>{new Date(t.created_at).toLocaleString('ar')}</span></div>
              <div className="ta" style={{ color: t.delta >= 0 ? 'var(--green)' : 'var(--red)' }}>{t.delta >= 0 ? '+' : ''}{fmt(t.delta)}</div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
