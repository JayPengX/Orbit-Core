// A page Wikipedia refuses is not asked again at once (2026-11-18). The kit's read of the CPBL series pages
// (kit/catalog.mjs wikiJson) let a failed read go the moment it failed, so every read of the month asked
// again: four refusals (429) in ten seconds of one opening of Sports. A failure is kept two minutes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { withCpblSeries, cpblSeriesPages } from '../kit/catalog.mjs';

test('a refused Wikipedia page waits two minutes before it is asked again; one that answered, ten', async () => {
  const realFetch = globalThis.fetch;
  const realNow = Date.now;
  let now = Date.parse('2026-10-20T10:00:00Z');
  Date.now = () => now;
  let asked = 0;
  let status = 429;
  globalThis.fetch = async () => (asked++, new Response(JSON.stringify({ parse: { wikitext: '' } }), { status }));
  try {
    // (A month with a play-off game: the only one the series pages are read for.)
    const games = [{ id: 'g1', start: '2026-10-17T10:35:00Z', playoff: true, state: 'pre', home: { en: 'A' }, away: { en: 'B' } }];
    const pages = cpblSeriesPages(2026).length;
    const read = () => withCpblSeries(games, '2026-10');
    assert.equal(await read(), games, 'refused: the games as they were');
    assert.equal(asked, pages);
    for (let i = 0; i < 4; i++) await read();
    assert.equal(asked, pages, 'refused a moment ago: not asked again');
    now += 2 * 60_000 + 1;
    status = 200;
    await read();
    assert.equal(asked, pages * 2, 'two minutes on: asked again');
    now += 9 * 60_000;
    await read();
    assert.equal(asked, pages * 2, 'answered: kept ten minutes');
    now += 60_000 + 1;
    await read();
    assert.equal(asked, pages * 3);
  } finally {
    globalThis.fetch = realFetch;
    Date.now = realNow;
  }
});
