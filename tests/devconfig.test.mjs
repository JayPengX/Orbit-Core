import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEV, cleanDev } from '../kit/devconfig.mjs';
import { freshFor } from '../sports-proxy-worker.js';

test('developer settings: each in range, a bad or missing one its default', () => {
  const d = cleanDev({ sportsGame: 1, sportsList: '30', f1Board: 'x', mirror: 'no', extra: 5 });
  assert.equal(d.sportsGame, DEV.sportsGame.min);
  assert.equal(d.sportsList, 30);
  assert.equal(d.f1Board, DEV.f1Board.def);
  assert.equal(d.mirror, true);
  assert.equal('extra' in d, false);
  assert.deepEqual(cleanDev(), Object.fromEntries(Object.entries(DEV).map(([k, s]) => [k, s.def])));
});

test("the proxy's live cache: the seconds set, or half the source's max-age, and a game over its hours", () => {
  const live = { tier: 'live', fresh: 10 };
  const settings = cleanDev({ proxyLive: 2, proxyFinalH: 12 });
  assert.equal(freshFor(live, { maxAge: 10 }, settings), 2);
  assert.equal(freshFor(live, { maxAge: 10 }, { ...settings, proxyLive: 0 }), 5);
  assert.equal(freshFor(live, { maxAge: 4 }, { ...settings, proxyLive: 0 }), 2);
  assert.equal(freshFor(live, {}, { ...settings, proxyLive: 0 }), 10, 'no max-age: the tier its own');
  assert.equal(freshFor(live, { final: true }, settings), 12 * 3600);
  assert.equal(freshFor({ tier: 'standings', fresh: 1800 }, { maxAge: 10 }, settings), 1800, 'only live answers follow');
});
