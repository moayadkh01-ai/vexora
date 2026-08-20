/* VEXORA realtime — WebSocket with automatic long-poll fallback (same protocol as backend) */
type Handler = (ev: { type: string; data: any }) => void;

export class RT {
  private ws: WebSocket | null = null;
  private cursor = 0;
  private mode: 'ws' | 'poll' | 'off' = 'off';
  private handlers = new Set<Handler>();
  private timer: any = null;

  on(h: Handler) { this.handlers.add(h); return () => this.handlers.delete(h); }

  connect(token: string) {
    this.disconnect();
    try {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      this.ws = new WebSocket(proto + '://' + location.host + '/rt?token=' + encodeURIComponent(token));
      this.mode = 'ws';
      const fallback = setTimeout(() => { if (this.mode !== 'ws') return; try { this.ws!.close(); } catch (e) {} this.startPoll(); }, 4000);
      this.ws.onopen = () => { clearTimeout(fallback); this.hb(); };
      this.ws.onmessage = (m) => {
        try {
          const p = JSON.parse(m.data);
          if (p.t === 'event' && p.ev) this.dispatch(p.ev);
        } catch (e) {}
      };
      this.ws.onclose = () => { if (this.mode === 'ws') setTimeout(() => this.connect(token), 2000); };
      this.ws.onerror = () => {};
    } catch (e) { this.startPoll(); }
  }
  private hb() { if (this.ws && this.ws.readyState === 1) { this.ws.send('{"t":"hb"}'); setTimeout(() => this.hb(), 20000); } }
  private startPoll() {
    if (!API_TOKEN) return;
    this.mode = 'poll';
    const loop = async () => {
      try {
        const r = await fetch('/api/rt/poll?cur=' + this.cursor + '&timeout=15', { headers: { Authorization: 'Bearer ' + API_TOKEN } });
        const j = await r.json();
        (j.events || []).forEach((ev: any) => { this.cursor = Math.max(this.cursor, ev.seq); this.dispatch(ev); });
      } catch (e) { await new Promise(res => setTimeout(res, 1500)); }
      this.timer = setTimeout(loop, 300);
    };
    loop();
  }
  private dispatch(ev: any) { this.handlers.forEach(h => { try { h(ev); } catch (e) {} }); }
  disconnect() { this.mode = 'off'; clearTimeout(this.timer); if (this.ws) { try { this.ws.onclose = null; this.ws.close(); } catch (e) {} this.ws = null; } }
}

let API_TOKEN: string | null = null;
export function setRTToken(t: string | null) { API_TOKEN = t; }

export const rt = new RT();
