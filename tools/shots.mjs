// Every screenshot a change needs, in one run: an app's pages at 320 and 390
// px, light and dark, in Chromium and (where it's installed) WebKit, on the
// real app with real data, signed in. One contact sheet to look at, the
// layout faults each shot has, and with --before or --against what changed.
//
//   node tools/shots.mjs <app> [page…] [--before <ref>] [--against <dir>] [--at <ref>]
//        [--widths 320,390] [--themes light,dark] [--engines chromium,webkit] [--lang zh|en]
//        [--account <name|file>] [--fixtures] [--out dir] [--jobs 4] [-- preview args…]
//
//   app     as tools/preview.mjs takes it (sports, transit, weather, orbit, money, words,
//           beats, law, securities, admin)
//   page    a name from tools/shots/pages.mjs (how to reach it: taps, a #hash), a tab's id, `tabs`
//           (every tab in the app's tab bar, found on the page), `start` (what it opens
//           on), or `#hash`. None: the app's `default` there.
//   --at <ref>        shoot the app as it is at that git ref instead of the working tree:
//                     `main` is origin/main, what Pages serves (the live build); a branch
//                     or commit is a preview of it.
//   --before <ref>    shoot <ref> too and compare (`--before main`: your change against
//                     what's live). Both are shot side by side, a minute apart at most,
//                     so live data moves little between them.
//   --against <dir>   compare with an earlier run of this tool (its --out folder).
//   --account <name>  start signed in to a demo account: tools/shots/accounts/<app>-<name>.txt
//                     (what a person set up in the app: follows, a watchlist, books), or a file.
//                     Make one by using the app: `node tools/preview.mjs <app> --keep-account
//                     tools/shots/accounts/<app>-<name>.txt --click …`.
//   --fixtures        saved answers instead of live data (Transit, Weather): offline checks
//                     only, never for a screenshot anyone else sees.
//   -- …              anything after `--` goes to every preview.mjs run (--clock, --geo, …).
//
// Writes <out>/index.html (the contact sheet: tap a shot for full size, Before/After/Diff
// when comparing), <out>/sheet.png (the same as one picture, to read or attach),
// <out>/changes.png (with a comparison: each changed shot as before | after | diff),
// <out>/manifest.json, and prints each shot's faults (wraps, cut, scrolls sideways,
// wider than the screen, console errors). Exit code 1 when a shot has a fault.
import { execFile, execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, symlinkSync, rmSync } from 'node:fs';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, relative, basename } from 'node:path';
import { createRequire } from 'node:module';
import { PAGES } from './shots/pages.mjs';

const HERE = new URL('.', import.meta.url).pathname;
const ROOT = resolve(HERE, '../..');
const require = createRequire(import.meta.url);
let playwright;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', `${process.env.HOME}/.local/opt/playwright/node_modules/playwright`]) {
  try {
    playwright = require(p);
    break;
  } catch {}
}
if (!playwright) throw new Error('Playwright not found');

const all = process.argv.slice(2);
const dash = all.indexOf('--');
const pass = dash < 0 ? [] : all.slice(dash + 1);
const args = dash < 0 ? all : all.slice(0, dash);
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
const list = (name, fallback) => String(opt(name, fallback)).split(',').filter(Boolean);
const widths = list('widths', '320,390').map(Number);
const themes = list('themes', 'light,dark');
let engines = list('engines', 'chromium,webkit');
const lang = opt('lang', 'zh');
const at = opt('at', '');
const before = opt('before', '');
const against = opt('against', '');
const account = opt('account', '');
const fixtures = flag('fixtures');
const jobs = Number(opt('jobs', 4));
const height = opt('height', '844');
const outOpt = opt('out', '');
const [app, ...named] = args;
if (!app || app.startsWith('--')) {
  console.log(readFileSync(new URL(import.meta.url), 'utf8').split('\nimport ')[0].replace(/^\/\/ ?/gm, ''));
  process.exit(2);
}
const ALIAS = { class: 'orbit', fixtures: 'sports', hub: 'words' };
const key = ALIAS[app] || app.toLowerCase().replace(/^orbit-/, '');
const REPOS = { sports: 'Orbit-Sports', securities: 'Orbit-Securities', words: 'Orbit-Words', orbit: 'Orbit-Class', weather: 'Orbit-Weather', transit: 'Orbit-Transit', beats: 'Orbit-Beats', law: 'Orbit-Law', money: 'Orbit-Money', admin: 'Orbit-Core' };
if (!REPOS[key]) throw new Error(`no app ${app}: ${Object.keys(REPOS).join(' ')}`);
const repo = REPOS[key];
const book = PAGES[key] || {};
const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');
const out = resolve(outOpt || join(tmpdir(), 'orbit-shots', `${key}-${stamp}`));
mkdirSync(out, { recursive: true });

// WebKit only where it's installed (a Mac; the cloud container has only Chromium).
if (engines.includes('webkit') && !existsSync(playwright.webkit.executablePath())) {
  engines = engines.filter(e => e !== 'webkit');
  console.log('webkit: not installed here, Chromium only (on a Mac: npx playwright install webkit)');
}

// (A saved account, or a script that prints one, run each time so its dates sit around today:
// Money's books, which no public source has.)
const ACCOUNTS = { money: { demo: join(ROOT, 'Orbit-Money/tools/sample-books.mjs') } };
let accountFile = !account ? '' : existsSync(account) ? resolve(account) : existsSync(join(HERE, 'shots/accounts', `${key}-${account}.txt`)) ? join(HERE, 'shots/accounts', `${key}-${account}.txt`) : ACCOUNTS[key]?.[account] || '';
if (account && !accountFile) throw new Error(`no demo account "${account}" for ${key}: make one with preview.mjs --keep-account tools/shots/accounts/${key}-${account}.txt`);
if (accountFile.endsWith('.mjs')) {
  const made = join(out, 'account.txt');
  // (The app's `#kit/` imports: its .kit link, as its `npm test` makes.)
  const kitLink = resolve(accountFile, '../../.kit');
  if (!existsSync(kitLink)) symlinkSync('../Orbit-Core/kit', kitLink);
  writeFileSync(made, execFileSync(process.execPath, [accountFile], { cwd: resolve(accountFile, '../..'), encoding: 'utf8' }));
  accountFile = made;
}

const run = (cmd, argv, opts = {}) =>
  new Promise(ok => execFile(cmd, argv, { maxBuffer: 64 * 1024 * 1024, timeout: 300_000, ...opts }, (e, stdout = '', stderr = '') => ok({ code: e ? e.code || 1 : 0, text: `${stdout}${stderr}` })));
const git = (dir, ...a) => execFileSync('git', ['-C', dir, ...a], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024 }).trim();

// ---- The builds: the working tree, or a ref copied out of git ----
// `main` is origin/main (fetched first): what Pages has deployed.
function resolveRef(dir, ref) {
  if (ref === 'main' || ref === 'live') {
    try {
      git(dir, 'fetch', '-q', 'origin', 'main');
    } catch {}
    return git(dir, 'rev-parse', 'origin/main');
  }
  return git(dir, 'rev-parse', ref);
}
const built = new Map();
async function rootFor(ref) {
  if (!ref) {
    if (key === 'orbit') await buildClass(join(ROOT, repo));
    return ROOT;
  }
  if (built.has(ref)) return built.get(ref);
  const to = await mkdtemp(join(tmpdir(), 'orbit-shots-root-'));
  const sha = resolveRef(join(ROOT, repo), ref);
  // The kit: Orbit-Core at the same ref for `main`, else as it was when that commit was made.
  const kitSha = repo === 'Orbit-Core' ? sha : ref === 'main' || ref === 'live' ? resolveRef(join(ROOT, 'Orbit-Core'), 'main') : git(join(ROOT, 'Orbit-Core'), 'rev-list', '-1', `--before=${git(join(ROOT, repo), 'log', '-1', '--format=%cI', sha)}`, 'HEAD');
  const unpack = (name, commit, ...paths) => {
    mkdirSync(join(to, name), { recursive: true });
    execFileSync('sh', ['-c', `git -C "${join(ROOT, name)}" archive ${commit} ${paths.join(' ')} | tar -x -C "${join(to, name)}"`]);
  };
  unpack('Orbit-Core', kitSha, 'kit', ...(repo === 'Orbit-Core' ? ['site'] : []));
  if (repo !== 'Orbit-Core') unpack(repo, sha, ...(key === 'orbit' ? [] : ['public']));
  // What a deploy makes and git doesn't keep (Law's data/): the working tree's.
  const pub = join(ROOT, repo, 'public');
  if (key !== 'orbit' && existsSync(pub)) for (const name of readdirSync(pub)) if (!existsSync(join(to, repo, 'public', name))) symlinkSync(join(pub, name), join(to, repo, 'public', name));
  if (key === 'orbit') {
    symlinkSync(join(ROOT, repo, 'node_modules'), join(to, repo, 'node_modules'));
    await buildClass(join(to, repo));
  }
  console.log(`${ref}: ${repo} ${sha.slice(0, 7)} (${git(join(ROOT, repo), 'log', '-1', '--format=%s', sha).slice(0, 70)}), kit ${kitSha.slice(0, 7)}`);
  built.set(ref, to);
  return to;
}
async function buildClass(dir) {
  if (built.has(dir)) return;
  built.set(dir, true);
  if (!existsSync(join(dir, 'node_modules'))) {
    const i = await run('npm', ['ci', '--no-audit', '--no-fund'], { cwd: dir });
    if (i.code) throw new Error(`Orbit-Class npm ci failed:\n${i.text}`);
  }
  const r = await run('npx', ['vite', 'build', '--logLevel', 'error'], { cwd: dir });
  if (r.code) throw new Error(`Orbit-Class build failed:\n${r.text}`);
}

// ---- One preview.mjs run: one page, one screen ----
const FAULTS = /^(wraps|cut|scrolls sideways|console errors):/;
function readFaults(text) {
  const faults = [];
  let block = null;
  for (const line of text.split('\n')) {
    const m = line.match(FAULTS);
    if (m) faults.push((block = { kind: m[1], items: [] }));
    else if (block && /^ {2}\S/.test(line)) block.items.push(line.trim());
    else {
      block = null;
      const wide = line.match(/\.png .*\| (wider than the screen: .*|PAGE .*)$/);
      if (wide) faults.push({ kind: 'wide', items: [wide[1]] });
    }
  }
  return faults;
}
async function shoot({ root, page, engine, width, theme, dir }) {
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const argv = [join(HERE, 'preview.mjs'), key, ...(page.hash ? [page.hash] : []), '--root', root, '--width', String(width), '--height', height, '--lang', lang, '--out', dir, ...(fixtures ? [] : ['--live']), ...(theme === 'dark' ? ['--dark'] : []), ...(engine === 'webkit' ? ['--webkit'] : []), ...(accountFile ? ['--payload', accountFile] : []), ...(page.args || []), ...pass];
  const r = await run(process.execPath, argv, { cwd: join(HERE, '..') });
  const png = readdirSync(dir).filter(f => f.endsWith('.png') && !f.endsWith('-shot.png'))[0];
  writeFileSync(join(dir, 'preview.log'), r.text);
  return { png: png ? join(dir, png) : '', faults: readFaults(r.text), failed: r.code && !png ? r.text.trim().split('\n').slice(-3).join(' ') : '' };
}

// ---- The pages ----
async function pagesWanted() {
  const want = named.length ? named : book.default || ['tabs'];
  const pages = [];
  for (const name of want) {
    if (name === 'tabs') {
      // The tab bar, read off the opened app (its own ids).
      const dir = join(out, '.tabs');
      const r = await run(process.execPath, [join(HERE, 'preview.mjs'), key, '--root', await rootFor(at), '--out', dir, '--lang', lang, ...(fixtures ? [] : ['--live']), ...(accountFile ? ['--payload', accountFile] : []), ...pass, '--eval', "[...document.querySelectorAll('.q-tab[data-tab]')].map(b=>b.dataset.tab)"], { cwd: join(HERE, '..') });
      const ids = JSON.parse(r.text.match(/^eval: (.*)$/m)?.[1] || '[]');
      if (!ids.length) pages.push({ name: 'start' });
      for (const id of ids) pages.push({ name: id, args: ['--click', `js:document.getElementById('tab-${id}').click()`] });
    } else if (name === 'start') pages.push({ name });
    else if (book[name]) pages.push({ name, ...book[name] });
    else if (name.startsWith('#')) pages.push({ name: name.slice(1).replace(/[^\p{L}\p{N}]+/gu, '_'), hash: name.slice(1) });
    // (Anything else: a tab's id, e.g. `week`; a wrong one shows as a click error.)
    else if (/^[\w-]+$/.test(name)) pages.push({ name, args: ['--click', `js:document.getElementById('tab-${name}').click()`] });
    else throw new Error(`no page "${name}" for ${key}: ${['tabs', 'start', ...Object.keys(book).filter(k => k !== 'default')].join(' ')}, a tab's id, or #hash`);
  }
  return pages.filter((p, i) => pages.findIndex(q => q.name === p.name) === i);
}

// ---- Pixel diff, drawn in Chromium (no image library needed) ----
let diffPage = null;
async function diff(a, b, to) {
  if (!diffPage) diffPage = await (await playwright.chromium.launch()).newPage();
  const [ra, rb] = [a, b].map(f => `data:image/png;base64,${readFileSync(f).toString('base64')}`);
  const res = await diffPage.evaluate(
    async ([x, y]) => {
      const load = src => new Promise(ok => Object.assign(new Image(), { onload() { ok(this); }, src }));
      const [ia, ib] = await Promise.all([load(x), load(y)]);
      const w = Math.max(ia.width, ib.width);
      const h = Math.max(ia.height, ib.height);
      const pix = im => {
        const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
        const g = c.getContext('2d');
        g.drawImage(im, 0, 0);
        return g.getImageData(0, 0, w, h).data;
      };
      const [pa, pb] = [pix(ia), pix(ib)];
      const c = Object.assign(document.createElement('canvas'), { width: w, height: h });
      const g = c.getContext('2d');
      const outImg = g.createImageData(w, h);
      let changed = 0;
      for (let i = 0; i < pa.length; i += 4) {
        const d = Math.abs(pa[i] - pb[i]) + Math.abs(pa[i + 1] - pb[i + 1]) + Math.abs(pa[i + 2] - pb[i + 2]) + Math.abs(pa[i + 3] - pb[i + 3]);
        const grey = (pb[i] + pb[i + 1] + pb[i + 2]) / 3;
        if (d > 40) {
          changed++;
          outImg.data.set([255, 0, 170, 255], i);
        } else outImg.data.set([grey * 0.35 + 150, grey * 0.35 + 150, grey * 0.35 + 150, 255], i);
      }
      g.putImageData(outImg, 0, 0);
      return { share: changed / (w * h), png: c.toDataURL('image/png') };
    },
    [ra, rb]
  );
  writeFileSync(to, Buffer.from(res.png.split(',')[1], 'base64'));
  return res.share;
}

// ---- Run ----
const pages = await pagesWanted();
const variants = [{ name: 'after', ref: at }, ...(before ? [{ name: 'before', ref: before }] : [])];
for (const v of variants) v.root = await rootFor(v.ref);
const cells = [];
for (const page of pages) for (const engine of engines) for (const width of widths) for (const theme of themes) cells.push({ page: page.name, engine, width, theme, pageDef: page });
const tasks = cells.flatMap(c => variants.map(v => ({ c, v })));
console.log(`${key}: ${pages.map(p => p.name).join(' ')} × ${widths.join('/')} × ${themes.join('/')} × ${engines.join('/')}${before ? ` × now/${before}` : ''} = ${tasks.length} shots${fixtures ? ' (saved answers)' : ' (live data)'}`);
let next = 0;
let done = 0;
await Promise.all(
  Array.from({ length: Math.min(jobs, tasks.length) }, async () => {
    while (next < tasks.length) {
      const { c, v } = tasks[next++];
      const id = `${c.page}-${c.width}-${c.theme}${c.engine === 'webkit' ? '-webkit' : ''}`;
      const r = await shoot({ root: v.root, page: c.pageDef, engine: c.engine, width: c.width, theme: c.theme, dir: join(out, v.name, id) });
      c.id = id;
      c[v.name] = r;
      process.stdout.write(`\r${++done}/${tasks.length}`);
    }
  })
);
process.stdout.write('\n');

// The comparison: with --before the ref's shots, with --against an earlier run's.
const earlier = against ? JSON.parse(readFileSync(join(resolve(against), 'manifest.json'), 'utf8')) : null;
for (const c of cells) {
  const old = before ? c.before?.png : earlier?.cells.find(e => e.id === c.id)?.png;
  c.png = c.after.png;
  if (!old || !c.png) continue;
  c.was = against ? join(resolve(against), old) : old;
  c.diff = join(out, 'after', c.id, 'diff.png');
  c.changed = await diff(c.was, c.png, c.diff);
}
await diffPage?.context().browser().close();

// ---- The contact sheet ----
const rel = f => (f ? relative(out, f) : '');
const manifest = {
  app: key,
  made: new Date().toISOString(),
  build: at || 'working tree',
  data: fixtures ? 'saved answers' : 'live',
  account: accountFile ? basename(accountFile) : 'none',
  compared: before || against || '',
  cells: cells.map(c => ({ id: c.id, page: c.page, engine: c.engine, width: c.width, theme: c.theme, png: rel(c.png), was: c.was ? (against ? c.was : rel(c.was)) : '', diff: rel(c.diff), changed: c.changed ?? null, faults: c.after.faults, failed: c.after.failed }))
};
writeFileSync(join(out, 'manifest.json'), JSON.stringify(manifest, null, 1));
const esc = s => String(s).replace(/[&<>"]/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch]);
const columns = engines.flatMap(e => widths.flatMap(w => themes.map(t => ({ e, w, t }))));
const cellHtml = c => {
  if (!c.png) return `<td class="fail">no shot<br><small>${esc(c.after.failed || 'see preview.log')}</small></td>`;
  const faults = c.after.faults.map(f => `<li><b>${esc(f.kind)}</b> ${esc(f.items.slice(0, 4).join(' · '))}</li>`).join('');
  const change = c.changed == null ? '' : `<div class="chg ${c.changed > 0.002 ? 'on' : ''}">${c.changed > 0.002 ? `${(c.changed * 100).toFixed(1)}% changed` : 'no change'}</div>`;
  const pics = c.diff ? `data-after="${esc(rel(c.png))}" data-before="${esc(c.was.startsWith('/') ? relative(out, c.was) : rel(c.was))}" data-diff="${esc(rel(c.diff))}"` : '';
  return `<td ${pics}><a href="${esc(rel(c.png))}"><img loading="lazy" src="${esc(rel(c.png))}" width="${c.width / 2}"></a>${change}${faults ? `<ul>${faults}</ul>` : ''}</td>`;
};
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${esc(key)} shots</title>
<style>:root{color-scheme:light dark;--bg:#f4f4f6;--fg:#1c1c1e;--mute:#6b6b70;--bad:#c4271f;--card:#fff}@media(prefers-color-scheme:dark){:root{--bg:#121214;--fg:#eee;--mute:#9a9aa0;--bad:#ff6b5f;--card:#1e1e21}}
body{margin:16px;background:var(--bg);color:var(--fg);font:13px -apple-system,system-ui,sans-serif}h1{font-size:17px;margin:0 0 4px}p{color:var(--mute);margin:0 0 12px}
table{border-collapse:separate;border-spacing:8px}th{font-weight:600;text-align:left;color:var(--mute)}td{vertical-align:top;background:var(--card);border-radius:8px;padding:6px;max-width:220px}
img{display:block;border-radius:6px;height:auto}ul{margin:4px 0 0;padding-left:14px;color:var(--bad);font-size:11px}.chg{font-size:11px;color:var(--mute);margin-top:4px}.chg.on{color:var(--bad);font-weight:600}.fail{color:var(--bad)}
nav{margin-bottom:8px}nav button{font:inherit;padding:4px 10px;margin-right:4px;border-radius:6px;border:1px solid var(--mute);background:var(--card);color:var(--fg)}nav button.on{background:var(--fg);color:var(--bg)}</style>
<h1>${esc(key)} · ${esc(manifest.build)}${manifest.compared ? ` vs ${esc(manifest.compared)}` : ''}</h1>
<p>${esc(manifest.made.slice(0, 16).replace('T', ' '))} UTC · ${esc(manifest.data)} data · account: ${esc(manifest.account)} · ${cells.filter(c => c.after.faults.length).length} with faults${cells.some(c => c.changed != null) ? ` · ${cells.filter(c => c.changed > 0.002).length} changed` : ''}</p>
${cells.some(c => c.diff) ? '<nav><button data-show="after" class="on">After</button><button data-show="before">Before</button><button data-show="diff">Diff</button></nav>' : ''}
<table><tr><th></th>${columns.map(k => `<th>${k.w} ${k.t}${engines.length > 1 ? ` ${k.e}` : ''}</th>`).join('')}</tr>
${pages.map(p => `<tr><th>${esc(p.name)}</th>${columns.map(k => cellHtml(cells.find(c => c.page === p.name && c.engine === k.e && c.width === k.w && c.theme === k.t))).join('')}</tr>`).join('\n')}</table>
<script>for(const b of document.querySelectorAll('nav button'))b.onclick=()=>{for(const x of document.querySelectorAll('nav button'))x.classList.toggle('on',x===b);for(const td of document.querySelectorAll('td[data-after]')){const s=td.dataset[b.dataset.show];td.querySelector('img').src=s;td.querySelector('a').href=s}}</script>`;
writeFileSync(join(out, 'index.html'), html);

// The same as pictures: sheet.png (every shot), changes.png (before | after | diff of what changed).
const browser = await playwright.chromium.launch();
const view = await browser.newPage({ viewport: { width: Math.max(400, 140 + columns.reduce((n, k) => n + k.w / 2 + 30, 0)), height: 600 } });
await view.goto(`file://${join(out, 'index.html')}`);
await view.evaluate(() => Promise.all([...document.images].map(i => (i.loading = 'eager', i.complete ? 0 : new Promise(r => (i.onload = i.onerror = r))))));
await view.screenshot({ path: join(out, 'sheet.png'), fullPage: true });
const changed = cells.filter(c => c.changed > 0.002);
if (changed.length) {
  const rows = changed.map(c => `<tr><th>${esc(c.page)}<br>${c.width} ${c.theme}<br>${(c.changed * 100).toFixed(1)}%</th>${[c.was.startsWith('/') ? relative(out, c.was) : rel(c.was), rel(c.png), rel(c.diff)].map(f => `<td><img src="${esc(f)}" width="${c.width / 2}"></td>`).join('')}</tr>`);
  writeFileSync(join(out, 'changes.html'), html.split('<h1>')[0] + `<h1>${esc(key)}: what changed</h1><table><tr><th></th><th>before</th><th>after</th><th>diff</th></tr>${rows.join('')}</table>`);
  await view.goto(`file://${join(out, 'changes.html')}`);
  await view.evaluate(() => Promise.all([...document.images].map(i => (i.complete ? 0 : new Promise(r => (i.onload = i.onerror = r))))));
  await view.screenshot({ path: join(out, 'changes.png'), fullPage: true });
}
await browser.close();

// ---- What it says ----
let bad = 0;
for (const c of cells) {
  const notes = [...(c.after.failed ? [`no shot: ${c.after.failed}`] : []), ...c.after.faults.map(f => `${f.kind}: ${f.items.slice(0, 3).join(' · ')}`), ...(c.changed > 0.002 ? [`${(c.changed * 100).toFixed(1)}% changed`] : [])];
  if (c.after.failed || c.after.faults.length) bad++;
  if (notes.length) console.log(`${c.id}\n  ${notes.join('\n  ')}`);
}
console.log(`${cells.length} shots, ${bad ? `${bad} with faults` : 'clean'}${changed.length ? `, ${changed.length} changed` : ''}\n  ${join(out, 'index.html')}\n  ${join(out, 'sheet.png')}${changed.length ? `\n  ${join(out, 'changes.png')}` : ''}`);
process.exit(bad ? 1 : 0);
