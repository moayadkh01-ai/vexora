'use strict';
/* ============================================================
   VEXORA — HF Hub persistence
   Gives ephemeral free hosts (HF Spaces) a PERMANENT database:
   • restore()  — on boot, pull + gunzip the SQLite backup if the
                  local DB is empty (fresh container)
   • push()     — every N minutes, checkpoint + gzip + upload the DB
                  to a PRIVATE Hugging Face dataset repo (free,
                  durable storage; the Space itself can stay public)
   Node built-ins only (zlib, crypto, fetch). No new dependencies.
   Env: HF_TOKEN (write), HF_REPO (e.g. "user/vexora-db")
   ============================================================ */
const zlib = require('zlib');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const API = 'https://huggingface.co';
let lastHash = '';

function ready(cfg){ return !!(cfg.HF_TOKEN && cfg.HF_REPO); }

async function call(cfg, method, p, body, headers){
  const r = await fetch(API + p, {
    method,
    headers: Object.assign({ Authorization: 'Bearer ' + cfg.HF_TOKEN }, headers || {}),
    body
  });
  if (!r.ok){
    const t = await r.text().catch(() => '');
    throw new Error('HF ' + r.status + ' · ' + t.slice(0, 160));
  }
  return r;
}

/* ---- backup (checkpoint → gzip → commit to private dataset) ---- */
async function push(cfg, db){
  if (!ready(cfg)) return false;
  db.pragma('wal_checkpoint(TRUNCATE)');
  const buf = fs.readFileSync(cfg.DB_PATH);
  const md5 = crypto.createHash('md5').update(buf).digest('hex').slice(0, 12);
  if (md5 === lastHash) return false;                       // nothing changed
  const b64 = zlib.gzipSync(buf).toString('base64');
  const ndjson = [
    JSON.stringify({ key: 'header', value: { summary: 'VEXORA DB backup ' + new Date().toISOString(), repoType: 'dataset' } }),
    JSON.stringify({ key: 'file',   value: { path: 'backup.db.gz', content: b64, encoding: 'base64' } })
  ].join('\n');
  await call(cfg, 'POST', '/api/datasets/' + cfg.HF_REPO + '/commit/main', ndjson, { 'Content-Type': 'application/x-ndjson' });
  lastHash = md5;
  console.log('[hf] DB backup pushed (' + buf.length + ' bytes raw)');
  return true;
}

/* ---- restore (boot: fresh container → pull backup) ---- */
async function restore(cfg){
  if (!ready(cfg)) return false;
  const r = await fetch(API + '/api/datasets/' + cfg.HF_REPO + '/resolve/main/backup.db.gz', {
    headers: { Authorization: 'Bearer ' + cfg.HF_TOKEN }
  });
  if (r.status === 404){ console.log('[hf] no backup yet — fresh start'); return false; }
  if (!r.ok) throw new Error('HF restore ' + r.status);
  const gz = Buffer.from(await r.arrayBuffer());
  const raw = zlib.gunzipSync(gz);
  if (raw.subarray(0, 15).toString('binary') !== 'SQLite format 3') throw new Error('backup is not a SQLite file');
  fs.mkdirSync(path.dirname(cfg.DB_PATH), { recursive: true });
  fs.writeFileSync(cfg.DB_PATH, raw);
  console.log('[hf] database restored from hub (' + raw.length + ' bytes)');
  return true;
}

/* ---- periodic schedule + graceful shutdown flush ---- */
function start(cfg, db){
  if (!ready(cfg)) return;
  const ms = Math.max(60, parseInt(cfg.HF_BACKUP_MIN || '5', 10)) * 60 * 1000;
  const t = setInterval(async () => {
    try { await push(cfg, db); } catch(e){ console.warn('[hf] push failed:', e.message); }
  }, ms);
  t.unref();
  for (const sig of ['SIGTERM', 'SIGINT']){
    process.on(sig, () => { try { push(cfg, db); } catch(e){} process.exit(0); });
  }
  console.log('[hf] hub persistence ON → dataset "' + cfg.HF_REPO + '" every ' + (ms / 60000) + 'min');
}

module.exports = { push, restore, start, ready };
