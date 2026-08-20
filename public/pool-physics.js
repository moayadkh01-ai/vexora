(function (root, factory){
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PoolPhysics = factory();
})(typeof self !== 'undefined' ? self : this, function(){
  'use strict';
  /* VEXORA 8-Ball physics — shared by server (authoritative) and client (animation)
     Table: 100 × 50 units, origin top-left. Deterministic fixed timestep. */
  const W = 100, H = 50;
  const R = 1.35;          // ball radius
  const PR = 1.85;         // pocket capture radius
  const RAIL = 1.2;        // cushion thickness (play area inset)
  const X0 = RAIL, X1 = W - RAIL, Y0 = RAIL, Y1 = H - RAIL;
  const POCKETS = [
    { x: 0.8, y: 0.8 }, { x: W / 2, y: 0.3 }, { x: W - 0.8, y: 0.8 },
    { x: 0.8, y: H - 0.8 }, { x: W / 2, y: H - 0.3 }, { x: W - 0.8, y: H - 0.8 }
  ];
  const FRICTION = 0.9845;
  const STOP = 0.012;
  const WALL_DAMP = 0.86;
  const BALL_DAMP = 0.975;

  function nearPocket(x, y, mult){
    const r = PR * (mult || 1);
    for (const p of POCKETS) if ((x - p.x) * (x - p.x) + (y - p.y) * (y - p.y) < r * r) return true;
    return false;
  }

  function step(balls){
    // integrate + friction
    for (const b of balls){
      if (b.pocketed) continue;
      b.x += b.vx; b.y += b.vy;
      b.vx *= FRICTION; b.vy *= FRICTION;
      if (Math.abs(b.vx) < STOP && Math.abs(b.vy) < STOP){ b.vx = 0; b.vy = 0; }
    }
    // cushions (skip where pocket mouths are)
    for (const b of balls){
      if (b.pocketed) continue;
      const inMouth = nearPocket(b.x, b.y, 1.35);   // only skip cushions right at the mouth
      if (!inMouth){
        if (b.x - R < X0){ b.x = X0 + R; b.vx = -b.vx * WALL_DAMP; }
        else if (b.x + R > X1){ b.x = X1 - R; b.vx = -b.vx * WALL_DAMP; }
        if (b.y - R < Y0){ b.y = Y0 + R; b.vy = -b.vy * WALL_DAMP; }
        else if (b.y + R > Y1){ b.y = Y1 - R; b.vy = -b.vy * WALL_DAMP; }
      } else {
        // drifted into mouth area off-table → clamp hard
        if (b.x < R) b.x = R; if (b.x > W - R) b.x = W - R;
        if (b.y < R) b.y = R; if (b.y > H - R) b.y = H - R;
      }
    }
    // ball-ball collisions
    for (let i = 0; i < balls.length; i++){
      const a = balls[i];
      if (a.pocketed) continue;
      for (let j = i + 1; j < balls.length; j++){
        const c = balls[j];
        if (c.pocketed) continue;
        const dx = c.x - a.x, dy = c.y - a.y;
        const d2 = dx * dx + dy * dy;
        const min = 2 * R;
        if (d2 > 0 && d2 < min * min){
          const d = Math.sqrt(d2);
          const nx = dx / d, ny = dy / d;
          const overlap = (min - d) / 2;
          a.x -= nx * overlap; a.y -= ny * overlap;
          c.x += nx * overlap; c.y += ny * overlap;
          const rvx = c.vx - a.vx, rvy = c.vy - a.vy;
          const rel = rvx * nx + rvy * ny;
          if (rel < 0){
            const imp = -rel * BALL_DAMP;
            a.vx -= imp * nx; a.vy -= imp * ny;
            c.vx += imp * nx; c.vy += imp * ny;
          }
        }
      }
    }
    // pockets
    for (const b of balls){
      if (b.pocketed) continue;
      if (nearPocket(b.x, b.y)){ b.pocketed = true; b.vx = 0; b.vy = 0; b.x = -50; b.y = -50; }
    }
  }

  function allStopped(balls){
    return balls.every(b => b.pocketed || (b.vx === 0 && b.vy === 0));
  }

  function simulate(balls, maxSteps){
    let n = 0;
    while (!allStopped(balls) && n < (maxSteps || 1200)){ step(balls); n++; }
    for (const b of balls){ b.vx = 0; b.vy = 0; }
    return n;
  }

  /* standard-ish rack at 3/4 length, cue at 1/4 */
  function rackPositions(){
    const balls = [];
    balls.push({ id: 0, x: W * 0.25, y: H / 2, vx: 0, vy: 0, pocketed: false }); // cue
    const apex = { x: W * 0.68, y: H / 2 };
    const order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
    let k = 0;
    for (let row = 0; row < 5; row++){
      for (let i = 0; i <= row; i++){
        balls.push({
          id: order[k++],
          x: apex.x + row * (2 * R + 0.06) * 0.87,
          y: apex.y - row * R + i * (2 * R + 0.06),
          vx: 0, vy: 0, pocketed: false
        });
      }
    }
    return balls;
  }

  return { W, H, R, PR, POCKETS, X0, X1, Y0, Y1, step, simulate, allStopped, rackPositions, nearPocket };
});
