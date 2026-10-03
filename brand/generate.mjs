// Writes the brand into the apps checked out next to this repo, and the
// family's own files into site/ (Shared-Proxy's Pages): every icon, every
// share card, each page's name and link-preview tags (between <!-- brand -->
// and <!-- /brand -->) and its manifest. The marks and words are the kit's
// (kit/brand.mjs). Needs Playwright's Chromium:
//   node brand/generate.mjs            everything
//   node brand/generate.mjs match site  only those
import { writeFile, readFile, mkdir, rm, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { BRANDS, FAMILIES, PASS, appIcon, familyMark, homeOf, pathOf } from '../kit/brand.mjs';
import { FORMATS, shareCard } from './marks.mjs';

const require = createRequire(`${execSync('npm root -g').toString().trim()}/`);
const { chromium } = require('playwright');
const root = new URL('../../', import.meta.url).pathname;
const here = new URL('../', import.meta.url).pathname;
const exists = p =>
  access(p).then(
    () => true,
    () => false
  );

// What each app's page says about it (the page's own description is kept
// unless one is given here).
const ABOUT = {
  vocab: '大考中心 6000 字（一到六級），每個字都有真人發音；記憶模型替你安排複習，背過的字不再忘。'
};
// Where an app's files are: its folder here (the old name until the repo is
// renamed), its site folder, and how its page names files (Orbit Class is
// built by Vite: no ./, and a ?v= the build fills in).
async function placeOf(id) {
  const b = BRANDS[id];
  for (const dir of [b.repo, b.was].filter(Boolean)) {
    if (!(await exists(`${root}${dir}`))) continue;
    if (id === 'orbit') return { dir, site: `${root}${dir}/public/`, page: `${root}${dir}/index.html`, manifest: `${root}${dir}/public/manifest.json`, href: f => `${f}?v=__APP_VERSION__` };
    return { dir, site: `${root}${dir}/public/`, page: `${root}${dir}/public/index.html`, manifest: `${root}${dir}/public/manifest.webmanifest`, href: f => `./${f}` };
  }
  return null;
}

const browser = await chromium.launch();
const page = await browser.newPage();
async function png(svg, size, path) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent"><img style="width:${size}px;height:${size}px;display:block" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`);
  await page.screenshot({ path, omitBackground: true, type: 'png' });
}
async function cards(id, dir) {
  await mkdir(dir.replace(/[^/]*$/, ''), { recursive: true });
  for (const [format, { w, h, file }] of Object.entries(FORMATS)) {
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(shareCard(id, format), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.screenshot({ path: `${dir}${file}`, type: 'jpeg', quality: 86 });
  }
}
const esc = t => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// The page's name, icons and link-preview tags, as one block.
function headBlock(id, { href, description, xhtml }) {
  const b = BRANDS[id];
  const fam = FAMILIES[b.family];
  const home = homeOf(id);
  const end = xhtml ? ' />' : '>';
  const alt = `${b.name} — ${b.tag.zh}`;
  const meta = (k, v, attr = 'name') => `<meta ${attr}="${k}" content="${esc(v)}"${end}`;
  const og = (k, v) => meta(`og:${k}`, v, 'property');
  const image = (file, w, h) => [og('image', `${home}share/${file}`), og('image:type', 'image/jpeg'), og('image:width', w), og('image:height', h), og('image:alt', alt)];
  return [
    '<!-- brand: Shared-Proxy/brand/generate.mjs writes this block -->',
    `<title>${esc(b.name)}</title>`,
    meta('description', description),
    meta('application-name', b.name),
    meta('apple-mobile-web-app-title', b.short),
    `<link rel="icon" href="${href('favicon.svg')}" type="image/svg+xml"${end}`,
    `<link rel="icon" href="${href('icons/favicon-32.png')}" sizes="32x32" type="image/png"${end}`,
    `<link rel="apple-touch-icon" href="${href('icons/apple-touch-icon.png')}"${end}`,
    og('type', 'website'),
    og('site_name', fam.name),
    og('title', b.name),
    og('description', description),
    og('url', home),
    og('locale', 'zh_TW'),
    og('locale:alternate', 'en_US'),
    ...image(FORMATS.og.file, 1200, 630),
    ...image(FORMATS.square.file, 1200, 1200),
    meta('twitter:card', 'summary_large_image'),
    meta('twitter:title', b.name),
    meta('twitter:description', description),
    meta('twitter:image', `${home}share/${FORMATS.x.file}`),
    meta('twitter:image:alt', alt),
    '<!-- /brand -->'
  ].join('\n');
}
// Every tag the block replaces, wherever the page had it.
const OLD = [/<title>[^<]*<\/title>/, /<meta (?:name|property)="(?:description|application-name|apple-mobile-web-app-title|og:[^"]+|twitter:[^"]+)"[^>]*>/, /<link rel="(?:icon|apple-touch-icon)"[^>]*>/];
function brandPage(html, id) {
  const description = ABOUT[id] || html.match(/<meta name="description" content="([^"]*)"/)?.[1]?.replace(/&quot;/g, '"').replace(/&amp;/g, '&') || BRANDS[id].tag.zh;
  return { description, html };
}
async function writePage(id, place) {
  let html = await readFile(place.page, 'utf8');
  const { description } = brandPage(html, id);
  const xhtml = / \/>/.test(html.match(/<meta charset[^>]*>/)?.[0] || '');
  const block = headBlock(id, { href: place.href, description, xhtml });
  if (/<!-- brand[\s\S]*?<!-- \/brand -->/.test(html)) html = html.replace(/<!-- brand[\s\S]*?<!-- \/brand -->/, block);
  else {
    const lines = html.split('\n');
    const hit = i => OLD.some(re => re.test(lines[i]));
    const first = lines.findIndex((l, i) => hit(i) && i < lines.findIndex(x => /<\/head>/.test(x)));
    const indent = lines[first].match(/^\s*/)[0];
    const kept = lines.filter((l, i) => i === first || !hit(i));
    kept[kept.indexOf(lines[first])] = block.split('\n').map(l => indent + l).join('\n');
    html = kept.join('\n');
  }
  // The loading screen says the app's name.
  html = html.replace(/(<div id="loading" data-title=")[^"]*"/, `$1${BRANDS[id].name}"`);
  await writeFile(place.page, html);
}
async function writeManifest(id, place) {
  if (!(await exists(place.manifest))) return;
  const b = BRANDS[id];
  const m = JSON.parse(await readFile(place.manifest, 'utf8'));
  const html = await readFile(place.page, 'utf8');
  Object.assign(m, {
    name: b.name,
    short_name: b.short,
    description: html.match(/<meta name="description" content="([^"]*)"/)?.[1] || b.tag.zh,
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
    ]
  });
  await writeFile(place.manifest, JSON.stringify(m, null, 2) + '\n');
}
// Pictures the old brand left behind.
const RETIRED = ['og-image.jpg', 'og-image-square.jpg', 'og-image.png', 'og-image-square.png', 'og-card.jpg', 'og-card-square.jpg', 'icons/icon.svg'];

const only = process.argv.slice(2);
for (const id of Object.keys(BRANDS)) {
  if (only.length && !only.includes(id)) continue;
  const place = await placeOf(id);
  if (!place) {
    console.log('skip', id, '(not checked out)');
    continue;
  }
  const { site } = place;
  await mkdir(`${site}icons`, { recursive: true });
  await writeFile(`${site}favicon.svg`, appIcon(id));
  for (const [file, size] of Object.entries({ 'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512 })) await png(appIcon(id, { shape: 'square' }), size, `${site}icons/${file}`);
  await png(appIcon(id, { shape: 'maskable' }), 512, `${site}icons/maskable-512.png`);
  for (const size of [32, 16]) await png(appIcon(id), size, `${site}icons/favicon-${size}.png`);
  await cards(id, `${site}share/`);
  for (const old of RETIRED) await rm(`${site}${old}`, { force: true });
  await writePage(id, place);
  await writeManifest(id, place);
  console.log('wrote', id, BRANDS[id].name, '->', place.dir);
}

// The family's own: both marks, the pass, their cards (site/brand/).
if (!only.length || only.includes('site')) {
  const out = `${here}site/brand/`;
  await mkdir(out, { recursive: true });
  for (const f of Object.keys(FAMILIES)) {
    await writeFile(`${out}family-${f}.svg`, familyMark(f));
    await png(familyMark(f), 512, `${out}family-${f}-512.png`);
    await png(familyMark(f, { shape: 'square' }), 180, `${out}family-${f}-180.png`);
    await cards(`family:${f}`, `${out}family-${f}-`);
  }
  await writeFile(`${out}pass.svg`, appIcon('pass'));
  await png(appIcon('pass', { shape: 'square' }), 180, `${out}pass-180.png`);
  await cards('pass', `${out}pass-`);
  for (const id of Object.keys(BRANDS)) await writeFile(`${out}${id}.svg`, appIcon(id));
  await writeFile(`${here}site/index.html`, homePage());
  console.log('wrote site/brand and site/index.html', PASS.name);
}
await browser.close();

// The family's home (Shared-Proxy's Pages root): both families, every app.
function homePage() {
  const home = 'https://jaypengx.github.io/Shared-Proxy/';
  const card = id => {
    const b = BRANDS[id];
    return `<a class="app" href="${pathOf(id)}"><img src="brand/${id}.svg" alt="" width="64" height="64"><span><strong>${esc(b.name)}</strong><small>${esc(b.tag.zh)}</small><small class="en">${esc(b.tag.en)}</small></span></a>`;
  };
  const family = f => `<section><h2><img src="brand/family-${f}.svg" alt="" width="36" height="36">${FAMILIES[f].name}<small>${esc(FAMILIES[f].tag.zh)}</small></h2><div class="apps">${Object.keys(BRANDS).filter(id => BRANDS[id].family === f).map(card).join('')}</div></section>`;
  const og = (k, v) => `<meta property="og:${k}" content="${esc(v)}">`;
  return `<!doctype html>
<html lang="zh-Hant"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Quadra & Orbit</title>
<meta name="description" content="Quadra：投資與娛樂，一個帳戶。Orbit：每天用得到的小工具。全部用同一個 Quadra Pass。">
<link rel="icon" href="brand/pass.svg" type="image/svg+xml">
${og('type', 'website')}${og('site_name', 'Quadra')}${og('title', 'Quadra & Orbit')}${og('description', 'Quadra：投資與娛樂。Orbit：每天用得到的小工具。一個 Quadra Pass。')}${og('url', home)}${og('image', `${home}brand/pass-og.jpg`)}${og('image:width', 1200)}${og('image:height', 630)}
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${home}brand/pass-x.jpg">
<style>
:root{color-scheme:light dark;--bg:#f4f5f8;--card:#fff;--text:#0f172a;--muted:#64748b;--line:#e2e8f0}
@media (prefers-color-scheme:dark){:root{--bg:#020617;--card:#0f172a;--text:#e2e8f0;--muted:#94a3b8;--line:#1e293b}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font:16px/1.5 system-ui,-apple-system,'Noto Sans TC',sans-serif}
main{max-width:880px;margin:0 auto;padding:40px 16px 64px}
header{display:flex;align-items:center;gap:16px;margin-bottom:28px}header img{width:72px;height:72px}
h1{margin:0;font-size:32px;letter-spacing:-.02em}header p{margin:2px 0 0;color:var(--muted)}
h2{display:flex;align-items:center;gap:10px;font-size:22px;margin:32px 0 12px}h2 img{border-radius:9px}h2 small{font-size:14px;font-weight:500;color:var(--muted)}
.apps{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:12px}
.app{display:flex;gap:14px;align-items:center;padding:14px;border-radius:18px;background:var(--card);border:1px solid var(--line);color:inherit;text-decoration:none}
.app:hover{border-color:var(--muted)}.app img{flex:none;border-radius:15px}.app span{display:grid;min-width:0}
.app small{color:var(--muted);font-size:13px}.app small.en{font-size:12px}
footer{margin-top:40px;color:var(--muted);font-size:13px}
</style></head><body><main>
<header><img src="brand/pass.svg" alt=""><div><h1>Quadra Pass</h1><p>${esc(PASS.tag.zh)} · ${esc(PASS.tag.en)}</p></div></header>
${family('quadra')}${family('orbit')}
<footer>Shared-Proxy: the Workers, the kit every app loads (kit/) and these marks (brand/).</footer>
</main></body></html>
`;
}
