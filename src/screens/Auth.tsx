import React, { useState } from 'react';
import { API } from '../api';

export default function AuthScreen({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [u, setU] = useState(''); const [e, setE] = useState(''); const [p, setP] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      const j = mode === 'login'
        ? await API.post('/auth/login', { id: u, password: p })
        : await API.post('/auth/register', { username: u, email: e, password: p });
      API.token = j.token;
      try { localStorage.setItem('noircue_token', j.token); } catch (x) {}
      onAuthed();
    } catch (ex: any) { setErr(ex.message); }
    setBusy(false);
  };

  const quick = async () => {
    setErr(''); setBusy(true);
    try {
      const n = 'Player_' + Math.floor(10000 + Math.random() * 89999);
      const j = await API.post('/auth/register', { username: n, email: n.toLowerCase() + '@q.noircue.app', password: 'nc-' + Math.floor(1000 + Math.random() * 8999) });
      API.token = j.token;
      try { localStorage.setItem('noircue_token', j.token); } catch (x) {}
      onAuthed();
    } catch (ex: any) { setErr(ex.message); }
    setBusy(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 18 }}>
      <div style={{ width: 68, height: 68, borderRadius: 18, background: '#0c0c12', border: '2px solid #d4af37', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, fontWeight: 900, color: '#d4af37', marginBottom: 12 }}>NC</div>
      <div style={{ fontWeight: 900, letterSpacing: '.25em', fontSize: 23, color: '#d4af37' }}>NoirCue</div>
      <div style={{ fontSize: 10, color: '#9a968a', letterSpacing: '.4em', marginBottom: 20 }}>نواركيو</div>
      <div className="card glow" style={{ width: 'min(400px,100%)' }}>
        <div className="spinbtnrow" style={{ marginBottom: 12 }}>
          <button className={'modebtn' + (mode === 'login' ? ' on' : '')} onClick={() => setMode('login')}>تسجيل الدخول</button>
          <button className={'modebtn' + (mode === 'register' ? ' on' : '')} onClick={() => setMode('register')}>حساب جديد</button>
        </div>
        <input style={inp} placeholder={mode === 'login' ? 'الاسم أو البريد' : 'اسم المستخدم'} value={u} onChange={ev => setU(ev.target.value)} />
        {mode === 'register' && <input style={inp} type="email" placeholder="البريد الإلكتروني" value={e} onChange={ev => setE(ev.target.value)} />}
        <input style={inp} type="password" placeholder="كلمة المرور" value={p} onChange={ev => setP(ev.target.value)} />
        {err && <div style={{ color: '#e05c6e', fontSize: 11.5, margin: '5px 0' }}>{err}</div>}
        <button className="btn primary wfull" disabled={busy} onClick={submit} style={{ marginTop: 8 }}>{busy ? '…' : mode === 'login' ? 'دخول' : 'إنشاء حساب'}</button>
        <button className="btn ghost wfull" disabled={busy} onClick={quick} style={{ marginTop: 8 }}>⚡ حساب فوري</button>
      </div>
    </div>
  );
}
const inp: React.CSSProperties = { width: '100%', padding: '11px 13px', borderRadius: 11, border: '1px solid rgba(212,175,55,.2)', background: 'rgba(8,8,13,.7)', color: '#f0ede4', outline: 'none', fontSize: 14, marginBottom: 9 };
