'use strict';
/* ============================================================
   NoirCue — bootstrap
   On hub-persistent hosts (HF Spaces) the SQLite database is
   restored from the private backup repo BEFORE anything opens it.
   ============================================================ */
const cfg = require('./config');

function run(){ require('./app'); }

if (cfg.HF_TOKEN && cfg.HF_REPO){
  const hf = require('./hf-sync');
  hf.restore(cfg)
    .then(() => { hf.lastHash = ''; run(); })
    .catch(e => { console.warn('[hf] restore failed — starting fresh:', e.message); run(); });
} else run();
