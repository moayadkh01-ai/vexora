import React, { useEffect, useState } from 'react';
import { API, fmt } from '../api';
import { Me } from '../App';
import { toast } from '../toast';

export default function AdminScreen({ me }: { me: Me }) {
  const [data, setData] = useState<any>(null);
  const [q, setQ] = useState('');
  const load = async (term?: string) => {
    try { setData(await API.get('/admin/overview' + (term ? '?q=' + term : ''))); } catch (e: any) { setData({ error: e.message }); }
  };
  useEffect(() => { load(); }, []);
  if (me.user.role !== 'admin') return <div className="card" style={{ textAlign: 'center' }}><div style={{ fontSize: 30 }}>🔒</div><b>صلاحيات الإدارة مطلوبة</b><div className="sub">سجّل كمسؤول للوصول</div></div>;
  if (!data) return <div className="card">جارٍ التحميل…</div>;
  if (data.error) return <div className="card" style={{ color: 'var(--red)' }}>{data.error}</div>;

  return (
    <>
      <div className="card glow" style={{ marginBottom: 10 }}>
        <b style={{ color: 'var(--gold)' }}>⚙️ لوحة إدارة NoirCue</b>
        <div className="sub">Live · قاعدة بيانات SQLite على الخادم</div>
      </div>
      <div className="kpi" style={{ marginBottom: 12 }}>
        <div className="statbox"><b className="num">{fmt(data.online)}</b><span>متصل الآن</span></div>
        <div className="statbox"><b className="num">{fmt(data.totalUsers)}</b><span>إجمالي الحسابات</span></div>
        <div className="statbox"><b className="num">{fmt(data.matches24)}</b><span>مباريات 24س</span></div>
        <div className="statbox"><b className="num">${(data.revenue / 100).toFixed(0)}</b><span>إيراد</span></div>
      </div>
      <div className="card">
        <b style={{ fontSize: 12, color: 'var(--gold)' }}>نشاط 14 يومًا</b>
        <div className="bar" style={{ height: 60, borderRadius: 10, marginTop: 8 }}>
          {data.dau && data.dau.map((d: any, i: number) => {
            const max = Math.max(...data.dau.map((x: any) => x.count), 1);
            return <div key={i} style={{ display: 'inline-block', width: `${100 / 14}%`, height: `${Math.max(4, d.count / max * 100)}%`, background: 'var(--grad)', borderRadius: 2, margin: '0 1px', verticalAlign: 'bottom' }} title={d.day + ': ' + d.count} />;
          })}
        </div>
      </div>
      {data.recentTx && data.recentTx.length > 0 && (
        <div className="card" style={{ marginTop: 10 }}>
          <b style={{ fontSize: 12, color: 'var(--gold)' }}>آخر المعاملات</b>
          <div style={{ overflowX: 'auto' }}>
            <table className="adm">
              <tr><th>اللاعب</th><th>الحركة</th><th>المبلغ</th></tr>
              {data.recentTx.slice(0, 8).map((t: any, i: number) => (
                <tr key={i}><td>{t.username}</td><td style={{ maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.reason}</td>
                <td style={{ color: t.delta >= 0 ? 'var(--green)' : 'var(--red)', fontWeight: 800 }}>{t.delta >= 0 ? '+' : ''}{fmt(t.delta)}</td></tr>
              ))}
            </table>
          </div>
        </div>
      )}
    </>
  );
}
