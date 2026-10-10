import test from 'node:test';
import assert from 'node:assert/strict';
import { f1Outcome, feedOver, sameSession } from '../kit/f1live.mjs';

const feed = (over, { type = 'Race', name = 'Race', part = 0 } = {}) => ({
  session: { type, name, start: '2026-10-11T20:00:00', gmt: '08:00:00', status: over ? 'Finalised' : 'Started' },
  part,
  entries: type === 'Qualifying' ? [22, 16, 10] : [],
  lap: { now: 40, of: 62 },
  cars: [
    { name: 'Max Verstappen', pos: 2 },
    { name: 'George Russell', pos: 1 },
    { name: 'Lando Norris', pos: 3 },
    { name: 'Kimi Antonelli', pos: 4 }
  ]
});
const start = '2026-10-11T12:00:00Z';

test("a race on F1's feed: as it stands while it runs, final the moment it's over", async () => {
  const on = await f1Outcome(async () => feed(false), 'Race', start, Date.parse(start) + 3_600_000);
  assert.equal(on.status, 'pending');
  assert.equal(on.state, 'in');
  assert.equal(on.winner, 'George Russell');
  const done = await f1Outcome(async () => feed(true), 'Race', start, Date.parse(start) + 7_200_000);
  assert.equal(done.status, 'final');
  assert.deepEqual(done.podium, ['George Russell', 'Max Verstappen', 'Lando Norris']);
});

test("another session on the feed: not this one's outcome; its archive once it's there", async () => {
  const quali = feed(false, { type: 'Qualifying', name: 'Qualifying', part: 2 });
  assert.equal(sameSession(quali, 'Race', start), false);
  const got = await f1Outcome(async url => (url.includes('session.json') ? { ...feed(true), final: true } : quali), 'Race', start, Date.parse(start) + 7_200_000);
  assert.equal(got.status, 'final');
  // A qualifying between its parts is not over.
  assert.equal(feedOver({ ...quali, session: { ...quali.session, status: 'Finished' }, message: { text: 'CHEQUERED FLAG' } }), false);
  assert.equal(feedOver({ ...quali, part: 3, session: { ...quali.session, status: 'Finished' } }), true);
});
