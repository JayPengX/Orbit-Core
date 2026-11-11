// F1 賽後故事 (builders/f1story.js): the digest code reads from F1's own
// timing of a finished race, and a race told once.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { raceFacts, leadersOf, runF1Stories, storyPath } from '../builders/f1story.js';

const car = (no, name, team, pos, grid, pits, stints, extra = {}) => ({ no, name, team, pos, grid, pits, stints: stints.map(([c, laps]) => ({ c, laps })), laps: 20, ...extra });
const session = {
  session: { type: 'Race' },
  meeting: 'Test Grand Prix',
  weather: { track: 31.4, rain: false },
  lap: { now: 20, of: 20 },
  cars: [
    car('1', 'Lando Norris', 'McLaren', 1, 2, 1, [['MEDIUM', 8], ['HARD', 12]], { pb: { v: '1:20.100', lap: 18, p: 1 } }),
    car('3', 'Max Verstappen', 'Red Bull Racing', 2, 9, 1, [['SOFT', 6], ['HARD', 14]], { gap: '+2.1' }),
    car('16', 'Charles Leclerc', 'Ferrari', 3, 1, 2, [['SOFT', 5], ['MEDIUM', 7], ['SOFT', 8]], { gap: '+5.0' }),
    car('18', 'Lance Stroll', 'Aston Martin', 20, 12, 0, [['HARD', 4]], { retired: true, laps: 4 })
  ],
  places: { 16: [1, 1, 1, 1, 1, 1, 2, 2], 1: [2, 2, 2, 2, 2, 2, 1, 1] },
  control: [{ lap: 4, message: 'SAFETY CAR DEPLOYED' }, { lap: 20, message: 'CHEQUERED FLAG' }]
};

test('who led which laps, by surname and car number', () => {
  assert.deepEqual(leadersOf(session.places, session.cars, 7), ['Leclerc #16 1–5', 'Norris #1 6–7']);
});

test('the digest: result with grids, stops and tyres, climbs, leaders, retirements, safety cars, the fastest lap', () => {
  const f = raceFacts(session, 'Test GP');
  assert.match(f, /^Grand Prix race: Test GP, 20 laps, track 31°C\./);
  assert.match(f, /1 Lando Norris #1 \(McLaren\), from 2, 1 stop: medium 8, hard 12/);
  assert.match(f, /3 Charles Leclerc #16 \(Ferrari\), from 1, 2 stops: soft 5, medium 7, soft 8, \+5\.0/);
  assert.match(f, /Biggest climbs: Max Verstappen #3 9 → 2/);
  assert.match(f, /Retired: Lance Stroll #18 \(lap 4\)/);
  assert.match(f, /Track: lap 4 safety car deployed$/m);
  assert.doesNotMatch(f, /chequered/i, 'a chequered flag is no red flag');
  assert.match(f, /Fastest lap: Lando Norris #1 1:20\.100 on lap 18/);
  assert.equal(raceFacts({ ...session, session: { type: 'Qualifying' } }), null, 'a qualifying has no story');
  assert.ok(f.length < 2400);
});

test('a race over is told once, as points with their drivers named; one with nothing usable twice, then let go', async () => {
  const now = Date.parse('2026-11-09T12:00:00Z');
  const m = new Map([['sports/f1/2026.json', JSON.stringify({ events: [{ name: 'Test GP', competitions: [{ date: '2026-11-08T17:00Z', type: { abbreviation: 'Race' }, status: { type: { name: 'STATUS_FINAL' } } }, { date: '2026-11-08T13:00Z', type: { abbreviation: 'Qual' }, status: { type: { name: 'STATUS_FINAL' } } }] }] })]]);
  const store = { json: async k => (m.has(k) ? JSON.parse(m.get(k)) : null), put: async (k, v) => void m.set(k, JSON.stringify(v)) };
  const asked = [];
  const proxy = async url => (asked.push(url), session);
  let answer = { points: [{ lap: 4, no: '', zh: '安全車出動', en: 'The safety car came out' }, { lap: 6, no: '1', zh: '超前 Leclerc，換硬胎跑完 12 圈', en: 'Passed Leclerc, then 12 laps on hards' }] };
  const env = {
    ANTHROPIC_API_KEY: 'a',
    GEMINI_RELAY: { fetch: async () => new Response([{ type: 'content_block_delta', delta: { type: 'text_delta', text: JSON.stringify(answer) } }, { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: {} }].map(o => `event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`).join('')) }
  };
  const r = await runF1Stories({ store, env, proxy, cap: 10, now, until: Date.now() + 60_000 });
  assert.equal(r.made, 1);
  assert.equal(asked.length, 1, 'only the race read');
  assert.deepEqual(JSON.parse(m.get(storyPath(2026))).races['2026-11-08T17:00Z'], { points: answer.points, cars: { 1: { name: 'Lando Norris' } } });
  assert.equal((await runF1Stories({ store, env, proxy, cap: 10, now, until: Date.now() + 60_000 })).made, 0, 'told once');
  // (A story with a number the digest doesn't have is nothing usable.)
  m.delete(storyPath(2026));
  answer = { points: [{ lap: 6, no: '1', zh: '第 99 圈超前', en: 'Led from lap 99' }, { lap: 7, no: '1', zh: '守住 99 圈', en: 'Held 99 laps' }] };
  await runF1Stories({ store, env, proxy, cap: 10, now, until: Date.now() + 60_000 });
  await runF1Stories({ store, env, proxy, cap: 10, now, until: Date.now() + 60_000 });
  assert.equal(JSON.parse(m.get(storyPath(2026))).races['2026-11-08T17:00Z'], null);
});
