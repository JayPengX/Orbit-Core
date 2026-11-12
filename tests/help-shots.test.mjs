// The 說明 guides' screenshots: every tour stop has its four pictures, and each
// is asked for by its own content's hash, the one the service worker checks a
// ?v= file against (a hash over all four was refused on every phone: Jay's
// Transit guide showed only broken pictures, 2026-11-03).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { TOURS, SHOTS } from '../kit/help.mjs';

const KIT = new URL('../kit/', import.meta.url);
test('every tour stop has its four pictures, each asked by its own hash', async () => {
  for (const [app, { zh, en }] of Object.entries(TOURS)) {
    assert.deepEqual(en.map(s => s[0]), zh.map(s => s[0]), `${app}: the same stops in both languages`);
    for (const [stop] of zh) {
      const v = SHOTS[`${app}/${stop}`]?.split(' ');
      assert.equal(v?.length, 4, `${app}/${stop}: no pictures (node tools/help-shots.mjs ${app})`);
      const names = ['zh.light', 'zh.dark', 'en.light', 'en.dark'];
      for (let i = 0; i < 4; i++) {
        const bytes = await readFile(new URL(`img/help/${app}/${stop}.${names[i]}.webp`, KIT));
        assert.equal(createHash('sha256').update(bytes).digest('hex').slice(0, 12), v[i], `${app}/${stop}.${names[i]}: its hash (node tools/help-shots.mjs --hashes)`);
      }
    }
  }
});

// The English guides name things as the English app does (Money, Edit trip, the
// Legislative Yuan): Chinese only as a gloss in brackets, after the English word.
test('English guides use the English names, Chinese only as a gloss in brackets', async () => {
  const { HELP_ORDER, helpFor, tourFor } = await import('../kit/help.mjs');
  for (const app of HELP_ORDER)
    for (const [id, title, lines] of [...helpFor(app, 'en'), ...tourFor(app, 'en')]) {
      const bare = [title, ...lines].join(' ').replace(/\([^()]*\)/g, '');
      assert.doesNotMatch(bare, /[一-鿿]/, `${app}/${id}: Chinese outside a gloss`);
    }
});
