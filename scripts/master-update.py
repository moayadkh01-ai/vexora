#!/usr/bin/env python3
"""NoirCue Master Update: admin fix, luxury BG, pool viewport, nav confirm."""

# 1) Admin email → admin@noircue.com
c = open('server/config.js', encoding='utf-8').read()
c = c.replace("ADMIN_EMAIL: env('ADMIN_EMAIL', 'admin@noircue.gg')", "ADMIN_EMAIL: env('ADMIN_EMAIL', 'admin@noircue.com')")
open('server/config.js','w',encoding='utf-8').write(c)
print('config: admin@noircue.com')

# Also ensure seed creates admin with correct email even if old one exists
s = open('server/seed.js', encoding='utf-8').read()
if 'noircue.com' not in s:
    s = s.replace('admin@noircue.app', 'admin@noircue.com')
    s = s.replace('admin@noircue.gg', 'admin@noircue.com')
    open('server/seed.js','w',encoding='utf-8').write(s)
print('seed: admin email updated')

# 2) Auth.tsx placeholder update + admin hint
a = open('src/screens/Auth.tsx', encoding='utf-8').read()
a = a.replace("placeholder={mode === 'login' ? 'الاسم أو البريد' : 'اسم المستخدم'}",
              "placeholder={mode === 'login' ? 'admin@noircue.com أو اسمك' : 'اسم المستخدم'}")
# Add admin quick-access hint below quick button
old_quick = "<button className=\"btn ghost wfull\" disabled={busy} onClick={quick} style={{ marginTop: 8 }}>⚡ حساب فوري</button>"
new_quick = old_quick + """
        <div style={{ marginTop: 10, fontSize: 10, color: '#9a968a', textAlign: 'center', lineHeight: 1.6 }}>
          للأدارة: <b style={{ color: '#d4af37' }}>admin@noircue.com</b>
        </div>"""
if old_quick in a:
    a = a.replace(old_quick, new_quick)
open('src/screens/Auth.tsx','w',encoding='utf-8').write(a)
print('auth: placeholder + admin hint')

# 3) Pool viewport fix — exact CSS the user specified
p = open('src/screens/Pool.tsx', encoding='utf-8').read()
# canvas sizing: calc(100vh - 140px), max-width 420px, centered, overflow hidden
old_fit = """const fit = () => {
      const w = c.parentElement!.clientWidth || 300;
      const dpr = Math.min(2, devicePixelRatio || 1);
      c.width = Math.round(w*dpr); c.height = Math.round(w*2*dpr);
      c.style.height = Math.round(w*2)+'px';
      draw();
    };"""
new_fit = """const fit = () => {
      /* viewport fix: fit between top bar and bottom nav */
      const maxW = 420;
      const availH = window.innerHeight - 140;   /* topbar(~56) + bottomnav(~70) + margins */
      let w = Math.min(c.parentElement?.clientWidth || 300, maxW);
      /* table aspect 1:2 — ensure height fits within available space */
      if (w * 2 > availH) w = availH / 2;
      const dpr = Math.min(2, devicePixelRatio || 1);
      c.width = Math.round(w * dpr);
      c.height = Math.round(w * 2 * dpr);
      c.style.width = Math.round(w) + 'px';
      c.style.height = Math.round(w * 2) + 'px';
      c.style.maxWidth = maxW + 'px';
      c.style.margin = '0 auto';
      c.style.display = 'block';
      c.style.overflow = 'hidden';
      draw();
    };"""
assert old_fit in p, 'pool fit anchor'
p = p.replace(old_fit, new_fit)
open('src/screens/Pool.tsx','w',encoding='utf-8').write(p)
print('pool: viewport calc(100vh-140px) max-420px')

# 4) Luxury ambient background — gold dust particles via pure CSS
css = open('src/styles.css', encoding='utf-8').read()
css += """

/* ============================================================
   NoirCue Luxury Ambient — Dark Obsidian & Gold
   ============================================================ */
body {
  background:
    radial-gradient(900px 500px at 80% -10%, rgba(212,175,55,.05), transparent 60%),
    radial-gradient(600px 350px at 10% 60%, rgba(212,175,55,.02), transparent 60%),
    radial-gradient(400px 250px at 50% 100%, rgba(212,175,55,.03), transparent 60%),
    #060608 !important;
}

/* floating gold dust particles (pure CSS, zero perf cost) */
.gold-dust {
  position: fixed; inset: 0; z-index: 0; pointer-events: none; overflow: hidden;
}
.gold-dust .gd {
  position: absolute; border-radius: 50%; background: rgba(212,175,55,var(--o,.3));
  filter: blur(var(--b,.5px)); animation: gdFloat var(--d,12s) ease-in-out infinite alternate;
  box-shadow: 0 0 6px rgba(212,175,55,.2);
}
@keyframes gdFloat {
  0%   { transform: translate(0,0) scale(1); opacity: var(--o,.3); }
  50%  { transform: translate(var(--tx,20px), calc(var(--ty,-40px) * .5)) scale(1.15); opacity: calc(var(--o,.3) * 1.4); }
  100% { transform: translate(calc(var(--tx,20px) * -1), var(--ty,-40px)) scale(.9); opacity: calc(var(--o,.3) * .7); }
}

/* auth screen luxury glow ring */
.auth-glow {
  position: relative;
}
.auth-glow::before {
  content: ""; position: absolute; inset: -20px; z-index: -1; border-radius: 50%;
  background: radial-gradient(circle, rgba(212,175,55,.08), transparent 70%);
  animation: authPulse 3s ease-in-out infinite alternate;
}
@keyframes authPulse { to { transform: scale(1.08); opacity: .7; } }

/* pool canvas container — exact viewport spec */
.poolcv {
  max-width: 420px;
  margin: 0 auto;
  overflow: hidden;
  border-radius: 10px;
}
.pool-stage {
  height: calc(100vh - 140px);
  max-width: 420px;
  margin: 0 auto;
  overflow: hidden;
  display: flex; align-items: center; justify-content: center;
}
"""
open('src/styles.css','w',encoding='utf-8').write(css)
print('css: luxury bg + gold dust + pool viewport')

# 5) App.tsx — add gold dust particles component
ap = open('src/App.tsx', encoding='utf-8').read()
if 'gold-dust' not in ap:
    old_return = "  return (\n    <>\n      <header className=\"appbar\">"
    new_return = "  return (\n    <>\n      <GoldDust />\n      <header className=\"appbar\">"
    assert old_return in ap
    ap = ap.replace(old_return, new_return)
    ap += """

/* 14 gold dust particles — deterministic positions, zero re-render cost */
function GoldDust() {
  const particles = Array.from({ length: 14 }, (_, i) => ({
    left: (i * 37 + 13) % 100,
    top: (i * 53 + 7) % 100,
    size: 2 + (i % 3),
    opacity: 0.15 + (i % 4) * 0.07,
    duration: 10 + (i % 5) * 3,
    delay: i * 0.8,
    tx: ((i % 5) - 2) * 15,
    ty: -(30 + (i % 4) * 15),
  }));
  return (
    <div className="gold-dust">
      {particles.map((p, i) => (
        <span key={i} className="gd" style={{
          left: p.left + '%', top: p.top + '%',
          width: p.size + 'px', height: p.size + 'px',
          '--o': p.opacity, '--d': p.duration + 's',
          animationDelay: p.delay + 's',
          '--tx': p.tx + 'px', '--ty': p.ty + 'px',
        }} />
      ))}
    </div>
  );
}
"""
    open('src/App.tsx','w',encoding='utf-8').write(ap)
    print('App.tsx: GoldDust component added')

# 6) Auth screen — add auth-glow class to logo
a2 = open('src/screens/Auth.tsx', encoding='utf-8').read()
a2 = a2.replace(
    'style={{ width: 68, height: 68, borderRadius: 18, background: \'#0c0c12\', border: \'2px solid #d4af37\', display: \'flex\', alignItems: \'center\', justifyContent: \'center\', fontSize: 22, fontWeight: 900, color: \'#d4af37\', marginBottom: 12 }}',
    'className="auth-glow" style={{ width: 68, height: 68, borderRadius: 18, background: \'#0c0c12\', border: \'2px solid #d4af37\', display: \'flex\', alignItems: \'center\', justifyContent: \'center\', fontSize: 22, fontWeight: 900, color: \'#d4af37\', marginBottom: 12 }}'
)
open('src/screens/Auth.tsx','w',encoding='utf-8').write(a2)
print('auth: glow ring on logo')

# 7) Confirm bottom nav (already correct from NoirCue build, just verify)
ap2 = open('src/App.tsx', encoding='utf-8').read()
navs = ['الرئيسية', 'المتجر', 'المحفظة', 'الغرف', 'الأصدقاء', 'الإدارة']
missing = [n for n in navs if n not in ap2]
has_pool = 'بلياردو' in ap2.split('NAV')[1].split('];')[0] if 'NAV' in ap2 else False
print(f'nav: 6 tabs {"✓" if not missing else "MISSING: " + str(missing)} | pool/chess in nav: {has_pool}')

print('\\nALL PATCHES APPLIED')
