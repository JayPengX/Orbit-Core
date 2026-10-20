import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plNames, fotmobTeams, fotmobNames, fotmobReader, fotmobLeague, runPhotos, jobsOf, PHOTO_JOBS, clubMatches, sameNameish } from '../builders/photos.js';

test("the Premier League's players under each name ESPN may use, trialists left out", () => {
  const list = [
    { name: { display: 'Trialist 1', first: 'Trialist', last: '1' }, altIds: { opta: 'p244719' } },
    { name: { display: 'Max Aarons', first: 'Max', middle: 'James', last: 'Aarons' }, altIds: { opta: 'p232980' } },
    { name: { display: 'Gabriel', first: 'Gabriel', last: 'dos Santos Magalhães' }, altIds: { opta: 'p226597' } },
    { name: { display: 'Gabriel', first: 'Gabriel', last: 'Jesus' }, altIds: { opta: 'p205651' } },
    { name: { display: 'No Id' }, altIds: {} }
  ];
  assert.deepEqual(plNames(list), [['Max Aarons', 232980], ['Max James Aarons', 232980], ['Gabriel dos Santos Magalhães', 226597], ['Gabriel Magalhães', 226597], ['Gabriel Jesus', 205651]]);
});

test('two players with one name: the one at a club in the league this season', () => {
  const list = [
    { name: { display: 'Ben Davies', first: 'Ben', last: 'Davies' }, altIds: { opta: 'p1' }, currentTeam: { name: 'Rangers' } },
    { name: { display: 'Ben Davies', first: 'Ben', last: 'Davies' }, altIds: { opta: 'p2' }, currentTeam: { name: 'Tottenham Hotspur' } }
  ];
  assert.deepEqual(plNames(list, new Set(['Tottenham Hotspur'])), [['Ben Davies', 2]]);
  assert.deepEqual(plNames(list), []);
});

test("a FotMob league's teams: its tables' (this season), a cup without one its games'", () => {
  const league = { table: [{ data: { tables: [{ table: { all: [{ id: 1, name: 'France', played: 2 }, { id: 2, name: 'Italy', played: 2 }] } }] } }], fixtures: { allMatches: [{ home: { id: 9, name: 'Old' }, away: { id: 8, name: 'Older' } }] } };
  assert.deepEqual([...fotmobTeams(league).keys()], [1, 2]);
  assert.deepEqual([...fotmobTeams({ fixtures: league.fixtures }).keys()], [9, 8]);
});

test("a squad's players under each name ESPN may use, no coach, a shared name left out", () => {
  const squads = [
    { squad: [{ title: 'coach', members: [{ id: 1, name: 'Enzo Maresca' }] }, { title: 'defenders', members: [{ id: 2, name: "Evan N'Dicka" }, { id: 3, name: 'Woo-yeong Jeong' }, { id: 4, name: 'Gabriel' }] }] },
    { squad: [{ title: 'attackers', members: [{ id: 5, name: 'Gabriel' }, { id: 6, name: 'João Pedro Junqueira de Jesus' }] }] }
  ];
  assert.deepEqual(fotmobNames(squads), [
    ["Evan N'Dicka", 2],
    ['Evan NDicka', 2],
    ["N'Dicka Evan", 2],
    ['Woo-yeong Jeong', 3],
    ['Wooyeong Jeong', 3],
    ['Jeong Woo-yeong', 3],
    ['João Pedro Junqueira de Jesus', 6],
    ['João Jesus', 6]
  ]);
});

test('FotMob is asked gently: one at a time a gap apart, a minute after "too many", and not again after a second', async () => {
  const slept = [];
  let n = 0;
  const reader = fotmobReader(async () => (++n <= 2 ? { status: 429 } : { status: 200, data: { ok: n } }), { at: 3, gap: 400, wait: 60_000 }, async ms => void slept.push(ms));
  await assert.rejects(reader.read('/teams?id=1'), /too many/);
  assert.deepEqual(slept, [400, 60_000, 400]);
  assert.equal(reader.stopped(), true);
  await assert.rejects(reader.read('/teams?id=2'), /too many/);
  assert.equal(n, 2, 'nothing asked once stopped');
});

test("a league's faces from FotMob: every club's squad; a league FotMob couldn't give is null (its last list kept)", async () => {
  const league = id => ({ table: [{ data: { table: { all: [1, 2, 3, 4].map(t => ({ id: id * 10 + t, name: `T${t}`, played: 1 })) } } }] });
  const fetchJson = async url => {
    if (url.includes('/leagues?id=55')) return { status: 200, data: league(55) };
    if (url.includes('/leagues?id=54')) return { status: 500 };
    const id = Number(url.split('id=')[1]);
    return { status: 200, data: { squad: { squad: [{ title: 'keepers', members: [{ id: id * 100, name: `Keeper ${id}` }] }] } } };
  };
  const o = { fetchJson, pace: { at: 2, gap: 0, wait: 0 }, sleep: async () => {} };
  const seriea = await fotmobLeague([55], [], o);
  assert.equal(new Set(seriea.map(([, id]) => id)).size, 4);
  await assert.rejects(fotmobLeague([54], [], o));
});

test('the photo lists in turn: a few a day, every one about weekly; a list unread keeps the last', async () => {
  assert.equal(new Set(Array.from({ length: Math.ceil(PHOTO_JOBS.length / 4) }, (_, d) => jobsOf(d * 86_400_000)).flat()).size, PHOTO_JOBS.length);
  assert.ok(PHOTO_JOBS.length / 4 <= 7);
  const { r2Store } = await import('../builders/store.js');
  const { memoryBucket } = await import('./fixtures/bucket.mjs');
  const store = r2Store(memoryBucket({ 'sports/laliga/photos.json': { built: 'x', players: [['Kept', 'u']] } }));
  const real = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 500 });
  try {
    const done = await runPhotos({ store, proxy: async () => null, jobs: ['laliga'], now: Date.parse('2026-10-13T18:17:00Z') });
    assert.equal(done.laliga, 'kept');
    assert.deepEqual((await store.json('sports/laliga/photos.json')).players, [['Kept', 'u']]);
  } finally {
    globalThis.fetch = real;
  }
});

test('a name ESPN spells otherwise is the same player only in their own club, when one alone fits', () => {
  assert.ok(sameNameish('pio esposito', 'francesco pio esposito'));
  assert.ok(sameNameish('matt edwards', 'matthew edwards'));
  assert.ok(sameNameish('bremer', 'gleison bremer'));
  assert.ok(sameNameish('laurtaro giaccone', 'lautaro giaccone'));
  assert.ok(!sameNameish('riccardo radu', 'dragusin radu'));
  assert.ok(!sameNameish('ben davies', 'tom davies'));
  const roma = { squad: [{ title: 'defenders', members: [{ id: 1, name: 'Mile Svilar' }, { id: 2, name: 'Gianluca Mancini' }, { id: 3, name: 'Bryan Cristante' }, { id: 4, name: 'Francesco Pio Esposito' }, { id: 5, name: 'Matthew Smith' }, { id: 6, name: 'Matthew Jones' }] }] };
  const other = { squad: [{ title: 'attackers', members: [{ id: 9, name: 'Sebastiano Esposito' }] }] };
  const espn = [['Mile Svilar', 'Gianluca Mancini', 'Bryan Cristante', 'Pio Esposito', 'Matt Smith', 'Matt Jones', 'Matt Brown']];
  assert.deepEqual(clubMatches([other, roma], espn), [['Pio Esposito', 4], ['Matt Smith', 5], ['Matt Jones', 6]]);
  assert.deepEqual(clubMatches([roma], [['Mile Svilar', 'Pio Esposito']]), [], 'a club found by two names is no club');
});
