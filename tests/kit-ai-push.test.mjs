// The kit's AI pieces and push list on a page (2026-11-12, found testing):
// an AI call that takes too long said 「連不上網路」 (it was taken for being offline);
// an AI question answered from 其他… or typed with 自己打 showed no answer once
// answered (only the chips it offered could light); and a phone whose notice list
// hadn't changed was never given to the push Worker again the next day.
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
const PAGE = `<!doctype html><html lang="zh-Hant" data-app="vocab"><head><meta charset="utf-8"><script type="importmap">{"imports":{"#kit/":"/kit/"}}</script></head><body><main>頁面</main>
<script type="module">Promise.all([import('/kit/orbit.mjs'), import('/kit/ai.mjs')]).then(([o, a]) => ((globalThis.O = o), (globalThis.A = a), (globalThis.ready = true)));</script></body></html>`;

async function site(t, run) {
  if (!chromium || !existsSync(chromium.executablePath())) return t.skip('no Chromium here');
  const posts = [];
  const server = createServer((req, res) => {
    const path = decodeURIComponent(req.url.split('?')[0]);
    if (path === '/') return res.writeHead(200, { 'content-type': 'text/html' }).end(PAGE);
    const file = join(KIT, path.replace(/^\/kit\//, ''));
    if (!path.startsWith('/kit/') || !existsSync(file)) return res.writeHead(404).end();
    res.writeHead(200, { 'content-type': TYPES[extname(file)] || 'application/octet-stream' }).end(readFileSync(file));
  });
  await new Promise(ok => server.listen(0, ok));
  const browser = await chromium.launch({ args: [`--host-resolver-rules=MAP orbit.jaypengx.com 127.0.0.1:${server.address().port}`] });
  try {
    const context = await browser.newContext({ locale: 'zh-TW' });
    // The proxy (https, under the site's /api/): the AI never answers; the push Worker's calls counted.
    await context.route(/\/api\//, route => {
      const path = new URL(route.request().url()).pathname;
      if (path === '/api/ai') return; // never answers
      if (path.startsWith('/api/push/')) {
        posts.push(path.slice(10));
        return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: path.endsWith('/key') ? '{"key":"k"}' : '{}' });
      }
      return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{}' });
    });
    const page = await context.newPage();
    page.on('pageerror', e => console.log('PAGEERR', e.message));
    page.on('console', m => m.type() === 'error' && console.log('CONSOLE', m.text()));
    await page.goto('http://orbit.jaypengx.com/');
    await page.waitForFunction(() => globalThis.ready);
    await run(page, context, posts);
  } finally {
    await browser.close();
    server.close();
  }
}

test('an AI call that takes too long is a timeout (「AI 現在沒有回應」), offline only when the phone is', async t =>
  site(t, async (page, context) => {
    const slow = await page.evaluate(() => A.aiCall('x', {}, { timeout: 600 }));
    assert.equal(slow.error, 'timeout');
    assert.equal(await page.evaluate(e => A.aiSays(e), slow.error), 'AI 現在沒有回應，再試一次。');
    await context.setOffline(true);
    assert.equal((await page.evaluate(() => A.aiCall('x', {}, { timeout: 600 }))).error, 'offline');
    await context.setOffline(false);
  }));

test('an AI question answered from 其他… or typed shows that answer once answered', async t =>
  site(t, async page => {
    const picked = await page.evaluate(async () => {
      const list = ['餐飲', '交通', '購物', '娛樂', '醫療'].map((name, i) => ({ id: `c${i + 1}`, name }));
      const { box, answer } = A.askBox({ q: '記在哪一類？', field: 'cat', options: ['c1', 'c2'] }, { lists: { cat: list } });
      document.body.append(box);
      box.querySelector('.q-ai-more').click();
      await new Promise(r => setTimeout(r, 400));
      const d = [...document.querySelectorAll('dialog[open]')].at(-1);
      [...d.querySelectorAll('button, .q-cell')].find(b => /醫療/.test(b.textContent)).click();
      const a = await answer;
      const lit = [...box.querySelectorAll('.q-chip.on')].map(c => c.textContent);
      box.remove();
      return { id: a.id, lit };
    });
    assert.equal(picked.id, 'c5');
    assert.deepEqual(picked.lit, ['醫療']);
    const typed = await page.evaluate(async () => {
      const { box, answer } = A.askBox({ q: '跟誰一起？', options: ['自己', '朋友'] });
      document.body.append(box);
      box.querySelector('.q-ai-more').click();
      const own = box.querySelector('.q-ai-own');
      const input = own.querySelector('textarea, input');
      input.value = '同學三個';
      input.dispatchEvent(new Event('input', { bubbles: true }));
      own.querySelector('.q-ai-send').click();
      const a = await answer;
      return { a: a.a, lit: [...box.querySelectorAll('.q-chip.on')].map(c => c.textContent), ownHidden: own.hidden };
    });
    assert.equal(typed.a, '同學三個');
    assert.deepEqual(typed.lit, ['同學三個']);
    assert.equal(typed.ownHidden, true);
  }));

test('the notice list is given to the push Worker again each day, changed or not', async t =>
  site(t, async (page, _, posts) => {
    await page.evaluate(() => {
      Object.defineProperty(Notification, 'permission', { configurable: true, get: () => 'granted' });
      const sub = { endpoint: 'https://fcm.googleapis.com/fcm/send/x', options: {}, toJSON: () => ({ endpoint: 'https://fcm.googleapis.com/fcm/send/x', keys: { p256dh: 'p', auth: 'a' } }) };
      Object.defineProperty(navigator, 'serviceWorker', { configurable: true, value: { ready: Promise.resolve({ pushManager: { getSubscription: async () => sub } }) } });
      O.setNotifyOn(true);
      globalThis.S = { app: 'vocab', lang: 'zh', ensureToken: async () => 't' };
      globalThis.L = [{ at: Date.now() + 3_600_000, title: '今天的字', tag: 'd' }];
    });
    await page.evaluate(() => O.schedulePush(S, L));
    assert.deepEqual(posts.filter(p => p !== 'key'), ['subscribe', 'schedule'], 'first time: subscribed and the list sent');
    posts.length = 0;
    await page.evaluate(() => O.schedulePush(S, L));
    assert.deepEqual(posts, [], 'the same list the same day: nothing sent');
    // The next day (the mark from yesterday), the same list.
    await page.evaluate(() => localStorage.setItem('orbit.push.sub.vocab', `https://fcm.googleapis.com/fcm/send/x|${new Date(Date.now() - 86_400_000).toDateString()}`));
    await page.evaluate(() => O.schedulePush(S, L));
    assert.ok(posts.includes('subscribe'), `the next day: given again (${posts.join(', ') || 'nothing sent'})`);
  }));
