// ---- A picture drawn again never flashes (Jay 2026-11-03) ----
// Most of a page is redrawn whole (a tab switched to, a list refreshed): its
// text is there in the same frame, but each <img> is a new element. One
// marked loading="lazy" waits for the next layout to be found on screen, and
// one marked decoding="async" is painted empty until it's decoded again:
// iPhone's Safari shows that blank frame, so a logo the person has just seen
// (YouBike's in Transit, a team's in Sports, a bank's in Money) blinked on
// every switch, wherever the picture came from (our own files or another
// site's). Chromium paints them from its memory at once, so it never showed.
//
// So for every page, whatever drew it: a picture that has loaded once in
// this visit, drawn again, is made eager and decoded at once before the
// frame is painted (a MutationObserver runs before the paint). A picture
// never seen yet keeps the lazy, async load the page asked for.

const seen = new Set();
const note = img => {
  if (!img.naturalWidth) return;
  if (img.currentSrc) seen.add(img.currentSrc);
  if (img.src) seen.add(img.src);
};
const steady = img => {
  if (!seen.has(img.src) && !(img.currentSrc && seen.has(img.currentSrc))) return;
  if (img.loading === 'lazy') img.loading = 'eager';
  if (img.decoding !== 'sync') img.decoding = 'sync';
};
const added = node => {
  if (node.nodeType !== 1) return;
  if (node.tagName === 'IMG') steady(node);
  else if (node.firstElementChild) for (const img of node.getElementsByTagName('img')) steady(img);
};

export function steadyPictures(root = typeof document === 'undefined' ? null : document) {
  if (!root?.documentElement || root.__qSteady || typeof MutationObserver === 'undefined') return;
  root.__qSteady = true;
  // (load doesn't bubble: caught on the way down.)
  root.addEventListener('load', e => e.target?.tagName === 'IMG' && note(e.target), true);
  for (const img of root.images || []) if (img.complete) note(img);
  new MutationObserver(list => {
    for (const m of list) {
      if (m.type === 'attributes') steady(m.target);
      else for (const n of m.addedNodes) added(n);
    }
  }).observe(root.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
}

// (Exposed for tests: what this visit has drawn.)
export const seenPictures = () => seen;

steadyPictures();
