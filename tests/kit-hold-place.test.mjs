// A live redraw never moves the page (Jay 2026-11-01, the second time a
// live game's refresh threw him to the top): the kit holds every scroller's
// place (hold-place.mjs), loaded with ui.mjs by every app, and beats wait
// while a finger is down or a fling runs. The behaviour itself is checked in
// a browser by tools/live-scroll.mjs (Safari's way, every app).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { signature, scrollBusy, loose } from '../kit/hold-place.mjs';

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
