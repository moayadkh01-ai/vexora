/* NoirCue MainApp — unified SPA: 6-tab fixed bottom nav */
import React, { useEffect, useState, useCallback } from 'react';
import { API, fmt } from './api';
import { rt, setRTToken } from './rt';
import { toast } from './toast';
import AuthScreen from './screens/Auth';
import HomeScreen from './screens/Home';
import StoreScreen from './screens/Store';
import WalletScreen from './screens/Wallet';
import RoomsScreen from './screens/Rooms';
import FriendsScreen from './screens/Friends';
import AdminScreen from './screens/Admin';
import PoolScreen from './screens/Pool';
import ChessScreen from './screens/Chess';

export interface Me {
  user: { id: number; username: string; rating: number; level: number; wins: number; losses: number; vip: string | null; role: string };
  coins: number;
  unread: number;
  inventory: any[];
}

type Tab = 'home' | 'store' | 'wallet' | 'rooms' | 'friends' | 'admin' | 'pool' | 'chess';

export default function App() {
  const [booted, setBooted] = useState(false);
  const [me, setMe] = useState<Me | null>(null);
  const [tab, setTab] = useState<Tab>('home');

  const refreshMe = useCallback(async () => {
    if (!API.token) return;
    try { setMe(await API.get<Me>('/me')); } catch (e: any) { if (e.status === 401) logoutLocal(); }
  }, []);

  const logoutLocal = () => {
    API.token = null; setRTToken(null); rt.disconnect();
    try { localStorage.removeItem('noircue_token'); } catch (e) {}
    setMe(null);
  };

  useEffect(() => {
    (async () => {
      try { (window as any).VX_CFG = await fetch('/api/config').then(r => r.json()); } catch (e) {}
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

  if (!booted) return <Boot />;
  if (!me) return <AuthScreen onAuthed={async () => { setRTToken(API.token); rt.connect(API.token); await refreshMe(); }} />;

  const NAV: [Tab, string, string][] = [
    ['home', '🏠', 'الرئيسية'],
    ['store', '🛍️', 'المتجر'],
    ['wallet', '👛', 'المحفظة'],
    ['rooms', '💬', 'الغرف'],
    ['friends', '👥', 'الأصدقاء'],
    ['admin', '⚙️', 'الإدارة']
  ];

  return (
    <>
      <header className="appbar">
        <div><span className="brand">NoirCue</span> <span className="brand-ar">نواركيو</span></div>
        <span className="coinpill"><span className="coin-ic"></span><span className="num">{fmt(me.coins)}</span></span>
      </header>
      <main className="app-main">
        {tab === 'home' && <HomeScreen me={me} onGo={setTab} />}
        {tab === 'store' && <StoreScreen me={me} onRefresh={refreshMe} />}
        {tab === 'wallet' && <WalletScreen me={me} onRefresh={refreshMe} />}
        {tab === 'rooms' && <RoomsScreen me={me} />}
        {tab === 'friends' && <FriendsScreen me={me} />}
        {tab === 'admin' && <AdminScreen me={me} />}
        {tab === 'pool' && <PoolScreen me={me} onBack={() => setTab('home')} onRefresh={refreshMe} />}
        {tab === 'chess' && <ChessScreen me={me} onBack={() => setTab('home')} />}
      </main>
      <nav className="bottomnav">
        {NAV.map(([id, ic, lb]) => (
          <a key={id} className={tab === id ? 'active' : ''} onClick={() => setTab(id)}>
            <span className="navorb">{ic}</span><span>{lb}</span>
          </a>
        ))}
      </nav>
    </>
  );
}

function Boot() {
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14 }}>
      <div style={{ width: 72, height: 72, borderRadius: 20, background: '#0c0c12', border: '2px solid #d4af37', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, fontWeight: 900, color: '#d4af37' }}>NC</div>
      <div style={{ fontWeight: 900, letterSpacing: '.2em', fontSize: 22, color: '#d4af37' }}>NoirCue</div>
      <div style={{ fontSize: 10, color: '#9a968a', letterSpacing: '.35em' }}>نواركيو · جارٍ التحميل…</div>
    </div>
  );
}
export { toast };
