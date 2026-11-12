// The 說明 guides' screenshots (kit/help.mjs's tours): every stop of every
// app's tour, at 390 wide, light and dark, in Chinese and English, with real
// live data (signed in to the demo account where the app has one), cropped to
// the screen's top and saved as WebP in kit/img/help/<kit id>/, then each
// picture's hash written into kit/help.mjs (the guide asks `?v=<hash>`).
//
//   node tools/help-shots.mjs [kit id…] [--stops a,b] [--jobs 4] [--keep dir [--reuse]]
//   node tools/help-shots.mjs --hashes   (only the hashes, from the pictures in kit/img/help/)
//
// Retake after an app's screens change (a tab redrawn, a tab added): the
// stops are the tour's (TOURS in kit/help.mjs); how each is reached is here.
import { execFile, execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { PAGES, tap, wait } from './shots/pages.mjs';
import { TOURS } from '../kit/help.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const CORE = resolve(HERE, '..');
const ROOT = resolve(CORE, '..');
const require = createRequire(import.meta.url);
let playwright;
for (const p of ['playwright', '/opt/node22/lib/node_modules/playwright', `${process.env.HOME}/.local/opt/playwright/node_modules/playwright`]) {
  try { playwright = require(p); break; } catch {}
}

// Each app: preview.mjs's name, its demo account, how long live data takes,
// the stops that aren't just a tab (a tab's id is clicked by itself), and
// where a stop that is a sheet starts (`top`, CSS px: the crop starts there).
const click = (...a) => a.flatMap(s => ['--click', s]);
const tabClick = id => click(`js:document.getElementById('tab-${id}')?.click()`);
const page = (app, name) => PAGES[app][name].args || [];
const passTab = n => click('.q-account', wait(1500), `js:document.querySelectorAll('.q-pass-tabs [role=tab]')[${n}]?.click()`, wait(1200), "js:[...document.querySelectorAll('dialog[open]')].pop().scrollTop=0");
const APPS = {
  pass: { app: 'weather', account: 'shots/accounts/weather-pins.txt', wait: 6000, stops: { first: ['--fresh', ...click(wait(1500))], pass: passTab(0), looks: passTab(1), apps: passTab(2) }, top: { first: 200 } },
  match: { app: 'sports', account: 'shots/accounts/sports-fan.txt', wait: 25000, stops: {} },
  transit: { app: 'transit', account: 'shots/accounts/transit-rides.txt', wait: 10000, args: ['--google-map'], stops: { times: page('transit', 'board') } },
  weather: { app: 'weather', account: 'shots/accounts/weather-pins.txt', wait: 9000, stops: { day: page('weather', 'day'), rain: page('weather', 'rain') }, top: { rain: 374 } },
  orbit: { app: 'orbit', account: 'shots/accounts/orbit-week.txt', args: ['--clock', '2026-11-04T10:30'], wait: 6000, stops: { class: page('orbit', 'class') }, top: { class: 374 } },
  money: { app: 'money', account: 'money-demo', wait: 6000, stops: { entry: page('money', 'entry') }, top: { entry: 168 } },
  vocab: { app: 'words', account: 'shots/accounts/words-demo.txt', wait: 7000, stops: { quiz: page('words', 'answered') } },
  beats: { app: 'beats', wait: 6000, stops: { game: [...page('beats', 'game'), ...click(wait(10000))] }, hash: { game: 'create' } },
  news: { app: 'news', wait: 9000, stops: {} },
  law: { app: 'law', wait: 8000, stops: { article: [], ask: [] }, hash: { article: 'law=B0000001&a=184', laws: 'tab=laws', rulings: 'tab=rulings', bills: 'tab=bills', mine: 'tab=mine', ask: 'tab=ask' } },
  stock: { app: 'securities', account: 'shots/accounts/securities-demo.txt', wait: 12000, stops: { stock: page('securities', 'stock') } }
};

const argv = process.argv.slice(2);
const opt = (name, d) => { const i = argv.indexOf(`--${name}`); return i < 0 ? d : argv.splice(i, 2)[1]; };
const jobs = Number(opt('jobs', 4));
const only = opt('stops', '');
const keep = opt('keep', '');
// (--reuse: a shot already in the --keep folder is kept, not taken again.)
const reuse = argv.includes('--reuse') && argv.splice(argv.indexOf('--reuse'), 1);
const hashesOnly = argv.includes('--hashes') && argv.splice(argv.indexOf('--hashes'), 1);
const apps = hashesOnly ? [] : argv.length ? argv : Object.keys(APPS);
const work = resolve(keep || join(tmpdir(), `help-shots-${Date.now()}`));
mkdirSync(work, { recursive: true });

// Money's demo: its sample books, printed fresh so the dates sit around today.
function accountFile(a) {
  if (!a.account) return '';
  if (a.account !== 'money-demo') return join(HERE, a.account);
  const made = join(work, 'money-account.txt');
  if (!existsSync(made)) {
    const kitLink = join(ROOT, 'Orbit-Money/.kit');
    if (!existsSync(kitLink)) symlinkSync('../Orbit-Core/kit', kitLink);
    writeFileSync(made, execFileSync(process.execPath, [join(ROOT, 'Orbit-Money/tools/sample-books.mjs')], { cwd: join(ROOT, 'Orbit-Money'), encoding: 'utf8' }));
  }
  return made;
}

const run = argv => new Promise(ok => execFile(process.execPath, argv, { cwd: CORE, maxBuffer: 64 << 20, timeout: 300_000 }, (e, out = '', err = '') => ok({ code: e ? e.code || 1 : 0, text: `${out}${err}` })));
const tasks = [];
for (const id of apps) {
  const a = APPS[id];
  if (!a) throw new Error(`no app ${id}: ${Object.keys(APPS).join(' ')}`);
  const stops = (TOURS[id]?.zh || []).map(s => s[0]).filter(s => !only || only.split(',').includes(s));
  for (const stop of stops)
    for (const lang of ['zh', 'en'])
      for (const theme of ['light', 'dark']) {
        const dir = join(work, id, `${stop}.${lang}.${theme}`);
        const hash = a.hash?.[stop] || '';
        const how = a.stops[stop] ?? tabClick(stop);
        const acc = accountFile(a);
        tasks.push({ id, stop, lang, theme, dir, top: a.top?.[stop] || 0, argv: [join(HERE, 'preview.mjs'), a.app, ...(hash ? [hash] : []), '--live', '--width', '390', '--height', '844', '--lang', lang, '--wait', String(a.wait), '--out', dir, ...(theme === 'dark' ? ['--dark'] : []), ...(acc ? ['--payload', acc] : []), ...(a.args || []), ...how] });
      }
}
console.log(`${tasks.length} shots → ${work}`);
let next = 0;
await Promise.all(Array.from({ length: jobs }, async () => {
  while (next < tasks.length) {
    const t = tasks[next++];
    const had = reuse && existsSync(t.dir) && readdirSync(t.dir).find(f => f.endsWith('.png'));
    if (had) { t.png = join(t.dir, had); continue; }
    rmSync(t.dir, { recursive: true, force: true });
    const r = await run(t.argv);
    const png = existsSync(t.dir) && readdirSync(t.dir).find(f => f.endsWith('.png'));
    t.png = png ? join(t.dir, png) : '';
    console.log(`${t.png ? 'ok ' : 'NO '} ${t.id} ${t.stop} ${t.lang} ${t.theme}${t.png ? '' : `\n${r.text.slice(-600)}`}`);
  }
}));

// Cropped to the screen's top (390 × 470) and made WebP in Chromium itself: no image library.
const W = 480, H = Math.round((470 / 390) * W);
const browser = await playwright.chromium.launch();
const tab = await browser.newPage();
await tab.setContent('<canvas></canvas>');
const outDir = id => join(CORE, 'kit/img/help', id);
for (const t of tasks.filter(t => t.png)) {
  const b64 = readFileSync(t.png).toString('base64');
  const webp = await tab.evaluate(async ({ b64, W, H, top }) => {
    const img = new Image();
    img.src = `data:image/png;base64,${b64}`;
    await img.decode();
    const c = document.querySelector('canvas');
    c.width = W; c.height = H;
    const x = c.getContext('2d');
    x.imageSmoothingQuality = 'high';
    // (A sheet's stop starts at the sheet: `top` in CSS pixels of the 390-wide screen.)
    const sw = img.naturalWidth, sh = Math.round((sw * H) / W), sy = Math.min(Math.round((top * sw) / 390), img.naturalHeight - sh);
    x.drawImage(img, 0, sy, sw, sh, 0, 0, W, H);
    return c.toDataURL('image/webp', 0.8).split(',')[1];
  }, { b64, W, H, top: t.top });
  mkdirSync(outDir(t.id), { recursive: true });
  writeFileSync(join(outDir(t.id), `${t.stop}.${t.lang}.${t.theme}.webp`), Buffer.from(webp, 'base64'));
}
await browser.close();

// Each stop's four pictures' hashes (zh light, zh dark, en light, en dark): the guide asks for `?v=<hash>`
// (the block at the end of kit/help.mjs, so the guide stays one module).
const file = join(CORE, 'kit/help.mjs');
const { SHOTS: old = {} } = await import(`${file}?t=${Date.now()}`);
const SHOTS = { ...old };
for (const id of Object.keys(TOURS)) {
  const dir = outDir(id);
  if (!existsSync(dir)) continue;
  for (const stop of TOURS[id].zh.map(s => s[0])) {
    const files = ['zh.light', 'zh.dark', 'en.light', 'en.dark'].map(v => join(dir, `${stop}.${v}.webp`));
    if (!files.every(existsSync)) continue;
    // (Each picture's own hash, as the kit's files: the service worker checks a ?v= file against it.)
    SHOTS[`${id}/${stop}`] = files.map(f => createHash('sha256').update(readFileSync(f)).digest('hex').slice(0, 12)).join(' ');
  }
}
const lines = Object.keys(SHOTS).sort().map(k => `  '${k}': '${SHOTS[k]}'`);
const HEAD = "// ---- The screenshots' hashes (tools/help-shots.mjs writes this block) ----\n";
const END = "// ---- end of the screenshots' hashes ----\n";
const src = readFileSync(file, 'utf8');
const block = `${HEAD}export const SHOTS = {\n${lines.join(',\n')}\n};\nexport const SHOT_SIZE = [${W}, ${H}];\n${END}`;
writeFileSync(file, src.slice(0, src.indexOf(HEAD)) + block + src.slice(src.indexOf(END) + END.length));
console.log(`${tasks.filter(t => t.png).length}/${tasks.length} saved; kit/help.mjs: ${lines.length} stops`);
