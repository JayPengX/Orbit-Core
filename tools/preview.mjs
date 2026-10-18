// Preview any Quadra app on a phone-sized screen, signed in, with real data,
// without a Quadra Pass: a quick look (screenshots) after a change.
//
//   node tools/preview.mjs <app> [hash…] [--out dir] [--width 390] [--height 844]
//                          [--full] [--lang zh|en] [--dark] [--wait ms] [--click selector]
//                          [--type 'selector=text']  (fills a field after the clicks)
//                          [--store 'key=value']  (a localStorage entry to start with)
//                          [--geo lat,lon]  (where the phone is; Transit's default 新竹車站)
//                          [--geo-path 'lat,lon;…' --geo-every ms]  (the phone moving, during --wait)
//                          [--signed-out]  (the sign-in screen, as a new device sees it)
//                          [--entry '{json}']  (a wallet entry to add: an economy scenario)
//                          [--clock 2026-10-06T10:05]  (the page's clock, Taipei time)
//                          [--snap '{json}']  (the wallet's snap to start with, e.g. Play's open slips)
//                          [--fixture 'text-in-url=file.json']  (repeatable: that saved answer
//                          for any upstream URL containing the text, e.g. when Yahoo rate-limits;
//                          the file is read at each ask, so swapping it mid-run changes the game)
//                          [--timing]  (loading speed: when the loading screen went away, how
//                          many of the app's own files and how deep their import chain was)
//                          [--latency ms]  (each of the app's own files answers this much later:
//                          a phone's round trip to GitHub Pages, e.g. 150)
//                          [--root dir]  (the repos from there, e.g. a stamped copy)
//                          [--h2]  (the app's files over HTTP/2, as GitHub Pages serves them:
//                          no six-connection queue; a throwaway certificate)
//                          [--fake-yahoo]  (made-up Yahoo prices: spark and chart answers
//                          for any symbol, for when Yahoo answers 429)
//
//   app   sports | play | securities | words | orbit | weather | transit (or the repo's folder name)
//         | admin [overview accounts issue money dev data ops clean]  (the admin panel, made-up accounts)
//
// Orbit Transit: /transit is answered by transit.js itself on made-up TDX
// answers around 新竹車站 (tests/fixtures/transit; until the TDX key is set no
// real one can be saved) with no Google key, so the map is NLSC's (real
// tiles) and search is OpenStreetMap's (real); the position is beside 新竹車站.
//
// Orbit Weather: /weather is answered by weather.js itself on the saved
// answers in tests/fixtures/weather (Taipei 101, 2026-10-02 evening; no keys
// needed), /weather/where by NLSC's real point query, and the page's position
// is Taipei 101 (--no-geo: location refused). With --live, the real proxy
// through Weather's dev door: today's forecast where the page is.
//   hash  the page's #hash to open (a tab), one screenshot each; none: the start
//
// What it does:
//   - serves the app's public/ (Orbit Class: its built dist/ after `npm run build`)
//     and the kit at /Shared-Proxy/kit/, as Pages does
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
import { createSecureServer } from 'node:http2';
import { execFile, execFileSync } from 'node:child_process';
import { readFile, stat, mkdir, mkdtemp, rm, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { ASIA_HOST, asiaBaseballResponse } from '../asia-baseball.js';
import { F1_LIVE_HOST, f1LiveResponse, memoryLog, sampleLive } from '../f1-live.js';
import { trimF1Page, trimEltaVod, trimYtSearch, trimYtVideo } from '../sports.js';
import { handleWeather } from '../weather.js';
import { upstream as weatherFixtures } from '../tests/fixtures/weather/upstream.mjs';
// The F1 lap log the sports proxy's cron keeps (f1-live.js), here in
// memory: a look each minute while a session runs, from when the tool started.
const f1Log = memoryLog();
const f1Look = () => sampleLive(f1Log).then(r => process.env.DEBUG && console.log('f1 laps', r)).catch(() => {});
f1Look();
setInterval(f1Look, 60_000).unref();
import { handleTransit } from '../transit.js';
import { upstream as transitFixtures } from '../tests/fixtures/transit/upstream.mjs';

const require = createRequire(import.meta.url);
// The container's global one, or a Mac's in ~/.local/opt/playwright.
let playwright;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', `${process.env.HOME}/.local/opt/playwright/node_modules/playwright`]) {
  try {
    playwright = require(p);
    break;
  } catch {}
}
if (!playwright) throw new Error('Playwright not found');

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
// --webkit: Safari's engine instead of Chromium (on a Mac, close to the
// iPhone's Safari; what most of the apps' people use).
const engine = flag('webkit') ? 'webkit' : 'chromium';
const out = resolve(opt('out', '/tmp/quadra-preview'));
// --device ipad (an iPad: says Macintosh, with touch, 820×1180) or pc (a
// computer's browser, 1440×900, no touch); the default an iPhone.
const device = opt('device', 'iphone');
const SIZES = { iphone: [390, 844], ipad: [820, 1180], pc: [1440, 900] };
const UAS = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
  pc: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
};
const width = Number(opt('width', (SIZES[device] || SIZES.iphone)[0]));
const height = Number(opt('height', (SIZES[device] || SIZES.iphone)[1]));
const lang = opt('lang', 'zh');
// --snap '{json}': the wallet's snap (each app's figures: Play's open slips for Orbit Sports, say).
const snapStart = JSON.parse(opt('snap', '{}'));
const wait = Number(opt('wait', 6000));
const payloadFile = opt('payload', '');
const fixtures = [];
for (let f = opt('fixture', ''); f; f = opt('fixture', '')) {
  // (Split at the last '=': the text can be a URL's own, 'dates=20261017'.)
  const i = f.lastIndexOf('=');
  fixtures.push([f.slice(0, i), resolve(f.slice(i + 1))]);
}
// --clock ISO: the page's time starts then (and runs on): a live session made up with --fixture, say.
const clockAt = opt('clock', '');
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
// --shot selector: also a picture of that element alone, whole (a sheet that scrolls inside), as <file>-shot.png.
const shotSel = opt('shot', null);
const evals = [];
for (let c; (c = opt('eval', null)); ) evals.push(c);
const latency = Number(opt('latency', 0));
const timing = flag('timing');
// --requests: every call the page makes beyond its own files (the Worker, the
// proxy, maps, fonts), with its method and, for a POST, its op: what an app
// costs each time it opens.
const requests = flag('requests');
// --reopen: each page opened twice in the same browser (its storage kept):
// the second is how an app opens on a phone that has used it before.
// --upgrade <date|ref>: an installed app updated. The first opening is the
// app (and the kit) as they were then (git, each repo's last commit before
// a date like '2026-10-03 12:00', or a commit), the second the current one,
// in the same browser: what was saved on the device then is what the new
// version opens on. Implies --reopen.
const upgrade = opt('upgrade', '');
// --flaky <share>: that share of upstream answers fails (502) during the
// first opening (every opening without --reopen / --upgrade): a phone on a
// poor connection. Whatever the app saved from a failed read shows on the next.
const flaky = Number(opt('flaky', 0));
// --net offline | slow[:ms]: the second opening (implies --reopen) with no
// connection at all (as a phone in airplane mode: navigator.onLine false,
// every request failing) or a poor one (every request that reaches the
// network, the app's own files the service worker doesn't keep included,
// answered that much later; 8000 ms by default). The service worker runs
// (it's what opens an app offline), so the first opening fills it.
const net = opt('net', '');
// --net-back ms: with --net offline, the connection comes back that long into the second opening.
const netBack = Number(opt('net-back', 0));
const netSlow = /^slow/.test(net) ? Number(net.split(':')[1]) || 8000 : 0;
if (net && net !== 'offline' && !netSlow) throw new Error('--net offline | slow[:ms]');
const netNow = { offline: false, slow: 0 };
const reopen = flag('reopen') || Boolean(upgrade) || Boolean(net);
// --freezes: every stretch over 100 ms the page couldn't answer a tap (its
// main thread busy), from the moment it starts: [when, how long] in ms.
const freezes = flag('freezes');
// --profile: where the page's main thread spent its time until the loading
// screen went (Chromium): each function's own time, the 15 largest.
const profile = flag('profile');
// --shuffle: what the page shows the moment the loading screen goes, against
// what it shows at the end of --wait: anything that moved, came or went
// after it lifted (a reshuffle the person sees). By each card's first line.
const shuffle = flag('shuffle');
// --serve [--port 8123]: no browser of its own; the app is served signed in
// with the same made-up account and answers, for another browser to open
// (the iOS Simulator's Safari: http://localhost:8123/<repo>/). The page's
// calls to the Workers come back here (its fetch is pointed at /__ext).
const serve = flag('serve');
// --live: the page asks the real proxies (the Workers let a localhost page
// without a pass in: worker.js TRANSIT_DEV, sports.js
// SPORTS_DEV), still with the made-up account. Orbit Transit: today's real
// buses, trains and bikes. The data proxy: its real cache, limits and
// failures (asked without the made-up token), each batch item that failed
// or was slow printed.
const live = flag('live');
const port = Number(opt('port', 8123));
const inits = [];
const extRoutes = [];
const full = flag('full');
const signedOut = flag('signed-out');
const dark = flag('dark');
const noGeo = flag('no-geo');
// --geo lat,lon: where the phone is (Transit's default: 新竹車站).
const geoAt = opt('geo')?.split(',').map(Number);
// --geo-path 'lat,lon;lat,lon;…' [--geo-every ms]: the phone moves along those points during --wait
// (Transit's navigation on board: its own pace from where it's been), one every --geo-every (default 2000).
const geoPath = (opt('geo-path') || '').split(';').filter(Boolean).map(x => x.split(',').map(Number));
const geoEvery = Number(opt('geo-every', 2000));
// --clock '2026-10-06T10:05': the page's clock starts then (Taipei time) and runs on.
const clock = opt('clock', '');
// --root dir: where the repos are (default: next to this one), e.g. a copy
// stamped by scripts/stamp-version.mjs, to see a deploy's loading.
const ROOT = resolve(opt('root', new URL('../../', import.meta.url).pathname));
// --h2: served over HTTP/2 (TLS, a certificate made for the run), as Pages
// and Cloudflare serve a phone: over HTTP/1.1 Chromium asks six files at a
// time, so a page that lists its modules up front queued here and nowhere
// else. The proxy's dev doors let an https localhost page in too.
const h2 = flag('h2');
// The repos as they were at --upgrade's date or ref, copied out of git.
async function snapshotRoot(when, repos) {
  const to = await mkdtemp(join(tmpdir(), 'quadra-upgrade-'));
  for (const [name, paths] of repos) {
    const src = join(ROOT, name);
    if (!existsSync(src)) continue;
    const git = (...a) => new Promise((ok, no) => execFile('git', ['-C', src, ...a], { maxBuffer: 256 * 1024 * 1024, encoding: 'buffer' }, (e, out) => (e ? no(e) : ok(out))));
    const sha = /^[0-9a-f]{7,40}$/.test(when) ? when : String(await git('rev-list', '-1', `--before=${when}`, 'HEAD')).trim();
    if (!sha) throw new Error(`${name}: nothing before ${when}`);
    await mkdir(join(to, name), { recursive: true });
    const tar = await git('archive', sha, ...paths);
    await new Promise((ok, no) => {
      const c = execFile('tar', ['-x', '-C', join(to, name)], e => (e ? no(e) : ok()));
      c.stdin.end(tar);
    });
    console.log(`upgrade: ${name} as of ${sha.slice(0, 7)} (${String(await git('log', '-1', '--format=%ci %s', sha)).trim().slice(0, 90)})`);
  }
  return to;
}
const [appArg, ...hashes] = args;

const APPS = { sports: ['Orbit-Sports', 'match'], play: ['Quadra-Play', 'odds'], securities: ['Quadra-Securities', 'stock'], words: ['Orbit-Words', 'vocab'], orbit: ['Orbit-Class', 'orbit'], weather: ['Orbit-Weather', 'weather'], transit: ['Orbit-Transit', 'transit'], admin: ['Shared-Proxy', 'admin'] };
// The admin panel's key in a preview: the run's own, never the owner's.
const ADMIN_KEY = 'preview-admin-key-0123456789abcdef0123456789';
// The old names still work.
const ALIAS = { fixtures: 'sports', hub: 'words' };
const key = Object.keys(APPS).find(k => k === (ALIAS[appArg] || appArg) || APPS[k][0].toLowerCase() === String(appArg).toLowerCase());
if (!key) throw new Error(`usage: node tools/preview.mjs <${Object.keys(APPS).join('|')}> [hash…]`);
const [renamed, appId] = APPS[key];
// A clone made before the rename keeps the old folder name.
const OLD = { 'Orbit-Sports': 'Quadra-Fixtures', 'Orbit-Words': 'Quadra-Hub' };
const repo = existsSync(join(ROOT, renamed)) || !OLD[renamed] ? renamed : OLD[renamed];
const dir = key === 'orbit' ? join(ROOT, repo, 'dist') : key === 'admin' ? join(ROOT, repo, 'site') : join(ROOT, repo, 'public');
if (!existsSync(dir)) throw new Error(`${dir} missing${key === 'orbit' ? ' (run npm run build in Orbit-Class)' : ''}`);

// What's served: the current repos, or --upgrade's old ones for the first opening.
const served = { root: ROOT, dir };
const oldRoot = upgrade ? await snapshotRoot(upgrade, [[repo, [key === 'orbit' ? 'dist' : 'public', ...(key === 'orbit' ? [] : ['scripts', 'package.json'])]], ['Shared-Proxy', ['kit']]]) : null;
// Both stamped as a deploy is (the app's ?v= files and version.json, the
// kit's): unstamped, a page says it's 'dev' and never updates, so an
// installed app's update (the old page finding the new one, its service
// worker's kept files) went untried. The current one from a copy.
async function stampRoot(root, version) {
  const app = join(root, repo);
  if (key !== 'orbit' && existsSync(join(app, 'scripts/stamp-version.mjs'))) execFileSync('node', ['scripts/stamp-version.mjs', version], { cwd: app, stdio: 'ignore' });
  const out = await mkdtemp(join(tmpdir(), 'quadra-kit-'));
  execFileSync('node', [join(root, 'Shared-Proxy/kit/stamp.mjs'), out, `kit-${version}`], { stdio: 'ignore' });
  await rm(join(root, 'Shared-Proxy/kit'), { recursive: true, force: true });
  await cp(join(out, 'kit'), join(root, 'Shared-Proxy/kit'), { recursive: true });
}
let newRoot = null;
if (oldRoot) {
  await stampRoot(oldRoot, 'old');
  newRoot = await mkdtemp(join(tmpdir(), 'quadra-new-'));
  for (const part of [key === 'orbit' ? 'dist' : 'public', ...(key === 'orbit' ? [] : ['scripts', 'package.json'])]) if (existsSync(join(ROOT, repo, part))) await cp(join(ROOT, repo, part), join(newRoot, repo, part), { recursive: true });
  await cp(join(ROOT, 'Shared-Proxy/kit'), join(newRoot, 'Shared-Proxy/kit'), { recursive: true });
  await stampRoot(newRoot, 'new');
}

// ---- A static server for the app ----
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.webmanifest': 'application/manifest+json' };
// --serve: the Workers' answers (the routes below, called as Playwright would).
async function external(req, res) {
  const u = new URL(req.url, 'http://x').searchParams.get('u') || '';
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = Buffer.concat(chunks).toString();
  const hit = extRoutes.find(([p]) => (p instanceof RegExp ? p.test(u) : u.startsWith(p.replace(/\*+$/, ''))));
  if (!hit) return res.writeHead(404).end();
  await hit[1]({
    request: () => ({ url: () => u, method: () => req.method, postData: () => body, postDataJSON: () => JSON.parse(body || 'null') }),
    fulfill: ({ status = 200, contentType = 'application/json', headers = {}, body: out = '' }) => res.writeHead(status, { 'Content-Type': contentType, ...headers }).end(out),
    abort: () => res.writeHead(502).end(),
    // --live: the call goes on to the Worker through its dev door (a localhost
    // origin), as a browser's would (without this, every answer came back empty).
    continue: async ({ url = u } = {}) => {
      const r = await fetch(url, { method: req.method, headers: { Origin: `http://localhost:${port}`, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: req.method === 'GET' || req.method === 'HEAD' ? undefined : body });
      res.writeHead(r.status, { 'Content-Type': r.headers.get('content-type') || 'application/json' }).end(Buffer.from(await r.arrayBuffer()));
    }
  });
}
const pointFetch = `(()=>{const f=window.fetch;window.fetch=(i,o={})=>{const u=typeof i==='string'?i:i.url;return /^https:\\/\\/(orbit-workers-proxy|sports-proxy)\\.pengzjay\\.workers\\.dev\\//.test(u)${live ? "&&!/orbit-workers-proxy\\.pengzjay\\.workers\\.dev\\/(transit|weather)/.test(u)" : ''}?f('/__ext?u='+encodeURIComponent(u),{method:o.method||i.method||'GET',body:o.body,headers:o.headers}):f(i,o)}})();`;
const h2Cert = () => {
  const dir = join(tmpdir(), `quadra-h2-${process.pid}`);
  mkdirSync(dir, { recursive: true });
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost', '-keyout', join(dir, 'key.pem'), '-out', join(dir, 'cert.pem')], { stdio: 'ignore' });
  return { key: readFileSync(join(dir, 'key.pem')), cert: readFileSync(join(dir, 'cert.pem')), allowHTTP1: true };
};
const server = (h2 && !serve ? (fn => createSecureServer(h2Cert(), fn)) : createServer)(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (serve && path === '/__ext') return external(req, res).catch(() => res.end());
  // Served: no service worker (it would keep the page from these answers).
  if (serve && path.endsWith('/sw.js')) return res.writeHead(404).end();
  // The kit's version.json is stamped only on Pages (kit/stamp.mjs): here
  // one the kit takes as the first it's seen (only noted, no reload).
  if (path === '/Shared-Proxy/kit/version.json' && !existsSync(join(served.root, 'Shared-Proxy/kit/version.json'))) return res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }).end('{"version":"local"}');
  // The kit, as the apps load it from Shared-Proxy's Pages (kit/loader.html).
  let file = path.startsWith('/Shared-Proxy/kit/') ? join(served.root, path) : join(served.dir, path.replace(/^\/[^/]+\//, '/'));
  if (latency) await new Promise(r => setTimeout(r, latency));
  try {
    if ((await stat(file)).isDirectory()) file = join(file, 'index.html');
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    const data = await readFile(file);
    // Served: the made-up sign-in and the fetch pointed here, before anything else runs.
    res.end(serve && file.endsWith('.html') ? String(data).replace('<head>', `<head><script>${inits.join(';')};${pointFetch}</script>`) : data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});
await new Promise(r => server.listen(serve ? port : 0, r));
const base = `${h2 && !serve ? 'https' : 'http'}://localhost:${server.address().port}/${renamed}/`;

// ---- Upstream data, straight from the source ----
// Given up after 8 s, like the Worker (SPORTS_PROXY_UPSTREAM_TIMEOUT_MS).
const curl = url =>
  new Promise(resolve => {
    execFile('curl', ['-s', '--compressed', '-m', '8', '-w', '\n%{http_code}', ...(/yahoo\.com/.test(url) ? ['-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'] : []), ...(/^https:\/\/www\.youtube\.com\//.test(url) ? ['-A', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36', '-H', 'Accept-Language: en-US,en;q=0.9', '-b', 'SOCS=CAI; CONSENT=YES+'] : []), url], { maxBuffer: 64 * 1024 * 1024 }, (err, stdout) => {
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
// The pages the Worker answers trimmed to JSON (formula1.com's, ELTA.tv's
// season videos, YouTube's search and video pages): trimmed here the same way.
const pageTrim = (url, r) => {
  if (r.status !== 200) return r;
  const host = new URL(url).hostname;
  if (host === 'www.formula1.com') return { status: 200, body: JSON.stringify(trimF1Page(r.body)) };
  if (host === 'eltaott.tv') return { status: 200, body: JSON.stringify(trimEltaVod(r.body)) };
  if (host === 'www.youtube.com') {
    const out = (new URL(url).pathname === '/watch' ? trimYtVideo : trimYtSearch)(r.body);
    return out ? { status: 200, body: JSON.stringify(out) } : { status: 502, body: '' };
  }
  return r;
};
const flakyNow = { on: false, failed: 0 };
const upstream = url => {
  if (flakyNow.on && Math.random() < flaky) return (flakyNow.failed++, Promise.resolve({ status: 502, body: '' }));
  if (fakeYahoo && url.includes('finance.yahoo.com')) return Promise.resolve(fakeYahooAnswer(url));
  const fixture = fixtures.find(([text]) => url.includes(text));
  if (fixture) return readFile(fixture[1], 'utf8').then(body => ({ status: 200, body }));
  // Asian baseball: gathered here by the Worker's own module (asia-baseball.js).
  // F1's live timing: a fresh snapshot each time (run with NODE_USE_ENV_PROXY=1 behind a proxy).
  if (url.startsWith(`https://${F1_LIVE_HOST}/`)) return f1LiveResponse(new URL(url), { log: f1Log }).then(async r => ({ status: r.status, body: await r.text() }));
  if (url.startsWith(`https://${ASIA_HOST}/`)) {
    if (!cache.has(url)) cache.set(url, asiaBaseballResponse(new URL(url)).then(async r => ({ status: r.status, body: await r.text() })));
    return cache.get(url);
  }
  // Yahoo's quote and quoteSummary want the cookie and crumb: asked as the Worker asks (sports.js).
  if (!cache.has(url) && /^https:\/\/query[12]\.finance\.yahoo\.com\/(v7\/finance\/quote|v10\/finance\/quoteSummary\/)/.test(url)) {
    cache.set(url, import('../sports.js').then(m => m.fetchYahoo(new URL(url))).then(async r => ({ status: r.status, body: await r.text() }), () => ({ status: 502, body: '' })));
  }
  if (!cache.has(url)) {
    const t0 = Date.now();
    // DEBUG: status, size, when it was asked (ms from start) and how long it took.
    cache.set(url, curl(url).then(r => (DEBUG && console.log(r.status, r.body.length, `@${t0 - STARTED}`, `${Date.now() - t0}ms`, url.slice(0, 140)), pageTrim(url, r))));
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
    { id: 'odds:s1', t: now - 86_400_000, app: 'odds', kind: 'stake', amount: -500 },
    ...extraEntries
  ],
  snap: snapStart,
  settings: {},
  apps: {},
  inbox: {}
};
const payload = payloadFile ? await readFile(payloadFile, 'utf8') : null;
const b64 = s => Buffer.from(s).toString('base64url');
const refresh = `${b64(JSON.stringify({ d: '0123456789abcdef0123456789abcdef' }))}.preview`;

// WebKit's private session drops Cache Storage on a reload (the apps' kept
// data: a second opening read everything again, which Safari never does),
// so --reopen there runs in a profile of its own, thrown away after.
const persistent = engine === 'webkit' && reopen && !serve;
const browser = serve || persistent ? null : await playwright[engine].launch();
const stub = { grantPermissions: async () => {}, setGeolocation: async () => {}, addInitScript: async (fn, arg) => void inits.push(`(${fn})(${JSON.stringify(arg)})`), route: async (p, h) => void extRoutes.push([p, h]) };
const contextOptions = {
  // No service workers: their fetches would miss the routes below (with
  // --net they run: an app opens offline on what its worker kept).
  serviceWorkers: net || upgrade ? 'allow' : 'block',
  viewport: { width, height },
  deviceScaleFactor: 2,
  isMobile: device !== 'pc',
  hasTouch: device !== 'pc',
  locale: lang === 'en' ? 'en-US' : 'zh-TW',
  timezoneId: 'Asia/Taipei',
  colorScheme: dark ? 'dark' : 'light',
  userAgent: UAS[device] || UAS.iphone,
  ignoreHTTPSErrors: true
};
const context = serve ? stub : persistent ? await playwright[engine].launchPersistentContext(await mkdtemp(join(tmpdir(), 'quadra-webkit-')), contextOptions) : await browser.newContext(contextOptions);
if (clock && !serve) await context.clock.install({ time: new Date(`${clock}+08:00`) }).then(() => context.clock.resume());
if (appId === 'weather' && !noGeo) {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation({ latitude: 25.034, longitude: 121.565 });
}
if (appId === 'transit' && !noGeo) {
  await context.grantPermissions(['geolocation']);
  await context.setGeolocation(geoAt?.length === 2 ? { latitude: geoAt[0], longitude: geoAt[1], accuracy: 20 } : { latitude: 24.8026, longitude: 120.9702, accuracy: 20 });
}
if (freezes)
  await context.addInitScript(() => {
    const t0 = performance.now();
    let last = t0;
    globalThis.__freezes = [];
    const tick = () => {
      const now = performance.now();
      if (now - last > 100) globalThis.__freezes.push([Math.round(last - t0), Math.round(now - last)]);
      last = now;
      setTimeout(tick, 0);
    };
    setTimeout(tick, 0);
  });
if (shuffle)
  await context.addInitScript(() => {
    // (Transit's map too: its markers in view, by kind, and the strip of YouBike stations along its bottom.)
    const marks = () => {
      const n = {};
      for (const el of document.querySelectorAll('.ot-mk')) {
        const r = el.getBoundingClientRect();
        if (r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth) {
          const k = el.className.replace(/leaflet\S*|ot-mk|is-sel/g, '').trim().split(/\s+/)[0] || 'mk';
          n[k] = (n[k] || 0) + 1;
        }
      }
      return Object.keys(n).length ? [`map: ${Object.entries(n).sort().map(([k, v]) => `${k} ${v}`).join(', ')}`] : [];
    };
    globalThis.__cards = () => [
      ...[...document.querySelectorAll('main section, [id^="panel-"]:not([hidden]) .q-card, [id^="panel-"]:not([hidden]) article, #near-bikes:not([hidden]) .ot-nb')]
        .filter(el => el.offsetParent && el.getBoundingClientRect().top < innerHeight * 3)
        .map(el => (el.innerText || '').split('\n').map(x => x.trim()).filter(Boolean).slice(0, 3).join(' · ').slice(0, 60)),
      ...marks()
    ];
    const watch = setInterval(() => {
      const box = document.getElementById('loading');
      // Orbit Class: its booting class instead of a loading box.
      const classOpen = !box && document.body && !document.body.classList.contains('orbit-booting') && document.querySelector('.cx-hero');
      if ((box && box.hidden) || classOpen) {
        clearInterval(watch);
        globalThis.__atOpen = { t: Math.round(performance.now()), cards: globalThis.__cards() };
      }
    }, 30);
  });
// The moment the loading screen goes (--timing), taken in the page.
if (timing)
  await context.addInitScript(() => {
    const watch = () => {
      const box = document.getElementById('loading');
      if (!box) return void (document.readyState === 'loading' && requestAnimationFrame(watch));
      if (box.hidden) return void (globalThis.__loadingGone ??= performance.now());
      new MutationObserver((_, seen) => box.hidden && ((globalThis.__loadingGone ??= performance.now()), seen.disconnect())).observe(box, { attributes: true, attributeFilter: ['hidden'] });
    };
    document.addEventListener('readystatechange', watch, { once: true });
  });
if (device === 'ipad') await context.addInitScript(() => Object.defineProperty(Navigator.prototype, 'maxTouchPoints', { get: () => 5 }));
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
  [signedOut ? '' : refresh, lang, key === 'admin' && !signedOut ? [...stores, ['quadra.admin', ADMIN_KEY]] : stores]
);
// Orbit Weather's routes (see the top): weather.js on the fixtures, one KV
// for the run.
const weatherKv = new Map();
const weatherEnv = { GOOGLE_WEATHER_KEY: 'preview', CWA_KEY: 'preview', MOENV_KEY: 'preview', RATE_LIMIT_KV: { get: async k => weatherKv.get(k) ?? null, put: async (k, v) => void weatherKv.set(k, v) } };
const weatherFetch = weatherFixtures();
const curlText = url => new Promise(resolve => execFile('curl', ['-s', '-m', '20', url], (err, stdout) => resolve(err ? '' : stdout)));
await context.route(live ? /^https:\/\/orbit-workers-proxy\.pengzjay\.workers\.dev\/push/ : /^https:\/\/orbit-workers-proxy\.pengzjay\.workers\.dev\/(weather|push)/, async route => {
  const req = route.request();
  const u = new URL(req.url());
  const cors = { 'Access-Control-Allow-Origin': '*' };
  if (flakyNow.on && Math.random() < flaky && !u.pathname.startsWith('/push')) return (flakyNow.failed++, route.fulfill({ status: 502, contentType: 'application/json', headers: cors, body: '{}' }));
  if (u.pathname.startsWith('/push')) return route.fulfill({ status: 200, contentType: 'application/json', headers: cors, body: u.pathname === '/push/key' ? '{"key":"BJAq2pf1eAmgD3fRzfyXE5dXeDlg2qUZDyIzQ-1SHCNkWr3UQvUtaHgtZ1eQPMl00SAGgejtNE5jkRQCS2Zi6lE"}' : '{"ok":true}' });
  const fetchFn = async (url, init) => (url.includes('api.nlsc.gov.tw') ? { ok: true, status: 200, text: async () => curlText(url) } : weatherFetch(url, init));
  const res = await handleWeather(new Request(req.url()), weatherEnv, cors, u.pathname, { session: { s: 'preview' }, fetchFn, cf: { latitude: '25.0478', longitude: '121.5319', city: 'Taipei' }, cache: null });
  await route.fulfill({ status: res.status, contentType: 'application/json', headers: cors, body: await res.text() });
});
// Orbit Transit's routes (see the top): transit.js on the made-up TDX answers;
// or, with the real keys in Shared-Proxy/.env (git-ignored; TDX_CLIENT_ID,
// TDX_CLIENT_SECRET, optionally GOOGLE_MAPS_KEY), on the real TDX and Google:
// today's buses, bikes and trains, still with the made-up account.
const dotEnv = existsSync(new URL('../.env', import.meta.url))
  ? Object.fromEntries(
      (await readFile(new URL('../.env', import.meta.url), 'utf8'))
        .split('\n')
        .map(l => /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(l))
        .filter(Boolean)
        .map(m => [m[1], m[2].replace(/^(['"])(.*)\1$/, '$2')])
    )
  : {};
const realTransit = Boolean(dotEnv.TDX_CLIENT_ID && dotEnv.TDX_CLIENT_SECRET);
const transitEnv = { ...(realTransit ? dotEnv : { TDX_CLIENT_ID: 'preview', TDX_CLIENT_SECRET: 'preview' }), TDX_PER_MIN: '10000', RATE_LIMIT_KV: { get: async k => weatherKv.get(k) ?? null, put: async (k, v) => void weatherKv.set(k, v) } };
const transitFetch = realTransit ? (url, init) => fetch(url, init) : transitFixtures();
if (realTransit) console.log('Orbit Transit: real TDX' + (dotEnv.GOOGLE_MAPS_KEY ? ' and Google' : '') + ' (keys from .env)');
if (!live) await context.route(/^https:\/\/orbit-workers-proxy\.pengzjay\.workers\.dev\/transit/, async route => {
  const req = route.request();
  const u = new URL(req.url());
  const cors = { 'Access-Control-Allow-Origin': '*' };
  if (flakyNow.on && Math.random() < flaky && !u.pathname.startsWith('/push')) return (flakyNow.failed++, route.fulfill({ status: 502, contentType: 'application/json', headers: cors, body: '{}' }));
  const fetchFn = async (url, init) => (url.includes('nominatim.openstreetmap.org') ? { ok: true, status: 200, json: async () => JSON.parse((await curlText(url)) || '[]') } : transitFetch(url, init));
  const res = await handleTransit(new Request(req.url()), transitEnv, cors, u.pathname, { session: { s: 'preview' }, fetchFn, cache: null });
  await route.fulfill({ status: res.status, contentType: 'application/json', headers: cors, body: await res.text() });
});
// The /stock Worker's store for the run.
const stockDocs = new Map();
await context.route(/^https:\/\/orbit-workers-proxy\.pengzjay\.workers\.dev\/(?!weather|push|transit|sports-proxy|data\/)/, async route => {
  const req = route.request();
  const body = req.postDataJSON?.() || {};
  // Quadra Play's slips (settle.js): placing checks every pick's price on
  // today's real data with the Worker's own check (price.js); nothing settled.
  if (new URL(req.url()).pathname === '/play') {
    let reply = req.method() === 'GET' ? { settled: {} } : { ok: true };
    // The lottery as lotto.js sells it (its draw, its prize), on no store.
    if (body.op === 'tickets') {
      const { buyTicket } = await import('../kit/play-lottery.mjs');
      const bottomless = { v: 1, created: '', ledger: [{ id: 'x', amount: 1e12 }], slips: [], tickets: [] };
      const sold = (body.tickets || []).map(x => buyTicket(bottomless, x, new Date()));
      reply = sold.some(r => r.error) ? { refused: { problem: sold.find(r => r.error).error } } : { tickets: sold.map(r => r.ticket) };
    }
    if (body.op === 'scratch') {
      const { CARDS, drawPrize } = await import('../kit/play-scratch.mjs');
      reply = { ticket: { id: body.id, t: new Date().toISOString(), game: `scratch:${body.card}`, card: body.card, cost: CARDS[body.card].price, prize: drawPrize(body.card), seed: Math.floor(Math.random() * 2 ** 31), status: 'open' } };
    }
    if (body.op === 'reveal') reply = { prize: 0 };
    // (Cash out: taken at the value asked; the Worker checks it against its own.)
    if (body.op === 'cashout') reply = { cashedOut: Math.floor(body.value) };
    if (body.op === 'place') {
      const { checkSlip, useReads } = await import('../price.js');
      const { cleanSlip } = await import('../settle.js');
      const reads = { read: async url => { const x = await upstream(url); if (x.status !== 200) throw new Error(String(x.status)); return JSON.parse(x.body); }, pack: async path => JSON.parse((await curlText(`https://orbit-workers-proxy.pengzjay.workers.dev/data/${path}`)) || 'null') };
      const once = useReads(reads);
      const slips = (body.slips || []).map(cleanSlip);
      reply = { placed: slips.map(x => x?.id) };
      for (const slip of slips) {
        const r = slip ? await checkSlip(slip, wallet, reads, new Date(), once) : { problem: 'shape' };
        if (!r.ok) (reply = { refused: { slip: slip?.id, ...r } }), console.log('play place refused', JSON.stringify(r));
        if (!r.ok) break;
      }
    }
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(reply) });
  }
  // Quadra Securities' orders, plans and 新股申購 (stock-fill.js): the
  // Worker's own code on a store of the run's, today's real data.
  if (new URL(req.url()).pathname === '/stock') {
    const { handleStock } = await import('../stock-fill.js');
    const res = await handleStock(new Request('https://x/stock', { method: 'POST', body: JSON.stringify(body) }), { ECO_TOKEN_SECRET: 'preview' }, { 'Access-Control-Allow-Origin': '*' }, { a: 'stock', d: 'preview' }, {
      json: (data, status = 200, headers = {}) => new Response(JSON.stringify(data), { status, headers }),
      errorJson: (code, status) => new Response(JSON.stringify({ error: { code } }), { status }),
      fsGet: async (env, c, id) => (stockDocs.has(`${c}/${id}`) ? { exists: true, payload: stockDocs.get(`${c}/${id}`) } : { exists: false }),
      fsWrite: async (env, c, id, data) => void stockDocs.set(`${c}/${id}`, data),
      now: () => Date.now(),
      read: async url => {
        const x = await upstream(url);
        if (x.status !== 200) throw new Error(String(x.status));
        return JSON.parse(x.body);
      }
    });
    return route.fulfill({ status: res.status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: await res.text() });
  }
  const reply = { token: 'preview', wallet, active: true, live: { app: appId } };
  // The app's data, as the Worker gives it: on a sign-in, and on a read
  // that names the app ('' when nothing is saved).
  if (req.method() === 'POST' && (body.op === 'refresh' || body.op === 'login' || body.op === 'redeem')) Object.assign(reply, { payload: payload ?? '', inbox: [] });
  if (req.method() === 'GET' && new URL(req.url()).searchParams.get('app')) Object.assign(reply, { payload: payload ?? '', inbox: [] });
  if (body.op === 'pair-create') Object.assign(reply, { code: 'ABCD2345', exp: Date.now() + 600_000 });
  await route.fulfill({ status: 200, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(reply) });
});
// The admin panel (site/admin, `admin [view…]`): eco-admin.js's own
// handler on made-up accounts in this run's memory, opened with a throwaway
// key of the run's (never the owner's, never the live Worker's). A view
// named is the tab clicked once it opens (accounts, money, dev…).
if (key === 'admin') {
  const { handleAdmin } = await import('../eco-admin.js');
  const { WALLET_COLLECTION } = await import('../eco.js');
  const { createHash, randomBytes } = await import('node:crypto');
  const docs = new Map();
  const DAY = 86_400_000;
  const APPS_USED = ['stock', 'odds', 'match', 'vocab', 'orbit', 'weather', 'transit'];
  // Twelve accounts: made over the last 40 days, a few apps each, pay and play.
  for (let i = 0; i < 12; i++) {
    const made = now - (40 - i * 3) * DAY;
    const apps = Object.fromEntries(APPS_USED.filter((a, j) => (i + j) % 3 !== 0).map((a, j) => [a, { first: made, last: now - ((i * 7 + j) % 9) * DAY - i * 3_600_000 }]));
    const entries = [
      { id: 'eco:start', t: made, app: 'eco', kind: 'start', amount: 30_000 },
      { id: 'eco:pay:2026-10', t: now - 17 * DAY, app: 'eco', kind: 'pay', amount: 6_000 },
      ...Array.from({ length: i % 5 }, (_, k) => ({ id: `odds:s${k}`, t: now - k * DAY, app: 'odds', kind: 'stake', amount: -200 * (k + 1) })),
      ...(i % 4 === 0 ? [{ id: 'odds:w1', t: now - 2 * DAY, app: 'odds', kind: 'win', amount: 1_850 }] : []),
      ...(i % 3 === 0 ? [{ id: `eco:plus:${new Date(now + 8 * 3_600_000).toISOString().slice(0, 7)}`, t: now - 10 * DAY, app: 'eco', kind: 'plus', amount: -199 }] : [])
    ];
    const w = { v: 1, v2: made, created: made, entries, snap: {}, settings: {}, apps, inbox: {} };
    docs.set(`${WALLET_COLLECTION}/${createHash('sha256').update(`PREVIEW${i}`).digest('hex')}`, { payload: JSON.stringify(w), updateTime: new Date(made).toISOString() });
  }
  const kv = new Map();
  const env = { ECO_ADMIN_TOKEN: ADMIN_KEY, RATE_LIMIT_KV: { get: async k => kv.get(k) ?? null, put: async (k, v) => void kv.set(k, v), list: async () => ({ keys: [] }), delete: async k => void kv.delete(k) } };
  const stamp = () => new Date().toISOString();
  const deps = {
    now: () => Date.now(),
    json: (data, status = 200) => new Response(JSON.stringify(data), { status }),
    errorJson: (code, status) => new Response(JSON.stringify({ error: { code } }), { status }),
    rateLimitResponse: async () => null,
    sha256Hex: async text => createHash('sha256').update(String(text)).digest('hex'),
    generateCode: n => randomBytes(n).toString('hex').toUpperCase().slice(0, n),
    fsGet: async (e, c, id) => (docs.has(`${c}/${id}`) ? { exists: true, ...docs.get(`${c}/${id}`) } : { exists: false }),
    fsWrite: async (e, c, id, payload) => (docs.set(`${c}/${id}`, { payload, updateTime: stamp() }), { updateTime: stamp() }),
    fsDelete: async (e, c, id) => void docs.delete(`${c}/${id}`),
    fsList: async (e, c, limit = 300) => [...docs].filter(([k]) => k.startsWith(`${c}/`)).slice(0, limit).map(([k, v]) => ({ id: k.slice(c.length + 1), ...v })),
    fsCollections: async () => [...new Set([...docs.keys()].map(k => k.split('/')[0]))],
    fsBatch: async (e, ops) => {
      for (const op of ops) op.delete ? docs.delete(op.delete.join('/')) : op.update && docs.set(`${op.update[0]}/${op.update[1]}`, { payload: op.update[2], updateTime: stamp() });
    }
  };
  await context.route(/^https:\/\/orbit-workers-proxy\.pengzjay\.workers\.dev\/eco/, async route => {
    const body = route.request().postDataJSON?.() || {};
    const res = await handleAdmin({ env, deps, headers: {}, request: new Request('https://x/eco'), ip: '127.0.0.1', body });
    return route.fulfill({ status: res.status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: await res.text() });
  });
}
// The sports proxy: the main Worker's /sports-proxy.
const SPORTS = /^https:\/\/orbit-workers-proxy\.pengzjay\.workers\.dev\/sports-proxy/;
// Every item asked of the proxy (its time): the busiest minute is printed at
// the end, against a signed-in session's limit (the dev door's is higher).
const liveAsks = [];
if (live) {
  await context.route(SPORTS, route => {
    const u = new URL(route.request().url());
    u.searchParams.delete('qt');
    return route.continue({ url: u.toString() });
  });
  context.on?.('response', async res => {
    if (!SPORTS.test(res.url())) return;
    const u = new URL(res.url());
    const asked = u.searchParams.has('batch') ? u.searchParams.getAll('u') : [u.searchParams.get('url')];
    liveAsks.push(...asked.map(() => Date.now()));
    const short = x => String(x).replace(/^https:\/\/site\.api\.espn\.com\/apis\/(site\/v2|v2|common\/v3)\/sports\//, 'espn:').slice(0, 110);
    if (!res.ok()) return console.log(`live: ${res.status()} ${asked.length} asked (${short(asked[0])}…)`);
    if (!u.searchParams.has('batch')) return;
    // (Whole, { r }, or a line an item in the order they came: { i, … }.)
    const text = await res.text().catch(() => '');
    let r = [];
    try {
      r = text.startsWith('{"r":') ? JSON.parse(text).r.map((x, i) => ({ i, ...x })) : text.split('\n').filter(Boolean).map(line => JSON.parse(line));
    } catch {}
    r.forEach(x => (x.s !== 200 || x.ms > 2500) && console.log(`live: ${x.s} ${x.ms ?? '?'} ms ${x.c || ''} ${x.e || ''} ${short(asked[x.i])}`));
  });
}
if (!live) await context.route(SPORTS, async route => {
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
await context.route(/^https:\/\/(?!orbit-workers-proxy|sports-proxy|localhost[:/])/, async route => {
  const url = route.request().url();
  const body = await curlBin(url);
  if (!body) {
    if (DEBUG) console.log('failed', url.slice(0, 140));
    return route.abort();
  }
  // By the bytes first (Commons serves an .svg's PNG rendering), else by the name.
  const magic = body.subarray(0, 4).toString('hex');
  const type = magic === '89504e47' ? 'image/png' : magic.startsWith('ffd8') ? 'image/jpeg' : /\.svg/.test(url) ? 'image/svg+xml' : /\.png/.test(url) ? 'image/png' : /\.jpe?g/.test(url) ? 'image/jpeg' : /\.css|fonts\.googleapis/.test(url) ? 'text/css' : /\.m?js/.test(url) ? 'text/javascript' : 'application/octet-stream';
  await route.fulfill({ status: 200, contentType: type, body });
});
// The family's data (the proxy's /data/, R2): the real files, as a phone reads them.
await context.route(/^https:\/\/orbit-workers-proxy\.pengzjay\.workers\.dev\/data\//, async route => {
  const body = await curlBin(route.request().url());
  if (!body) return route.fulfill({ status: 404, headers: { 'Access-Control-Allow-Origin': '*' }, body: '' });
  await route.fulfill({ status: 200, contentType: /\.gz$/.test(route.request().url()) ? 'application/gzip' : 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body });
});
// --net: registered last, so it runs first: the connection that's off or slow.
if (net && !serve)
  await context.route('**/*', async route => {
    if (netNow.offline) return route.abort('internetdisconnected');
    if (netNow.slow) await new Promise(r => setTimeout(r, netNow.slow));
    return route.fallback();
  });

if (serve) {
  console.log(`serving ${repo}, signed in with a made-up account: ${base}  (Ctrl-C to stop)`);
  await new Promise(() => {});
}
await mkdir(out, { recursive: true });
const errors = [];
let opening = 0;
// (--net: opened twice online first, as a phone that has used the app: the second has the kit's version noted and kept.)
const per = net ? 3 : reopen ? 2 : 1;
for (const hash of (hashes.length ? hashes : ['']).flatMap(h => Array(per).fill(h))) {
  const first = opening++ % per !== per - 1 || per === 1;
  const at = first && oldRoot ? oldRoot : newRoot;
  Object.assign(served, at ? { root: at, dir: join(at, repo, key === 'orbit' ? 'dist' : 'public') } : { root: ROOT, dir });
  flakyNow.on = Boolean(flaky) && (first || !reopen);
  Object.assign(netNow, { offline: !first && net === 'offline', slow: first ? 0 : netSlow });
  if (net && !serve) await context.setOffline(netNow.offline);
  if (reopen) console.log(first ? `first opening${oldRoot ? ` (the app as of ${upgrade})` : ''}${flaky ? `, ${Math.round(flaky * 100)}% of answers failing` : ''}` : `second opening (storage kept)${netNow.offline ? ', offline' : netNow.slow ? `, every request ${netNow.slow} ms late` : ''}`);
  // A page of its own for each (a hash change alone doesn't reload).
  const page = await context.newPage();
  if (clockAt) await page.clock.install({ time: new Date(clockAt) });
  page.on('console', m => m.type() === 'error' && errors.push(m.text()));
  page.on('pageerror', e => errors.push(String(e.stack || e)));
  page.on('requestfailed', r => DEBUG && console.log('request failed', r.failure()?.errorText, r.url().slice(0, 140)));
  page.on('framenavigated', f => DEBUG && f === page.mainFrame() && console.log('navigated', Date.now() - started, f.url().slice(0, 140)));
  // (A failed resource by its address: the console only says "404".)
  page.on('response', r => r.status() >= 400 && errors.push(`${r.status()} ${r.url().replace(/([?&](qt|u)=)[^&]+/g, '$1…').slice(0, 160)}`));
  const started = Date.now();
  const own = [];
  page.on('request', r => r.url().startsWith(base) && own.push({ url: r.url().slice(base.length) || '/', at: Date.now() - started }));
  // Each call: when it was asked, how long its answer took (or that it failed).
  const calls = [];
  if (requests) {
    const at = new Map();
    page.on('request', r => {
      if (r.url().startsWith(base) || r.url().startsWith('data:')) return;
      let op = '';
      try {
        op = JSON.parse(r.postData() || '{}').op || '';
      } catch {}
      const call = { t: Date.now() - started, text: `${r.method().padEnd(4)} ${r.url().replace(/([?&](qt|token)=)[^&]+/g, '$1…').slice(0, 4000)}${op ? `  op=${op}` : ''}`, took: '…' };
      at.set(r, call);
      calls.push(call);
    });
    page.on('requestfinished', r => at.has(r) && (at.get(r).took = `${Date.now() - started - at.get(r).t} ms`));
    page.on('requestfailed', r => at.has(r) && (at.get(r).took = 'failed'));
  }
  const cdp = profile && engine !== 'webkit' ? await context.newCDPSession(page) : null;
  if (cdp) await cdp.send('Profiler.enable').then(() => cdp.send('Profiler.setSamplingInterval', { interval: 500 })).then(() => cdp.send('Profiler.start'));
  // (With --net, from the page's first bytes: a slow connection's whole load is what's measured below.)
  const went = await page.goto(key === 'admin' ? `${base}admin/` : `${base}${hash ? `#${hash}` : ''}`, net ? { waitUntil: 'commit' } : {}).then(() => '', e => e.message.split('\n')[0]);
  if (went) console.log(`net: the page didn't open (${went})`);
  if (net && !first && !went) {
    // When the loading screen went (a person stuck behind it is the bug), and what the page says.
    const shown = await page
      .waitForFunction(() => { const b = document.getElementById('loading'); return b ? b.hidden : document.readyState !== 'loading' && Boolean(document.body) && !document.body.classList.contains('orbit-booting'); }, null, { timeout: 30_000, polling: 50 })
      .then(() => `${Date.now() - started} ms`)
      .catch(() => 'over 30 s');
    const said = await page.evaluate(() => [...document.querySelectorAll('#loading:not([hidden]) p, .q-net, .q-toast, [role=status], [role=alert]')].map(e => e.innerText?.trim()).filter(Boolean).join(' | ').slice(0, 300)).catch(() => '');
    console.log(`net ${net}: loading screen gone after ${shown}${said ? `; says: ${said}` : ''}`);
    if (netBack && netNow.offline)
      setTimeout(async () => {
        netNow.offline = false;
        await context.setOffline(false);
        console.log(`net: back online at ${Date.now() - started} ms`);
      }, Math.max(0, netBack - (Date.now() - started)));
  }
  if (timing) {
    // When it went, as the page saw it (from the navigation's start): the
    // tool's own polling can answer seconds late while slow image routes
    // hold its connection to the browser.
    const shown = await page
      .waitForFunction(() => document.getElementById('loading')?.hidden, null, { timeout: 60_000, polling: 50 })
      .then(() => page.evaluate(() => globalThis.__loadingGone ?? null))
      .then(at => (at == null ? Date.now() - started : Math.round(at)))
      .catch(() => null);
    const paint = await page.evaluate(() => performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null);
    // How many round trips the app's own files took: each request's start,
    // in steps of the latency (or of 30 ms without one).
    const step = latency || 30;
    const waves = new Set(own.map(r => Math.round(r.at / step))).size;
    console.log(`timing ${key}${hash ? `#${hash}` : ''}: loading screen gone after ${shown == null ? 'over 60 s' : `${shown} ms`}, first paint ${paint == null ? '?' : `${Math.round(paint)} ms`}, ${own.length} own files in ~${waves} waves (last asked at ${own.at(-1)?.at ?? 0} ms)`);
    if (DEBUG) for (const r of own) console.log(`  ${String(r.at).padStart(6)} ms  ${r.url.slice(0, 100)}`);
  }
  if (cdp) {
    if (!timing) await page.waitForFunction(() => document.getElementById('loading')?.hidden ?? true, null, { timeout: 60_000, polling: 50 }).catch(() => {});
    const { profile: prof } = await cdp.send('Profiler.stop');
    const by = new Map();
    const node = new Map(prof.nodes.map(n => [n.id, n]));
    const gaps = prof.timeDeltas;
    prof.samples.forEach((id, i) => {
      const f = node.get(id).callFrame;
      const k = `${f.functionName || '(anonymous)'} ${f.url.split('/').pop().replace(/\?.*/, '')}${f.url ? `:${f.lineNumber + 1}` : ''}`;
      by.set(k, (by.get(k) || 0) + (gaps[i + 1] ?? 0) / 1000);
    });
    const busy = [...by].filter(([k]) => !/^\((idle|program|garbage collector)\)/.test(k)).reduce((a, [, v]) => a + v, 0);
    console.log(`profile ${key}: ${Math.round(busy)} ms of script until the loading screen went; the most:\n${[...by].sort((a, b) => b[1] - a[1]).slice(0, 15).map(([k, v]) => `  ${String(Math.round(v)).padStart(5)} ms  ${k}`).join('\n')}`);
  }
  if (geoPath.length) {
    // (The clock moved on with it: each step is geoEvery of real time, so the page's pace is real.)
    const until = Date.now() + wait;
    for (const [lat, lon] of geoPath) {
      if (Date.now() >= until) break;
      await context.setGeolocation({ latitude: lat, longitude: lon, accuracy: 15 });
      await page.waitForTimeout(Math.min(geoEvery, Math.max(0, until - Date.now())));
    }
    if (Date.now() < until) await page.waitForTimeout(until - Date.now());
  } else await page.waitForTimeout(wait);
  // The admin panel's views are tabs, not addresses: the one named, clicked.
  for (const sel of [...(key === 'admin' && hash ? [`[data-view="${hash}"]`] : []), ...clicks]) {
    // ('js:<code>': run on the page instead, e.g. a click on something the tab bar covers.)
    if (sel.startsWith('js:')) await page.evaluate(sel.slice(3)).catch(e => errors.push(`click ${sel}: ${e.message.split('\n')[0]}`));
    else await page.click(sel).catch(e => errors.push(`click ${sel}: ${e.message.split('\n')[0]}`));
    await page.waitForTimeout(2500);
  }
  for (const [sel, text] of typings) {
    await page.fill(sel, text).catch(e => errors.push(`type ${sel}: ${e.message.split('\n')[0]}`));
    await page.waitForTimeout(4000);
  }
  if (requests) console.log(`requests ${key}${hash ? `#${hash}` : ''} (${calls.length}):\n${calls.map(c => `${String(c.t).padStart(6)} ms  +${c.took.padEnd(8)} ${c.text}`).join('\n')}`);
  if (shuffle) {
    const { open, now } = await page.evaluate(() => ({ open: globalThis.__atOpen, now: globalThis.__cards() }));
    if (!open) console.log('shuffle: the loading screen never went');
    else {
      const moved = open.cards.length !== now.length || open.cards.some((c, i) => c !== now[i]);
      console.log(moved ? `shuffle: changed after the loading screen went (at ${open.t} ms):\n  then: ${open.cards.slice(0, 8).join('\n        ')}\n  now:  ${now.slice(0, 8).join('\n        ')}` : `shuffle: none (opened at ${open.t} ms)`);
    }
  }
  if (freezes) console.log(`freezes ${key}${hash ? `#${hash}` : ''}: ${JSON.stringify(await page.evaluate(() => globalThis.__freezes || []))}`);
  for (const js of evals) console.log('eval:', JSON.stringify(await page.evaluate(js).catch(e => `error ${e.message}`)));
  const file = join(out, `${key}-${hash || 'start'}${reopen ? (first ? '-1' : '-2') : ''}${clicks.length ? '-clicked' : ''}${dark ? '-dark' : ''}${engine === 'webkit' ? '-webkit' : ''}.png`);
  await page.screenshot({ path: file, fullPage: full });
  if (shotSel) {
    // The element at its whole height: its scrollers opened up, laid over the page's top.
    await page.evaluate(sel => {
      const d = document.querySelector(sel);
      if (!d) return;
      for (const x of [d, ...d.querySelectorAll('*')]) if (/auto|scroll/.test(getComputedStyle(x).overflowY)) Object.assign(x.style, { maxHeight: 'none', height: 'auto', overflow: 'visible' });
      d.style.cssText += ';position:absolute!important;inset:0 0 auto 0!important;max-height:none!important;height:auto!important;transform:none!important;margin:0 auto!important';
    }, shotSel);
    await page.setViewportSize({ width: page.viewportSize().width, height: Math.max(page.viewportSize().height, Math.min(16000, await page.evaluate(sel => document.querySelector(sel)?.scrollHeight || 800, shotSel))) });
    await page.locator(shotSel).first().screenshot({ path: file.replace(/\.png$/, '-shot.png') }).catch(e => errors.push(`shot: ${e.message.split('\n')[0]}`));
  }
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
  // A scroller that also moves sideways: a sheet or a page a finger can push
  // left and right (a bar 2 px wider than its sheet). Rows made to scroll
  // sideways (chips) scroll only that way and aren't these.
  const slides = await page.evaluate(() =>
    [...document.querySelectorAll('body *')]
      .filter(el => {
        const cs = getComputedStyle(el);
        // (A row of cards made to slide: a flex row, a grid flowing by
        // column, or one snapping sideways, as Play's 為你推薦 and
        // Securities' 全球行情 are.)
        const row = (cs.display.includes('flex') && cs.flexDirection === 'row' && cs.flexWrap === 'nowrap') || (cs.display.includes('grid') && cs.gridAutoFlow.startsWith('column')) || /^x\b/.test(cs.scrollSnapType);
        // (And a table made to slide under a pinned first column, as Sports' box scores.)
        const cell = el.querySelector(':scope > table tr > :first-child');
        const pinned = cell && getComputedStyle(cell).position === 'sticky';
        return !row && !pinned && /auto|scroll/.test(cs.overflowX) && /auto|scroll/.test(cs.overflowY) && el.clientWidth && el.scrollWidth > el.clientWidth + 1 && !el.closest('[hidden]');
      })
      .slice(0, 6)
      .map(el => `${el.tagName.toLowerCase()}${[...el.classList].map(c => `.${c}`).join('')} (${el.scrollWidth}>${el.clientWidth})`)
  );
  if (slides.length) console.log(`scrolls sideways:\n  ${slides.join('\n  ')}`);
  // Text that broke onto a second row (TRUTH §10): a short label whose words
  // split over lines, or a row of chips that wrapped. Some rows are made to
  // wrap (a list of tags): read each one against the screenshot.
  const wraps = await page.evaluate(() => {
    const seen = el => {
      const r = el.getBoundingClientRect();
      return r.width && r.height && r.bottom > 0 && r.top < innerHeight * 6 && getComputedStyle(el).visibility !== 'hidden';
    };
    const name = el => `${el.tagName.toLowerCase()}${[...el.classList].map(c => `.${c}`).join('')}`;
    const lines = el => {
      const range = document.createRange();
      range.selectNodeContents(el);
      return new Set([...range.getClientRects()].filter(r => r.width > 1).map(r => Math.round(r.top / 4))).size;
    };
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (!seen(el) || el.closest('[hidden], svg')) continue;
      const kids = [...el.children].filter(k => getComputedStyle(k).position !== 'absolute' && k.getBoundingClientRect().width);
      const text = el.textContent.trim();
      // A short label in lines of its own.
      if (!el.children.length && text && text.length <= 24 && lines(el) > 1) out.push(`${name(el)} "${text}"`);
      // A row of things that wrapped.
      const cs = getComputedStyle(el);
      if (cs.display.includes('flex') && cs.flexDirection === 'row' && cs.flexWrap === 'wrap' && kids.length > 1 && kids.length <= 12) {
        // A new row starts where a thing begins below the last row's middle (a few pixels apart is one row).
        const boxes = kids.map(k => k.getBoundingClientRect()).sort((x, y) => x.top - y.top);
        let rowsSeen = 1;
        let bottom = boxes[0].top + boxes[0].height / 2;
        for (const r of boxes.slice(1)) if (r.top > bottom) (rowsSeen++, (bottom = r.top + r.height / 2));
        if (rowsSeen > 1) out.push(`${name(el)} (${rowsSeen} rows: "${text.slice(0, 40)}")`);
      }
    }
    return [...new Set(out)].slice(0, 25);
  });
  if (wraps.length) console.log(`wraps:\n  ${wraps.join('\n  ')}`);
  // Text cut short (TRUTH §10: an ellipsis or a clipped edge counts as a
  // wrap): an element whose own text runs past its box, ellipsis or clipped.
  const cuts = await page.evaluate(() => {
    const out = [];
    for (const el of document.querySelectorAll('body *')) {
      if (el.closest('[hidden], svg, .leaflet-container, .maplibregl-map') || !el.textContent.trim()) continue;
      const r = el.getBoundingClientRect();
      if (!r.width || r.bottom < 0 || r.top > innerHeight * 6) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || !/hidden|clip/.test(cs.overflowX) || cs.display === 'none') continue;
      // Only text this element holds itself (a scroller's children aren't cut).
      if (![...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim()) && el.children.length > 2) continue;
      if (el.scrollWidth > el.clientWidth + 1) out.push(`${el.tagName.toLowerCase()}${[...el.classList].map(c => `.${c}`).join('')} "${el.textContent.trim().slice(0, 40)}" (${el.scrollWidth}>${el.clientWidth})`);
    }
    // A picker (a select) whose chosen option is wider than its face: the
    // system cuts it with no overflow to see (FX's "TWD · Taiw…").
    const ctx = document.createElement('canvas').getContext('2d');
    for (const el of document.querySelectorAll('select')) {
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      if (!r.width || cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) === 0 || el.closest('[hidden]')) continue;
      const text = el.selectedOptions[0]?.textContent.trim();
      if (!text) continue;
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      const room = el.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - (cs.appearance === 'none' ? 0 : 18);
      const need = Math.ceil(ctx.measureText(text).width);
      if (need > room + 1) out.push(`select${el.id ? `#${el.id}` : ''}${[...el.classList].map(c => `.${c}`).join('')} "${text.slice(0, 40)}" (${need}>${Math.round(room)})`);
    }
    return [...new Set(out)].slice(0, 25);
  });
  if (cuts.length) console.log(`cut:\n  ${cuts.join('\n  ')}`);
  // Whether the page itself moves sideways (what a finger feels).
  const sideways = await page.evaluate(() => {
    const before = scrollX;
    scrollTo(500, scrollY);
    const moved = scrollX;
    scrollTo(before, scrollY);
    return moved ? `${document.documentElement.scrollWidth}px wide, scrolls ${moved}px sideways` : '';
  });
  if (flakyNow.on) console.log(`  ${flakyNow.failed} answers failed on purpose`);
  flakyNow.failed = 0;
  console.log(file, wide.length ? `| wider than the screen: ${wide.join(', ')}` : '', sideways ? `| PAGE ${sideways}` : '');
  await page.close();
}
if (errors.length) console.log('console errors:\n ', [...new Set(errors)].slice(0, 20).join('\n  '));
if (live && liveAsks.length) {
  const peak = Math.max(...liveAsks.map(t => liveAsks.filter(x => x >= t && x < t + 60_000).length));
  console.log(`live: ${liveAsks.length} items asked, ${peak} in the busiest minute${peak > 600 ? ' (over a session’s 600)' : ''}`);
}
await (browser || context).close();
server.close();
