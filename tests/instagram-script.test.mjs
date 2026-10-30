// Orbit Instagram (site/ig/orbit-instagram.user.js): which pages it turns away.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const src = await readFile(new URL('../site/ig/orbit-instagram.user.js', import.meta.url), 'utf8');
const box = {};
vm.runInNewContext(src, { globalThis: box });
const { redirectFor, exploreGrid } = box.OrbitInstagram;

test('the Reels tab goes home and a profile\'s Reels tab goes to the profile', () => {
  assert.equal(redirectFor('/reels/'), '/');
  assert.equal(redirectFor('/reels/C9xYz/'), '/');
  assert.equal(redirectFor('/reels'), '/');
  assert.equal(redirectFor('/jaypengx/reels/'), '/jaypengx/');
});

test('friends, messages, stories, search and a reel sent in a chat stay', () => {
  for (const p of ['/', '/direct/inbox/', '/direct/t/123/', '/stories/friend/345/', '/explore/', '/explore/search/', '/explore/tags/hsinchu/', '/friend/', '/p/abc/', '/reel/abc/', '/accounts/edit/'])
    assert.equal(redirectFor(p), null, p);
});

test('only the Explore page and its search hide their grid', () => {
  assert.ok(exploreGrid('/explore/'));
  assert.ok(exploreGrid('/explore'));
  assert.ok(exploreGrid('/explore/search/'));
  assert.ok(!exploreGrid('/explore/tags/hsinchu/'));
  assert.ok(!exploreGrid('/'));
});

test('the header says where updates come from and what it runs on', () => {
  assert.match(src, /@match\s+https:\/\/www\.instagram\.com\/\*/);
  assert.match(src, /@updateURL\s+https:\/\/orbit\.jaypengx\.com\/Orbit-Core\/ig\/orbit-instagram\.user\.js/);
});
