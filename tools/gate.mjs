// The family's quality gate: every app opened as a phone does, with real
// data, at 320 and 390 px, light and dark, every tab in its tab bar looked
// at. It fails an app on what a picky person sees:
//
//   lift      the loading screen lifted before the first screen was ready
//             (a skeleton or "載入中" still showing, or under half the text
//             it settles on, or pictures still loading), or never lifted
//   stall     the main thread blocked 500 ms or more at half speed (--cpu 2,
//             about a recent iPhone's): a frozen screen
//   errors    a script error
//   blank     a screen with nothing on it
//   pictures  an image that failed to load (an empty logo)
//   overflow  wider than the screen; the page sliding sideways
//   wraps     a title or name broken onto a second line
//   cut       an ellipsis or a clipped edge on text
//   letters   a logo, face or flag drawn as letters
//   slots     a grid of cards with a hole in its last row
//   halfEmpty a card stretched to twice what it holds
//   bareEmpty an empty state that is only a sentence
//   loading   a spinner, skeleton or "載入中" still there after it settled
//   dead      (390 light) a button that does nothing on its first tap, or a
//             "next" that keeps the same track
//   orphan    a wrapped row of pills with one left alone on its last line
//   tables    a stats table that slides sideways
//   sheets    a sheet taller than the screen, or one that scrolls for a sliver
//   white     (dark) a near-white box: a logo tile or a button glaring
//   scroll    a page longer than the screen that won't scroll
//   header    the top bar naming a page left or another tab
//   old       a season two or more years back shown as current
//   (every kind also checked on what each tap opens: sheets, game and
//   player pages, 紀錄)
//   typing    (390 light) a field the keyboard covers or pushes off the
//             screen, one under 16px (iOS zooms), or the page sliding sideways
//
//   node tools/gate.mjs [app…] [--jobs 4] [--out dir] [--no-taps] [--quick]
//
// --quick: 390 light only. Writes <out>/report.md (each fault with its
// screenshot) and report.json; exits 1 when anything failed.
import { execFile } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

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
// (Two at a time: more on a 4-core machine slows each page into freezes that aren't the app's.)
const jobs = Number(opt('jobs', 2));
const out = resolve(opt('out', '/tmp/quadra-gate'));
const taps = !flag('no-taps');
const quick = flag('quick');
// --quick --dark: 390 dark only (the white check).
const darkOnly = flag('dark');
const ALL = ['sports', 'play', 'securities', 'words', 'orbit', 'weather', 'transit', 'slips', 'beats', 'law'];
const apps = args.length ? args : ALL;
const runs = [];
for (const app of apps)
  for (const width of quick ? [390] : [320, 390])
    for (const dark of quick ? [darkOnly] : [false, true]) runs.push({ app, width, dark, taps: taps && width === 390 && !dark });
// English, the longer words, at the narrowest screen.
if (!quick) for (const app of apps) runs.push({ app, width: 320, dark: false, lang: 'en' });

const preview = new URL('./preview.mjs', import.meta.url).pathname;
const one = run =>
  new Promise(done => {
    const a = [preview, run.app, '--gate', '--live', '--width', String(run.width), '--out', join(out, 'shots'), '--wait', '7000', '--cpu', '2', ...(run.dark ? ['--dark'] : []), ...(run.lang ? ['--lang', run.lang] : []), ...(run.taps ? ['--taps'] : [])];
    execFile(process.execPath, a, { maxBuffer: 64 * 1024 * 1024, timeout: 600_000 }, (err, stdout) => {
      const line = String(stdout || '').split('\n').find(l => l.startsWith('gate: '));
      if (!line) return done({ ...run, crashed: String(err?.message || stdout || 'no result').split('\n').slice(0, 3).join(' ') });
      done({ ...run, ...JSON.parse(line.slice(6)) });
    });
  });

// What failed in one run, as [kind, where, what, shot].
const faults = r => {
  const f = [];
  const at = `${r.app} ${r.width}${r.dark ? ' dark' : ''}${r.lang && r.lang !== 'zh' ? ` ${r.lang}` : ''}`;
  if (r.crashed) return [['crash', at, r.crashed, '']];
  const first = r.tabs?.[0]?.shot || '';
  // (Never lifted: what's under it isn't on screen, so only that.)
  if (!r.lift) return [['lift', at, 'the loading screen never lifted', first]];
  else {
    const early = [...r.lift.skels, ...r.lift.loading];
    if (early.length) f.push(['lift', at, `lifted at ${r.lift.t} ms with ${early.join(', ')} still showing`, first]);
    else if (r.lift.waiting >= 2) f.push(['lift', at, `lifted at ${r.lift.t} ms with ${r.lift.waiting} of ${r.lift.pics} pictures still loading${r.lift.late?.length ? ` (${r.lift.late.join(', ')})` : ''}`, first]);
    else if (r.end && r.end.chars > 150 && r.lift.chars < r.end.chars * 0.5) f.push(['lift', at, `lifted at ${r.lift.t} ms with ${r.lift.chars} of ${r.end.chars} characters on screen`, first]);
  }
  // (After the first screen, pinned on the tap or tab change just before it.)
  const after = t => (r.tapAt || []).filter(([, at]) => at <= t).at(-1)?.[0];
  for (const [t, ms] of r.longs || []) if (ms >= 500) f.push(['stall', at, `main thread blocked ${ms} ms at ${t} ms${after(t) ? ` after ${after(t)}` : ''}`, first]);
  for (const e of r.pageErrors || []) f.push(['errors', at, e, first]);
  for (const tab of r.tabs || []) for (const kind of ['blank', 'pictures', 'overflow', 'wraps', 'cut', 'letters', 'slots', 'halfEmpty', 'bareEmpty', 'loading', 'dead', 'typing', 'orphan', 'tables', 'sheets', 'old', 'header', 'scroll', 'white']) for (const what of tab[kind] || []) f.push([kind, `${at} #${tab.id}`, what, tab.shot]);
  return f;
};

await mkdir(join(out, 'shots'), { recursive: true });
const results = [];
const queue = [...runs];
await Promise.all(
  Array.from({ length: Math.min(jobs, queue.length) }, async () => {
    for (let run; (run = queue.shift()); ) {
      const r = await one(run);
      results.push(r);
      const n = faults(r).length;
      console.log(`${n ? 'FAIL' : 'pass'} ${r.app} ${r.width}${r.dark ? ' dark' : ''}${r.lang ? ` ${r.lang}` : ''}${n ? ` (${n})` : ''}`);
    }
  })
);
const all = results.flatMap(faults);
const byApp = new Map(apps.map(a => [a, []]));
for (const f of all) byApp.get(f[1].split(' ')[0])?.push(f);
let md = `# Quality gate\n\n${apps.length} apps, ${runs.length} runs: ${[...byApp].filter(([, f]) => !f.length).length} passed.\n`;
for (const [app, f] of byApp) {
  md += `\n## ${app}: ${f.length ? `${f.length} faults` : 'pass'}\n`;
  const kinds = [...new Set(f.map(x => x[0]))];
  for (const k of kinds) {
    md += `\n**${k}**\n\n`;
    for (const [, where, what, shot] of f.filter(x => x[0] === k).slice(0, 30)) md += `- ${where}: ${what}${shot ? ` ([shot](${shot}))` : ''}\n`;
  }
}
await writeFile(join(out, 'report.md'), md);
await writeFile(join(out, 'report.json'), JSON.stringify(results, null, 1));
console.log(`\n${all.length} faults; ${join(out, 'report.md')}`);
process.exit(all.length ? 1 : 0);
