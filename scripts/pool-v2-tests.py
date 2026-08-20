#!/usr/bin/env python3
# e2e: pool v2 (spin, shot clock) + physics sanity
s = open('test/e2e.js', encoding='utf-8').read()
old = """  console.log('— pool8 (physics, server-authoritative)');
  r = await api('POST', '/api/mm/practice', { game: 'pool8' }, laylaTok);
  T('pool8 practice room created', r.status === 200 && r.j.room.game === 'pool8', r.j && r.j.err);
  const plRoom = r.j.room.id;
  r = await api('POST', '/api/rooms/' + plRoom + '/move', { angle: 0, power: 1000 }, laylaTok);
  T('pool8: power out of range rejected', r.status === 400);
  r = await api('POST', '/api/rooms/' + plRoom + '/move', { angle: 0, power: 65 }, laylaTok);
  T('pool8: break shot accepted', r.status === 200, r.j);
  const plState = (await api('GET', '/api/rooms/' + plRoom, null, laylaTok)).j.room;
  T('pool8: balls scattered by physics', Array.isArray(plState.balls) && plState.balls.length === 16, plState.balls && plState.balls.length);
  T('pool8: state exposes groups + aimable', plState.groups && plState.aimable === true);
  await api('POST', '/api/rooms/' + plRoom + '/leave', null, laylaTok);"""
new = """  console.log('— pool8 v2 (physics v2 + spin + shot clock)');
  /* physics v2 unit checks (shared module) */
  const P2 = require('../public/pool-physics');
  {
    const st = { balls: P2.rackPositions() };
    P2.simulate(st.balls, 1400);
    T('pool v2: rack intact before break (no phantom pockets)', st.balls.filter(b => b.pocketed).length === 0);
    const st2 = { balls: P2.rackPositions() };
    st2.balls[0].vx = 6.2; st2.balls[0].vy = 0;      /* hard break */
    const steps = P2.simulate(st2.balls, 1500);
    T('pool v2: break resolves with CCD (no tunneling, stops)', P2.allStopped(st2.balls) && steps > 10, steps);
    T('pool v2: no ball escaped the table', st2.balls.every(b => b.pocketed || (b.x > 0 && b.x < P2.W && b.y > 0 && b.y < P2.H)));
  }
  r = await api('POST', '/api/mm/practice', { game: 'pool8' }, laylaTok);
  T('pool8 practice room created', r.status === 200 && r.j.room.game === 'pool8', r.j && r.j.err);
  const plRoom = r.j.room.id;
  r = await api('POST', '/api/rooms/' + plRoom + '/move', { angle: 0, power: 1000 }, laylaTok);
  T('pool8: power out of range rejected', r.status === 400);
  r = await api('POST', '/api/rooms/' + plRoom + '/move', { angle: 0, power: 65, spin: 1 }, laylaTok);
  T('pool8: break with spin accepted', r.status === 200, r.j);
  const plState = (await api('GET', '/api/rooms/' + plRoom, null, laylaTok)).j.room;
  T('pool8: balls + groups + aimable + pocketed HUD data', Array.isArray(plState.balls) && plState.balls.length === 16 && plState.groups && plState.aimable === true && Array.isArray(plState.pocketed));
  T('pool8: shot clock exposed (9000ms) + turn timestamp', plState.shotClock === 9000 && plState.turnStartedAt > 0);
  /* shot-clock foul: age turnStartedAt past 9s in DB → shot must be rejected as foul */
  {
    const Database = require('better-sqlite3');
    const ddb = new Database(DB, { timeout: 5000 });
    ddb.prepare("UPDATE rooms SET state = json_set(state, '$.turnStartedAt', ?) WHERE id = ?").run(Date.now() - 12000, plRoom);
    ddb.close();
  }
  r = await api('POST', '/api/rooms/' + plRoom + '/move', { angle: 0, power: 40 }, laylaTok);
  T('pool8: shot-clock foul (9s) — turn passes', r.status === 400 && r.j.error === 'SHOT_CLOCK', r.j && r.j.error);
  const after = (await api('GET', '/api/rooms/' + plRoom, null, laylaTok)).j.room;
  T('pool8: after foul the clock restarted for opponent', after.turnStartedAt > Date.now() - 3000 && after.turn === 1, { t: after.turn, ts: after.turnStartedAt });
  await api('POST', '/api/rooms/' + plRoom + '/leave', null, laylaTok);"""
assert old in s
open('test/e2e.js','w',encoding='utf-8').write(s.replace(old, new))
print('pool tests v2 ok')
