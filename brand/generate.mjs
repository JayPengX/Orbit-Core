// Writes the brand into the apps checked out next to this repo, and the
// family's own files into site/ (Orbit-Core's Pages): every icon, every
// share card, each page's name and link-preview tags (between <!-- brand -->
// and <!-- /brand -->) and its manifest. The marks and words are the kit's
// (kit/brand.mjs). Needs Playwright's Chromium:
//   node brand/generate.mjs            everything
//   node brand/generate.mjs match site  only those (looks: Orbit's alone)
import { writeFile, readFile, mkdir, rm, access } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { BRANDS, FAMILY, PASS, SITE_URL, LOOKS, appIcon, familyMark, homeOf, lookApp, orbitIcon, pathOf, shortPathOf } from '../kit/brand.mjs';
import { FORMATS, shareCard } from './marks.mjs';
import { DOMAIN } from '../kit/domain.mjs';

// The global one, or a Mac's in ~/.local/opt/playwright (as tools/preview.mjs).
const require = createRequire(`${execSync('npm root -g').toString().trim()}/`);
let chromium;
for (const p of ['playwright', `${process.env.HOME}/.local/opt/playwright/node_modules/playwright`]) {
  try {
    ({ chromium } = require(p));
    break;
  } catch {}
}
if (!chromium) throw new Error('Playwright not found: npm i -g playwright');
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
// Where an app's files are: its folder here, its site folder, and how its page names files (Orbit Class is
// built by Vite: no ./, and a ?v= the build fills in).
async function placeOf(id) {
  const b = BRANDS[id];
  const dir = b.repo;
  if (!(await exists(`${root}${dir}`))) return null;
  if (id === 'orbit') return { dir, site: `${root}${dir}/public/`, page: `${root}${dir}/index.html`, manifest: `${root}${dir}/public/manifest.json`, href: f => `${f}?v=__APP_VERSION__` };
  return { dir, site: `${root}${dir}/public/`, page: `${root}${dir}/public/index.html`, manifest: `${root}${dir}/public/manifest.webmanifest`, href: f => `./${f}` };
}

const browser = await chromium.launch();
const page = await browser.newPage();
async function png(svg, size, path) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent"><img style="width:${size}px;height:${size}px;display:block" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`);
  await page.screenshot({ path, omitBackground: true, type: 'png' });
}
async function cards(id, dir, formats = Object.keys(FORMATS)) {
  await mkdir(dir.replace(/[^/]*$/, ''), { recursive: true });
  for (const format of formats) {
    const { w, h, file } = FORMATS[format];
    await page.setViewportSize({ width: w, height: h });
    await page.setContent(shareCard(id, format), { waitUntil: 'load' });
    await page.evaluate(() => window.fitted || document.fonts.ready);
    await page.screenshot({ path: `${dir}${file}`, type: 'jpeg', quality: 86 });
  }
}
// An .ico holding one PNG (what a browser asks a site's root for).
function ico(png, size) {
  const head = Buffer.alloc(22);
  head.writeUInt16LE(1, 2);
  head.writeUInt16LE(1, 4);
  head.writeUInt8(size, 6);
  head.writeUInt8(size, 7);
  head.writeUInt16LE(1, 10);
  head.writeUInt16LE(32, 12);
  head.writeUInt32LE(png.length, 14);
  head.writeUInt32LE(22, 18);
  return Buffer.concat([head, png]);
}
const esc = t => String(t).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// The page's name, icons and link-preview tags, as one block.
// Each card's link carries ?v= from its picture, so a chat app that kept the
// old preview fetches the new one.
function headBlock(id, { href, description, xhtml, ver = {} }) {
  const b = BRANDS[id];
  const fam = FAMILY;
  const home = homeOf(id);
  const end = xhtml ? ' />' : '>';
  const alt = `${b.name} — ${b.tag.zh}`;
  const meta = (k, v, attr = 'name') => `<meta ${attr}="${k}" content="${esc(v)}"${end}`;
  const og = (k, v) => meta(`og:${k}`, v, 'property');
  const at = file => `${home}share/${file}${ver[file] ? `?v=${ver[file]}` : ''}`;
  const image = (file, w, h) => [og('image', at(file)), og('image:type', 'image/jpeg'), og('image:width', w), og('image:height', h), og('image:alt', alt)];
  return [
    '<!-- brand: Orbit-Core/brand/generate.mjs writes this block -->',
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
    meta('twitter:image', at(FORMATS.x.file)),
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
  const ver = {};
  for (const { file } of Object.values(FORMATS)) ver[file] = createHash('sha1').update(await readFile(`${place.site}share/${file}`)).digest('hex').slice(0, 8);
  const block = headBlock(id, { href: place.href, description, xhtml, ver });
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
    // Upright only: every layout is drawn for a phone held upright (the owner, 2026-10-10).
    orientation: 'any',
    icons: [
      { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: 'favicon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
    ]
  });
  await writeFile(place.manifest, JSON.stringify(m, null, 2) + '\n');
}
// Files no page links any more.
const RETIRED = ['og-image.jpg', 'og-image-square.jpg', 'og-image.png', 'og-image-square.png', 'og-card.jpg', 'og-card-square.jpg', 'icons/icon.svg', 'icons/favicon-16.png', 'share/story.jpg'];

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
  await png(appIcon(id), 32, `${site}icons/favicon-32.png`);
  await cards(id, `${site}share/`);
  for (const old of RETIRED) await rm(`${site}${old}`, { force: true });
  await writePage(id, place);
  await writeManifest(id, place);
  console.log('wrote', id, BRANDS[id].name, '->', place.dir);
}

// The family's own: its mark and the pass, with the pass's cards (site/brand/).
if (!only.length || only.includes('site')) {
  const out = `${here}site/brand/`;
  await mkdir(out, { recursive: true });
  await writeFile(`${out}family-orbit.svg`, familyMark());
  await writeFile(`${out}pass.svg`, appIcon('pass'));
  // The PNGs Safari and iOS want (they don't take the SVG), and favicon.ico
  // at Orbit-Core's root, which site.js serves at orbit.<domain>/favicon.ico.
  await mkdir(`${here}site/icons`, { recursive: true });
  await png(appIcon('pass', { shape: 'square' }), 180, `${here}site/icons/apple-touch-icon.png`);
  await png(appIcon('pass'), 32, `${here}site/icons/favicon-32.png`);
  await writeFile(`${here}site/favicon.ico`, ico(await readFile(`${here}site/icons/favicon-32.png`), 32));
  await cards('pass', `${out}pass-`, ['og', 'x']);
  for (const id of Object.keys(BRANDS)) await writeFile(`${out}${id}.svg`, appIcon(id));
  await writeFile(`${here}site/index.html`, homePage());
  console.log('wrote site/brand and site/index.html', PASS.name);
}
// Orbit (site/app/, kit/suite.mjs): its mark, and every look an Orbit can
// wear (kit/brand.mjs LOOKS) as the pictures a phone takes at Add to Home
// Screen (site/app/looks/<look>/: apple.png for an iPhone, icon.png and
// maskable.png for Android; kit/orbit-mine.mjs lookFiles). An app's look is
// that app's own icons.
if (!only.length || only.includes('site') || only.includes('looks')) {
  await mkdir(`${here}site/app/icons`, { recursive: true });
  await writeFile(`${here}site/app/favicon.svg`, familyMark());
  for (const [file, size] of Object.entries({ 'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512 })) await png(familyMark({ shape: 'square' }), size, `${here}site/app/icons/${file}`);
  await png(familyMark({ shape: 'maskable' }), 512, `${here}site/app/icons/maskable-512.png`);
  await rm(`${here}site/app/looks`, { recursive: true, force: true });
  for (const look of LOOKS.filter(l => !lookApp(l))) {
    const dir = `${here}site/app/looks/${look}/`;
    await mkdir(dir, { recursive: true });
    await png(orbitIcon(look, { shape: 'square' }), 180, `${dir}apple.png`);
    await png(orbitIcon(look, { shape: 'square' }), 512, `${dir}icon.png`);
    await png(orbitIcon(look, { shape: 'maskable' }), 512, `${dir}maskable.png`);
  }
  console.log('wrote site/app: Orbit and', LOOKS.filter(l => !lookApp(l)).length, 'looks');
}
await browser.close();

// The family's home (orbit.<d>/, the root; /pass/ forwards here): Orbit first, the
// whole family in one home-screen app (/app/), then each app on its own,
// the Pass that signs into all of them last. In one language at a time
// (Jay 2026-10-27: "mixed with two languages"): written in Chinese, each text
// carries its English in data-en, swapped for a reader whose Orbit language
// (orbit.lang, kit detectLang's rule) is English. No switch on the page (Jay
// 2026-11-14: the language is picked by itself). Jay 2026-11-14: "look
// better", not more on it; the lines are the brand's short pitches.
function homePage() {
  const home = `${SITE_URL}${DOMAIN ? '/' : '/Orbit-Core/'}`;
  // (served at the root, its files stay where the site is: /pass/…)
  const at = DOMAIN ? '/pass/' : './';
  const two = (tag, t, attrs = '') => `<${tag}${attrs} data-en="${esc(t.en)}">${esc(t.zh)}</${tag}>`;
  const chev = '<svg class="chev" viewBox="0 0 8 14" aria-hidden="true"><path d="M1 1l6 6-6 6"/></svg>';
  const ids = Object.keys(BRANDS);
  const card = id => {
    const b = BRANDS[id];
    return `<a class="app" href="${DOMAIN ? shortPathOf(id) : pathOf(id)}"><img src="${at}brand/${id}.svg" alt="" width="48" height="48"><span class="t"><strong>${esc(b.name)}</strong>${two('small', b.pitch)}</span>${chev}</a>`;
  };
  const stack = ids.map((id, i) => `<img src="${at}brand/${id}.svg" alt="" width="40" height="40" style="--i:${i}">`).join('');
  const og = (k, v) => `<meta property="og:${k}" content="${esc(v)}">`;
  return `<!doctype html>
<html lang="zh-Hant"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Orbit</title>
<meta name="description" content="Orbit：每天用得到的 App，全部用同一個 Orbit Pass。">
<meta name="theme-color" media="(prefers-color-scheme: light)" content="#f2f2f7"><meta name="theme-color" media="(prefers-color-scheme: dark)" content="#05051a">
<link rel="icon" href="${at}brand/family-orbit.svg" type="image/svg+xml"><link rel="icon" href="${at}icons/favicon-32.png" sizes="32x32" type="image/png">
<link rel="manifest" href="/app/manifest.webmanifest"><link rel="apple-touch-icon" href="/app/icons/apple-touch-icon.png"><meta name="apple-mobile-web-app-title" content="Orbit"><meta name="application-name" content="Orbit">
<script>(()=>{let s=false;try{s=matchMedia('(display-mode: standalone)').matches||navigator.standalone===true||sessionStorage.getItem('orbit.suite')==='1'||sessionStorage.getItem('orbit.addr')==='/'}catch{}if(s)location.replace('/app/'+location.search+location.hash)})()</script>
${og('type', 'website')}${og('site_name', 'Orbit')}${og('title', 'Orbit')}${og('description', 'Orbit：每天用得到的 App，一個 Orbit Pass。')}${og('url', home)}${og('image', `${SITE_URL}${DOMAIN ? '/pass/' : '/Orbit-Core/'}brand/pass-og.jpg`)}${og('image:width', 1200)}${og('image:height', 630)}
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:image" content="${SITE_URL}${DOMAIN ? '/pass/' : '/Orbit-Core/'}brand/pass-x.jpg">
<script>(()=>{let l;try{l=localStorage.getItem('orbit.lang')}catch{}if(l!=='zh'&&l!=='en'){const n=navigator.languages?.length?navigator.languages:[navigator.language||'zh-TW'];l=n.some(x=>/^zh/i.test(x))?'zh':'en'}if(l==='en')document.documentElement.lang='en'})()</script>
<style>
:root{color-scheme:light dark;--page:#f2f2f7;--glow:rgba(99,102,241,.16);--cell:#fff;--label:#000;--label-2:rgba(60,60,67,.6);--sep:rgba(60,60,67,.18);--press:rgba(0,0,0,.04);--btn:#4f46e5;--btn-ink:#fff;--ring:#f2f2f7}
@media (prefers-color-scheme:dark){:root{--page:#05051a;--glow:rgba(99,102,241,.32);--cell:rgba(255,255,255,.06);--label:#fff;--label-2:rgba(235,235,245,.6);--sep:rgba(255,255,255,.09);--press:rgba(255,255,255,.06);--btn:#eef0ff;--btn-ink:#1e1b4b;--ring:#0b0b26}}
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;min-height:100vh;background:radial-gradient(120% 60% at 50% -10%,var(--glow),transparent 70%) no-repeat,var(--page);color:var(--label);font:17px/1.4 -apple-system,BlinkMacSystemFont,"SF Pro Text","PingFang TC","Noto Sans TC","Microsoft JhengHei",system-ui,sans-serif;-webkit-font-smoothing:antialiased}
main{max-width:1120px;margin:0 auto;padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(40px,env(safe-area-inset-bottom)) max(16px,env(safe-area-inset-left))}
.hero{display:flex;flex-direction:column;align-items:center;text-align:center;padding:48px 0 48px}
.mark{width:96px;height:96px;border-radius:22px;box-shadow:0 12px 32px rgba(30,27,75,.28)}
h1{margin:20px 0 0;font:700 44px/1.05 ui-rounded,-apple-system,BlinkMacSystemFont,"SF Pro Rounded",system-ui,sans-serif;letter-spacing:-.01em}
.lead{margin:8px 0 0;font-size:17px;color:var(--label-2)}.lead span{display:inline-block}
.stack{display:grid;grid-template-columns:repeat(10,minmax(0,40px));justify-content:center;gap:6px;width:100%;margin:28px 0 0}
.stack img{width:100%;height:auto;aspect-ratio:1;border-radius:23%;box-shadow:0 2px 6px rgba(0,0,0,.12)}
.go{display:inline-flex;align-items:center;gap:8px;margin-top:28px;padding:14px 28px;border-radius:999px;background:var(--btn);color:var(--btn-ink);font-weight:600;text-decoration:none;transition:transform .2s}
.go:hover{transform:translateY(-1px)}.go:active{transform:scale(.97)}
.go svg{width:16px;height:16px}
.note{margin:12px 0 0;font-size:13px;color:var(--label-2)}
h2{margin:0 16px 8px;font-size:15px;font-weight:600;line-height:1.3;color:var(--label-2)}
.apps{background:var(--cell);border-radius:22px;overflow:hidden}
.app{position:relative;display:flex;align-items:center;gap:14px;padding:10px 16px;min-height:68px;color:inherit;text-decoration:none;-webkit-tap-highlight-color:transparent}
.app+.app::before{content:"";position:absolute;top:0;left:78px;right:0;border-top:.5px solid var(--sep)}
.app:hover,.app:active{background:var(--press)}
.app img{flex:none;width:48px;height:48px;border-radius:12px}
.t{display:grid;flex:1;min-width:0}.t strong{font-weight:500}.t small{font-size:15px;color:var(--label-2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.chev{flex:none;width:8px;height:14px;fill:none;stroke:var(--label-2);stroke-width:2;stroke-linecap:round;stroke-linejoin:round;opacity:.6}
.more{display:flex;align-items:center;gap:14px;margin-top:16px;padding:10px 16px;min-height:68px;border-radius:22px;background:var(--cell);color:inherit;text-decoration:none}.more:hover{background:var(--press)}
.glyph{flex:none;display:grid;place-items:center;width:48px;height:48px;border-radius:12px;background:#4f46e5;color:#fff}.glyph svg{width:26px;height:26px}
.pass{display:flex;align-items:center;gap:12px;margin:32px 16px 0;color:var(--label-2);font-size:15px}
.pass img{flex:none;width:32px;height:32px;border-radius:8px}.nb{display:inline-block}.pass strong{color:var(--label);font-weight:500}
a:focus-visible,button:focus-visible{outline:2px solid #6366f1;outline-offset:2px}
@media (min-width:720px){
  .hero{padding:80px 0 64px}.mark{width:112px;height:112px;border-radius:26px}h1{font-size:56px}.lead{font-size:19px}
  .stack{grid-template-columns:repeat(10,48px);gap:10px}
  .apps{display:grid;grid-template-columns:repeat(2,1fr);gap:12px;background:none;border-radius:0;overflow:visible}
  .app{background:var(--cell);border-radius:20px;padding:14px 16px}.app+.app::before{display:none}
  .app img{width:56px;height:56px;border-radius:14px}
  .pass{justify-content:center;margin-top:40px}
  .more{max-width:420px;margin:24px auto 0}.glyph{width:56px;height:56px;border-radius:14px}
}
@media (min-width:1000px){
  .apps{grid-template-columns:repeat(5,1fr)}
  .app{flex-direction:column;align-items:flex-start;gap:12px;padding:20px}.app img{width:64px;height:64px;border-radius:15px}.app .chev{display:none}
  .t small{white-space:normal}
}
@media (hover:hover) and (pointer:fine){.note{display:none}}
</style></head><body><main>
<section class="hero">
<img class="mark" src="${at}brand/family-orbit.svg" alt="">
<h1>${FAMILY.name}</h1>
<p class="lead">${two('span', { zh: '每天用得到的 App，', en: 'Your everyday apps, ' })}${two('span', { zh: '都在一個圖示裡，登入一次就好。', en: 'all in one icon, signed in once.' })}</p>
<div class="stack" aria-hidden="true">${stack}</div>
<a class="go" href="/app/"><span data-en="Open Orbit">打開 Orbit</span><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10M9 4l4 4-4 4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></a>
${two('p', { zh: '在手機上加到主畫面，就是一個 App。', en: 'On a phone, add it to your Home Screen.' }, ' class="note"')}
</section>
<section>${two('h2', { zh: '也可以單獨打開', en: 'Or open one on its own' })}<div class="apps">${ids.map(card).join('')}</div></section>
<a class="more" href="https://jaypengx.com/showcase/"><span class="glyph"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 5h16v11H4zM12 16v3M8 20h8M8 13v-3M12 13V8M16 13v-5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="t"><strong data-en="Showcase">展示</strong><small data-en="How Orbit is built">Orbit 怎麼做出來的</small></span>${chev}</a>
<p class="pass"><img src="${at}brand/pass.svg" alt=""><span><strong>${esc(PASS.name)}</strong> · <span class="nb" data-en="${esc(PASS.tag.en)}">${esc(PASS.tag.zh)}</span></span></p>
</main>
<script>if(document.documentElement.lang==='en')for(const el of document.querySelectorAll('[data-en]'))el.textContent=el.dataset.en</script>
</body></html>
`;
}
