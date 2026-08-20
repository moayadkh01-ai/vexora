'use strict';
/* ============================================================
   NoirCue — Hugging Face deployment (official SDK)
   Usage: HF_TOKEN=hf_xxx ADMIN_PASS=xxx node scripts/deploy-hf-lib.js
   Creates: private dataset (DB backups) + public Docker Space,
   uploads the app, sets secrets, restarts the build.
   ============================================================ */
const fs = require('fs');
const path = require('path');
const { createRepo, commit, spaceInfo } = require('@huggingface/hub');

const TOKEN = process.env.HF_TOKEN || '';
if (!TOKEN){ console.error('HF_TOKEN missing'); process.exit(1); }
const ADMIN_PASS = process.env.ADMIN_PASS || 'admin123';
const BACKUP_MIN = process.env.HF_BACKUP_MIN || '3';

(async () => {
  const who = await fetch('https://huggingface.co/api/whoami-v2', { headers: { Authorization: 'Bearer ' + TOKEN } }).then(r => r.json());
  const OWNER = who.name;
  const SPACE = `${OWNER}/noircue`;
  const DATASET = `${OWNER}/noircue-db`;
  const PUBLIC_URL = `https://${OWNER}-noircue.hf.space`;
  console.log('▶ owner:', OWNER);

  /* 1) private dataset for DB backups */
  try { await createRepo({ repo: { type: 'dataset', name: DATASET }, credential: TOKEN, private: true }); console.log('✓ dataset (private):', DATASET); }
  catch(e){ console.log('· dataset:', e.message.slice(0, 90)); }

  /* 2) public Docker Space */
  try { await createRepo({ repo: { type: 'space', name: SPACE }, credential: TOKEN, private: false, sdk: 'docker' }); console.log('✓ space (public docker):', SPACE); }
  catch(e){ console.log('· space:', e.message.slice(0, 90)); }

  /* 3) upload the app */
  const DIR = path.join(__dirname, '..');
  const readme = `---
title: NoirCue · نواركيو
emoji: 🎮
colorFrom: indigo
colorTo: cyan
sdk: docker
app_port: 3000
pinned: false
---
NoirCue (نواركيو) — premium Arabic-RTL multiplayer gaming platform.
`;
  const ops = [{ operation: 'addOrUpdate', path: 'README.md', content: new Blob([readme]) }];
  const walk = (rel) => {
    const abs = path.join(DIR, rel);
    for (const ent of fs.readdirSync(abs, { withFileTypes: true })){
      if (ent.name.startsWith('.') || ent.name === 'node_modules' || ent.name === 'bin' || ent.name === 'data' || ent.name === 'mobile') continue;
      const p = path.join(rel, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (/\.(log|zip|tgz)$/.test(ent.name)) continue;
      else if (/^(server|public|scripts)\//.test(p + '/') || /^(server|public|scripts)\//.test(p) || ['package.json', 'package-lock.json', 'Dockerfile', 'config.example.env'].includes(p)){
        if (/^(server|public|scripts)\//.test(p)) ops.push({ operation: 'addOrUpdate', path: p, content: new Blob([fs.readFileSync(path.join(DIR, p))]) });
        else ops.push({ operation: 'addOrUpdate', path: p, content: new Blob([fs.readFileSync(path.join(DIR, p))]) });
      }
    }
  };
  walk('.');
  console.log('▶ uploading', ops.length, 'files…');
  const r = await commit({
    repo: { type: 'space', name: SPACE },
    title: 'NoirCue deploy',
    credentials: { accessToken: TOKEN },
    operations: ops
  });
  console.log('✓ uploaded (' + (r.oid || '').slice(0, 10) + ')');

  /* 4) secrets */
  const secrets = {
    HF_TOKEN, HF_REPO: DATASET,
    NODE_ENV: 'production', DB_PATH: '/app/data/noircue.db',
    COOKIE_SECURE: '1', ADMIN_PASS, PAYMENTS_SIMULATE: '1',
    SELF_PING_URL: PUBLIC_URL, HF_BACKUP_MIN: BACKUP_MIN
  };
  let ok = 0;
  for (const [key, value] of Object.entries(secrets)){
    const res = await fetch(`https://huggingface.co/api/spaces/${SPACE}/secrets`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value })
    });
    if (res.ok) ok++; else console.log('· secret ' + key + ' → ' + res.status);
  }
  console.log('✓ secrets set: ' + ok + '/' + Object.keys(secrets).length);

  /* 5) restart build */
  await fetch(`https://huggingface.co/api/spaces/${SPACE}/restart`, { method: 'POST', headers: { Authorization: 'Bearer ' + TOKEN } });
  console.log('✅ deployed →', PUBLIC_URL, '(building, ~2-4 min)');
  console.log('VERIFY_URL=' + PUBLIC_URL);
})().catch(e => { console.error('DEPLOY FAILED:', e.message); process.exit(1); });
