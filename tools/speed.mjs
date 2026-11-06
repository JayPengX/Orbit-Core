// Every load an app makes, timed on a phone's link: the first opening, each
// tab, a scroll, half a minute left open, and opening it again; for each,
// the time the person waits, the data and requests it took, the phone's
// CPU (a mid phone: 4× slower than this machine), memory, redraws, long
// tasks and dropped frames, and the proxy's requests and their CPU. A
// "before" (a git ref, main by default) against an "after" (the working
// tree), the same recorded world for both (tools/speed/site.mjs), on a
// 3G-like link by default (tools/speed/net.mjs: 400 kbps, 400 ms).
//
//   node tools/speed.mjs <app…|all> [--before main] [--after work] [--net 3g|4g|wifi]
//        [--cpu 4] [--steps open,idle,tabs,scroll,away,reopen,update,relaunch] [--idle 30] [--out dir] [--only before|after]
//        [--warm] [--at <ISO time>] [--refresh-after <regex>] [--verbose]
//
// Needs the app repos beside this one (as tools/test-apps.mjs), Chromium
// (Playwright's), openssl, and port 443 free (it serves every host there:
// Chromium maps every name to a loopback address of its own, one per run).
import { createRequire } from 'node:module';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

// Node's fetch through this machine's proxy, where it has one (recording the live answers).
if ((process.env.HTTPS_PROXY || process.env.https_proxy) && !process.env.NODE_USE_ENV_PROXY) {
  const r = spawnSync(process.execPath, process.argv.slice(1), { stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' } });
  process.exit(r.status ?? 1);
}

const { PROFILES, Link, startServer, now, tls, HANDSHAKE } = await import('./speed/net.mjs');
const { APPS, HOST, REFRESH, accountOf, buildSide, recorder, siteHandler } = await import('./speed/site.mjs');
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const argv = process.argv.slice(2);
const opt = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : def;
};
const flags = new Set(argv.filter(a => a.startsWith('--')).map(a => a.slice(2)));
const valued = new Set(['before', 'after', 'net', 'cpu', 'steps', 'idle', 'out', 'only', 'runs', 'record', 'at', 'refresh-after']);
const named = argv.filter((a, i) => !a.startsWith('--') && !(i > 0 && argv[i - 1].startsWith('--') && valued.has(argv[i - 1].slice(2))));
const apps = named.includes('all') || !named.length ? Object.keys(APPS) : named;
for (const a of apps) if (!APPS[a]) throw new Error(`no app ${a}: ${Object.keys(APPS).join(' ')}`);
const net = opt('net', '3g');
const profile = PROFILES[net];
if (!profile) throw new Error(`--net ${net}: ${Object.keys(PROFILES).join('|')}`);
const cpu = Number(opt('cpu', 4));
const steps = opt('steps', 'open,idle,tabs,scroll,away,reopen').split(',');
const idleS = Number(opt('idle', 30));
const out = resolve(opt('out', join(tmpdir(), 'orbit-speed', new Date().toISOString().slice(0, 16).replace(/[-:T]/g, ''))));
const work = join(tmpdir(), 'orbit-speed-build');
mkdirSync(out, { recursive: true });
const recFile = resolve(opt('record', join(out, '..', 'record.jsonl')));
// One clock for every run against the same record: the pages are told it's the
// moment the record began (and on from there), so "today" asks the same things
// before and after, whenever the runs are made (--at sets it; clock.json keeps it).
const clockFile = join(recFile, '..', 'clock.json');
const clockAt = opt('at') ? Date.parse(opt('at')) : existsSync(clockFile) ? JSON.parse(readFileSync(clockFile, 'utf8')).at : Date.now();
if (!existsSync(clockFile) || opt('at')) writeFileSync(clockFile, JSON.stringify({ at: clockAt, iso: new Date(clockAt).toISOString() }));
const clockShift = clockAt - Date.now();
// --warm: each app once on Wi-Fi first, unmeasured, so what's new is recorded before it's timed.
const warm = flags.has('warm');
const sides = [
  // (A long piece of work: tag each repo's main as it began, `git tag speed-before`, and pass
  // --before speed-before, so pushing along the way doesn't move the before.)
  ['before', opt('before', 'main')],
  ['after', opt('after', 'work')]
].filter(([n]) => !opt('only') || opt('only') === n);

// ---- Build each side ----
const built = {};
for (const [name, ref] of sides) {
  const t = Date.now();
  built[name] = await buildSide({ name, ref, apps, dir: join(work, name) });
  console.log(`built ${name} (${ref}): kit ${built[name].kit.version}, ${apps.map(a => `${a} ${built[name].apps[a].sha}`).join(', ')} in ${Math.round((Date.now() - t) / 1000)} s`);
  // The deploy the update step lands: this side's code with a push's worth of change.
  if (steps.includes('update') || steps.includes('relaunch')) built[`${name}-next`] = await buildSide({ name: `${name}-next`, ref, apps, dir: join(work, `${name}-next`), next: true });
}

// ---- The server ----
const devices = new Map();
const rec = recorder(recFile);
// --refresh-after <regex>: addresses the after side reads fresh (once, then
// kept apart in record-after.jsonl): what a change on the server made
// different (a slimmer pack), while the before side keeps the old answer.
const refreshAfter = opt('refresh-after') ? new RegExp(opt('refresh-after')) : null;
const recAfter = refreshAfter ? recorder(join(recFile, '..', 'record-after.jsonl')) : null;
const afterRec = recAfter && { get: (m, u, b, f) => (refreshAfter.test(u) ? recAfter : rec).get(m, u, b, f), stats: rec.stats };
const { server, close } = await startServer({ devices, handle: siteHandler({ rec }) });
const { spki } = tls();
let ipN = 20 + (process.pid % 200);
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([k]) => !/proxy/i.test(k)));
const pageScript = readFileSync(new URL('./speed/page.js', import.meta.url), 'utf8');

// What the proxy's routes cost in CPU on Cloudflare (ms a request), as
// tools' tail.yml read them live on 2026-11-05 (15 minutes): an estimate
// of what each step asks of the Workers. Transit's bus times by route, read
// again on 2026-11-06 once transit.js stopped parsing a whole city for each
// quiet ask (eta 61 → 6.6, running 48 → 24.7); its other routes, '/transit'.
const WORKER_CPU = { '/sports-proxy batch': 20.6, '/sports-proxy': 3.0, '/sports-today': 72, '/config': 0.86, '/weather': 19.6, '/transit eta': 6.6, '/transit running': 24.7, '/transit tdx': 3.3, '/transit': 5.6, '/data': 2.5, '/eco': 4, '/flight': 5, '/law-live': 3, '/push': 2 };

async function device(app, side, prof = profile) {
  const ip = `127.0.0.${ipN++}`;
  const a = APPS[app];
  const dev = { ip, side: built[side], sideName: side, rec: side === 'after' ? afterRec : null, app, appId: a.id, payload: accountOf(app), link: new Link(prof), log: [], inflight: 0, zero: now(), step: null };
  devices.set(ip, dev);
  const dir = join(work, `profile-${ip}`);
  rmSync(dir, { recursive: true, force: true });
  // `later`: ms the page's clock is ahead (opening the app again a while after).
  const launch = async (later = 0) => {
    const ctx = await chromium.launchPersistentContext(dir, {
      args: [`--host-resolver-rules=MAP * ${ip}, EXCLUDE localhost`, `--ignore-certificate-errors-spki-list=${spki}`, '--no-proxy-server', '--disable-features=PrivacySandboxSettings4'],
      env: cleanEnv,
      viewport: { width: 390, height: 844 },
      deviceScaleFactor: 3,
      isMobile: true,
      hasTouch: true,
      userAgent: IPHONE,
      locale: 'zh-TW',
      timezoneId: 'Asia/Taipei',
      serviceWorkers: 'allow',
      ...(a.geo ? { permissions: ['geolocation'], geolocation: { latitude: a.geo[0], longitude: a.geo[1], accuracy: 20 } } : {})
    });
    await ctx.addInitScript(pageScript);
    // The run's clock (Date only: timers and performance.now stay real).
    await ctx.addInitScript(shift => {
      const Real = Date;
      const at = () => Real.now() + shift;
      function D(...a) {
        if (!new.target) return new Real(at()).toString();
        return a.length ? new Real(...a) : new Real(at());
      }
      D.prototype = Real.prototype;
      D.now = at;
      D.parse = Real.parse;
      D.UTC = Real.UTC;
      Object.defineProperty(D, 'name', { value: 'Date' });
      globalThis.Date = D;
    }, clockShift + later);
    // Opened from the home screen, signed in (as tools/preview.mjs).
    await ctx.addInitScript(refresh => {
      Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true });
      try {
        if (!localStorage.getItem('orbit.refresh')) {
          localStorage.setItem('orbit.refresh', refresh);
          localStorage.setItem('orbit.account', '0123456789abcdef');
          localStorage.setItem('orbit.lang', 'zh');
        }
      } catch {}
    }, REFRESH);
    return ctx;
  };
  return { dev, ctx: await launch(), launch };
}

const M = list => Object.fromEntries(list.metrics.map(m => [m.name, m.value]));
async function quietFor(page, dev, { quiet = 1500, max = 60_000, since = now() } = {}) {
  // Until nothing is asked for `quiet` ms and the page hasn't changed for 600 ms (or `max`).
  let lastBusy = now();
  const end = since + max;
  while (now() < end) {
    if (dev.inflight > 0) lastBusy = now();
    const idleFor = await page.evaluate(() => performance.now() - (window.__speed?.lastMut || 0)).catch(() => 0);
    if (now() - lastBusy >= quiet && idleFor >= 600) return { timedOut: false };
    await new Promise(r => setTimeout(r, 100));
  }
  return { timedOut: true };
}
async function readings(page, cdp) {
  const m = M(await cdp.send('Performance.getMetrics'));
  const s = await page.evaluate(() => ({ mut: __speed.mut, long: __speed.long.slice(), lastMut: __speed.lastMut, ready: __speed.ready, lcp: __speed.lcp, cls: __speed.cls, events: __speed.events.slice() })).catch(() => ({ mut: 0, long: [], events: [] }));
  return { m, s, t: now() };
}
async function heapMB(cdp) {
  await cdp.send('HeapProfiler.collectGarbage').catch(() => {});
  const h = await cdp.send('Runtime.getHeapUsage').catch(() => null);
  return h ? +(h.usedSize / 1e6).toFixed(1) : null;
}
// One step: what it asked over the link, and what the phone did.
async function step(name, page, cdp, dev, fn, { settle = true, max = 60_000 } = {}) {
  dev.step = { name, log: [], handshakes: 0, zero: now() - dev.zero };
  const r0 = await readings(page, cdp);
  const pageT0 = await page.evaluate(() => performance.now()).catch(() => 0);
  const extra = (await fn()) || {};
  const q = settle ? await quietFor(page, dev, { max }) : { timedOut: false };
  const r1 = await readings(page, cdp);
  const log = dev.step.log;
  const kb = log.reduce((s, e) => s + e.bytes, 0) + dev.step.handshakes * HANDSHAKE;
  const routes = {};
  let workerCpu = 0;
  for (const e of log)
    if (e.kind === 'api' && e.route) {
      routes[e.route] = (routes[e.route] || 0) + 1;
      workerCpu += WORKER_CPU[e.route] ?? WORKER_CPU[e.route.split(' ')[0]] ?? 3;
    }
  const long = r1.s.long.filter(([t]) => t >= (extra.pageT0 ?? pageT0));
  // (A page the app swapped itself, an update: the counts start again with the new page, so they are its own.)
  const since = k => ((r1.m[k] || 0) >= (r0.m[k] || 0) ? (r1.m[k] || 0) - (r0.m[k] || 0) : r1.m[k] || 0);
  const res = {
    name,
    // When the person has it: the first screen (the cover gone), or the last change drawn after the tap.
    readyMs: extra.readyMs ?? (r1.s.lastMut && r1.s.lastMut > pageT0 ? Math.round(r1.s.lastMut - pageT0) : 0),
    settledMs: Math.round((q.timedOut ? max : r1.t - r0.t) - (settle ? 1500 : 0)),
    timedOut: q.timedOut,
    kb: +(kb / 1000).toFixed(1),
    requests: log.length,
    notModified: log.filter(e => e.status === 304).length,
    handshakes: dev.step.handshakes,
    byKind: Object.fromEntries(['static', 'api', 'outside'].map(k => [k, +(log.filter(e => e.kind === k).reduce((s, e) => s + e.bytes, 0) / 1000).toFixed(1)])),
    api: routes,
    workerCpuMs: Math.round(workerCpu),
    cpuMs: Math.round(since('TaskDuration') * 1000),
    scriptMs: Math.round(since('ScriptDuration') * 1000),
    layouts: since('LayoutCount'),
    styles: since('RecalcStyleCount'),
    mutations: r1.s.mut - (extra.resetMut ? 0 : r0.s.mut),
    longTasks: long.length,
    blockingMs: long.reduce((s, [, d]) => s + Math.max(0, d - 50), 0),
    nodes: r1.m.Nodes || 0,
    heapMB: await heapMB(cdp),
    ...extra.more,
    // Every request: [ms from the step's start, host, path, status, bytes on the wire, kind, the proxy's route, ms it took]
    log: log.map(e => [Math.round(e.at - (dev.step.zero ?? 0)), e.host, e.path.slice(0, 160), e.status, e.bytes, e.kind, e.route || '', Math.round(e.done - e.at)])
  };
  dev.step = null;
  if (flags.has('verbose')) console.log(`  ${dev.app} ${dev.sideName} ${name}: ready ${res.readyMs} ms, settled ${res.settledMs}${res.timedOut ? '+' : ''} ms, ${res.kb} KB, ${res.requests} req, CPU ${res.cpuMs} ms`);
  return res;
}

const REOPEN_AFTER = 15 * 60_000;
async function openPage(ctx, rate = cpu) {
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Performance.enable');
  if (rate > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate });
  return { page, cdp };
}
async function waitReady(page, max = 90_000) {
  const t = Date.now();
  while (Date.now() - t < max) {
    const r = await page.evaluate(() => window.__speed?.ready).catch(() => null);
    if (r != null) return r;
    await new Promise(res => setTimeout(res, 100));
  }
  return null;
}

async function runApp(app, side, { prof = profile, rate = cpu, idle = idleS } = {}) {
  let { dev, ctx, launch } = await device(app, side, prof);
  const url = `https://${HOST}/${APPS[app].slug}/`;
  const results = [];
  let { page, cdp } = await openPage(ctx, rate);
  const errors = [];
  let tabs = [];
  page.on('pageerror', e => errors.push(String(e.message || e).slice(0, 160)));
  try {
    if (steps.includes('open'))
      results.push(
        await step('open', page, cdp, dev, async () => {
          await page.goto(url, { waitUntil: 'commit', timeout: 120_000 });
          const ready = await waitReady(page);
          const lcp = await page.evaluate(() => __speed.lcp).catch(() => 0);
          return { readyMs: ready, resetMut: true, pageT0: 0, more: { lcpMs: lcp } };
        }, { max: 90_000 })
      );
    if (steps.includes('idle'))
      results.push(
        await step(`idle ${idleS}s`, page, cdp, dev, async () => {
          await page.waitForTimeout(idle * 1000);
          return { readyMs: 0 };
        }, { settle: false })
      );
    tabs = await page.evaluate(() => [...document.querySelectorAll('.q-tab[data-tab]')].map(b => b.dataset.tab)).catch(() => []);
    if (steps.includes('tabs'))
      for (const tab of tabs.slice(1).concat(tabs.slice(0, 1))) {
        results.push(
          await step(`tab ${tab}`, page, cdp, dev, async () => {
            await page.click(`.q-tab[data-tab="${tab}"]`, { timeout: 10_000 }).catch(() => {});
          })
        );
      }
    if (steps.includes('scroll'))
      results.push(
        await step('scroll', page, cdp, dev, async () => {
          await page.evaluate(() => __speed.frameStart());
          await cdp.send('Input.synthesizeScrollGesture', { x: 195, y: 600, yDistance: -2400, speed: 1600, gestureSourceType: 'touch' }).catch(() => {});
          await cdp.send('Input.synthesizeScrollGesture', { x: 195, y: 300, yDistance: 2400, speed: 1600, gestureSourceType: 'touch' }).catch(() => {});
          const gaps = await page.evaluate(() => __speed.frames());
          const sorted = [...gaps].sort((x, y) => x - y);
          return { readyMs: 0, more: { frames: gaps.length, jank: gaps.filter(g => g > 34).length, worstFrameMs: Math.round(sorted.at(-1) || 0), p95FrameMs: Math.round(sorted[Math.floor(sorted.length * 0.95)] || 0) } };
        })
      );
    // The person switches to another app and comes back: what the app (and
    // its service worker) asks while it's in the background, and on its return.
    if (steps.includes('away')) {
      const show = visible =>
        page.evaluate(v => {
          for (const [k, value] of [['visibilityState', v ? 'visible' : 'hidden'], ['hidden', !v]]) Object.defineProperty(document, k, { value, configurable: true });
          document.dispatchEvent(new Event('visibilitychange'));
          window.dispatchEvent(new Event(v ? 'pageshow' : 'pagehide'));
          // (Back on screen: the browser's own answer again. Left saying 'visible', the page leaving
          // for an update later read it in its real visibilitychange and drew its screen again on
          // the way out, which no phone does: Securities' logos asked 76 times as it went.)
          if (v) for (const k of ['visibilityState', 'hidden']) delete document[k];
        }, visible);
      results.push(await step('away', page, cdp, dev, async () => (await show(false), { readyMs: 0 })));
      results.push(await step('back', page, cdp, dev, async () => void (await show(true))));
    }
    // A deploy while the app is open (the same side's code with a line
    // changed in the kit's orbit.mjs and in the app's entry module, so each
    // side's update is timed on both ends, on the same change), and the person
    // comes back to it: what the phone downloads until the new version is on
    // screen, and how long.
    if (steps.includes('update') && built[`${side}-next`]) {
      results.push(
        await step('update', page, cdp, dev, async () => {
          const t0 = now();
          dev.side = built[`${side}-next`];
          // (Since 11-06 an open page isn't swapped in front of the person: the update downloads behind it, and no load comes.)
          const moved = page.waitForNavigation({ timeout: 20_000, waitUntil: 'commit' }).catch(() => null);
          await page.evaluate(() => (document.dispatchEvent(new Event('visibilitychange')), window.dispatchEvent(new Event('focus'))));
          if (!(await moved)) return { readyMs: null, more: { updated: false } };
          await waitReady(page);
          const live = await page.evaluate(() => [document.querySelector('meta[name="build-version"]')?.content || '', window.ORBIT_KIT?.version || '']).catch(() => []);
          return { readyMs: Math.round(now() - t0), resetMut: true, pageT0: 0, more: { updated: true, live } };
        }, { max: 120_000 })
      );
      // (The steps after it run on the version it landed: a reopen is the updated app's.)
    }
    // The person opens the app from the home screen after a deploy that came
    // while it was closed (Jay 2026-11-06: "always stuck here so long after an
    // update"): the phone has the old version kept; the time until a screen is
    // up (the cover gone for good), the version it shows, and what it took.
    if (steps.includes('relaunch') && built[`${side}-next`] && dev.side !== built[`${side}-next`]) {
      await ctx.close();
      for (let t = Date.now(); dev.inflight > 0 && Date.now() - t < 30_000; ) await new Promise(r => setTimeout(r, 100));
      dev.side = built[`${side}-next`];
      ctx = await launch(REOPEN_AFTER);
      ({ page, cdp } = await openPage(ctx, rate));
      page.on('pageerror', e => errors.push(String(e.message || e).slice(0, 160)));
      results.push(
        await step('relaunch', page, cdp, dev, async () => {
          const t0 = now();
          let loads = 0;
          page.on('framenavigated', f => f === page.mainFrame() && loads++);
          await page.goto(url, { waitUntil: 'commit', timeout: 120_000 });
          // Up for good: the cover gone and no reload under way (the page the person then uses).
          let shownAt = null;
          let version = '';
          for (const end = Date.now() + 90_000; Date.now() < end; ) {
            const r = await page.evaluate(() => [window.__speed?.ready, document.querySelector('meta[name="build-version"]')?.content || '', Boolean(window.__bootUpdating)]).catch(() => [null, '', true]);
            if (r[0] != null && !r[2]) {
              if (shownAt == null) shownAt = now();
              version = r[1];
              // (Still up 3 s later on the same page: that's the screen the person has.)
              if (now() - shownAt > 3000) break;
            } else shownAt = null;
            await new Promise(res => setTimeout(res, 100));
          }
          return { readyMs: shownAt == null ? null : Math.round(shownAt - t0), resetMut: true, pageT0: 0, more: { loads, version, newest: /-next-/.test(version) } };
        }, { max: 120_000 })
      );
    }
    if (steps.includes('reopen')) {
      // The app closed (the browser gone, its service worker too) and opened
      // again 15 minutes later: what was kept on the phone, and what's asked again.
      await ctx.close();
      for (let t = Date.now(); dev.inflight > 0 && Date.now() - t < 30_000; ) await new Promise(r => setTimeout(r, 100));
      ctx = await launch(REOPEN_AFTER);
      ({ page, cdp } = await openPage(ctx, rate));
      page.on('pageerror', e => errors.push(String(e.message || e).slice(0, 160)));
      results.push(
        await step('reopen', page, cdp, dev, async () => {
          await page.goto(url, { waitUntil: 'commit', timeout: 120_000 });
          const ready = await waitReady(page);
          const version = await page.evaluate(() => document.querySelector('meta[name="build-version"]')?.content || '').catch(() => '');
          return { readyMs: ready, resetMut: true, pageT0: 0, more: { version } };
        }, { max: 90_000 })
      );
    }
  } finally {
    await ctx.close().catch(() => {});
    devices.delete(dev.ip);
  }
  return { app, side, results, errors: [...new Set(errors)].slice(0, 8), tabs };
}

const all = [];
for (const app of apps)
  for (const [side] of sides) {
    if (warm) {
      const t = Date.now();
      const before = rec.stats.recorded;
      await runApp(app, side, { prof: PROFILES.wifi, rate: 1, idle: 5 });
      console.log(`${app} ${side}: warmed, ${rec.stats.recorded - before} new answers recorded (${Math.round((Date.now() - t) / 1000)} s)`);
    }
    const t = Date.now();
    const r = await runApp(app, side);
    all.push(r);
    writeFileSync(join(out, 'results.json'), JSON.stringify({ net: profile.name, cpu, at: new Date().toISOString(), sides: Object.fromEntries(sides), record: rec.stats, runs: all }, null, 1));
    const open = r.results.find(x => x.name === 'open');
    console.log(`${app} ${side}: open ${open ? `${(open.readyMs / 1000).toFixed(1)} s, ${open.kb} KB, ${open.requests} req` : '-'} (${Math.round((Date.now() - t) / 1000)} s)${r.errors.length ? ` errors: ${r.errors.join(' | ')}` : ''}`);
  }
await close();

// ---- The table ----
const fmtS = ms => (ms == null ? '—' : `${(ms / 1000).toFixed(1)} s`);
const lines = [`# Speed: ${profile.name}, CPU ×${cpu}`, '', `${new Date().toISOString()} · before ${sides.find(s => s[0] === 'before')?.[1] || '—'} · after ${sides.find(s => s[0] === 'after')?.[1] || '—'} · replayed ${rec.stats.replayed}, recorded ${rec.stats.recorded}`, ''];
for (const app of apps) {
  lines.push(`## ${app}`, '', '| step | side | ready | settled | KB | req | CPU ms | blocking ms | layouts | redraw nodes | heap MB | proxy req | proxy CPU ms |', '|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  const runs = all.filter(r => r.app === app);
  const names = [...new Set(runs.flatMap(r => r.results.map(x => x.name)))];
  for (const n of names)
    for (const r of runs) {
      const x = r.results.find(y => y.name === n);
      if (!x) continue;
      lines.push(`| ${n} | ${r.side} | ${fmtS(x.readyMs)} | ${fmtS(x.settledMs)}${x.timedOut ? '+' : ''} | ${x.kb} | ${x.requests} | ${x.cpuMs} | ${x.blockingMs} | ${x.layouts} | ${x.mutations} | ${x.heapMB ?? '—'} | ${Object.values(x.api).reduce((s, v) => s + v, 0)} | ${x.workerCpuMs} |`);
    }
  lines.push('');
}
writeFileSync(join(out, 'results.md'), lines.join('\n'));
console.log(`\n${out}/results.md`);
