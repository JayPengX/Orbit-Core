// In every page tools/speed.mjs opens (an init script): what the person
// waits on and what the phone does, kept in window.__speed.
(() => {
  if (window.__speed) return;
  const S = (window.__speed = { long: [], cls: 0, lcp: 0, events: [], mut: 0, lastMut: 0, ready: null, frames: null });
  const watch = (type, fn, opts = {}) => {
    try {
      new PerformanceObserver(list => list.getEntries().forEach(fn)).observe({ type, buffered: true, ...opts });
    } catch {}
  };
  watch('longtask', e => S.long.push([Math.round(e.startTime), Math.round(e.duration)]));
  watch('largest-contentful-paint', e => (S.lcp = Math.round(e.startTime)));
  watch('layout-shift', e => !e.hadRecentInput && (S.cls += e.value));
  // A tap's delay to its next paint (INP's events).
  watch('event', e => e.interactionId && S.events.push([e.name, Math.round(e.startTime), Math.round(e.duration)]), { durationThreshold: 16 });
  // How much the page redraws: nodes added or removed, text and attributes
  // changed. lastMut: the last real redraw (more than a few changes at once:
  // a ticking clock or a live dot's blink doesn't count).
  const mo = new MutationObserver(list => {
    let n = 0;
    for (const m of list) n += m.type === 'childList' ? m.addedNodes.length + m.removedNodes.length : 1;
    S.mut += n;
    if (n > 4) S.lastMut = performance.now();
  });
  const start = () => mo.observe(document.documentElement, { subtree: true, childList: true, characterData: true, attributes: true });
  if (document.documentElement) start();
  else document.addEventListener('readystatechange', start, { once: true });
  // The first screen: the kit's loading cover gone (Class: its booting class off).
  const isReady = () => {
    const box = document.getElementById('loading');
    // (A cover the app hid but boot.js still holds for its update check is still up: q-boot-hold.)
    if (box) return !box.classList.contains('q-boot-hold') && (box.hidden || getComputedStyle(box).display === 'none' || box.style.opacity === '0');
    return document.readyState !== 'loading' && !!document.body && !document.body.classList.contains('orbit-booting') && !!document.querySelector('#app, main, [id^="panel-"]');
  };
  const tick = () => {
    if (S.ready == null && document.readyState !== 'loading' && isReady()) S.ready = Math.round(performance.now());
    if (S.ready == null) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  setInterval(() => S.ready == null && isReady() && (S.ready = Math.round(performance.now())), 50);
  // Frames while something moves (a scroll): each frame's gap.
  S.frameStart = () => {
    const gaps = [];
    let last = performance.now();
    let on = true;
    const f = t => {
      gaps.push(t - last);
      last = t;
      if (on) requestAnimationFrame(f);
    };
    requestAnimationFrame(f);
    S.frames = () => ((on = false), gaps);
  };
})();
