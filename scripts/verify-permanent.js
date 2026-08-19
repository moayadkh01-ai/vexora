'use strict';
/* ============================================================
   VEXORA — permanent deployment verification
   Runs the full 8-point acceptance checklist against a URL:
     1. website loads            5. login works
     2. backend/API responds     6. zero "Failed to fetch" (network errors)
     3. account creation works   7. no Cloudflare Error 1033 / tunnel hosts
     4. username validation      8. independence from the agent session
   Usage:  node scripts/verify-permanent.js https://your-permanent-url
   Env:    SKIP_HOST_CHECK=1 allows dry-run against localhost/tunnels
   ============================================================ */
const PUB = (process.argv[2] || process.env.PERMANENT_URL || '').replace(/\/+$/, '');
if (!PUB){ console.error('usage: node scripts/verify-permanent.js https://…'); process.exit(2); }

const host = new URL(PUB).hostname;
let pass = 0, fail = 0;
const T = (n, c, x) => { if (c){ pass++; console.log('  ✓ ' + n); } else { fail++; console.log('  ✗ ' + n + (x ? ' → ' + String(x).slice(0, 160) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let networkErrors = 0, saw1033 = false;

async function hit(path, opts){
  try {
    const r = await fetch(PUB + path, { signal: AbortSignal.timeout(15000), ...opts });
    const body = await r.text();
    if (r.status === 1033 || /Error 1033|tunnel is offline|trycloudflare/i.test(body)) saw1033 = true;
    return { status: r.status, body, headers: r.headers };
  } catch(e){ networkErrors++; throw e; }
}
async function api(method, p, body, token){
  const r = await hit('/api' + p, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  let j = null; try { j = JSON.parse(r.body); } catch(e){}
  return { status: r.status, j };
}

(async () => {
  console.log('VEXORA permanent verification →', PUB, '\n');

  /* 8. structural independence: must not be a tunnel/sandbox/agent host */
  if (!process.env.SKIP_HOST_CHECK){
    T('8. independent permanent host (not tunnel/sandbox/localhost)',
      !/(trycloudflare|\.e2b\.app|localhost|127\.0\.0\.1|ngrok|loca\.lt|serveo|localhost\.run)/i.test(host), host);
  } else {
    console.log('  ⚠ host check skipped (dry-run mode)');
  }

  /* 1. website loads */
  const page = await hit('/');
  T('1. website loads (HTTP 200)', page.status === 200, page.status);
  T('1b. VEXORA Arabic RTL app served', page.body.includes('dir="rtl"') && page.body.includes('فيكسورا'));
  for (const f of ['style.css', 'core.js', 'views.js', 'room.js']){
    T('1c. asset ' + f, (await hit('/' + f)).status === 200);
  }

  /* 2. backend API responds */
  const hz = await hit('/api/healthz');
  T('2. backend/API responds (healthz 200 + ok:true)', hz.status === 200 && hz.body.includes('"ok":true'));
  const cfg = await api('GET', '/config');
  T('2b. /api/config returns games catalog', cfg.status === 200 && Array.isArray(cfg.j && cfg.j.games));

  /* 3. account creation */
  const sfx = Math.floor(Math.random() * 900000 + 100000);
  const reg = await api('POST', '/auth/register', { username: 'Perm_' + sfx, email: 'perm' + sfx + '@vexora.gg', password: 'password123' });
  T('3. account creation works (200 + token + 1000 VC)', reg.status === 200 && !!reg.j.token && reg.j.user.username === 'Perm_' + sfx, reg.j);

  /* 4. username validation */
  T('4a. short username rejected (400)', (await api('POST', '/auth/register', { username: 'ab', email: 'x@x.gg', password: 'password123' })).status === 400);
  const resv = await api('POST', '/auth/register', { username: 'admin', email: 'r' + sfx + '@x.gg', password: 'password123' });
  T('4b. reserved username rejected', resv.status === 400 && resv.j.error === 'RESERVED', resv.j);
  const dup = await api('POST', '/auth/register', { username: 'Perm_' + sfx, email: 'd' + sfx + '@x.gg', password: 'password123' });
  T('4c. duplicate username rejected (409)', dup.status === 409 && dup.j.error === 'USERNAME_TAKEN', dup.j);
  T('4d. weak password rejected (400)', (await api('POST', '/auth/register', { username: 'Valid_' + sfx, email: 'w' + sfx + '@x.gg', password: '123' })).status === 400);

  /* 5. login */
  const login = await api('POST', '/auth/login', { id: 'Perm_' + sfx, password: 'password123' });
  T('5. login works (200 + token)', login.status === 200 && !!login.j.token, login.j);
  T('5b. wrong password rejected (401)', (await api('POST', '/auth/login', { id: 'Perm_' + sfx, password: 'wrong-pass' })).status === 401);
  const me = await api('GET', '/me', null, login.j.token);
  T('5c. session valid (/me works)', me.status === 200 && me.j.coins === 1000);

  /* 6+7. no failed fetches / no Cloudflare 1033 across a stability window */
  console.log('  … stability window (3 probes, 5s apart)');
  for (let i = 0; i < 3; i++){ await sleep(5000); const p = await hit('/'); if (p.status !== 200) networkErrors++; }
  T('6. zero "Failed to fetch" (all requests completed)', networkErrors === 0, networkErrors + ' network errors');
  T('7. no Cloudflare Error 1033 / offline tunnel', !saw1033);

  console.log('\n════════════════════════════');
  console.log('  ' + pass + ' passed · ' + fail + ' failed');
  console.log(fail === 0 ? '  ✅ ACCEPTED — safe to hand over this URL' : '  ❌ NOT ACCEPTED — fix before handover');
  process.exit(fail === 0 ? 0 : 1);
})().catch(e => { console.error('FATAL: ' + e.message); process.exit(2); });
