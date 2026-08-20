#!/usr/bin/env python3
# server: global chat rooms (غرف سواليف) + null-crash source fix
import re

# ---------- 1) DB tables ----------
d = open('server/db.js', encoding='utf-8').read()
old = "CREATE INDEX IF NOT EXISTS idx_chat_room ON chat_msgs(room_id, id);"
new = """CREATE INDEX IF NOT EXISTS idx_chat_room ON chat_msgs(room_id, id);
CREATE TABLE IF NOT EXISTS gchat_rooms (
  id INTEGER PRIMARY KEY,
  name TEXT NOT NULL,
  emoji TEXT NOT NULL DEFAULT '💬',
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS gchat_msgs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_gchat ON gchat_msgs(room_id, id DESC);"""
assert old in d, 'db anchor'
open('server/db.js','w',encoding='utf-8').write(d.replace(old, new))
print('db ok')

# ---------- 2) seed 10 rooms ----------
sd = open('server/seed.js', encoding='utf-8').read()
anchor = "    console.log('[seed] admin account ready →', cfg.ADMIN_EMAIL);\n    }"
# insert rooms seeding just before the closing of the transaction function
tail = """  });
  run();
}

module.exports = { seed, CATALOG };"""
new_tail = """    /* public chat rooms (غرف السواليف) — idempotent */
    const insRoom = db.prepare('INSERT OR IGNORE INTO gchat_rooms (id,name,emoji,sort) VALUES (?,?,?,?)');
    insRoom.run(1, 'السواليف العامة', '💬', 1);
    insRoom.run(2, 'الترحيب بالأعضاء الجدد', '👋', 2);
    insRoom.run(3, 'سالفة البلياردو', '🎱', 3);
    insRoom.run(4, 'سالفة الشطرنج', '♞', 4);
    insRoom.run(5, 'سالفة الطاولة', '🎲', 5);
    insRoom.run(6, 'الألعاب والمطابقات', '🎮', 6);
    insRoom.run(7, 'البطولات والجوائز', '🏆', 7);
    insRoom.run(8, 'الاقتراحات والأفكار', '💡', 8);
    insRoom.run(9, 'الدعم والمشاكل', '🛠️', 9);
    insRoom.run(10, 'دردشة حرة', '🌍', 10);
  });
  run();
}

module.exports = { seed, CATALOG };"""
assert tail in sd, 'seed tail anchor'
open('server/seed.js','w',encoding='utf-8').write(sd.replace(tail, new_tail))
print('seed ok')

# ---------- 3) API: chat endpoints + realtime broadcast ----------
a = open('server/api.js', encoding='utf-8').read()
ep = """/* ---------- public chat rooms (غرف السواليف) ---------- */
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

/* ---------- friends ---------- */"""
anchor2 = "/* ---------- friends ---------- */"
assert anchor2 in a, 'api friends anchor'
a = a.replace(anchor2, ep, 1)
open('server/api.js','w',encoding='utf-8').write(a)
print('api ok')

# ---------- 4) static cache: no-cache for css/js so hotfixes land instantly ----------
p = open('server/app.js', encoding='utf-8').read()
old_static = "app.use(express.static(PUB, { maxAge: '1h', setHeaders: (res, p) => { if (p.endsWith('.html')) res.setHeader('Cache-Control', 'no-cache'); } }));"
new_static = "app.use(express.static(PUB, { maxAge: 0, setHeaders: (res, p) => { if (p.endsWith('.html') || p.endsWith('.css') || p.endsWith('.js')) res.setHeader('Cache-Control', 'no-cache'); } }));"
assert old_static in p, 'static anchor'
p = p.replace(old_static, new_static)
open('server/app.js','w',encoding='utf-8').write(p)
print('cache ok')
print('SERVER DONE')
