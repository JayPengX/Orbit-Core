#!/usr/bin/env node
// node tools/live-scroll.mjs [app…] [--sheet "<js that opens a sheet>"]
//
// The guard for "a live update reset my scroll" (Jay 2026-11-01, the second
// time): each app opened on real data the way iPhone's Safari scrolls (no
// scroll anchoring), scrolled down, then redrawn the ways a live refresh
// redraws: something above the view grows, and the whole tab is drawn anew
// a moment short (a spinner, pictures not in) before it's full again. The
// place must hold: what was read stays where it was, the page never jumps
// up. The same in a sheet when --sheet opens one. Exit code 1 on a fault.
// --without: the kit's keeper left out, to see what it catches.
// (The kit's hold-place.mjs is what holds it; this checks it still does.)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const args = process.argv.slice(2);
const opt = k => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : null);
const sheetJs = opt('sheet');
const without = args.includes('--without');
const apps = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--sheet');
const list = apps.length ? apps : ['sports', 'transit', 'weather', 'securities', 'law', 'words', 'money', 'beats'];
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const preview = fileURLToPath(new URL('./preview.mjs', import.meta.url));

// In the page: the two redraws, on the page's scroller (or the open sheet's).
const check = async inSheet => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const se = inSheet ? [...document.querySelectorAll('dialog[open]')].pop() : document.scrollingElement;
  if (!se) return { skipped: 'no sheet open' };
  const room = se.scrollHeight - se.clientHeight;
  if (room < 600) return { skipped: `too short to scroll (${room}px)` };
  const view = inSheet ? se : [...document.querySelectorAll('[id^=panel-], main, #app, .page')].find(x => !x.hidden && x.offsetParent !== null && x.scrollHeight > 400) || document.body;
  const box = view.querySelector('.q-section, .q-card, section, li, article') || view.firstElementChild;
  const out = {};
  se.scrollTop = Math.min(room, 700);
  await wait(400);
  const r = se === document.scrollingElement ? { top: 0, height: innerHeight, left: 0, width: innerWidth } : se.getBoundingClientRect();
  const a = document.elementFromPoint(r.left + r.width / 2, r.top + r.height * 0.4);
  const y = a.getBoundingClientRect().top;
  const extra = document.createElement('div');
  extra.style.height = '120px';
  box.before(extra);
  await wait(60);
  out.moved = Math.round(a.getBoundingClientRect().top - y);
  extra.remove();
  await wait(400);
  const parent = box.parentNode;
  const kids = [...parent.childNodes];
  const at = Math.round(se.scrollTop);
  const spin = document.createElement('div');
  spin.style.height = '80px';
  parent.replaceChildren(spin);
  await wait(40);
  parent.replaceChildren(...kids);
  await wait(400);
  out.jumped = at - Math.round(se.scrollTop);
  return out;
};

let faults = 0;
for (const app of list) {
  const port = 8300 + Math.floor(Math.random() * 500);
  const srv = spawn(process.execPath, [preview, app, '--live', '--serve', '--port', String(port)], { stdio: ['ignore', 'pipe', 'pipe'] });
  const url = await new Promise((res, rej) => {
    const t = setTimeout(() => rej(new Error('preview did not start')), 30_000);
    srv.stdout.on('data', d => {
      const m = String(d).match(/http:\/\/localhost:\d+\/[^/\s]+\//);
      if (m) clearTimeout(t), res(m[0]);
    });
    srv.on('exit', () => rej(new Error('preview exited')));
  }).catch(e => (console.log(`${app}: ${e.message}`), null));
  if (!url) {
    faults++;
    continue;
  }
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    // Safari's way: no scroll anchoring anywhere.
    await page.addInitScript(() => document.addEventListener('DOMContentLoaded', () => document.head.append(Object.assign(document.createElement('style'), { textContent: '*{overflow-anchor:none!important}' }))));
    if (without) await page.addInitScript(() => (globalThis.__orbitHoldPlace = true));
    await page.goto(url);
    await page.waitForTimeout(8000);
    const results = { page: await page.evaluate(check, false) };
    if (sheetJs) {
      await page.evaluate(sheetJs);
      await page.waitForTimeout(8000);
      results.sheet = await page.evaluate(check, true);
    }
    for (const [where, r] of Object.entries(results)) {
      const bad = !r.skipped && (Math.abs(r.moved) > 2 || Math.abs(r.jumped) > 40);
      if (bad) faults++;
      console.log(`${bad ? '✗' : '✓'} ${app} ${where}: ${r.skipped || `what was read moved ${r.moved}px, the page jumped ${r.jumped}px`}`);
    }
  } finally {
    await browser.close();
    srv.kill();
  }
}
process.exit(faults ? 1 : 0);
