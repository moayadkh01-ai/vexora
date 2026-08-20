/* Me — profile, wallet, daily bonus, quick store (same server economy) */
import React, { useEffect, useState } from 'react';
import { API, fmt } from '../api';
import { Me as MeT } from '../App';
import { toast } from '../toast';

export default function MeScreen({ me, onRefresh, onLogout }: { me: MeT; onRefresh: () => void; onLogout: () => void }) {
  const [wallet, setWallet] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);

  useEffect(() => {
    (async () => {
      try { setWallet(await API.get('/wallet')); } catch (e) {}
      try { const j = await API.get('/store/catalog'); setItems(j.items || []); } catch (e) {}
    })();
  }, []);

  const daily = async () => {
    try {
      const j = await API.post('/wallet/daily');
      toast('+' + fmt(j.amount) + ' عملة', 'المكافأة اليومية');
      onRefresh();
      setWallet(await API.get('/wallet'));
    } catch (e: any) { toast('لا يمكن الآن', e.message); }
  };

  const buy = async (id: string) => {
    try {
      await API.post('/store/buy', { item_id: id });
      toast('تم الشراء ✓', 'أُضيف لجرديك');
      onRefresh();
    } catch (e: any) { toast('فشل الشراء', e.message); }
  };

  const u = me.user;
  const vcItems = items.filter(i => i.price_vc > 0 && ['stick', 'emoji', 'theme'].includes(i.kind)).slice(0, 6);

  return (
    <>
      <div className="card glow" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
        <span style={{ width: 56, height: 56, borderRadius: 18, background: 'var(--grad)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, fontSize: 24 }}>{u.username[0].toUpperCase()}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <b style={{ fontSize: 16 }}>{u.username} {u.vip ? '· ' + u.vip.toUpperCase() + ' VIP' : ''}</b>
          <div className="sub">مستوى {u.level} · تصنيف {u.rating} · {u.wins}ف / {u.losses}خ</div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 12, textAlign: 'center', borderColor: 'rgba(255,201,69,.35)' }}>
        <div style={{ fontSize: 11, color: 'var(--gold)', fontWeight: 800, letterSpacing: '.2em' }}>محفظة عملات نواركيو</div>
        <div style={{ fontSize: 32, fontWeight: 900, color: 'var(--gold)' }} className="num">{fmt(me.coins)}</div>
        <button className={'btn ' + (wallet && wallet.can_daily ? 'primary' : 'ghost')} style={{ marginTop: 10 }} disabled={!(wallet && wallet.can_daily)} onClick={daily}>
          🎁 {wallet && wallet.can_daily ? 'استلم المكافأة اليومية' : 'استلمتها — عد لاحقًا'}
        </button>
      </div>

      <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 800, margin: '16px 0 10px' }}>متجر نواركيو — عناصر بالعملات</div>
      {vcItems.map(it => (
        <div key={it.id} className="gamecard" onClick={() => buy(it.id)}>
          <div className="gi" style={{ background: 'var(--glass)', fontSize: 20 }}>{it.kind === 'stick' ? '🎱' : it.kind === 'emoji' ? '😀' : '🎨'}</div>
          <div className="gt"><b>{it.name_ar}</b><span>{it.desc_ar}</span></div>
          <button className="btn gold small"><span className="num">{fmt(it.price_vc)}</span></button>
        </div>
      ))}

      {wallet && wallet.tx && wallet.tx.length ? (
        <>
          <div style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 800, margin: '16px 0 8px' }}>آخر المعاملات</div>
          <div className="card">
            {wallet.tx.slice(0, 10).map((t: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: i < 9 ? '1px solid rgba(150,163,220,.08)' : 'none', fontSize: 12.5 }}>
                <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.reason}</span>
                <b className="num" style={{ color: t.delta >= 0 ? 'var(--green)' : 'var(--red)', flexShrink: 0 }}>{t.delta >= 0 ? '+' : ''}{fmt(t.delta)}</b>
              </div>
            ))}
          </div>
        </>
      ) : null}

      <button className="btn ghost wfull" style={{ marginTop: 16 }} onClick={onLogout}>تسجيل الخروج</button>
      <div style={{ textAlign: 'center', fontSize: 10, color: 'var(--muted)', marginTop: 14 }}>NoirCue · نواركيو · v2-integrated</div>
    </>
  );
}
