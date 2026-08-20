#!/usr/bin/env python3
css = open('public/style.css', encoding='utf-8').read()
css += """

/* ============ Chess v2 — player bars, drag, promo, overlay ============ */
.chp-bar{display:flex;align-items:center;gap:10px;padding:9px 12px;border:1px solid var(--line);border-radius:13px;background:var(--surface);margin:0 0 8px;flex-wrap:wrap}
.chp-bar.me{border-color:rgba(139,92,246,.35)}
.chava.me{background:var(--grad)}
.chp-name{display:flex;flex-direction:column;min-width:0;flex:1}
.chp-name b{font-size:13.5px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chp-elo{font-size:10.5px;color:var(--cyan);font-weight:800}
.chp-clock{width:30px;height:30px;border-radius:9px;display:flex;align-items:center;justify-content:center;color:var(--muted);border:1px solid var(--line)}
.chp-clock.on{color:var(--cyan);border-color:rgba(34,211,238,.5);animation:clockPulse 1s infinite alternate;box-shadow:0 0 10px rgba(34,211,238,.25)}
@keyframes clockPulse{to{box-shadow:0 0 18px rgba(34,211,238,.45)}}
.chp-cap{display:flex;gap:1px;flex-wrap:wrap;max-width:46%;min-height:20px;align-items:center}
.cap-pc{font-size:17px;line-height:1;filter:drop-shadow(0 1px 1px rgba(0,0,0,.5))}
.cap-pc.cw{color:#f4f6f8}
.cap-pc.cb{color:#20242e}
.ch-stage{position:relative;display:flex;justify-content:center}
.ch-board{position:relative;touch-action:manipulation}
.pc.dragging{opacity:.75;transform:scale(1.15)}
.ch-sq{user-select:none;-webkit-user-select:none;touch-action:manipulation}
.ch-sq.own{cursor:grab}
.ch-sq.own:active{cursor:grabbing}
.ch-sq.tgt{cursor:pointer}
.ch-sq.tgt::after{content:"";position:absolute;inset:0;margin:auto;width:34%;height:34%;border-radius:50%;background:rgba(46,204,113,.55);box-shadow:0 0 10px rgba(46,204,113,.5);animation:tgtIn .16s}
.ch-sq.sel{box-shadow:inset 0 0 0 3px rgba(255,201,69,.95);background:rgba(255,201,69,.14)}
.ch-sq.lastm{box-shadow:inset 0 0 0 2.5px rgba(34,211,238,.55)}
@keyframes tgtIn{from{transform:scale(.4);opacity:0}}
.coord{position:absolute;font-size:calc(min(1.9vw,1.1vh));font-weight:800;color:rgba(120,80,40,.75);font-style:normal;z-index:2;pointer-events:none}
.coord.cl{top:2px;left:3px}
.coord.cn{bottom:1px;right:3px}
.ch-over{position:absolute;inset:0;z-index:10;display:flex;align-items:center;justify-content:center;background:rgba(5,7,15,.72);backdrop-filter:blur(4px);border-radius:4px;animation:fadeIn .3s}
.ch-over-in{text-align:center;color:var(--text)}
.promo-row{display:flex;gap:8px;justify-content:center;margin-top:14px}
.promo-btn{width:64px;height:72px;border-radius:14px;border:1.5px solid var(--line2);background:var(--glass);font-size:30px;color:var(--text);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;transition:.15s}
.promo-btn small{font-size:10px;color:var(--muted);font-weight:700}
.promo-btn:hover{border-color:var(--cyan);transform:translateY(-3px)}
@media (orientation: portrait){
  .ch-board{width:min(97vw,62vh)}
  .chp-cap{max-width:100%}
}
@media (orientation: landscape) and (max-height:560px){
  .chp-bar{padding:6px 10px}
  .cap-pc{font-size:14px}
  .ch-board{width:min(58vh,72vw)}
}
"""
open('public/style.css','w',encoding='utf-8').write(css)
import re
h = open('public/index.html', encoding='utf-8').read()
h = re.sub(r'v2026\.08\.20\.\d+', 'v2026.08.20.8', h)
open('public/index.html','w',encoding='utf-8').write(h)
print('css + stamp v2026.08.20.8')
