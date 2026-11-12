// The network capsule on the real site, where the proxy answers under the
// page's own address (orbit.<domain>/api/…): its calls are the connection
// (2026-11-12: they were taken for the page's own files and never counted, so
// Wi-Fi without internet never said 沒有網路連線, nor a slow one 網路連線很慢).
// A page on orbit.jaypengx.com (mapped here to a local server) runs the kit.
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
const KIT = new URL('../kit/', import.meta.url).pathname;
const TYPES = { '.mjs': 'text/javascript', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.json': 'application/json' };
const PAGE = `<!doctype html><html lang="zh-Hant" data-app="vocab"><head><meta charset="utf-8"></head><body><main>頁面</main>
<script type="module">import('/kit/orbit.mjs').then(() => (globalThis.ready = true));</script></body></html>`;

test('on the site, two failed calls to its own /api/ say 沒有網路連線; an answer takes it away', async t => {
  if (!chromium || !existsSync(chromium.executablePath())) return t.skip('no Chromium here');
  let fail = true;
  const server = createServer((req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    if (path === '/') return res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
    if (path.startsWith('/api/')) return fail ? req.socket.destroy() : res.writeHead(200, { 'content-type': 'application/json' }).end('{}');
    const file = join(KIT, path.replace(/^\/kit\//, ''));
    if (!path.startsWith('/kit/') || !existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
  });
  await new Promise(ok => server.listen(0, ok));
  const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP orbit.jaypengx.com 127.0.0.1:${server.address().port}`] });
  try {
    const page = await (await browser.newContext({ locale: 'zh-TW' })).newPage();
    await page.goto('http://orbit.jaypengx.com/');
    await page.waitForFunction(() => globalThis.ready);
    const capsule = () => page.evaluate(() => document.querySelector('.q-net:not(.out)')?.textContent || '');
    const call = () => page.evaluate(() => fetch('/api/eco').catch(() => {}));
    await call();
    assert.equal(await capsule(), '', 'one failure is no verdict');
    await call();
    await page.waitForTimeout(100);
    assert.equal(await capsule(), '沒有網路連線');
    fail = false;
    await call();
    await page.waitForTimeout(500);
    assert.equal(await capsule(), '');
  } finally {
    await browser.close();
    server.close();
  }
});
