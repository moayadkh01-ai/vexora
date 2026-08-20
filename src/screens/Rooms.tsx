import React, { useEffect, useRef, useState } from 'react';
import { API } from '../api';
import { Me } from '../App';
import { toast } from '../toast';
import { rt } from '../rt';

interface RoomInfo { id: number; name: string; emoji: string; msgs: number; last: { text: string; name: string } | null; }
interface Msg { id: number; room_id: number; name: string; text: string; created_at: number; }

export default function RoomsScreen({ me }: { me: Me }) {
  const [rooms, setRooms] = useState<RoomInfo[] | null>(null);
  const [open, setOpen] = useState<number | null>(null);
  const [msgs, setMsgs] = useState<Record<number, Msg[]>>({});
  const [text, setText] = useState('');
  const boxRef = useRef<HTMLDivElement>(null);

  const loadRooms = async () => { try { const j = await API.get('/chat/rooms'); setRooms(j.rooms || []); } catch (e) {} };
  useEffect(() => { loadRooms(); }, []);
  useEffect(() => {
    const off = rt.on(ev => {
      if (ev.type === 'gchat' && ev.data && ev.data.msg) {
        const m = ev.data.msg;
        setMsgs(prev => {
          const list = prev[m.room_id] || [];
          if (list.some(x => x.id === m.id)) return prev;
          return { ...prev, [m.room_id]: [...list, m].slice(-80) };
        });
        loadRooms();
      }
    });
    return () => { off(); };
  }, []);
  useEffect(() => {
    (async () => { if (open === null || msgs[open]) return;
      try { const j = await API.get('/chat/rooms/' + open + '/messages'); setMsgs(prev => ({ ...prev, [open]: j.messages || [] })); } catch (e) {}
    })();
  }, [open]);
  useEffect(() => { if (boxRef.current) boxRef.current.scrollTop = boxRef.current.scrollHeight; }, [msgs, open]);

  const send = async () => {
    const t = text.trim(); if (!t || open === null) return; setText('');
    try { await API.post('/chat/rooms/' + open + '/messages', { text: t }); } catch (e: any) { toast('لم تُرسل', e.message); }
  };

  if (open === null) return (
    <>
      <div className="card glow" style={{ marginBottom: 12 }}>
        <b style={{ color: 'var(--gold)' }}>💬 الغرف — NoirCue Chat</b>
        <div className="sub">10 غرف · رسائل فورية</div>
      </div>
      {(rooms || []).map(rm => (
        <div key={rm.id} className="roomcard" onClick={() => setOpen(rm.id)}>
          <span className="re">{rm.emoji}</span>
          <span className="rt"><b>غرفة {rm.id}</b><span>{rm.last ? rm.last.name + ': ' + rm.last.text : 'ابدأ أول دردشة ✓'}</span><span className="num" style={{ fontSize: 9.5 }}>{rm.msgs} رسالة</span></span>
          <span style={{ color: 'var(--gold)', fontSize: 16 }}>←</span>
        </div>
      ))}
      {!rooms && <div className="card">جارٍ التحميل…</div>}
    </>
  );

  const room = (rooms || []).find(x => x.id === open);
  const list = msgs[open] || [];
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9 }}>
        <button className="btn ghost small" onClick={() => setOpen(null)}>→ الغرف</button>
        <span style={{ fontSize: 20 }}>{room?.emoji || '💬'}</span>
        <div style={{ flex: 1, minWidth: 0 }}><b style={{ fontSize: 13 }}>غرفة {open}</b></div>
      </div>
      <div className="card chatwin">
        <div className="chatmsgs" ref={boxRef}>
          {list.length ? list.map(m => (
            <div key={m.id} className={'bubble' + (m.name === me.user.username ? ' me' : '')}><b>{m.name}</b>{m.text}</div>
          )) : <div className="sub" style={{ textAlign: 'center', padding: 16 }}>لا رسائل — اكتب أول دردشة 👇</div>}
        </div>
        <div className="chatin">
          <input value={text} maxLength={400} placeholder="اكتب رسالتك…" onChange={e => setText(e.target.value)} onKeyDown={e => e.key === 'Enter' && send()} />
          <button className="btn primary small" onClick={send}>إرسال</button>
        </div>
      </div>
    </>
  );
}
