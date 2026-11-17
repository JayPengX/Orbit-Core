// An iPhone turned on its side and back upright, in Orbit's window (Jay 11-17: the app sank below the screen's
// foot until opened again). On its side the status bar is hidden; turning back, iOS gives the whole screen's
// height for a moment (852) before the bar takes its room (793). Played here in a real page: Orbit's frame ends
// the window's own height, not that moment's.
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
const suite = await import('/kit/suite.mjs');
suite.host(document.getElementById('frames'), { first: { app: 'money', url: '/money/' } });
</script></body></html>`;
const APP = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body>app</body></html>`;
const TYPES = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

test('turned on its side and back upright: Orbit’s frame is the window’s height again, never the moment’s taller one', async t => {
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
  try {
    const ctx = await browser.newContext({ viewport: { width: 393, height: 793 }, hasTouch: true, isMobile: true });
    await ctx.route(/^https?:\/\/(?!localhost)/, r => r.abort());
    const page = await ctx.newPage();
    await page.goto(`http://localhost:${server.address().port}/app/`);
    await page.waitForSelector('.q-suite-frame');
    const frameH = () => page.evaluate(() => Math.round(document.querySelector('.q-suite-frames').getBoundingClientRect().height));
    await page.waitForTimeout(300);
    assert.equal(await frameH(), 793, 'upright');
    const turn = async (w, h) => {
      await page.setViewportSize({ width: w, height: h });
      await page.evaluate(() => dispatchEvent(new Event('orientationchange')));
    };
    await turn(852, 393);
    await page.waitForTimeout(1800);
    // Back upright: the whole screen for a moment, then the status bar takes its room.
    await turn(393, 852);
    await page.waitForTimeout(100);
    await page.setViewportSize({ width: 393, height: 793 });
    await page.waitForTimeout(1800);
    assert.equal(await frameH(), 793, 'the window’s height, not the moment’s 852');
  } finally {
    await browser.close();
    server.close();
  }
});
