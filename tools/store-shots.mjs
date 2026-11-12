#!/usr/bin/env node
// The screenshots each app is shown with: the Showcase's App tab and the
// app's README, one set, both languages (Jay 2026-11-01: one shoot updates both).
//
//   node tools/store-shots.mjs sports            shoot every shot, zh and en → sheet.png to look at
//   node tools/store-shots.mjs sports 2 5        only shots 2 and 5 (the rest kept from the last run)
//   node tools/store-shots.mjs sports --apply    put the last run in place:
//       Orbit-Showcase public/shots/<app>/N.webp + N.zh.webp (unframed, 750×1624),
//       its public/lib/apps.mjs `shots` list (the captions),
//       the app's docs/screenshots/<prefix>-N.webp + N.zh.webp (framed, caption on top),
//       and the README's picture rows (English, then 中文 in a fold).
//
// What each shot is (page, taps, theme, caption) lives in tools/shots/store.mjs.
// Shots are real: live data, made-up accounts only (tools/shots/accounts).
// A shot with a fault (text wrapping, cut, sideways scroll) is printed; look
// at sheet.png before --apply. --out dir (default /tmp/orbit-store), --jobs 3.
import { spawn, execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, existsSync, readdirSync, rmSync, renameSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { STORE } from './shots/store.mjs';
import { PAGES } from './shots/pages.mjs';
import { BRANDS } from '../kit/brand.mjs';

const HERE = dirname(new URL(import.meta.url).pathname);
const ROOT = join(HERE, '..', '..');
const argv = process.argv.slice(2);
const opt = (k, d) => { const i = argv.indexOf(`--${k}`); return i < 0 ? d : argv.splice(i, 2)[1]; };
const flag = k => { const i = argv.indexOf(`--${k}`); return i >= 0 && argv.splice(i, 1).length > 0; };
const out = opt('out', '/tmp/orbit-store');
const jobs = Number(opt('jobs', '3'));
const langs = opt('lang', 'zh,en').split(',');
const apply = flag('apply');
const [key, ...only] = argv;
const set = STORE[key];
if (!set) { console.error(`usage: store-shots.mjs <${Object.keys(STORE).join('|')}> [n…] [--apply]`); process.exit(2); }
const dir = join(out, key);
mkdirSync(dir, { recursive: true });
const pick = only.length ? only.map(Number) : set.shots.map((_, i) => i + 1);

const run = (cmd, args, o = {}) => new Promise(res => {
  const p = spawn(cmd, args, o); let log = '';
  p.stdout.on('data', d => (log += d)); p.stderr.on('data', d => (log += d));
  p.on('close', code => res({ code, log }));
});

// A made-up account: a saved one in tools/shots/accounts, or Money's demo books made fresh (sample-books.mjs).
function accountFile(name) {
  const saved = join(HERE, 'shots', 'accounts', `${set.app}-${name}.txt`);
  if (existsSync(saved) || !(set.app === 'money' && name === 'demo')) return saved;
  const made = join(dir, 'money-demo.txt');
  if (!existsSync(made)) writeFileSync(made, execFileSync(process.execPath, [join(ROOT, 'Orbit-Money/tools/sample-books.mjs')], { cwd: join(ROOT, 'Orbit-Money'), encoding: 'utf8' }));
  return made;
}

// One shot in one language: preview.mjs at 375×812 (750×1624 at 2×).
async function shoot(n, lang) {
  const s = set.shots[n - 1];
  const page = s.page ? PAGES[set.app][s.page] : {};
  if (s.page && !page) throw new Error(`${key} ${n}: no page "${s.page}" in pages.mjs`);
  const tmp = join(dir, `.tmp-${n}-${lang}`); rmSync(tmp, { recursive: true, force: true });
  const account = s.account ?? set.account;
  const payload = account ? ['--payload', account.startsWith('/') ? account : accountFile(account)] : [];
  const hash = (h => (h && typeof h === 'object' ? h[lang] : h))(s.hash || page.hash);
  // A real AI answer, asked once as a phone (build.yml as-phone) and kept: tools/shots/ai/<name>.<lang>.ndjson|json.
  const ai = (s.ai || []).flatMap(([text, name]) => {
    const f = ['ndjson', 'json'].map(x => join(HERE, 'shots', 'ai', `${name}.${lang}.${x}`)).find(existsSync);
    return f ? ['--fixture', `${text}=${f}`] : [];
  });
  const args = [join(HERE, 'preview.mjs'), set.app, ...(hash ? [hash] : []), '--live', '--lang', lang, '--width', '375', '--height', '812', '--wait', String(s.wait ?? 6000), '--out', tmp,
    ...(s.dark ? ['--dark'] : []), ...payload, ...ai, ...(set.args || []), ...(page.args || []), ...((a => (Array.isArray(a) ? a : a?.[lang]))(s.args) || [])];
  const r = await run(process.execPath, args, { cwd: join(HERE, '..') });
  const png = existsSync(tmp) && readdirSync(tmp).find(f => f.endsWith('.png'));
  const file = join(dir, `${n}.${lang}.png`);
  if (png) renameSync(join(tmp, png), file);
  rmSync(tmp, { recursive: true, force: true });
  writeFileSync(join(dir, `${n}.${lang}.log`), r.log);
  const faults = r.log.split('\n').filter(l => /^\s*(wraps:|cut:|scrolls sideways)/.test(l)).map(l => l.trim());
  console.log(`${key} ${n} ${lang}${png ? '' : ' FAILED'}${faults.length ? `\n   ${faults.slice(0, 6).join('\n   ')}` : ''}`);
}

const { chromium } = createRequire(join(HERE, '..', 'package.json'))('playwright');

if (!apply) {
  const queue = pick.flatMap(n => langs.map(l => [n, l]));
  await Promise.all(Array.from({ length: jobs }, async () => { while (queue.length) await shoot(...queue.shift()); }));
  // sheet.png: every shot, 中文 over English, with its caption.
  const cells = set.shots.map((s, i) => ({ n: i + 1, s }));
  const img = f => existsSync(f) ? `data:image/png;base64,${readFileSync(f).toString('base64')}` : '';
  const html = `<!doctype html><meta charset="utf-8"><style>body{margin:0;padding:12px;background:#ddd;font:13px system-ui,'WenQuanYi Zen Hei';display:grid;grid-template-columns:repeat(${cells.length},300px);gap:10px}
    div{display:grid;gap:6px}b{height:34px}img{width:300px;border-radius:10px;display:block;background:#fff}</style>
    ${cells.map(({ n, s }) => `<div><b>${n}. ${s.zh}<br>${s.en}</b>${langs.map(l => `<img src="${img(join(dir, `${n}.${l}.png`))}">`).join('')}</div>`).join('')}`;
  const b = await chromium.launch(); const p = await b.newPage({ viewport: { width: 24 + cells.length * 310, height: 400 } });
  await p.setContent(html); await p.waitForTimeout(300);
  await p.screenshot({ path: join(dir, 'sheet.png'), fullPage: true }); await b.close();
  console.log(`look at ${join(dir, 'sheet.png')}, then: node tools/store-shots.mjs ${key} --apply`);
  process.exit(0);
}

// ---- --apply: the Showcase's copies, the README's framed copies, the captions ----
const brand = BRANDS[set.brand];
const repo = join(ROOT, brand.repo);
const show = join(ROOT, 'Orbit-Showcase', 'public');
const missing = set.shots.flatMap((_, i) => langs.map(l => join(dir, `${i + 1}.${l}.png`))).filter(f => !existsSync(f));
if (missing.length) { console.error(`missing shots, run without --apply first:\n${missing.join('\n')}`); process.exit(1); }
const b = await chromium.launch();
const encode = async (src, dest, w, h, frame) => {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  const pic = `data:image/png;base64,${readFileSync(src).toString('base64')}`;
  const [hi, mid, lo] = [brand.from, brand.ink, brand.to];
  await p.setContent(frame
    ? `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden}
      body{background:radial-gradient(120% 70% at 20% 0%,${hi}66 0%,transparent 60%),linear-gradient(165deg,${mid} 0%,${lo} 100%);font-family:'Inter Display','Inter','PingFang TC','Noto Sans TC','WenQuanYi Zen Hei',sans-serif;-webkit-font-smoothing:antialiased}
      .hd{position:absolute;top:0;left:66px;right:66px;height:370px;display:flex;align-items:center;justify-content:center}
      h1{margin:0;text-align:center;color:#fff;font-weight:700;font-size:${frame.zh ? 64 : 68}px;line-height:1.12;letter-spacing:${frame.zh ? '0.02em' : '-0.025em'};text-wrap:balance;word-break:keep-all;overflow-wrap:anywhere}
      .ph{position:absolute;top:390px;left:50%;transform:translateX(-50%);width:645px;padding:18px;border-radius:96px;background:#0b0b0f;box-shadow:0 45px 120px rgba(0,0,0,.35),0 0 0 3px rgba(255,255,255,.14)}
      .ph img{display:block;width:645px;border-radius:78px}</style>
      <div class="hd"><h1>${frame.title}</h1></div><div class="ph"><img src="${pic}"></div>`
    : `<!doctype html><style>html,body{margin:0}img{display:block;width:${w}px;height:${h}px}</style><img src="${pic}">`);
  await p.waitForTimeout(150);
  const shot = await p.screenshot({ type: 'png' }); await p.close();
  // WebP through the page's own canvas: no image tools needed.
  const q = await b.newPage();
  const data = await q.evaluate(async ([png, w, h]) => {
    const im = new Image(); im.src = `data:image/png;base64,${png}`; await im.decode();
    const c = Object.assign(document.createElement('canvas'), { width: w, height: h }); c.getContext('2d').drawImage(im, 0, 0, w, h);
    return c.toDataURL('image/webp', 0.8).split(',')[1];
  }, [shot.toString('base64'), w, h]);
  await q.close();
  writeFileSync(dest, Buffer.from(data, 'base64'));
};
const shotsDir = join(show, 'shots', set.show); mkdirSync(shotsDir, { recursive: true });
const docs = join(repo, 'docs', 'screenshots'); mkdirSync(docs, { recursive: true });
for (const f of readdirSync(shotsDir)) if (/^\d+(\.zh)?\.webp$/.test(f) && Number(f.split('.')[0]) > set.shots.length) rmSync(join(shotsDir, f));
for (const f of readdirSync(docs)) if (new RegExp(`^${set.prefix}-\\d+(\\.zh)?\\.webp$`).test(f) && Number(f.match(/-(\d+)/)[1]) > set.shots.length) rmSync(join(docs, f));
for (const [i, s] of set.shots.entries()) {
  const n = i + 1;
  for (const l of langs) {
    const suf = l === 'zh' ? '.zh' : '';
    await encode(join(dir, `${n}.${l}.png`), join(shotsDir, `${n}${suf}.webp`), 750, 1624);
    await encode(join(dir, `${n}.${l}.png`), join(docs, `${set.prefix}-${n}${suf}.webp`), 900, 1770, { title: l === 'zh' ? s.zh : s.en, zh: l === 'zh' });
  }
  console.log(`${key} ${n}: ${s.zh} / ${s.en}`);
}
await b.close();

// The Showcase's captions (apps.mjs, the `shots` list of this app).
const appsFile = join(show, 'lib', 'apps.mjs');
const apps = readFileSync(appsFile, 'utf8');
const q = t => `'${t.replace(/'/g, '’')}'`;
const list = `shots: [\n${set.shots.map((s, i) => `      ['${set.show}/${i + 1}', [${q(s.zh)}, ${q(s.en)}]]`).join(',\n')}\n    ]`;
const re = new RegExp(`(id: '${set.show}'[\\s\\S]*?)shots: \\[[\\s\\S]*?\\n    \\]`);
if (!re.test(apps)) throw new Error(`no shots list for ${set.show} in apps.mjs`);
writeFileSync(appsFile, apps.replace(re, (_, head) => head + list));

// The README's picture rows: English in rows of three, then 中文 in a fold.
const readme = join(repo, 'README.md');
const md = readFileSync(readme, 'utf8');
const alt = t => t.replace(/[’']/g, "'").replace(/"/g, '&quot;');
const rows = suf => { const r = []; for (let i = 0; i < set.shots.length; i += 3) r.push(`<p align="center">\n${set.shots.slice(i, i + 3).map((s, j) => `  <img src="docs/screenshots/${set.prefix}-${i + j + 1}${suf}.webp" width="30%" alt="${alt(suf ? s.zh : s.en)}">`).join('\n')}\n</p>`); return r.join('\n\n'); };
const block = `${rows('')}\n\n<details>\n<summary>中文畫面</summary>\n\n${rows('.zh')}\n\n</details>`;
const B = '<p align="center">\\n(?:  <img src="docs/screenshots/[^\\n]*\\n)+</p>';
const oldBlock = new RegExp(`${B}(?:\\n\\n${B})*(?:\\n\\n<details>\\n<summary>中文畫面</summary>\\n\\n${B}(?:\\n\\n${B})*\\n\\n</details>)?`);
if (!oldBlock.test(md)) throw new Error(`no screenshot rows in ${readme}`);
writeFileSync(readme, md.replace(oldBlock, () => block));
console.log(`written: ${shotsDir}, ${docs}, ${appsFile}, ${readme}`);
