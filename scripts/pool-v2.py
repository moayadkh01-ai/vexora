#!/usr/bin/env python3
# v2026.08.20.7 — Pool 8 v2 (Gamezer-style): CCD substeps, spin/draw-follow,
# pocket suction, wooden table + 3D balls, 9s shot clock + foul, pocketed HUD,
# portrait full-width canvas; left-clip responsive fix; rooms click hardening.
BUILD = 'v2026.08.20.7'

# ================= 1) pool-physics.js v2 =================
P = '''(function (root, factory){
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PoolPhysics = factory();
})(typeof self !== 'undefined' ? self : this, function(){
  'use strict';
  /* VEXORA 8-Ball physics v2 — continuous collision (3 substeps/frame),
     cue-ball spin (draw/follow), pocket suction, deterministic on server+client */
  const W = 100, H = 50;
  const R = 1.35;
  const PR = 1.85;
  const RAIL = 1.2;
  const X0 = RAIL, X1 = W - RAIL, Y0 = RAIL, Y1 = H - RAIL;
  const POCKETS = [
    { x: 0.8, y: 0.8 }, { x: W / 2, y: 0.3 }, { x: W - 0.8, y: 0.8 },
    { x: 0.8, y: H - 0.8 }, { x: W / 2, y: H - 0.3 }, { x: W - 0.8, y: H - 0.8 }
  ];
  const FRICTION = 0.9845;
  const STOP = 0.012;
  const WALL_DAMP = 0.86;
  const BALL_DAMP = 0.975;
  const SUB = 3;              /* substeps per frame → no tunneling at break speed */

  function nearPocket(x, y, mult){
    const r = PR * (mult || 1);
    for (const p of POCKETS) if ((x - p.x) * (x - p.x) + (y - p.y) * (y - p.y) < r * r) return p;
    return null;
  }

  function collidePair(a, b){
    const dx = b.x - a.x, dy = b.y - a.y;
    const d2 = dx * dx + dy * dy;
    const min = 2 * R;
    if (d2 > 0 && d2 < min * min){
      const d = Math.sqrt(d2);
      const nx = dx / d, ny = dy / d;
      const overlap = (min - d) / 2;
      a.x -= nx * overlap; a.y -= ny * overlap;
      b.x += nx * overlap; b.y += ny * overlap;
      const rvx = b.vx - a.vx, rvy = b.vy - a.vy;
      const rel = rvx * nx + rvy * ny;
      if (rel < 0){
        /* spin applies on the CUE ball's first object-ball contact */
        const cue = a.id === 0 ? a : (b.id === 0 ? b : null);
        const pvx = cue ? (a.id === 0 ? b.vx - rvx * nx : a.vx) : 0;   /* approx pre-impact cue velocity */
        const imp = -rel * BALL_DAMP;
        a.vx -= imp * nx; a.vy -= imp * ny;
        b.vx += imp * nx; b.vy += imp * ny;
        if (cue && cue.spin && !cue._spinUsed){
          cue._spinUsed = true;
          /* pre-impact direction ≈ cue's remaining velocity before impulse */
          const preX = cue.vx + (a === cue ? imp * nx : -imp * nx);
          const preY = cue.vy + (a === cue ? imp * ny : -imp * ny);
          cue.vx += cue.spin * preX * 0.5;
          cue.vy += cue.spin * preY * 0.5;
        }
      }
    }
  }

  function substep(balls, s){
    for (const b of balls){
      if (b.pocketed) continue;
      b.x += b.vx / s;
      b.y += b.vy / s;
      /* pocket suction: pull nearby balls into the jaws */
      const pull = nearPocket(b.x, b.y, 2.3);
      if (pull){
        const dx = pull.x - b.x, dy = pull.y - b.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        b.vx += (dx / d) * 0.09;
        b.vy += (dy / d) * 0.09;
      }
    }
    /* cushions (skip at pocket mouths) */
    for (const b of balls){
      if (b.pocketed) continue;
      if (!nearPocket(b.x, b.y, 1.35)){
        if (b.x - R < X0){ b.x = X0 + R; b.vx = -b.vx * WALL_DAMP; }
        else if (b.x + R > X1){ b.x = X1 - R; b.vx = -b.vx * WALL_DAMP; }
        if (b.y - R < Y0){ b.y = Y0 + R; b.vy = -b.vy * WALL_DAMP; }
        else if (b.y + R > Y1){ b.y = Y1 - R; b.vy = -b.vy * WALL_DAMP; }
      } else {
        if (b.x < R) b.x = R; if (b.x > W - R) b.x = W - R;
        if (b.y < R) b.y = R; if (b.y > H - R) b.y = H - R;
      }
    }
    /* pairwise collisions */
    for (let i = 0; i < balls.length; i++){
      const a = balls[i];
      if (a.pocketed) continue;
      for (let j = i + 1; j < balls.length; j++){
        const c = balls[j];
        if (c.pocketed) continue;
        collidePair(a, c);
      }
    }
    /* capture */
    for (const b of balls){
      if (b.pocketed) continue;
      if (nearPocket(b.x, b.y, 1)){ b.pocketed = true; b.vx = 0; b.vy = 0; b.x = -50; b.y = -50; }
    }
  }

  function step(balls){
    for (const b of balls){
      if (b.pocketed) continue;
      b.vx *= FRICTION; b.vy *= FRICTION;
      if (Math.abs(b.vx) < STOP && Math.abs(b.vy) < STOP){ b.vx = 0; b.vy = 0; }
    }
    for (let s = 0; s < SUB; s++) substep(balls, SUB);
  }

  function allStopped(balls){
    return balls.every(b => b.pocketed || (b.vx === 0 && b.vy === 0));
  }

  function simulate(balls, maxSteps){
    let n = 0;
    while (!allStopped(balls) && n < (maxSteps || 1400)){ step(balls); n++; }
    for (const b of balls){ b.vx = 0; b.vy = 0; b._spinUsed = false; }
    return n;
  }

  function rackPositions(){
    const balls = [];
    balls.push({ id: 0, x: W * 0.25, y: H / 2, vx: 0, vy: 0, pocketed: false, spin: 0, _spinUsed: false });
    const apex = { x: W * 0.68, y: H / 2 };
    const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
    let k = 0;
    for (let row = 0; row < 5; row++){
      for (let i = 0; i <= row; i++){
        balls.push({
          id: order[k++],
          x: apex.x + row * (2 * R + 0.06) * 0.87,
          y: apex.y - row * R + i * (2 * R + 0.06),
          vx: 0, vy: 0, pocketed: false, spin: 0, _spinUsed: false
        });
      }
    }
    return balls;
  }

  return { W, H, R, PR, POCKETS, X0, X1, Y0, Y1, step, simulate, allStopped, rackPositions, nearPocket };
});
'''
open('public/pool-physics.js','w',encoding='utf-8').write(P)
print('physics v2 ok')
