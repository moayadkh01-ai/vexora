#!/usr/bin/env python3
# client: Gamezer-style pool graphics (wood table, 3D balls, spin UI, 9s clock, pocketed HUD)
# + portrait full-width canvas + left-clip responsive fix + rooms click hardening

r = open('public/room.js', encoding='utf-8').read()

# ---------- replace poolBoardHTML + poolInit with v2 ----------
import re
start = r.index('/* ============ 8-BALL POOL (بلياردو ٨) ============ */')
end = r.index('function roomHTML(){')
tail_anchor = "function roomHTML(){\n  const r = S.roomView;"
pool_v2 = '''/* ============ 8-BALL POOL v2 (Gamezer-style) ============ */
const POOL_COLORS = { 1:'#f5c518',2:'#1f6feb',3:'#e5484d',4:'#8b5cf6',5:'#f28c28',6:'#2ea043',7:'#8b1a1a',8:'#111',9:'#f5c518',10:'#1f6feb',11:'#e5484d',12:'#8b5cf6',13:'#f28c28',14:'#2ea043',15:'#8b1a1a' };
let poolToken = 0;
let poolSpin = 0;      /* -1 draw · 0 none · +1 follow */
let poolClockRAF = 0;

function poolBoardHTML(r){
  return '<div class="gstat" id="pool-status"></div>'
    + '<div class="pool-hud" id="pool-hud"></div>'
    + '<div class="pool-clockwrap"><div class="pool-clock" id="pool-clock"></div><span class="pool-clocklbl num" id="pool-clocklbl">9.0</span></div>'
    + '<div class="pool-wrap"><canvas id="pool-canvas"></canvas></div>'
    + '<div class="pool-tools" id="pool-tools">'
    + '<button class="spin-btn' + (poolSpin === -1 ? ' on' : '') + '" onclick="poolSetSpin(-1)">⬆ رجوع<br><small>(Draw)</small></button>'
    + '<button class="spin-btn' + (poolSpin === 0 ? ' on' : '') + '" onclick="poolSetSpin(0)">● بلا<br><small>(عادي)</small></button>'
    + '<button class="spin-btn' + (poolSpin === 1 ? ' on' : '') + '" onclick="poolSetSpin(1)">⬇ تقدم<br><small>(Follow)</small></button>'
    + '</div>'
    + '<div class="pool-hint sub2">اسحب من كرة الضرب لتصويب العصا · طول السحب = القوة · لديك 9 ثوانٍ لكل ضربة</div>'
    + (r.over ? endButtonsHTML(r) : '');
}
function poolSetSpin(v){
  poolSpin = v;
  document.querySelectorAll('.spin-btn').forEach(b => b.classList.remove('on'));
  if (event && event.currentTarget) event.currentTarget.classList.add('on');
  else { const btns = document.querySelectorAll('.spin-btn'); if (btns[v + 1]) btns[v + 1].classList.add('on'); }
}

function poolInit(){
  const r = S.roomView;
  const cv = document.getElementById('pool-canvas');
  if (!cv || !r || !r.balls){ return; }
  const token = ++poolToken;
  const P = window.PoolPhysics;
  const wrap = cv.parentElement;
  let aim = null;

  function fit(){
    let w = wrap.clientWidth || cv.clientWidth || 0;
    if (w < 60) w = Math.min(360, (document.getElementById('root') || {}).clientWidth || 320);
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    cv.width = Math.max(120, Math.round(w * dpr));
    cv.height = Math.max(70, Math.round(w * 0.54 * dpr));
    cv.style.width = '100%';
    cv.style.height = Math.round(w * 0.54) + 'px';
    cv.style.maxWidth = '640px';
    cv.style.margin = '0 auto';
    cv.style.display = 'block';
  }

  function toUnits(px, py){
    return { x: px / cv.clientWidth * P.W, y: py / cv.clientWidth * P.W };
  }

  function drawBall(ctx, b, s){
    const x = b.x * s, y = b.y * s, rad = P.R * s;
    ctx.save();
    /* shadow */
    ctx.beginPath(); ctx.arc(x + rad * 0.18, y + rad * 0.28, rad * 1.02, 0, 7);
    ctx.fillStyle = 'rgba(0,0,0,.38)'; ctx.fill();
    const id = b.id;
    const col = POOL_COLORS[id] || '#999';
    const g = ctx.createRadialGradient(x - rad * 0.35, y - rad * 0.4, rad * 0.1, x, y, rad * 1.05);
    if (id === 0){ g.addColorStop(0, '#ffffff'); g.addColorStop(0.55, '#e9edef'); g.addColorStop(1, '#b9c2c9'); }
    else if (id === 8){ g.addColorStop(0, '#4a4a55'); g.addColorStop(0.4, '#1a1a22'); g.addColorStop(1, '#000'); }
    else if (id > 8){ g.addColorStop(0, '#ffffff'); g.addColorStop(0.45, '#eef1f4'); g.addColorStop(1, '#c3cad1'); }
    else { g.addColorStop(0, lightenHex(col, 0.45)); g.addColorStop(0.5, col); g.addColorStop(1, darkenHex(col, 0.45)); }
    ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.fillStyle = g; ctx.fill();
    if (id > 8 && id !== 0 && id !== 8){          /* stripe band */
      ctx.save(); ctx.beginPath(); ctx.arc(x, y, rad, 0, 7); ctx.clip();
      const bg = ctx.createLinearGradient(x - rad, y, x + rad, y);
      bg.addColorStop(0, darkenHex(col, .25)); bg.addColorStop(.5, col); bg.addColorStop(1, darkenHex(col, .25));
      ctx.fillStyle = bg; ctx.fillRect(x - rad, y - rad * 0.52, rad * 2, rad * 1.04); ctx.restore();
    }
    if (id === 8){                                 /* white 8 disc */
      ctx.beginPath(); ctx.arc(x, y, rad * 0.44, 0, 7); ctx.fillStyle = '#f4f6f8'; ctx.fill();
    }
    if (id !== 0 && rad > 5){
      ctx.fillStyle = (id === 8) ? '#111' : '#fff';
      ctx.font = '900 ' + Math.max(7, Math.round(rad * 0.95)) + 'px Segoe UI,Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(String(id === 8 ? 8 : (id > 8 ? id - 8 : id)), x, y + rad * 0.05);
    }
    /* specular highlight */
    ctx.beginPath(); ctx.arc(x - rad * 0.38, y - rad * 0.42, rad * 0.24, 0, 7);
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fill();
    ctx.beginPath(); ctx.arc(x + rad * 0.3, y + rad * 0.35, rad * 0.12, 0, 7);
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fill();
    ctx.restore();
  }
  function lightenHex(h, f){ return shadeHex(h, f); }
  function darkenHex(h, f){ return shadeHex(h, -f); }
  function shadeHex(h, f){
    const n = parseInt(h.slice(1), 16);
    let r = (n >> 16) & 255, g2 = (n >> 8) & 255, b = n & 255;
    r = Math.round(Math.min(255, Math.max(0, r + 255 * f)));
    g2 = Math.round(Math.min(255, Math.max(0, g2 + 255 * f)));
    b = Math.round(Math.min(255, Math.max(0, b + 255 * f)));
    return 'rgb(' + r + ',' + g2 + ',' + b + ')';
  }

  function draw(){
    if (cv.width < 10 || cv.height < 10){ fit(); }
    const ctx = cv.getContext('2d');
    const s = cv.width / P.W;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    /* wooden frame */
    const wood = ctx.createLinearGradient(0, 0, 0, cv.height);
    wood.addColorStop(0, '#6b4423'); wood.addColorStop(.5, '#8a5a2b'); wood.addColorStop(1, '#543316');
    ctx.fillStyle = wood;
    roundRect(ctx, 0, 0, cv.width, cv.height, s * 3); ctx.fill();
    /* metal corner accents */
    ctx.fillStyle = 'rgba(220,228,235,.9)';
    for (const p of [[0,0],[cv.width,0],[0,cv.height],[cv.width,cv.height]]){
      ctx.save(); ctx.beginPath();
      ctx.arc(p[0] === 0 ? s * 2.2 : cv.width - s * 2.2, p[1] === 0 ? s * 2.2 : cv.height - s * 2.2, s * 1.1, 0, 7);
      ctx.fillStyle = 'rgba(210,220,230,.95)'; ctx.fill(); ctx.restore();
    }
    /* rail sights (diamonds) */
    ctx.fillStyle = 'rgba(240,244,248,.85)';
    for (let i = 1; i <= 3; i++){
      const fx = cv.width * (i / 4);
      diamond(ctx, fx, s * 1.1, s * 0.5); diamond(ctx, fx, cv.height - s * 1.1, s * 0.5);
      diamond(ctx, s * 1.1, cv.height * (i / 4 + .125), s * 0.5);
      diamond(ctx, cv.width - s * 1.1, cv.height * (i / 4 + .125), s * 0.5);
    }
    /* felt */
    const felt = ctx.createRadialGradient(cv.width / 2, cv.height / 2, s * 4, cv.width / 2, cv.height / 2, cv.width * 0.62);
    felt.addColorStop(0, '#1d6b47'); felt.addColorStop(.7, '#155939'); felt.addColorStop(1, '#0d3f28');
    ctx.fillStyle = felt;
    roundRect(ctx, s * 2.1, s * 2.1, cv.width - s * 4.2, cv.height - s * 4.2, s * 1.6); ctx.fill();
    /* baulk line + D */
    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = Math.max(1, s * 0.14);
    ctx.beginPath(); ctx.moveTo(cv.width * 0.25, s * 2.1); ctx.lineTo(cv.width * 0.25, cv.height - s * 2.1); ctx.stroke();
    ctx.beginPath(); ctx.arc(cv.width * 0.25, cv.height / 2, cv.height * 0.18, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke();
    /* pockets with depth */
    for (const p of P.POCKETS){
      const px = p.x * s, py = p.y * s;
      const pg = ctx.createRadialGradient(px, py - P.PR * s * 0.25, P.PR * s * 0.15, px, py, P.PR * s * 1.25);
      pg.addColorStop(0, '#000'); pg.addColorStop(.7, '#0a0f0c'); pg.addColorStop(1, '#1c2a22');
      ctx.beginPath(); ctx.arc(px, py, P.PR * s * 1.22, 0, 7); ctx.fillStyle = pg; ctx.fill();
      ctx.beginPath(); ctx.arc(px, py, P.PR * s, 0, 7); ctx.strokeStyle = 'rgba(255,222,150,.5)'; ctx.lineWidth = Math.max(1, s * 0.16); ctx.stroke();
    }
    /* balls */
    for (const b of r.balls){ if (!b.pocketed) drawBall(ctx, b, s); }
    /* aim + cue stick */
    const cue = r.balls.find(b => b.id === 0);
    if (aim && cue && !cue.pocketed){
      const dx = aim.x - cue.x, dy = aim.y - cue.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      if (len > 0.5){
        const ux = dx / len, uy = dy / len;
        ctx.strokeStyle = 'rgba(34,211,238,.95)'; ctx.lineWidth = Math.max(1.5, s * 0.12);
        ctx.setLineDash([s * 1.1, s * 0.7]);
        ctx.beginPath(); ctx.moveTo(cue.x * s, cue.y * s);
        ctx.lineTo((cue.x + ux * len) * s, (cue.y + uy * len) * s);
        ctx.stroke(); ctx.setLineDash([]);
        /* stick: wood shaft + cyan tip */
        const back = 4.2 + Math.min(13, len * 0.24);
        const sg = ctx.createLinearGradient((cue.x - ux * back) * s, (cue.y - uy * back) * s, (cue.x - ux * (back + 10)) * s, (cue.y - uy * (back + 10)) * s);
        sg.addColorStop(0, '#d9c39a'); sg.addColorStop(1, '#7a5a33');
        ctx.strokeStyle = sg; ctx.lineWidth = Math.max(2, s * 0.24);
        ctx.beginPath();
        ctx.moveTo((cue.x - ux * back) * s, (cue.y - uy * back) * s);
        ctx.lineTo((cue.x - ux * (back + 10)) * s, (cue.y - uy * (back + 10)) * s);
        ctx.stroke();
        ctx.strokeStyle = '#22d3ee'; ctx.lineWidth = Math.max(2, s * 0.26);
        ctx.beginPath();
        ctx.moveTo((cue.x - ux * (back - 0.5)) * s, (cue.y - uy * (back - 0.5)) * s);
        ctx.lineTo((cue.x - ux * back) * s, (cue.y - uy * back) * s);
        ctx.stroke();
      }
    }
  }
  function roundRect(ctx, x, y, w, h, rad){
    ctx.beginPath();
    ctx.moveTo(x + rad, y);
    ctx.arcTo(x + w, y, x + w, y + h, rad);
    ctx.arcTo(x + w, y + h, x, y + h, rad);
    ctx.arcTo(x, y + h, x, y, rad);
    ctx.arcTo(x, y, x + w, y, rad);
    ctx.closePath();
  }
  function diamond(ctx, x, y, s2){
    ctx.save(); ctx.translate(x, y); ctx.rotate(Math.PI / 4);
    ctx.fillRect(-s2 / 2, -s2 / 2, s2, s2); ctx.restore();
  }

  function status(){
    const el = document.getElementById('pool-status');
    if (!el) return;
    const r2 = S.roomView;
    const myTurn = !r2.over && r2.turn === r2.you && r2.aimable && r2.you !== 0;
    let g = '';
    const grp = r2.groups && r2.groups[r2.you];
    if (grp) g = ' · فئتك: ' + (grp === 'solid' ? 'سادة ١-٧' : 'مخططة ٩-١٥');
    el.innerHTML = r2.over
      ? (r2.winner === r2.you ? '🏆 فزت!' : r2.winner === 0 ? 'تعادل' : 'خسرت')
      : (myTurn ? '<b>دورك</b> — صوّب واضرب' + g : (r2.aimable ? 'دور الخصم…' + g : 'الكرات تتحرك…' + g));
    el.className = 'gstat';
  }

  function hud(){
    const el = document.getElementById('pool-hud');
    if (!el) return;
    const r2 = S.roomView;
    const mine = r2.groups && r2.groups[r2.you];
    const theirs = r2.groups && r2.groups[3 - r2.you];
    const chips = (ids) => ids.map(id =>
      '<span class="pball ' + (id > 8 ? 'stripe' : id === 8 ? 'eight' : 'solid') + '" style="--pc:' + (POOL_COLORS[id] || '#999') + '">' + (id === 8 ? '8' : (id > 8 ? id - 8 : id)) + '</span>'
    ).join('');
    const mineIds = (r2.pocketed || []).filter(id => mine === 'solid' ? id < 8 : id > 8);
    const theirIds = (r2.pocketed || []).filter(id => theirs === 'solid' ? id < 8 : id > 8);
    el.innerHTML =
      '<div class="phud-side"><b>أسقطتَ ' + (mine ? mineIds.length + '/7' : (r2.pocketed || []).length) + '</b><div class="pchips">' + (chips(mineIds) || '<i class="sub2">—</i>') + '</div></div>'
      + '<div class="phud-score num">' + (r2.you === r2.turn ? '🔵' : '⚪') + '</div>'
      + '<div class="phud-side"><b>أسقط الخصم ' + (theirs ? theirIds.length + '/7' : '') + '</b><div class="pchips">' + (chips(theirIds) || '<i class="sub2">—</i>') + '</div></div>';
  }

  function clock(){
    const bar = document.getElementById('pool-clock');
    const lbl = document.getElementById('pool-clocklbl');
    if (!bar || !lbl) return;
    const r2 = S.roomView;
    if (r2.over || r2.turn !== r2.you || r2.you === 0 || !r2.aimable){
      bar.style.width = '100%'; bar.classList.remove('low'); lbl.textContent = '—';
      return;
    }
    const left = Math.max(0, r2.shotClock - (Date.now() - (r2.turnStartedAt || Date.now())));
    const pct = left / r2.shotClock * 100;
    bar.style.width = pct + '%';
    bar.classList.toggle('low', pct < 33);
    lbl.textContent = (left / 1000).toFixed(1);
    if (token === poolToken && left > 0){ requestAnimationFrame(clock); }
  }

  function anim(){
    if (token !== poolToken) return;
    const r2 = S.roomView;
    if (r2.balls && !P.allStopped(r2.balls)){
      P.step(r2.balls);
      draw(); status(); hud();
      requestAnimationFrame(anim);
    } else { draw(); status(); hud(); }
  }

  fit(); draw(); status(); hud(); clock();
  window.addEventListener('resize', () => { if (token === poolToken){ fit(); draw(); } });
  if (r.balls && !P.allStopped(r.balls)) requestAnimationFrame(anim);

  const myTurnNow = () => !S.roomView.over && S.roomView.turn === S.roomView.you && S.roomView.aimable && S.roomView.you !== 0;
  if (myTurnNow()){
    cv.style.touchAction = 'none';
    const pos = e => { const rc = cv.getBoundingClientRect(); return toUnits(e.clientX - rc.left, e.clientY - rc.top); };
    cv.onpointerdown = e => { if (!myTurnNow()) return; aim = pos(e); cv.setPointerCapture(e.pointerId); draw(); };
    cv.onpointermove = e => { if (aim){ aim = pos(e); draw(); } };
    cv.onpointerup = async e => {
      if (!aim) return;
      const r3 = S.roomView;
      const cue = r3.balls.find(b => b.id === 0);
      const dx = aim.x - cue.x, dy = aim.y - cue.y;
      const len = Math.sqrt(dx * dx + dy * dy);
      aim = null;
      if (len < 1.5){ draw(); return; }
      const angle = Math.atan2(dy, dx) * 180 / Math.PI;
      const power = Math.max(8, Math.min(100, len * 1.15));
      const speed = power * 0.062;
      cue.vx = Math.cos(angle * Math.PI / 180) * speed;
      cue.vy = Math.sin(angle * Math.PI / 180) * speed;
      requestAnimationFrame(anim);
      try {
        const j = await api('POST', '/rooms/' + r3.id + '/move', { angle, power, spin: poolSpin });
        if (j.state){ S.roomView = sanitizeRoom(j.state, S.roomView); }
      } catch(err){
        toast('ضربة مرفوضة', err.message, 'err');
        if (err && err.code === 'SHOT_CLOCK'){ S.roomView.turn = 3 - S.roomView.you; }
      }
      if (S.route === 'room' && S.roomView.game === 'pool8'){ chSel = null; bgSel = null; renderRoom(); }
    };
  } else { cv.onpointerdown = cv.onpointermove = cv.onpointerup = null; }
}

'''
r = r[:start] + pool_v2 + r[end:]
open('public/room.js','w',encoding='utf-8').write(r)
print('room.js pool v2 ok')

# ================= views.js: rooms click hardening =================
v = open('public/views.js', encoding='utf-8').read()
old_open = """async function openChatRoom(id){
  S.chatOpenId = id;
  S.chatUnread[id] = 0;
  if (!S.chatMsgs[id]){
    try {
      const j = await api('GET', '/chat/rooms/' + id + '/messages');
      S.chatMsgs[id] = j.messages || [];
    } catch(e){ S.chatMsgs[id] = []; }
  }
  navigate('chat');
}"""
new_open = """async function openChatRoom(id){
  try {
    if (!S.chatRooms) await loadChatRooms();          /* guarantee list before open */
    S.chatOpenId = id;
    S.chatUnread[id] = 0;
    if (!S.chatMsgs[id]){
      const j = await api('GET', '/chat/rooms/' + id + '/messages');
      S.chatMsgs[id] = j.messages || [];
    }
    S.route = 'chat';
    render();
    window.scrollTo(0, 0);
    setTimeout(() => { const i = document.getElementById('gchat-inp'); if (i) i.focus(); }, 250);
  } catch(e){ toast('تعذر فتح الغرفة', e.message, 'err'); }
}"""
assert old_open in v
v = v.replace(old_open, new_open)
# friends grid: replace inline fixed 340px column with responsive class
v = v.replace("<div style=\"display:grid;grid-template-columns:1fr 340px;gap:20px;align-items:start\">", "<div class=\"friends-grid\">")
open('public/views.js','w',encoding='utf-8').write(v)
print('views ok')

# ================= core.js: pool:clock event + build bump =================
c = open('public/core.js', encoding='utf-8').read()
old_g = """    case 'gchat':"""
new_g = """    case 'pool:clock':
      if (S.roomView && S.roomView.id === d.roomId){ toast('⏱ انتهى وقت الضربة', 'فاول — انتقل الدور إليك' , 'info'); }
      break;
    case 'gchat':"""
assert old_g in c
c = c.replace(old_g, new_g)
open('public/core.js','w',encoding='utf-8').write(c)
print('core ok')

# ================= CSS =================
css = open('public/style.css', encoding='utf-8').read()
css += """

/* ============ Pool v2 (Gamezer-style) UI ============ */
.pool-hud{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 14px;border:1px solid var(--line);border-radius:14px;background:var(--surface);margin-bottom:8px}
.phud-side{min-width:0;flex:1}
.phud-side b{font-size:11.5px;color:var(--muted)}
.pchips{display:flex;gap:4px;flex-wrap:wrap;margin-top:5px}
.pball{width:22px;height:22px;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;color:#fff;
  background:radial-gradient(circle at 32% 28%, #fff6, transparent 40%), var(--pc);box-shadow:inset 0 -3px 5px rgba(0,0,0,.5),0 1px 3px rgba(0,0,0,.5)}
.pball.stripe{background:radial-gradient(circle at 32% 28%, #fff8, transparent 40%),linear-gradient(to bottom,#eee 18%,var(--pc) 18%,var(--pc) 82%,#eee 82%)}
.pball.eight{background:radial-gradient(circle at 32% 28%, #6668, transparent 45%),radial-gradient(circle at 50% 50%,#222,#000)}
.pool-clockwrap{position:relative;height:16px;border-radius:99px;background:rgba(150,163,220,.14);overflow:hidden;margin:0 0 10px}
.pool-clock{height:100%;width:100%;background:linear-gradient(90deg,#22d3ee,#8b5cf6);border-radius:99px;transition:width .12s linear}
.pool-clock.low{background:linear-gradient(90deg,#fb7185,#f43f5e);animation:lowPulse .5s infinite alternate}
@keyframes lowPulse{to{opacity:.55}}
.pool-clocklbl{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:900;color:#fff;text-shadow:0 1px 3px rgba(0,0,0,.7)}
.pool-tools{display:flex;gap:8px;justify-content:center;margin-top:10px}
.spin-btn{flex:1;max-width:130px;padding:8px 6px;border-radius:12px;border:1.5px solid var(--line2);background:var(--glass);color:var(--muted);font-size:11px;font-weight:800;line-height:1.5;transition:.18s}
.spin-btn small{font-size:9px;font-weight:600;opacity:.7}
.spin-btn.on{border-color:var(--cyan);color:var(--cyan);background:rgba(34,211,238,.1);box-shadow:0 0 14px rgba(34,211,238,.25)}

/* ============ left-clip fix (friends/admin/lobby on phones) ============ */
html, body{overflow-x:hidden;max-width:100vw;width:100%}
#root, main{max-width:100vw;overflow-x:hidden}
.wrap{max-width:100vw}
.friends-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(280px,340px);gap:20px;align-items:start}
.friends-grid > *{min-width:0}
@media (max-width:900px){ .friends-grid{grid-template-columns:minmax(0,1fr)} }
.tbl-wrap{max-width:100%}
.card{max-width:100%}

@media (orientation: portrait){
  .pool-wrap{width:100%;max-width:none}
  .pool-wrap canvas{max-width:100%;border-radius:12px}
  .phud-side{font-size:10.5px}
  .pball{width:19px;height:19px;font-size:9px}
  .spin-btn{font-size:10px;padding:7px 4px}
}
"""
open('public/style.css','w',encoding='utf-8').write(css)
print('css ok')

# ================= build stamp =================
import re
h = open('public/index.html', encoding='utf-8').read()
h = re.sub(r'v2026\.08\.20\.\d+', BUILD, h)
open('public/index.html','w',encoding='utf-8').write(h)
print('stamp →', BUILD)
