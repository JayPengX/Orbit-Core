// Writes Quadra's icons and link preview cards into the app repos, checked
// out next to this one (../Quadra-Securities, ../Quadra-Play,
// ../Quadra-Fixtures, ../Quadra-Rewards (Quadra Hub), ../Orbit-Class). Needs
// Playwright's Chromium:
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
  stock: { dir: 'Quadra-Securities/public', icons: { 'icons/apple-touch-icon.png': 180, 'icons/icon-192.png': 192, 'icons/icon-512.png': 512 }, og: 'og-image.png', ogSquare: 'og-image-square.png' },
  odds: { dir: 'Quadra-Play/public', icons: { 'icons/apple-touch-icon.png': 180, 'icons/icon-192.png': 192, 'icons/icon-512.png': 512 }, og: 'og-image.jpg', ogSquare: 'og-image-square.jpg' },
  match: { dir: 'Quadra-Fixtures/public', icons: { 'icons/apple-touch-icon.png': 180, 'icons/icon-192.png': 192, 'icons/icon-512.png': 512 }, og: 'og-image.jpg', ogSquare: 'og-image-square.jpg' },
  vocab: { dir: 'Quadra-Rewards/public', icons: { 'icons/apple-touch-icon.png': 180, 'icons/icon-192.png': 192, 'icons/icon-512.png': 512 }, og: 'og-image.jpg', ogSquare: 'og-image-square.jpg' },
  orbit: { dir: 'Orbit-Class/public', icons: { 'icons/apple-touch-icon.png': 180, 'icons/icon-192.png': 192, 'icons/icon-512.png': 512, 'icons/favicon-32.png': 32, 'icons/favicon-16.png': 16 }, og: 'og-card.jpg', ogSquare: 'og-card-square.jpg' }
};

const browser = await chromium.launch();
const page = await browser.newPage();
async function png(svg, size, path, { rounded = true } = {}) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<html><body style="margin:0;background:transparent"><img style="width:${size}px;height:${size}px;display:block" src="data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}"></body></html>`);
  await page.screenshot({ path, omitBackground: rounded, type: 'png' });
}
// `node brand/generate.mjs match vocab` makes only those apps' files.
const only = process.argv.slice(2);
for (const [id, out] of Object.entries(OUT)) {
  if (only.length && !only.includes(id)) continue;
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
