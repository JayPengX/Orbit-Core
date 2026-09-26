// Writes Quadra's icons and link preview cards into the four app repos,
// checked out next to this one (../Stock-Study, ../Odds-Study,
// ../Match-Find, ../Orbit-Vocab). Needs Playwright's Chromium:
//   node brand/generate.mjs
import { writeFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { execSync } from 'node:child_process';
import { APPS, appIcon, quadraMark, shareCard } from './marks.mjs';

const require = createRequire(`${execSync('npm root -g').toString().trim()}/`);
const { chromium } = require('playwright');
const root = new URL('../../', import.meta.url).pathname;
// Where each app keeps its site's files, and which icon files it uses.
const OUT = {
  stock: { dir: 'Stock-Study/public', icons: { 'icons/apple-touch-icon.png': 180, 'icons/icon-192.png': 192, 'icons/icon-512.png': 512 }, og: 'og-image.png', ogSquare: 'og-image-square.png' },
  odds: { dir: 'Odds-Study/public', icons: { 'icons/apple-touch-icon.png': 180, 'icons/icon-192.png': 192, 'icons/icon-512.png': 512 }, og: 'og-image.jpg', ogSquare: 'og-image-square.jpg' },
  match: { dir: 'Match-Find/public', icons: { 'icons/icon-180.png': 180, 'icons/icon-192.png': 192, 'icons/icon-512.png': 512 }, og: 'og-image.jpg', ogSquare: 'og-image-square.jpg' },
  vocab: { dir: 'Orbit-Vocab', icons: { 'icons/apple-touch-icon.png': 180, 'icons/icon-192.png': 192, 'icons/icon-512.png': 512, 'icons/favicon-32.png': 32, 'icons/favicon-16.png': 16 }, og: 'assets/og-card.jpg', ogSquare: 'assets/og-card-square.jpg' }
};

const browser = await chromium.launch();
const page = await browser.newPage();
async function png(svg, size, path, { rounded = true } = {}) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent"><img style="width:${size}px;height:${size}px;display:block" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`);
  await page.screenshot({ path, omitBackground: rounded, type: 'png' });
}
for (const [id, out] of Object.entries(OUT)) {
  const dir = `${root}${out.dir}/`;
  await mkdir(`${dir}icons`, { recursive: true });
  await writeFile(`${dir}favicon.svg`, appIcon(id));
  // Home-screen icons are square (the phone rounds them itself).
  for (const [file, size] of Object.entries(out.icons)) await png(appIcon(id, { rounded: size <= 32 }), size, `${dir}${file}`, { rounded: size <= 32 });
  for (const [file, square] of [[out.og, false], [out.ogSquare, true]]) {
    await page.setViewportSize({ width: 1200, height: square ? 1200 : 630 });
    await page.setContent(shareCard(id, { square }));
    await page.waitForTimeout(300);
    await page.screenshot({ path: `${dir}${file}`, type: file.endsWith('.png') ? 'png' : 'jpeg', ...(file.endsWith('.png') ? {} : { quality: 88 }) });
  }
  console.log('wrote', id, APPS[id].en);
}
await writeFile(new URL('./quadra-mark.svg', import.meta.url), quadraMark());
await browser.close();
