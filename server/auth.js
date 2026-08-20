'use strict';
/* ============================================================
   NoirCue — Authentication
   scrypt password hashing · opaque session tokens (hashed at rest)
   ============================================================ */
const crypto = require('crypto');
const { db, tx, now, q, cfg } = require('./db');

function hashPassword(pw){
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 }).toString('hex');
  return salt + ':' + hash;
}
function verifyPassword(pw, stored){
  try {
    const [salt, hash] = String(stored).split(':');
    const calc = crypto.scryptSync(pw, salt, 64, { N: 16384, r: 8, p: 1 });
    return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), calc);
  } catch(e){ return false; }
}
const sha = s => crypto.createHash('sha256').update(s).digest('hex');

function issueToken(userId, ip){
  const token = crypto.randomBytes(32).toString('base64url');
  const t = now();
  q.sessionIns.run(sha(token), userId, ip || '', t, t + cfg.SESSION_DAYS * 86400e3);
  return token;
}
function revokeToken(token){ q.sessionDel.run(sha(token)); }
function revokeUserSessions(userId){ q.sessionDelUser.run(userId); }

function tokenFromReq(req){
  const h = req.headers.authorization;
  if (h && h.startsWith('Bearer ')) return h.slice(7);
  if (req.cookies && req.cookies.noircue_token) return req.cookies.noircue_token;
  if (req.query && req.query.token) return String(req.query.token);
  return null;
}

/* express middleware — attaches req.user (row) or 401 */
function authMiddleware(req, res, next){
  const token = tokenFromReq(req);
  if (!token) return res.status(401).json({ error: 'AUTH_REQUIRED', msg: 'تسجيل الدخول مطلوب' });
  const sess = q.sessionGet.get(sha(token), now());
  if (!sess) return res.status(401).json({ error: 'AUTH_REQUIRED', msg: 'الجلسة منتهية — سجّل دخولك مجددًا' });
  const user = q.userById.get(sess.user_id);
  if (!user) return res.status(401).json({ error: 'AUTH_REQUIRED', msg: 'الحساب غير موجود' });
  if (user.banned) return res.status(403).json({ error: 'BANNED', msg: 'هذا الحساب موقوف. تواصل مع دعم نواركيو.' });
  if (user.vip && user.vip_until && user.vip_until < now()){       /* lazy VIP expiry */
    db.prepare('UPDATE users SET vip = NULL, vip_until = 0 WHERE id = ?').run(user.id);
    user.vip = null; user.vip_until = 0;
  }
  req.user = user;
  req.token = token;
  q.touch.run(now(), user.id);
  next();
}
function requireAdmin(req, res, next){
  if (!req.user || req.user.role !== 'admin') return res.status(403).json({ error: 'FORBIDDEN', msg: 'صلاحيات الإدارة مطلوبة' });
  next();
}

function setAuthCookie(res, token){
  res.setHeader('Set-Cookie',
    `noircue_token=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${cfg.SESSION_DAYS * 86400}` +
    (cfg.COOKIE_SECURE ? '; Secure' : ''));
}
function clearAuthCookie(res){
  res.setHeader('Set-Cookie', 'noircue_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0');
}

/* wallet — the ONLY path that may move NoirCue Coins. audit-logged.
   Pass a truthy 5th arg when already inside an outer transaction. */
function walletMove(userId, delta, reason, ref, insideTx){
  const body = () => {
    const u = q.userById.get(userId);
    if (!u) throw new Error('NO_USER');
    const balance = u.coins + delta;
    if (balance < 0) throw new Error('INSUFFICIENT_FUNDS');
    q.setCoins.run(balance, userId);
    q.txIns.run(userId, delta, reason, ref || null, balance, now());
    return balance;
  };
  if (insideTx) return body();     // caller's transaction provides atomicity
  return tx(body)();               // standalone → wrap + invoke
}
function notify(userId, type, title, body){
  q.notifIns.run(userId, type, title, body || '', now());
}

module.exports = {
  hashPassword, verifyPassword, issueToken, revokeToken, revokeUserSessions,
  authMiddleware, requireAdmin, setAuthCookie, clearAuthCookie, walletMove, notify, sha
};
