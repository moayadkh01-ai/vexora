/* VEXORA MainApp — single integrated app shell:
   auth → bottom nav (Home · Pool · Chess · Rooms · Me) + realtime */
import React, { useEffect, useState, useCallback } from 'react';
import { API, fmt } from './api';
import { rt, setRTToken } from './rt';
import { toast } from './toast';
import AuthScreen from './screens/Auth';
import HomeScreen from './screens/Home';
import PoolScreen from './screens/Pool';
import ChessScreen from './screens/Chess';
import RoomsScreen from './screens/Rooms';
import MeScreen from './screens/Me';

export interface Me {
  user: { id: number; username: string; rating: number; level: number; wins: number; losses: number; vip: string | null; role: string };
  coins: number;
  unread: number;
  inventory: any[];
  activeRoom: any | null;
}

type Tab = 'home' | 'pool' | 'chess' | 'rooms' | 'me';

export default function App() {
  const [booted, setBooted] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState<Tab>('home');

  const refreshMe = useCallback(async () => {
    if (!API.token) return;
    try { setMe(await API.get<Me>('/me')); } catch (e: any) { if (e.status === 401) { logoutLocal(); } }
  }, []);

  const logoutLocal = () => {
    API.token = null; setRTToken(null); rt.disconnect();
    try { localStorage.removeItem('vexora_token'); } catch (e) {}
    setMe(null);
  };

  useEffect(() => {
    (async () => {
      try {
        const cfg = await fetch('/api/config').then(r => r.json());
        (window as any).VX_CFG = cfg;
      } catch (e) {}
      if (API.token) {
        try {
          const m = await API.get<Me>('/me');
          setMe(m); setRTToken(API.token); rt.connect(API.token);
        } catch (e) { API.token = null; }
      }
      setBooted(true);
    })();
    const off = rt.on(ev => { if (ev.type === 'wallet:update') refreshMe(); });
    return () => { off(); };
  }, []);

  useEffect(() => { if (me) refreshMe(); }, [tab]);

  if (!booted) return <BootSplash />;
  if (!me) return <AuthScreen onAuthed={async () => { setRTToken(API.token); rt.connect(API.token); await refreshMe(); }} />;

  const NAV: [Tab, string, string][] = [
    ['home', '🏠', 'الرئيسية'],
    ['pool', '🎱', 'بلياردو'],
    ['chess', '♞', 'شطرنج'],
    ['rooms', '💬', 'الغرف'],
    ['me', '👤', 'حسابي']
  ];

  return (
    <>
      <header className="appbar">
        <b>VEXORA</b>
        <span style={{ fontSize: 9, color: 'var(--muted)', letterSpacing: '.4em' }}>فيكسورا</span>
        <span className="coinpill"><span className="coin-ic"></span><span className="num">{fmt(me.coins)}</span></span>
      </header>
      <main className="app-main">
        {tab === 'home' && <HomeScreen me={me} onGo={setTab} onRefresh={refreshMe} />}
        {tab === 'pool' && <PoolScreen me={me} onRefresh={refreshMe} />}
        {tab === 'chess' && <ChessScreen me={me} />}
        {tab === 'rooms' && <RoomsScreen me={me} />}
        {tab === 'me' && <MeScreen me={me} onRefresh={refreshMe} onLogout={async () => { try { await API.post('/auth/logout'); } catch (e) {} logoutLocal(); }} />}
      </main>
      <nav className="bottomnav">
        {NAV.map(([id, ic, lb]) => (
          <a key={id} href={'#/' + id} className={tab === id ? 'active' : ''} onClick={e => { e.preventDefault(); setTab(id); }}>
            <span className="navorb">{ic}</span>
            <span>{lb}</span>
          </a>
        ))}
      </nav>
    </>
  );
}

function BootSplash() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16 }}>
      <div style={{ width: 84, height: 84, borderRadius: 24, background: 'var(--grad)', clipPath: 'polygon(50% 2%,93% 26%,93% 74%,50% 98%,7% 74%,7% 26%)' }} />
      <div style={{ fontWeight: 900, letterSpacing: '.3em', fontSize: 24 }}>VEXORA</div>
      <div style={{ fontSize: 11, color: 'var(--muted)', letterSpacing: '.4em' }}>جارٍ التحميل…</div>
    </div>
  );
}

export { toast };
