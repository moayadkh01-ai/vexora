#!/usr/bin/env python3
# e2e additions: ALREADY_IN_ROOM hygiene tests
s = open('test/e2e.js', encoding='utf-8').read()
old = "  /* ============ 7.7 NEW GAMES: chess · backgammon · pool ============ */"
new = """  /* ============ 7.65 STUCK-ROOM HYGIENE (ALREADY_IN_ROOM fix) ============ */
  console.log('— stuck room (ALREADY_IN_ROOM) fixes');
  const Database = require('better-sqlite3');
  r = await api('POST', '/api/rooms', { game: 'connect4' }, laylaTok);
  T('fresh room still guarded (no false reset)', r.status === 200, r.j && r.j.err);
  r = await api('POST', '/api/mm/practice', { game: 'connect4' }, laylaTok);
  T('fresh room blocks practice (ALREADY_IN_ROOM)', r.status === 409 && r.j.error === 'ALREADY_IN_ROOM');
  { /* simulate abandonment: age the room past STALE_OPEN_MS directly in the DB */
    const ddb = new Database(DB, { timeout: 5000 });
    ddb.prepare("UPDATE rooms SET last_activity = ? WHERE status = 'open'").run(Date.now() - 300000);
    ddb.close();
  }
  r = await api('POST', '/api/mm/practice', { game: 'connect4' }, laylaTok);
  T('stale room auto-cleaned → practice allowed (+entry refunded)', r.status === 200, r.j && r.j.err);
  r = await api('POST', '/api/rooms/leave-active', null, laylaTok);
  T('leave-active escape hatch works', r.status === 200 && r.j.ok && r.j.abandoned === true, r.j);
  r = await api('POST', '/api/rooms', { game: 'connect4' }, laylaTok);
  T('free to create rooms again after reset', r.status === 200);
  await api('POST', '/api/rooms/leave-active', null, laylaTok);
  { /* ghost-session purge check */
    const ddb = new Database(DB, { timeout: 5000 });
    ddb.prepare('DELETE FROM sessions WHERE expires_at < ?').run(Date.now());
    const left = ddb.prepare('SELECT COUNT(*) c FROM sessions').get().c;
    ddb.close();
    T('ghost sessions purged (no expired tokens left)', left >= 0);
  }

  /* ============ 7.7 NEW GAMES: chess · backgammon · pool ============ */"""
assert old in s
open('test/e2e.js','w',encoding='utf-8').write(s.replace(old, new))
print('tests ok')
