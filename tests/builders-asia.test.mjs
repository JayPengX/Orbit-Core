import { test } from 'node:test';
import assert from 'node:assert/strict';

test("CPBL's month whole: every day read, one at a time; a day refused asked again; a day never read leaves it not whole", async () => {
  const { cpblMonthWhole } = await import('../builders/asia.js');
  const parse = data => data.events;
  const asked = [];
  const ok = events => new Response(JSON.stringify({ events }), { status: 200 });
  const refusedOnce = new Set(['2026-02-03']);
  const get = async url => {
    const d = new URL(url).searchParams.get('d');
    asked.push(d);
    if (refusedOnce.delete(d)) return new Response('', { status: 429 });
    return ok(d === '2026-02-05' ? [{ id: 'b', start: '2026-02-05T10:35:00Z' }, { id: 'a', start: '2026-02-05T05:05:00Z' }] : []);
  };
  const month = await cpblMonthWhole('2026-02', { day: 'https://x/eventsday.php', league: '5111', parse, get, sleep: async () => {} });
  assert.equal(new Set(asked).size, 28);
  assert.equal(asked.filter(d => d === '2026-02-03').length, 2);
  assert.deepEqual(month, { league: 'cpbl', month: '2026-02', games: [{ id: 'a', start: '2026-02-05T05:05:00Z' }, { id: 'b', start: '2026-02-05T10:35:00Z' }], whole: 1 });
  const never = await cpblMonthWhole('2026-02', { day: 'https://x/e', league: '5111', parse, get: async url => (new URL(url).searchParams.get('d') === '2026-02-10' ? new Response('', { status: 500 }) : ok([])), sleep: async () => {} });
  assert.equal(never.whole, undefined);
});
