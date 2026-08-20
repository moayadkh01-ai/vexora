#!/usr/bin/env python3
# radical update: cache-busting + version stamp + no-more-"قريباً" + portrait single-column + room renames

BUILD = 'v2026.08.20.4'

# ---------- 1) index.html: version stamp, cache-busted assets, resource-error banner ----------
h = open('public/index.html', encoding='utf-8').read()
old_head = """<link rel="stylesheet" href="/style.css">
</head>"""
new_head = """<link rel="stylesheet" href="/style.css?v=BUILDTAG">
<script>window.VX_BUILD='BUILDTAG';</script>
<script>
/* resource-failure banner: if any script/style fails to load (old cache / offline),
   show a one-tap refresh instead of a broken page */
window.addEventListener('error', function(e){
  var t = e.target;
  if (t && (t.tagName === 'SCRIPT' || t.tagName === 'LINK')){
    var b = document.getElementById('resfail');
    if (!b){
      b = document.createElement('div');
      b.id = 'resfail';
      b.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:999;background:#7a1f2b;color:#fff;text-align:center;padding:10px 14px;font:700 13px Tahoma,sans-serif;cursor:pointer;border-bottom:1px solid #fda4af';
      b.onclick = function(){ location.reload(); };
      b.textContent = 'تعذّر تحميل ملفات نواركيو (نسخة قديمة في الذاكرة) — اضغط هنا للتحديث';
      (document.body || document.documentElement).appendChild(b);
    }
  }
}, true);
</script>
</head>"""
assert old_head in h
h = h.replace(old_head, new_head.replace('BUILDTAG', BUILD))
old_scripts = """<script src="/pool-physics.js"></script>
<script src="/core.js"></script>
<script src="/views.js"></script>
<script src="/room.js"></script>"""
new_scripts = """<script src="/pool-physics.js?v=BUILDTAG"></script>
<script src="/core.js?v=BUILDTAG"></script>
<script src="/views.js?v=BUILDTAG"></script>
<script src="/room.js?v=BUILDTAG"></script>"""
assert old_scripts in h
h = h.replace(old_scripts, new_scripts.replace('BUILDTAG', BUILD))
open('public/index.html','w',encoding='utf-8').write(h)
print('index ok (' + BUILD + ')')

# ---------- 2) views.js: remove "قريباً" section entirely — every card is Play Now ----------
v = open('public/views.js', encoding='utf-8').read()
old_soon = """    + soon.map(x => '<div class="gcard" style="opacity:.62" onclick="toast(\\'قريباً\\',\\'' + esc(x.name_ar) + ' ضمن التحديثات القادمة\\',\\'info\\')">'
      + '<div class="art" style="display:flex;align-items:center;justify-content:center;height:128px;background:linear-gradient(160deg,#1a1f3d,#0b0e1c)">' + logoMark(64) + '</div>'
      + '<div class="bd"><b>' + esc(x.name_ar) + '</b><span class="arn">' + esc(x.name_en) + '</span>'
      + '<div class="onl"><i style="background:#64748b;box-shadow:none"></i>قريباً</div>'
      + '<button class="btn ghost small wfull play">أعلمني</button></div></div>').join('')
    + '</div>'"""
new_soon = """    + '</div>'
    + '<div class="more-note">المزيد من الألعاب (بلياردو ٩ · دامة · دوراك · دومينو · رامي · دارتس) تُضاف تباعًا ضمن موسم نواركيو القادم 🎯</div>'"""
assert old_soon in v, 'soon block anchor'
v = v.replace(old_soon, new_soon)

# drop the unused soon list var
v = v.replace("  const playable = games.filter(x => x.playable);\n  const soon = games.filter(x => !x.playable);",
              "  const playable = games.filter(x => x.playable);")
open('public/views.js','w',encoding='utf-8').write(v)
print('views ok (no more قريباً)')

# ---------- 3) core.js: build stamp in footer ----------
c = open('public/core.js', encoding='utf-8').read()
old_f = """    + '<div class="ftr-bot"><p>NoirCue وعملات نواركيو علامات تجارية لشركة NoirCue Entertainment · <span class="num">© 2026</span></p><div>العب بلا حدود</div></div>'"""
new_f = """    + '<div class="ftr-bot"><p>NoirCue وعملات نواركيو علامات تجارية لشركة NoirCue Entertainment · <span class="num">© 2026</span> · <span class="num" dir="ltr">' + (window.VX_BUILD || '') + '</span></p><div>العب بلا حدود</div></div>'"""
assert old_f in c
c = c.replace(old_f, new_f)
open('public/core.js','w',encoding='utf-8').write(c)
print('core ok (build stamp)')

# ---------- 4) seed.js: rename the 10 rooms to the requested flavour (idempotent upsert) ----------
sd = open('server/seed.js', encoding='utf-8').read()
old_rooms = """    const insRoom = db.prepare('INSERT OR IGNORE INTO gchat_rooms (id,name,emoji,sort) VALUES (?,?,?,?)');
    insRoom.run(1, 'السواليف العامة', '💬', 1);
    insRoom.run(2, 'الترحيب بالأعضاء الجدد', '👋', 2);
    insRoom.run(3, 'سالفة البلياردو', '🎱', 3);
    insRoom.run(4, 'سالفة الشطرنج', '♞', 4);
    insRoom.run(5, 'سالفة الطاولة', '🎲', 5);
    insRoom.run(6, 'الألعاب والمطابقات', '🎮', 6);
    insRoom.run(7, 'البطولات والجوائز', '🏆', 7);
    insRoom.run(8, 'الاقتراحات والأفكار', '💡', 8);
    insRoom.run(9, 'الدعم والمشاكل', '🛠️', 9);
    insRoom.run(10, 'دردشة حرة', '🌍', 10);"""
new_rooms = """    const insRoom = db.prepare('INSERT INTO gchat_rooms (id,name,emoji,sort) VALUES (?,?,?,?) ON CONFLICT(id) DO UPDATE SET name = excluded.name, emoji = excluded.emoji');
    insRoom.run(1, 'ديوانية نواركيو', '🛋️', 1);
    insRoom.run(2, 'السوالف العامة', '💬', 2);
    insRoom.run(3, 'ساحة التحدي', '⚔️', 3);
    insRoom.run(4, 'استراحة الألعاب', '☕', 4);
    insRoom.run(5, 'سالفة البلياردو والطاولة', '🎱', 5);
    insRoom.run(6, 'سالفة الشطرنج والذكاء', '♞', 6);
    insRoom.run(7, 'البطولات والجوائز', '🏆', 7);
    insRoom.run(8, 'الترحيب بالأعضاء الجدد', '👋', 8);
    insRoom.run(9, 'الاقتراحات والدعم', '🛠️', 9);
    insRoom.run(10, 'دردشة حرة', '🌍', 10);"""
assert old_rooms in sd
sd = sd.replace(old_rooms, new_rooms)
open('server/seed.js','w',encoding='utf-8').write(sd)
print('seed ok (renamed rooms)')

# ---------- 5) style.css: portrait single-column games + absolute overflow guard ----------
css = open('public/style.css', encoding='utf-8').read()
css += """

/* ============================================================
   PORTRAIT FINAL: single-column cards, zero horizontal scroll
   ============================================================ */
html, body{overflow-x:clip}
body{position:relative;width:100%}
.gcard{max-width:100%}
.more-note{margin-top:14px;padding:14px;border-radius:14px;border:1px dashed var(--line2);color:var(--muted);font-size:12.5px;text-align:center;line-height:1.8}
@media (orientation: portrait){
  .games-grid{grid-template-columns:minmax(0,1fr)!important}   /* single column */
  .gcard{flex-direction:row;align-items:center}
  .gcard .art{height:88px;width:112px;flex-shrink:0}
  .gcard .bd{flex:1;min-width:0}
  .gcard .play{width:auto;align-self:center}
  .packs-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .cos-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .admin-tabs{flex-wrap:wrap}
  .wrap{width:calc(100% - 20px)}
}
@media (orientation: portrait) and (max-width:380px){
  .gcard .art{height:74px;width:94px}
  .packs-grid{grid-template-columns:minmax(0,1fr)}
}
/* landscape phones keep 2-up cards */
@media (orientation: landscape) and (max-height:520px){
  .games-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
}
"""
open('public/style.css','w',encoding='utf-8').write(css)
print('css ok')
print('ALL PATCHES APPLIED — BUILD ' + BUILD)
