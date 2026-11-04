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
// And before any of that, as each loads, untouched:
//   late: the page once its loading screen lifts, and a sheet once open —
//     nothing drawn on screen moves on its own while the rest is read (a
//     part that comes later holds its place in its shape from the first
//     drawing, the kit's waiting(); Jay 2026-11-03: 預計先發 came in after
//     everything else and pushed the game's page down). Names what moved and
//     by how much.
// The same in a sheet when --sheet opens one (Sports: its game pages, by
// themselves; "" for none). Exit code 1 on a fault.
// --without: the kit's keeper left out, to see what it catches.
// (The kit's hold-place.mjs is what holds it; this checks it still does.)
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = k => (args.includes(`--${k}`) ? args[args.indexOf(`--${k}`) + 1] : null);
// An app's own sheets to check when none is given: Sports' game page (who
// starts, the season's leaders, who's out and the table all read after the
// game's own page): an NBA game to come, one just over, a football game to
// come (the first day ahead with one).
const gameSheet = (league, step, ahead = 1) => `(async () => {
  const wait = ms => new Promise(r => setTimeout(r, ms));
  document.querySelector('dialog[open] .q-close')?.click();
  await wait(800);
  document.querySelector('#tab-matches')?.click();
  await wait(2500);
  [...document.querySelectorAll('[data-league=${league}]')].find(e => e.offsetParent)?.click();
  await wait(2500);
  // (The day strip on screen, its panel's rows: 首頁 has a strip of its own.)
  const today = [...document.querySelectorAll('.q-chip.day.is-today')].find(e => e.getClientRects().length && !e.closest('[hidden]') && e.getBoundingClientRect().top < innerHeight);
  const panel = today?.closest('[id^=panel-]') || document;
  const rows = () => [...panel.querySelectorAll('.event-row')].filter(e => e.offsetParent && !e.closest('[hidden]'));
  for (let i = 0, s = ${step}; today && i < 7; i++, s += ${ahead}) {
    const days = [...today.parentElement.querySelectorAll('.q-chip.day')];
    days[days.indexOf(today) + s]?.click();
    await wait(3000);
    if (rows().length) break;
  }
  rows()[0]?.click();
})()`;
const SHEETS = {
  sports: [
    ['game to come', gameSheet('nba', 1)],
    ['game over', gameSheet('nba', -1, -1)],
    ['football to come', gameSheet('epl', 1)]
  ]
};
const sheetsOf = app => (args.includes('--sheet') ? (opt('sheet') ? [['sheet', opt('sheet')]] : []) : SHEETS[app] || []);
// Days picked on a page's own date strip, each watched as it loads like the
// page (Jay 2026-11-04, Sports 首頁: "the games often jump in": with
// 填滿空檔 on, the filled games came in after theirs and pushed the list
// down). Two and three days on: days the page hasn't read ahead.
const dayPick = ahead => `(async () => {
  scrollTo(0, 0);
  const chips = [...document.querySelectorAll('#panel-home [data-day], .q-day-bar [data-day]')].filter(c => c.getClientRects().length);
  const i = chips.findIndex(c => c.classList.contains('is-today'));
  (i >= 0 ? chips[i + ${ahead}] : null)?.click();
  // (The strip lights the chip first and draws the day a frame later: watched from then.)
  await new Promise(r => requestAnimationFrame(() => setTimeout(r, 200)));
})()`;
const DAYS = { sports: [['two days on', dayPick(2)], ['three days on', dayPick(3)]] };
const ROWS = { sports: '.event-row' };
// (Each page of that league, as the URL asks it.)
const FLAKY = { sports: /https:\/\/[^&]*soccer\/sco\.1\/[^&]*/g };
const daysOf = app => (args.includes('--no-days') ? [] : DAYS[app] || []);
const without = args.includes('--without');
const apps = args.filter((a, i) => !a.startsWith('--') && args[i - 1] !== '--sheet' && args[i - 1] !== '--account');
// --account <name>: signed in to tools/shots/accounts/<app>-<name>.txt (Sports'
// `fill`: 填滿空檔 on), not the first one there.
const accountName = opt('account');
// (How long each is watched as it loads.)
const LATE_MS = 9000;
const list = apps.length ? apps : ['sports', 'transit', 'weather', 'securities', 'law', 'words', 'money', 'beats'];
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT || 'playwright');
const preview = fileURLToPath(new URL('./preview.mjs', import.meta.url));
const accounts = fileURLToPath(new URL('./shots/accounts/', import.meta.url));

// In the page, as it loads: every card-sized block on screen noted each
// 100 ms by what it says, at its place in the page's layout (a sheet
// sliding up or a card's fade moves nothing there), and any that moves while
// nothing's touched is a fault. The page from its loading screen's lift; a
// sheet from the moment it's asked for (a card popping in as it slides up
// is seen too).
// `rows`: an app's list rows (Sports' games): once some are drawn on the
// first screen, one that comes in there later is a fault too (a whole list
// redrawn has new text everywhere, so nothing "moved"; Jay 2026-11-04, 首頁:
// the cover lifted on today's ended games, then the next day's games came in
// over them; 填滿空檔's games after theirs).
const late = async ([inSheet, ms, rows]) => {
  const wait = t => new Promise(r => setTimeout(r, t));
  const BLOCK = '.q-card, .q-section, .q-list, section, article, li, .q-cell, [class*="card"], [class*="-row"]';
  const sigOf = n => `${n.tagName}.${String(n.className).replace(/\bfade-in\b/, '')}|${(n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 48)}`;
  const nameOf = n => (n.querySelector('h1, h2, h3, [class*="-h"], strong, b')?.textContent || n.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 24);
  // (Its top in the scroller's view, from the layout: offsets, never transforms.)
  const yOf = (n, se) => {
    let y = 0;
    for (let k = n; k && k !== se; k = k.offsetParent) {
      y += k.offsetTop;
      if (!se.contains(k.offsetParent) && k.offsetParent !== se) break;
    }
    return y - (se === document.scrollingElement ? scrollY : se.scrollTop);
  };
  const t0 = performance.now();
  const faults = [];
  let base = null;
  // (A row by who plays, not the score, the clock or a tag put on it later: a live game's line is the same row.)
  const rowKey = n => ([...n.querySelectorAll('.side-name')].map(x => x.textContent.trim()).join(' v ') || (n.querySelector('.event-sides')?.firstElementChild || n).textContent.replace(/[\d:'’+–-]+/g, '').replace(/\s+/g, ' ').trim()).slice(0, 40);
  let rowsSeen = null;
  while (performance.now() - t0 < ms) {
    await wait(100);
    const cover = document.getElementById('loading');
    if (!inSheet && cover && !cover.hidden && getComputedStyle(cover).display !== 'none') continue;
    const se = inSheet ? [...document.querySelectorAll('dialog[open]')].pop() : document.scrollingElement;
    if (!se) continue;
    const vh = se === document.scrollingElement ? innerHeight : se.clientHeight;
    const now = new Map();
    // (The outermost blocks within a screen of the view, in the page's flow.)
    for (const n of se.querySelectorAll(BLOCK)) {
      const h = n.offsetHeight;
      if (h < 8 || !n.offsetParent) continue;
      let inner = false;
      for (let k = n.parentElement; k && k !== se && !inner; k = k.parentElement) inner = k.matches(BLOCK) || /^(fixed|sticky)$/.test(getComputedStyle(k).position);
      if (inner || /^(fixed|sticky|absolute)$/.test(getComputedStyle(n).position)) continue;
      const y = yOf(n, se);
      if (y + h < -vh || y > 2 * vh) continue;
      const k = sigOf(n);
      now.set(k, now.has(k) ? null : { y, seen: y + h > 0 && y < vh, name: nameOf(n) });
    }
    if (rows) {
      const inView = [...se.querySelectorAll(rows)].filter(n => n.offsetParent && !n.closest('.q-rail')).filter(n => {
        const y = yOf(n, se);
        return y + n.offsetHeight > 0 && y < vh;
      });
      // (A stand-in row of a shape held while the day's read says nothing: not a game.)
      const keys = new Set(inView.map(rowKey).filter(Boolean));
      if (rowsSeen?.size) for (const k of keys) if (!rowsSeen.has(k)) faults.push(`a game came in (${k.slice(0, 24)}) at ${Math.round((performance.now() - t0) / 100) / 10}s`);
      if (keys.size) rowsSeen = new Set([...(rowsSeen || []), ...keys]);
    }
    if (base)
      for (const [k, was] of base) {
        const is = now.get(k);
        if (was?.seen && is && Math.abs(is.y - was.y) > 2) faults.push(`${was.name || k.slice(0, 24)} ${is.y > was.y ? '+' : ''}${is.y - was.y}px at ${Math.round((performance.now() - t0) / 100) / 10}s`);
      }
    base = now;
  }
  return faults;
};

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
  const demo = readdirSync(accounts).find(f => (accountName ? f === `${app}-${accountName}.txt` : f.startsWith(`${app}-`)) && f.endsWith('.txt'));
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
    // A phone's link, not the cloud's: each read through the data proxy
    // answers a round trip later, and more for how much it carries (a batch
    // of 24 leagues' pages lands after one of 6), so a part read alongside
    // comes in after the rest, as on Jay's iPhone (--fast: the cloud's own speed).
    // And one league whose pages don't answer for 3 s from their first ask
    // (Sports: the Scottish league, one of the others; a phone often has
    // one), with whatever is asked in the same batch: what waits on it
    // can't hold the rest (the move to the next day of theirs waited for its
    // retry and came after the loading screen lifted), and a day isn't drawn
    // without it to have it come in 4 s later.
    const firstAsked = new Map();
    if (!args.includes('--fast'))
      await page.route(/sports-proxy/, async route => {
        const url = decodeURIComponent(route.request().url());
        await new Promise(r => setTimeout(r, 250 + 30 * Math.max(1, (url.match(/[?&]u=/g) || []).length)));
        const flaky = FLAKY[app] ? url.match(FLAKY[app]) || [] : [];
        for (const u of flaky) if (!firstAsked.has(u)) firstAsked.set(u, Date.now());
        if (flaky.some(u => Date.now() - firstAsked.get(u) < 3_000)) return route.fulfill({ status: 503, body: '{"error":"flaky"}', headers: { 'content-type': 'application/json', 'access-control-allow-origin': '*' } });
        return route.continue();
      });
    await page.goto(url);
    const pageLate = await page.evaluate(late, [false, LATE_MS, ROWS[app]]);
    const results = { page: { late: pageLate, ...(await page.evaluate(check, false)), tap: await taps(page, false) } };
    for (const [name, js] of daysOf(app)) {
      await page.evaluate(js);
      results[name] = { late: await page.evaluate(late, [false, LATE_MS, ROWS[app]]), skipped: 'a day picked on the strip' };
    }
    for (const [name, js] of sheetsOf(app)) {
      await page.evaluate(js);
      const sheetLate = await page.evaluate(late, [true, LATE_MS]);
      results[name] = { late: sheetLate, ...(await page.evaluate(check, true)), tap: await taps(page, true) };
    }
    for (const [where, r] of Object.entries(results)) {
      const t = r.tap || {};
      const bad = (!r.skipped && (Math.abs(r.moved) > 2 || Math.abs(r.jumped) > 40 || r.drawing > 2 || Math.abs(t.below ?? 0) > 2 || Math.abs(t.above ?? 0) > 2)) || r.shrank > 2 || r.late.length > 0;
      if (bad) faults++;
      const said = [`what was read moved ${r.moved}px`, `the page jumped ${r.jumped}px`, `a moving drawing pulled it ${r.drawing}px`, t.below != null ? `a tap folding below moved the button ${t.below}px` : '', t.above != null ? `folding above ${t.above}px` : '', r.shrank != null ? `the sheet shrank ${r.shrank}px` : ''];
      const lateSaid = r.late.length ? `moved as it loaded: ${[...new Set(r.late)].slice(0, 6).join('; ')}` : 'nothing moved as it loaded';
      console.log(`${bad ? '✗' : '✓'} ${app} ${where}: ${lateSaid}, ${r.drawingLost ? '(drawing lost) ' : ''}${r.skipped ? [r.skipped, r.shrank != null ? `the sheet shrank ${r.shrank}px` : ''].filter(Boolean).join(', ') : said.filter(Boolean).join(', ')}`);
    }
  } finally {
    await browser.close();
    srv.kill();
  }
}
process.exit(faults ? 1 : 0);
