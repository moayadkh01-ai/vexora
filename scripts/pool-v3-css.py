#!/usr/bin/env python3
# CSS + chess clock 13s + build stamp
BUILD = 'v2026.08.20.9'

r = open('public/room.js', encoding='utf-8').read()
# chess move timer 13s (visual soft-clock on player bars)
old_clk = """function chClockHTML(r, isMine){
  /* shot-clock style per-move timer (chess uses a soft 30s suggest timer; server has no chess clock) */
  return '<div class="chp-clock' + (isMine && !r.over && r.turnColor === (chMyColor(r)) ? ' on' : '') + '">' + icon('clock', 14) + '</div>';
}"""
new_clk = """function chClockHTML(r, isMine){
  /* 13-second per-move visual clock (soft: server enforces fairness, UI nudges pace) */
  const on = isMine && !r.over && r.turnColor === chMyColor(r);
  return '<div class="chp-clock' + (on ? ' on' : '') + '" data-on="' + (on ? 1 : 0) + '">' + icon('clock', 14) + '<b id="ch-clock-num">13</b></div>';
}"""
assert old_clk in r
r = r.replace(old_clk, new_clk)

# tick the 13s clock whenever the board renders (self-contained interval)
old_anim = """function chSelect(i){ chSel = i; renderRoom(); }"""
new_anim = """function chSelect(i){ chSel = i; renderRoom(); }
/* 13s countdown per move (visual + gentle nudge) */
let chClockIv = 0;
function chClockStart(){
  clearInterval(chClockIv);
  const tick = () => {
    const el = document.getElementById('ch-clock-num');
    if (!el) return;
    const r = S.roomView;
    if (!r || r.over || r.game !== 'chess' || r.turnColor !== chMyColor(r)){ el.textContent = '13'; return; }
    const started = r.lastMoveAt || r.turnStartedAt || (Date.now() - 1000);
    /* chess rooms don't carry turnStartedAt — derive from last render */
    if (!chClockT0) chClockT0 = Date.now();
    const left = Math.max(0, 13 - Math.floor((Date.now() - chClockT0) / 1000));
    el.textContent = left;
    el.parentElement.classList.toggle('low', left <= 3);
  };
  chClockT0 = Date.now();
  clearInterval(chClockIv);
  chClockIv = setInterval(tick, 500);
}
let chClockT0 = 0;"""
assert old_anim in r
r = r.replace(old_anim, new_anim)

# hook clock start inside chBoardHTML output (append startup script-safe call)
old_ret = """  return oppBar
    + '<div class="ch-stage">'"""
new_ret = """  chClockStart();
  return oppBar
    + '<div class="ch-stage">'"""
assert old_ret in r
r = r.replace(old_ret, new_ret)
open('public/room.js','w',encoding='utf-8').write(r)
print('chess 13s clock wired')

css = open('public/style.css', encoding='utf-8').read()
css += """

/* ============ v2026.08.20.9 — vertical pool + spin widget + 13s clock ============ */
.spinball-row{display:flex;align-items:center;gap:14px;padding:12px;border:1px solid var(--line);border-radius:16px;background:var(--surface);margin-top:10px}
.spinball-row canvas{flex-shrink:0;touch-action:none;cursor:crosshair}
.spinball-info{min-width:0}
.spinball-info b{font-size:13.5px;display:block;margin-bottom:4px}
.spinball-info .sub2{font-size:11.5px;line-height:1.7;display:block}
.chp-clock{gap:3px;font-size:11px;font-weight:900}
.chp-clock.low{color:#fda4af;border-color:rgba(251,113,133,.6);animation:clockPulse .5s infinite alternate}
.pool-wrap canvas{aspect-ratio:1/2;max-height:78vh;width:auto;max-width:100%;margin:0 auto}
@media (orientation: portrait){
  .pool-wrap canvas{width:100%;max-height:none}
  .spinball-row{flex-direction:column;text-align:center}
}
"""
open('public/style.css','w',encoding='utf-8').write(css)

import re
h = open('public/index.html', encoding='utf-8').read()
h = re.sub(r'v2026\.08\.20\.\d+', BUILD, h)
open('public/index.html','w',encoding='utf-8').write(h)
print('css + stamp', BUILD)
