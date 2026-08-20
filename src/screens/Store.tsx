import React, { useEffect, useState } from 'react';
import { API, fmt } from '../api';
import { Me } from '../App';
import { toast } from '../toast';

export default function StoreScreen({ me, onRefresh }: { me: Me; onRefresh: () => void }) {
  const [items, setItems] = useState<any[]>([]);
  const [tab, setTab] = useState<'packs' | 'vip' | 'gear'>('packs');
  useEffect(() => { (async () => { try { const j = await API.get('/store/catalog'); setItems(j.items || []); } catch (e) {} })(); }, []);

  const buy = async (id: string) => {
    try { await API.post('/store/buy', { item_id: id }); toast('تم الشراء ✓', 'أُضيف لجرديك'); onRefresh(); }
    catch (e: any) { toast('فشل', e.message); }
  };
  const buyCash = async (id: string) => {
    try {
      const ord = await API.post('/pay/create-order', { item_id: id, provider: 'manual' });
      await API.post('/pay/simulate/' + ord.order.id);
      toast('تم الدفع ✓', 'استلمت مشترياتك'); onRefresh();
    } catch (e: any) { toast('فشل الدفع', e.message); }
  };

  const packs = items.filter(i => i.kind === 'pack');
  const vips = items.filter(i => i.kind === 'vip');
  const gear = items.filter(i => ['stick', 'emoji', 'theme'].includes(i.kind));
  const owned = new Set((me.inventory || []).map((x: any) => x.item_id));

  return (
    <>
      <div className="card glow" style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div><b style={{ color: 'var(--gold)' }}>متجر NoirCue</b><div className="sub">كل المشتريات تُسجَّل في محفظتك</div></div>
        <span className="coinpill"><span className="coin-ic"></span><span className="num">{fmt(me.coins)}</span></span>
      </div>
      <div className="spinbtnrow" style={{ marginBottom: 12 }}>
        <button className={'modebtn' + (tab === 'packs' ? ' on' : '')} onClick={() => setTab('packs')}>العملات</button>
        <button className={'modebtn' + (tab === 'vip' ? ' on' : '')} onClick={() => setTab('vip')}>VIP</button>
        <button className={'modebtn' + (tab === 'gear' ? ' on' : '')} onClick={() => setTab('gear')}>العتاد</button>
      </div>
      {tab === 'packs' && (
        <div className="packgrid">
          {packs.map(p => (
            <div key={p.id} className="pack">
              <div className="amt num">{fmt(p.coins)}</div>
              {p.bonus_pct ? <div style={{ fontSize: 10, color: 'var(--green)' }}>+{p.bonus_pct}%</div> : null}
              <div className="pr num">{(p.price_usd_cents / 100).toFixed(2)}$</div>
              <button className="btn gold small wfull" onClick={() => buyCash(p.id)}>شراء</button>
            </div>
          ))}
        </div>
      )}
      {tab === 'vip' && vips.map(v => (
        <div key={v.id} className="gamecard">
          <div className="gi" style={{ background: 'rgba(212,175,55,.1)', color: 'var(--gold)', fontWeight: 900 }}>{v.vip_tier === 'plat' ? '⚡' : v.vip_tier === 'gold' ? '👑' : '⭐'}</div>
          <div className="gt"><b>{v.name_ar}</b><span>{v.desc_ar}</span></div>
          <button className="btn gold small" onClick={() => buyCash(v.id)}>{(v.price_usd_cents / 100).toFixed(0)}$</button>
        </div>
      ))}
      {tab === 'gear' && (
        <div className="packgrid">
          {gear.map(g => (
            <div key={g.id} className="pack">
              <div style={{ fontSize: 22 }}>{g.kind === 'stick' ? '🎱' : g.kind === 'emoji' ? '🎭' : '🎨'}</div>
              <b style={{ fontSize: 12 }}>{g.name_ar}</b>
              {owned.has(g.id)
                ? <span style={{ fontSize: 10, color: 'var(--green)', fontWeight: 800 }}>✓ مملوك</span>
                : <button className="btn primary small wfull" onClick={() => buy(g.id)}><span className="num">{fmt(g.price_vc)}</span></button>}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
