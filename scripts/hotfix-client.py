#!/usr/bin/env python3
# frontend hotfix: portrait UI hardening + "stuck in room" banner/reset

# ---------- 1) LOBBY BANNER (return to room / leave & reset) ----------
v = open('public/views.js', encoding='utf-8').read()
old_hero = """  return '<div class="wrap">'
    + '<section class="hero">'"""
new_hero = """  const ar = S.me.activeRoom;
  const activeBanner = ar
    ? '<div class="card activeroom-banner">'
      + '<span class="onl-dot"></span>'
      + '<div style="flex:1;min-width:0"><b>لديك ' + (ar.status === 'playing' ? 'مباراة جارية' : 'غرفة مفتوحة') + ' — ' + gameName(ar.game) + '</b>'
      + '<div class="sub">' + (ar.vs_ai ? 'تدريب ضد الحاسوب' : (ar.guest ? 'ضد ' + esc(ar.guest.username) : 'بانتظار خصم')) + ' · رمز <b class="num">' + esc(ar.code) + '</b></div></div>'
      + '<button class="btn primary small" onclick="openRoom(' + ar.id + ')">العودة للغرفة</button>'
      + '<button class="btn ghost small" onclick="leaveActiveUI()">مغادرة وإعادة تعيين</button>'
      + '</div>'
    : '';
  return '<div class="wrap">'
    + activeBanner
    + '<section class="hero">'"""
assert old_hero in v, 'lobby hero anchor'
v = v.replace(old_hero, new_hero, 1)

# append leaveActiveUI
v += """

/* stuck-room escape hatch */
async function leaveActiveUI(){
  try {
    const j = await api('POST', '/rooms/leave-active');
    toast(j.none ? 'لا توجد غرفة حالية' : 'تمت المغادرة وإعادة التعيين ✓',
          j.none ? '' : (j.conceded ? 'احتُسبت خسارة للمباراة المتروكة' : j.refunded ? 'استُرجعت رسوم الدخول' : 'أُغلقت الغرفة'), 'ok');
    S.roomView = null; S.roomChat = [];
    await refreshMe();
    navigate('lobby');
  } catch(e){ toast('تعذرت إعادة التعيين', e.message, 'err'); }
}
"""
open('public/views.js','w',encoding='utf-8').write(v)
print('views ok')

# ---------- 2) core.js: friendlier ALREADY_IN_ROOM errors ----------
c = open('public/core.js', encoding='utf-8').read()
old_toast = "function toast(title, msg, type){"
new_toast = """/* ALREADY_IN_ROOM → refresh state so the lobby banner shows escape buttons */
async function roomLockHint(err){
  if (err && err.code === 'ALREADY_IN_ROOM'){
    await refreshMe();
    if (S.route !== 'lobby') navigate('lobby'); else render();
    toast('لديك غرفة أو مباراة جارية', 'استخدم أزرار «العودة للغرفة» أو «مغادرة وإعادة تعيين» في أعلى اللوبي', 'info');
    return true;
  }
  return false;
}

function toast(title, msg, type){"""
assert old_toast in c
c = c.replace(old_toast, new_toast, 1)
open('public/core.js','w',encoding='utf-8').write(c)
print('core ok')

# quickMatch / practiceAI / createRoomUI / joinRoomUI use roomLockHint
vv = open('public/views.js', encoding='utf-8').read()
vv = vv.replace("""async function quickMatch(game){
  try {
    await api('POST', '/mm/queue', { game });
    matchModal(game);
  } catch(e){ toast('تعذر الدخول للطابور', e.message, 'err'); }
}""",
"""async function quickMatch(game){
  try {
    await api('POST', '/mm/queue', { game });
    matchModal(game);
  } catch(e){ if (!await roomLockHint(e)) toast('تعذر الدخول للطابور', e.message, 'err'); }
}""")
vv = vv.replace("""  try {
    const j = await api('POST', '/mm/practice', { game });
    await openRoom(j.room.id);          /* fetch canonical safeState + chat */
  } catch(e){ toast('تعذر بدء التدريب', e.message, 'err'); }""",
"""  try {
    const j = await api('POST', '/mm/practice', { game });
    await openRoom(j.room.id);          /* fetch canonical safeState + chat */
  } catch(e){ if (!await roomLockHint(e)) toast('تعذر بدء التدريب', e.message, 'err'); }""")
vv = vv.replace("""    toast('أُنشئت الغرفة ✓', 'شارك الرمز ' + j.room.code + ' مع خصمك', 'info');
  } catch(e){ toast('تعذر إنشاء الغرفة', e.message, 'err'); }""",
"""    toast('أُنشئت الغرفة ✓', 'شارك الرمز ' + j.room.code + ' مع خصمك', 'info');
  } catch(e){ if (!await roomLockHint(e)) toast('تعذر إنشاء الغرفة', e.message, 'err'); }""")
open('public/views.js','w',encoding='utf-8').write(vv)
print('views hooks ok')

# ---------- 3) PORTRAIT / SMALL-SCREEN CSS HARDENING ----------
css = open('public/style.css', encoding='utf-8').read()
css += """

/* ============================================================
   HOTFIX — portrait & small-screen hardening (no overlap, no clipping)
   ============================================================ */
/* kill horizontal overflow everywhere */
html, body{overflow-x:hidden;max-width:100vw}
.wrap{width:min(1240px,100% - 24px)}
main{min-width:0}

/* grid children may shrink (fixes canvas/board pushing columns → overlap) */
.gr-room{grid-template-columns:minmax(0,1fr) minmax(280px,330px)}
.gr-room > *{min-width:0}
.lobby-grid2{grid-template-columns:minmax(0,1fr) minmax(280px,340px)}
.lobby-grid2 > *{min-width:0}
.wallet-top{grid-template-columns:minmax(0,1.25fr) minmax(0,.75fr)}
.wallet-top > *{min-width:0}
.prof-grid > *{min-width:0}
.stats-row > *{min-width:0}

/* portrait: everything stacks, boards cap by width */
@media (orientation: portrait){
  .gr-room, .lobby-grid2, .wallet-top, .charts{grid-template-columns:minmax(0,1fr)!important}
  .gr-side{order:2}
  .hero{grid-template-columns:minmax(0,1fr)}
  .hero-r{display:none}
  .hero-l{padding:26px 22px;min-height:0}
  .vsbar{grid-template-columns:1fr;justify-items:center;gap:8px;text-align:center}
  .vsbar .vs{order:-1}
  .gstat{flex-direction:column;align-items:flex-start;gap:6px}
  .hdr-in{gap:8px}
  .hdr-logo .sub{display:none}
  #conn-status{display:none}
  .coin-pill .num{max-width:70px;overflow:hidden;text-overflow:ellipsis}
  .hdr-user .nm{max-width:72px}
}

/* very narrow phones (<380px): tighten header + boards */
@media (orientation: portrait) and (max-width:380px){
  .wrap{width:calc(100% - 16px)}
  .hdr-in{height:60px}
  .hdr-logo .wm{font-size:16px!important;letter-spacing:.14em!important}
  .coin-pill{padding:6px 9px 6px 7px;font-size:12.5px}
  .ch-board{border-width:4px;width:98vw;font-size:8.4vw}
  .pool-wrap{width:100vw;margin-inline:-8px}
  .bg-board{border-width:4px;width:98vw}
  .pt{min-height:64px}
  .hero h2{font-size:24px}
  .btn{padding:11px 16px;font-size:13px}
  .ftr-main{grid-template-columns:1fr;gap:22px}
}

/* small tablets portrait */
@media (orientation: portrait) and (min-width:381px) and (max-width:600px){
  .ch-board{width:min(96vw,60vh)}
  .pool-wrap{width:96vw}
}

/* modals become bottom sheets on phones (no clipping) */
@media (max-width:600px){
  .modal-ov{align-items:flex-end;padding:0}
  .modal{width:100%;max-height:86vh;border-radius:22px 22px 0 0;animation:sheetIn .22s}
  @keyframes sheetIn{from{transform:translateY(40px);opacity:0}}
}

/* active-room banner (stuck fix) */
.activeroom-banner{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:18px;
  border:1px solid rgba(34,211,238,.4);background:linear-gradient(135deg,rgba(34,211,238,.10),rgba(139,92,246,.08))}
.activeroom-banner b{font-size:14px}

/* room chat fits phones */
.gr-chat{height:min(52vh,340px)}
@media (orientation: landscape) and (max-height:640px){ .gr-chat{height:min(46vh,280px)} }

/* lobby cards & lists never overflow */
.gcard .bd{min-width:0}
.room-card{flex-wrap:wrap}
.stat-row{flex-wrap:wrap}

/* dd menus fit narrow screens */
.dd{width:min(300px,calc(100vw - 24px));max-height:70vh}
.user-menu{width:min(230px,calc(100vw - 24px))}
"""
open('public/style.css','w',encoding='utf-8').write(css)
print('css ok')
print('ALL FRONTEND PATCHES APPLIED')
