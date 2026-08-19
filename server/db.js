'use strict';
/* ============================================================
   VEXORA — Database layer (SQLite, server-authoritative)
   All money (VEXORA Coins) lives here, never on the client.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const cfg = require('./config');

fs.mkdirSync(path.dirname(cfg.DB_PATH), { recursive: true });
const db = new Database(cfg.DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE COLLATE NOCASE,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  pass TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'player',
  vip TEXT,
  vip_until INTEGER NOT NULL DEFAULT 0,
  coins INTEGER NOT NULL DEFAULT 0,
  xp INTEGER NOT NULL DEFAULT 0,
  rating INTEGER NOT NULL DEFAULT 1000,
  wins INTEGER NOT NULL DEFAULT 0,
  losses INTEGER NOT NULL DEFAULT 0,
  banned INTEGER NOT NULL DEFAULT 0,
  streak INTEGER NOT NULL DEFAULT 0,
  best_streak INTEGER NOT NULL DEFAULT 0,
  last_daily INTEGER NOT NULL DEFAULT 0,
  hue INTEGER NOT NULL DEFAULT 220,
  achievements TEXT NOT NULL DEFAULT '[]',
  equipped TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL,
  last_seen INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ip TEXT,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS wallet_tx (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  delta INTEGER NOT NULL,
  reason TEXT NOT NULL,
  ref TEXT,
  balance_after INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS items (
  id TEXT PRIMARY KEY,
  kind TEXT NOT NULL,             -- pack | vip | stick | emoji | theme | frame
  name_ar TEXT NOT NULL,
  name_en TEXT NOT NULL,
  desc_ar TEXT NOT NULL DEFAULT '',
  price_vc INTEGER NOT NULL DEFAULT 0,   -- buy with VEXORA Coins
  price_usd_cents INTEGER NOT NULL DEFAULT 0, -- buy with cash
  coins INTEGER NOT NULL DEFAULT 0,      -- coins granted (packs)
  bonus_pct INTEGER NOT NULL DEFAULT 0,
  vip_tier TEXT,
  vip_days INTEGER NOT NULL DEFAULT 0,
  meta TEXT NOT NULL DEFAULT '{}',
  premium INTEGER NOT NULL DEFAULT 1,
  active INTEGER NOT NULL DEFAULT 1,
  sort INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS inventory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL REFERENCES items(id),
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, item_id)
);
CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL DEFAULT 'pending',  -- pending|paid|failed|refunded
  provider TEXT NOT NULL,
  provider_ref TEXT,
  created_at INTEGER NOT NULL,
  paid_at INTEGER
);
CREATE TABLE IF NOT EXISTS friendships (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  a_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  b_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending',  -- pending|accepted
  created_at INTEGER NOT NULL,
  UNIQUE(a_id, b_id)
);
CREATE TABLE IF NOT EXISTS rooms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  game TEXT NOT NULL,
  host_id INTEGER NOT NULL REFERENCES users(id),
  guest_id INTEGER REFERENCES users(id),
  status TEXT NOT NULL DEFAULT 'open',     -- open|playing|closed
  vs_ai INTEGER NOT NULL DEFAULT 0,
  privacy TEXT NOT NULL DEFAULT 'public',  -- public|private
  state TEXT,
  turn INTEGER NOT NULL DEFAULT 1,
  winner_id INTEGER,
  move_count INTEGER NOT NULL DEFAULT 0,
  entry INTEGER NOT NULL DEFAULT 0,
  pot INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  last_activity INTEGER NOT NULL,
  closed_at INTEGER
);
CREATE TABLE IF NOT EXISTS chat_msgs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS mm_queue (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  game TEXT NOT NULL,
  rating INTEGER NOT NULL,
  enqueued_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL DEFAULT '',
  read INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS events (            -- realtime event log (WS + long-poll share it)
  seq INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL,
  data TEXT NOT NULL DEFAULT '{}',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS matches (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  room_id INTEGER NOT NULL,
  game TEXT NOT NULL,
  p1 INTEGER NOT NULL,
  p2 INTEGER,
  winner_id INTEGER,
  rating_delta INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tx_user ON wallet_tx(user_id, id DESC);
CREATE INDEX IF NOT EXISTS idx_events_user ON events(user_id, seq);
CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(user_id, read);
CREATE INDEX IF NOT EXISTS idx_rooms_status ON rooms(status, game);
CREATE INDEX IF NOT EXISTS idx_chat_room ON chat_msgs(room_id, id);
`);

const tx = db.transaction.bind(db);
const now = () => Date.now();

/* ---------- prepared statement helpers ---------- */
const q = {
  userById: db.prepare('SELECT * FROM users WHERE id = ?'),
  userByName: db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE'),
  userByEmail: db.prepare('SELECT * FROM users WHERE email = ? COLLATE NOCASE'),
  insertUser: db.prepare(`INSERT INTO users (username,email,pass,role,coins,created_at,last_seen,hue)
                          VALUES (@username,@email,@pass,@role,@coins,@now,@now,@hue)`),
  sessionIns: db.prepare('INSERT INTO sessions (token,user_id,ip,created_at,expires_at) VALUES (?,?,?,?,?)'),
  sessionGet: db.prepare('SELECT * FROM sessions WHERE token = ? AND expires_at > ?'),
  sessionDel: db.prepare('DELETE FROM sessions WHERE token = ?'),
  sessionDelUser: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
  touch: db.prepare('UPDATE users SET last_seen = ? WHERE id = ?'),
  addCoins: db.prepare('UPDATE users SET coins = coins + ? WHERE id = ?'),
  setCoins: db.prepare('UPDATE users SET coins = ? WHERE id = ?'),
  txIns: db.prepare('INSERT INTO wallet_tx (user_id,delta,reason,ref,balance_after,created_at) VALUES (?,?,?,?,?,?)'),
  itemById: db.prepare('SELECT * FROM items WHERE id = ?'),
  itemsAll: db.prepare('SELECT * FROM items WHERE active = 1 ORDER BY sort, id'),
  invIns: db.prepare('INSERT OR IGNORE INTO inventory (user_id,item_id,created_at) VALUES (?,?,?)'),
  invByUser: db.prepare('SELECT inventory.*, items.kind, items.name_ar, items.meta FROM inventory JOIN items ON items.id = inventory.item_id WHERE inventory.user_id = ?'),
  invHas: db.prepare('SELECT 1 FROM inventory WHERE user_id = ? AND item_id = ?'),
  orderIns: db.prepare('INSERT INTO orders (id,user_id,item_id,amount_cents,status,provider,provider_ref,created_at) VALUES (?,?,?,?,?,?,?,?)'),
  orderGet: db.prepare('SELECT * FROM orders WHERE id = ?'),
  orderSetPaid: db.prepare('UPDATE orders SET status = ?, paid_at = ?, provider_ref = COALESCE(?, provider_ref) WHERE id = ?'),
  ordersBy: db.prepare('SELECT orders.*, items.name_ar FROM orders JOIN items ON items.id = orders.item_id WHERE orders.user_id = ? ORDER BY orders.created_at DESC LIMIT 50'),
  notifIns: db.prepare('INSERT INTO notifications (user_id,type,title,body,created_at) VALUES (?,?,?,?,?)'),
  notifByUser: db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 30'),
  notifReadAll: db.prepare('UPDATE notifications SET read = 1 WHERE user_id = ?'),
  notifReadOne: db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?'),
  evIns: db.prepare('INSERT INTO events (user_id,type,data,created_at) VALUES (?,?,?,?)'),
  evSince: db.prepare('SELECT * FROM events WHERE user_id = ? AND seq > ? ORDER BY seq LIMIT 100'),
  evMaxSeq: db.prepare('SELECT MAX(seq) AS m FROM events WHERE user_id = ?'),
  evPrune: db.prepare('DELETE FROM events WHERE created_at < ?')
};

module.exports = { db, tx, now, q, cfg };
