'use strict';
/* ============================================================
   VEXORA — player views (Arabic RTL)
   lobby · matchmaking · store · wallet · profile · friends
   All data comes from the live API — no mock state.
   ============================================================ */

/* ================= LOBBY ================= */
function viewLobby(){
  const g = S.me.user;
  const games = (S.config && S.config.games) || [];
  const playable = games.filter(x => x.playable);
  const soon = games.filter(x => !x.playable);
  return '<div class="wrap">'
    + '<section class="hero">'
    + '<div class="hero-l">'
    + '<div class="eyebrow">أهلاً، ' + esc(g.username) + ' · <span style="color:var(--green)"><span class="live-dot" style="display:inline-block"></span> <span class="num" id="online-now">' + fmt(S.presence.online) + '</span> لاعب متصل الآن</span></div>'
    + '<h2>حلبة <span class="grad-text">فيكسورا</span> تنتظرك</h2>'
    + '<p>مطابقة مباشرة ضد لاعبين حقيقيين، جوائز تُحسم على الخادم، ومتجر رسمي للعصي والإيموجي. اختبر نفسك الآن في فيكسورا كونكت.</p>'
    + '<div class="hero-cta">'
    + '<button class="btn primary big" onclick="quickMatch(\'connect4\')">' + icon('bolt', 18) + ' مباراة سريعة</button>'
    + '<button class="btn ghost big" onclick="practiceAI(\'connect4\')">' + icon('gamepad', 18) + ' تدريب ضد الحاسوب</button>'
    + '</div>'
    + '<div class="hero-stats">'
    + '<div class="hstat"><b class="num">' + fmt(S.me.coins) + '</b><span>رصيدك (عملة)</span></div>'
    + '<div class="hstat"><b class="num">' + g.rating + '</b><span>نقاط التصنيف</span></div>'
    + '<div class="hstat"><b class="num">' + g.wins + ' / ' + g.losses + '</b><span>فوز / خسارة</span></div>'
    + '</div></div>'
    + '<div class="hero-r"><div class="big" style="animation:heroFloat 5s ease-in-out infinite">' + logoMark(210) + '</div></div>'
    + '</section>'

    + '<section class="stats-row">'
    + scard('users', 'var(--grad-soft)', 'var(--cyan)', '<span class="num" id="online-now">' + fmt(S.presence.online) + '</span>', 'لاعب متصل')
    + scard('door', 'rgba(255,201,69,.13)', 'var(--gold)', '<span class="num" id="open-rooms-count">' + fmt(S.presence.openRooms) + '</span>', 'غرفة مفتوحة')
    + scard('gamepad', 'rgba(139,92,246,.16)', 'var(--violet)', '<span class="num">' + playable.length + '</span>', 'لعبة متاحة الآن')
    + scard('chart', 'rgba(52,211,153,.13)', 'var(--green)', '<span class="num">' + g.streak + '</span>', 'سلسلة انتصاراتك')
    + '</section>'

    + '<section class="lobby-grid2"><div>'
    + '<h3 class="section-title">' + icon('gamepad', 20) + ' ألعاب فيكسورا</h3>'
    + '<div class="section-sub">اضغط على لعبة للمطابقة أو إنشاء غرفة</div>'
    + '<div class="games-grid">'
    + playable.map(gameCardPlayable).join('')
    + soon.map(x => '<div class="gcard" style="opacity:.62" onclick="toast(\'قريبًا\',\'' + esc(x.name_ar) + ' ضمن التحديثات القادمة\',\'info\')">'
      + '<div class="art" style="display:flex;align-items:center;justify-content:center;height:128px;background:linear-gradient(160deg,#1a1f3d,#0b0e1c)">' + logoMark(64) + '</div>'
      + '<div class="bd"><b>' + esc(x.name_ar) + '</b><span class="arn">' + esc(x.name_en) + '</span>'
      + '<div class="onl"><i style="background:#64748b;box-shadow:none"></i>قريبًا</div>'
      + '<button class="btn ghost small wfull play">أعلمني</button></div></div>').join('')
    + '</div>'

    + '<div style="margin-top:34px"><h3 class="section-title">' + icon('door', 20) + ' غرف مفتوحة</h3>'
    + '<div class="section-sub">انضم لغرفة عامة أو أنشئ غرفتك وشارك الرمز</div>'
    + '<div id="rooms-list">' + roomCards() + '</div></div>'
    + '</div>'

    + '<aside style="display:flex;flex-direction:column;gap:20px">'
    + '<div class="card panel"><h3>' + icon('plus', 16) + ' إنشاء غرفة</h3>'
    + '<div style="display:flex;flex-direction:column;gap:10px">'
    + '<button class="btn primary wfull" onclick="createRoomUI(\'connect4\',false)">' + icon('door', 16) + ' غرفة عامة — فيكسورا كونكت</button>'
    + '<button class="btn ghost wfull" onclick="createRoomUI(\'connect4\',true)">' + icon('lock', 16) + ' غرفة خاصة (برمز)</button>'
    + '<div style="display:flex;gap:8px;margin-top:4px"><div class="gr-input" style="flex:1;margin:0"><input id="join-code" placeholder="رمز الغرفة مثل A1B2C3" style="width:100%"></div>'
    + '<button class="btn ghost" onclick="joinByCodeUI()">' + icon('arrow', 16) + '</button></div>'
    + '<div style="font-size:11.5px;color:var(--muted)">رسوم الدخول <span class="num">' + (S.config ? fmt(S.config.economy.entry) : 100) + '</span> عملة · الجائزة <span class="num">' + (S.config ? fmt(S.config.economy.pot) : 250) + '</span> عملة</div>'
    + '</div></div>'
    + '<div class="card panel"><h3>' + icon('trophy', 17) + ' المتصدرون</h3><div id="lb-list">' + lbRows() + '</div></div>'
    + '<div class="tourn"><div class="eyebrow" style="color:var(--gold)">سلسلة بطولات فيكسورا</div>'
    + '<h4 style="margin-top:8px">بطولة كونكت الذهبية</h4>'
    + '<div class="meta"><span>الجائزة</span><b style="color:var(--gold)">' + coinSVG(15) + ' <span class="num">50,000</span></b></div>'
    + '<div class="meta"><span>الحالة</span><b>الترتيب بالتصنيف قيد التجميع</b></div>'
    + '<div style="font-size:12px;color:var(--muted);line-height:1.7">أفضل ١٦ لاعبًا بالتصنيف يتأهلون تلقائيًا عند اكتمال العدد.</div></div>'
    + '</aside></section>'
    + '</div>';
}
function scard(ic, bg, col, val, lbl){
  return '<div class="card scard"><div class="ic" style="background:' + bg + ';color:' + col + '">' + icon(ic, 21) + '</div><div><b>' + val + '</b><span>' + lbl + '</span></div></div>';
}
function gameArtSVG(id){
  if (id === 'reversi') return '<svg width="86" height="86" viewBox="0 0 48 48"><rect x="6" y="6" width="36" height="36" rx="7" fill="none" stroke="#34d399" stroke-width="2.5" opacity=".5"/><circle cx="18" cy="18" r="5.5" fill="#0b0e1c" stroke="#e2e8f0" stroke-width="1.5"/><circle cx="30" cy="30" r="5.5" fill="#f8fafc"/><circle cx="30" cy="18" r="5.5" fill="#f8fafc"/><circle cx="18" cy="30" r="5.5" fill="#0b0e1c" stroke="#e2e8f0" stroke-width="1.5"/><circle cx="24" cy="8.5" r="0" /><circle cx="10" cy="24" r="5.5" fill="none" stroke="#22d3ee" stroke-width="1.6" stroke-dasharray="3 3"/></svg>';
  return '<svg width="86" height="86" viewBox="0 0 48 48"><circle cx="15" cy="16" r="5.5" fill="#22d3ee"/><circle cx="27" cy="16" r="5.5" fill="#8b5cf6"/><circle cx="39" cy="16" r="5.5" fill="#22d3ee"/><circle cx="21" cy="28" r="5.5" fill="#22d3ee"/><circle cx="33" cy="28" r="5.5" fill="#8b5cf6"/><circle cx="27" cy="40" r="5.5" fill="#22d3ee"/></svg>';
}
function gameCardPlayable(g){
  const count = S.presence.counts[g.id];
  return '<div class="gcard" onclick="gameMenu(\'' + g.id + '\')">'
    + '<div class="art" style="height:128px;display:flex;align-items:center;justify-content:center;background:linear-gradient(160deg,' + (g.id === 'reversi' ? '#0d3b2e,#071a14' : '#20306b,#0b0e1c') + ')">'
    + gameArtSVG(g.id)
    + '<span class="chip playable pl">مباشر الآن</span></div>'
    + '<div class="bd"><b>' + esc(g.name_ar) + '</b><span class="arn" style="direction:ltr">' + esc(g.name_en) + '</span>'
    + '<div class="onl"><i></i><span class="num" data-gc="' + g.id + '">' + (count ? fmt(count) : '٠') + '</span> يلعبون</div>'
    + '<button class="btn primary small wfull play">العب الآن</button></div></div>';
}
function lbRows(){
  const top = S.leaderboard || [];
  if (!top.length) return '<div class="empty">لا توجد نتائج بعد — كن أول المتصدرين!</div>';
  return top.map(p =>
    '<div class="lb-row" style="cursor:pointer" onclick="openPublicProfile(\'' + esc(p.username) + '\')"><div class="rk ' + (p.rank <= 3 ? 'r' + p.rank : 'rx') + '">' + p.rank + '</div>'
    + '<div class="nm">' + avatarHTML(p, 30, false) + '<b style="vertical-align:middle;margin-inline-start:8px">' + esc(p.username) + '</b><span>تصنيف <span class="num">' + p.rating + '</span> · مستوى ' + p.level + '</span></div>'
    + '<div class="cn" style="color:var(--green);font-weight:800"><span class="num">' + p.wins + '</span> فوز</div></div>').join('');
}
function roomCards(){
  if (!S.lobbyRooms.length) return '<div class="empty">لا توجد غرف مفتوحة — أنشئ واحدة وانتظر خصمًا!</div>';
  return '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:13px">'
    + S.lobbyRooms.map(r =>
      '<div class="room-card"><span class="code-badge">' + esc(r.code) + '</span>'
      + '<div style="flex:1;min-width:0"><b>' + esc(r.host.username) + '</b>'
      + '<div style="font-size:11.5px;color:var(--muted)">تصنيف <span class="num">' + r.host.rating + '</span> · ' + gameName(r.game) + '</div></div>'
      + '<button class="btn primary small" onclick="joinRoomUI(' + r.id + ')">انضم</button></div>').join('') + '</div>';
}
function gameName(id){ const g = (S.config.games || []).find(x => x.id === id); return g ? g.name_ar : id; }

/* ---------- game / matchmaking actions ---------- */
function gameMenu(id){
  openModal('<div style="text-align:center;padding-top:6px">'
    + '<div class="eyebrow">' + gameName(id) + '</div>'
    + '<h3 style="font-size:22px;margin:10px 0 6px">اختر طريقة اللعب</h3>'
    + '<div style="font-size:12.5px;color:var(--muted);margin-bottom:18px">رسوم الدخول <span class="num">' + (S.config ? fmt(S.config.economy.entry) : 100) + '</span> عملة · الجائزة <span class="num">' + (S.config ? fmt(S.config.economy.pot) : 250) + '</span> عملة</div>'
    + '<div style="display:flex;flex-direction:column;gap:10px">'
    + '<button class="btn primary wfull" onclick="closeModal();quickMatch(\'' + id + '\')">' + icon('bolt', 17) + ' ابحث عن خصم حقيقي</button>'
    + '<button class="btn ghost wfull" onclick="closeModal();practiceAI(\'' + id + '\')">' + icon('gamepad', 17) + ' تدريب ضد الحاسوب</button>'
    + '<button class="btn ghost wfull" onclick="closeModal();createRoomUI(\'' + id + '\',false)">' + icon('users', 17) + ' إنشاء غرفة وشارك الرمز</button>'
    + '</div></div>');
}
async function quickMatch(game){
  try {
    await api('POST', '/mm/queue', { game });
    matchModal(game);
  } catch(e){ toast('تعذر الدخول للطابور', e.message, 'err'); }
}
function matchModal(game){
  openModal('<div style="text-align:center" id="mm-modal">'
    + '<div class="mm-radar"><div class="ring"></div><div class="ring"></div><div class="ring"></div>'
    + '<div style="position:absolute;width:64px;height:64px;border-radius:50%;background:var(--grad-soft);border:1px solid var(--line2);display:flex;align-items:center;justify-content:center;color:var(--cyan)">' + icon('search', 26) + '</div></div>'
    + '<div style="font-weight:800;letter-spacing:.1em;font-size:14px" id="mm-status">جارٍ البحث عن خصم مناسب لمستواك…</div>'
    + '<div style="font-size:12px;color:var(--muted);margin-top:8px">نطاق البحث يتوسع كلما انتظرت أطول</div>'
    + '<button class="btn ghost wfull" style="margin-top:18px" onclick="cancelMatchUI()">' + icon('x', 16) + ' إلغاء البحث</button>'
    + '</div>');
}
async function cancelMatchUI(){
  try { await api('POST', '/mm/cancel'); } catch(e){}
  closeModal();
  toast('أُلغي البحث', 'يمكنك المحاولة متى شئت', 'info');
}
async function practiceAI(game){
  try {
    const j = await api('POST', '/mm/practice', { game });
    await openRoom(j.room.id);          /* fetch canonical safeState + chat */
  } catch(e){ toast('تعذر بدء التدريب', e.message, 'err'); }
}
async function createRoomUI(game, priv){
  try {
    const j = await api('POST', '/rooms', { game, privacy: priv ? 'private' : 'public' });
    await openRoom(j.room.id);
    toast('أُنشئت الغرفة ✓', 'شارك الرمز ' + j.room.code + ' مع خصمك', 'info');
  } catch(e){ toast('تعذر إنشاء الغرفة', e.message, 'err'); }
}
async function joinRoomUI(id){
  try {
    await api('POST', '/rooms/' + id + '/join');
    await openRoom(id);
    toast('انضممت للغرفة', 'بدأت المباراة — حظًا موفقًا!');
  } catch(e){ toast('تعذر الانضمام', e.message, 'err'); }
}
async function joinByCodeUI(){
  const code = ($('#join-code') ? $('#join-code').value : '').trim();
  if (!code) return toast('أدخل رمز الغرفة', '', 'err');
  try {
    const j = await api('POST', '/rooms/join-code', { code });
    await openRoom(j.room.id);
  } catch(e){ toast('تعذر الانضمام', e.message, 'err'); }
}

/* ================= STORE ================= */
let PAY_PROVIDER = 'manual';
function viewStore(){
  const items = S.storeItems || [];
  const inv = S.me.inventory || [];
  const owned = {}; inv.forEach(i => owned[i.item_id] = true);
  const tabs = [['packs', 'حزم العملات'], ['vip', 'عضويات VIP'], ['stick', 'عصي بريميوم'], ['emoji', 'إيموجي مدفوع'], ['looks', 'مظاهر وطاولات']];
  let body = '';
  if (S.storeTab === 'packs') body = packGrid(items.filter(i => i.kind === 'pack'), owned);
  if (S.storeTab === 'vip') body = vipGrid(items.filter(i => i.kind === 'vip'));
  if (S.storeTab === 'stick') body = cosGrid(items.filter(i => i.kind === 'stick'), owned, 'stick');
  if (S.storeTab === 'emoji') body = emojiGrid(items.filter(i => i.kind === 'emoji'), owned);
  if (S.storeTab === 'looks') body = cosGrid(items.filter(i => i.kind === 'theme' || i.kind === 'frame'), owned, null);
  return '<div class="wrap">'
    + '<section class="store-hero"><div><div class="eyebrow" style="color:var(--gold)">المتجر الرسمي</div>'
    + '<h2>متجر <span class="gold-text">فيكسورا</span></h2>'
    + '<p>اشحن عملات فيكسورا، فعّل عضوية VIP، واملك عصيًا وإيموجي حصرية. كل عمليات الشراء تُسجَّل في محفظتك.</p></div>'
    + '<div style="display:flex;align-items:center;gap:14px">' + coinSVG(60) + '<div><b style="font-size:22px" class="num">' + fmt(S.me.coins) + '</b><div style="font-size:11px;color:var(--muted);letter-spacing:.14em;font-weight:700">رصيدك الحالي</div></div></div></section>'
    + '<div class="store-tabs" style="margin-top:18px">' + tabs.map(t => '<button class="' + (S.storeTab === t[0] ? 'on' : '') + '" onclick="S.storeTab=\'' + t[0] + '\';render()">' + t[1] + '</button>').join('') + '</div>'
    + '<section class="section mt0">' + body + '</section>'
    + '</div>';
}
function packGrid(items, owned){
  return '<div class="packs-grid">' + items.map(p => {
    const total = p.coins, bonus = p.bonus_pct;
    return '<div class="pack' + (bonus >= 35 ? ' best' : '') + '">'
    + (bonus >= 35 ? '<span class="chip gold" style="position:absolute;top:-11px;left:50%;transform:translateX(-50%)">أفضل قيمة</span>' : '')
    + coinSVG(50)
    + '<div class="coins num">' + fmt(total) + '</div>'
    + (bonus ? '<div class="bonus num">+' + bonus + '% إضافية</div>' : '<div class="bonus" style="color:var(--muted)">حزمة البداية</div>')
    + '<div class="price num" style="direction:ltr">$' + (p.price_usd_cents / 100).toFixed(2) + '</div>'
    + '<button class="btn ' + (bonus >= 35 ? 'gold' : 'primary') + ' small wfull" onclick="checkoutUI(\'' + p.id + '\')">اشترِ الآن</button>'
    + '</div>';
  }).join('') + '</div>';
}
function vipGrid(items){
  const cls = { silver: 'silver', gold: 'gold', plat: 'plat' };
  const col = { silver: '#cbd5e1', gold: '#ffc945', plat: '#22d3ee' };
  const perks = {
    silver: ['مكافأة يومية ×2', 'شارة فضية على ملفك', 'أولوية في قائمة الغرف'],
    gold: ['مكافأة يومية ×3', 'اسم ذهبي مميز', 'إشعارات البطولات أولًا', 'خصم ١٠٪ قريبًا'],
    plat: ['مكافأة يومية ×5', 'إطار بلاتيني متحرك', 'أولوية قصوى في المطابقة', 'إصدارات مبكرة', 'دعم VIP مباشر']
  };
  const my = S.me.user.vip;
  return '<div class="vip-grid">' + items.map(v => {
    const tier = v.vip_tier;
    return '<div class="vip ' + (cls[tier] || '') + '">'
    + '<h4><span style="color:' + col[tier] + '">' + icon(tier === 'plat' ? 'bolt' : tier === 'gold' ? 'crown' : 'star', 20) + '</span> ' + esc(v.name_ar) + '</h4>'
    + '<div class="vprice num" style="color:' + col[tier] + ';direction:ltr">$' + (v.price_usd_cents / 100).toFixed(2) + '<span> / شهر</span></div>'
    + '<ul>' + perks[tier].map(pk => '<li>' + icon('check', 15) + ' ' + pk + '</li>').join('') + '</ul>'
    + '<div style="flex:1"></div>'
    + (my === tier ? '<button class="btn ghost wfull" disabled>' + icon('check', 16) + ' عضويتك الحالية</button>'
      : '<button class="btn ' + (tier === 'gold' ? 'gold' : 'primary') + ' wfull" onclick="checkoutUI(\'' + v.id + '\')">ترقية الآن</button>')
    + '</div>';
  }).join('') + '</div>';
}
function cosGrid(items, owned, kind){
  return '<div class="cos-grid">' + items.map(c => {
    const isOwned = owned[c.id];
    const eq = S.me.user.equipped || {};
    const equippedNow = kind && eq[kind] === c.id;
    return '<div class="cos">'
    + '<div class="ava" style="width:54px;height:54px;border-radius:16px;background:var(--grad-soft);color:var(--cyan)">' + icon(c.kind === 'stick' ? 'gamepad' : c.kind === 'frame' ? 'star' : 'smile', 24) + '</div>'
    + '<b>' + esc(c.name_ar) + '</b><span style="min-height:32px">' + esc(c.desc_ar) + '</span>'
    + (isOwned
      ? (kind ? '<button class="btn ' + (equippedNow ? 'ghost' : 'primary') + ' small wfull" onclick="equipUI(\'' + c.id + '\')">' + (equippedNow ? 'إلغاء التجهيز' : 'تجهيز') + '</button>' : '<span class="chip new">تملكها</span>')
      : '<button class="btn ghost small wfull" onclick="buyVCUI(\'' + c.id + '\')">' + coinSVG(14) + ' <span class="num">' + fmt(c.price_vc) + '</span></button>')
    + '</div>';
  }).join('') + '</div>';
}
function emojiGrid(items, owned){
  return '<div class="cos-grid">' + items.map(c => {
    const meta = (() => { try { return JSON.parse(c.meta || '{}'); } catch(e){ return {}; } })();
    const isOwned = owned[c.id] || c.price_vc === 0;
    return '<div class="cos">'
    + '<div style="font-size:26px;letter-spacing:3px;height:54px;display:flex;align-items:center">' + (meta.emojis || []).slice(0, 3).join(' ') + '</div>'
    + '<b>' + esc(c.name_ar) + '</b><span>' + esc(c.desc_ar) + '</span>'
    + (isOwned ? '<span class="chip new">تملكها</span>'
      : '<button class="btn ghost small wfull" onclick="buyVCUI(\'' + c.id + '\')">' + coinSVG(14) + ' <span class="num">' + fmt(c.price_vc) + '</span></button>')
    + '</div>';
  }).join('') + '</div>';
}
async function buyVCUI(id){
  try {
    await api('POST', '/store/buy', { item_id: id });
    toast('تم الشراء ✓', 'أُضيف إلى جردك', 'coin');
    await refreshMe(); render();
  } catch(e){ toast('فشل الشراء', e.message, 'err'); }
}
async function equipUI(id){
  try {
    const j = await api('POST', '/store/equip', { item_id: id });
    S.me.user.equipped = j.equipped;
    toast('تم التجهيز', 'سيظهر في ملفك وغرفتك', 'ok');
    render();
  } catch(e){ toast('تعذر التجهيز', e.message, 'err'); }
}

/* ---------- checkout (cash) ---------- */
function checkoutUI(itemId){
  const it = (S.storeItems || []).find(x => x.id === itemId);
  if (!it) return;
  const stripeReady = S.config && S.config.payments.stripe;
  const sim = S.config && S.config.payments.simulate;
  PAY_PROVIDER = 'manual';
  openModal('<div style="text-align:center;padding-top:6px">'
    + '<div class="eyebrow">متجر فيكسورا · الدفع</div>'
    + '<h3 style="font-size:20px;margin-top:10px">' + esc(it.name_ar) + '</h3>'
    + '<div style="font-size:29px;font-weight:900;color:var(--gold);margin:12px 0 4px" class="num" dir="ltr">$' + (it.price_usd_cents / 100).toFixed(2) + '</div>'
    + '<div id="pay-opts" class="pay-opts">'
    + '<div class="pay-opt sel" data-p="manual" onclick="pickPay(this)">'
    + icon('card', 18) + '<span>الدفع التجريبي — وضع التطوير</span>'
    + (sim ? '' : '<span style="margin-inline-start:auto;font-size:10px;color:var(--red)">معطل</span>') + '</div>'
    + '<div class="pay-opt" data-p="stripe" onclick="pickPay(this)" style="' + (stripeReady ? '' : 'opacity:.55') + '">'
    + icon('card', 18) + '<span>بطاقة (Stripe)</span>'
    + (stripeReady ? '' : '<span style="margin-inline-start:auto;font-size:10px;color:var(--gold)">يحتاج إعدادًا</span>') + '</div>'
    + '</div>'
    + (!stripeReady ? '<div class="pay-note">⚠️ الدفع بالبطاقة الحقيقي يتطلب ضبط <b dir="ltr">STRIPE_SECRET_KEY</b> و <b dir="ltr">STRIPE_WEBHOOK_SECRET</b> في ملف <b dir="ltr">.env</b> للخادم — راجع README. الدفع التجريبي يمر بنفس مسار التسوية الرسمي (طلب ← تسوية ← محفظة).</div>' : '')
    + '<div style="display:flex;gap:10px"><button class="btn ghost wfull" onclick="closeModal()">إلغاء</button>'
    + '<button class="btn gold wfull" id="pay-btn" onclick="doCheckout(\'' + it.id + '\')">' + icon('lock', 16) + ' ادفع الآن</button></div>'
    + '</div>');
}
function pickPay(el){
  document.querySelectorAll('.pay-opt').forEach(x => x.classList.remove('sel'));
  el.classList.add('sel');
  PAY_PROVIDER = el.getAttribute('data-p');
}
async function doCheckout(itemId){
  const b = $('#pay-btn');
  b.innerHTML = '<span class="spinner"></span> جارٍ المعالجة…'; b.disabled = true;
  try {
    const j = await api('POST', '/pay/create-order', { item_id: itemId, provider: PAY_PROVIDER });
    if (PAY_PROVIDER === 'stripe' && j.checkout && j.checkout.url){ location.href = j.checkout.url; return; }
    /* manual/dev: settle through the simulator (same pipeline a webhook uses) */
    const s = await api('POST', '/pay/simulate/' + j.order.id);
    if (s.ok){
      closeModal();
      toast('تمت عملية الدفع ✓', 'استلمت مشترياتك في حسابك', 'coin');
      await refreshMe();
      if (S.route === 'store') loadStore();
    }
  } catch(e){
    b.disabled = false; b.innerHTML = icon('lock', 16) + ' ادفع الآن';
    toast('تعذر إتمام الدفع', e.message, 'err');
  }
}
async function loadStore(){
  try { S.storeItems = (await api('GET', '/store/catalog')).items; if (S.route === 'store') render(); } catch(e){}
}

/* ================= WALLET ================= */
function viewWallet(){
  const w = S.wallet || { coins: S.me.coins, tx: [], can_daily: false, vip_mult: 1 };
  return '<div class="wrap">'
    + '<section class="wallet-top"><div class="bal-card">'
    + '<div class="lbl">' + icon('wallet', 14) + ' محفظة عملات فيكسورا</div>'
    + '<div class="amt">' + coinSVG(44) + '<span class="num" id="wallet-bal">' + fmt(w.coins) + '</span></div>'
    + '<div class="sub">الرصيد محفوظ على خادم فيكسورا · كل حركة مسجلة ومؤمّنة</div>'
    + '<div class="acts">'
    + '<button class="btn gold" onclick="navigate(\'store\')">' + icon('plus', 16) + ' شحن الرصيد</button>'
    + '<button class="btn ' + (w.can_daily ? 'primary' : 'ghost') + '" id="daily-btn" ' + (w.can_daily ? '' : 'disabled') + ' onclick="claimDaily()">' + icon('gift', 16) + ' ' + (w.can_daily ? 'استلم المكافأة اليومية (+' + fmt(500 * w.vip_mult) + ')' : 'استلمتها — عد لاحقًا') + '</button>'
    + '</div></div>'
    + '<div class="wallet-side"><div class="card panel"><h3>' + icon('flame', 16) + ' مضاعف VIP</h3>'
    + '<div style="font-size:13px;color:var(--muted);line-height:1.7">المكافأة اليومية الأساسية <span class="num">' + fmt(S.config ? S.config.economy.daily : 500) + '</span> عملة. مضاعفك الحالي: <b style="color:var(--gold)"><span class="num">×' + w.vip_mult + '</span></b>' + (w.vip_mult === 1 ? ' — رقِّ إلى VIP لمضاعفة المكافأة' : '') + '</div></div>'
    + '<div class="card panel" style="flex:1"><h3>' + icon('shield', 16) + ' أمان المحفظة</h3><div style="font-size:12.5px;color:var(--muted);line-height:1.75">الرصيد يُدار حصريًا عبر معاملات الخادم المؤمّنة (SQLite) — لا يمكن تعديله من المتصفح. كل عملية شراء أو جائزة تظهر في السجل أدناه.</div></div></div></section>'
    + '<section class="section"><div class="card tx-card"><h3>' + icon('swap', 16) + ' سجل المعاملات</h3>'
    + (w.tx.length ? w.tx.map(t => '<div class="tx-row">'
      + '<div class="tic" style="background:' + (t.delta >= 0 ? 'rgba(52,211,153,.13)' : 'rgba(251,113,133,.13)') + ';color:' + (t.delta >= 0 ? 'var(--green)' : 'var(--red)') + '">' + icon(t.delta >= 0 ? 'plus' : 'gift', 17) + '</div>'
      + '<div class="ti"><b>' + esc(t.reason) + '</b><span>' + ago(t.created_at) + '</span></div>'
      + '<div class="ta ' + (t.delta >= 0 ? 'plus' : 'minus') + ' num">' + (t.delta >= 0 ? '+' : '−') + fmt(Math.abs(t.delta)) + '</div></div>').join('') : '<div class="empty">لا معاملات بعد</div>')
    + '</div></section></div>';
}
async function loadWallet(){ try { S.wallet = await api('GET', '/wallet'); if (S.route === 'wallet') render(); } catch(e){} }
async function claimDaily(){
  try {
    const j = await api('POST', '/wallet/daily');
    toast('+' + fmt(j.amount) + ' عملة', 'استلمت مكافأتك اليومية', 'coin');
    await Promise.all([refreshMe(), loadWallet()]);
  } catch(e){ toast('لا يمكن الاستلام الآن', e.message, 'err'); }
}

/* ================= PROFILE ================= */
function viewProfile(){
  const u = S.me.user;
  const inv = S.me.inventory || [];
  const eq = u.equipped || {};
  const itemName = id => { const it = (S.storeItems || []).find(x => x.id === id); return it ? it.name_ar : id; };
  const ach = u.achievements || [];
  const ACH = [['firstwin', 'أول فوز', 'trophy'], ['streak3', 'ثلاثية نارية', 'flame'], ['rich', 'ثري فيكسورا', 'coins']];
  const wr = u.wins + u.losses > 0 ? Math.round(u.wins / (u.wins + u.losses) * 100) : 0;
  return '<div class="wrap">'
    + '<section class="card prof-head">'
    + '<span id="prof-ava" style="display:inline-block;border-radius:32px">' + avatarHTML(u, 96, true) + '</span>'
    + '<div class="prof-info"><div class="prof-name"><h2>' + esc(u.username) + '</h2>'
    + (u.vip ? '<span class="badge-vip">' + u.vip.toUpperCase() + ' VIP</span>' : '')
    + '<span class="chip classic num">تصنيف ' + u.rating + '</span></div>'
    + '<div style="color:var(--muted);font-size:13px;margin-top:6px">عضو منذ ' + new Date(u.created_at).toLocaleDateString('ar') + ' · <span dir="ltr" style="display:inline-block">VEXORA Player</span></div>'
    + '<div class="xp-wrap"><div class="xp-top"><span>المستوى ' + u.level + '</span><span class="num">' + fmt(u.xp % 1000) + ' / 1,000 XP</span></div>'
    + '<div class="xp-bar"><i style="width:' + (u.xp % 1000) / 10 + '%"></i></div></div></div>'
    + '<div style="display:flex;flex-direction:column;gap:12px;min-width:210px">'
    + '<div style="font-size:11.5px;color:var(--muted);font-weight:800">لون الصورة الشخصية</div>'
    + '<input type="range" min="0" max="359" value="' + (u.hue || 220) + '" class="hue-slider" oninput="var a=document.getElementById(\'prof-ava\');if(a)a.style.background=\'linear-gradient(135deg,hsl(\'+this.value+\',70%,55%),hsl(\'+((+this.value+60)%360)+\',70%,45%))\'" onchange="setHue(this.value)">'
    + '</div></section>'
    + '<section class="prof-grid">'
    + '<div class="card panel"><h3>' + icon('chart', 16) + ' إحصائياتي</h3>'
    + statRow('انتصارات', u.wins, 'var(--green)') + statRow('خسارات', u.losses, 'var(--red)')
    + statRow('نسبة الفوز', wr + '%', 'var(--cyan)')
    + statRow('أطول سلسلة', u.best_streak, 'var(--gold)')
    + '<div style="margin-top:10px"><div class="wrbar" style="max-width:none"><i style="width:' + wr + '%"></i></div></div></div>'
    + '<div class="card panel"><h3>' + icon('star', 16) + ' الإنجازات</h3><div class="ach-grid">'
    + ACH.map(a => { const on = ach.indexOf(a[0]) >= 0;
      return '<div class="ach' + (on ? '' : ' locked') + '"><div class="aic" style="background:' + (on ? 'var(--grad-soft)' : 'var(--glass)') + ';color:' + (on ? 'var(--cyan)' : 'var(--muted)') + '">' + icon(a[2], 20) + '</div><b>' + a[1] + '</b></div>'; }).join('')
    + '</div><div style="font-size:12px;color:var(--muted);margin-top:12px">' + ach.length + ' من ' + ACH.length + ' مُفتوحة</div></div>'
    + '<div class="card panel"><h3>' + icon('gift', 16) + ' جردي ومعداتي</h3>'
    + (inv.length ? '<div class="inv-grid">' + inv.map(i =>
      '<div class="inv-card' + (eq[i.kind] === i.item_id ? ' equipped' : '') + '">'
      + '<div class="ava" style="width:40px;height:40px;border-radius:12px;background:var(--grad-soft);color:var(--cyan)">' + icon(i.kind === 'emoji' ? 'smile' : i.kind === 'stick' ? 'gamepad' : 'star', 20) + '</div>'
      + '<b style="font-size:12.5px">' + esc(i.name_ar) + '</b>'
      + (i.kind === 'emoji'
        ? '<span class="chip new" style="font-size:9.5px">في الشات</span>'
        : (eq[i.kind] === i.item_id ? '<span class="chip playable" style="font-size:9.5px">مجهزة ✓</span>'
          : '<button class="btn ghost small wfull" style="padding:6px" onclick="equipUI(\'' + i.item_id + '\')">تجهيز</button>'))
      + '</div>').join('') + '</div>'
      : '<div class="empty">لا تملك عناصر بعد — تفقد <a href="#/store" onclick="navigate(\'store\')" style="color:var(--cyan)">المتجر</a></div>')
    + (eq.stick ? '<div style="margin-top:12px;font-size:12.5px;color:var(--muted)">العصية المجهزة: <b style="color:var(--cyan)">' + esc(itemName(eq.stick)) + '</b></div>' : '')
    + '</div></section></div>';
}
function statRow(lbl, val, col){
  return '<div class="stat-row"><div class="gi" style="width:40px;height:40px;border-radius:12px;background:var(--grad-soft);display:flex;align-items:center;justify-content:center;color:var(--cyan)">' + icon('bolt', 18) + '</div><div class="si"><b>' + lbl + '</b></div><b class="num" style="color:' + col + ';font-size:16px">' + val + '</b></div>';
}
async function setHue(h){
  try { await api('PATCH', '/me', { hue: Number(h) }); toast('تم تحديث اللون', '', 'ok'); refreshMe(); } catch(e){}
}

/* ================= FRIENDS ================= */
function viewFriends(){
  const f = S.friends || { friends: [], incoming: [], outgoing: [] };
  return '<div class="wrap" style="padding-top:26px">'
    + '<div style="display:grid;grid-template-columns:1fr 340px;gap:20px;align-items:start">'
    + '<div><h3 class="section-title">' + icon('users', 20) + ' أصدقائي</h3>'
    + '<div class="section-sub">أضف أصدقاءك لتحديهم ومعرفة حالتهم</div>'
    + '<div class="card panel">'
    + (f.friends.length ? f.friends.map(fr =>
      '<div class="fr-row">' + avatarHTML(fr.user, 40, false)
      + '<div class="nm"><b>' + esc(fr.user.username) + (fr.user.vip ? ' <span class="badge-vip" style="font-size:8px">' + fr.user.vip.toUpperCase() + '</span>' : '') + '</b>'
      + '<span style="font-size:12px;color:var(--muted)"><span class="onl-dot' + (fr.user.online ? '' : ' off') + '" style="margin-inline-end:5px"></span>' + (fr.user.online ? 'متصل الآن' : 'غير متصل') + ' · تصنيف <span class="num">' + fr.user.rating + '</span></span></div>'
      + '<button class="btn primary small" onclick="challengeFriendUI(' + fr.id + ',\'' + esc(fr.user.username) + '\')">' + icon('bolt', 14) + ' تحدٍّ</button>'
      + '<button class="btn ghost small" onclick="removeFriendUI(' + fr.id + ')">' + icon('x', 14) + '</button>'
      + '</div>').join('') : '<div class="empty">لا أصدقاء بعد — أضف لاعبًا من اليمين ←</div>')
    + '</div>'
    + (f.incoming.length ? '<div class="card panel" style="margin-top:16px"><h3>' + icon('bell', 16) + ' طلبات واردة</h3>'
      + f.incoming.map(rq => '<div class="fr-row"><div class="nm"><b>' + esc(rq.from.username) + '</b></div>'
        + '<button class="btn primary small" onclick="respondFriendUI(' + rq.id + ',true)">قبول</button>'
        + '<button class="btn ghost small" onclick="respondFriendUI(' + rq.id + ',false)">رفض</button></div>').join('') + '</div>' : '')
    + '</div>'
    + '<aside class="card panel"><h3>' + icon('plus', 16) + ' إضافة صديق</h3>'
    + '<div class="field"><label>اسم اللاعب</label><div class="inp">' + icon('user', 17) + '<input id="fr-name" placeholder="اسم المستخدم" onkeydown="if(event.key===\'Enter\')addFriendUI()"></div></div>'
    + '<button class="btn primary wfull" onclick="addFriendUI()">' + icon('arrow', 16) + ' إرسال طلب صداقة</button>'
    + '<div style="font-size:12px;color:var(--muted);margin-top:12px;line-height:1.7">يمكنك أيضًا فتح ملف أي لاعب من المتصدرين لإضافته.</div>'
    + (f.outgoing.length ? '<h3 style="margin-top:18px">' + icon('clock', 16) + ' طلبات معلقة</h3>' + f.outgoing.map(o => '<div class="fr-row"><div class="nm"><b>' + esc(o.to.username) + '</b><span style="font-size:11.5px;color:var(--muted)">بانتظار الموافقة</span></div></div>').join('') : '')
    + '</aside></div>'
    + '<div style="height:40px"></div></div>';
}
async function addFriendUI(){
  const n = ($('#fr-name') ? $('#fr-name').value : '').trim();
  if (!n) return toast('أدخل اسم اللاعب', '', 'err');
  try {
    await api('POST', '/friends/request', { username: n });
    toast('أُرسل الطلب', 'إلى ' + n, 'ok');
    $('#fr-name').value = '';
    loadFriends();
  } catch(e){ toast('تعذر الإرسال', e.message, 'err'); }
}
async function respondFriendUI(id, accept){
  try { await api('POST', '/friends/respond', { id, accept }); loadFriends(); render(); toast(accept ? 'أصبحتما صديقين ✓' : 'تم الرفض', '', accept ? 'ok' : 'info'); }
  catch(e){ toast('خطأ', e.message, 'err'); }
}
async function removeFriendUI(id){
  try { await api('DELETE', '/friends/' + id); loadFriends(); render(); toast('أُزيل الصديق', '', 'info'); }
  catch(e){ toast('خطأ', e.message, 'err'); }
}
function challengeFriendUI(fid, name){
  openModal('<div style="text-align:center;padding-top:8px">'
    + '<div class="eyebrow">تحدٍّ ودّي</div>'
    + '<h3 style="font-size:20px;margin:10px 0 4px">تحدّ ' + esc(name) + '</h3>'
    + '<div style="font-size:12.5px;color:var(--muted);margin-bottom:16px">تُنشأ غرفة خاصة برسوم دخول ' + (S.config ? fmt(S.config.economy.entry) : 100) + ' عملة — الجائزة ' + (S.config ? fmt(S.config.economy.pot) : 250) + ' عملة</div>'
    + '<div style="display:flex;flex-direction:column;gap:10px">'
    + '<button class="btn primary wfull" onclick="closeModal();doChallenge(' + fid + ',\'connect4\',\'' + esc(name) + '\')">' + icon('gamepad', 17) + ' فيكسورا كونكت</button>'
    + '<button class="btn ghost wfull" onclick="closeModal();doChallenge(' + fid + ',\'reversi\',\'' + esc(name) + '\')">' + icon('star', 17) + ' أوثيلو (Reversi)</button>'
    + '</div></div>');
}
async function doChallenge(fid, game, name){
  try {
    const j = await api('POST', '/friends/' + fid + '/challenge', { game });
    closeModal();
    await openRoom(j.room.id);
    toast('أُرسل التحدي ⚡', 'بانتظار انضمام ' + name + ' — رمز الغرفة ' + j.room.code, 'info');
  } catch(e){ toast('تعذر إرسال التحدي', e.message, 'err'); }
}
function showChallengeModal(d){
  openModal('<div style="text-align:center;padding-top:8px">'
    + '<div class="eyebrow">تحدٍّ جديد</div>'
    + '<h3 style="font-size:20px;margin:10px 0 4px">' + esc(d.from.username) + ' يتحدّاك!</h3>'
    + '<div style="font-size:13px;color:var(--muted);margin-bottom:6px">اللعبة: <b style="color:var(--cyan)">' + gameName(d.game) + '</b></div>'
    + '<div style="font-size:12px;color:var(--muted);margin-bottom:16px">رمز الغرفة <span class="code-badge" style="padding:4px 10px">' + esc(d.code) + '</span></div>'
    + '<div style="display:flex;gap:10px"><button class="btn ghost wfull" onclick="closeModal()">لاحقًا</button>'
    + '<button class="btn primary wfull" onclick="closeModal();joinRoomUI(' + d.roomId + ')">' + icon('bolt', 16) + ' قبول التحدي</button></div>'
    + '</div>');
}

/* ---------- public player profile ---------- */
async function openPublicProfile(name){
  try {
    const j = await api('GET', '/users/' + encodeURIComponent(name));
    const p = j.profile;
    openModal('<div style="text-align:center;padding-top:8px">'
      + avatarHTML(p, 84, false)
      + '<h3 style="font-size:21px;margin:12px 0 4px">' + esc(p.username) + (p.vip ? ' <span class="badge-vip" style="font-size:9px;vertical-align:middle">' + p.vip.toUpperCase() + ' VIP</span>' : '') + '</h3>'
      + '<div style="font-size:12px;color:var(--muted);margin-bottom:14px">' + (p.online ? '<span class="onl-dot" style="margin-inline-end:5px"></span>متصل الآن' : 'غير متصل') + ' · عضو منذ ' + new Date(p.created_at).toLocaleDateString('ar') + '</div>'
      + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:9px;margin-bottom:18px">'
      + '<div class="card scard" style="padding:13px;justify-content:center"><b class="num" style="color:var(--cyan);font-size:18px">' + p.rating + '</b><span style="font-size:10.5px">التصنيف</span></div>'
      + '<div class="card scard" style="padding:13px;justify-content:center"><b class="num" style="color:var(--green);font-size:18px">' + p.wins + '</b><span style="font-size:10.5px">انتصار</span></div>'
      + '<div class="card scard" style="padding:13px;justify-content:center"><b class="num" style="font-size:18px">' + p.level + '</b><span style="font-size:10.5px">المستوى</span></div>'
      + '</div>'
      + (p.username === S.me.user.username
        ? '<button class="btn ghost wfull" onclick="closeModal()">هذا أنت ✓</button>'
        : '<button class="btn primary wfull" onclick="closeModal();addFriendByName(\'' + esc(p.username) + '\')">' + icon('users', 16) + ' إضافة صديق</button>')
      + '</div>');
  } catch(e){ toast('تعذر فتح الملف', e.message, 'err'); }
}
async function addFriendByName(n){
  try {
    await api('POST', '/friends/request', { username: n });
    toast('أُرسل طلب الصداقة', 'إلى ' + n, 'ok');
    loadFriends();
  } catch(e){ toast('تعذر الإرسال', e.message, 'err'); }
}
