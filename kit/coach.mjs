// The guide: the showcase's coach mark on the real app (Jay 2026-11-19,
// "introduce this"). A ring round the next thing to tap and one short line;
// the tap itself moves it on. While it runs only that target answers a tap,
// a press or a swipe, and nothing does on a line or a `show` (Jay 11-19: none
// stuck, none twice, no way out by mistake); scrolling stays free; 結束 or
// Escape ends it. It never saves, buys or deletes
// anything: a step that would is a `show` (the ring and 下一步, no tap).
// A step whose target isn't on screen within a few seconds is skipped; one
// whose target goes away (redrawn: found again; its sheet closed: moved on;
// else 下一步 shows) is never stuck. Started from the Pass sheet's 說明 (帶我走一遍), or once from a quiet
// offer the first time an account opens the app (guideOffer, orbit.mjs boot);
// 'offered' (the moment it's shown), 'done' or 'no' is kept on the account (settings guide_<app>),
// so it's offered once a Pass, on any phone.
//
// GUIDES[app] = [{ tap | show (a selector), say: [zh, en], wait (ms after the tap), optional }, …]
// A step with neither is a line with 下一步 (the opening one).
// Each app's steps are checked against its page by tests/kit-coach.test.mjs.
import { h, toast, icons } from './ui.mjs';

export const GUIDES = {
  match: [
    { say: ['今天在台灣看得到的比賽，放在一起；中場、暫停也有倒數。', 'Today’s games you can watch in Taiwan, together, with a countdown through every break.'] },
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
    { tap: 'dialog[open] .q-close', say: ['每站還要幾分鐘到，都在這裡；看完關掉', 'Minutes to every stop, right here; close it when done'] }
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
    { say: ['課表、待辦和考試倒數放在一起；上課時，最上面倒數到下課。', 'Your timetable, to-dos and exam countdowns together; in class, the top counts down to the bell.'] },
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
const QUIET_MS = 1500; // the person's hands this long still: a target scrolled away is brought back
const LOST_MS = 1500; // a step's target gone this long: its sheet closed (moved on) or 下一步 shown
// What a tap, a press or a swipe is made of: all held back off the step's target. (The moves
// too: an app's drag code that heard them without their start could take the next real tap
// for a drag's end and drop its click.)
const HANDS = ['pointerdown', 'pointermove', 'pointerup', 'mousedown', 'mousemove', 'mouseup', 'touchstart', 'touchmove', 'touchend', 'click', 'dblclick', 'contextmenu'];
const T = (lang, [zh, en]) => (lang === 'en' ? en : zh);

let running = null;

// Something laid over the target's middle (a sheet over it) means it isn't the one to tap yet.
const visible = el => {
  if (!el?.isConnected) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0 && !el.closest('[hidden], [inert]');
};
const pause = ms => new Promise(r => setTimeout(r, ms));
// After a step's tap: on as soon as the app's answer has drawn (the page still for a moment), the
// step's own wait at most (Jay 11-20: "the next step take seconds to show": a fixed 1.7 s after a
// quick K 線 switch, up to 3 s after a tab).
const SETTLE_MS = 250;
const settled = max =>
  new Promise(done => {
    const t0 = Date.now();
    let last = t0;
    // (the guide's own ring and bubble, moved every frame, aren't the app drawing)
    const ours = n => (n.nodeType === 1 ? n : n.parentElement)?.closest?.('.q-coach, .q-coach-ring');
    const seen = new MutationObserver(list => list.some(m => !ours(m.target)) && (last = Date.now()));
    seen.observe(document.body, { childList: true, subtree: true, attributes: true, characterData: true });
    const look = () => {
      const now = Date.now();
      if (now - t0 >= max || (now - t0 >= 350 && now - last >= SETTLE_MS)) return seen.disconnect(), done();
      setTimeout(look, 50);
    };
    look();
  });

// Something of the app's own over the target's middle (its floating tab bar): a tap there misses it.
const covered = (el, r) => {
  const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  // (nothing there: its middle is just past the screen's edge, half of it showing)
  return !top || (!top.closest('.q-coach, .q-coach-ring') && top !== el && !el.contains(top) && !top.contains(el));
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
  // (結束, not 略過: it ends the guide, not the step; read as "skip this one" it ended it all, Jay 11-20)
  const skip = h('button', { class: 'q-coach-skip', type: 'button', text: T(lang, ['結束', 'End']) });
  const next = h('button', { class: 'q-coach-next', type: 'button' });
  const tip = h('span', { class: 'q-coach-tip', 'aria-hidden': 'true' });
  const bubble = h('div', { class: 'q-coach', role: 'dialog', 'aria-label': T(lang, ['導覽', 'Guide']) }, [say, h('div', { class: 'q-coach-foot' }, [n, h('span', { class: 'q-coach-acts' }, [skip, next])]), tip]);
  // In the top layer (a popover), shown again each step: above any sheet the step's tap opened
  // (a sheet is a modal dialog, itself in the top layer; under it the bubble would be hidden and inert).
  const layer = typeof HTMLElement !== 'undefined' && 'showPopover' in HTMLElement.prototype;
  if (layer) (ring.popover = 'manual'), (bubble.popover = 'manual');
  document.body.append(ring, bubble);
  // Inside the sheet that's open, if one is (a modal sheet makes all outside it untappable,
  // the bubble's 下一步 and 結束 too: 11-19, Securities' stock sheet), else on the page.
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
  let brought = 0; // (when the guide last brought the target into view)
  let touched = 0; // (the person's hands last: a touch, or a scroll still moving from one)
  let hand = 0; // (their finger or wheel last)
  let lost = 0; // (when the step's target went away)
  let waiting = false; // (looking for the step's target)
  let skipped = 0; // (steps not on screen: left out of the count, so it never jumps)
  let missed = 0; // (steps not found in a row)
  let pressed = null; // (where a finger went down on the step's target, and whether its click came)

  // Written only when it changes: the page left untouched frame to frame. (Safari on an iPhone
  // takes a page changing as a finger lands for a hover and drops the tap's click: a ring and a
  // bubble written every frame made a tap need two, Jay 11-20.)
  const wrote = new Map();
  const put = (el, prop, v) => {
    const k = (el === ring ? 'r' : 'b') + prop;
    if (wrote.get(k) === v) return;
    wrote.set(k, v);
    el.style.setProperty(prop, v);
  };
  const shown = (el, on) => el.hidden === on && (el.hidden = !on);
  const flag = (el, c, on) => el.classList.contains(c) !== on && el.classList.toggle(c, on);
  const place = () => {
    raf = requestAnimationFrame(place);
    // (Its sheet closed or closing under it, or another sheet opened over it: moved to where it's seen.)
    const home = bubble.parentNode;
    const top = [...document.querySelectorAll('dialog[open]:not(.q-leaving)')].pop() || document.body;
    if (home !== top) lift();
    const vw = innerWidth;
    const vh = innerHeight;
    const b = bubble.getBoundingClientRect();
    const s = steps[at];
    const sel = s?.tap || s?.show;
    // (Redrawn since, a live score's row: the new one. Gone: its sheet closed some other way moves
    // the guide on; anything else shows 下一步, so it's never stuck.)
    if (sel && !waiting && (!target || !visible(target))) {
      target = find(sel);
      if (target) lost = 0;
      else if (!lost) lost = Date.now();
      else if (Date.now() - lost > LOST_MS && !moving) {
        lost = Date.now();
        if (/^dialog\[open\]/.test(sel) && !document.querySelector('dialog[open]:not(.q-leaving)')) go(at + 1);
        else next.hidden = false;
      }
    }
    if (!target || !visible(target)) {
      shown(ring, false);
      flag(bubble, 'up', false);
      flag(bubble, 'down', false);
      put(bubble, 'transform', `translate(${Math.round((vw - b.width) / 2)}px, ${Math.round(vh - b.height - 120)}px)`);
      return;
    }
    const r = target.getBoundingClientRect();
    // Off screen, or under the app's own bar, and the person's hands still a moment: brought to the
    // middle (again, if they scroll it away: 11-19, a ring left on a row under the tab bar).
    const now = Date.now();
    if (!moving && now - touched > QUIET_MS && now - brought > 700 && (r.bottom < 0 || r.top > vh || covered(target, r))) {
      brought = now;
      target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
    shown(ring, true);
    put(ring, 'transform', `translate(${Math.round(r.left - 5)}px, ${Math.round(r.top - 5)}px)`);
    put(ring, 'width', `${Math.round(r.width + 10)}px`);
    put(ring, 'height', `${Math.round(r.height + 10)}px`);
    // Below the target when it fits, else above it.
    const below = r.bottom + 14 + b.height < vh - 80 || r.top - 14 - b.height < 60;
    const y = below ? r.bottom + 14 : r.top - 14 - b.height;
    const x = Math.min(Math.max(12, r.left + r.width / 2 - b.width / 2), vw - b.width - 12);
    flag(bubble, 'down', below);
    flag(bubble, 'up', !below);
    put(bubble, '--tip', `${Math.round(Math.min(Math.max(16, r.left + r.width / 2 - x), b.width - 16))}px`);
    put(bubble, 'transform', `translate(${Math.round(x)}px, ${Math.round(y)}px)`);
  };

  // While the guide runs, a tap, a press or a swipe anywhere but the step's
  // target (and the bubble) is held back: the app never hears it. On a line
  // or a `show` step nothing in the app answers, nor between a tap and the
  // next step; scrolling is the browser's own, so it stays free.
  const shield = e => {
    if (bubble.contains(e.target)) return;
    // (Looking for the next step's target, its bubble hidden: nothing held back, so the app never
    // seems frozen. Jay 11-20, a guide started away from the home page: nothing answered for 20 s.)
    if (waiting) return;
    const s = steps[at];
    // (The close: a tap anywhere is the person going on by themselves.)
    if (at >= steps.length) return void (e.type === 'click' && end(true));
    // (Any element the step points at: a screen drawn again since the step began has a new one, Sports' picker.)
    const hit = s?.tap && !moving && !waiting ? e.target.closest?.(s.tap) : null;
    if (hit || (s?.tap && !moving && !waiting && target && (target === e.target || target.contains(e.target)))) {
      if (hit) target = hit;
      // (A finger lifted on the target with no click after it, the target drawn again under the
      // finger by a live price, or Safari's hover rule: the tap is made again, once, so a tap never
      // needs two, Jay 11-20.)
      if (e.type === 'pointerdown') pressed = { x: e.clientX, y: e.clientY, clicked: false };
      if (e.type === 'pointerup' && pressed && Math.hypot(e.clientX - pressed.x, e.clientY - pressed.y) < 12) {
        const p = pressed;
        const step = at;
        setTimeout(() => {
          if (p.clicked || at !== step || moving || !running) return;
          const el = document.elementFromPoint(p.x, p.y)?.closest?.(s.tap);
          if (el) el.click();
        }, 450);
      }
      if (e.type === 'click' && pressed) pressed.clicked = true;
      if (e.type === 'click') {
        moving = true;
        const mine = ++turn;
        settled((s.wait || 0) + STEP_MS).then(() => mine === turn && go(at + 1));
      }
      return;
    }
    // A shown step's own thing tapped (its ring asks for it; Jay 11-20, Securities' 買進: "this
    // step doesn't work"): the guide goes on, as 下一步; the app still never hears it.
    if (s?.show && !moving && e.target.closest?.(s.show)) {
      e.stopPropagation();
      if (e.type === 'click' || e.type === 'mousedown' || e.type === 'contextmenu' || e.type === 'dblclick') e.preventDefault();
      if (e.type === 'click') go(at + 1);
      return;
    }
    if (e.type === 'pointerdown' || e.type === 'touchstart') hand = touched = Date.now();
    e.stopPropagation();
    if (e.type === 'click' || e.type === 'mousedown' || e.type === 'contextmenu' || e.type === 'dblclick') e.preventDefault();
    if (e.type === 'click') ring.animate?.([{ opacity: 1 }, { opacity: 0.35 }, { opacity: 1 }], { duration: 360 });
  };
  const keys = e => e.key === 'Escape' && end(false);
  // (A scroll still moving after the finger is gone counts as theirs: not one the guide began, nor
  // one the app makes by itself, only from a finger in the last 3 s.)
  const scrolls = () => Date.now() - hand < 3000 && Date.now() - brought > 1000 && (touched = Date.now());
  const wheel = () => (hand = touched = Date.now());
  for (const ev of HANDS) addEventListener(ev, shield, true);
  document.addEventListener('keydown', keys, true);
  addEventListener('scroll', scrolls, { capture: true, passive: true });
  addEventListener('wheel', wheel, { capture: true, passive: true });

  function end(finished) {
    if (!running || running.end !== end) return;
    running = null;
    turn++;
    cancelAnimationFrame(raf);
    for (const ev of HANDS) removeEventListener(ev, shield, true);
    document.removeEventListener('keydown', keys, true);
    removeEventListener('scroll', scrolls, true);
    removeEventListener('wheel', wheel, true);
    bubble.classList.add('out');
    ring.remove();
    setTimeout(() => bubble.remove(), 200);
    onEnd(finished);
  }

  async function go(i) {
    const mine = ++turn;
    moving = false;
    brought = 0;
    lost = 0;
    waiting = false;
    bubble.classList.remove('wait');
    at = i;
    target = null;
    if (i >= steps.length) {
      // The close: where to find it again.
      lift();
      bubble.classList.add('done');
      say.textContent = T(lang, ['好了！之後在 Orbit Pass 的「說明」裡，隨時可以再走一遍。', 'That’s it. To see this again: Orbit Pass › Help › Show me around.']);
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
      // (the last step's words are hidden meanwhile: never shown over the wrong screen)
      waiting = true;
      bubble.classList.add('wait');
      target = await waitFor(sel, s.optional ? 500 : FIND_MS);
      if (mine !== turn) return;
      waiting = false;
      bubble.classList.remove('wait');
      // (not on screen today: skipped, never stuck)
      if (!target) {
        // (Two steps in a row not on screen: this isn't the screen the guide knows; it stops, said,
        // rather than skip on unseen.)
        // (A sheet's ✕ isn't a miss of its own: the step before it opened that sheet, or didn't.)
        if (!s.optional && !/^dialog\[open\]/.test(sel) && ++missed >= 2) {
          toast(T(lang, ['導覽先停在這裡', 'The guide stopped here']));
          return end(false);
        }
        return (skipped++, go(i + 1));
      }
      if (!s.optional) missed = 0;
      // (Already as the step asks, 台股 already chosen: never asked for again, Jay 11-20: "you want
      // me to click 台股 but it's already there"; skipped, out of the count.)
      if (s.tap && target.closest('[aria-selected="true"], [aria-pressed="true"], [aria-current]:not([aria-current="false"])')) return (skipped++, go(i + 1));
    }
    lift();
    say.textContent = T(lang, s.say);
    n.textContent = `${i + 1 - skipped}/${steps.length - skipped}`;
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

// The app's home, where every guide starts (Jay 11-20: started from another tab, none of its
// steps were there): any sheet closed, the first tab opened, and tapped again if its first step's
// target still isn't there (a tab tapped at its top resets itself, kit tabBar).
export async function goHome(steps) {
  const first = steps.find(x => (x.tap || x.show) && !x.optional);
  const there = () => !first || Boolean(find(first.tap || first.show));
  const shut = globalThis.orbitCloseSheet || (d => d.close());
  const open = [...document.querySelectorAll('dialog[open]:not(.q-leaving)')];
  for (const d of open) shut(d);
  if (open.length) await pause(350);
  const tab = document.querySelector('.q-tabbar .q-tab');
  for (let k = 0; k < 2 && tab && !there(); k++) {
    tab.click();
    await pause(500);
  }
}

// 帶我走一遍: the app's own guide, from the Pass sheet's 說明 (pass.mjs) or the offer, from its home.
export async function startGuide(s, app = s?.app, lang = s?.lang || 'zh') {
  const steps = GUIDES[app];
  if (!steps) return null;
  await goHome(steps);
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
  // (Shown once a Pass: kept as offered the moment it's up, so a banner let go by or closed isn't back
  // each opening (Jay 11-26: "only show once of that pass"). 帶我走一遍 in the Pass sheet's 說明 still starts it.)
  if (shown) keep(s, app, 'offered');
  return shown ? true : later();
}
