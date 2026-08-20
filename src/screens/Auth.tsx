import React, { useState } from 'react';
import { API } from '../api';

export default function AuthScreen({ onAuthed }: { onAuthed: () => void }) {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [u, setU] = useState('');
  const [e, setE] = useState('');
  const [p, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setErr(''); setBusy(true);
    try {
      const j = mode === 'login'
        ? await API.post('/auth/login', { id: u, password: p })
        : await API.post('/auth/register', { username: u, email: e, password: p });
      API.token = j.token;
      try { localStorage.setItem('vexora_token', j.token); } catch (x) {}
      onAuthed();
    } catch (ex: any) { setErr(ex.message || 'خطأ'); }
    setBusy(false);
  };

  const quick = async () => {
    setErr(''); setBusy(true);
    try {
      const n = 'Player_' + Math.floor(10000 + Math.random() * 89999);
      const j = await API.post('/auth/register', { username: n, email: n.toLowerCase() + '@quick.vexora.gg', password: 'vexora-' + Math.floor(1000 + Math.random() * 8999) });
      API.token = j.token;
      try { localStorage.setItem('vexora_token', j.token); } catch (x) {}
      onAuthed();
    } catch (ex: any) { setErr(ex.message); }
    setBusy(false);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <div style={{ width: 76, height: 76, borderRadius: 22, background: 'var(--grad)', clipPath: 'polygon(50% 2%,93% 26%,93% 74%,50% 98%,7% 74%,7% 26%)', marginBottom: 14 }} />
      <div style={{ fontWeight: 900, letterSpacing: '.3em', fontSize: 26 }}>VEXORA</div>
      <div style={{ fontSize: 10, color: 'var(--muted)', letterSpacing: '.45em', marginBottom: 22 }}>فيكسورا · العب بلا حدود</div>
      <div className="card glow" style={{ width: 'min(420px,100%)' }}>
        <div className="spinbtnrow" style={{ marginBottom: 14 }}>
          <button className={'modebtn' + (mode === 'login' ? ' on' : '')} onClick={() => setMode('login')}>تسجيل الدخول</button>
          <button className={'modebtn' + (mode === 'register' ? ' on' : '')} onClick={() => setMode('register')}>حساب جديد</button>
        </div>
        <input style={inp} placeholder={mode === 'login' ? 'الاسم أو البريد' : 'اسم المستخدم (٣-٢٠)'} value={u} onChange={ev => setU(ev.target.value)} />
        {mode === 'register' && <input style={inp} type="email" placeholder="البريد الإلكتروني" value={e} onChange={ev => setE(ev.target.value)} />}
        <input style={inp} type="password" placeholder="كلمة المرور" value={p} onChange={ev => setP(ev.target.value)} />
        {err && <div style={{ color: 'var(--red)', fontSize: 12, margin: '6px 0' }}>{err}</div>}
        <button className="btn primary wfull" disabled={busy} onClick={submit} style={{ marginTop: 10 }}>
          {busy ? '…' : mode === 'login' ? 'دخول' : 'إنشاء حساب +1000 عملة'}
        </button>
        <button className="btn ghost wfull" disabled={busy} onClick={quick} style={{ marginTop: 10 }}>⚡ حساب فوري والعب</button>
      </div>
    </div>
  );
}
const inp: React.CSSProperties = {
  width: '100%', padding: '12px 14px', borderRadius: 12, border: '1px solid var(--line2)',
  background: 'rgba(10,13,28,.7)', color: 'var(--text)', outline: 'none', fontSize: 15, marginBottom: 10
};
