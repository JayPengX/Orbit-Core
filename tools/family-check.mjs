// What went wrong most, again and again, across the family (git history and
// the 11-13 report of 419 fixes), checked on every app at once: each tab and
// its `check` pages (tools/shots/pages.mjs) on a phone (390), light, live
// data, in Chinese and in English. Where layout-check.mjs looks at the
// layout, this looks at whether the app works:
//
//   console errors  an uncaught error, a failed module or a 4xx/5xx read
//                   (a kit part removed and still called, a TDZ, 11-06, 11-12, 11-14)
//   stuck           the loading screen or a placeholder still up once the page
//                   has settled (12 s): the most-repeated fault, 10-21 → 11-15
//   chinese         English, yet Chinese on screen (One language, Jay 11-13)
//   cut             text cut short (the 176 layout-and-wording fixes' commonest)
//
//   node tools/family-check.mjs [app…] [--langs zh,en] [--screens 390,ipad,laptop] [--themes light,dark] [--engines chromium,webkit] [--out dir] [--read]
//
// A shot that can't be taken is said, never a failure. Exits 1 on a fault.
import './fonts.mjs';
import { execFile } from 'node:child_process';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { PAGES } from './shots/pages.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const args = process.argv.slice(2);
const opt = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  if (i < 0) return fallback;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const langs = opt('langs', 'zh,en').split(',');
// (The rest of the matrix, as shots.mjs takes it: --screens 390,ipad,laptop --themes light,dark --engines chromium,webkit.)
const screens = opt('screens', '390');
const themes = opt('themes', 'light');
const engines = opt('engines', 'chromium');
const out = opt('out', join(tmpdir(), 'orbit-family-check'));
// (--read: the last run's shots read again, none taken.)
const readOnly = args.includes('--read') && args.splice(args.indexOf('--read'), 1);
const ACCOUNT = { sports: 'fan', words: 'demo', money: 'demo', securities: 'demo', law: 'follows', weather: 'pins', transit: 'rides', orbit: 'week', class: 'week' };
const KINDS = new Set(['console errors', 'stuck', 'chinese', 'cut']);
const apps = args.length ? args : ['sports', 'transit', 'weather', 'orbit', 'money', 'news', 'words', 'beats', 'law', 'securities'];
const env = { ...process.env, ORBIT_LIVE_KEEP: process.env.ORBIT_LIVE_KEEP || join(tmpdir(), 'orbit-live-keep'), ORBIT_LIVE_KEEP_S: process.env.ORBIT_LIVE_KEEP_S || '900' };
const run = argv => new Promise(ok => execFile(process.execPath, argv, { cwd: join(HERE, '..'), env, maxBuffer: 64 << 20 }, (e, stdout, stderr) => ok({ code: e?.code || 0, text: `${stdout}${stderr}` })));

// (Not the app's: the console's own line beside each failed read, which the
// read's line says better; the cloud's browser reaching no other site
// directly (YouBike's, from the phone: net::ERR_FAILED here, fine on a phone);
// a file the deploy makes, missing from a checkout: live, it's there.)
const SLUGS = { Sports: 'sports', Transit: 'transit', Weather: 'weather', Money: 'money', News: 'news', Words: 'words', Beats: 'beats', Law: 'law', Securities: 'securities', Class: 'class' };
const onSite = new Map();
const liveHas = path => {
  const m = path.match(/^\/Orbit-(\w+)\/(.+)$/);
  if (!m || !SLUGS[m[1]]) return false;
  const url = `https://orbit.jaypengx.com/${SLUGS[m[1]]}/${m[2]}`;
  if (!onSite.has(url)) onSite.set(url, run(['-e', `fetch(${JSON.stringify(url)},{method:'HEAD'}).then(r=>console.log(r.status))`]).then(r => r.text.trim() === '200'));
  return onSite.get(url);
};
const said404 = new Map();
let noise = i => /^Failed to load resource|net::ERR_FAILED/.test(i) || said404.get(i) === true;
const settle404s = async cells => {
  for (const c of cells) for (const f of c.faults) for (const i of f.items) {
    const m = i.match(/^404 https?:\/\/localhost:\d+(\/\S+)/);
    if (m && !said404.has(i)) said404.set(i, await liveHas(m[1].split('?')[0]));
  }
};
const checkApp = async (app, lang) => {
  const key = app === 'class' ? 'orbit' : app;
  const book = PAGES[key] || PAGES[app] || {};
  const pages = ['tabs', ...(book.check || [])];
  const dir = join(out, `${app}-${lang}`);
  const accName = ACCOUNT[app] && [`${key}-${ACCOUNT[app]}.${lang}.txt`, `${key}-${ACCOUNT[app]}.txt`].find(f => existsSync(join(HERE, 'shots/accounts', f)));
  // (The account in the page's language where it has one: Class's English timetable.)
  const acc = accName ? ['--account', join(HERE, 'shots/accounts', accName)] : [];
  const r = readOnly ? { text: '' } : await run([join(HERE, 'shots.mjs'), key, ...pages, '--screens', screens, '--themes', themes, '--engines', engines, '--lang', lang, '--jobs', process.env.ORBIT_CHECK_JOBS || '4', ...acc, '--out', dir, '--', '--settle', '--scale', '1', '--wait', '12000']);
  const file = join(dir, 'manifest.json');
  if (!existsSync(file)) return { lines: [`${app} ${lang}: no shots (${r.text.trim().split('\n').slice(-2).join(' ')}), skipped`], bad: 0 };
  const { cells } = JSON.parse(readFileSync(file, 'utf8'));
  const skipped = cells.filter(c => c.failed);
  await settle404s(cells);
  // (What the account's person wrote themselves, in Chinese, stays Chinese: a pin named 家.)
  const own = accName ? new Set(readFileSync(join(HERE, 'shots/accounts', accName), 'utf8').match(/\p{Script=Han}[\p{Script=Han}\s·、]*/gu) || []) : new Set();
  const theirs = item => [...own].some(t => item.includes(`"${t.trim()}`));
  const faults = cells.flatMap(c =>
    c.faults
      .filter(f => KINDS.has(f.kind) && !(f.kind === 'chinese' && lang !== 'en'))
      .map(f => (f.kind === 'chinese' ? { ...f, items: f.items.filter(i => !theirs(i)) } : f.kind === 'console errors' ? { ...f, items: f.items.filter(i => !noise(i)) } : f))
      .filter(f => f.items.length)
      .map(f => `${c.page}${screens.includes(',') || themes.includes(',') || engines.includes(',') ? ` (${c.width} ${c.theme || ''} ${c.engine || ''})`.replace(/ +\)/, ')') : ''}: ${f.kind}: ${f.items.slice(0, 3).join(' · ')}`)
  );
  return { bad: faults.length, lines: [`${app} ${lang}: ${cells.length - skipped.length} pages, ${faults.length ? `${faults.length} faults` : 'clean'}${skipped.length ? `, ${skipped.length} not taken` : ''}  ${join(dir, 'index.html')}`, ...faults.map(f => `  ${f}`)] };
};
const jobs = apps.flatMap(a => langs.map(l => [a, l]));
let next = 0, bad = 0;
await Promise.all(
  Array.from({ length: Math.min(Number(process.env.ORBIT_CHECK_APPS || 1), jobs.length) }, async () => {
    while (next < jobs.length) {
      const r = await checkApp(...jobs[next++]);
      console.log(r.lines.join('\n'));
      bad += r.bad;
    }
  })
);
process.exit(bad ? 1 : 0);
