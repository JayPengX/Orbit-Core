#!/usr/bin/env node
// node tools/live-scroll.mjs [app…] [--sheet "<js that opens a sheet>"]
//
// The guard for "a live update reset my scroll" (Jay 2026-11-01, the second
// time) and "this kind of jumping … fixed across all apps" (Jay 2026-11-03):
// each app opened on real data the way iPhone's Safari scrolls (no scroll
// anchoring), scrolled down, then
//   moved: something above the view grows (a refresh) — what was read stays;
//   jumped: the tab drawn anew a moment short, then full — no jump up;
//   drawing: a drawing under the view moves (a car on a track map, a chart's
//     dot) — the page never follows it;
//   tap ↓ / tap ↑: a button tapped, and the tap folds what's under it (the
//     page left short: a segment with less in it) or what's above it — the
//     button stays under the finger;
//   shrank (a sheet): a sheet sized to its content shows less (a day with
//     fewer rows) — it keeps its height while open.
// The same in a sheet when --sheet opens one. Exit code 1 on a fault.
// --without: the kit's keeper left out, to see what it catches.
// (The kit's hold-place.mjs is what holds it; this checks it still does.)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = k => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : null);
const sheetJs = opt('sheet');
const without = args.includes('--without');
const apps = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--sheet');
const list = apps.length ? apps : ['sports', 'transit', 'weather', 'securities', 'law', 'words', 'money', 'beats'];
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const preview = fileURLToPath(new URL('./preview.mjs', import.meta.url));
const accounts = fileURLToPath(new URL('./shots/accounts/', import.meta.url));

// In the page: the redraws, on the page's scroller (or the open sheet's).
const check = async inSheet => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  // The block in the page's flow that holds n (not in a drawing, not laid over).
  function flowBlock(n, view) {
    while (n?.ownerSVGElement) n = n.ownerSVGElement;
    for (let k = n; k && k !== view && k !== document.body; k = k.parentElement) {
      const cs = getComputedStyle(k);
      if (/^(absolute|fixed|sticky)$/.test(cs.position)) n = k.parentElement;
    }
    const column = p => {
      const cs = getComputedStyle(p);
      return /^(block|flow-root|list-item)$/.test(cs.display) || (/flex/.test(cs.display) && cs.flexDirection.startsWith('column'));
    };
    while (n && n !== view && !(column(n.parentElement) && !getComputedStyle(n).display.startsWith('inline'))) n = n.parentElement;
    return n && n !== view && view.contains(n) ? n : null;
  }
  const se = inSheet ? [...document.querySelectorAll('dialog[open]')].pop() : document.scrollingElement;
  if (!se) return { skipped: 'no sheet open' };
  const out = {};
  // A sheet sized to its content showing less: it keeps its height.
  if (inSheet && !se.hasAttribute('data-detent')) {
    const h0 = se.offsetHeight;
    // (Most of its rows and every part after the first: a day with less on it.)
    const hide = [...se.querySelectorAll('.q-section ~ .q-section, li, .q-cell, [class*="-row"]')].filter((n, i, all) => !all.some(o => o !== n && o.contains(n))).slice(2);
    hide.forEach(n => n.style.setProperty('display', 'none', 'important'));
    await wait(200);
    out.shrank = Math.round(h0 - se.offsetHeight);
    hide.forEach(n => n.style.removeProperty('display'));
    await wait(400);
  }
  const room = se.scrollHeight - se.clientHeight;
  if (room < 400) return { ...out, skipped: `too short to scroll (${room}px)` };
  const view = inSheet ? se : [...document.querySelectorAll('[id^=panel-], main, #app, .page')].find(x => !x.hidden && x.offsetParent !== null && x.scrollHeight > 400) || document.body;
  const box = view.querySelector('.q-section, .q-card, section, li, article') || view.firstElementChild;
  se.scrollTop = Math.min(Math.round(room * 0.8), 700);
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
  // A drawing under the view that moves: a shape filling an SVG, then a
  // box laid over the page (position: absolute), each moved 200 down.
  // (Tried again when the app's own redraw takes it away meanwhile.)
  out.drawing = 0;
  for (let tries = 0; tries < 3; tries++) {
    se.scrollTop = Math.min(Math.round(room * 0.8), 700);
    await wait(400);
    const host = flowBlock(document.elementFromPoint(r.left + r.width / 2, r.top + r.height * 0.45), view);
    if (!host) break;
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 100 100');
    svg.setAttribute('preserveAspectRatio', 'none');
    svg.style.cssText = `display:block;width:100%;height:${Math.round(r.height)}px;overflow:visible`;
    const car = document.createElementNS(ns, 'rect');
    Object.entries({ x: 0, y: 0, width: 100, height: 100, fill: 'transparent' }).forEach(([k, v]) => car.setAttribute(k, v));
    svg.append(car);
    const dot = document.createElement('div');
    dot.style.cssText = `position:absolute;left:0;right:0;top:0;height:${Math.round(r.height)}px`;
    const wrap = document.createElement('div');
    wrap.style.cssText = 'position:relative';
    wrap.append(svg, dot);
    host.before(wrap);
    // (Scrolled to it, as a reader comes to rest on a map: what's under the view now is the drawing.)
    await wait(150);
    se.scrollTop += Math.round(wrap.getBoundingClientRect().top - (r.top + r.height * 0.1));
    await wait(400);
    // (Each move with a redraw beside it, as a live map's update comes: the
    // keeper acts on a change to what's shown. Measured by where the
    // drawing's own box sits, so an app's own redraw meanwhile isn't counted.)
    let lost = false;
    for (const move of [() => car.setAttribute('y', '60'), () => (dot.style.top = '200px')]) {
      const y = wrap.getBoundingClientRect().top;
      move();
      wrap.append(document.createElement('i'));
      await wait(150);
      if (!wrap.isConnected) {
        lost = true;
        break;
      }
      out.drawing = Math.max(out.drawing, Math.abs(Math.round(wrap.getBoundingClientRect().top - y)));
    }
    wrap.remove();
    await wait(400);
    out.drawingLost = lost;
    if (!lost) break;
  }
  return out;
};
// A tap that folds part of the page: a button put in the page's flow at the
// middle of the view; its tap hides what's under it (`below`: the page left
// short) or a block above it (`above`). Returns where the button is.
const tapSetup = async ([inSheet, mode]) => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const se = inSheet ? [...document.querySelectorAll('dialog[open]')].pop() : document.scrollingElement;
  if (!se) return null;
  const room = se.scrollHeight - se.clientHeight;
  if (room < 400) return null;
  const view = inSheet ? se : [...document.querySelectorAll('[id^=panel-], main, #app, .page')].find(x => !x.hidden && x.offsetParent !== null && x.scrollHeight > 400) || document.body;
  se.scrollTop = Math.min(Math.round(room * 0.8), 700);
  await wait(400);
  const r = se === document.scrollingElement ? { top: 0, height: innerHeight, left: 0, width: innerWidth } : se.getBoundingClientRect();
  let n = document.elementFromPoint(r.left + r.width / 2, r.top + r.height * 0.5);
  while (n?.ownerSVGElement) n = n.ownerSVGElement;
  for (let k = n; k && k !== view; k = k.parentElement) if (/^(absolute|fixed|sticky)$/.test(getComputedStyle(k).position)) n = k.parentElement;
  // (A box in a column of boxes, never one in a row: a rail's card.)
  const column = p => {
    const cs = getComputedStyle(p);
    return /^(block|flow-root|list-item)$/.test(cs.display) || (/flex/.test(cs.display) && cs.flexDirection.startsWith('column'));
  };
  while (n && n !== view && !(column(n.parentElement) && !getComputedStyle(n).display.startsWith('inline'))) n = n.parentElement;
  if (!n || n === view || !view.contains(n)) return null;
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'probe';
  btn.style.cssText = 'display:block;width:100%;height:44px';
  n.before(btn);
  await wait(400);
  // What the tap folds: everything after the button, or the blocks above it (to 150px).
  const fold = [];
  if (mode === 'below') {
    for (let k = btn; k && k !== view; k = k.parentElement) for (let x = k.nextElementSibling; x; x = x.nextElementSibling) fold.push(x);
  } else {
    // (Boxes with a height of their own, never a display: contents wrapper,
    // and no more than the page has scrolled: a button can only be kept
    // under the finger if the page can scroll up that far.)
    let h = 0;
    for (let k = btn; k && k !== view && h < 150; k = k.parentElement)
      for (let x = k.previousElementSibling; x && h < 150; x = x.previousElementSibling) {
        const xh = x.offsetHeight;
        if (!xh || getComputedStyle(x).display === 'contents' || h + xh > se.scrollTop - 20) continue;
        h += xh;
        fold.push(x);
      }
    if (h < 40) return null;
  }
  // (Taken out of the page, as a redraw takes them: put back after.)
  const spots = fold.map(x => [x, x.parentNode, x.nextSibling]);
  btn.onclick = () => fold.forEach(x => x.remove());
  globalThis.__probe = { btn, back: () => spots.reverse().forEach(([x, p, next]) => p.insertBefore(x, next?.parentNode === p ? next : null)) };
  const b = btn.getBoundingClientRect();
  return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
};
const tapMeasure = async y => {
  const { btn, back } = globalThis.__probe;
  const b = btn.getBoundingClientRect();
  const moved = Math.round(b.top + b.height / 2 - y);
  back();
  btn.remove();
  await new Promise(r => setTimeout(r, 400));
  return moved;
};
async function taps(page, inSheet) {
  const out = {};
  for (const mode of ['below', 'above']) {
    const at = await page.evaluate(tapSetup, [inSheet, mode]);
    if (!at) continue;
    await page.mouse.click(at.x, at.y);
    await page.waitForTimeout(300);
    out[mode] = await page.evaluate(tapMeasure, at.y);
  }
  return out;
}

let faults = 0;
for (const app of list) {
  const port = 8300 + Math.floor(Math.random() * 500);
  // (Signed in to the app's demo account where it has one: a fan's 首頁 is long enough to scroll.)
  const demo = readdirSync(accounts).find(f => f.startsWith(`${app}-`) && f.endsWith('.txt'));
  const srv = spawn(process.execPath, [preview, app, '--live', '--serve', '--port', String(port), ...(demo ? ['--payload', join(accounts, demo)] : [])], { stdio: ['ignore', 'pipe', 'pipe'] });
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
    const results = { page: { ...(await page.evaluate(check, false)), tap: await taps(page, false) } };
    if (sheetJs) {
      await page.evaluate(sheetJs);
      await page.waitForTimeout(8000);
      results.sheet = { ...(await page.evaluate(check, true)), tap: await taps(page, true) };
    }
    for (const [where, r] of Object.entries(results)) {
      const t = r.tap || {};
      const bad = (!r.skipped && (Math.abs(r.moved) > 2 || Math.abs(r.jumped) > 40 || r.drawing > 2 || Math.abs(t.below ?? 0) > 2 || Math.abs(t.above ?? 0) > 2)) || r.shrank > 2;
      if (bad) faults++;
      const said = [`what was read moved ${r.moved}px`, `the page jumped ${r.jumped}px`, `a moving drawing pulled it ${r.drawing}px`, t.below != null ? `a tap folding below moved the button ${t.below}px` : '', t.above != null ? `folding above ${t.above}px` : '', r.shrank != null ? `the sheet shrank ${r.shrank}px` : ''];
      console.log(`${bad ? '✗' : '✓'} ${app} ${where}: ${r.drawingLost ? "(drawing lost) " : ""}${r.skipped ? [r.skipped, r.shrank != null ? `the sheet shrank ${r.shrank}px` : ''].filter(Boolean).join(', ') : said.filter(Boolean).join(', ')}`);
    }
  } finally {
    await browser.close();
    srv.kill();
  }
}
process.exit(faults ? 1 : 0);
