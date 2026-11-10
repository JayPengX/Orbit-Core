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
