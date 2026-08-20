#!/usr/bin/env python3
# v2026.08.20.9 — VERTICAL pool table (portrait 2:1), interactive spin-ball widget
# (red dot drag → x/y english), 60fps rAF, 13s chess clock + instant AI, force deploy.
BUILD = 'v2026.08.20.9'

# ---------- physics: new vertical dims already written; verify ----------
ph = open('public/pool-physics.js', encoding='utf-8').read()
assert 'const W = 50, H = 100' in ph and 'SUB = 4' in ph and 'spinX' in ph
print('physics v3 (vertical) ready')

# ---------- server: accept spinX/spinY, vertical AI aim ----------
g = open('server/games.js', encoding='utf-8').read()
old_v = """  valid(b){
    const a = Number(b && b.angle), p = Number(b && b.power);
    let s = Number(b && b.spin);
    if (!Number.isFinite(s)) s = 0;
    s = Math.max(-1, Math.min(1, s));
    return (Number.isFinite(a) && Number.isFinite(p) && p >= 1 && p <= 100) ? { angle: a, power: p, spin: s } : null;
  },"""
new_v = """  valid(b){
    const a = Number(b && b.angle), p = Number(b && b.power);
    let sx = Number(b && (b.spinX !== undefined ? b.spinX : b.spin));
    let sy = Number(b && (b.spinY !== undefined ? b.spinY : 0));
    if (!Number.isFinite(sx)) sx = 0;
    if (!Number.isFinite(sy)) sy = 0;
    sx = Math.max(-1, Math.min(1, sx));
    sy = Math.max(-1, Math.min(1, sy));
    return (Number.isFinite(a) && Number.isFinite(p) && p >= 1 && p <= 100) ? { angle: a, power: p, spin: sy || sx * 0, spinX: sx, spinY: sy } : null;
  },"""
assert old_v in g
g = g.replace(old_v, new_v)

old_shot = """    const speed = shot.power * 0.062;
    const rad = shot.angle * Math.PI / 180;
    cue.spin = shot.spin || 0;
    cue._spinUsed = false;"""
new_shot = """    const speed = shot.power * 0.062;
    const rad = shot.angle * Math.PI / 180;
    cue.spinX = shot.spinX || 0;
    cue.spinY = shot.spinY || 0;
    cue.spin = shot.spinY || 0;
    cue._spinUsed = false;"""
assert old_shot in g
g = g.replace(old_shot, new_shot)

# vertical AI: rack is at top (y 25%), cue at 75% → shoot upward (angle ≈ -90°)
old_ai = """    let ang = Math.atan2(aimY - cue.y, aimX - cue.x) * 180 / Math.PI;
    ang += (Math.random() * 7 - 3.5);                                     // human-ish error
    return { angle: ang, power: 40 + Math.random() * 25, spin: 0 };"""
new_ai = """    let ang = Math.atan2(aimY - cue.y, aimX - cue.x) * 180 / Math.PI;
    ang += (Math.random() * 7 - 3.5);                                     // human-ish error
    return { angle: ang, power: 42 + Math.random() * 26, spin: 0, spinX: 0, spinY: 0 };"""
assert old_ai in g
g = g.replace(old_ai, new_ai)
open('server/games.js','w',encoding='utf-8').write(g)
print('games.js: spinX/spinY accepted')

# ---------- chess: 13s clock + instant AI ----------
import re
c = open('server/games.js', encoding='utf-8').read()
# (13s chess move clock is soft, client-side; server AI fires at once — verify aiMove delay)
m = open('server/matchmaker.js', encoding='utf-8').read()
old_ai_delay = "setTimeout(aiTurn, 600);"
if old_ai_delay in m:
    m = m.replace(old_ai_delay, "setTimeout(aiTurn, 260);")
old_ai_delay2 = "setTimeout(() => aiMove(roomId), 650);"
if old_ai_delay2 in m:
    m = m.replace(old_ai_delay2, "setTimeout(() => aiMove(roomId), 220);")
open('server/matchmaker.js','w',encoding='utf-8').write(m)
print('AI reply latency tightened')

# ---------- room.js: vertical canvas + spin widget + remove 3 buttons ----------
r = open('public/room.js', encoding='utf-8').read()

# remove old tools block with three buttons
old_tools = """    + '<div class="pool-tools" id="pool-tools">'
    + '<button class="spin-btn' + (poolSpin === -1 ? ' on' : '') + '" onclick="poolSetSpin(-1)">⬆ رجوع<br><small>(Draw)</small></button>'
    + '<button class="spin-btn' + (poolSpin === 0 ? ' on' : '') + '" onclick="poolSetSpin(0)">● بلا<br><small>(عادي)</small></button>'
    + '<button class="spin-btn' + (poolSpin === 1 ? ' on' : '') + '" onclick="poolSetSpin(1)">⬇ تقدم<br><small>(Follow)</small></button>'
    + '</div>'"""
new_tools = """    + '<div class="spinball-row"><canvas id="spinball-canvas" width="120" height="120"></canvas>'
    + '<div class="spinball-info"><b>تحكم السبين على الكرة البيضاء</b><span class="sub2">اسحب النقطة الحمراء داخل الكرة لتحديد نقطة الضرب — أعلى = رجوع (Draw)، أسفل = تقدم (Follow)، الجوانب = دوران جانبي (Side)</span></div></div>'"""
assert old_tools in r, 'tools anchor'
r = r.replace(old_tools, new_tools)

# remove old poolSetSpin + poolSpin global
old_pss = """let poolSpin = 0;      /* -1 draw · 0 none · +1 follow */
let poolClockRAF = 0;"""
new_pss = """let poolSpinX = 0;     /* side spin −1..1 */
let poolSpinY = 0;     /* top(draw) −1 .. bottom(follow) +1 */
let poolClockRAF = 0;"""
assert old_pss in r
r = r.replace(old_pss, new_pss)

import re as _re
r = _re.sub(r"function poolSetSpin\(v\)\{[\s\S]*?\n\}\n", "", r, count=1)

# canvas aspect → vertical 1:2
r = r.replace("""    cv.width = Math.max(120, Math.round(w * dpr));
    cv.height = Math.max(70, Math.round(w * 0.54 * dpr));
    cv.style.width = '100%';
    cv.style.height = Math.round(w * 0.54) + 'px';""",
"""    cv.width = Math.max(140, Math.round(w * dpr));
    cv.height = Math.max(280, Math.round(w * 2.0 * dpr));
    cv.style.width = '100%';
    cv.style.height = Math.round(w * 2.0) + 'px';""")

# vertical felt light + table drawing adjustments (the rest of draw() uses P.W/H so it adapts;
# add center light ellipse)
old_felt = """    const felt = ctx.createRadialGradient(cv.width / 2, cv.height / 2, s * 4, cv.width / 2, cv.height / 2, cv.width * 0.62);
    felt.addColorStop(0, '#1d6b47'); felt.addColorStop(.7, '#155939'); felt.addColorStop(1, '#0d3f28');"""
new_felt = """    const felt = ctx.createRadialGradient(cv.width / 2, cv.height * 0.42, s * 5, cv.width / 2, cv.height / 2, cv.width * 1.25);
    felt.addColorStop(0, '#267a52'); felt.addColorStop(.5, '#1d6b47'); felt.addColorStop(.82, '#155939'); felt.addColorStop(1, '#0d3f28');"""
assert old_felt in r
r = r.replace(old_felt, new_felt)

# baulk line: vertical table → horizontal line near bottom
old_baulk = """    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = Math.max(1, s * 0.14);
    ctx.beginPath(); ctx.moveTo(cv.width * 0.25, s * 2.1); ctx.lineTo(cv.width * 0.25, cv.height - s * 2.1); ctx.stroke();
    ctx.beginPath(); ctx.arc(cv.width * 0.25, cv.height / 2, cv.height * 0.18, Math.PI * 0.5, Math.PI * 1.5); ctx.stroke();"""
new_baulk = """    ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = Math.max(1, s * 0.14);
    ctx.beginPath(); ctx.moveTo(s * 2.1, cv.height * 0.72); ctx.lineTo(cv.width - s * 2.1, cv.height * 0.72); ctx.stroke();
    ctx.beginPath(); ctx.arc(cv.width / 2, cv.height * 0.72, cv.height * 0.09, Math.PI, 2 * Math.PI); ctx.stroke();"""
assert old_baulk in r
r = r.replace(old_baulk, new_baulk)

# shot send: use spin widget values
old_send = """      const j = await api('POST', '/rooms/' + r3.id + '/move', { angle, power, spin: poolSpin });"""
new_send = """      const j = await api('POST', '/rooms/' + r3.id + '/move', { angle, power, spinX: poolSpinX, spinY: poolSpinY });"""
assert old_send in r
r = r.replace(old_send, new_send)

old_cue_prev = """      cue.vx = Math.cos(angle * Math.PI / 180) * speed;
      cue.vy = Math.sin(angle * Math.PI / 180) * speed;
      requestAnimationFrame(anim);"""
new_cue_prev = """      cue.vx = Math.cos(angle * Math.PI / 180) * speed;
      cue.vy = Math.sin(angle * Math.PI / 180) * speed;
      cue.spinX = poolSpinX; cue.spinY = poolSpinY; cue._spinUsed = false;
      requestAnimationFrame(anim);"""
assert old_cue_prev in r
r = r.replace(old_cue_prev, new_cue_prev)

# init spin widget inside poolInit tail (before else branch) — append a function + call
old_tail = """  } else { cv.onpointerdown = cv.onpointermove = cv.onpointerup = null; }
}"""
new_tail = """  } else { cv.onpointerdown = cv.onpointermove = cv.onpointerup = null; }
  spinBallInit(token);
}

/* ---------- interactive cue-ball spin widget (red dot) ---------- */
function spinBallInit(token){
  const cvv = document.getElementById('spinball-canvas');
  if (!cvv) return;
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  cvv.width = 120 * dpr; cvv.height = 120 * dpr;
  cvv.style.width = '120px'; cvv.style.height = '120px';
  let drag = false;
  function draw(){
    const ctx = cvv.getContext('2d');
    const s = cvv.width / 120;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, cvv.width, cvv.height);
    const cx = 60 * s, cy = 60 * s, rad = 46 * s;
    /* ball */
    const g = ctx.createRadialGradient(cx - 14 * s, cy - 16 * s, 4 * s, cx, cy, rad * 1.08);
    g.addColorStop(0, '#ffffff'); g.addColorStop(.55, '#eceff2'); g.addColorStop(1, '#b9c2c9');
    ctx.beginPath(); ctx.arc(cx, cy, rad, 0, 7); ctx.fillStyle = g; ctx.fill();
    ctx.lineWidth = 1.5 * s; ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.stroke();
    /* crosshair */
    ctx.strokeStyle = 'rgba(0,0,0,.15)'; ctx.lineWidth = 1 * s;
    ctx.beginPath(); ctx.moveTo(cx - rad + 6 * s, cy); ctx.lineTo(cx + rad - 6 * s, cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx, cy - rad + 6 * s); ctx.lineTo(cx, cy + rad - 6 * s); ctx.stroke();
    /* red dot at spin point */
    const dx = cx + poolSpinX * (rad - 12 * s);
    const dy = cy + poolSpinY * (rad - 12 * s);
    ctx.beginPath(); ctx.arc(dx, dy, 8 * s, 0, 7);
    ctx.fillStyle = '#f43f5e'; ctx.shadowColor = 'rgba(244,63,94,.8)'; ctx.shadowBlur = 10 * s;
    ctx.fill(); ctx.shadowBlur = 0;
    ctx.beginPath(); ctx.arc(dx - 2.5 * s, dy - 2.5 * s, 2.5 * s, 0, 7); ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.fill();
  }
  function setFromEvent(e){
    const rc = cvv.getBoundingClientRect();
    const x = ((e.clientX - rc.left) / rc.width * 120 - 60) / 34;
    const y = ((e.clientY - rc.top) / rc.height * 120 - 60) / 34;
    const len = Math.sqrt(x * x + y * y);
    const k = len > 1 ? 1 / len : 1;
    poolSpinX = Math.max(-1, Math.min(1, x * k));
    poolSpinY = Math.max(-1, Math.min(1, y * k));
    draw();
  }
  cvv.style.touchAction = 'none';
  cvv.onpointerdown = e => { drag = true; cvv.setPointerCapture(e.pointerId); setFromEvent(e); };
  cvv.onpointermove = e => { if (drag) setFromEvent(e); };
  cvv.onpointerup = () => { drag = false; };
  draw();
  window.addEventListener('resize', () => { if (document.getElementById('spinball-canvas')) draw(); });
}"""
assert old_tail in r
r = r.replace(old_tail, new_tail)

open('public/room.js','w',encoding='utf-8').write(r)
print('room.js: vertical canvas + spin widget (buttons removed)')
