// Typing in an app inside Orbit, on an iPhone home-screen app (Jay 11-17,
// 問我的帳: "it still leaves a gap sometimes and when you close it it's black
// blank empty"). iOS 26/27 shrinks Orbit's window to the room above the keys
// while they're up, gives it back late as they go, and at times 59 px short
// (WebKit's viewport stuck after the keys); the keys change height (emoji,
// the suggestions row, another language's). Played here in a real page: the
// window resized as iOS does, the home bar's 34 px reported all along.
// Before the fix: the field stood 58 px off the keys, 102 px after the keys
// changed; the frame shrank to the top half as the field was let go (black
// under it); a form sheet stayed a screen tall and empty once the keys went.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { extname, join } from 'node:path';

let chromium = null;
try {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
} catch {}

const ROOT = new URL('../', import.meta.url).pathname;
const hostCss = [...readFileSync(join(ROOT, 'site/app/index.html'), 'utf8').matchAll(/<style>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n');
const HEAD = '<script type="importmap">{"imports":{"#kit/":"/kit/"}}</script><link rel="stylesheet" href="/kit/orbit.css">';
const HOST = `<!doctype html><html lang="zh-Hant" data-look="native"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">${HEAD}<style>${hostCss}</style></head>
<body><div class="q-suite-frames" id="frames"></div><script type="module">
sessionStorage.setItem('orbit.suite', '1');
document.documentElement.classList.add('q-suite-host');
// (The iPhone's safe area as it reports it, keys up or not: the home bar's 34 px.)
const gcs = getComputedStyle;
globalThis.getComputedStyle = (el, p) => (el?.style?.cssText?.includes('safe-area-inset-top') ? { paddingTop: '0px', paddingRight: '0px', paddingBottom: '34px', paddingLeft: '0px' } : gcs(el, p));
const suite = await import('/kit/suite.mjs');
suite.host(document.getElementById('frames'), { first: { app: 'money', url: '/money/' } });
</script></body></html>`;
const APP = `<!doctype html><html lang="zh-Hant" data-app="money" data-look="native"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">${HEAD}
<style>.mn-ask-foot { padding-top: 8px; padding-bottom: calc(8px + env(safe-area-inset-bottom)); } .probe { position: fixed; padding-bottom: env(safe-area-inset-bottom); }</style></head>
<body><i class="probe"></i><main><div style="height:1600px">page</div></main><nav id="tabs" class="q-tabbar" role="tablist"></nav><script type="module">
import { tabBar } from '/kit/orbit.mjs';
import { h, sheet } from '/kit/ui.mjs';
import { aiBar } from '/kit/ai.mjs';
tabBar({ tabs: ['home', 'list', 'more'].map(id => ({ id, label: id, icon: 'home' })), onSelect: () => {} });
// 問我的帳: a large sheet, its field in its foot (an app's own foot, padded for the home bar).
globalThis.ask = () => {
  const bar = aiBar({ placeholder: '問你的帳…' });
  const foot = h('div', { class: 'q-sheet-foot mn-ask-foot' }, [bar]);
  sheet({ title: '問我的帳', detent: 'large', body: [h('p', { class: 'hint', style: 'margin:0', text: '從你的帳算' }), ...Array.from({ length: 12 }, (_, i) => h('p', { style: 'height:50px', text: 'answer ' + i }))], foot });
  bar.input.focus();
};
// 記一筆: a sheet as tall as what's in it, a field in its body, a button in its foot.
globalThis.form = () => {
  const f = h('input', { class: 'q-field', type: 'text', placeholder: '備註' });
  sheet({ title: '記一筆', body: [h('div', { style: 'height:220px' }), f], foot: h('div', { class: 'q-sheet-foot' }, [h('button', { class: 'q-btn primary block', type: 'button', text: '儲存' })]) });
  f.focus();
};
globalThis.ready = true;
</script></body></html>`;
const TYPES = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

test("typing in Orbit on an iPhone: the field 12 px off the keys whatever their height, and the app never shrinks or goes blank as they go", async t => {
  if (!chromium || !existsSync(chromium.executablePath())) return t.skip('no Chromium here');
  const server = createServer((req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    if (path === '/app/') return res.writeHead(200, { 'content-type': 'text/html' }).end(HOST);
    if (path === '/money/') return res.writeHead(200, { 'content-type': 'text/html' }).end(APP);
    const file = join(ROOT, 'kit', path.replace(/^\/kit\//, ''));
    if (!path.startsWith('/kit/') || !existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
  });
  await new Promise(ok => server.listen(0, ok));
  const browser = await chromium.launch();
  const [W, H, K] = [393, 793, 396];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  try {
    for (const which of ['ask', 'form']) {
      const ctx = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true, isMobile: true });
      await ctx.route(/^https?:\/\/(?!localhost)/, r => r.abort());
      const page = await ctx.newPage();
      await page.goto(`http://localhost:${server.address().port}/app/`);
      await page.waitForFunction(() => document.querySelector('.q-suite-frame')?.contentWindow?.ready);
      const app = page.frames().find(f => f.url().endsWith('/money/'));
      // What the screen shows, in Orbit's window: the frame, and the sheet's lowest control.
      const look = () =>
        page.evaluate(() => {
          const fr = document.querySelector('.q-suite-frame');
          const f = fr.getBoundingClientRect();
          const d = fr.contentDocument;
          const low = d.querySelector('dialog[open] .q-ai-bar, dialog[open] .q-sheet-foot .q-btn')?.getBoundingClientRect();
          const s = d.querySelector('dialog[open]')?.getBoundingClientRect();
          const inset = parseFloat(fr.contentWindow.getComputedStyle(d.querySelector('.probe')).paddingBottom);
          // (Right above the keys: the foot's own colour, never what scrolled under it.)
          const under = d.elementFromPoint(20, visualViewport.height - 4 - f.top);
          const bare = Boolean(d.querySelector('dialog[open] > .q-sheet-foot')) && document.documentElement.clientHeight < innerHeight + 1 && visualViewport.height < f.height - 80 && !under?.closest('.q-sheet-foot');
          return { keys: Math.round(visualViewport.offsetTop + visualViewport.height), frame: [Math.round(f.top), Math.round(f.bottom)], low: Math.round(low.bottom + f.top), sheet: Math.round(s.height), inset, bare, under: under?.className || under?.tagName };
        });
      const keys = async h => (await page.setViewportSize({ width: W, height: h }), await wait(300));
      await app.evaluate(w => globalThis[w](), which);
      await wait(600);
      const opened = await look();
      assert.equal(opened.inset, 34, 'the app is told the home bar');
      for (const k of [K, K + 44, K]) {
        await keys(H - k);
        const r = await look();
        assert.deepEqual(r.frame, [0, H], `${which}, keys ${k}: the app keeps the whole screen`);
        assert.ok(r.low <= r.keys - 8 && r.low >= r.keys - 16, `${which}, keys ${k}: its foot 8-16 px off the keys, not ${r.keys - r.low}`);
        assert.equal(r.inset, 0, `${which}, keys ${k}: no gap for the home bar under the keys`);
        assert.equal(r.bare, false, `${which}, keys ${k}: between the foot and the keys, ${r.under} showed`);
      }
      // ✓: the field let go, the window given back late (and then once 59 px short).
      for (const back of [H, H - 59]) {
        await app.evaluate(() => document.activeElement.blur());
        await wait(150);
        let r = await look();
        assert.deepEqual(r.frame, [0, H], `${which}: as the keys go, the app keeps the whole screen (no black under it)`);
        await keys(back);
        r = await look();
        assert.deepEqual(r.frame, [0, H], `${which}: window back ${H - back} px short, the app still the whole screen`);
        assert.ok(Math.abs(r.sheet - opened.sheet) <= 2, `${which}: the sheet as tall as it opened (${opened.sheet}), not ${r.sheet}`);
        assert.equal(r.inset, 34, `${which}: the home bar's gap back`);
        await app.evaluate(() => document.querySelector('dialog[open] :is(textarea, input)').focus());
        await keys(H - K);
      }
      // ✕ with the keys up: the sheet gone, the page and its tab bar back whole.
      await app.evaluate(() => document.querySelector('dialog[open] [data-q-close]').click());
      await wait(150);
      await keys(H);
      await wait(400);
      const shut = await page.evaluate(() => {
        const fr = document.querySelector('.q-suite-frame');
        const d = fr.contentDocument;
        const tabs = d.getElementById('tabs');
        return { open: Boolean(d.querySelector('dialog[open]')), up: d.documentElement.classList.contains('q-kb'), tabs: getComputedStyle(tabs).visibility, bottom: Math.round(fr.getBoundingClientRect().bottom) };
      });
      assert.deepEqual(shut, { open: false, up: false, tabs: 'visible', bottom: H }, `${which}: closed while typing`);
      await ctx.close();
    }
    // A short phone (320×548): the title and ✕ wait behind the keys, and the
    // first line starts clear of the grabber (it lay across 從你的帳算).
    {
      const [w, h, k] = [320, 548, 253];
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, hasTouch: true, isMobile: true });
      await ctx.route(/^https?:\/\/(?!localhost)/, r => r.abort());
      const page = await ctx.newPage();
      await page.goto(`http://localhost:${server.address().port}/app/`);
      await page.waitForFunction(() => document.querySelector('.q-suite-frame')?.contentWindow?.ready);
      const app = page.frames().find(f => f.url().endsWith('/money/'));
      await app.evaluate(() => globalThis.ask());
      await wait(600);
      await page.setViewportSize({ width: w, height: h - k });
      await wait(400);
      const r = await app.evaluate(() => {
        const d = document.querySelector('dialog[open]');
        const g = getComputedStyle(d, '::before');
        return { head: getComputedStyle(d.querySelector('.q-sheet-head')).display, grabber: d.getBoundingClientRect().top + parseFloat(g.marginTop) + parseFloat(g.height), first: d.querySelector('p.hint').getBoundingClientRect().top };
      });
      assert.equal(r.head, 'none', 'a short phone: the title waits behind the keys');
      assert.ok(r.first >= r.grabber + 6, `a short phone: the first line ${Math.round(r.first - r.grabber)} px under the grabber, not under it`);
      await ctx.close();
    }
  } finally {
    await browser.close();
    server.close();
  }
});

test('the keys cover the home bar: in a frame its inset is 0 while they are up', () => {
  const css = readFileSync(join(ROOT, 'kit/orbit.css'), 'utf8');
  assert.match(css, /html\.q-kb \{\s*--q-inset-bottom: 0px;/);
  assert.match(css, /html\.q-kb dialog\.q-sheet\[open\]:has\(> \.q-sheet-foot\) \{\s*padding-bottom: var\(--q-kb\);/);
  assert.match(css, /html\.q-kb dialog\.q-sheet\[open\] > \.q-sheet-foot \{\s*padding-bottom: 12px;/);
});
