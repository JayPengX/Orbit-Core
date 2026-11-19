// The guide: the showcase's coach mark on the real app (Jay 2026-11-19,
// "introduce this"). A ring round the next thing to tap and one short line;
// the tap itself moves it on. While it runs only that target answers a tap
// (scrolling stays free); 略過 ends it. It never saves, buys or deletes
// anything: a step that would is a `show` (the ring and 下一步, no tap).
// A step whose target isn't on screen within a few seconds is skipped, never
// stuck. Started from the Pass sheet's 說明 (帶我走一遍), or once from a quiet
// offer the first time an account opens the app (guideOffer, orbit.mjs boot);
// 'done' or 'no' is kept on the account (settings guide_<app>), so a new phone
// doesn't offer it again.
//
// GUIDES[app] = [{ tap | show (a selector), say: [zh, en], wait (ms after the tap) }, …]
// A step with neither is a line with 下一步 (the opening one).
// Each app's steps are checked against its page by tests/kit-coach.test.mjs.
import { h, toast, icons } from './ui.mjs';

export const GUIDES = {
  weather: [
    { say: ['一個預報，合併氣象署、Google 和環境部的資料，準到你的鄉鎮。', 'One forecast, blended from the weather bureau’s, Google’s and the environment ministry’s data, down to your township.'] },
    { tap: '.ot-hero', say: ['點開今天每小時的天氣', 'Open today hour by hour'] },
    { tap: 'dialog[open] .q-close', say: ['看完關掉', 'Close it'] },
    { tap: '.ot-g[data-metric="rain"]', say: ['會不會下雨？', 'Will it rain?'] },
    { tap: '[data-range="rain:10d"]', say: ['十天內哪天會下雨', 'Which of the next ten days it rains'] },
    { tap: 'dialog[open] .q-close', say: ['關掉', 'Close it'] },
    { tap: '#tab-places', say: ['存好家和學校，預報跟著你一天走', 'Save home and school; the forecast follows your day'] }
  ]
};

export const hasGuide = app => Boolean(GUIDES[app]);
export const GUIDE_KEY = app => `guide_${app}`;

const FIND_MS = 4000; // how long a step's target may take to appear
const STEP_MS = 700; // after a tap, the app's own answer first
const T = (lang, [zh, en]) => (lang === 'en' ? en : zh);

let running = null;

// Something laid over the target's middle (a sheet over it) means it isn't the one to tap yet.
const visible = el => {
  if (!el?.isConnected) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && !el.closest('[hidden], [inert]');
};
const find = sel => [...document.querySelectorAll(sel)].find(visible) || null;
const waitFor = (sel, ms = FIND_MS) =>
  new Promise(done => {
    const t0 = Date.now();
    const look = () => {
      const el = find(sel);
      if (el || Date.now() - t0 > ms) return done(el);
      setTimeout(look, 120);
    };
    look();
  });

// coachTour(steps, { lang, onEnd(finished) }): runs the steps over the page.
export function coachTour(steps, { lang = 'zh', onEnd = () => {} } = {}) {
  running?.end(false);
  const ring = h('div', { class: 'q-coach-ring', 'aria-hidden': 'true', hidden: true });
  const say = h('p', { class: 'q-coach-say', 'aria-live': 'polite' });
  const n = h('span', { class: 'q-coach-n' });
  const skip = h('button', { class: 'q-coach-skip', type: 'button', text: T(lang, ['略過', 'Skip']) });
  const next = h('button', { class: 'q-coach-next', type: 'button' });
  const tip = h('span', { class: 'q-coach-tip', 'aria-hidden': 'true' });
  const bubble = h('div', { class: 'q-coach', role: 'dialog', 'aria-label': T(lang, ['導覽', 'Guide']) }, [say, h('div', { class: 'q-coach-foot' }, [n, h('span', { class: 'q-coach-acts' }, [skip, next])]), tip]);
  // In the top layer (a popover), shown again each step: above any sheet the step's tap opened
  // (a sheet is a modal dialog, itself in the top layer; under it the bubble would be hidden and inert).
  const layer = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;
  if (layer) (ring.popover = 'manual'), (bubble.popover = 'manual');
  document.body.append(ring, bubble);
  const lift = () => {
    if (!layer) return;
    for (const x of [ring, bubble])
      try {
        if (x.matches(':popover-open')) x.hidePopover();
        x.showPopover();
      } catch {}
  };
  let at = -1;
  let target = null;
  let raf = 0;
  let turn = 0;
  let moving = false;
  let scrolled = false;
  let touched = 0;

  const place = () => {
    raf = requestAnimationFrame(place);
    const vw = innerWidth;
    const vh = innerHeight;
    const b = bubble.getBoundingClientRect();
    if (!target || !visible(target)) {
      ring.hidden = true;
      bubble.classList.remove('up', 'down');
      bubble.style.transform = `translate(${Math.round((vw - b.width) / 2)}px, ${Math.round(vh - b.height - 120)}px)`;
      return;
    }
    const r = target.getBoundingClientRect();
    // Off screen and not being scrolled by the person: brought to the middle once.
    if (!scrolled && Date.now() - touched > 1500 && (r.bottom < 0 || r.top > vh || r.bottom > vh - 90)) {
      scrolled = true;
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    ring.hidden = false;
    ring.style.transform = `translate(${Math.round(r.left - 5)}px, ${Math.round(r.top - 5)}px)`;
    ring.style.width = `${Math.round(r.width + 10)}px`;
    ring.style.height = `${Math.round(r.height + 10)}px`;
    // Below the target when it fits, else above it.
    const below = r.bottom + 14 + b.height < vh - 80 || r.top - 14 - b.height < 60;
    const y = below ? r.bottom + 14 : r.top - 14 - b.height;
    const x = Math.min(Math.max(12, r.left + r.width / 2 - b.width / 2), vw - b.width - 12);
    bubble.classList.toggle('down', below);
    bubble.classList.toggle('up', !below);
    bubble.style.setProperty('--tip', `${Math.round(Math.min(Math.max(16, r.left + r.width / 2 - x), b.width - 16))}px`);
    bubble.style.transform = `translate(${Math.round(x)}px, ${Math.round(y)}px)`;
  };

  // While a step waits for its tap, a tap anywhere else is held back (the app never hears it).
  const shield = e => {
    const s = steps[at];
    if (!s?.tap || moving || bubble.contains(e.target)) return;
    if (target && (target === e.target || target.contains(e.target))) {
      if (e.type === 'click') {
        moving = true;
        const mine = ++turn;
        setTimeout(() => mine === turn && go(at + 1), (s.wait || 0) + STEP_MS);
      }
      return;
    }
    if (e.type === 'pointerdown' || e.type === 'touchstart') return void (touched = Date.now());
    e.preventDefault();
    e.stopPropagation();
    ring.animate?.([{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }], { duration: 360 });
  };
  const keys = e => e.key === 'Escape' && end(false);
  const scrolls = () => (touched = Date.now());
  document.addEventListener('click', shield, true);
  document.addEventListener('pointerdown', shield, true);
  document.addEventListener('keydown', keys, true);
  addEventListener('scroll', scrolls, { capture: true, passive: true });

  function end(finished) {
    if (!running || running.end !== end) return;
    running = null;
    turn++;
    cancelAnimationFrame(raf);
    document.removeEventListener('click', shield, true);
    document.removeEventListener('pointerdown', shield, true);
    document.removeEventListener('keydown', keys, true);
    removeEventListener('scroll', scrolls, true);
    bubble.classList.add('out');
    ring.remove();
    setTimeout(() => bubble.remove(), 200);
    onEnd(finished);
  }

  async function go(i) {
    const mine = ++turn;
    moving = false;
    scrolled = false;
    at = i;
    target = null;
    if (i >= steps.length) {
      // The close: where to find it again.
      lift();
      bubble.classList.add('done');
      say.textContent = T(lang, ['好了！之後在 Orbit Pass 的「說明」裡，隨時可以再走一遍。', 'That’s it. Show me around is in the Orbit Pass’s Help any time.']);
      n.textContent = '';
      skip.hidden = true;
      next.hidden = false;
      next.textContent = T(lang, ['完成', 'Done']);
      next.onclick = () => end(true);
      return;
    }
    const s = steps[i];
    const sel = s.tap || s.show;
    if (sel) {
      target = await waitFor(sel);
      if (mine !== turn) return;
      // (not on screen today: skipped, never stuck)
      if (!target) return go(i + 1);
    }
    lift();
    say.textContent = T(lang, s.say);
    n.textContent = `${i + 1}/${steps.length}`;
    skip.hidden = false;
    next.hidden = Boolean(s.tap);
    next.textContent = T(lang, ['下一步', 'Next']);
    next.onclick = () => go(i + 1);
  }
  skip.onclick = () => end(false);
  running = { end };
  raf = requestAnimationFrame(place);
  go(0);
  return { end };
}

// 帶我走一遍: the app's own guide, from the Pass sheet's 說明 (pass.mjs) or the offer.
export function startGuide(s, app = s?.app, lang = s?.lang || 'zh') {
  const steps = GUIDES[app];
  if (!steps) return null;
  return coachTour(steps, {
    lang,
    onEnd: done => {
      if (done) toast(lang === 'en' ? 'Guide done' : '導覽完成');
      keep(s, app, 'done');
    }
  });
}

const keep = (s, app, value) => s?.write?.({ wallet: { settings: { [GUIDE_KEY(app)]: { value, t: Date.now() } } } }).catch(() => {});

// The one offer, the first time an account opens an app that has a guide: a
// quiet banner (orbit.mjs quietTip), never a dialog, never started by itself.
// 不用了 or the guide itself keeps the answer on the account. Another banner
// or a sheet up (a new account's first open has the usage note): it waits its
// turn, a few times, never over it.
export function guideOffer(s, quietTip, tries = 5) {
  const app = s?.app;
  if (!GUIDES[app] || typeof document === 'undefined' || globalThis.navigator?.webdriver || globalThis.__DEMO) return false;
  if (!s.wallet || s.wallet.settings?.[GUIDE_KEY(app)]?.value != null) return false;
  const later = () => (tries > 1 && setTimeout(() => guideOffer(s, quietTip, tries - 1), 6_000), false);
  if (document.querySelector('dialog[open], .q-banner') || document.visibilityState === 'hidden' || running) return later();
  const en = s.lang === 'en';
  const shown = quietTip({
    mark: h('span', { class: 'q-tip-mark', 'aria-hidden': 'true', html: icons.compass || '' }),
    label: en ? 'Guide' : '導覽',
    title: en ? 'New here? Let me show you around' : '第一次用？帶你走一遍',
    line: en ? 'Thirty seconds on your own screen; nothing changes.' : '30 秒，不會改到任何東西。',
    go: en ? 'Show me' : '好',
    never: en ? 'No thanks' : '不用了',
    onGo: () => startGuide(s, app),
    onNever: () => keep(s, app, 'no')
  });
  return shown ? true : later();
}
