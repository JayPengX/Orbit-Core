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
// GUIDES[app] = [{ tap | show (a selector), say: [zh, en], wait (ms after the tap), optional }, …]
// A step with neither is a line with 下一步 (the opening one).
// Each app's steps are checked against its page by tests/kit-coach.test.mjs.
import { h, toast, icons } from './ui.mjs';

export const GUIDES = {
  match: [
    { say: ['今天在台灣看得到的比賽，放在一起；每一種中斷都有倒數。', 'Today’s games you can watch in Taiwan, together; a countdown for every break.'] },
    { tap: '.sport-grid > :nth-child(1)', optional: true, say: ['先選你最常看的運動', 'First the sport you watch most'] },
    { tap: '.sp-done', optional: true, wait: 4000, say: ['選好了，看今天的比賽', 'Done: today’s games'] },
    { tap: 'button.event-row:not(.wide)', wait: 2000, say: ['點一場比賽', 'Tap a game'] },
    { tap: '.match-tabs .q-seg button:last-child', wait: 1500, say: ['兩隊在聯賽排第幾', 'Where both sides stand in the league'] },
    { tap: 'dialog[open] .q-close', say: ['看完關掉', 'Close it'] },
    { tap: '#tab-matches', wait: 1500, say: ['每個聯賽的賽程和排名', 'Every league’s games and table'] },
    { tap: '#tab-live', wait: 1500, say: ['哪一台、幾點、播哪場', 'Which channel shows what, when'] }
  ],
  transit: [
    { say: ['公車、台鐵、高鐵、捷運和 YouBike，排成一趟路線。', 'Buses, trains, high-speed rail, metro and YouBike, planned as one trip.'] },
    { show: '#q', say: ['在這裡打要去的地方，每種走法一起比', 'Type where you’re going here: every way to get there, compared'] },
    { tap: '#tab-times', wait: 1500, say: ['查時刻', 'Timetables'] },
    { tap: '[data-view="bus"]', wait: 3000, say: ['附近每一站的公車', 'Buses at every stop nearby'] },
    { tap: '.ot-bus-no', wait: 3000, say: ['點一路公車', 'Tap a bus'] },
    { tap: 'dialog[open] .q-close', say: ['每站幾分鐘到，都在這裡', 'Minutes to every stop, right here'] }
  ],
  weather: [
    { say: ['一個預報，合併氣象署、Google 和環境部的資料，準到你的鄉鎮。', 'One forecast, blended from the weather bureau’s, Google’s and the environment ministry’s data, down to your township.'] },
    { tap: '.ot-hero', say: ['點開今天每小時的天氣', 'Open today hour by hour'] },
    { tap: 'dialog[open] .q-close', say: ['看完關掉', 'Close it'] },
    { tap: '.ot-g[data-metric="rain"]', say: ['會不會下雨？', 'Will it rain?'] },
    { tap: '[data-range="rain:10d"]', say: ['十天內哪天會下雨', 'Which of the next ten days it rains'] },
    { tap: 'dialog[open] .q-close', say: ['關掉', 'Close it'] },
    { tap: '#tab-places', say: ['存好家和學校，預報跟著你一天走', 'Save home and school; the forecast follows your day'] }
  ],
  orbit: [
    { say: ['最上面是現在這節課，倒數到下課。', 'The class on now, counting down to the bell.'] },
    { tap: '.q-tab[data-tab="week"]', wait: 1200, say: ['整週課表', 'The whole week'] },
    { tap: '.q-tab[data-tab="tools"]', wait: 1200, say: ['改課表、考試倒數', 'Edit it, count down to exams'] },
    { show: '.cx-fly-card', say: ['專注讀書：跟著天上一架真的飛機，降落就是時間到', 'Study along with a real plane in the sky; it lands when time’s up'] }
  ],
  money: [
    { say: ['每天花多少、還能花多少，一眼看到。', 'What you spend each day, and what’s left, at a glance.'] },
    { show: '.q-tab-action', say: ['記一筆：打金額，或拍一張收據', 'Add an entry: type it, or snap a receipt'] },
    { tap: '#tab-stats', wait: 1200, say: ['錢花到哪裡', 'Where the money went'] },
    { tap: '#tab-accts', wait: 1200, say: ['每個帳戶的餘額', 'Every account’s balance'] }
  ],
  news: [
    { say: ['118 家媒體的新聞，同一件事放在一起。', '118 outlets’ news, with each event in one place.'] },
    { tap: '.nw-card', wait: 2000, say: ['點一則，看各家怎麼報同一件事', 'Tap one: how each outlet tells the same event'] },
    { tap: 'dialog[open] .q-close', say: ['看完關掉', 'Close it'] },
    { tap: '#tab-tw', wait: 1200, say: ['台灣新聞，照主題分好', 'Taiwan’s news, sorted by topic'] },
    { tap: '#tab-intl', wait: 1200, say: ['國際新聞，看台灣媒體怎麼報', 'World news, as Taiwan’s outlets tell it'] },
    { tap: '#tab-outlets', wait: 1200, say: ['每家媒體偏哪邊，都有研究出處', 'Where each outlet leans, with the research behind it'] }
  ],
  vocab: [
    { say: ['6,169 個大考單字：記憶模型算出你快忘記的時候，那時才考你。', '6,169 exam words: a memory model asks each one just before you’d forget it.'] },
    { show: '.q-hc-btn', say: ['每天的字從這裡開始', 'Each day’s words start here'] },
    { tap: '#tab-list', wait: 1200, say: ['6,169 個字都在這', 'All 6,169 words'] },
    { tap: '#tab-progress', wait: 1200, say: ['你記住了多少', 'How many you know'] }
  ],
  beats: [
    { say: ['每一首歌都是手機當場做出來的，不會重複，也不用下載。', 'Every song is made on the phone as it plays: never repeated, nothing downloaded.'] },
    { tap: '.bt-now .bt-play', wait: 2500, say: ['播放今天的第一首', 'Play today’s first song'] },
    { tap: '.bt-now .bt-ctl .bt-btn:last-child', wait: 2000, say: ['換下一首：又是全新的一首', 'Skip: another brand-new song'] },
    { tap: '#tab-create', wait: 1200, say: ['自己來做音樂，或玩節奏遊戲', 'Make your own, or play the rhythm game'] }
  ],
  stock: [
    { say: ['模擬投資：真的報價、真的台灣券商規則，用的是練習資金。', 'Practice investing: real prices and Taiwan’s real broker rules, on practice money.'] },
    { tap: '[data-action="mover-group"][data-v="tw"]', wait: 1200, say: ['看台股今天的漲跌', 'Today’s Taiwan movers'] },
    { tap: '.sc-movers .sc-row', wait: 2000, say: ['點一檔', 'Tap one'] },
    { tap: '[data-action="chart-style"][data-v="candle"]', wait: 1000, say: ['換成 K 線', 'Switch to candles'] },
    { show: '.q-btn.trade.buy', say: ['想買就按這裡：手續費和稅都算好，用練習資金', 'Buy here: fees and tax worked out, on practice money'] },
    { tap: 'dialog[open] .q-close', say: ['關掉這一檔', 'Close this stock'] },
    { tap: '.q-tab[data-tab="portfolio"]', wait: 1200, say: ['你的資產', 'Your holdings'] },
    { tap: '.q-tab[data-tab="history"]', wait: 1200, say: ['每一筆委託和成交', 'Every order and fill'] }
  ],
  law: [
    { say: ['法律、判決、立法院和地方議會，全部互相連結，用白話看懂。', 'Laws, rulings, the legislature and local councils, all linked, in plain words.'] },
    { tap: '.nv-topic', wait: 1500, say: ['依生活的事找法規，例如「勞動」', 'Find laws by what they’re about: work, say'] },
    { tap: '.lw-quick-q', wait: 2500, say: ['問一個常見問題', 'A common question'] },
    { tap: '.lw-find-card', wait: 2500, say: ['直接找到答案在哪一條', 'Straight to the article that answers it'] },
    { tap: '.lw-rul', wait: 2500, say: ['這一條，法院怎麼判', 'How courts have ruled on it'] },
    { tap: 'dialog[open] .q-close', say: ['看完關掉', 'Close it'] },
    { tap: '#tab-bills', wait: 2500, say: ['立法院的每個法案，走到哪一步', 'Every bill in the legislature, and how far it’s got'] },
    { tap: '.lw-scope [data-id="local"]', wait: 2500, say: ['地方：縣市議會和鄉鎮代表會', 'Local: county and township councils'] }
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
  // Inside the sheet that's open, if one is (a modal sheet makes all outside it untappable,
  // the bubble's 下一步 and 略過 too: 11-19, Securities' stock sheet), else on the page.
  const lift = () => {
    const host = [...document.querySelectorAll('dialog[open]:not(.q-leaving)')].pop() || document.body;
    if (bubble.parentNode !== host) host.append(ring, bubble);
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
    // (Its sheet closed or closing under it, or another sheet opened over it: moved to where it's seen.)
    const home = bubble.parentNode;
    const top = [...document.querySelectorAll('dialog[open]:not(.q-leaving)')].pop() || document.body;
    if (home !== top) lift();
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
    // (Any element the step points at: a screen drawn again since the step began has a new one, Sports' picker.)
    const hit = e.target.closest?.(s.tap);
    if (hit || (target && (target === e.target || target.contains(e.target)))) {
      if (hit) target = hit;
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
      // (A step only some see, `optional`: Sports' picker on a first open, looked for a moment only.)
      target = await waitFor(sel, s.optional ? 500 : FIND_MS);
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
