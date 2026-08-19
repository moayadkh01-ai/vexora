'use strict';
/* ============================================================
   VEXORA Mobile Edition — offline single file
   Same brand/engines as the platform, runs entirely in the
   browser (games vs the platform's AI strength, full coins/
   store/wallet/profile). Data persists in localStorage when
   available; multiplayer + cross-device accounts live on the
   hosted platform (see DEPLOY.md).
   ============================================================ */

/* ---------- utils ---------- */
const $ = s => document.querySelector(s);
const fmt = n => Math.round(n).toLocaleString('en-US');
const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function toast(t, sub, type){
  const el = document.createElement('div');
  el.className = 'toast';
  el.style.borderColor = type === 'err' ? 'rgba(251,113,133,.5)' : type === 'coin' ? 'rgba(255,201,69,.5)' : 'var(--line2)';
  el.innerHTML = '<b>' + esc(t) + '</b>' + (sub ? '<div style="color:var(--muted);font-size:12px;margin-top:2px">' + esc(sub) + '</div>' : '');
  $('#toasts').appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
function openModal(html){ $('#modal-root').innerHTML = '<div class="modal-ov" onclick="if(event.target===this)closeModal()"><div class="modal">' + html + '</div></div>'; }
function closeModal(){ $('#modal-root').innerHTML = ''; }

/* ---------- brand ---------- */
function mark(s){ return '<svg width="'+s+'" height="'+s+'" viewBox="0 0 96 96" style="flex-shrink:0"><defs><linearGradient id="vm'+s+'" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#8b5cf6"/><stop offset=".52" stop-color="#6366f1"/><stop offset="1" stop-color="#22d3ee"/></linearGradient></defs><path d="M48 3 L86 25 V71 L48 93 L10 71 V25 Z" fill="url(#vm'+s+')"/><path d="M25 31 H38.5 L48 53.5 L57.5 31 H71 L48 77 Z" fill="#05070f"/></svg>'; }
function coin(s){ return '<svg width="'+s+'" height="'+s+'" viewBox="0 0 40 40" style="flex-shrink:0;vertical-align:-3px"><defs><linearGradient id="vc'+s+'" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe08a"/><stop offset="1" stop-color="#f59e0b"/></linearGradient></defs><circle cx="20" cy="20" r="18" fill="url(#vc'+s+')"/><path d="M12 13h4.6L20 20l3.4-7H28l-8 15-8-15z" fill="#3a2703"/></svg>'; }

/* ---------- storage (works even in sandboxed previews) ---------- */
const MEM = {};
const store = {
  get(k){ try { return window.localStorage.getItem(k); } catch(e){ return (k in MEM) ? MEM[k] : null; } },
  set(k, v){ try { window.localStorage.setItem(k, v); } catch(e){ MEM[k] = v; } }
};
const hash = s => { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return 'h' + (h >>> 0).toString(36); };

/* ---------- engines (same logic as the platform server) ---------- */
const C4 = {
  new(){ return { b: Array.from({length:6},()=>new Array(7).fill(0)), turn: 1, over: false, winner: 0, win: [], last: null }; },
  play(st, slot, col){
    if (st.over || st.turn !== slot) return false;
    let row = -1;
    for (let r = 5; r >= 0; r--){ if (!st.b[r][col]){ row = r; break; } }
    if (row < 0) return false;
    st.b[row][col] = slot; st.last = [row, col];
    const w = C4.win(st.b, slot);
    if (w){ st.over = true; st.winner = slot; st.win = w; return true; }
    if (st.b.every(r => r.every(v => v))){ st.over = true; return true; }
    st.turn = 3 - slot; return true;
  },
  win(b, p){
    const dirs = [[0,1],[1,0],[1,1],[1,-1]];
    for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++)
      for (const d of dirs){
        const cells = [[r,c]];
        for (let k = 1; k < 4; k++){
          const rr = r + d[0]*k, cc = c + d[1]*k;
          if (rr<0||rr>5||cc<0||cc>6||b[rr][cc]!==p) break;
          cells.push([rr,cc]);
        }
        if (cells.length === 4) return cells;
      }
    return null;
  },
  ai(st){
    const order = [3,2,4,1,5,0,6];
    for (const p of [2,1]) for (const c of order){
      const t = { b: st.b.map(r => r.slice()), turn: p, over: false };
      let row = -1; for (let r = 5; r >= 0; r--){ if (!t.b[r][c]){ row = r; break; } }
      if (row < 0) continue;
      t.b[row][c] = p; if (C4.win(t.b, p)) return c;
    }
    const open = order.filter(c => !st.b[0][c]);
    return open.length ? open[Math.floor(Math.random()*open.length)] : -1;
  }
};
const RV_DIRS = [[0,1],[0,-1],[1,0],[-1,0],[1,1],[1,-1],[-1,1],[-1,-1]];
const RV_W = [[120,-20,20,5,5,20,-20,120],[-20,-40,-5,-5,-5,-5,-40,-20],[20,-5,15,3,3,15,-5,20],[5,-5,3,3,3,3,-5,5],[5,-5,3,3,3,3,-5,5],[20,-5,15,3,3,15,-5,20],[-20,-40,-5,-5,-5,-5,-40,-20],[120,-20,20,5,5,20,-20,120]];
function rvFlips(b, r, c, p){
  if (r<0||r>7||c<0||c>7||b[r][c]) return null;
  const all = [];
  for (const d of RV_DIRS){
    const line = []; let x = r + d[0], y = c + d[1];
    while (x>=0&&x<8&&y>=0&&y<8&&b[x][y]===3-p){ line.push(1); x+=d[0]; y+=d[1]; }
    if (line.length && x>=0&&x<8&&y>=0&&y<8&&b[x][y]===p) all.push(1);
  }
  return all.length ? all : null;
}
const RV = {
  new(){ const b = Array.from({length:8},()=>new Array(8).fill(0)); b[3][3]=2;b[3][4]=1;b[4][3]=1;b[4][4]=2; return { b, turn: 1, over: false, winner: 0, last: null, passes: 0 }; },
  legal(st, p){ const out = []; for (let r=0;r<8;r++) for (let c=0;c<8;c++) if (!st.b[r][c] && rvFlips(st.b,r,c,p)) out.push([r,c]); return out; },
  play(st, p, m){
    if (st.over || st.turn !== p) return false;
    const flips = rvFlips(st.b, m[0], m[1], p);
    if (!flips) return false;
    st.b[m[0]][m[1]] = p;
    for (const d of RV_DIRS){
      let x = m[0]+d[0], y = m[1]+d[1];
      while (x>=0&&x<8&&y>=0&&y<8&&st.b[x][y]===3-p){ st.b[x][y]=p; x+=d[0]; y+=d[1]; }
    }
    st.last = m; st.passes = 0; st.turn = 3 - p;
    if (st.b.every(r => r.every(v => v))) return RV.finish(st), true;
    return true;
  },
  finish(st){ let a=0,b=0; st.b.forEach(r=>r.forEach(v=>{if(v===1)a++;else if(v===2)b++;})); st.over=true; st.winner = a>b?1:b>a?2:0; },
  counts(st){ let a=0,b=0; st.b.forEach(r=>r.forEach(v=>{if(v===1)a++;else if(v===2)b++;})); return [a,b]; },
  ai(st){
    const moves = RV.legal(st, 2);
    if (!moves.length) return null;
    let best = null, bs = -1e9;
    for (const m of moves){
      const s = RV_W[m[0]][m[1]] * 10 - rvFlips(st.b,m[0],m[1],2).length * 2 + Math.random() * 8;
      if (s > bs){ bs = s; best = m; }
    }
    return best;
  }
};

/* ---------- local database ---------- */
const DB_KEY = 'vexora_mobile_v1';
let db = null;
try { db = JSON.parse(store.get(DB_KEY)) || null; } catch(e){ db = null; }
if (!db || !db.users) db = { users: [], session: null };
function save(){ store.set(DB_KEY, JSON.stringify(db)); }
function me(){ return db.users.find(u => u.n === db.session) || null; }
function mkUser(n, p){
  return { n, p: hash(p), coins: 1000, xp: 0, vip: null, streak: 0, best: 0,
    w: { connect4: [0,0], reversi: [0,0] }, tx: [], inv: [], eq: {}, ach: [], daily: 0 };
}
function level(u){ return Math.floor(u.xp / 1000) + 1; }
function vipMult(u){ return u.vip === 'plat' ? 5 : u.vip === 'gold' ? 3 : u.vip === 'silver' ? 2 : 1; }
function wallet(u, delta, reason){ u.coins += delta; u.tx.unshift({ r: reason, d: delta, t: Date.now() }); if (u.tx.length > 60) u.tx.length = 60; }
function addXp(u, n){ u.xp += n; }
function grantAch(u, id, name){
  if (u.ach.indexOf(id) >= 0) return;
  u.ach.push(id);
  toast('إنجاز جديد: ' + name, '', 'coin');
}

/* ---------- catalog ---------- */
const PACKS = [ {c:5000,b:0,p:'$4.99'},{c:11000,b:10,p:'$9.99'},{c:30000,b:20,p:'$19.99'},{c:81000,b:35,p:'$44.99'},{c:256000,b:60,p:'$99.99'} ];
const VIPS = [ {id:'silver',n:'فضية',m:2,cost:25000},{id:'gold',n:'ذهبية',m:3,cost:60000},{id:'plat',n:'بلاتينية',m:5,cost:120000} ];
const STICKS = [ {id:'st1',n:'عصية السديم',cost:2500},{id:'st2',n:'عصية الشفق',cost:4000},{id:'st3',n:'عصية التنين',cost:6000},{id:'st4',n:'عصية الشبح',cost:9000} ];
const EMOJIS = [ {id:'vex',n:'وجوه فيكسورا الأساسية',cost:0,e:'🎮🔥😂😮😢👋'},{id:'em1',n:'حزمة الذهب',cost:1800,e:'👑💎🏆🥇💰⚡'},{id:'em2',n:'حزمة النيون',cost:2200,e:'😎🤖👾🚀🌟🎯'},{id:'em3',n:'حزمة الكاواي',cost:2600,e:'🥰🐱🍓🎈🎁🦄'} ];

/* ---------- state + router ---------- */
const S = { route: 'boot', storeTab: 'packs', game: null, gameKind: 'connect4' };
function navigate(r){ S.route = r; render(); window.scrollTo(0,0); }

/* ---------- boot ---------- */
function viewBoot(){
  const letters = 'VEXORA'.split('').map((ch,i) => '<span style="animation-delay:'+(0.2+i*0.08)+'s" class="grad-text">'+ch+'</span>').join('');
  setTimeout(() => navigate(me() ? 'lobby' : 'auth'), 1800);
  return '<div class="boot">' + mark(96) + '<div class="wm">' + letters + '</div>'
    + '<div class="tagline">نسخة الجوال · العب بلا حدود</div><div class="bbar"><i></i></div></div>';
}

/* ---------- auth ---------- */
function viewAuth(){
  return '<div class="wrap" style="padding-top:34px">'
    + '<div style="text-align:center;margin-bottom:22px">' + mark(64) + '<div class="wm" style="font-size:24px;margin-top:10px">VEXORA</div><div class="tagline">فيكسورا · نسخة الجوال</div></div>'
    + '<div class="card">'
    + '<div class="eyebrow">حساب جديد</div>'
    + '<div class="field" style="margin-top:10px"><label>اسم المستخدم</label><div class="inp"><input id="rg-u" placeholder="٣-٢٠ حرفًا" maxlength="20"></div><div class="fmsg" id="e1"></div></div>'
    + '<div class="field"><label>كلمة المرور</label><div class="inp"><input id="rg-p" type="password" placeholder="٦ أحرف على الأقل"></div><div class="fmsg" id="e2"></div></div>'
    + '<button class="btn primary wfull" onclick="doRegister()">إنشاء حساب + <span class="num">1,000</span> عملة</button>'
    + '<div style="text-align:center;color:var(--muted);font-size:12px;margin:14px 0">لديك حساب؟</div>'
    + '<div class="field" style="margin:0"><div class="inp"><input id="lg-n" placeholder="اسم المستخدم"></div></div>'
    + '<div class="field"><div class="inp"><input id="lg-p" type="password" placeholder="كلمة المرور"></div><div class="fmsg" id="e3"></div></div>'
    + '<button class="btn ghost wfull" onclick="doLogin()">تسجيل الدخول</button>'
    + '<div class="warn-note">نسخة الجوال تعمل داخل متصفحك فقط: الحسابات والعملات تُحفظ على جهازك، والمطابعة ضد خصم حقيقي متاحة في نسخة المنصة الكاملة.</div>'
    + '</div></div>';
}
function ferr(id, m){ const e = $('#' + id); if (e){ e.textContent = m; e.classList.add('show'); } }
function doRegister(){
  const n = ($('#rg-u').value || '').trim(), p = $('#rg-p').value || '';
  const re = /^[A-Za-z0-9_\u0600-\u06FF]{3,20}$/;
  if (!re.test(n)) return ferr('e1', 'الاسم يجب أن يكون ٣–٢٠ حرفًا إنجليزيًا أو عربيًا مع _');
  if (db.users.some(u => u.n.toLowerCase() === n.toLowerCase())) return ferr('e1', 'الاسم محجوز — جرّب غيره');
  if (p.length < 6) return ferr('e2', 'كلمة المرور ٦ أحرف على الأقل');
  const u = mkUser(n, p);
  db.users.push(u); db.session = n; save();
  toast('أهلاً بك في فيكسورا 🎮', '+1,000 عملة ترحيبية', 'coin');
  navigate('lobby');
}
function doLogin(){
  const n = ($('#lg-n').value || '').trim(), p = $('#lg-p').value || '';
  const u = db.users.find(x => x.n.toLowerCase() === n.toLowerCase());
  if (!u || u.p !== hash(p)) return ferr('e3', 'بيانات غير صحيحة');
  db.session = n; save();
  toast('أهلاً بعودتك، ' + u.n, '', 'coin');
  navigate('lobby');
}
function logout(){ db.session = null; save(); navigate('auth'); }

/* ---------- shell ---------- */
function shell(body, title){
  document.title = (title || 'فيكسورا') + ' | VEXORA';
  const u = me();
  const nav = (r, lbl) => '<a class="' + (S.route === r ? 'active' : '') + '" onclick="navigate(\'' + r + '\')">' + lbl + '</a>';
  return '<div class="appbar"><div class="wrap appbar-in">'
    + '<a onclick="navigate(\'lobby\')" style="display:flex;align-items:center;gap:8px">' + mark(34) + '<b style="font-size:16px;letter-spacing:.16em">VEXORA</b></a>'
    + '<div style="flex:1"></div>'
    + '<span class="coinpill">' + coin(17) + '<span class="num">' + fmt(u.coins) + '</span></span>'
    + '<span class="ava" style="width:36px;height:36px;font-size:15px" onclick="navigate(\'profile\')">' + esc(u.n[0].toUpperCase()) + '</span>'
    + '</div></div>'
    + '<div class="wrap" style="padding-top:16px">' + body + '</div>'
    + '<div class="bottom-nav">'
    + nav('lobby', '🏠<div>اللوبي</div>') + nav('game', '🎮<div>العب</div>') + nav('store', '🛒<div>المتجر</div>') + nav('wallet', '👛<div>المحفظة</div>') + nav('profile', '👤<div>ملفي</div>')
    + '</div>';
}

/* ---------- lobby ---------- */
function viewLobby(){
  const u = me();
  return shell(
    '<div class="card" style="background:linear-gradient(135deg,rgba(139,92,246,.22),rgba(34,211,238,.1))">'
    + '<div class="eyebrow">أهلاً، ' + esc(u.n) + '</div>'
    + '<h2 class="title">حلبة فيكسورا في جيبك</h2>'
    + '<div class="sub">لعبان كاملان ضد ذكاء المنصة نفسه، مع اقتصاد عملات حقيقي على جهازك.</div>'
    + '<button class="btn primary wfull" style="margin-top:12px" onclick="startGame(\'connect4\')">⚡ مباراة كونكت سريعة</button></div>'
    + '<div class="section">'
    + gCard('connect4', 'فيكسورا كونكت', 'أربعة تربح · دخول 100 · جائزة 150', '#20306b', '#22d3ee')
    + gCard('reversi', 'أوثيلو (Reversi)', 'اقلب الأقراص · دخول 100 · جائزة 150', '#0d3b2e', '#34d399')
    + '</div>'
    + '<div class="card section" style="text-align:center">'
    + '<div style="font-size:12px;color:var(--muted);line-height:1.8">النسخة الكاملة متعددة اللاعبين (مطابقة حية + أصدقاء + متجر سيرفر) تعمل على خادم فيكسورا — الحزمة الكاملة في ملف <b>VEXORA-complete.zip</b></div></div>',
    'اللوبي');
}
function gCard(id, name, sub, bg, col){
  return '<div class="gcard" onclick="startGame(\'' + id + '\')">'
    + '<div class="gico" style="background:' + bg + ';color:' + col + '"><svg width="30" height="30" viewBox="0 0 48 48">'
    + (id === 'reversi'
       ? '<circle cx="18" cy="18" r="6" fill="#0b0e1c" stroke="#e2e8f0"/><circle cx="30" cy="30" r="6" fill="#f8fafc"/><circle cx="30" cy="18" r="6" fill="#f8fafc"/><circle cx="18" cy="30" r="6" fill="#0b0e1c" stroke="#e2e8f0"/>'
       : '<circle cx="15" cy="16" r="5.5" fill="#22d3ee"/><circle cx="27" cy="16" r="5.5" fill="#8b5cf6"/><circle cx="39" cy="16" r="5.5" fill="#22d3ee"/><circle cx="21" cy="29" r="5.5" fill="#22d3ee"/><circle cx="33" cy="29" r="5.5" fill="#8b5cf6"/><circle cx="27" cy="40" r="5" fill="#22d3ee"/>')
    + '</svg></div>'
    + '<div style="flex:1"><b>' + name + '</b><div class="onl">' + sub + '</div></div>'
    + '<button class="btn primary small">العب</button></div>';
}

/* ---------- game (vs platform AI) ---------- */
const ENTRY = 100, AI_PRIZE = 150;
function startGame(kind){
  const u = me();
  if (u.coins < ENTRY) return toast('رصيدك لا يكفي', 'اشحن من المتجر (مجاني في نسخة الجوال)', 'err');
  wallet(u, -ENTRY, 'دخول مباراة ' + (kind === 'reversi' ? 'أوثيلو' : 'كونكت'));
  S.gameKind = kind;
  S.game = kind === 'reversi' ? RV.new() : C4.new();
  save();
  navigate('game');
}
function viewGame(){
  const u = me();
  if (!S.game) return shell(
    '<div class="card" style="text-align:center"><div style="font-size:40px;margin-bottom:8px">🎮</div><b>اختر لعبة لتبدأ</b><div class="sub" style="margin:8px 0 14px">دخول ' + ENTRY + ' عملة · الفوز +' + AI_PRIZE + ' عملة و +60 XP</div>'
    + '<button class="btn primary wfull" onclick="startGame(\'connect4\')">⚡ فيكسورا كونكت</button>'
    + '<button class="btn ghost wfull" style="margin-top:9px" onclick="startGame(\'reversi\')">⚫ أوثيلو (Reversi)</button></div>', 'العب');
  return shell(gameBody(), 'العب');
}
function gameBody(){
  const g = S.game, u = me();
  if (S.gameKind === 'reversi'){
    const myTurn = !g.over && g.turn === 1;
    const legal = myTurn ? RV.legal(g, 1) : [];
    const set = {}; legal.forEach(m => set[m[0] + '-' + m[1]] = 1);
    const [a, b] = RV.counts(g);
    const board = '<div class="rv-board">' + g.b.map((row, r) => row.map((c, ci) =>
      '<div class="rv-cell' + (c === 1 ? ' p1' : c === 2 ? ' p2' : '') + (set[r + '-' + ci] ? ' hint' : '') + '"' + (set[r + '-' + ci] ? ' onclick="rvMove(' + r + ',' + ci + ')"' : '') + '></div>').join('')).join('') + '</div>';
    const status = g.over
      ? '<b style="color:' + (g.winner === 1 ? 'var(--green)' : g.winner === 2 ? 'var(--red)' : 'var(--gold)') + '">' + (g.winner === 1 ? '🏆 فزت! +' + AI_PRIZE + ' عملة' : g.winner === 2 ? 'خسرت هذه المرة' : 'تعادل') + '</b>'
      : '<span>' + (myTurn ? '<span class="dotp d1"></span><b>دورك</b>' : '<span class="dotp d2"></span>دور الحاسوب…') + '</span>'
        + '<span class="num" style="color:var(--muted);font-size:12px">' + a + ' - ' + b + '</span>';
    return '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px"><b>' + (S.gameKind === 'reversi' ? 'أوثيلو' : 'فيكسورا كونكت') + '</b>'
      + '<span style="font-size:11.5px;color:var(--muted)">دخول ' + ENTRY + ' · جائزة ' + AI_PRIZE + '</span></div>'
      + '<div class="gstatus" style="margin-top:8px">' + status + '</div>' + board
      + (g.over ? endButtons() : '') + '</div>';
  }
  const myTurn = !g.over && g.turn === 1;
  const winSet = {}; (g.win || []).forEach(w => winSet[w[0] + '-' + w[1]] = 1);
  const hints = myTurn ? [0,1,2,3,4,5,6].filter(c => !g.b[0][c]) : [];
  const board = '<div class="c4-board">' + g.b.map((row, r) => row.map((c, ci) =>
    '<div class="c4-cell' + (c === 1 ? ' p1' : c === 2 ? ' p2' : '') + (winSet[r + '-' + ci] ? ' win' : '') + '"' + (hints.indexOf(ci) >= 0 ? ' onclick="c4Move(' + ci + ')"' : '') + '></div>').join('')).join('') + '</div>';
  const status = g.over
    ? '<b style="color:' + (g.winner === 1 ? 'var(--green)' : g.winner === 2 ? 'var(--red)' : 'var(--gold)') + '">' + (g.winner === 1 ? '🏆 فزت! +' + AI_PRIZE + ' عملة' : g.winner === 2 ? 'خسرت هذه المرة' : 'تعادل — استُرجع الدخول') + '</b>'
    : (myTurn ? '<span class="dotp d1"></span><b>دورك</b> — اختر عمودًا' : '<span class="dotp d2"></span>دور الحاسوب…');
  return '<div class="card"><div style="display:flex;justify-content:space-between;align-items:center"><b>فيكسورا كونكت</b><span style="font-size:11.5px;color:var(--muted)">دخول ' + ENTRY + ' · جائزة ' + AI_PRIZE + '</span></div>'
    + '<div class="gstatus" style="margin:8px 0">' + status + '</div>' + board + (g.over ? endButtons() : '') + '</div>';
}
function endButtons(){
  return '<div style="display:flex;gap:8px;margin-top:6px">'
    + '<button class="btn ghost wfull" onclick="S.game=null;render()">خروج</button>'
    + '<button class="btn primary wfull" onclick="startGame(S.gameKind)">مباراة جديدة (' + ENTRY + ')</button></div>';
}
function c4Move(col){
  const g = S.game;
  if (!g || g.over || g.turn !== 1) return;
  if (!C4.play(g, 1, col)) return;
  if (g.over){ settle(g); save(); render(); return; }
  render();
  setTimeout(() => {
    const c = C4.ai(g);
    if (c >= 0) C4.play(g, 2, c);
    if (g.over) settle(g);
    save(); if (S.route === 'game') render();
  }, 550);
}
function rvMove(r, c){
  const g = S.game;
  if (!g || g.over || g.turn !== 1) return;
  if (!RV.play(g, 1, [r, c])) return toast('حركة غير قانونية', 'يجب أن تقلب قرصًا واحدًا على الأقل', 'err');
  if (g.over){ settle(g); save(); render(); return; }
  render();
  setTimeout(aiTurn, 600);
}
function aiTurn(){
  const g = S.game;
  if (!g || g.over || g.turn !== 2) return;
  const m = RV.ai(g);
  if (m) RV.play(g, 2, m);
  let guard = 0;
  while (!g.over && RV.legal(g, 1).length === 0 && RV.legal(g, 2).length > 0 && guard++ < 8){
    g.turn = 2;
    const m2 = RV.ai(g);
    if (!m2) break;
    RV.play(g, 2, m2);
  }
  if (!g.over && RV.legal(g, 1).length === 0 && RV.legal(g, 2).length === 0) RV.finish(g);
  if (g.over) settle(g);
  save();
  if (S.route === 'game') render();
}
function settle(g){
  const u = me();
  if (g.winner === 1){
    wallet(u, AI_PRIZE, 'جائزة الفوز'); addXp(u, 60);
    u.w[S.gameKind][0]++; u.streak++; u.best = Math.max(u.best, u.streak);
    if (u.w[S.gameKind][0] === 1) grantAch(u, 'first', 'أول فوز');
    if (u.streak >= 3) grantAch(u, 'streak', 'ثلاثية نارية');
    if (u.coins >= 25000) grantAch(u, 'rich', 'ثري فيكسورا');
    toast('فوز رائع! 🏆', '+' + AI_PRIZE + ' عملة و +60 XP', 'coin');
  } else if (g.winner === 2){
    addXp(u, 15); u.w[S.gameKind][1]++; u.streak = 0;
    toast('خسارة', 'جرّب مجددًا — +15 XP', 'err');
  } else {
    wallet(u, ENTRY, 'استرجاع تعادل');
  }
}

/* ---------- store ---------- */
function viewStore(){
  const u = me();
  const t = (id, lbl) => '<button class="' + (S.storeTab === id ? 'on' : '') + '" onclick="S.storeTab=\'' + id + '\';render()">' + lbl + '</button>';
  let body = '';
  if (S.storeTab === 'packs') body = '<div class="pack-grid">' + PACKS.map((p, i) =>
    '<div class="pack">' + coin(30) + '<div class="coins num">' + fmt(p.c) + '</div>'
    + (p.b ? '<div style="font-size:11px;color:var(--green)">+' + p.b + '% إضافية</div>' : '')
    + '<div class="price num">' + p.p + '</div>'
    + '<button class="btn gold small wfull" onclick="buyPack(' + i + ')">اشحن (تجريبي)</button></div>').join('') + '</div>';
  if (S.storeTab === 'vip') body = VIPS.map(v =>
    '<div class="card" style="margin-bottom:10px;display:flex;align-items:center;gap:12px">'
    + '<div style="font-size:24px">' + (v.id === 'plat' ? '⚡' : v.id === 'gold' ? '👑' : '⭐') + '</div>'
    + '<div style="flex:1"><b>عضوية ' + v.n + ' VIP</b><div class="sub">مكافأة يومية ×' + v.m + ' · شارة مميزة</div></div>'
    + (u.vip === v.id ? '<span class="viptag">فعّالة</span>'
      : '<button class="btn primary small" onclick="buyVip(\'' + v.id + '\')">' + coin(13) + ' <span class="num">' + fmt(v.cost) + '</span></button></div>')).join('');
  if (S.storeTab === 'sticks') body = '<div class="cos-grid">' + STICKS.map(s =>
    '<div class="cos' + (u.inv.indexOf(s.id) >= 0 ? ' owned' : '') + '"><div style="font-size:26px">🎱</div><b>' + s.n + '</b>'
    + (u.inv.indexOf(s.id) >= 0
      ? '<span style="font-size:11px;color:var(--green)">تملكها' + (u.eq.stick === s.id ? ' ✓ مجهزة' : '') + '</span>'
      : '<button class="btn ghost small" onclick="buyItem(\'' + s.id + '\',' + s.cost + ',\'stick\',\'' + s.n + '\')">' + coin(12) + ' <span class="num">' + fmt(s.cost) + '</span></button>')
    + '</div>').join('') + '</div>';
  if (S.storeTab === 'emoji') body = '<div class="cos-grid">' + EMOJIS.map(e =>
    '<div class="cos' + (e.cost === 0 || u.inv.indexOf(e.id) >= 0 ? ' owned' : '') + '"><div style="font-size:20px;letter-spacing:2px">' + e.e.slice(0, 3) + '</div><b style="font-size:12px">' + e.n + '</b>'
    + (e.cost === 0 || u.inv.indexOf(e.id) >= 0 ? '<span style="font-size:11px;color:var(--green)">تملكها</span>'
      : '<button class="btn ghost small" onclick="buyItem(\'' + e.id + '\',' + e.cost + ',\'emoji\',\'' + e.n + '\')">' + coin(12) + ' <span class="num">' + fmt(e.cost) + '</span></button>')
    + '</div>').join('') + '</div>';
  return shell(
    '<h2 class="title">متجر فيكسورا</h2><div class="sub">كل المشتريات تُسجَّل في محفظتك على جهازك</div>'
    + '<div class="tabs">' + t('packs', 'العملات') + t('vip', 'VIP') + t('sticks', 'العصي') + t('emoji', 'الإيموجي') + '</div>'
    + body
    + '<div class="warn-note">في نسخة الجوال، حزم العملات مجانية (وضع تجريبي) — في المنصة الكاملة تُدار العملات على الخادم مع دفع حقيقي.</div>',
    'المتجر');
}
function buyPack(i){
  const u = me(); const p = PACKS[i];
  wallet(u, p.c, 'حزمة ' + fmt(p.c) + ' (تجريبية)');
  save(); render();
  toast('+' + fmt(p.c) + ' عملة', 'أُضيفت لمحفظتك', 'coin');
}
function buyVip(id){
  const v = VIPS.find(x => x.id === id); const u = me();
  if (u.coins < v.cost) return toast('رصيدك لا يكفي', 'تحتاج ' + fmt(v.cost - u.coins) + ' عملة إضافية', 'err');
  wallet(u, -v.cost, 'عضوية ' + v.n + ' VIP');
  u.vip = id; save(); render();
  toast('عضوية ' + v.n + ' فعّالة ✓', 'المكافأة اليومية ×' + v.m, 'coin');
}
function buyItem(id, cost, kind, name){
  const u = me();
  if (u.coins < cost) return toast('رصيدك لا يكفي', '', 'err');
  wallet(u, -cost, 'شراء ' + name);
  u.inv.push(id);
  if (kind === 'stick') u.eq.stick = id;
  save(); render();
  toast('تم الشراء ✓', name, 'coin');
}

/* ---------- wallet ---------- */
function viewWallet(){
  const u = me();
  const canDaily = Date.now() - u.daily > 12 * 3600e3;
  const amt = 500 * vipMult(u);
  return shell(
    '<div class="card" style="border-color:rgba(255,201,69,.35);background:linear-gradient(135deg,rgba(255,201,69,.13),transparent)">'
    + '<div class="eyebrow" style="color:var(--gold)">محفظة عملات فيكسورا</div>'
    + '<div style="font-size:34px;font-weight:900;color:var(--gold);margin:8px 0">' + coin(30) + ' <span class="num">' + fmt(u.coins) + '</span></div>'
    + '<div class="sub">محفوظة على جهازك · كل حركة مسجلة بالأسفل</div>'
    + '<div style="display:flex;gap:8px;margin-top:12px">'
    + '<button class="btn ' + (canDaily ? 'primary' : 'ghost') + '" style="flex:1" ' + (canDaily ? '' : 'disabled') + ' onclick="claimDaily()">🎁 ' + (canDaily ? 'المكافأة اليومية +' + fmt(amt) : 'استلمتها اليوم') + '</button>'
    + '<button class="btn gold" onclick="navigate(\'store\')">شحن</button></div></div>'
    + '<div class="card section"><b style="font-size:13.5px">سجل المعاملات</b>'
    + (u.tx.length ? u.tx.slice(0, 25).map(t => '<div class="tx-row"><div style="flex:1"><div>' + esc(t.r) + '</div><div style="font-size:10.5px;color:var(--muted)">' + new Date(t.t).toLocaleString('ar') + '</div></div>'
        + '<b class="num ' + (t.d >= 0 ? 'plus' : 'minus') + '">' + (t.d >= 0 ? '+' : '−') + fmt(Math.abs(t.d)) + '</b></div>').join('')
      : '<div class="sub" style="padding:10px 0">لا معاملات بعد</div>')
    + '</div>', 'المحفظة');
}
function claimDaily(){
  const u = me();
  if (Date.now() - u.daily <= 12 * 3600e3) return;
  const amt = 500 * vipMult(u);
  u.daily = Date.now();
  wallet(u, amt, 'المكافأة اليومية' + (vipMult(u) > 1 ? ' ×' + vipMult(u) : ''));
  save(); render();
  toast('+' + fmt(amt) + ' عملة', 'المكافأة اليومية', 'coin');
}

/* ---------- profile ---------- */
function viewProfile(){
  const u = me();
  const tw = u.w.connect4[0] + u.w.reversi[0], tl = u.w.connect4[1] + u.w.reversi[1];
  const wr = tw + tl ? Math.round(tw / (tw + tl) * 100) : 0;
  const ACH = [['first', 'أول فوز', '🏆'], ['streak', 'ثلاثية نارية', '🔥'], ['rich', 'ثري فيكسورا', '💎']];
  return shell(
    '<div class="card" style="display:flex;gap:14px;align-items:center">'
    + '<div class="ava lg">' + esc(u.n[0].toUpperCase()) + '</div>'
    + '<div style="flex:1"><div style="display:flex;align-items:center;gap:8px"><b style="font-size:17px">' + esc(u.n) + '</b>' + (u.vip ? '<span class="viptag">' + u.vip.toUpperCase() + '</span>' : '') + '</div>'
    + '<div class="sub">المستوى ' + level(u) + ' · XP <span class="num">' + fmt(u.xp) + '</span></div>'
    + '<div class="xp-bar"><i style="width:' + (u.xp % 1000) / 10 + '%"></i></div></div>'
    + '<button class="btn ghost small" onclick="logout()">خروج</button></div>'
    + '<div class="card section"><b style="font-size:13.5px">إحصائياتي</b>'
    + '<div class="stat-row"><span>انتصارات / خسارات</span><b class="num" style="color:var(--green)">' + tw + '</b><b class="num" style="color:var(--red)">' + tl + '</b></div>'
    + '<div class="stat-row"><span>نسبة الفوز</span><b class="num">' + wr + '%</b></div>'
    + '<div class="stat-row"><span>كونكت (ف/خ)</span><b class="num">' + u.w.connect4[0] + ' / ' + u.w.connect4[1] + '</b></div>'
    + '<div class="stat-row"><span>أوثيلو (ف/خ)</span><b class="num">' + u.w.reversi[0] + ' / ' + u.w.reversi[1] + '</b></div>'
    + '<div class="stat-row"><span>أطول سلسلة</span><b class="num" style="color:var(--gold)">' + u.best + '</b></div></div>'
    + '<div class="card section"><b style="font-size:13.5px">الإنجازات</b>'
    + ACH.map(a => '<div class="ach' + (u.ach.indexOf(a[0]) >= 0 ? '' : ' locked') + '"><span style="font-size:20px">' + a[2] + '</span><span>' + a[1] + '</span></div>').join('')
    + '</div>'
    + '<div class="card section"><b style="font-size:13.5px">جردي</b>'
    + (u.inv.length ? u.inv.map(id => {
        const s = STICKS.find(x => x.id === id); const e = EMOJIS.find(x => x.id === id);
        return '<div class="ach"><span style="font-size:20px">' + (s ? '🎱' : '😀') + '</span><span>' + ((s || e).n) + (u.eq.stick === id ? ' ✓' : '') + '</span></div>';
      }).join('') : '<div class="sub" style="padding:8px 0">لا تملك عناصر بعد — تفقد المتجر</div>')
    + '</div>', 'ملفي');
}

/* ---------- render ---------- */
function render(){
  const views = { boot: viewBoot, auth: viewAuth, lobby: viewLobby, game: viewGame, store: viewStore, wallet: viewWallet, profile: viewProfile };
  $('#root').innerHTML = (views[S.route] || viewLobby)();
}
render();

/* test/debug accessors (read-only) */
window.VX = { get db(){ return db; }, get S(){ return S; }, me, C4, RV, fmt, save };
