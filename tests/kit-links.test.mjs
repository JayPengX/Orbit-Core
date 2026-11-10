// Links out of a Home Screen app (Jay 2026-11-10: "link opened from the add
// to home screen app … directly to safari app instead of a pop up?", then
// "sometimes I want the quick view … you decide how it works across the
// app"): iOS's quick view stays the default; the Pass sheet's switch sends
// every app's links to the Safari app (x-safari-https://), following the
// pass. Links into another app (YouTube, Maps, 高鐵's T Express) are iOS's
// either way, and nothing changes outside a Home Screen app.
import { test } from 'node:test';
import assert from 'node:assert/strict';

const store = new Map();
globalThis.localStorage = { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) };
const kit = await import('../kit/orbit.mjs');

test('links: Safari’s own address only when chosen, in a Home Screen app, for another site that opens no app', () => {
  const at = { home: true, way: 'safari', here: 'https://orbit.jaypengx.com' };
  const story = 'https://news.ltn.com.tw/news/politics/breakingnews/1';
  assert.equal(kit.linkHref(story, at), `x-safari-${story}`);
  assert.equal(kit.linkHref('http://example.com/a', at), 'x-safari-http://example.com/a');
  assert.equal(kit.linkHref(story, { ...at, way: 'quick' }), story, 'the quick view: iOS’s own');
  assert.equal(kit.linkHref(story, { ...at, home: false }), story, 'a browser tab already opens a tab');
  assert.equal(kit.linkHref('https://orbit.jaypengx.com/sports/#g=1', at), 'https://orbit.jaypengx.com/sports/#g=1', 'our own pages stay ours');
  for (const app of ['https://www.youtube.com/watch?v=x', 'https://youtu.be/x', 'https://m.youtube.com/watch?v=x', 'https://apps.apple.com/app/id468963664', 'https://www.google.com/maps/dir/?api=1', 'https://maps.app.goo.gl/x', 'https://ets.thsrc.com.tw/queryTrain?s=1'])
    assert.equal(kit.linkHref(app, at), app, `${app}: its app opens it`);
  assert.equal(kit.linkHref('https://www.google.com/search?q=x', at), 'x-safari-https://www.google.com/search?q=x', 'Google, not its Maps');
  for (const other of ['tel:0912345678', 'mailto:a@b.c', 'eltatv://live/101', '#tw', ''])
    assert.equal(kit.linkHref(other, at), other);
});

test('links: the choice kept on the device, the pass’s newer one taken, sent up with the time it was made', () => {
  store.clear();
  assert.equal(kit.linkWay(), 'quick', 'the quick view by default');
  const sent = [];
  const s = { write: async x => sent.push(x) };
  assert.equal(kit.setLinkWay('safari', s), 'safari');
  assert.equal(kit.linkWay(), 'safari');
  assert.equal(sent[0].wallet.settings.links.value, 'safari');
  const t = sent[0].wallet.settings.links.t;
  assert.equal(kit.adoptLinkWay({ settings: { links: { value: 'quick', t: t - 1 } } }), false, 'an older pass copy never wins');
  assert.equal(kit.linkWay(), 'safari');
  assert.equal(kit.adoptLinkWay({ settings: { links: { value: 'quick', t: t + 1 } } }), true);
  assert.equal(kit.linkWay(), 'quick');
  kit.setLinkWay('nonsense');
  assert.equal(kit.linkWay(), 'quick');
});
