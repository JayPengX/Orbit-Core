import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { APP_ORDER, BRANDS, MEDAL_AVATARS } from '../kit/brand.mjs';
import { APPS, MILESTONES } from '../kit/orbit.mjs';
import { HELP_ORDER } from '../kit/help.mjs';

// Jay 10-27: the everyday apps first, Securities last, the same everywhere.
const ORDER = ['match', 'transit', 'weather', 'orbit', 'money', 'vocab', 'beats', 'law', 'stock'];

test('one app order: brand, Pass list, milestones, medals, help, family page', async () => {
  assert.deepEqual(APP_ORDER, ORDER);
  assert.deepEqual(Object.keys(BRANDS), ORDER);
  assert.deepEqual(Object.keys(APPS), ORDER);
  assert.deepEqual(MILESTONES.map(m => m.id), ['pass', ...ORDER]);
  assert.deepEqual(MEDAL_AVATARS.map(m => m.app), ['pass', ...ORDER]);
  assert.deepEqual(HELP_ORDER, ['pass', ...ORDER.filter(a => HELP_ORDER.includes(a))]);
  const page = await readFile(new URL('../site/index.html', import.meta.url), 'utf8');
  const slugs = [...page.matchAll(/class="app" href="\/([a-z]+)\//g)].map(m => m[1]);
  assert.deepEqual(slugs, ORDER.map(id => BRANDS[id].slug));
});
