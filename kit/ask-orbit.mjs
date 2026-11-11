// ---- kit/ask-orbit.mjs: 問 Orbit, one question box on the Pass sheet (the family's AI plan) ----
// Code first (Jay 11-10): the words pick the app ("明天要帶傘嗎" Weather,
// "去台北車站" Transit, "湖人排第幾" Sports…), and the app opens with the
// question in its own ask (`#ask=<words>`, read there by `takeAsk`). Words no
// rule knows: the apps as a row of taps, the question carried to the one picked.
// No AI is called here and nothing is sent anywhere but the app's own page.
import { h } from './ui.mjs';
import { aiBar } from './ai.mjs';
import { W } from './lang.mjs';

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

// The app for some words: its kit id, or null when no rule knows them.
export function routeAsk(text) {
  const t = String(text || '').trim();
  if (!t) return null;
  for (const [app, re] of RULES) if (re.test(t)) return app;
  return null;
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
    placeholder: W('問 Orbit：明天要帶傘嗎、去台北車站…', 'Ask Orbit: rain tomorrow? to Taipei Main Station…'),
    label: W('問 Orbit', 'Ask Orbit'),
    max: 200,
    onSend(text) {
      const app = routeAsk(text);
      if (app) return send(app, text);
      // (No rule knows them: which app, a tap each.)
      pick.replaceChildren(
        h('p', { class: 'q-ask-orbit-q', text: W('要問哪個 App？', 'Which app should answer?') }),
        h(
          'div',
          { class: 'q-ask-orbit-apps' },
          ASK_APPS.filter(a => apps[a]).map(a => h('button', { type: 'button', class: 'q-ask-orbit-app q-press', onclick: () => send(a, text) }, [apps[a].icon, h('span', { text: apps[a].name })]))
        )
      );
      pick.hidden = false;
    }
  });
  bar.input.addEventListener('input', () => (pick.hidden = true));
  return h('div', { class: 'q-ask-orbit' }, [bar, pick]);
}
