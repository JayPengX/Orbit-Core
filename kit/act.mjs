// ---- kit/act.mjs: what a person tells an app to do, read by code (Jay 11-14) ----
// The apps' ask boxes and 問 Orbit also take a command, not only a question:
// 「開始專注飛行 50 分鐘」 starts Class's focus, 「加段考倒數 11/30」 adds a
// countdown, 「追蹤湖人」 follows a team, 「背 10 個單字」 starts a round.
// Code reads them for nothing (RULEBOOK §AI: code first, AI only on what
// code can't read), so a command costs no AI call. Each app does the act
// itself, and only the way its own buttons do: a step the person confirms
// (the flight picked, the countdown's 套用, 追蹤's button) or one undone
// from the toast. Never a delete.
//
// readAct(text, { now }) → { app, act, ... } or null (a question, or no command):
//   { app: 'orbit', act: 'focus', minutes }              專注飛行 (minutes null: the last chosen)
//   { app: 'orbit', act: 'countdown', name, start, end }  a countdown (YYYY-MM-DD; end '' for one day)
//   { app: 'match', act: 'follow', name }                 follow a team (the app finds it)
//   { app: 'vocab', act: 'practice', size }               a round of words (size null: the app's own)

const ZH_DIGIT = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };

// 一 … 九十九 (and plain digits) as a number; NaN when it isn't one.
export function zhNumber(s) {
  const t = String(s || '').trim();
  if (/^\d+(\.\d+)?$/.test(t)) return Number(t);
  const m = /^([一二兩两三四五六七八九])?(十)?([一二三四五六七八九])?$/.exec(t);
  if (!m || !t) return NaN;
  if (!m[2]) return m[1] && !m[3] ? ZH_DIGIT[m[1]] : NaN;
  return (m[1] ? ZH_DIGIT[m[1]] : 1) * 10 + (m[3] ? ZH_DIGIT[m[3]] : 0);
}

const NUM = '\\d+(?:\\.\\d+)?|[一二兩两三四五六七八九十]{1,3}';
// A length said in words, in minutes: 50 分鐘, 一小時, 半小時, 一個半小時, 1.5 小時, 90 min, 2h; null none.
export function minutesIn(text) {
  const t = String(text || '');
  let m = new RegExp(`(${NUM})\\s*(?:個)?\\s*(半)?\\s*(?:小時|鐘頭|hours?|hrs?|h(?![a-z])) *(?:\\s*(${NUM})\\s*(?:分鐘?|min))?`, 'i').exec(t);
  if (m) {
    const h = zhNumber(m[1]);
    const extra = m[3] ? zhNumber(m[3]) : 0;
    if (Number.isFinite(h)) return Math.round(h * 60 + (m[2] ? 30 : 0) + (Number.isFinite(extra) ? extra : 0));
  }
  if (/半\s*(?:個)?\s*(?:小時|鐘頭)|half an hour/i.test(t)) return 30;
  m = new RegExp(`(${NUM})\\s*(?:分鐘|分(?!數)|minutes?|mins?)`, 'i').exec(t);
  if (m) {
    const n = zhNumber(m[1]);
    if (Number.isFinite(n)) return Math.round(n);
  }
  return null;
}

// Asked, not told: a question about the feature is the app's ask, never an act.
const ASKED = /[?？]\s*$|[嗎呢]\s*[?？]?\s*$|怎麼|如何|什麼|是不是|可以.{0,6}嗎|幾點|哪天|多久|^(how|what|when|where|why|which|can|does|is)\b/i;

const pad = n => String(n).padStart(2, '0');
const key = (y, m, d) => `${y}-${pad(m)}-${pad(d)}`;
const real = (y, m, d) => {
  const x = new Date(Date.UTC(y, m - 1, d));
  return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d;
};
const DATE = `(?:(\\d{4})\\s*[/.\\-年]\\s*)?(\\d{1,2})\\s*(?:[/.\\-]|月)\\s*(\\d{1,2})\\s*[日號]?`;

// The days a countdown names: a date, or two (11/30-12/2, 11月30日到12月2日).
// A date without a year is the next one to come (today counts). null none.
export function datesIn(text, now = new Date()) {
  const t = String(text || '');
  const one = new RegExp(DATE);
  const m = new RegExp(`${DATE}(?:\\s*(?:-|~|～|–|—|到|至)\\s*(?:${DATE}|(\\d{1,2})\\s*[日號]?(?!\\s*[/.月]))?)?`).exec(t);
  if (!m || !one.test(t)) return null;
  const today = key(now.getFullYear(), now.getMonth() + 1, now.getDate());
  const at = (y, mo, d) => {
    if (y) return real(+y, +mo, +d) ? key(+y, +mo, +d) : '';
    for (const yy of [now.getFullYear(), now.getFullYear() + 1]) if (real(yy, +mo, +d) && key(yy, +mo, +d) >= today) return key(yy, +mo, +d);
    return '';
  };
  const start = at(m[1], m[2], m[3]);
  if (!start) return null;
  let end = '';
  if (m[5] && m[6]) end = at(m[4] || start.slice(0, 4), m[5], m[6]);
  else if (m[7]) end = at(start.slice(0, 4), start.slice(5, 7), m[7]);
  // (An end before the start crosses the new year: 12/30-1/2.)
  if (end && end < start && !m[4]) end = key(+end.slice(0, 4) + 1, +end.slice(5, 7), +end.slice(8, 10));
  if (end && (end <= start || !real(+end.slice(0, 4), +end.slice(5, 7), +end.slice(8, 10)))) end = '';
  return { start, end, said: m[0] };
}

const FOCUS = /專注飛行|專注|專心|focus|讀書|念書|唸書|study/i;
const FOCUS_NOT = /計畫|計劃|plan|配樂|音樂|music/i;
const COUNTDOWN = /倒數|countdown/i;
const FOLLOW = /^(?:幫我|請)?\s*(?:追蹤|關注|follow)\s*(.{1,24}?)\s*(?:這隊|這支球隊|球隊|吧|好了)?[。!！]?$/i;
const PRACTICE = /(?:練習|背|複習|考我|測驗|來|開始|練).{0,6}單字|^(?:背|練|複習)\s*(?:\d+|[一二兩三四五六七八九十]+)\s*個|practi[cs]e (?:my )?words|quiz me|start (?:a )?(?:round|review)/i;

export function readAct(text, { now = new Date() } = {}) {
  const t = String(text || '').trim().slice(0, 200);
  if (!t || ASKED.test(t)) return null;
  if (COUNTDOWN.test(t)) {
    const d = datesIn(t, now);
    if (!d) return null;
    const name = t
      .replace(d.said, ' ')
      .replace(/倒數(日|計時)?|countdown/gi, ' ')
      .replace(/^(?:幫我|請|我要|我想)?\s*(?:加入|新增|加上|增加|設定|建立|加|設|add|set)?\s*(?:一個|個|a|an)?/i, ' ')
      .replace(/[：:，,、。!！（）()「」]|在|是|的|\b(?:for|on)\b/gi, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 20);
    return name ? { app: 'orbit', act: 'countdown', name, start: d.start, end: d.end } : null;
  }
  if (FOCUS.test(t) && !FOCUS_NOT.test(t)) {
    const minutes = minutesIn(t);
    // (Study words alone are a focus only when said as one: a length, 開始, 我要…)
    if (!/專注|focus/i.test(t) && minutes == null && !/^(?:我)?(?:要|想|開始|來)/.test(t)) return null;
    return { app: 'orbit', act: 'focus', minutes: minutes && minutes >= 1 && minutes <= 600 ? minutes : null };
  }
  const f = FOLLOW.exec(t);
  if (f && f[1]) return { app: 'match', act: 'follow', name: f[1].trim() };
  if (PRACTICE.test(t)) {
    const m = new RegExp(`(${NUM})\\s*(?:個|words?)`, 'i').exec(t);
    const n = m ? zhNumber(m[1]) : NaN;
    return { app: 'vocab', act: 'practice', size: Number.isFinite(n) && n >= 1 && n <= 100 ? Math.round(n) : null };
  }
  return null;
}
