#!/usr/bin/env python3
# e2e: chat rooms + realtime + null-crash regression
s = open('test/e2e.js', encoding='utf-8').read()
old = "  /* ============ 7.65 STUCK-ROOM HYGIENE (ALREADY_IN_ROOM fix) ============ */"
new = """  /* ============ 7.6 PUBLIC CHAT ROOMS (غرف السواليف) ============ */
  console.log('— public chat rooms (realtime)');
  r = await api('GET', '/chat/rooms', null, laylaTok);
  T('exactly 10 public chat rooms listed', r.status === 200 && r.j.rooms.length === 10, r.j.rooms && r.j.rooms.length);
  T('rooms are the curated Arabic set', r.j.rooms[0].name.indexOf('العامة') >= 0 && r.j.rooms[9].name.indexOf('حرة') >= 0);
  r = await api('POST', '/chat/rooms/1/messages', { text: 'هلا فيكسورا! أول سالفة 🎮' }, laylaTok);
  T('message posted', r.status === 200 && r.j.msg.text.indexOf('سالفة') >= 0);
  r = await api('POST', '/chat/rooms/1/messages', { text: '' }, laylaTok);
  T('empty message rejected', r.status === 400);
  r = await api('GET', '/chat/rooms/1/messages', null, omarTok);
  T('history readable by others', r.status === 200 && r.j.messages.some(m => m.name === 'Layla_KW'));
  /* realtime: omar receives layla's message through his event stream */
  const cursorNow = (await fetch(B + '/api/rt/poll?cur=99999999999&timeout=1', { headers: { Authorization: 'Bearer ' + omarTok } }).then(x => x.json())).cursor;
  await api('POST', '/chat/rooms/2/messages', { text: 'ترحيب حيّ 🎉' }, laylaTok);
  const omarPoll = await fetch(B + '/api/rt/poll?cur=' + cursorNow + '&timeout=3', { headers: { Authorization: 'Bearer ' + omarTok } }).then(x => x.json());
  const gchatEv = (omarPoll.events || []).find(e => e.type === 'gchat' && e.data.msg.text.indexOf('ترحيب') >= 0);
  T('realtime delivery (gchat event over event stream)', !!gchatEv);
  /* rate limit */
  let limited = false;
  for (let i = 0; i < 10 && !limited; i++){
    const rr = await api('POST', '/chat/rooms/3/messages', { text: 'سبام ' + i }, omarTok);
    if (rr.status === 429) limited = true;
  }
  T('spam rate-limited (429)', limited);
  r = await api('GET', '/chat/rooms', null, omarTok);
  T('rooms show last message + counts', r.j.rooms[1].last && r.j.rooms[1].last.text.indexOf('ترحيب') >= 0 && r.j.rooms[2].msgs >= 8);

  /* null-crash regression: closed-room partial update must keep board arrays */
  {
    const cr = await api('POST', '/api/rooms', { game: 'connect4' }, laylaTok);
    const st = await api('GET', '/api/rooms/' + cr.j.room.id, null, laylaTok);
    T('room state exposes non-null board', Array.isArray(st.j.room.board) && st.j.room.board.length === 6);
  }

  /* ============ 7.65 STUCK-ROOM HYGIENE (ALREADY_IN_ROOM fix) ============ */"""
assert old in s
open('test/e2e.js','w',encoding='utf-8').write(s.replace(old, new))
print('tests ok')
