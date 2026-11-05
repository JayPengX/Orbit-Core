// The family's site for tools/speed.mjs, as a phone gets it: each app and
// the kit built as their deploys build them (kit/stamp.mjs, kit/stamp-app.mjs;
// Class's Vite build), for a git ref or the working tree, served at
// orbit.jaypengx.com as Cloudflare serves it (Brotli, `max-age=0,
// must-revalidate` with an ETag, a 304 for what the phone has). Everything
// from outside (the proxy's /api, ESPN, pictures, Orbit Law's data) is read
// live once and recorded (`record.jsonl`), then replayed the same for every
// run and both sides, so a before and an after see the same world. The Pass
// is a made-up account (the preview's), with the app's demo account
// (tools/shots/accounts); nothing paid is ever asked (Gemini's routes answer
// 503 here).
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync, statSync, appendFileSync, symlinkSync } from 'node:fs';
import { dirname, join, extname, relative } from 'node:path';
import { brotliCompressSync, constants as Z } from 'node:zlib';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

export const HOST = 'orbit.jaypengx.com';
const HERE = new URL('./', import.meta.url).pathname;
const CORE = join(HERE, '../..');
const ROOT = join(CORE, '..');

// Each app: its repo, its address, its kit id, its demo account.
export const APPS = {
  sports: { repo: 'Orbit-Sports', slug: 'sports', id: 'match', account: 'sports-fan' },
  transit: { repo: 'Orbit-Transit', slug: 'transit', id: 'transit', account: 'transit-rides', geo: [24.8026, 120.9702] },
  weather: { repo: 'Orbit-Weather', slug: 'weather', id: 'weather', account: 'weather-pins', geo: [25.034, 121.565] },
  class: { repo: 'Orbit-Class', slug: 'class', id: 'orbit', account: 'orbit-week', vite: true },
  money: { repo: 'Orbit-Money', slug: 'money', id: 'money', account: 'money' },
  words: { repo: 'Orbit-Words', slug: 'words', id: 'vocab', account: 'words-demo' },
  beats: { repo: 'Orbit-Beats', slug: 'beats', id: 'beats' },
  law: { repo: 'Orbit-Law', slug: 'law', id: 'law', account: 'law-follows' },
  securities: { repo: 'Orbit-Securities', slug: 'securities', id: 'stock', account: 'securities-demo' }
};

const sh = (cmd, args, opts = {}) => execFileSync(cmd, args, { maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'], ...opts });
// A repo's paths at `ref` into `to` (git archive), or the working tree's when ref is 'work'.
function take(repo, ref, paths, to) {
  mkdirSync(to, { recursive: true });
  const src = join(ROOT, repo);
  if (ref === 'work') {
    for (const p of paths) if (existsSync(join(src, p))) cpSync(join(src, p), join(to, p), { recursive: true, dereference: true });
    return 'work';
  }
  const sha = String(sh('git', ['-C', src, 'rev-parse', ref])).trim();
  const have = paths.filter(p => {
    try {
      sh('git', ['-C', src, 'cat-file', '-e', `${sha}:${p}`]);
      return true;
    } catch {
      return false;
    }
  });
  const tar = sh('git', ['-C', src, 'archive', sha, ...have]);
  execFileSync('tar', ['-x', '-C', to], { input: tar });
  return sha.slice(0, 7);
}

// One side (`name`): the kit and every app asked for, built as deployed, into `dir`.
// `ref`: a git ref for every repo (each its own), or 'work'; `refs`: per repo.
// `next`: the same code with a push's worth of change (a line added to the
// kit's orbit.mjs and to each app's entry module), the deploy an open app
// updates to in the update step.
const NEXT = '\n;globalThis.__speedNext = 1;\n';
export async function buildSide({ name, ref = 'work', refs = {}, apps, dir: final, next = false }) {
  // (Every side built in one folder, then moved: the deploys build in the same
  // place each time, and a file's address must not change with where it was built.)
  const dir = join(dirname(final), 'stage');
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const at = repo => refs[repo] || ref;
  const made = { name, dir, apps: {}, kit: null };
  // The kit: its source (for each app's modulepreload list) and its built copy.
  made.kitSha = take('Orbit-Core', at('Orbit-Core'), ['kit', 'http.js'], join(dir, 'Orbit-Core'));
  // How this side's proxy sends an answer a line at a time (http.js lineAnswer: gzipped, each line
  // flushed, from 2026-11-05; before that as it was): the recorded lines are sent as it would.
  made.gzipLines = existsSync(join(dir, 'Orbit-Core/http.js')) ? (await import(pathToFileURL(join(dir, 'Orbit-Core/http.js')).href + `?${name}`)).gzipLines || null : null;
  if (next) appendFileSync(join(dir, 'Orbit-Core/kit/orbit.mjs'), NEXT);
  sh(process.execPath, [join(dir, 'Orbit-Core/kit/stamp.mjs'), join(dir, 'kit-out'), `speed-${name}`]);
  const kitVersion = JSON.parse(readFileSync(join(dir, 'kit-out/kit/version.json'), 'utf8'));
  made.kit = { version: kitVersion.version, files: kitVersion.files };
  // (In its own process: every side is built in the same folder, and a module imported once is
  // that one for good, its own imports (hash.mjs) too.)
  const stampApp = opts => sh(process.execPath, ['--input-type=module', '-e', `const { stampApp } = await import(${JSON.stringify(pathToFileURL(join(dir, 'Orbit-Core/kit/stamp-app.mjs')).href)}); await stampApp(JSON.parse(process.argv[1]));`, JSON.stringify(opts)]);
  for (const key of apps) {
    const a = APPS[key];
    const to = join(dir, a.repo);
    if (a.vite) {
      // Class: built by Vite in a copy of the repo (its node_modules linked).
      const work = join(dir, a.repo);
      const sha = take(a.repo, at(a.repo), ['src', 'public', 'css', 'index.html', 'package.json', 'vite.config.js', '.nojekyll'], work);
      if (!existsSync(join(work, 'node_modules'))) symlinkSync(join(ROOT, a.repo, 'node_modules'), join(work, 'node_modules'));
      if (!existsSync(join(work, '.kit'))) symlinkSync(join(dir, 'Orbit-Core/kit'), join(work, '.kit'));
      if (!existsSync(join(work, '.nojekyll'))) writeFileSync(join(work, '.nojekyll'), '');
      sh(join(ROOT, a.repo, 'node_modules/.bin/vite'), ['build'], { cwd: work });
      made.apps[key] = { site: join(work, 'dist'), sha };
      continue;
    }
    const sha = take(a.repo, at(a.repo), ['public'], to);
    if (next) {
      const entry = /<script type="module" src="\.\/([^"?]+)"/.exec(readFileSync(join(to, 'public/index.html'), 'utf8'))?.[1];
      if (entry) appendFileSync(join(to, 'public', entry), NEXT);
    }
    stampApp({ root: join(to, 'public'), version: `speed-${name}-${sha}`, kitDir: join(dir, 'Orbit-Core/kit'), kit: made.kit });
    made.apps[key] = { site: join(to, 'public'), sha };
  }
  rmSync(final, { recursive: true, force: true });
  renameSync(dir, final);
  made.dir = final;
  for (const a of Object.values(made.apps)) a.site = join(final, relative(dir, a.site));
  writeFileSync(join(final, 'side.json'), JSON.stringify(made, null, 1));
  return made;
}

// ---- Serving ----
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.txt': 'text/plain', '.xml': 'application/xml' };
const TEXT = /^(text\/|application\/(json|javascript|manifest\+json|xml)|image\/svg)/;
// Cloudflare compresses text on the fly at about Brotli's quality 4 (the
// live site's own sizes, read 2026-11-05).
const packed = new Map();
function encode(body, type, accepts) {
  if (!TEXT.test(type || '') || body.length < 64 || !/\bbr\b/.test(accepts || '')) return { data: body, enc: null };
  const k = createHash('sha1').update(body).digest('hex');
  if (!packed.has(k)) packed.set(k, brotliCompressSync(body, { params: { [Z.BROTLI_PARAM_QUALITY]: 4, [Z.BROTLI_PARAM_SIZE_HINT]: body.length } }));
  return { data: packed.get(k), enc: 'br' };
}
const etagOf = body => `"${createHash('sha1').update(body).digest('hex').slice(0, 20)}"`;
// A static answer as Workers' static assets give it.
function asset(body, type, req, extra = {}) {
  const etag = etagOf(body);
  const headers = { 'content-type': type, 'cache-control': 'public, max-age=0, must-revalidate', etag, ...extra };
  if (String(req.headers['if-none-match'] || '') === etag) return { status: 304, headers, chunks: [], serverMs: 6, kind: 'static', raw: 0 };
  const { data, enc } = encode(body, type, req.accepts);
  if (enc) headers['content-encoding'] = enc;
  return { status: 200, headers, chunks: [{ t: 6, data }], serverMs: 6, kind: 'static', raw: body.length };
}

// ---- What came from outside: recorded once, replayed ----
// (Volatile parts of an address left out of its key: the session, cache-busters.)
const VOLATILE = new Set(['qt', 't', '_', 'ts', 'cb', 'nocache', 'now']);
function keyOf(method, url, body) {
  const u = new URL(url);
  for (const k of [...u.searchParams.keys()]) if (VOLATILE.has(k)) u.searchParams.delete(k);
  u.searchParams.sort();
  return `${method} ${u.toString()}${body?.length ? ` ${createHash('sha1').update(body).digest('hex').slice(0, 12)}` : ''}`;
}
export function recorder(file, { live = true } = {}) {
  const map = new Map();
  if (existsSync(file))
    for (const line of readFileSync(file, 'utf8').split('\n')) {
      if (!line) continue;
      try {
        const r = JSON.parse(line);
        map.set(r.key, r);
      } catch {}
    }
  const pending = new Map();
  const stats = { replayed: 0, recorded: 0, missed: 0 };
  // `fetchFn(url, init)` → the live answer; kept with the Worker's own time (Server-Timing w;dur).
  const get = async (method, url, body, fetchLive) => {
    const key = keyOf(method, url, body);
    if (map.has(key)) return (stats.replayed++, map.get(key));
    if (!live) return (stats.missed++, null);
    if (!pending.has(key))
      pending.set(
        key,
        (async () => {
          const t0 = performance.now();
          let r;
          try {
            r = await fetchLive();
          } catch (e) {
            return { key, status: 599, headers: {}, body: '', ms: 0, note: String(e?.message || e).slice(0, 100) };
          }
          const buf = Buffer.from(await r.arrayBuffer());
          const ms = Math.round(performance.now() - t0);
          const keep = {};
          for (const h of ['content-type', 'cache-control', 'server-timing', 'access-control-allow-origin', 'x-sports-proxy-cache', 'age']) if (r.headers.get(h)) keep[h] = r.headers.get(h);
          const rec = { key, status: r.status, headers: keep, body: buf.toString('base64'), ms, at: Date.now() };
          // (A failure isn't kept: asked again next time.)
          if (r.status < 500 && r.status !== 429) {
            map.set(key, rec);
            appendFileSync(file, JSON.stringify(rec) + '\n');
            stats.recorded++;
          }
          return rec;
        })().finally(() => pending.delete(key))
      );
    return pending.get(key);
  };
  return { get, stats, size: () => map.size };
}
// The Worker's own time in an answer (Server-Timing: w;dur=12.3), else a guess from the wall time.
function workerMs(rec) {
  const m = /\bw;dur=([\d.]+)/.exec(rec.headers?.['server-timing'] || '');
  return m ? Number(m[1]) : Math.min(rec.ms || 50, 300);
}

// ---- The made-up Pass (as tools/preview.mjs's) ----
export const REFRESH = `${Buffer.from(JSON.stringify({ d: '0123456789abcdef0123456789abcdef' })).toString('base64url')}.preview`;
export function accountOf(key) {
  const a = APPS[key];
  if (!a.account) return '';
  if (a.account === 'money') {
    const kitLink = join(ROOT, 'Orbit-Money/.kit');
    if (!existsSync(kitLink)) symlinkSync('../Orbit-Core/kit', kitLink);
    return String(execFileSync(process.execPath, [join(ROOT, 'Orbit-Money/tools/sample-books.mjs')], { cwd: join(ROOT, 'Orbit-Money'), encoding: 'utf8' }));
  }
  const f = join(CORE, 'tools/shots/accounts', `${a.account}.txt`);
  return existsSync(f) ? readFileSync(f, 'utf8') : '';
}
// The Pass as the Worker keeps it (eco.js), as far as an app's sync can
// tell: the app's data has a version (updateTime) and a read `since` it
// answers `unchanged`; a write over another version (`base`) is refused; the
// wallet's settings are merged, newest wins per key. (Without these, an app
// that writes "when the Pass's copy differs" wrote at every opening here,
// as it never does live.)
function ecoAnswer(dev, body, method, url) {
  const now = Date.now();
  dev.wallet ||= { v: 1, created: now - 120 * 86_400_000, entries: [{ id: 'eco:start', t: now - 120 * 86_400_000, app: 'eco', kind: 'start', amount: 200000 }], snap: {}, settings: {}, apps: { [dev.appId]: { first: now - 60 * 86_400_000, last: now - 86_400_000 } }, inbox: {} };
  dev.payloadAt ??= dev.payload ? 'v0' : '';
  // (SPEED_ECO=1: what each Pass call carried, to see why an app writes.)
  if (process.env.SPEED_ECO) console.log(`  eco ${dev.app} ${dev.sideName} ${method} ${body?.op || url.search} ${body ? Object.entries(body).filter(([k]) => !['qt', 'refresh'].includes(k)).map(([k, v]) => `${k}=${typeof v === 'string' ? (v.length > 40 ? `${v.length}ch` : v) : JSON.stringify(v)?.slice(0, 160)}`).join(' ') : ''}`);
  const reply = { token: 'preview', wallet: dev.wallet, active: true, live: { app: dev.appId } };
  if (body?.op === 'write') {
    if (typeof body.payload === 'string') {
      if (body.base && body.base !== dev.payloadAt) return { status: 409, body: { error: { code: 'ECO_DATA_CHANGED', message: 'ECO_DATA_CHANGED' }, updateTime: dev.payloadAt } };
      dev.payload = body.payload;
      dev.payloadAt = `v${(dev.writes = (dev.writes || 0) + 1)}`;
      reply.updateTime = dev.payloadAt;
    }
    for (const [k, v] of Object.entries(body.wallet?.settings || {})) if (!(dev.wallet.settings[k]?.t > v?.t)) dev.wallet.settings[k] = v;
  }
  const data = since => (since && since === dev.payloadAt ? { unchanged: true, updateTime: dev.payloadAt, inbox: [] } : { payload: dev.payload ?? '', updateTime: dev.payloadAt, inbox: [] });
  if (method === 'POST' && ['refresh', 'login', 'redeem'].includes(body?.op)) Object.assign(reply, data(body.since));
  if (method === 'GET' && url.searchParams.get('app')) Object.assign(reply, data(url.searchParams.get('since')));
  return { status: 200, body: reply };
}

// The API's routes that would spend (Gemini) or need a real Pass: never asked live.
const NEVER = /^\/(gemini|nl-edit|law-ask|law-chat|money-read|law-page|stock|showcase|gift|store)\b/;
// The routes the proxy's dev door answers a localhost page without a Pass (worker.js, sports.js).
const LIVE_API = 'https://api.jaypengx.com';

// handle(dev, req) for net.mjs: the device's side (`dev.side`: a built side), its app.
export function siteHandler({ rec }) {
  const json = (status, obj, extra = {}) => {
    const body = Buffer.from(JSON.stringify(obj));
    const { data, enc } = encode(body, 'application/json', 'br');
    return { status, headers: { 'content-type': 'application/json', ...(enc ? { 'content-encoding': enc } : {}), ...extra }, chunks: [{ t: 0, data }], serverMs: 8, kind: 'api', raw: body.length };
  };
  const replay = (r, req, kind, dev) => {
    if (!r) return json(504, { error: 'not recorded' });
    if (r.status === 599) return { ...json(502, { error: 'upstream' }), note: r.note, kind };
    const body = Buffer.from(r.body, 'base64');
    const type = r.headers['content-type'] || 'application/octet-stream';
    const headers = { ...r.headers };
    delete headers['server-timing'];
    if (/x-ndjson/.test(type) && dev?.side?.gzipLines && /\bgzip\b/.test(req.accepts || '')) {
      const g = dev.side.gzipLines();
      const parts = String(body).split(/(?<=\n)/).map(l => g.write(Buffer.from(l)));
      return { status: r.status, headers: { ...headers, 'content-encoding': 'gzip' }, chunks: [{ t: 0, data: Buffer.concat([...parts, g.end()].map(p => Buffer.from(p))) }], serverMs: kind === 'api' ? workerMs(r) : 25, kind, raw: body.length };
    }
    const { data, enc } = encode(body, type, req.accepts);
    if (enc) headers['content-encoding'] = enc;
    return { status: r.status, headers, chunks: [{ t: 0, data }], serverMs: kind === 'api' ? workerMs(r) : 25, kind, raw: body.length };
  };
  return async (dev, req) => {
    const { host, url, method } = req;
    const side = dev.side;
    if (host === HOST) {
      const path = decodeURIComponent(url.pathname);
      if (path.startsWith('/api/')) {
        const route = path.slice(4);
        if (route === '/eco' || route.startsWith('/eco/')) {
          let body = null;
          try {
            body = req.body.length ? JSON.parse(req.body.toString()) : null;
          } catch {}
          const answer = ecoAnswer(dev, body, method, url);
          return { ...json(answer.status, answer.body), route: `/eco ${body?.op || (url.searchParams.get('app') ? 'read' : method.toLowerCase())}`, serverMs: 25 };
        }
        if (route.startsWith('/push')) return { ...json(200, route === '/push/key' ? { key: 'BJAq2pf1eAmgD3fRzfyXE5dXeDlg2qUZDyIzQ-1SHCNkWr3UQvUtaHgtZ1eQPMl00SAGgejtNE5jkRQCS2Zi6lE' } : { ok: true }), route: '/push' };
        if (NEVER.test(route)) return { ...json(503, { error: 'not in speed runs' }), route: route.split('/').slice(0, 2).join('/') };
        const live = `${LIVE_API}${route}${url.search}`;
        const r = await (dev.rec || rec).get(method, live, method === 'GET' ? null : req.body, () => {
          const u = new URL(live);
          u.searchParams.delete('qt');
          return fetch(u, { method, headers: { Origin: 'http://localhost:8123', ...(req.body.length ? { 'Content-Type': req.headers['content-type'] || 'text/plain' } : {}) }, body: method === 'GET' || method === 'HEAD' ? undefined : req.body, signal: AbortSignal.timeout(30_000) });
        });
        return { ...replay(r, req, 'api', dev), route: route.split('/').slice(0, 2).join('/') + (route.startsWith('/sports-proxy') && url.searchParams.has('batch') ? ' batch' : '') };
      }
      if (path.startsWith('/Orbit-Core/kit/')) {
        const file = join(side.dir, 'kit-out/kit', path.slice('/Orbit-Core/kit/'.length));
        if (existsSync(file) && statSync(file).isFile()) return asset(readFileSync(file), TYPES[extname(file)] || 'application/octet-stream', req);
        return json(404, { error: 'no kit file' });
      }
      const m = /^\/([^/]+)(\/.*)?$/.exec(path);
      const key = m && Object.keys(APPS).find(k => APPS[k].slug === m[1]);
      const site = key && side.apps[key]?.site;
      if (site) {
        let file = join(site, m[2] || '/');
        if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
        if (existsSync(file)) return asset(readFileSync(file), TYPES[extname(file)] || 'application/octet-stream', req);
        // What a deploy writes and git doesn't have (Orbit Law's data, 60 MB;
        // Sports' nba-elta.json): the live site's.
        if (!/\.(m?js|css|html)$/.test(path)) {
          const r = await (dev.rec || rec).get('GET', `https://${HOST}${path}`, null, () => fetch(`https://${HOST}${path}`, { signal: AbortSignal.timeout(30_000) }));
          if (r?.status === 200) return asset(Buffer.from(r.body, 'base64'), r.headers['content-type'] || 'application/json', req);
        }
      }
      return { status: 404, headers: { 'content-type': 'text/plain' }, chunks: [{ t: 6, data: Buffer.from('not found') }], serverMs: 6, kind: 'static', raw: 9 };
    }
    // Anywhere else (ESPN, pictures, fonts): the live answer, recorded.
    const target = `https://${host}${url.pathname}${url.search}`;
    const r = await (dev.rec || rec).get(method, target, method === 'GET' ? null : req.body, () =>
      fetch(target, { method, headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1', Accept: req.headers.accept || '*/*', ...(req.headers.origin ? { Origin: `https://${HOST}` } : {}) }, body: method === 'GET' || method === 'HEAD' ? undefined : req.body, redirect: 'follow', signal: AbortSignal.timeout(30_000) })
    );
    return replay(r, req, 'outside', dev);
  };
}
