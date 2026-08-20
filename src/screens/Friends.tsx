import React, { useEffect, useState } from 'react';
import { API } from '../api';
import { Me } from '../App';
import { toast } from '../toast';

export default function FriendsScreen({ me }: { me: Me }) {
  const [data, setData] = useState<any>(null);
  const [name, setName] = useState('');
  const load = async () => { try { setData(await API.get('/friends')); } catch (e) {} };
  useEffect(() => { load(); }, []);

  const add = async () => {
    if (!name.trim()) return;
    try { await API.post('/friends/request', { username: name.trim() }); toast('أُرسل الطلب ✓', name); setName(''); load(); }
    catch (e: any) { toast('تعذر', e.message); }
  };
  const respond = async (id: number, ok: boolean) => {
    try { await API.post('/friends/respond', { id, accept: ok }); load(); } catch (e: any) { toast('خطأ', e.message); }
  };
  const remove = async (id: number) => {
    try { await API.del('/friends/' + id); load(); } catch (e: any) { toast('خطأ', e.message); }
  };

  if (!data) return <div className="card">جارٍ التحميل…</div>;
  return (
    <>
      <div className="card" style={{ marginBottom: 12 }}>
        <b style={{ fontSize: 13, color: 'var(--gold)' }}>إضافة صديق</b>
        <div style={{ display: 'flex', gap: 7, marginTop: 8 }}>
          <input className="chatin" style={{ flex: 1, background: 'rgba(8,8,13,.7)', border: '1px solid rgba(212,175,55,.2)', borderRadius: 11, padding: '10px 12px', color: 'var(--text)', outline: 'none', fontSize: 13 }} placeholder="اسم اللاعب" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && add()} />
          <button className="btn primary small" onClick={add}>إرسال</button>
        </div>
      </div>
      {data.incoming && data.incoming.length > 0 && (
        <div className="card" style={{ marginBottom: 12 }}>
          <b style={{ fontSize: 12, color: 'var(--gold)' }}>طلبات واردة</b>
          {data.incoming.map((r: any) => (
            <div key={r.id} className="frrow">
              <span className="ava">{r.from.username[0]}</span>
              <span style={{ flex: 1, fontWeight: 700, fontSize: 13 }}>{r.from.username}</span>
              <button className="btn primary small" onClick={() => respond(r.id, true)}>قبول</button>
              <button className="btn ghost small" onClick={() => respond(r.id, false)}>رفض</button>
            </div>
          ))}
        </div>
      )}
      <div className="card">
        <b style={{ fontSize: 12, color: 'var(--gold)' }}>أصدقائي ({(data.friends || []).length})</b>
        {(data.friends || []).map((f: any) => (
          <div key={f.id} className="frrow">
            <span className="ava">{f.user.username[0]}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <b style={{ fontSize: 13 }}>{f.user.username}</b>
              <div style={{ fontSize: 10, color: 'var(--muted)' }}><span className={'onl' + (f.user.online ? '' : ' off')} style={{ marginRight: 4 }}></span>{f.user.online ? 'متصل' : 'غير متصل'} · {f.user.rating}</div>
            </div>
            <button className="btn ghost small" onClick={() => remove(f.id)}>حذف</button>
          </div>
        ))}
        {(!data.friends || !data.friends.length) && <div className="sub" style={{ textAlign: 'center', padding: 12 }}>لا أصدقاء بعد</div>}
      </div>
    </>
  );
}
