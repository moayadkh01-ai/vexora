'use strict';
/* ============================================================
   VEXORA — REST API
   Every mutation is validated server-side. Arabic error messages
   for player-facing failures; English error codes for logs.
   ============================================================ */
const express = require('express');
const crypto = require('crypto');
const { db, tx, now, q, cfg } = require('./db');
const { rateHit, clientIp, vUsername, vEmail, vPassword, vInt, cleanText, isReserved } = require('./security');
const auth = require('./auth');
const rt = require('./rt');
const mm = require('./matchmaker');
const pay = require('./payments');
const games = require('./games');

const router = express.Router();
const api = express.Router();
/* NOTE: webhook is registered on `api` BEFORE the auth middleware (public by design) */
router.use('/api', api);

/* ---------- Stripe webhook (public, signature-verified, idempotent) ---------- */
api.post('/pay/webhook/stripe', (req, res) => {
  if (!cfg.PAYMENTS_STRIPE_READY) return fail(res, 501, 'CONFIG_REQUIRED', 'Stripe غير مُعد على هذا الخادم');
  const raw = req.rawBody;
  if (!raw || !Buffer.isBuffer(raw)) return fail(res, 400, 'NO_RAW', 'تعذر التحقق من التوقيع');
  if (!pay.stripeVerifySignature(raw, req.headers['stripe-signature'])) return fail(res, 400, 'BAD_SIGNATURE', 'توقيع غير صالح');
  const ev = req.body;
  if (ev && ev.type === 'checkout.session.completed'){
    const orderId = ev.data && ev.data.object && ev.data.object.metadata && ev.data.object.metadata.order_id;
    if (orderId){ const r = pay.settleOrder(orderId, ev.data.object.id); if (!r.ok && r.status) return fail(res, r.status, r.err); }
  }
  return res.json({ received: true });
});

/* ---------- tiny helpers ---------- */
function parseCookies(req){
  const out = {};
  const raw = req.headers.cookie;
  if (!raw) return out;
  for (const part of raw.split(';')){
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
const J = (res, code, obj) => res.status(code).json(obj);
const ok = (res, obj) => J(res, 200, Object.assign({ ok: true }, obj || {}));
const fail = (res, code, err, msg) => J(res, code, { ok: false, error: err, msg: msg || '' });

function userPublic(u, viewerId){
  const online = rt.isOnline(u);
  return {
    id: u.id, username: u.username, level: Math.floor(u.xp / 1000) + 1, xp: u.xp,
    rating: u.rating, wins: u.wins, losses: u.losses, vip: u.vip, hue: u.hue, online,
    role: u.role, created_at: u.created_at, last_seen: viewerId === u.id ? u.last_seen : undefined,
    streak: u.streak, best_streak: u.best_streak, achievements: JSON.parse(u.achievements || '[]'),
    equipped: JSON.parse(u.equipped || '{}'),
    friends: viewerId === u.id ? undefined : undefined
  };
}

/* ---------- global api middleware ---------- */
api.use((req, res, next) => {
  req.cookies = parseCookies(req);
  if (!rateHit('g:' + clientIp(req), cfg.RL_GLOBAL, 60000)) return fail(res, 429, 'RATE', 'طلبات كثيرة جدًا — انتظر قليلًا');
  res.setHeader('Cache-Control', 'no-store');
  next();
});

/* ================= PUBLIC ================= */

api.get('/config', (req, res) => ok(res, {
  brand: { name: 'VEXORA', name_ar: 'فيكسورا', tagline: 'العب بلا حدود' },
  payments: { stripe: cfg.PAYMENTS_STRIPE_READY, simulate: cfg.PAYMENTS_SIMULATE },
  economy: { entry: cfg.C4_ENTRY, pot: cfg.C4_POT, aiWin: cfg.C4_AI_WIN, daily: cfg.DAILY_VC },
  games: Object.values(games.GAMES).map(g => ({ id: g.id, name_ar: g.name_ar, name_en: g.name_en, playable: !g.soon }))
}));

api.get('/healthz', (req, res) => ok(res, { t: now() }));

api.get('/leaderboard', (req, res) => {
  const rows = db.prepare(`SELECT id,username,rating,wins,losses,xp,vip,hue FROM users WHERE role = 'player' AND banned = 0 ORDER BY rating DESC, xp DESC LIMIT 10`).all();
  ok(res, { top: rows.map((r, i) => ({ rank: i + 1, id: r.id, username: r.username, rating: r.rating, wins: r.wins, losses: r.losses, level: Math.floor(r.xp / 1000) + 1, vip: r.vip, hue: r.hue })) });
});

/* ---------- auth ---------- */
api.post('/auth/register', (req, res) => {
  if (!rateHit('reg:' + clientIp(req), 8, 60000)) return fail(res, 429, 'RATE', 'محاولات كثيرة — انتظر دقيقة');
  const b = req.body || {};
  const username = cleanText(b.username, 20);
  const email = cleanText(b.email, 254).toLowerCase();
  const password = typeof b.password === 'string' ? b.password : '';
  if (!vUsername(username)) return fail(res, 400, 'BAD_USERNAME', 'اسم المستخدم: ٣–٢٠ حرفًا/رقمًا إنجليزيًا أو عربيًا مع _');
  if (isReserved(username)) return fail(res, 400, 'RESERVED', 'هذا الاسم محجوز — اختر غيره');
  if (!vEmail(email)) return fail(res, 400, 'BAD_EMAIL', 'أدخل بريدًا إلكترونيًا صحيحًا');
  if (!vPassword(password)) return fail(res, 400, 'WEAK_PASSWORD', 'كلمة المرور: ٨ أحرف على الأقل');
  if (q.userByName.get(username)) return fail(res, 409, 'USERNAME_TAKEN', 'اسم المستخدم محجوز بالفعل');
  if (q.userByEmail.get(email)) return fail(res, 409, 'EMAIL_TAKEN', 'البريد الإلكتروني مسجل مسبقًا');
  const t = now();
  let id;
  try {
    tx(() => {
      id = q.insertUser.run({
        username, email, pass: auth.hashPassword(password), role: 'player',
        coins: 0, now: t, hue: Math.floor(Math.random() * 360)
      }).lastInsertRowid;
      auth.walletMove(Number(id), cfg.WELCOME_VC, 'مكافأة الترحيب — أهلاً في فيكسورا', 'welcome', tx);
    })();
  } catch(e){
    if (String(e.message).indexOf('UNIQUE') >= 0) return fail(res, 409, 'TAKEN', 'الاسم أو البريد محجوز');
    throw e;
  }
  const token = auth.issueToken(id, clientIp(req));
  const user = q.userById.get(id);
  auth.notify(id, 'welcome', 'أهلاً بك في فيكسورا 🎮', 'أُضيفت ' + cfg.WELCOME_VC + ' عملة فيكسورا إلى محفظتك. استكشف اللوبي وابدأ اللعب!');
  auth.setAuthCookie(res, token);
  return ok(res, { token, user: userPublic(user, id) });
});

api.post('/auth/login', (req, res) => {
  if (!rateHit('login:' + clientIp(req), cfg.RL_AUTH, 60000)) return fail(res, 429, 'RATE', 'محاولات دخول كثيرة — انتظر دقيقة');
  const b = req.body || {};
  const idv = cleanText(b.id, 254);
  const password = typeof b.password === 'string' ? b.password : '';
  if (!idv || !password) return fail(res, 400, 'MISSING', 'أدخل المعرّف وكلمة المرور');
  const user = q.userByEmail.get(idv.toLowerCase()) || q.userByName.get(idv);
  const fine = user && auth.verifyPassword(password, user.pass);
  if (!fine) return fail(res, 401, 'BAD_CREDS', 'بيانات الدخول غير صحيحة');
  if (user.banned) return fail(res, 403, 'BANNED', 'هذا الحساب موقوف. تواصل مع دعم فيكسورا.');
  const token = auth.issueToken(user.id, clientIp(req));
  auth.setAuthCookie(res, token);
  q.touch.run(now(), user.id);
  return ok(res, { token, user: userPublic(user, user.id) });
});

api.post('/auth/logout', auth.authMiddleware, (req, res) => {
  auth.revokeToken(req.token);
  auth.clearAuthCookie(res);
  return ok(res);
});

/* ================= AUTHENTICATED ================= */
api.use(auth.authMiddleware);

/* ---------- me / profile ---------- */
api.get('/me', (req, res) => {
  const u = req.user;
  const inv = q.invByUser.all(u.id).map(r => ({ item_id: r.item_id, kind: r.kind, name_ar: r.name_ar, at: r.created_at }));
  ok(res, {
    user: userPublic(u, u.id),
    coins: u.coins,
    vip_until: u.vip_until,
    inventory: inv,
    notifications: q.notifByUser.all(u.id).map(n => ({ id: n.id, type: n.type, title: n.title, body: n.body, read: !!n.read, at: n.created_at })),
    unread: db.prepare('SELECT COUNT(*) c FROM notifications WHERE user_id = ? AND read = 0').get(u.id).c,
    queue: mm.openRoomsStmt.qGet.get(u.id) ? { game: mm.openRoomsStmt.qGet.get(u.id).game } : null,
    activeRoom: (() => { const r = mm.activeRoomOf(u.id); return r ? mm.safeState(r, u.id) : null; })()
  });
});

api.patch('/me', (req, res) => {
  const b = req.body || {};
  if (b.hue !== undefined){
    if (!vInt(Number(b.hue), 0, 359)) return fail(res, 400, 'BAD_HUE');
    db.prepare('UPDATE users SET hue = ? WHERE id = ?').run(Number(b.hue), req.user.id);
  }
  return ok(res, { user: userPublic(q.userById.get(req.user.id), req.user.id) });
});

api.get('/users/:username', (req, res) => {
  const u = q.userByName.get(cleanText(req.params.username, 20));
  if (!u || u.banned) return fail(res, 404, 'NO_USER', 'لا يوجد لاعب بهذا الاسم');
  return ok(res, { profile: userPublic(u, req.user.id) });
});

/* ---------- notifications ---------- */
api.post('/notifs/read', (req, res) => {
  const b = req.body || {};
  if (b.all) q.notifReadAll.run(req.user.id);
  else if (Number.isInteger(b.id)) q.notifReadOne.run(b.id, req.user.id);
  return ok(res);
});

/* ---------- wallet ---------- */
api.get('/wallet', (req, res) => {
  const txs = db.prepare('SELECT * FROM wallet_tx WHERE user_id = ? ORDER BY id DESC LIMIT 60').all(req.user.id);
  ok(res, { coins: req.user.coins, daily_base: cfg.DAILY_VC, can_daily: now() - req.user.last_daily > cfg.DAILY_COOLDOWN_H * 3600e3, vip_mult: vipMult(req.user), vip: req.user.vip, vip_until: req.user.vip_until, tx: txs });
});

api.post('/wallet/daily', (req, res) => {
  if (now() - req.user.last_daily <= cfg.DAILY_COOLDOWN_H * 3600e3) return fail(res, 429, 'COOLDOWN', 'استلمت مكافأتك — عد لاحقًا');
  const amt = cfg.DAILY_VC * vipMult(req.user);
  tx(() => auth.walletMove(req.user.id, amt, 'المكافأة اليومية', 'daily', tx))();
  db.prepare('UPDATE users SET last_daily = ? WHERE id = ?').run(now(), req.user.id);
  rt.emit(req.user.id, 'wallet:update', { coins: q.userById.get(req.user.id).coins, reason: 'daily' });
  return ok(res, { amount: amt, coins: q.userById.get(req.user.id).coins });
});
function vipMult(u){ return u.vip === 'plat' ? 5 : u.vip === 'gold' ? 3 : u.vip === 'silver' ? 2 : 1; }

/* ---------- store / inventory ---------- */
api.get('/store/catalog', (req, res) => ok(res, { items: q.itemsAll.all() }));

api.post('/store/buy', (req, res) => {
  const b = req.body || {};
  if (typeof b.item_id !== 'string') return fail(res, 400, 'MISSING_ITEM');
  const r = pay.buyWithCoins(req.user, b.item_id);
  if (r.ok) return ok(res, r);
  return fail(res, r.status || 400, r.err, r.msg);
});

api.post('/store/equip', (req, res) => {
  const b = req.body || {};
  if (typeof b.item_id !== 'string') return fail(res, 400, 'MISSING_ITEM');
  const r = pay.equip(req.user, b.item_id);
  if (r.ok) return ok(res, r);
  return fail(res, r.status || 400, r.err, r.msg);
});

/* ---------- payments ---------- */
api.post('/pay/create-order', async (req, res) => {
  const b = req.body || {};
  if (typeof b.item_id !== 'string' || typeof b.provider !== 'string') return fail(res, 400, 'MISSING');
  const r = await pay.createOrder(req.user, b.item_id, b.provider);
  if (r.ok) return ok(res, { order: r.order, checkout: r.checkout });
  return fail(res, r.status || 400, r.err, r.msg);
});

api.post('/pay/simulate/:orderId', (req, res) => {
  const r = pay.simulateSettle(req.user, req.params.orderId);
  if (r.ok) return ok(res, r);
  return fail(res, r.status || 400, r.err, r.msg);
});

api.get('/pay/orders', (req, res) => ok(res, { orders: q.ordersBy.all(req.user.id) }));

/* ---------- public chat rooms (غرف السواليف) ---------- */
api.get('/chat/rooms', (req, res) => {
  const rooms = db.prepare('SELECT * FROM gchat_rooms ORDER BY sort').all();
  const last = db.prepare('SELECT m.* FROM gchat_msgs m JOIN (SELECT room_id, MAX(id) mid FROM gchat_msgs GROUP BY room_id) x ON x.mid = m.id').all();
  const counts = {};
  db.prepare('SELECT room_id, COUNT(*) c FROM gchat_msgs GROUP BY room_id').all().forEach(r => { counts[r.room_id] = r.c; });
  const lastBy = {};
  last.forEach(m => { lastBy[m.room_id] = { text: m.text, name: m.name, at: m.created_at }; });
  ok(res, { rooms: rooms.map(r => ({ id: r.id, name: r.name, emoji: r.emoji, msgs: counts[r.id] || 0, last: lastBy[r.id] || null })) });
});

api.get('/chat/rooms/:id/messages', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM gchat_rooms WHERE id = ?').get(id)) return fail(res, 404, 'NO_ROOM');
  const rows = db.prepare('SELECT id, name, text, created_at FROM gchat_msgs WHERE room_id = ? ORDER BY id DESC LIMIT 60').all(id).reverse();
  ok(res, { messages: rows });
});

api.post('/chat/rooms/:id/messages', (req, res) => {
  const id = Number(req.params.id);
  if (!db.prepare('SELECT 1 FROM gchat_rooms WHERE id = ?').get(id)) return fail(res, 404, 'NO_ROOM');
  if (!rateHit('gchat:' + req.user.id, 8, 15000)) return fail(res, 429, 'RATE', 'تمهّل شوي — رسائل كثيرة');
  const text = cleanText((req.body || {}).text, 400);
  if (!text) return fail(res, 400, 'EMPTY', 'اكتب رسالة');
  const r = db.prepare('INSERT INTO gchat_msgs (room_id,user_id,name,text,created_at) VALUES (?,?,?,?,?)')
    .run(id, req.user.id, req.user.username, text, now());
  const msg = { id: Number(r.lastInsertRowid), room_id: id, name: req.user.username, text, created_at: now() };
  rt.onlineUserIds().forEach(uid => rt.deliverOnly(uid, { seq: 0, type: 'gchat', data: { msg }, at: now() }));
  return ok(res, { msg });
});

/* ---------- friends ---------- */
api.get('/friends', (req, res) => {
  const rows = db.prepare(`SELECT f.*, ua.username AS a_name, ub.username AS b_name
    FROM friendships f JOIN users ua ON ua.id = f.a_id JOIN users ub ON ub.id = f.b_id
    WHERE f.a_id = ? OR f.b_id = ?`).all(req.user.id, req.user.id);
  const friends = [], incoming = [], outgoing = [];
  for (const r of rows){
    if (r.status === 'accepted'){
      const oid = r.a_id === req.user.id ? r.b_id : r.a_id;
      const ou = q.userById.get(oid);
      friends.push({ id: r.id, user: { id: ou.id, username: ou.username, rating: ou.rating, online: rt.isOnline(ou), hue: ou.hue, level: Math.floor(ou.xp/1000)+1, vip: ou.vip } });
    } else if (r.b_id === req.user.id) incoming.push({ id: r.id, from: { id: r.a_id, username: r.a_name } });
    else outgoing.push({ id: r.id, to: { id: r.b_id, username: r.b_name } });
  }
  ok(res, { friends, incoming, outgoing });
});

api.post('/friends/request', (req, res) => {
  const b = req.body || {};
  const targetName = cleanText(b.username, 20);
  if (!targetName) return fail(res, 400, 'MISSING', 'أدخل اسم اللاعب');
  const target = q.userByName.get(targetName);
  if (!target || target.banned) return fail(res, 404, 'NO_USER', 'لا يوجد لاعب بهذا الاسم');
  if (target.id === req.user.id) return fail(res, 400, 'SELF', 'لا يمكنك إضافة نفسك');
  const exists = db.prepare(`SELECT * FROM friendships WHERE (a_id = ? AND b_id = ?) OR (a_id = ? AND b_id = ?)`).get(req.user.id, target.id, target.id, req.user.id);
  if (exists) return fail(res, 409, 'EXISTS', exists.status === 'accepted' ? 'أنتما صديقان بالفعل' : 'يوجد طلب معلّق بالفعل');
  const id = db.prepare('INSERT INTO friendships (a_id,b_id,status,created_at) VALUES (?,?,?,?)').run(req.user.id, target.id, 'pending', now()).lastInsertRowid;
  rt.emit(target.id, 'friend:req', { id: Number(id), from: { id: req.user.id, username: req.user.username } });
  auth.notify(target.id, 'friend', 'طلب صداقة جديد', req.user.username + ' يريد إضافتك صديقًا.');
  return ok(res);
});

api.post('/friends/respond', (req, res) => {
  const b = req.body || {};
  if (!vInt(Number(b.id), 1, 1e9)) return fail(res, 400, 'BAD_ID');
  const fr = db.prepare('SELECT * FROM friendships WHERE id = ? AND b_id = ? AND status = ?').get(b.id, req.user.id, 'pending');
  if (!fr) return fail(res, 404, 'NO_REQ', 'لا يوجد طلب بهذا المعرف');
  if (b.accept){
    db.prepare(`UPDATE friendships SET status = 'accepted' WHERE id = ?`).run(fr.id);
    rt.emit(fr.a_id, 'friend:accepted', { by: req.user.username });
    auth.notify(fr.a_id, 'friend', 'تم قبول طلبك', req.user.username + ' أصبح صديقك الآن.');
  } else {
    db.prepare('DELETE FROM friendships WHERE id = ?').run(fr.id);
  }
  return ok(res);
});

api.post('/friends/:id/challenge', (req, res) => {
  const id = Number(req.params.id);
  if (!vInt(id, 1, 1e9)) return fail(res, 400, 'BAD_ID');
  const fr = db.prepare(`SELECT * FROM friendships WHERE id = ? AND status = 'accepted' AND (a_id = ? OR b_id = ?)`).get(id, req.user.id, req.user.id);
  if (!fr) return fail(res, 404, 'NO_FRIEND', 'لا توجد صداقة بهذا المعرف');
  const friendId = fr.a_id === req.user.id ? fr.b_id : fr.a_id;
  const friend = q.userById.get(friendId);
  if (!friend || friend.banned) return fail(res, 404, 'NO_FRIEND', 'الصديق غير متاح');
  const game = ['connect4', 'reversi'].indexOf(String((req.body || {}).game)) >= 0 ? String(req.body.game) : 'connect4';
  const r = mm.createRoom(req.user, game, 'private');
  if (!r.ok) return fail(res, statusOf(r), r.err, r.msg);
  rt.emit(friendId, 'friend:challenge', { roomId: r.room.id, code: r.room.code, game, from: { id: req.user.id, username: req.user.username } });
  auth.notify(friendId, 'friend', 'تحدٍّ جديد من ' + req.user.username, 'انضم للغرفة برمز ' + r.room.code);
  return ok(res, r);
});

api.delete('/friends/:id', (req, res) => {
  const id = Number(req.params.id);
  if (!vInt(id, 1, 1e9)) return fail(res, 400, 'BAD_ID');
  const fr = db.prepare('SELECT * FROM friendships WHERE id = ? AND (a_id = ? OR b_id = ?)').get(id, req.user.id, req.user.id);
  if (!fr) return fail(res, 404, 'NO_FRIEND');
  db.prepare('DELETE FROM friendships WHERE id = ?').run(id);
  return ok(res);
});

/* ---------- rooms ---------- */
api.get('/rooms', (req, res) => {
  const rooms = mm.openRoomsStmt.openRooms.all(now() - 120e3)
    .filter(r => r.host_id !== req.user.id)
    .map(r => mm.publicRoom(r, req.user.id));
  ok(res, { rooms });
});

api.post('/rooms', (req, res) => {
  const b = req.body || {};
  const r = mm.createRoom(req.user, String(b.game || ''), b.privacy === 'private' ? 'private' : 'public');
  if (r.ok) return ok(res, r);
  return fail(res, statusOf(r), r.err, r.msg);
});

api.post('/rooms/join-code', (req, res) => {
  const b = req.body || {};
  const code = cleanText(b.code, 10).toUpperCase();
  if (!code) return fail(res, 400, 'MISSING', 'أدخل رمز الغرفة');
  const r = mm.joinByCode(req.user, code);
  if (r.ok) return ok(res, r);
  return fail(res, statusOf(r), r.err, r.msg);
});

api.post('/rooms/:id/join', (req, res) => {
  const r = mm.joinRoom(req.user, Number(req.params.id));
  if (r.ok) return ok(res, r);
  return fail(res, statusOf(r), r.err, r.msg);
});

api.post('/rooms/leave-active', (req, res) => {
  const r = mm.leaveActive(req.user);
  if (r.ok) return ok(res, r);
  return fail(res, statusOf(r), r.err, r.msg);
});

api.post('/rooms/:id/leave', (req, res) => {
  const r = mm.leaveRoom(req.user, Number(req.params.id));
  if (r.ok) return ok(res, r);
  return fail(res, statusOf(r), r.err, r.msg);
});

api.get('/rooms/:id', (req, res) => {
  const room = db.prepare('SELECT * FROM rooms WHERE id = ?').get(Number(req.params.id));
  if (!room) return fail(res, 404, 'NOT_FOUND');
  const slot = (room.host_id === req.user.id) ? 1 : (room.guest_id === req.user.id ? 2 : 0);
  if (room.privacy === 'private' && !slot) return fail(res, 403, 'PRIVATE');
  ok(res, { room: mm.safeState(room, req.user.id), chat: slot ? mm.chatHistory(room.id) : [] });
});

api.post('/rooms/:id/move', (req, res) => {
  const r = mm.move(req.user, Number(req.params.id), req.body || {});   /* per-game validation in the engine */
  if (r.ok) return ok(res, r);
  return fail(res, statusOf(r), r.err, r.msg);
});

api.post('/rooms/:id/chat', (req, res) => {
  const b = req.body || {};
  const r = mm.chat(req.user, Number(req.params.id), String(b.text || ''));
  if (r.ok) return ok(res, r);
  return fail(res, statusOf(r), r.err, r.msg);
});

/* ---------- matchmaking ---------- */
api.post('/mm/queue', (req, res) => {
  const r = mm.enqueue(req.user, String((req.body || {}).game || ''));
  if (r.ok) return ok(res, r);
  return fail(res, statusOf(r), r.err, r.msg);
});
api.post('/mm/cancel', (req, res) => ok(res, mm.cancel(req.user)));
api.post('/mm/practice', (req, res) => {
  const r = mm.practice(req.user, String((req.body || {}).game || ''));
  if (r.ok) return ok(res, r);
  return fail(res, statusOf(r), r.err, r.msg);
});

/* ---------- realtime long-poll (WS fallback) ---------- */
api.get('/rt/poll', (req, res) => {
  const cur = Math.max(0, parseInt(req.query.cur || '0', 10) || 0);
  const timeoutMs = Math.min(30, Math.max(1, parseInt(req.query.timeout || String(cfg.RT_POLL_TIMEOUT_S), 10))) * 1000;
  res.setHeader('Content-Type', 'application/json');
  rt.pollEvents(req.user.id, cur, timeoutMs, evs => {
    const maxSeq = db.prepare('SELECT MAX(seq) m FROM events WHERE user_id = ?').get(req.user.id).m || 0;
    res.end(JSON.stringify({ ok: true, events: evs, cursor: maxSeq }));
  });
});

/* ================= ADMIN ================= */
api.get('/admin/overview', auth.requireAdmin, (req, res) => {
  const t = now();
  const day = 86400e3;
  const online = rt.onlineUserIds().length;
  const totalUsers = db.prepare('SELECT COUNT(*) c FROM users').get().c;
  const matches = db.prepare('SELECT COUNT(*) c FROM matches').get().c;
  const matches24 = db.prepare('SELECT COUNT(*) c FROM matches WHERE created_at > ?').get(t - day).c;
  const revenue = db.prepare(`SELECT COALESCE(SUM(amount_cents),0) s FROM orders WHERE status = 'paid'`).get().s;
  const pending = db.prepare(`SELECT COUNT(*) c FROM orders WHERE status = 'pending'`).get().c;
  const queued = db.prepare('SELECT COUNT(*) c FROM mm_queue').get().c;
  const activeRooms = db.prepare(`SELECT COUNT(*) c FROM rooms WHERE status = 'playing'`).get().c;
  const dau = [];
  for (let i = 13; i >= 0; i--){
    const from = t - i * day;
    dau.push({ day: new Date(from).toISOString().slice(5, 10), count: db.prepare('SELECT COUNT(*) c FROM users WHERE last_seen > ? AND last_seen <= ?').get(from - day, from).c });
  }
  const byGame = db.prepare(`SELECT game, COUNT(*) c FROM matches GROUP BY game ORDER BY c DESC LIMIT 6`).all();
  const recent = db.prepare(`SELECT id,username,email,role,banned,created_at,last_seen,coins FROM users ORDER BY id DESC LIMIT 8`).all();
  const recentTx = db.prepare(`SELECT w.*, u.username FROM wallet_tx w JOIN users u ON u.id = w.user_id ORDER BY w.id DESC LIMIT 10`).all();
  ok(res, { online, totalUsers, matches, matches24, revenue, pending, queued, activeRooms, dau, byGame, recent, recentTx });
});

api.get('/admin/users', auth.requireAdmin, (req, res) => {
  const term = cleanText(req.query.q || '', 20);
  let rows;
  if (term){
    rows = db.prepare(`SELECT id,username,email,role,vip,coins,xp,rating,wins,losses,banned,created_at,last_seen
                       FROM users WHERE username LIKE ? OR email LIKE ? ORDER BY id DESC LIMIT 60`).all('%' + term + '%', '%' + term + '%');
  } else {
    rows = db.prepare(`SELECT id,username,email,role,vip,coins,xp,rating,wins,losses,banned,created_at,last_seen
                       FROM users ORDER BY id DESC LIMIT 60`).all();
  }
  ok(res, { users: rows.map(u => Object.assign(u, { online: rt.isOnline(u) })) });
});

api.post('/admin/users/:id/ban', auth.requireAdmin, (req, res) => {
  const id = Number(req.params.id);
  const target = q.userById.get(id);
  if (!target) return fail(res, 404, 'NO_USER');
  if (target.role === 'admin') return fail(res, 400, 'IS_ADMIN', 'لا يمكن حظر مشرف');
  const on = !!(req.body || {}).on;
  db.prepare('UPDATE users SET banned = ? WHERE id = ?').run(on ? 1 : 0, id);
  if (on){
    auth.revokeUserSessions(id);
    mm.openRoomsStmt.qDel.run(id);
    rt.deliverOnly(id, { type: 'force:logout', data: { reason: 'banned' }, seq: 0, at: now() });
    auth.notify(id, 'mod', 'تم إيقاف حسابك', 'لاستئناف الحساب تواصل مع دعم فيكسورا.');
  }
  return ok(res, { banned: on });
});

api.post('/admin/users/:id/grant', auth.requireAdmin, (req, res) => {
  const b = req.body || {};
  const amount = Number(b.coins);
  if (!vInt(amount, -1000000, 1000000) || amount === 0) return fail(res, 400, 'BAD_AMOUNT');
  const target = q.userById.get(Number(req.params.id));
  if (!target) return fail(res, 404, 'NO_USER');
  try { auth.walletMove(target.id, amount, 'تعديل إداري' + (b.reason ? ' — ' + cleanText(b.reason, 60) : ''), 'admin:' + req.user.id); }
  catch(e){ return fail(res, 402, 'INSUFFICIENT_FUNDS', 'سيؤدي ذلك إلى رصيد سالب'); }
  auth.notify(target.id, amount > 0 ? 'grant' : 'adjust', 'حركة رصيد من الإدارة', (amount > 0 ? '+' : '') + amount + ' عملة فيكسورا');
  rt.emit(target.id, 'wallet:update', { coins: q.userById.get(target.id).coins, reason: 'admin' });
  return ok(res, { coins: q.userById.get(target.id).coins });
});

api.get('/admin/orders', auth.requireAdmin, (req, res) => {
  const rows = db.prepare(`SELECT o.*, u.username, i.name_ar, i.name_en FROM orders o JOIN users u ON u.id = o.user_id JOIN items i ON i.id = o.item_id ORDER BY o.created_at DESC LIMIT 100`).all();
  ok(res, { orders: rows });
});

api.post('/admin/orders/:id/approve', auth.requireAdmin, (req, res) => {
  const r = pay.settleOrder(String(req.params.id), 'admin:' + req.user.username);
  if (r.ok) return ok(res, r);
  return fail(res, r.status || 400, r.err);
});

/* one-tap SQLite backup: checkpoints WAL and streams the .db file (admin only) */
api.get('/admin/db-backup', auth.requireAdmin, (req, res) => {
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
    const fs = require('fs');
    if (!fs.existsSync(cfg.DB_PATH)) return fail(res, 404, 'NO_DB', 'قاعدة البيانات غير موجودة');
    const buf = fs.readFileSync(cfg.DB_PATH);
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', 'attachment; filename="vexora-backup-' + new Date().toISOString().slice(0, 10) + '.db"');
    return res.end(buf);
  } catch(e){ return fail(res, 500, 'BACKUP_ERR', e.message); }
});

api.get('/admin/tx', auth.requireAdmin, (req, res) => {
  ok(res, { tx: db.prepare(`SELECT w.*, u.username FROM wallet_tx w JOIN users u ON u.id = w.user_id ORDER BY w.id DESC LIMIT 100`).all() });
});

const statusOf = r => ({ INSUFFICIENT_FUNDS: 402, NOT_FOUND: 404, UNKNOWN_GAME: 400, NOT_AVAILABLE: 400, ALREADY_QUEUED: 409, ALREADY_IN_ROOM: 409, ROOM_FULL: 409, NOT_PARTICIPANT: 403, NOT_PLAYING: 409, PRIVATE: 403 }[r.err] || 400);

module.exports = router;
