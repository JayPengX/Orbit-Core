// The layout check a push must pass (tools/push.sh): an app's every tab and
// its `check` pages (tools/shots/pages.mjs: the sheets that matter) on a
// phone (320), an iPad on its side (1180×820, touch) and a laptop
// (1280×800, a mouse), dark, live data. It fails on what Jay saw on his
// laptop (2026-11-06: "you make it good on phone and ipad, then the first
// time I open on my laptop is like this"):
//
//   layout    a wide screen's page in a narrow band, or one half empty
//             beside a full one (tools/layout-faults.mjs; a wide sheet too)
//   wide      anything wider than the screen, the page sliding sideways
//   sideways  a sheet or page a finger can push left and right
//
//   node tools/layout-check.mjs <app…> [--screens 320,ipad,laptop] [--out dir]
//
// A shot that can't be taken (no network, the live data down) is said and
// skipped, never a failure: the check is about the layout, not the day's
// data. Exits 1 when a shot has one of the faults above.
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
const screens = opt('screens', '320,ipad,laptop');
const out = opt('out', '/tmp/orbit-layout');
// (Each app's demo account, so its pages have something on them.)
const ACCOUNT = { sports: 'fan', words: 'demo', money: 'demo', securities: 'demo', law: 'follows', weather: 'pins', transit: 'rides', orbit: 'week', class: 'week' };
const BLOCKS = new Set(['layout', 'wide', 'scrolls sideways']);
const apps = args.length ? args : ['sports', 'transit', 'weather', 'orbit', 'money', 'news', 'words', 'beats', 'law', 'securities'];

// (Every push's check shares what our Workers answered in the last 15
// minutes, one keep for all of them (tools/live-keep.mjs), not one a run: a
// layout needs no newer data, and our tools were most of TDX's calls on
// 2026-11-06. The proxy gives them 10-minute copies of TDX's besides.)
const env = { ...process.env, ORBIT_LIVE_KEEP: process.env.ORBIT_LIVE_KEEP || join(tmpdir(), 'orbit-live-keep'), ORBIT_LIVE_KEEP_S: process.env.ORBIT_LIVE_KEEP_S || '900' };
const run = argv => new Promise(ok => execFile(process.execPath, argv, { cwd: join(HERE, '..'), env, maxBuffer: 64 << 20 }, (e, stdout, stderr) => ok({ code: e?.code || 0, text: `${stdout}${stderr}` })));

let bad = 0;
for (const app of apps) {
  const key = app === 'class' ? 'orbit' : app;
  const book = PAGES[key] || PAGES[app] || {};
  const pages = ['tabs', ...(book.check || [])];
  const dir = join(out, app);
  const acc = ACCOUNT[app] && existsSync(join(HERE, 'shots/accounts', `${key}-${ACCOUNT[app]}.txt`)) ? ['--account', ACCOUNT[app]] : [];
  const r = await run([join(HERE, 'shots.mjs'), key, ...pages, '--screens', screens, '--themes', 'dark', '--engines', 'chromium', ...acc, '--out', dir]);
  const file = join(dir, 'manifest.json');
  if (!existsSync(file)) {
    console.log(`${app}: no shots (${r.text.trim().split('\n').slice(-2).join(' ')}), skipped`);
    continue;
  }
  const { cells } = JSON.parse(readFileSync(file, 'utf8'));
  const skipped = cells.filter(c => c.failed);
  const faults = cells.flatMap(c => c.faults.filter(f => BLOCKS.has(f.kind)).map(f => `${c.page} at ${c.width}: ${f.kind}: ${f.items.slice(0, 2).join(' · ')}`));
  if (faults.length) bad++;
  console.log(`${app}: ${cells.length - skipped.length} shots, ${faults.length ? `${faults.length} layout faults` : 'clean'}${skipped.length ? `, ${skipped.length} not taken` : ''}  ${join(dir, 'index.html')}`);
  for (const f of faults) console.log(`  ${f}`);
}
process.exit(bad ? 1 : 0);
