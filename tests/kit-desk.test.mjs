// A computer's frame (Jay 2026-11-06, his laptop: "you make it good on phone
// and ipad, then the first time I open on my laptop is like this"): the rail
// floated as a pill beside a narrow page and the account was a second pill
// stranded at the foot. With a mouse or a trackpad and 1000 px or more
// (html.q-desk), the rail is the page's side bar: down the whole left edge,
// the app's name at its top, the tabs as rows, the account at its foot, the
// page beside it. An iPad (touch) keeps its rail. Checked in a real page
// (Chromium) where one is here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';

const css = readFileSync(new URL('../kit/orbit.css', import.meta.url), 'utf8');
const mjs = readFileSync(new URL('../kit/orbit.mjs', import.meta.url), 'utf8');
let chromium = null;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {}

test('a computer is a mouse or a trackpad and 1000 px; its side bar is as wide in code as in CSS', () => {
  assert.match(mjs, /const desk = w >= 1000 && Boolean\(globalThis\.matchMedia\?\.\('\(hover: hover\) and \(pointer: fine\)'\)\.matches\)/);
  assert.match(mjs, /\['desk', 'q-desk'\]/);
  const w = Number(/const DESK_W = (\d+);/.exec(mjs)?.[1]);
  assert.equal(Number(/--q-desk-w:\s*(\d+)px/.exec(css)?.[1]), w);
});

const KIT = new URL('../kit/', import.meta.url).pathname;
const TYPES = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png' };
const PAGE = `<!doctype html><html lang="zh-Hant" data-app="match" data-look="native"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="stylesheet" href="/kit/orbit.css"></head>
<body><header class="q-appbar"><div class="q-appbar-inner"><div class="q-brand"><div class="q-brand-text"><h1 id="title">Orbit Sports</h1></div></div>
<nav id="tabs" class="q-tabbar" role="tablist"></nav><div id="top-actions" class="q-actions"><button class="q-icon-btn" id="refresh">↻</button><button class="q-account" title="Orbit Pass"><span class="q-avatar" style="display:block;width:36px"></span></button></div></div></header>
<main id="page" style="height:2000px">page</main>
<script type="module">
import { tabBar, screenFit } from '/kit/orbit.mjs';
tabBar({ tabs: ['home', 'matches', 'live', 'following'].map(id => ({ id, label: id, icon: 'home' })), onSelect: () => {}, action: { label: '新增', onTap: () => {} } });
globalThis.ready = screenFit();
</script></body></html>`;

test('in a page: the side bar down the left edge on a computer, the rail on an iPad', async t => {
  if (!chromium || !existsSync(chromium.executablePath())) return t.skip('no Chromium here');
  const server = createServer((req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    if (path === '/') return res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
    const file = join(KIT, path.replace(/^\/kit\//, ''));
    if (!path.startsWith('/kit/') || !existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
  });
  await new Promise(ok => server.listen(0, ok));
  const url = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch();
  const look = async ctx => {
    const page = await ctx.newPage();
    await page.goto(url);
    await page.waitForFunction(() => globalThis.ready && document.querySelector('.q-tab'));
    await page.waitForTimeout(100);
    return page.evaluate(() => {
      const box = sel => document.querySelector(sel).getBoundingClientRect().toJSON();
      return { cls: document.documentElement.className, nav: box('#tabs'), tabs: [...document.querySelectorAll('.q-tab')].map(b => b.getBoundingClientRect().toJSON()), act: box('.q-tab-action'), actions: box('#top-actions'), body: box('#page'), name: getComputedStyle(document.querySelector('#tabs'), '::after').content, w: innerWidth, h: innerHeight };
    });
  };
  try {
    for (const [width, height] of [[1280, 800], [1920, 1080], [1120, 560]]) {
      const ctx = await browser.newContext({ viewport: { width, height } });
      const r = await look(ctx);
      await ctx.close();
      const at = `${width}×${height}`;
      assert.match(r.cls, /q-desk/, at);
      assert.deepEqual([r.nav.left, r.nav.top, Math.round(r.nav.height)], [0, 0, r.h], `${at}: the side bar is the whole left edge`);
      assert.equal(r.nav.width, 224, at);
      assert.equal(r.name, '"Orbit Sports"', `${at}: headed by the app's name`);
      // The tabs are rows: wider than tall, one under another, inside the bar.
      for (const [i, b] of r.tabs.entries()) {
        assert.ok(b.width > 3 * b.height, `${at}: tab ${i} is a row`);
        assert.ok(b.left >= r.nav.left && b.right <= r.nav.right, `${at}: tab ${i} inside the bar`);
        if (i) assert.ok(b.top >= r.tabs[i - 1].bottom, `${at}: tab ${i} under the one before`);
      }
      assert.ok(r.tabs[0].top >= 60, `${at}: the tabs under the app's name`);
      assert.ok(r.act.top >= r.tabs.at(-1).bottom && r.act.right <= r.nav.right, `${at}: the action a row under the tabs`);
      assert.ok(r.actions.left >= r.nav.left && r.actions.right <= r.nav.right && r.actions.bottom <= r.h && r.actions.bottom > r.h - 80, `${at}: the account at the bar's foot, inside it`);
      assert.ok(r.actions.top > r.act.bottom, `${at}: the foot clear of the tabs`);
      assert.ok(r.body.left >= r.nav.right + 16, `${at}: the page beside the bar, never under it`);
    }
    // An iPad on its side (touch): the rail it had, no side bar.
    const ipad = await browser.newContext({ viewport: { width: 1180, height: 820 }, hasTouch: true, isMobile: true });
    const r = await look(ipad);
    await ipad.close();
    assert.doesNotMatch(r.cls, /q-desk/);
    assert.match(r.cls, /q-tabrail/);
    assert.ok(r.nav.left > 0 && r.nav.top > 0 && r.nav.height < r.h - 100, 'the iPad keeps its floating rail');
  } finally {
    await browser.close();
    server.close();
  }
});
