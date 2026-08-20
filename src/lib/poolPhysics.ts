(function (root, factory){
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PoolPhysics = factory();
})(typeof self !== 'undefined' ? self : this, function(){
  'use strict';
  /* NoirCue 8-Ball physics v3 — VERTICAL portrait table (50 × 100 units),
     CCD substeps, cue spin (x=side, y=draw/follow), pocket suction,
     deterministic: identical simulation on server and client. */
  const W = 50, H = 100;                       /* portrait: tall table */
  const R = 2.05;                              /* bigger balls */
  const PR = 3.1;                              /* bigger pockets */
  const RAIL = 1.6;
  const X0 = RAIL, X1 = W - RAIL, Y0 = RAIL, Y1 = H - RAIL;
  const POCKETS = [
    { x: 1.1, y: 1.1 }, { x: W - 1.1, y: 1.1 }, { x: W / 2, y: 0.55 },
    { x: 1.1, y: H - 1.1 }, { x: W - 1.1, y: H - 1.1 }, { x: W / 2, y: H - 0.55 }
  ];
  const FRICTION = 0.9848;
  const STOP = 0.011;
  const WALL_DAMP = 0.86;
  const BALL_DAMP = 0.975;
  const SUB = 4;

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
        const cue = a.id === 0 ? a : (b.id === 0 ? b : null);
        const imp = -rel * BALL_DAMP;
        /* pre-impact cue direction */
        let preX = 0, preY = 0;
        if (cue){
          preX = cue === a ? a.vx + imp * nx : cue.vx - imp * nx;
          preY = cue === a ? a.vy + imp * ny : cue.vy - imp * ny;
        }
        a.vx -= imp * nx; a.vy -= imp * ny;
        b.vx += imp * nx; b.vy += imp * ny;
        if (cue && !cue._spinUsed){
          cue._spinUsed = true;
          /* y-spin (english): draw (y>0) pulls back, follow (y<0) pushes on */
          const sy = (cue.spinY || 0);
          cue.vx += -sy * preX * 0.55;
          cue.vy += -sy * preY * 0.55;
          /* x-spin (side): curves rebound slightly off the contact normal */
          const sx = (cue.spinX || 0);
          cue.vx += sx * preY * 0.35;
          cue.vy += -sx * preX * 0.35;
        }
      }
    }
  }

  function substep(balls){
    for (const b of balls){
      if (b.pocketed) continue;
      b.x += b.vx / SUB;
      b.y += b.vy / SUB;
      const pull = nearPocket(b.x, b.y, 2.2);
      if (pull){
        const dx = pull.x - b.x, dy = pull.y - b.y;
        const d = Math.sqrt(dx * dx + dy * dy) || 1;
        b.vx += (dx / d) * 0.11;
        b.vy += (dy / d) * 0.11;
      }
    }
    for (const b of balls){
      if (b.pocketed) continue;
      if (!nearPocket(b.x, b.y, 1.4)){
        if (b.x - R < X0){ b.x = X0 + R; b.vx = -b.vx * WALL_DAMP; b.vy += (b.spinX || 0) * b.vx * 0.12; }
        else if (b.x + R > X1){ b.x = X1 - R; b.vx = -b.vx * WALL_DAMP; b.vy -= (b.spinX || 0) * b.vx * 0.12; }
        if (b.y - R < Y0){ b.y = Y0 + R; b.vy = -b.vy * WALL_DAMP; b.vx += (b.spinX || 0) * b.vy * 0.12; }
        else if (b.y + R > Y1){ b.y = Y1 - R; b.vy = -b.vy * WALL_DAMP; b.vx -= (b.spinX || 0) * b.vy * 0.12; }
      } else {
        if (b.x < R) b.x = R; if (b.x > W - R) b.x = W - R;
        if (b.y < R) b.y = R; if (b.y > H - R) b.y = H - R;
      }
    }
    for (let i = 0; i < balls.length; i++){
      if (balls[i].pocketed) continue;
      for (let j = i + 1; j < balls.length; j++){
        if (balls[j].pocketed) continue;
        collidePair(balls[i], balls[j]);
      }
    }
    for (const b of balls){
      if (b.pocketed) continue;
      if (nearPocket(b.x, b.y, 1)){ b.pocketed = true; b.vx = 0; b.vy = 0; b.x = -60; b.y = -60; }
    }
  }

  function step(balls){
    for (const b of balls){
      if (b.pocketed) continue;
      b.vx *= FRICTION; b.vy *= FRICTION;
      if (Math.abs(b.vx) < STOP && Math.abs(b.vy) < STOP){ b.vx = 0; b.vy = 0; }
    }
    for (let s = 0; s < SUB; s++) substep(balls);
  }

  function allStopped(balls){
    return balls.every(b => b.pocketed || (b.vx === 0 && b.vy === 0));
  }

  function simulate(balls, maxSteps){
    let n = 0;
    while (!allStopped(balls) && n < (maxSteps || 1600)){ step(balls); n++; }
    for (const b of balls){ b.vx = 0; b.vy = 0; b._spinUsed = false; }
    return n;
  }

  /* portrait rack: cue at BOTTOM (y=75%), apex triangle at TOP (y=25%) */
  function rackPositions(){
    const balls = [];
    balls.push({ id: 0, x: W / 2, y: H * 0.75, vx: 0, vy: 0, pocketed: false, spinX: 0, spinY: 0, _spinUsed: false });
    const apex = { x: W / 2, y: H * 0.25 };
    const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
    let k = 0;
    for (let row = 0; row < 5; row++){
      for (let i = 0; i <= row; i++){
        balls.push({
          id: order[k++],
          x: apex.x - row * (2 * R + 0.07) * 0.87,
          y: apex.y + row * (2 * R + 0.07) * (0.5 + 0.87 * 0.5) * 0.9 + i * 0,
          vx: 0, vy: 0, pocketed: false, spinX: 0, spinY: 0, _spinUsed: false
        });
        /* triangle points downward: each row adds one ball horizontally staggered */
        balls[balls.length - 1].x = apex.x - row * (R + 0.035) + i * (2 * R + 0.07);
        balls[balls.length - 1].y = apex.y + row * (2 * R + 0.07) * 0.87;
      }
    }
    return balls;
  }

  return { W, H, R, PR, POCKETS, X0, X1, Y0, Y1, step, simulate, allStopped, rackPositions, nearPocket };
});

/* module export for the integrated client build */
export const P = (typeof window !== "undefined" ? window : globalThis).PoolPhysics;
