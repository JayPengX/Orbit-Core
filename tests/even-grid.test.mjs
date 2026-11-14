// Grids of tiles keep even rows (kit/ui.mjs evenCols; Jay 2026-11-14).
import test from 'node:test';
import assert from 'node:assert/strict';
import { evenCols } from '../kit/ui.mjs';

const rows = (n, c) => Array.from({ length: Math.ceil(n / c) }, (_, i) => Math.min(c, n - i * c));

test('ten apps are five by two however wide, two by five when five cannot fit', () => {
  for (const fit of [5, 6, 9, 12, 20]) assert.equal(evenCols(10, fit, 5), 5, String(fit));
  assert.equal(evenCols(10, 4, 5), 2);
});

test('never a lonely last row: it holds at least half a row', () => {
  for (let n = 1; n <= 14; n++)
    for (let fit = 2; fit <= 12; fit++)
      for (const max of [5, 6]) {
        const c = evenCols(n, fit, max);
        const r = rows(n, c);
        assert.ok(c <= Math.max(1, Math.min(fit, max, n)), `${n} ${fit} ${max}`);
        if (r.length > 1) assert.ok(r.at(-1) >= Math.ceil(c / 2), `${n} in ${fit}/${max}: ${r}`);
      }
});

test('twelve icons are six by two, or four by three when six cannot fit', () => {
  assert.equal(evenCols(12, 9, 6), 6);
  assert.equal(evenCols(12, 5, 6), 4);
});
