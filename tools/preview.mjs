// Preview any Quadra app on a phone-sized screen, signed in, with real data,
// without a Quadra Pass: a quick look (screenshots) after a change.
//
//   node tools/preview.mjs <app> [hash…] [--out dir] [--width 390] [--height 844]
//                          [--full] [--lang zh|en] [--dark] [--wait ms] [--click selector]
//                          [--type 'selector=text']  (fills a field after the clicks)
//                          [--store 'key=value']  (a localStorage entry to start with)
//                          [--signed-out]  (the sign-in screen, as a new device sees it)
//                          [--entry '{json}']  (a wallet entry to add: an economy scenario)
//                          [--snap '{json}']  (the wallet's snap to start with, e.g. Play's open slips)
//                          [--fixture 'text-in-url=file.json']  (repeatable: that saved answer
//                          for any upstream URL containing the text, e.g. when Yahoo rate-limits)
//                          [--timing]  (loading speed: when the loading screen went away, how
//                          many of the app's own files and how deep their import chain was)
//                          [--latency ms]  (each of the app's own files answers this much later:
//                          a phone's round trip to GitHub Pages, e.g. 150)
//                          [--root dir]  (the repos from there, e.g. a stamped copy)
//                          [--fake-yahoo]  (made-up Yahoo prices: spark and chart answers
//                          for any symbol, for when Yahoo answers 429)
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
import { ASIA_HOST, asiaBaseballResponse } from '../asia-baseball.js';

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
const fakeYahoo = flag('fake-yahoo');
const out = resolve(opt('out', '/tmp/quadra-preview'));
const width = Number(opt('width', 390));
const height = Number(opt('height', 844));
const lang = opt('lang', 'zh');
// --snap '{json}': the wallet's snap (each app's figures: Play's open slips for Fixtures, say).
const snapStart = JSON.parse(opt('snap', '{}'));
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
// --store 'key=value': a localStorage entry the page starts with (repeatable).
const stores = [];
for (let c; (c = opt('store', null)); ) stores.push([c.slice(0, c.indexOf('=')), c.slice(c.indexOf('=') + 1)]);
// --entry 'json': a wallet entry to add to the made-up account (repeatable),
// e.g. '{"id":"eco:rebase:v3","app":"eco","kind":"rebase","amount":-80000}'.
const extraEntries = [];
for (let c; (c = opt('entry', null)); ) extraEntries.push({ t: Date.now(), ...JSON.parse(c) });
// --eval 'js': an expression run on the page after the clicks; its result is printed.
const evals = [];
for (let c; (c = opt('eval', null)); ) evals.push(c);
const latency = Number(opt('latency', 0));
const timing = flag('timing');
const full = flag('full');
const signedOut = flag('signed-out');
const dark = flag('dark');
// --root dir: where the repos are (default: next to this one), e.g. a copy
// stamped by scripts/stamp-version.mjs, to see a deploy's loading.
const ROOT = resolve(opt('root', new URL('../../', import.meta.url).pathname));
const [appArg, ...hashes] = args;

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
  if (latency) await new Promise(r => setTimeout(r, latency));
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
// Given up after 8 s, like the Worker (SPORTS_PROXY_UPSTREAM_TIMEOUT_MS).
const curl = url =>
  new Promise(resolve => {
    execFile('curl', ['-s', '--compressed', '-m', '8', '-w', '\n%{http_code}', url], { maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
      if (err) return resolve({ status: 502, body: '' });
      const i = stdout.lastIndexOf('\n');
      resolve({ status: Number(stdout.slice(i + 1)) || 502, body: stdout.slice(0, i) });
    });
  });
const cache = new Map();
const STARTED = Date.now();
const DEBUG = Boolean(process.env.DEBUG);
// --fake-yahoo: plausible prices for any symbol (a seeded random walk around
// a known level), in Yahoo's spark and chart shapes.
const LEVELS = { '2330.TW': 1180, '0050.TW': 196, '0056.TW': 38, '2317.TW': 224, '2454.TW': 1385, '2412.TW': 128, '2882.TW': 66, 'AAPL': 238, 'NVDA': 186, 'MSFT': 512, 'TSLA': 428, 'GOOGL': 246, 'AMZN': 222, 'VOO': 612, 'VT': 136, 'QQQ': 598, '^TWII': 25800, '^GSPC': 6650, '^IXIC': 22500, '^DJI': 46300, 'BTC-USD': 112000, 'ETH-USD': 4100, 'XAU': 3850, 'GC=F': 3850, 'USDTWD=X': 30.6, 'JPYTWD=X': 0.207, 'EURTWD=X': 35.8, 'HKDTWD=X': 3.93, 'CNYTWD=X': 4.29, 'GBPTWD=X': 41.2, 'KRWTWD=X': 0.0219, 'AUDTWD=X': 20.1, 'CHFTWD=X': 38.4, 'CADTWD=X': 22.0, 'SGDTWD=X': 23.8 };
function seeded(text) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => ((h = Math.imul(h ^ (h >>> 15), 2246822507) ^ Math.imul(h ^ (h >>> 13), 3266489909)) >>> 0) / 4294967296;
}
function fakeSeries(symbol, n, stepS) {
  const rand = seeded(symbol);
  const level = LEVELS[symbol] ?? 20 + rand() * 300;
  const vol = symbol.endsWith('=X') ? 0.002 : symbol.includes('-USD') ? 0.02 : 0.012;
  const closes = [];
  let p = level * (0.92 + rand() * 0.08);
  for (let i = 0; i < n; i++) closes.push((p *= 1 + (rand() - 0.48) * vol));
  const k = level / closes.at(-1);
  const end = Math.floor(Date.now() / 1000);
  return { closes: closes.map(c => +(c * k).toPrecision(6)), stamps: closes.map((_, i) => end - (n - 1 - i) * stepS) };
}
function fakeMeta(symbol, closes) {
  const tw = /\.TWO?$/.test(symbol);
  const fx = symbol.endsWith('=X');
  const now = Date.now() / 1000;
  const day = Math.floor((now + 8 * 3600) / 86400) * 86400 - 8 * 3600;
  const [start, end] = tw ? [day + 3600, day + 5.5 * 3600] : [day + 13.5 * 3600, day + 20 * 3600];
  return {
    symbol, currency: tw || fx ? 'TWD' : 'USD', instrumentType: fx ? 'CURRENCY' : symbol.includes('-USD') ? 'CRYPTOCURRENCY' : /^(00|VOO|VT|QQQ)/.test(symbol) ? 'ETF' : 'EQUITY',
    exchangeName: tw ? 'TAI' : 'NMS', fullExchangeName: tw ? 'Taiwan' : 'NasdaqGS', exchangeTimezoneName: tw ? 'Asia/Taipei' : 'America/New_York',
    regularMarketPrice: closes.at(-1), chartPreviousClose: closes.at(-2) ?? closes.at(-1), previousClose: closes.at(-2) ?? closes.at(-1),
    regularMarketDayHigh: Math.max(...closes.slice(-8)), regularMarketDayLow: Math.min(...closes.slice(-8)), fiftyTwoWeekHigh: closes.at(-1) * 1.25, fiftyTwoWeekLow: closes.at(-1) * 0.7,
    regularMarketVolume: 12_345_678, regularMarketTime: Math.floor(now), longName: symbol, shortName: symbol,
    currentTradingPeriod: { regular: { start, end } }
  };
}
function fakeYahooAnswer(url) {
  const u = new URL(url);
  if (u.pathname.includes('/v7/finance/spark')) {
    const result = (u.searchParams.get('symbols') || '').split(',').filter(Boolean).map(symbol => {
      const { closes, stamps } = fakeSeries(symbol, 60, 300);
      return { symbol, response: [{ meta: fakeMeta(symbol, closes), timestamp: stamps, indicators: { quote: [{ close: closes }] } }] };
    });
    return { status: 200, body: JSON.stringify({ spark: { result } }) };
  }
  if (u.pathname.includes('/v8/finance/chart/')) {
    const symbol = decodeURIComponent(u.pathname.split('/').pop());
    const range = u.searchParams.get('range') || '1d';
    const [n, step] = { '1d': [78, 300], '5d': [120, 1800], '1mo': [22, 86400], '6mo': [126, 86400], ytd: [190, 86400], '1y': [250, 86400], '2y': [500, 86400], '5y': [260, 7 * 86400], max: [300, 30 * 86400] }[range] || [250, 86400];
    const { closes, stamps } = fakeSeries(symbol, n, step);
    return { status: 200, body: JSON.stringify({ chart: { result: [{ meta: fakeMeta(symbol, closes), timestamp: stamps, indicators: { quote: [{ close: closes, open: closes, high: closes.map(c => c * 1.004), low: closes.map(c => c * 0.996), volume: closes.map(() => 1e6) }], adjclose: [{ adjclose: closes }] }, events: {} }], error: null } }) };
  }
  return { status: 404, body: '' };
}
const upstream = url => {
  if (fakeYahoo && url.includes('finance.yahoo.com')) return Promise.resolve(fakeYahooAnswer(url));
  const fixture = fixtures.find(([text]) => url.includes(text));
  if (fixture) return readFile(fixture[1], 'utf8').then(body => ({ status: 200, body }));
  // Asian baseball: gathered here by the Worker's own module (asia-baseball.js).
  if (url.startsWith(`https://${ASIA_HOST}/`)) {
    if (!cache.has(url)) cache.set(url, asiaBaseballResponse(new URL(url)).then(async r => ({ status: r.status, body: await r.text() })));
    return cache.get(url);
  }
  if (!cache.has(url)) {
    const t0 = Date.now();
    // DEBUG: status, size, when it was asked (ms from start) and how long it took.
    cache.set(url, curl(url).then(r => (DEBUG && console.log(r.status, r.body.length, `@${t0 - STARTED}`, `${Date.now() - t0}ms`, url.slice(0, 140)), r)));
  }
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
    { id: 'odds:s1', t: now - 86_400_000, app: 'odds', kind: 'stake', amount: -500 },
    ...extraEntries
  ],
  snap: snapStart,
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
  // No service workers: their fetches would miss the routes below.
  serviceWorkers: 'block',
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
  ([refresh, lang, stores]) => {
    try {
      for (const [k, v] of stores) localStorage.setItem(k, v);
      sessionStorage.setItem('quadra.visit', '1');
      if (refresh) localStorage.setItem('quadra.refresh', refresh);
      if (refresh) localStorage.setItem('quadra.account', '0123456789abcdef');
      localStorage.setItem('quadra.lang', lang);
    } catch {}
  },
  [signedOut ? '' : refresh, lang, stores]
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
    // Like the Worker: an item not answered within 3 s answers 504 (asked again on its own; its fetch goes on).
    const results = await Promise.all(items.map(url => Promise.race([upstream(url), new Promise(r => setTimeout(() => r({ status: 504, body: '' }), 3_000))])));
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
  if (!body) {
    if (DEBUG) console.log('failed', url.slice(0, 140));
    return route.abort();
  }
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
  const started = Date.now();
  const own = [];
  page.on('request', r => r.url().startsWith(base) && own.push({ url: r.url().slice(base.length) || '/', at: Date.now() - started }));
  await page.goto(`${base}${hash ? `#${hash}` : ''}`);
  if (timing) {
    const shown = await page
      .waitForFunction(() => document.getElementById('loading')?.hidden, null, { timeout: 60_000, polling: 50 })
      .then(() => Date.now() - started)
      .catch(() => null);
    const paint = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null);
    // How many round trips the app's own files took: each request's start,
    // in steps of the latency (or of 30 ms without one).
    const step = latency || 30;
    const waves = new Set(own.map(r => Math.round(r.at / step))).size;
    console.log(`timing ${key}${hash ? `#${hash}` : ''}: loading screen gone after ${shown == null ? 'over 60 s' : `${shown} ms`}, first paint ${paint == null ? '?' : `${Math.round(paint)} ms`}, ${own.length} own files in ~${waves} waves (last asked at ${own.at(-1)?.at ?? 0} ms)`);
    if (DEBUG) for (const r of own) console.log(`  ${String(r.at).padStart(6)} ms  ${r.url.slice(0, 100)}`);
  }
  await page.waitForTimeout(wait);
  for (const sel of clicks) {
    await page.click(sel).catch(e => errors.push(`click ${sel}: ${e.message.split('\n')[0]}`));
    await page.waitForTimeout(2500);
  }
  for (const [sel, text] of typings) {
    await page.fill(sel, text).catch(e => errors.push(`type ${sel}: ${e.message.split('\n')[0]}`));
    await page.waitForTimeout(4000);
  }
  for (const js of evals) console.log('eval:', JSON.stringify(await page.evaluate(js).catch(e => `error ${e.message}`)));
  const file = join(out, `${key}-${hash || 'start'}${clicks.length ? '-clicked' : ''}${dark ? '-dark' : ''}.png`);
  await page.screenshot({ path: file, fullPage: full });
  // Anything wider than the screen (a sideways scroll on a phone).
  const wide = await page.evaluate(() => {
    const clipped = el => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) if (/auto|scroll|hidden|clip/.test(getComputedStyle(p).overflowX)) return true;
      return false;
    };
    return [...document.querySelectorAll('body *')]
      .filter(el => {
        const r = el.getBoundingClientRect();
        return r.width && (r.right > innerWidth + 1 || r.left < -1) && !clipped(el);
      })
      .slice(0, 6)
      .map(el => {
        const r = el.getBoundingClientRect();
        return `${el.tagName.toLowerCase()}.${[...el.classList].join('.')} [${Math.round(r.left)}–${Math.round(r.right)}]`;
      });
  });
  // Whether the page itself moves sideways (what a finger feels).
  const sideways = await page.evaluate(() => {
    const before = scrollX;
    scrollTo(500, scrollY);
    const moved = scrollX;
    scrollTo(before, scrollY);
    return moved ? `${document.documentElement.scrollWidth}px wide, scrolls ${moved}px sideways` : '';
  });
  console.log(file, wide.length ? `| wider than the screen: ${wide.join(', ')}` : '', sideways ? `| PAGE ${sideways}` : '');
  await page.close();
}
if (errors.length) console.log('console errors:\n ', [...new Set(errors)].slice(0, 20).join('\n  '));
await browser.close();
server.close();
