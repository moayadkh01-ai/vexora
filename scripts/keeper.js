'use strict';
/* ============================================================
   NoirCue keeper — deployment supervisor
   • restores node_modules after a snapshot wipe
   • starts/restarts the NoirCue server when it's down
   • keeps a Cloudflare tunnel alive (http2/TCP transport)
   • probes the PUBLIC url every 20s; recycles a stale tunnel
     (≤2 failures) so the link self-heals within ~40s
   • always records the live URL in data/PUBLIC_URL
   ============================================================ */
const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const DIR = path.join(__dirname, '..');
const LOG = path.join(DIR, 'data', 'tunnel.log');
const URLF = path.join(DIR, 'data', 'PUBLIC_URL');
const CF = path.join(DIR, 'bin', 'cloudflared');
const log = m => console.log('[keeper] ' + m);
const sleep = ms => new Promise(r => setTimeout(r, ms));

async function localUp(){
  try { const r = await fetch('http://127.0.0.1:3000/api/healthz', { signal: AbortSignal.timeout(3000) }); return r.ok; }
  catch(e){ return false; }
}
async function publicUp(host){
  if (!host) return false;
  try { const r = await fetch(host + '/api/healthz', { signal: AbortSignal.timeout(12000) }); return r.status === 200; }
  catch(e){ return false; }
}
function ensureBinary(){
  if (!fs.existsSync(CF)){
    log('cloudflared missing — downloading…');
    execSync(`curl -sL -o "${CF}" https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64`, { timeout: 240000 });
  }
  try { fs.chmodSync(CF, 0o755); } catch(e){}
}
function ensureDeps(){
  if (fs.existsSync(path.join(DIR, 'node_modules', 'better-sqlite3'))) return;
  log('node_modules missing — restoring…');
  try { execSync('npm install --no-audit --no-fund --loglevel=error', { cwd: DIR, timeout: 500000, stdio: 'inherit' }); }
  catch(e){ log('npm install failed: ' + e.message); }
}
async function ensureServer(){
  if (await localUp()) return true;
  log('starting NoirCue server…');
  const out = fs.openSync(path.join(DIR, 'data', 'server.log'), 'a');
  const child = spawn('npm', ['start'], { cwd: DIR, detached: true, stdio: ['ignore', out, out] });
  child.unref();
  for (let i = 0; i < 90; i++){ await sleep(1000); if (await localUp()){ log('server up'); return true; } }
  return false;
}
async function readHost(){
  for (let i = 0; i < 30; i++){
    try {
      const t = fs.readFileSync(LOG, 'utf8');
      const m = t.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
      if (m) return m[0];
    } catch(e){}
    await sleep(2000);
  }
  return null;
}

(async () => {
  log('keeper started');
  while (true){
    try {
      ensureBinary();
      ensureDeps();
      if (!(await ensureServer())){ log('server unavailable — retry in 10s'); await sleep(10000); continue; }

      log('starting tunnel ' + new Date().toISOString());
      fs.writeFileSync(LOG, '');
      const out = fs.openSync(LOG, 'a');
      const cf = spawn(CF, ['tunnel', '--url', 'http://127.0.0.1:3000', '--no-autoupdate', '--protocol', 'http2'], { stdio: ['ignore', out, out] });

      const host = await readHost();
      if (host){ fs.writeFileSync(URLF, host); log('LIVE at ' + host); }
      else log('no url captured — will restart');

      let fails = 0;
      while (true){
        await sleep(20000);
        if (cf.exitCode !== null){ log('cloudflared exited (code ' + cf.exitCode + ')'); break; }
        if (await publicUp(host)) fails = 0;
        else {
          fails++;
          log('public probe unhealthy (streak ' + fails + ')');
          if (fails >= 2){ log('recycling stale tunnel'); try { cf.kill('SIGKILL'); } catch(e){} break; }
        }
      }
      try { cf.kill('SIGKILL'); } catch(e){}
      await sleep(3000);
    } catch(e){ log('loop error: ' + e.message); await sleep(5000); }
  }
})();
