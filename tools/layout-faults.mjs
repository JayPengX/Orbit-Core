// A wide screen's layout faults (an iPad, a computer: 900 px or more beside
// the tabs), read in the page (page.evaluate(layoutFaults)): the page in a
// narrow band down the middle, or one half of it empty while the other is
// full (Jay 2026-11-06, his laptop: "the first time I open on my laptop is
// like this"). An open wide sheet is read the same way inside itself.
// preview.mjs prints them as `layout:`; shots.mjs and layout-check.mjs read
// that. Guarded by tests/layout-faults.test.mjs.
export function layoutFaults() {
  const vw = innerWidth, vh = innerHeight;
  const shown = el => { for (let p = el; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.visibility === 'hidden' || cs.display === 'none' || +cs.opacity === 0) return false; } return true; };
  const sheet = [...document.querySelectorAll('dialog[open]')].filter(d => d.getBoundingClientRect().width > 0).at(-1);
  const nav = document.getElementById('tabs');
  const navR = nav?.getBoundingClientRect();
  const railed = document.documentElement.classList.contains("q-tabrail") && navR && navR.width && navR.left < vw / 2;
  const area = sheet ? sheet.getBoundingClientRect() : { left: railed ? navR.right : 0, right: vw, top: 0, bottom: vh };
  const width = area.right - area.left;
  if (width < 900 || (sheet && !sheet.classList.contains('q-sheet-wide'))) return [];
  // (What's drawn: text, pictures and controls, never the frame: the
  // tabs, the top bar, the loading cover.)
  const FRAME = '#tabs, .q-appbar, .q-accessory, #loading, .q-toast, .q-sheet-head, script, style';
  const boxes = [];
  const scope = sheet || document.body;
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT);
  for (let t; (t = walker.nextNode()); ) {
    if (!t.textContent.trim() || !t.parentElement || t.parentElement.closest(FRAME) || (!sheet && t.parentElement.closest('dialog'))) continue;
    const rg = document.createRange(); rg.selectNodeContents(t);
    for (const r of rg.getClientRects()) if (r.width && r.bottom > area.top && r.top < Math.min(area.bottom, vh) && r.right > area.left && r.left < area.right) boxes.push({ el: t.parentElement, r });
  }
  for (const el of scope.querySelectorAll('img, svg, canvas, video, input, select, textarea, iframe, [class*="map"]')) {
    if (el.closest(FRAME) || (!sheet && el.closest('dialog'))) continue;
    const r = el.getBoundingClientRect();
    if (r.width > 8 && r.height > 8 && r.bottom > area.top && r.top < Math.min(area.bottom, vh) && r.right > area.left && r.left < area.right) boxes.push({ el, r });
  }
  // (And filled cards: a box with its own colour or picture, never one as
  // big as the page, a page's own background.)
  for (const el of scope.querySelectorAll('*')) {
    if (el === sheet || el.closest(FRAME) || (!sheet && el.closest('dialog'))) continue;
    const cs = getComputedStyle(el);
    const filled = (cs.backgroundColor !== 'rgba(0, 0, 0, 0)' && cs.backgroundColor !== 'transparent') || cs.backgroundImage !== 'none';
    if (!filled) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 40 || r.height < 24 || (r.width > 0.8 * width && r.height > 0.8 * vh)) continue;
    if (r.bottom > area.top && r.top < Math.min(area.bottom, vh) && r.right > area.left && r.left < area.right) boxes.push({ el, r: { left: r.left, top: r.top, right: r.right, bottom: r.bottom }, self: true });
  }
  // (Each cut to what its scrollers show: a row's cards past its edge aren't drawn.)
  const seen = ({ el, r, self }) => {
    let [x0, y0, x1, y1] = [r.left, r.top, r.right, r.bottom];
    for (let p = self ? el.parentElement : el.parentElement; p && p !== document.body && p !== document.documentElement; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const c = p.getBoundingClientRect();
      x0 = Math.max(x0, c.left); y0 = Math.max(y0, c.top); x1 = Math.min(x1, c.right); y1 = Math.min(y1, c.bottom);
    }
    return x1 - x0 > 1 && y1 - y0 > 1 ? { left: x0, top: y0, right: x1, bottom: y1 } : null;
  };
  const ink = boxes.filter(b => shown(b.el)).map(seen).filter(Boolean);
  if (ink.length < 3) return [];
  const L = Math.max(area.left, Math.min(...ink.map(r => r.left))), R = Math.min(area.right, Math.max(...ink.map(r => r.right)));
  const out = [];
  // (A band down the middle: narrow, with room left on both sides of it. In
  // a wide sheet, anything under 60% of it: a lone card shrunk to what it
  // holds (Sports' team sheet, 2026-11-06).)
  if (R - L < 0.6 * width && (sheet || (L - area.left > 0.12 * width && area.right - R > 0.12 * width))) out.push(`narrow: ${sheet ? 'the sheet' : 'the page'} fills ${Math.round(R - L)} of ${Math.round(width)} px (${Math.round(L)}–${Math.round(R)})`);
  // (Each half's drawn height, in the first screen.)
  const mid = (area.left + area.right) / 2;
  const tall = Math.min(area.bottom, vh) - Math.max(area.top, 0);
  const cover = side => {
    const ys = ink.filter(r => (side ? r.right > mid + 1 : r.left < mid - 1)).map(r => [Math.max(r.top, area.top), Math.min(r.bottom, vh)]).sort((a, b) => a[0] - b[0]);
    // (Lines and cards a gap apart, under 40, read as one block.)
    let sum = 0, start = null, end = -1e9;
    for (const [a, b] of ys) {
      if (a > end + 40) { if (start != null) sum += end - start; start = a; end = b; } else end = Math.max(end, b);
    }
    return start == null ? 0 : sum + end - start;
  };
  const [l, r] = [cover(0), cover(1)];
  const full = Math.max(l, r), empty = Math.min(l, r);
  if (!out.length && full > 0.45 * tall && empty < 0.2 * full) out.push(`half empty: the ${l < r ? 'left' : 'right'} half ${Math.round(empty)} px drawn beside ${Math.round(full)} px${sheet ? ' (in the sheet)' : ''}`);
  return out;
}
