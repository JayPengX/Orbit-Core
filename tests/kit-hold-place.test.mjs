// A live redraw never moves the page (Jay 2026-11-01, the second time a
// live game's refresh threw him to the top): the kit holds every scroller's
// place (hold-place.mjs), loaded with ui.mjs by every app, and beats wait
// while a finger is down or a fling runs. The behaviour itself is checked in
// a browser by tools/live-scroll.mjs (Safari's way, every app).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { signature, scrollBusy, loose, countFingers } from '../kit/hold-place.mjs';

const kit = f => readFileSync(new URL(`../kit/${f}`, import.meta.url), 'utf8');

test('a row redrawn with a new score or clock is the same row', () => {
  assert.equal(signature('DIV', 'event-row live', '21:30 利物浦 2 - 1 兵工廠 78\''), signature('div', 'event-row', '21:30 利物浦 3 - 1 兵工廠 81\''));
  assert.notEqual(signature('div', 'event-row', '利物浦 兵工廠'), signature('div', 'event-row', '切爾西 熱刺'));
});

test('every app loads the keeper, and beats wait for a scroll to end', () => {
  assert.match(kit('ui.mjs'), /from '\.\/hold-place\.mjs'/);
  const orbit = kit('orbit.mjs');
  assert.match(orbit, /import \{ scrollBusy \} from '\.\/hold-place\.mjs'/);
  assert.match(orbit.slice(orbit.indexOf('export function everyDev'), orbit.indexOf('export function everyDev') + 700), /sheetHeld\(\) \|\| scrollBusy\(\)/);
  assert.match(kit('orbit.css'), /\.q-hold-room::after \{[^}]*height: var\(--q-hold-room/);
  assert.equal(scrollBusy(), false);
});

test('the keeper corrects after any redraw, on the page and in sheets', () => {
  const src = kit('hold-place.mjs');
  assert.match(src, /new MutationObserver/);
  assert.match(src, /observe\(document\.documentElement, \{ childList: true, subtree: true/);
  // Never turned off for a case: no flag, no app list.
  assert.doesNotMatch(src, /localStorage|location\.|BRANDS/);
});

// Jay 2026-11-03: "this kind of jumping … fixed across all apps" (a segment
// tapped, a day swiped, a map's cars moving, an orange 展開 link).
test('a drawing or a box laid over the page is never what the page holds to', () => {
  // (A car on a track map moves every update: the page followed it before.)
  assert.equal(loose(true, 'static'), true);
  assert.equal(loose(false, 'absolute'), true);
  assert.equal(loose(false, 'sticky'), true);
  assert.equal(loose(false, 'fixed'), true);
  assert.equal(loose(false, 'relative'), false);
  assert.equal(loose(false, 'static'), false);
});

test('a tapped control stays under the finger, and a sheet keeps its height', () => {
  const src = kit('hold-place.mjs');
  assert.match(src, /addEventListener\('pointerdown', ev => \(\(lastGesture = Date\.now\(\)\), noteTap\(ev\.target\)\)/);
  assert.match(src, /function keepTap\(/);
  assert.match(src, /new ResizeObserver/);
  assert.match(kit('orbit.css'), /dialog\.q-sheet\[open\]:not\(\[data-detent\]\)[^{]*\{\s*min-height: min\(var\(--q-sheet-floor/);
});

test("a list's more is one quiet bar in every app, never accent text", () => {
  const ui = kit('ui.mjs');
  assert.match(ui, /export function moreToggle\(/);
  assert.match(ui, /export function moreHtml\(/);
  const css = kit('orbit.css');
  const rule = css.slice(css.indexOf('.q-more {'), css.indexOf('}', css.indexOf('.q-more {')));
  assert.match(rule, /color: var\(--q-text-2\)/);
  assert.doesNotMatch(rule, /--q-accent|--accent/);
});

// Jay 2026-11-05, the third time a live game threw him up the page: Safari
// moves a scroller by itself when what's in it is drawn anew, and the keeper
// took any move that wasn't a clamp for the app's own scroll. Only a scroll
// the code asks for may move a held place; one nobody made is put back.
test('only a scroll the code asks for moves a held place; the browser\'s own is put back', () => {
  const src = kit('hold-place.mjs');
  const fn = src.slice(src.indexOf('function scrolledByCode('), src.indexOf('}', src.indexOf('function scrolledByCode(')));
  assert.match(fn, /codeScrolled\(s\)/, 'scrolledByCode asks whether the code scrolled that scroller');
  assert.doesNotMatch(fn, /scrollHeight/, 'never "moved and not clamped" alone');
  for (const k of ['scrollTo', 'scroll', 'scrollBy', 'scrollIntoView']) assert.ok(src.includes(`'${k}'`), `${k} noted`);
  assert.match(src, /Object\.defineProperty\(Element\.prototype, 'scrollTop'/);
  assert.match(src, /HTMLElement\.prototype, 'focus'/);
  // (The keeper's own moves go round the note: setTop.)
  assert.doesNotMatch(src.slice(src.indexOf('function place('), src.indexOf('function scrolledByCode(')), /s\.scrollTop = /);
  // A scroll nobody made, heard as it happens.
  assert.match(src, /if \(st && !chains\.get\(s\) && !settle\.has\(s\)\) \{[^}]*return restore\(s\);/);
  // The live game in WebKit is in the guard.
  const guard = readFileSync(new URL('../tools/live-scroll.mjs', import.meta.url), 'utf8');
  assert.match(guard, /--webkit/);
  assert.match(guard, /async function liveGame\(/);
});

// A list being read drawn short for a moment, then whole again (live-scroll's
// "jumped" on a finished game's 得分紀錄: the page ended 713px down, held to
// whatever stood in its place meanwhile): what was read is looked for first
// for a while, and the reader goes back to it.
test('what was read, gone for a moment, is gone back to when it returns', () => {
  const src = kit('hold-place.mjs');
  assert.match(src, /const LOST_MS = /);
  const fn = src.slice(src.indexOf('function restore('), src.indexOf('export function freshScreen'));
  assert.match(fn, /held\.get\(s\)\.anchors\.unshift\(\.\.\.lost\)/);
});

// Jay 2026-11-05: dragging iOS's scroll bar (the indicator grabbed at the
// right edge) made the page "flicker badly up and down rapidly until I
// release it": the bar moves the page with no finger the page hears, and the
// keeper put every frame of it back as Safari's own move. Only a move just
// after a redraw, once, is Safari's; a second straight after the put-back,
// or one with no redraw before it, is the bar's, and its chain the person's.
test("the scroll bar dragged moves the page; only Safari's own move after a redraw is put back", () => {
  const src = kit('hold-place.mjs');
  const scroll = src.slice(src.indexOf("addEventListener(\n    'scroll'"), src.indexOf('new MutationObserver(list'));
  assert.match(scroll, /drawnAt\.get\(s\)[^\n]*< REDRAWN_MS && now - \(putBackAt\.get\(s\) \|\| 0\) > AGAIN_MS/);
  assert.match(scroll, /chains\.set\(s, 'bar'\)/);
  assert.match(scroll, /barAt\.get\(s\)[^\n]*< BAR_MS/, "the bar's next grab, still in hand, is the bar's");
  assert.match(src, /touched\(s, list\) && drawnAt\.set\(s, Date\.now\(\)\)/, 'each redraw noted per scroller');
  // Jay 2026-11-10: "holding the scrollbar forces the page upward during live games".
  // The bar in hand holds live redraws as a finger does; Safari's move straight after a redraw is never the bar's.
  assert.match(src, /export const scrollBusy = \(\) => [^\n]*barLast < BAR_HOLD_MS/);
  assert.match(scroll, /barAt\.set\(s, \(barLast = now\)\)/);
  assert.match(scroll, /!safari && now - \(barAt\.get\(s\) \|\| 0\) < BAR_MS/);
  // In a browser (WebKit): live-scroll's "bar" drags it and checks Safari's own move is still held.
  const guard = readFileSync(new URL('../tools/live-scroll.mjs', import.meta.url), 'utf8');
  assert.match(guard, /const bar = async inSheet/);
  assert.match(guard, /__rawTop/);
  assert.match(guard, /b\.grabs\.some\(n => n > 1\) \|\| Math\.abs\(b\.own\) > 2/);
});

// Jay 2026-11-06, iPad, Sports' 搜尋: one word typed, then deleted, and the
// sheet went blank (its title and ✕ only) until delete was pressed again.
// With the keys up a sheet sits on the screen's foot and is as tall as what's
// in it: the results cleared, it shrank down the screen, and the keeper held
// the field typed in at its old place on the screen, by scrolling it up out
// of a sheet it kept tall with room at its end. A place is kept within its
// scroller's view, never on the screen.
test('a place is kept within its scroller\'s view, never on the screen', () => {
  const src = kit('hold-place.mjs');
  assert.match(src, /const atView = \(s, n\) => n\.getBoundingClientRect\(\)\.top - viewTop\(s\);/);
  assert.match(src, /y: r\.top - viewTop\(s\), top: s\.scrollTop/, 'anchors from the view\'s top');
  assert.match(src, /tap = \{ s, node: n, sig: sigOf\(n\), y: r\.top - viewTop\(s\)/, 'the tapped control from the view\'s top');
  for (const fn of ['function keepTap(', 'function restore(', 'function standIn(']) {
    const body = src.slice(src.indexOf(fn), src.indexOf('\n}\n', src.indexOf(fn)));
    assert.doesNotMatch(body, /getBoundingClientRect\(\)\.top \+ s\.scrollTop|scrollTop \+ n\.getBoundingClientRect\(\)\.top/, `${fn} measures on the screen`);
  }
});

// The same in a browser, where there is one (Playwright's Chromium: on Jay's
// machine and in the cloud; skipped where it isn't installed).
test('in a browser: a search sheet on the foot keeps its field after the results clear', async t => {
  let chromium;
  try {
    ({ chromium } = (await import('node:module')).createRequire(import.meta.url)('playwright'));
  } catch {
    return t.skip('no Playwright here');
  }
  const { createServer } = await import('node:http');
  const page = `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>
    body { margin: 0; height: 100vh; }
    dialog { width: 600px; max-height: calc(100vh - 8px); height: fit-content; margin: auto auto 0; padding: 0 16px 400px; overflow-y: auto; border: 0; box-sizing: border-box; }
    .head { position: sticky; top: 0; height: 60px; background: #fff; z-index: 2; }
    .q-hold-room::after { content: ''; display: block; height: var(--q-hold-room, 0); }
    .row { height: 56px; }
    input { width: 100%; height: 40px; }
  </style></head><body>
  <dialog id="d"><div class="head">搜尋</div><label><input id="i" type="search"></label><div id="out"></div></dialog>
  <script type="module">
    import '/hold-place.mjs';
    const d = document.getElementById('d'), i = document.getElementById('i'), out = document.getElementById('out');
    d.showModal(); i.focus();
    let timer = 0;
    i.addEventListener('input', () => { clearTimeout(timer); timer = setTimeout(() => out.replaceChildren(...(i.value ? Array.from({ length: 20 }, (_, k) => Object.assign(document.createElement('div'), { className: 'row', textContent: 'Row ' + k + ' ' + i.value })) : [])), 300); });
  </script></body></html>`;
  const server = createServer((req, res) => {
    if (req.url === '/hold-place.mjs') return res.writeHead(200, { 'content-type': 'text/javascript' }).end(kit('hold-place.mjs'));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page);
  });
  await new Promise(r => server.listen(0, r));
  let browser;
  try {
    browser = await chromium.launch();
    const p = await browser.newPage({ viewport: { width: 1180, height: 820 } });
    await p.goto(`http://localhost:${server.address().port}/`);
    await p.waitForTimeout(200);
    const at = () => p.evaluate(() => ({ top: document.getElementById('d').scrollTop, field: document.getElementById('i').getBoundingClientRect().top - document.getElementById('d').getBoundingClientRect().top }));
    const before = await at();
    await p.keyboard.type('a');
    await p.waitForTimeout(500);
    await p.keyboard.press('Backspace');
    await p.waitForTimeout(500);
    const after = await at();
    assert.equal(after.top, 0, 'the sheet is at its top');
    assert.equal(Math.round(after.field), Math.round(before.field), 'the field shows where it was in the sheet');
  } finally {
    await browser?.close();
    server.close();
  }
});

// Jay 2026-11-09: a live game's page stuck near its end, over by the time he
// reopened it. The fingers were a sum of starts and ends: two down one by one
// and up together sent one end for two starts, and every beat in the app
// waited on a finger that had gone.
test('fingers are counted from each touch event, never summed; one unheard of for a while is gone', () => {
  assert.equal(countFingers(2), 2);
  assert.equal(scrollBusy(), true);
  // (Both up in one event: its touches are none, whatever the starts were.)
  assert.equal(countFingers(0), 0);
  assert.equal(scrollBusy(), false);
  // (A finger whose end never came: taken for gone after a few seconds.)
  assert.equal(countFingers(1, Date.now() - 10_000), 0);
  assert.equal(scrollBusy(), false);
  // And a beat put off for a gesture runs anyway past a few seconds.
  const orbit = kit('orbit.mjs');
  assert.match(orbit, /BEAT_WAIT_MAX_MS/);
  assert.match(orbit.slice(orbit.indexOf('export function everyDev')), /Date\.now\(\) - heldSince < BEAT_WAIT_MAX_MS/);
});

// Jay 2026-11-20: hovering 勝率走勢 on a live game's page often threw him
// back up. Each hover's redraw (the chart read under the pointer) was taken
// for a redraw the page moved after: a scroll the page doesn't hear start
// (an iPad's trackpad, the scroll bar) was put back, and Safari's own throw
// to the top after a live redraw, inside that scroll, kept.
test('in a browser: a hover redrawing a chart holds no scroll back; Safari\'s throw to the top inside one is put back', async t => {
  let chromium;
  try {
    ({ chromium } = (await import('node:module')).createRequire(import.meta.url)('playwright'));
  } catch {
    return t.skip('no Playwright here');
  }
  const { createServer } = await import('node:http');
  const page = `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>
    body { margin: 0; height: 100vh; }
    dialog { width: 600px; height: 700px; max-height: none; margin: auto; padding: 0 16px; overflow-y: auto; border: 0; box-sizing: border-box; }
    .row { height: 80px; border-bottom: 1px solid #ddd; }
    #chart { height: 90px; background: #eef; }
  </style></head><body>
  <dialog id="d"></dialog>
  <script type="module">
    const raw = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    globalThis.rawTop = (s, v) => raw.set.call(s, v);
    await import('/hold-place.mjs');
    const d = document.getElementById('d');
    const rows = n => Array.from({ length: n }, (_, k) => Object.assign(document.createElement('div'), { className: 'row', textContent: 'Row ' + k }));
    const at = Object.assign(document.createElement('small'), { textContent: '目前' });
    const chart = Object.assign(document.createElement('div'), { id: 'chart' });
    chart.addEventListener('pointermove', ev => at.replaceChildren(document.createTextNode('第' + Math.round(ev.offsetX) + '點'), Object.assign(document.createElement('span'), { textContent: '2–1' })));
    d.append(...rows(10), at, chart, ...rows(30));
    d.show();
    globalThis.ready = true;
  </script></body></html>`;
  const server = createServer((req, res) => {
    if (req.url === '/hold-place.mjs') return res.writeHead(200, { 'content-type': 'text/javascript' }).end(kit('hold-place.mjs'));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page);
  });
  await new Promise(r => server.listen(0, r));
  let browser;
  try {
    browser = await chromium.launch();
    const p = await browser.newPage({ viewport: { width: 1180, height: 820 } });
    await p.goto(`http://localhost:${server.address().port}/`);
    await p.waitForFunction(() => globalThis.ready);
    // (Scrolled by the wheel, the chart in the middle of the view, settled.)
    await p.mouse.move(590, 400);
    const chart = await p.evaluate(() => {
      const d = document.getElementById('d');
      return document.getElementById('chart').getBoundingClientRect().top - d.getBoundingClientRect().top - 300;
    });
    await p.mouse.wheel(0, chart);
    await p.waitForTimeout(1200);
    const box = await p.evaluate(() => {
      const r = document.getElementById('chart').getBoundingClientRect();
      return { x: r.left, y: r.top + 45, w: r.width };
    });
    // (The wheel's scroll long over, then the pointer along the chart.)
    await p.waitForTimeout(1500);
    for (let i = 0; i < 20; i++) await p.mouse.move(box.x + (box.w * i) / 20, box.y);
    // A scroll the page doesn't hear start (no finger, no wheel), a frame at a time, right after.
    const after = await p.evaluate(async () => {
      const d = document.getElementById('d');
      const a = d.scrollTop;
      const seen = [];
      for (let k = 1; k <= 8; k++) {
        rawTop(d, a + k * 15);
        await new Promise(r => requestAnimationFrame(r));
        seen.push(d.scrollTop - a);
      }
      return seen;
    });
    assert.deepEqual(after, after.map((_, k) => (k + 1) * 15), 'the scroll after a hover goes where it was taken, never put back');
    // Inside that scroll, a live redraw and Safari's throw to the top in the same moment: put back.
    const thrown = await p.evaluate(async () => {
      const d = document.getElementById('d');
      const a = d.scrollTop;
      d.querySelector('.row').textContent = 'Row 0 again';
      rawTop(d, 0);
      await new Promise(r => setTimeout(r, 50));
      return { was: a, now: d.scrollTop };
    });
    assert.ok(thrown.was > 300, 'scrolled down first');
    assert.equal(thrown.now, thrown.was, 'Safari\'s throw to the top is put back');
  } finally {
    await browser?.close();
    server.close();
  }
});

// Jay 2026-11-20 (iPhone, an MLS game over): a swipe that starts on
// 勝率走勢 is a touch on the chart first (it shows the point under the
// finger) and the page's pan a moment later, when Safari cancels the touch
// and the chart lets go. The chart was held under the finger like a tapped
// button, and Safari's page had already begun to move: it snapped back, or
// to the top.
test('in a browser: a swipe that starts on a chart scrolls; the chart is never held under the finger', async t => {
  let chromium;
  try {
    ({ chromium } = (await import('node:module')).createRequire(import.meta.url)('playwright'));
  } catch {
    return t.skip('no Playwright here');
  }
  const { createServer } = await import('node:http');
  const page = `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>
    body { margin: 0; height: 100vh; }
    dialog { width: 390px; height: 800px; max-height: none; margin: auto; padding: 0 16px; overflow-y: auto; border: 0; box-sizing: border-box; }
    .row { height: 80px; }
    #chart { height: 90px; touch-action: pan-y; }
  </style></head><body>
  <dialog id="d"></dialog>
  <script type="module">
    const raw = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    globalThis.rawTop = (s, v) => raw.set.call(s, v);
    await import('/hold-place.mjs');
    const d = document.getElementById('d');
    const rows = n => Array.from({ length: n }, (_, k) => Object.assign(document.createElement('div'), { className: 'row', textContent: 'Row ' + k }));
    const at = Object.assign(document.createElement('small'), { textContent: '目前' });
    const chart = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    chart.id = 'chart';
    const say = w => at.replaceChildren(document.createTextNode(w));
    chart.addEventListener('pointerdown', () => say('第 3 節'));
    chart.addEventListener('pointercancel', () => say('目前'));
    d.append(...rows(10), at, chart, ...rows(30));
    d.show();
    globalThis.ready = true;
  </script></body></html>`;
  const server = createServer((req, res) => {
    if (req.url === '/hold-place.mjs') return res.writeHead(200, { 'content-type': 'text/javascript' }).end(kit('hold-place.mjs'));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page);
  });
  await new Promise(r => server.listen(0, r));
  let browser;
  try {
    browser = await chromium.launch();
    const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await p.goto(`http://localhost:${server.address().port}/`);
    await p.waitForFunction(() => globalThis.ready);
    // Safari's order: the touch on the chart, the page already moving when the touch is cancelled.
    const r = await p.evaluate(async () => {
      const d = document.getElementById('d');
      const chart = document.getElementById('chart');
      rawTop(d, 500);
      await new Promise(r => setTimeout(r, 400));
      const fire = (type, Kind = Event, o = {}) => chart.dispatchEvent(new Kind(type, { bubbles: true, ...o }));
      fire('touchstart');
      fire('pointerdown', PointerEvent, { pointerType: 'touch', pointerId: 1 });
      await new Promise(r => requestAnimationFrame(r));
      rawTop(d, 512);
      fire('pointercancel', PointerEvent, { pointerType: 'touch', pointerId: 1 });
      await new Promise(r => requestAnimationFrame(r));
      const atCancel = d.scrollTop;
      rawTop(d, 530);
      await new Promise(r => requestAnimationFrame(r));
      fire('touchmove');
      document.querySelector('small').textContent = '目前 ';
      await new Promise(r => requestAnimationFrame(r));
      const after = d.scrollTop;
      fire('touchend');
      return { atCancel, after };
    });
    assert.equal(r.atCancel, 512, 'the page goes on where the swipe had it as the touch is cancelled');
    assert.equal(r.after, 530, 'and while the finger scrolls on');
  } finally {
    await browser?.close();
    server.close();
  }
});

// Jay 2026-11-21, iPhone: a sheet opened from far down 賽事 and closed again,
// and the page was its last card at the top and a screen of nothing under it.
// The page behind the sheet got shorter while it was open, and the room held
// at its end (kept so a redraw can't pull the reader up) outlived the sheet.
// Shut, nothing is under a finger on the page: the room it doesn't need goes.
test('in a browser: a page made shorter behind a sheet shows no empty room once the sheet shuts', async t => {
  let chromium;
  try {
    ({ chromium } = (await import('node:module')).createRequire(import.meta.url)('playwright'));
  } catch {
    return t.skip('no Playwright here');
  }
  const { createServer } = await import('node:http');
  const page = `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>
    body { margin: 0; }
    .q-hold-room::after { content: ''; display: block; height: var(--q-hold-room, 0); }
    .row { height: 80px; border-bottom: 1px solid #ccc; }
    html:has(dialog[open]:modal), html:has(dialog[open]:modal) body { overflow: hidden; }
  </style></head><body><div id="list"></div>
  <script type="module">
    import '/hold-place.mjs';
    const list = document.getElementById('list');
    window.rows = (n, tag) => list.replaceChildren(...Array.from({ length: n }, (_, k) => Object.assign(document.createElement('div'), { className: 'row', textContent: tag + ' ' + k })));
    rows(40, 'Game');
    window.openSheet = () => { const d = document.createElement('dialog'); d.className = 'q-sheet'; d.textContent = 'sheet'; document.body.append(d); d.showModal(); return d; };
  </script></body></html>`;
  const server = createServer((req, res) => {
    if (req.url === '/hold-place.mjs') return res.writeHead(200, { 'content-type': 'text/javascript' }).end(kit('hold-place.mjs'));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page);
  });
  await new Promise(r => server.listen(0, r));
  let browser;
  try {
    browser = await chromium.launch();
    const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await p.goto(`http://localhost:${server.address().port}/`);
    await p.waitForTimeout(200);
    await p.mouse.move(195, 400);
    await p.mouse.wheel(0, 2400);
    // (Well after the wheel: a redraw now is no one's.)
    await p.waitForTimeout(1500);
    await p.evaluate(() => (window.d = openSheet()));
    await p.waitForTimeout(100);
    // (Behind the sheet: the day drawn anew, fourteen games where forty were.)
    await p.evaluate(() => rows(14, 'Other'));
    await p.waitForTimeout(300);
    await p.evaluate(() => { d.addEventListener('close', () => d.remove()); d.close(); });
    await p.waitForTimeout(300);
    const blank = await p.evaluate(() => {
      const last = document.querySelector('#list > .row:last-child').getBoundingClientRect().bottom;
      return Math.round(innerHeight - Math.max(0, last));
    });
    assert.ok(blank < 2, `the screen under the page's last row is empty for ${blank}px`);
  } finally {
    await browser?.close();
    server.close();
  }
});

// Jay 2026-11-24 (iPhone, Sports): "every time I open a sport sheet and I scroll it
// still reset me back up … it only happen once". A first open's reads landed as the
// first fling ran, before the sheet was held (held once a scroll settles): Safari's
// throw to the top was let be. Caught from the first scroll now.
test("in a browser: a sheet's first scroll, a redraw landing in it and Safari's throw to the top: put back", async t => {
  let chromium;
  try {
    ({ chromium } = (await import('node:module')).createRequire(import.meta.url)('playwright'));
  } catch {
    return t.skip('no Playwright here');
  }
  const { createServer } = await import('node:http');
  const page = `<!doctype html><html><head><meta name="viewport" content="width=device-width"><style>
    body { margin: 0; height: 100vh; }
    dialog { width: 390px; height: 700px; max-height: none; margin: auto; padding: 0 16px; overflow-y: auto; border: 0; box-sizing: border-box; }
    .row { height: 80px; border-bottom: 1px solid #ddd; }
  </style></head><body>
  <dialog id="d"></dialog>
  <script type="module">
    const raw = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollTop');
    globalThis.rawTop = (s, v) => raw.set.call(s, v);
    await import('/hold-place.mjs');
    const d = document.getElementById('d');
    d.append(...Array.from({ length: 40 }, (_, k) => Object.assign(document.createElement('div'), { className: 'row', textContent: 'Row ' + k })));
    d.show();
    globalThis.ready = true;
  </script></body></html>`;
  const server = createServer((req, res) => {
    if (req.url === '/hold-place.mjs') return res.writeHead(200, { 'content-type': 'text/javascript' }).end(kit('hold-place.mjs'));
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(page);
  });
  await new Promise(r => server.listen(0, r));
  let browser;
  try {
    browser = await chromium.launch();
    const p = await browser.newPage({ viewport: { width: 390, height: 844 } });
    await p.goto(`http://localhost:${server.address().port}/`);
    await p.waitForFunction(() => globalThis.ready);
    const got = await p.evaluate(async () => {
      const d = document.getElementById('d');
      const frame = () => new Promise(r => requestAnimationFrame(r));
      // The first fling, a frame at a time, never settled.
      for (let k = 1; k <= 12; k++) (rawTop(d, k * 50), await frame());
      const was = d.scrollTop;
      // The game's read lands: a card drawn anew, and Safari throws the sheet to the top.
      d.children[2].replaceWith(Object.assign(document.createElement('div'), { className: 'row', textContent: 'Row 2, read' }));
      rawTop(d, 0);
      await new Promise(r => setTimeout(r, 50));
      return { was, now: d.scrollTop };
    });
    assert.equal(got.was, 600);
    assert.equal(got.now, got.was, 'put back where the fling had it');
  } finally {
    await browser?.close();
    server.close();
  }
});
