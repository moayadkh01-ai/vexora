'use strict';
/* ============================================================
   NoirCue — Security & validation
   rate limiting · input validation · sanitization
   ============================================================ */

/* ---------- rate limiter (per key sliding window) ---------- */
const buckets = new Map();
function rateHit(key, max, windowMs){
  const t = Date.now();
  let b = buckets.get(key);
  if (!b){ b = []; buckets.set(key, b); }
  while (b.length && t - b[0] > windowMs) b.shift();
  if (b.length >= max) return false;
  b.push(t);
  if (buckets.size > 5000) for (const [k, v] of buckets) { if (!v.length || t - v[v.length-1] > windowMs*4) buckets.delete(k); }
  return true;
}
setInterval(() => { const t = Date.now(); for (const [k, v] of buckets) if (!v.length || t - v[v.length-1] > 300000) buckets.delete(k); }, 120000).unref();

function clientIp(req){
  const xf = req.headers['x-forwarded-for'];
  if (xf) return String(xf).split(',')[0].trim();
  return req.socket.remoteAddr || req.socket.remoteAddress || '?';
}

/* ---------- validators ---------- */
const RE_USER = /^[A-Za-z0-9_\u0600-\u06FF]{3,20}$/u;
const RE_EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,10}$/;

function vUsername(s){
  return typeof s === 'string' && RE_USER.test(s);
}
function vEmail(s){
  return typeof s === 'string' && s.length <= 254 && RE_EMAIL.test(s);
}
function vPassword(s){
  return typeof s === 'string' && s.length >= 8 && s.length <= 72;
}
function vInt(n, min, max){
  return Number.isInteger(n) && n >= min && n <= max;
}
function cleanText(s, max){
  if (typeof s !== 'string') return '';
  return s.replace(/[\u0000-\u0008\u000B-\u001F\u007F]/g, '').trim().slice(0, max);
}
const RESERVED = ['noircue','admin','administrator','root','system','support','staff','moderator','نواركيو','الإدارة'];
function isReserved(s){
  return RESERVED.indexOf(String(s).toLowerCase()) >= 0;
}

module.exports = { rateHit, clientIp, vUsername, vEmail, vPassword, vInt, cleanText, isReserved };
