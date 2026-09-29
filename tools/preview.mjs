// Preview any Quadra app on a phone-sized screen, signed in, with real data,
// without a Quadra Pass: a quick look (screenshots) after a change.
//
//   node tools/preview.mjs <app> [hash…] [--out dir] [--width 390] [--height 844]
//                          [--full] [--lang zh|en] [--dark] [--wait ms] [--click selector]
//                          [--type 'selector=text']  (fills a field after the clicks)
//                          [--signed-out]  (the sign-in screen, as a new device sees it)
//                          [--fixture 'text-in-url=file.json']  (repeatable: that saved answer
//                          for any upstream URL containing the text, e.g. when Yahoo rate-limits)
//
//   app   fixtures | play | securities | rewards | orbit (or the repo's folder name)
//   hash  the page's #hash to open (a tab), one screenshot each; none: the start
//
// What it does:
//   - serves the app's public/ (Orbit Class: its built dist/ after `npm run build`)
//     on localhost;
//   - opens it in Chromium (Playwright, preinstalled in the Claude Code cloud
//     container) as an iPhone-sized page already signed in: the Worker's /eco
//     calls get a made-up wallet and an empty app payload (or the one in
//     --payload file.json);
//   - answers the data proxy (/sports-proxy, single and ?batch=1) by fetching
//     the upstream URL itself (curl, through the container's HTTPS proxy), so
//     the page shows today's real scores, prices and odds;
//   - writes <out>/<app>-<hash>.png and prints the page's console errors.
//
// Needs Playwright (global in the container: /opt/node22/lib/node_modules).
import { createServer } from 'node:http';
import { readFile, stat, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { execFile } from 'node:child_process';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
let chromium;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright']) {
  try {
    ({ chromium } = require(p));
    break;
  } catch {}
}
if (!chromium) throw new Error('Playwright not found');

const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const flag = name => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return false;
  args.splice(i, 1);
  return true;
};
const out = resolve(opt('out', '/tmp/quadra-preview'));
const width = Number(opt('width', 390));
const height = Number(opt('height', 844));
const lang = opt('lang', 'zh');
const wait = Number(opt('wait', 6000));
const payloadFile = opt('payload', '');
const fixtures = [];
for (let f = opt('fixture', ''); f; f = opt('fixture', '')) {
  const i = f.indexOf('=');
  fixtures.push([f.slice(0, i), resolve(f.slice(i + 1))]);
}
const clicks = [];
for (let c; (c = opt('click', null)); ) clicks.push(c);
// --type 'selector=text': types into a field after the clicks (repeatable).
const typings = [];
for (let c; (c = opt('type', null)); ) typings.push([c.slice(0, c.indexOf('=')), c.slice(c.indexOf('=') + 1)]);
const full = flag('full');
const signedOut = flag('signed-out');
const dark = flag('dark');
const [appArg, ...hashes] = args;

const ROOT = resolve(new URL('../../', import.meta.url).pathname);
const APPS = { fixtures: ['Quadra-Fixtures', 'match'], play: ['Quadra-Play', 'odds'], securities: ['Quadra-Securities', 'stock'], rewards: ['Quadra-Rewards', 'vocab'], orbit: ['Orbit-Class', 'orbit'] };
const key = Object.keys(APPS).find(k => k === appArg || APPS[k][0].toLowerCase() === String(appArg).toLowerCase());
if (!key) throw new Error(`usage: node tools/preview.mjs <${Object.keys(APPS).join('|')}> [hash…]`);
const [repo, appId] = APPS[key];
const dir = key === 'orbit' ? join(ROOT, repo, 'dist') : join(ROOT, repo, 'public');
if (!existsSync(dir)) throw new Error(`${dir} missing${key === 'orbit' ? ' (run npm run build in Orbit-Class)' : ''}`);

// ---- A static server for the app ----
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json' };
const server = createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file = join(dir, path.replace(/^\/[^/]+\//, '/'));
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream' });
    res.end(await readFile(file));
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise(r => server.listen(0, r));
const base = `http://localhost:${server.address().port}/${repo}/`;

// ---- Upstream data, straight from the source ----
const curl = url =>
  new Promise(resolve => {
    execFile('curl', ['-s', '--compressed', '-m', '25', '-w', '\n%{http_code}', url], { maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve({ status: 502, body: '' });
      const i = stdout.lastIndexOf('\n');
      resolve({ status: Number(stdout.slice(i + 1)) || 502, body: stdout.slice(0, i) });
    });
  });
const cache = new Map();
const DEBUG = Boolean(process.env.DEBUG);
const upstream = url => {
  const fixture = fixtures.find(([text]) => url.includes(text));
  if (fixture) return readFile(fixture[1], 'utf8').then(body => ({ status: 200, body }));
  if (!cache.has(url)) cache.set(url, curl(url).then(r => (DEBUG && console.log(r.status, r.body.length, url.slice(0, 140)), r)));
  return cache.get(url);
};

// ---- A made-up signed-in account ----
const now = Date.now();
const wallet = {
  v: 1,
  created: now - 120 * 86_400_000,
  entries: [
    { id: 'eco:start', t: now - 120 * 86_400_000, app: 'eco', kind: 'start', amount: 110000 },
    { id: 'eco:pay:1', t: now - 20 * 86_400_000, app: 'eco', kind: 'pay', amount: 7000 },
    { id: 'vocab:r1', t: now - 2 * 86_400_000, app: 'vocab', kind: 'reward', amount: 240 },
    { id: 'odds:s1', t: now - 86_400_000, app: 'odds', kind: 'stake', amount: -500 }
  ],
  snap: {},
  settings: {},
  pins: {},
  apps: {},
  inbox: {}
};
const payload = payloadFile ? await readFile(payloadFile, 'utf8') : null;
const b64 = s => Buffer.from(s).toString('base64url');
const refresh = `${b64(JSON.stringify({ d: '0123456789abcdef0123456789abcdef' }))}.preview`;

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width, height },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: lang === 'en' ? 'en-US' : 'zh-TW',
  timezoneId: 'Asia/Taipei',
  colorScheme: dark ? 'dark' : 'light',
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ignoreHTTPSErrors: true
});
await context.addInitScript(
  ([refresh, lang]) => {
    try {
      sessionStorage.setItem('quadra.visit', '1');
      if (refresh) localStorage.setItem('quadra.refresh', refresh);
      if (refresh) localStorage.setItem('quadra.account', '0123456789abcdef');
      localStorage.setItem('quadra.lang', lang);
    } catch {}
  },
  [signedOut ? '' : refresh, lang]
);
await context.route('https://orbit-workers-proxy.pengzjay.workers.dev/**', async route => {
  const req = route.request();
  const body = req.postDataJSON?.() || {};
  const reply = { token: 'preview', wallet, active: true, live: { app: appId } };
  if (req.method() === 'POST' && (body.op === 'refresh' || body.op === 'login' || body.op === 'redeem')) Object.assign(reply, { payload, inbox: [] });
  if (body.op === 'pair-create') Object.assign(reply, { code: 'ABCD2345', exp: Date.now() + 600_000 });
  await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(reply) });
});
await context.route('https://sports-proxy.pengzjay.workers.dev/**', async route => {
  const u = new URL(route.request().url());
  const cors = { 'Access-Control-Allow-Origin': '*' };
  if (u.searchParams.has('batch')) {
    const items = u.searchParams.getAll('u').map(x => {
      const bang = x.indexOf('!');
      return bang > 0 && !x.slice(0, bang).includes(':') ? x.slice(bang + 1) : x;
    });
    const results = await Promise.all(items.map(upstream));
    const r = results.map(x => (x.status === 200 && /^[[{]/.test(x.body.trim()) ? `{"s":200,"b":${x.body}}` : `{"s":${x.status === 200 ? 415 : x.status}}`));
    return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: `{"r":[${r.join(',')}]}` });
  }
  const x = await upstream(u.searchParams.get('url'));
  await route.fulfill({ status: x.status, contentType: 'application/json', headers: cors, body: x.body });
});

// Everything else from outside (logos, fonts): fetched by curl too, so the
// container's HTTPS proxy is used (the browser itself goes nowhere).
const curlBin = url =>
  new Promise(resolve => {
    execFile('curl', ['-s', '-L', '-f', '-m', '20', url], { encoding: 'buffer', maxBuffer: 32 * 1024 * 1024 }, (err, stdout) => resolve(err ? null : stdout));
  });
await context.route(/^https:\/\/(?!orbit-workers-proxy|sports-proxy)/, async route => {
  const url = route.request().url();
  const body = await curlBin(url);
  if (!body) return route.abort();
  const type = /\.svg/.test(url) ? 'image/svg+xml' : /\.png/.test(url) ? 'image/png' : /\.jpe?g/.test(url) ? 'image/jpeg' : /\.css|fonts\.googleapis/.test(url) ? 'text/css' : /\.m?js/.test(url) ? 'text/javascript' : 'application/octet-stream';
  await route.fulfill({ status: 200, contentType: type, body });
});

await mkdir(out, { recursive: true });
const errors = [];
for (const hash of hashes.length ? hashes : ['']) {
  // A page of its own for each (a hash change alone doesn't reload).
  const page = await context.newPage();
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(`${base}${hash ? `#${hash}` : ''}`);
  await page.waitForTimeout(wait);
  for (const sel of clicks) {
    await page.click(sel).catch(e => errors.push(`click ${sel}: ${e.message.split('\n')[0]}`));
    await page.waitForTimeout(2500);
  }
  for (const [sel, text] of typings) {
    await page.fill(sel, text).catch(e => errors.push(`type ${sel}: ${e.message.split('\n')[0]}`));
    await page.waitForTimeout(4000);
  }
  const file = join(out, `${key}-${hash || 'start'}${clicks.length ? '-clicked' : ''}${dark ? '-dark' : ''}.png`);
  await page.screenshot({ path: file, fullPage: full });
  // Anything wider than the screen (a sideways scroll on a phone).
  const wide = await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el => el.getBoundingClientRect().right > innerWidth + 1 && getComputedStyle(el).position !== 'fixed' && !el.closest('.table-wrap, .q-chips, .segmented, [class*="scroll"]')).slice(0, 5).map(el => `${el.tagName.toLowerCase()}.${[...el.classList].join('.')}`));
  console.log(file, wide.length ? `| wider than the screen: ${wide.join(', ')}` : '');
  await page.close();
}
if (errors.length) console.log('console errors:\n ', [...new Set(errors)].slice(0, 20).join('\n  '));
await browser.close();
server.close();
