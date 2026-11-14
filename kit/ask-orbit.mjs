// ---- kit/ask-orbit.mjs: 問 Orbit, one question box on the Pass sheet (the family's AI plan) ----
// Code first (Jay 11-10): the words pick the app ("明天要帶傘嗎" Weather,
// "去台北車站" Transit, "湖人排第幾" Sports…), and the app opens with the
// question in its own ask (`#ask=<words>`, read there by `takeAsk`). Words no
// rule knows: the apps as a row of taps, the question carried to the one picked.
//
// Orbit 助理 (the AI plan): a question about the person's own day
// ("今天要注意什麼", "明天要準備什麼") or one no rule knows is answered here:
// code gathers what the apps told the family notebook on this phone
// (today.mjs `dayFacts`), and one AI call (`orbit-ask`) picks the facts that
// answer and says it in a line, drawn as an AI answer whose rows open their
// apps. Only those facts and the question are sent; failing, the taps.
import { h, evenGrid } from './ui.mjs';
import { aiBar, aiCall, aiAnswer, aiAnswerWait } from './ai.mjs';
import { W, en } from './lang.mjs';
import { dayFacts } from './today.mjs';
import { twHoliday } from './holidays.mjs';
import { planHash } from './family.mjs';
import { readAct } from './act.mjs';

// Each app's words, in the order they're tried (the first that matches wins).
// A trip said ("去 X", "從 X 到 Y") is Transit's before the rest but the weather's words.
const RULES = [
  ['weather', /下雨|帶傘|雨傘|會下雨|天氣|氣溫|溫度|幾度|好冷|好熱|冷不冷|熱不熱|颱風|空氣|空品|AQI|紫外線|降雨|晴|陰天|打雷|穿什麼|weather|rain|umbrella/i],
  ['transit', /^(我)?(要|想)?(從.{1,20})?(去|到|回)\S|(去|到|回)(?!底|處|時候|了|過)[\u4e00-\u9fff]{2,}|回(家|學校|公司|宿舍)|怎麼去|怎麼到|搭車|公車|客運|捷運|火車|台鐵|臺鐵|高鐵|youbike|ubike|微笑單車|路線|幾點出發|幾點要出門|出門|\bbus\b|\bmrt\b|train|how do i get/i],
  ['match', /比賽|比分|戰績|排名|排第幾|球隊|賽程|幾比幾|季後賽|NBA|MLB|NFL|NHL|WNBA|中職|CPBL|日職|韓職|F1|一級方程式|英超|西甲|德甲|義甲|歐冠|世界盃|經典賽|湖人|勇士|道奇|洋基|兄弟|味全|樂天|統一獅|富邦悍將|台鋼|game|score|standings/i],
  ['money', /花了|花多少|記帳|支出|開銷|收入|預算|零用錢|帳本|這個月花|spent|spend|budget/i],
  ['orbit', /上課|下課|第[一二三四五六七八\d]節|下一節|什麼課|課表|考試|段考|小考|作業|功課|聯絡簿|放學|學校公告|class|homework|exam/i],
  ['vocab', /單字|背單字|生字|英文字|vocab|word/i],
  ['stock', /股票|股價|台積電|大盤|加權|漲|跌|持股|買進|賣出|ETF|基金|匯率|美股|台股|stock|share price/i],
  ['news', /新聞|頭條|報導|news|headline/i],
  ['law', /法律|法規|條文|違法|犯法|罰款|罰多少|罰則|立法院|法案|議會|代表會|憲法|law|illegal|fine for/i],
  ['beats', /音樂|節奏|節拍|鼓|beats|music/i]
];

// The person's own day: Orbit 助理's, before any app's words.
const DAY_WORDS = /(今天|明天|後天|這週|這禮拜|週末|今晚|早上|下午)?.{0,6}(要注意|注意什麼|要準備|準備什麼|要帶什麼|有什麼事|有什麼行程|要幹嘛|要做什麼|怎麼安排|幫我安排|行程|忙不忙|有空)|我的一天|my day|what'?s on|plan my/i;

// The app for some words: its kit id, 'assist' (Orbit 助理: the person's
// day), or null when no rule knows them.
export function routeAsk(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  // (A command is the app's that does it, kit act.mjs: 開始專注 Class, 背單字 Words;
  // 追蹤 X Sports unless another app's words name X, 追蹤台積電.)
  const act = readAct(t);
  if (act && act.act !== 'follow') return act.app;
  if (DAY_WORDS.test(t)) return 'assist';
  for (const [app, re] of RULES) if (re.test(t)) return app;
  return act?.app || null;
}

// The apps the question can go to, as the fallback's taps (the family's order).
export const ASK_APPS = ['weather', 'transit', 'match', 'orbit', 'money', 'vocab', 'stock', 'news', 'law', 'beats'];

// In an app: the question a link brought (`#ask=<words>`), taken out of the
// address so a reload doesn't ask again; '' when none.
export function takeAsk(loc = globalThis.location) {
  const hash = String(loc?.hash || '').replace(/^#/, '');
  if (!hash) return '';
  const parts = hash.split('&');
  const i = parts.findIndex(p => p.startsWith('ask='));
  if (i < 0) return '';
  let text = '';
  try {
    text = decodeURIComponent(parts[i].slice(4).replace(/\+/g, ' ')).trim().slice(0, 200);
  } catch {}
  parts.splice(i, 1);
  try {
    globalThis.history?.replaceState(globalThis.history.state, '', `${loc.pathname}${loc.search}${parts.length ? `#${parts.join('&')}` : ''}`);
  } catch {}
  return text;
}

// The box on the Pass tab. `go(app, hash)` opens an app (the session's `go`;
// this one closes the sheet and sets its hash); `apps` names and icons the taps.
export function askOrbitCard({ go, apps = {} } = {}) {
  const pick = h('div', { class: 'q-ask-orbit-pick', hidden: true });
  const send = (app, text) => go(app, `ask=${encodeURIComponent(text)}`);
  const bar = aiBar({
    placeholder: W('問 Orbit：要帶傘嗎？', 'Ask Orbit: umbrella?'),
    label: W('問 Orbit', 'Ask Orbit'),
    max: 200,
    // (Which app answers is code's: open with no Orbit AI on the account.)
    code: true,
    onSend(text) {
      const app = routeAsk(text);
      if (app && app !== 'assist') return send(app, text);
      return assist(text, app === 'assist');
    }
  });
  // (Which app, a tap each: what no rule knows, when the AI can't answer.)
  const taps = text =>
    h('div', { class: 'q-ask-orbit-taps' }, [
      h('p', { class: 'q-ask-orbit-q', text: W('要問哪個 App？', 'Which app should answer?') }),
      evenGrid(
        h(
          'div',
          { class: 'q-ask-orbit-apps' },
          ASK_APPS.filter(a => apps[a]).map(a => h('button', { type: 'button', class: 'q-ask-orbit-app q-press', onclick: () => send(a, text) }, [apps[a].icon, h('span', { text: apps[a].name })]))
        ),
        { min: 68, max: 5 }
      )
    ]);
  let asked = 0;
  async function assist(text, day) {
    const n = ++asked;
    let facts = [];
    try {
      facts = dayFacts({ en, holiday: twHoliday, plan: planHash });
    } catch {}
    // (Nothing told on this phone and not about the day, or no Orbit AI on
    // the account: straight to the taps.)
    if ((!facts.length && !day) || globalThis.document?.documentElement.dataset.aiLock) return show(taps(text));
    show(aiAnswerWait({ rows: Math.min(3, Math.max(1, facts.length)), text: W('看看你的 App…', 'Looking at your apps…') }));
    const now = Date.now();
    const at = new Date(now + 8 * 3_600_000);
    const r = await aiCall('orbit-ask', {
      q: text,
      now: `${at.toISOString().slice(0, 16).replace('T', ' ')} ${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][at.getUTCDay()]}`,
      facts: facts.map(({ id, app, text: t }) => ({ id, app, text: t })),
      apps: ASK_APPS.filter(a => apps[a]),
      lang: en ? 'en' : 'zh'
    });
    if (n !== asked) return;
    const out = r?.out;
    if (r?.error || !out) return show(taps(text), r?.error === 'cap' ? W('今天的 Orbit 助理問完了，選一個 App 問：', 'Orbit used up today’s answers. Pick an app:') : '');
    const byId = new Map(facts.map(f => [f.id, f]));
    const rows = (out.ids || [])
      .map(id => byId.get(id))
      .filter(Boolean)
      .map(f => ({ lead: apps[f.app]?.icon?.cloneNode?.(true) || null, label: f.label, sub: f.sub, onTap: () => go(f.app, f.hash || '') }));
    // (The question really an app's: a row to ask it there.)
    if (out.app && apps[out.app]) rows.push({ lead: apps[out.app].icon.cloneNode(true), label: W(`到 ${apps[out.app].name} 問`, `Ask ${apps[out.app].name}`), sub: text, onTap: () => send(out.app, text) });
    const line = out.line || (rows.length ? W('這些是你的 App 記下的：', 'From your apps:') : '');
    if (!line && !rows.length) return show(taps(text));
    const answer = aiAnswer({ line, sections: [{ rows }] });
    show(rows.length || out.app ? answer : h('div', {}, [answer, taps(text)]));
  }
  function show(node, note = '') {
    pick.replaceChildren(...(note ? [h('p', { class: 'q-ask-orbit-q', text: note })] : []), node);
    pick.hidden = false;
  }
  bar.input.addEventListener('input', () => {
    asked++;
    pick.hidden = true;
  });
  return h('div', { class: 'q-ask-orbit' }, [bar, pick]);
}
