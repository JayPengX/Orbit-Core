// ---- law-ground.js: what /law-chat and /law-ask know besides the articles ----
// Orbit Law's build publishes, next to the laws (Pages, data/):
//   ai/facts.json   { facts: [{ id, k: [keywords], t, text, now, next, law, src: [urls] }] }:
//                   figures the government announced (最低工資 and the like);
//   ai/news.json    { news: [[date, agency, title, url, text]] }: agencies' notices;
//   ly/budget.json  { budgets: [{ k, title, stage, first, last, flow: [[date, step]],
//                   money? }] }: the 總預算, 追加 and 特別 budgets' progress, and a
//                   yearly one's amounts in 千元 (total, asked, prev, cut, fn: 政事,
//                   top: the biggest 主管, cuts: the biggest cuts; cut null until passed);
//   bills/items.json { items: [{ k, n, stage 0-7, held, dropped, passed, pub, open, u, by: [[party, n]]] }:
//                   the 立法院's bills and where each one is.
// A question gets the facts whose keywords it (or the reader's last turn)
// names, the 3 notices it matches best (as Orbit Law's matchNews), and, when
// it is about a law or 立法院 work, up to 6 bills (matchBills); on a budget question, the
// budgets of the year it names (民國 or western), else the 2 newest. The prompt quotes them as
// "政府公告與數字" and "立法院進度"; the answer carries them as notices and
// bills. A file not there yet (or unreadable) is simply left out.
import { DATA } from './law.js';

export const GROUND_LIMITS = { news: 3, newsMin: 6, bills: 6, budgets: 2, factChars: 600, newsChars: 300 };
export const STAGES = ['提案', '一讀', '委員會', '審查完畢', '協商', '二讀', '三讀', '公布'];
const HOUR_MS = 3_600_000;

// A file, kept an hour at the edge and in the isolate; null when it isn't
// there or can't be read. (Its read is shared: asked twice at once, read once.)
const files = new Map();
export const forgetGround = () => files.clear();
export function readGround(path, now = Date.now()) {
  const had = files.get(path);
  if (had && now - had.at < HOUR_MS) return had.p;
  const p = fetch(`${DATA}${path}`, { cf: { cacheTtlByStatus: { '200-299': 3600, 404: 60, '500-599': 0 }, cacheEverything: true }, signal: AbortSignal.timeout(8000) })
    .then(res => (res.ok ? res.json() : null))
    .catch(() => null);
  files.set(path, { at: now, p });
  return p;
}

// ---- Matching ----------------------------------------------------------------------

const HAN = /[㐀-鿿豈-﫿]/;
function hanPairs(text) {
  const out = new Set();
  const chars = [...String(text || '')];
  for (let i = 0; i + 1 < chars.length; i++) if (HAN.test(chars[i]) && HAN.test(chars[i + 1])) out.add(chars[i] + chars[i + 1]);
  return out;
}
// The words people use for the same figure, both ways.
const SYNONYMS = [
  ['基本工資', '最低工資'],
  ['時薪', '每小時工資'],
  ['月薪', '每月工資']
];
export function expand(q) {
  let out = String(q || '');
  for (const [a, b] of SYNONYMS) {
    if (out.includes(a) && !out.includes(b)) out += ` ${b}`;
    if (out.includes(b) && !out.includes(a)) out += ` ${a}`;
  }
  return out;
}

// The facts any of whose keywords the text names.
export function matchFacts(facts, text) {
  const t = expand(text);
  return (Array.isArray(facts) ? facts : []).filter(f => f && typeof f.id === 'string' && Array.isArray(f.k) && f.k.some(k => typeof k === 'string' && k && t.includes(k)));
}

// The notices that match best: a shared pair of characters counts 2 in the
// title and 0.25 in the text; a score of 6 at least, with 2 of the title's
// pairs (two common words, 相關 and 交易, are no match), newer first on a tie.
export function matchNews(news, text, max = GROUND_LIMITS.news) {
  const want = hanPairs(expand(text));
  if (!want.size) return [];
  const scored = [];
  for (const n of Array.isArray(news) ? news : []) {
    if (!Array.isArray(n) || typeof n[2] !== 'string') continue;
    let s = 0;
    let title = 0;
    for (const p of hanPairs(n[2])) if (want.has(p)) ((s += 2), title++);
    for (const p of hanPairs(n[4])) if (want.has(p)) s += 0.25;
    if (s >= GROUND_LIMITS.newsMin && title >= 2) scored.push([s, n]);
  }
  return scored
    .sort((a, b) => b[0] - a[0] || String(b[1][0]).localeCompare(String(a[1][0])))
    .slice(0, max)
    .map(([, n]) => n);
}

// A bill's law: its name up to 法, 條例, 通則 or 律 (「勞動基準法部分條文修正草案」 → 勞動基準法).
const lawOf = n => String(n || '').replace(/[「」『』]/g, '').match(/^(.+?(?:條例|通則|法|律))/)?.[1] || '';
const LY_WORDS = /修法|修正|草案|立法院|立委|國會|三讀|二讀|一讀|法案|提案|審查|預算/;
// The words that say a question is about the 立法院's work, not what the work
// is on: dropped before the bills are matched (立法院組織法 came up for 「為了選舉
// 立法院搞了啥」 on 立法院 alone: Jay 2026-10-31).
const LY_META = /立法院|立委|委員會?|國會|院會|最近|近期|近來|這陣子|這幾個月|今年|這會期|本會期|法案|議案|草案|修法|修正|通過|三讀|二讀|一讀|進度|審查|提案|表決|投票|支持|反對|贊成|兩大黨|兩黨|朝野|跨黨派|藍綠|政黨|國民黨|民進黨|民眾黨|搞了?|做了?|在幹嘛|幹嘛|在忙|在做|怎麼樣|怎樣|情況|狀況|動態|消息|新聞|什麼|哪些|有沒有|為了|有關|相關|關於|啥|嗎|呢/g;
export const lyTopic = text => String(text || '').replace(LY_META, ' ');
const PASSED = /通過|三讀|公布|過了/;
const BOTH = /兩大黨|兩黨|朝野|跨黨派|藍綠|共識|共同支持/;
// A version proposed by each big party (or one by the 行政院 and one by the other side): both stand behind it.
const bothSides = b => {
  const ps = new Set((Array.isArray(b.by) ? b.by : []).map(x => x?.[0]));
  return ps.has('國民黨') && (ps.has('民進黨') || ps.has('行政院'));
};

// How rare each pair is among the bills (names and purposes): a pair in many
// (為了, 修正, 條例) says nothing about which.
const rarity = new WeakMap();
function pairCounts(list) {
  let c = rarity.get(list);
  if (!c) {
    c = new Map();
    for (const b of list) for (const p of hanPairs(`${b.n} ${b.about || ''}`)) c.set(p, (c.get(p) || 0) + 1);
    rarity.set(list, c);
  }
  return c;
}

// The bills a question is about: those of a law it names (3 characters at
// least), newest first. Else, with 立法院 words: those whose name (or two of
// whose purpose's) pairs are rare and the question's topic has, best first
// (none when no bill is on it); with no topic, the 立法院's latest: the newest passed when it asks
// what passed, those both big parties proposed when it asks so, else the
// newest moved.
export function matchBills(items, text, max = GROUND_LIMITS.bills) {
  const list = (Array.isArray(items) ? items : []).filter(b => b && typeof b.n === 'string' && Number.isInteger(b.stage));
  const t = String(text || '');
  const newer = (a, b) => String(b.u || '').localeCompare(String(a.u || ''));
  const named = list.filter(b => {
    const law = lawOf(b.n);
    return law.length >= 3 && t.includes(law);
  });
  if (named.length) return named.sort(newer).slice(0, max);
  if (!LY_WORDS.test(t)) return [];
  const want = hanPairs(lyTopic(t));
  const counts = pairCounts(list);
  const rare = Math.max(3, list.length * 0.05);
  const idf = p => Math.log(list.length / (counts.get(p) || 1));
  const scored = [];
  for (const b of list) {
    const inName = [...hanPairs(b.n)].filter(p => want.has(p) && counts.get(p) <= rare);
    const inAbout = [...hanPairs(b.about)].filter(p => want.has(p) && counts.get(p) <= rare && !inName.includes(p));
    if (inName.length || (inAbout.length && inAbout.length >= Math.min(2, want.size))) scored.push([inName.reduce((s, p) => s + idf(p), 0) + inAbout.reduce((s, p) => s + idf(p) / 2, 0), b]);
  }
  if (scored.length) {
    const top = Math.max(...scored.map(([s]) => s));
    return scored
      .filter(([s]) => s >= top / 2)
      .sort((a, b) => b[0] - a[0] || newer(a[1], b[1]))
      .slice(0, max)
      .map(([, b]) => b);
  }
  // A topic no bill is on: none (the laws the plan finds bring theirs).
  if (want.size) return [];
  // No topic: what the 立法院 did lately (Jay 2026-10-31: 「最近有什麼兩大黨支持通過的法案」 got 立法院組織法).
  const passed = PASSED.test(t);
  const pool = list.filter(b => !b.dropped && (!passed || b.passed) && (!BOTH.test(t) || bothSides(b)));
  const when = b => String((passed && b.passed) || b.u || '');
  return pool.sort((a, b) => when(b).localeCompare(when(a))).slice(0, max);
}

// The budgets a budget question is about: those of the 年度 it names (116,
// 116年, 2027 → 116; the k or the title), else the newest 年度's (its 總預算
// first): never past years unless asked.
const BUDGET_WORDS = /預算/;
export function budgetYear(text) {
  const t = String(text || '');
  const roc = t.match(/(?<!\d)(1[0-4]\d)\s*(?:年度|年)/)?.[1];
  if (roc) return roc;
  const ad = t.match(/(?<!\d)(20\d\d)(?!\d)/)?.[1];
  return ad ? String(Number(ad) - 1911) : null;
}
export function matchBudgets(budgets, text) {
  const t = String(text || '');
  const list = (Array.isArray(budgets) ? budgets : []).filter(b => b && typeof b.k === 'string' && typeof b.title === 'string');
  if (!BUDGET_WORDS.test(t) || !list.length) return [];
  const y = budgetYear(t);
  const newer = (a, b) => String(b.last || '').localeCompare(String(a.last || ''));
  if (y) {
    const of = list.filter(b => b.k === y || b.k.startsWith(`${y}`) || b.title.includes(`${y}年`));
    if (of.length) return of.sort(newer);
  }
  const yearOf = b => Number(String(b.k).match(/^\d{3}/)?.[0] || 0);
  const top = Math.max(...list.map(yearOf));
  return list
    .filter(b => yearOf(b) === top)
    .sort((a, b) => a.k.length - b.k.length || newer(a, b))
    .slice(0, GROUND_LIMITS.budgets);
}

// ---- What the model and the reader get -------------------------------------------------

const cut = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};
const urls = v => (Array.isArray(v) ? v : []).filter(u => typeof u === 'string' && /^https?:\/\//.test(u));
// 千元 → 億元 as people say it (one decimal); '' when it isn't a number.
export const yi = n => (Number.isFinite(n) ? `${(n / 100_000).toLocaleString('en-US', { maximumFractionDigits: 1 })}億元` : '');
const pairs = (v, n) => (Array.isArray(v) ? v : []).filter(x => Array.isArray(x) && typeof x[0] === 'string' && Number.isFinite(x[1])).slice(0, n);
export function budgetMoney(m) {
  if (!m || typeof m !== 'object') return '';
  const parts = [];
  const total = m.total ?? m.asked;
  if (Number.isFinite(total)) parts.push(`${m.passed ? '法定預算' : '預算案'}歲出 ${yi(total)}`);
  if (m.passed && Number.isFinite(m.asked)) parts.push(`原送預算案 ${yi(m.asked)}`);
  if (Number.isFinite(m.cut)) parts.push(`立法院刪減 ${yi(m.cut)}`);
  if (Number.isFinite(m.prev)) parts.push(`上年度 ${yi(m.prev)}`);
  if (Number.isFinite(m.rev)) parts.push(`歲入 ${yi(m.rev)}`);
  const fn = pairs(m.fn, 8);
  if (fn.length) parts.push(`政事別：${fn.map(([n, a]) => `${cut(n, 20)} ${yi(a)}`).join('、')}`);
  const top = pairs(m.top, 5);
  if (top.length) parts.push(`最大的主管：${top.map(([n, a, p]) => `${cut(n, 20)} ${yi(a)}${Number.isFinite(p) ? `（上年 ${yi(p)}）` : ''}`).join('、')}`);
  const cuts = pairs(m.cuts, 5);
  if (cuts.length) parts.push(`刪最多：${cuts.map(([n, a]) => `${cut(n, 20)} ${yi(a)}`).join('、')}`);
  return parts.join('；');
}
const budgetLine = b => {
  const flow = (Array.isArray(b.flow) ? b.flow : []).filter(x => Array.isArray(x)).slice(-3).map(([d, step]) => `${cut(d, 10)} ${cut(step, 60)}`).join(' → ');
  const money = budgetMoney(b.money);
  return `「${cut(b.title, 120)}」進度：${cut(b.stage, 40)}${b.last ? `；最近 ${cut(b.last, 10)}` : ''}${flow ? `；最近幾步：${flow}` : ''}${money ? `；金額：${money}` : '（只有進度，沒有金額）'}`;
};
const factLine = f => {
  const parts = [`${f.d ? `${cut(f.d, 10)} ` : ''}「${cut(f.t, 80)}」${cut(f.text, GROUND_LIMITS.factChars)}`];
  if (f.now) parts.push(`現行：${cut(f.now, 200)}`);
  if (f.next) parts.push(`將來：${cut(f.next, 200)}`);
  if (f.law) parts.push(`依據：${cut(f.law, 80)}`);
  const src = urls(f.src);
  if (src.length) parts.push(`來源：${src.slice(0, 2).join(' ')}`);
  return parts.join('；');
};
const newsLine = n => `${cut(n[0], 10)} ${cut(n[1], 30)}「${cut(n[2], 120)}」${cut(n[4], GROUND_LIMITS.newsChars)} 來源：${urls([n[3]])[0] || ''}`;
const billLine = b => {
  const stage = STAGES[b.stage] || '';
  const by = (Array.isArray(b.by) ? b.by : []).filter(x => Array.isArray(x)).map(([p, n]) => `${p} ${n}案`).join('、');
  const marks = [b.dropped && '已撤回或不予審議', b.held && '擱置', b.passed && `三讀 ${b.passed}`, b.pub && `公布 ${b.pub}`].filter(Boolean).join('，');
  return `「${cut(b.n, 120)}」進度：${stage}${marks ? `（${marks}）` : ''}${by ? `；提案：${by}` : ''}${b.u ? `；更新 ${b.u}` : ''}${b.about ? `；目的：${cut(b.about, 90)}` : ''}`;
};

// The grounding for a question: { facts, news, bills } matched, read from
// Orbit Law's files (each one left out when it isn't there).
export async function groundFor(text) {
  const [f, n, b, y] = await Promise.all(['ai/facts.json', 'ai/news.json', 'bills/items.json', 'ly/budget.json'].map(p => readGround(p)));
  const budgets = matchBudgets(y?.budgets, text);
  // (A budget question gets the budgets, not every bill whose name says 預算; a law it names still brings its bills.)
  const bills = matchBills(b?.items, text).filter(x => !budgets.length || (lawOf(x.n).length >= 3 && text.includes(lawOf(x.n))));
  return { facts: matchFacts(f?.facts, text), news: matchNews(n?.news, text), bills, budgets };
}

const budgetsOf = g => g?.budgets || [];
export const hasGround = g => Boolean(g && (g.facts.length || g.news.length || g.bills.length || budgetsOf(g).length));

// What changes the answer: a fingerprint for the kept answers' keys.
export const groundKey = g => (hasGround(g) ? [...g.facts.map(f => `${f.id}=${f.now ?? ''}>${f.next ?? ''}`), ...g.news.map(n => n[3]), ...g.bills.map(b => `${b.k}@${b.stage}${b.u ?? ''}`), ...budgetsOf(g).map(b => `budget:${b.k}@${b.last ?? ''}${b.money ? `$${b.money.total ?? ''}/${b.money.cut ?? ''}` : ''}`)].join('|') : '');

// The prompt's blocks, and its rule (empty when nothing matched).
export function groundPrompt(g) {
  if (!hasGround(g)) return '';
  const blocks = [];
  if (g.facts.length || g.news.length) blocks.push(`政府公告與數字 (official figures and agencies' notices, newest data Orbit Law has):\n${[...g.facts.map(factLine), ...g.news.map(newsLine)].map(l => `- ${l}`).join('\n')}`);
  if (g.bills.length || budgetsOf(g).length) blocks.push(`立法院進度 (bills and budgets in the 立法院 and their stage):\n${[...g.bills.map(billLine), ...budgetsOf(g).map(budgetLine)].map(l => `- ${l}`).join('\n')}`);
  return `${blocks.join('\n\n')}

About these:
- Quote any figure, amount or date exactly as written above, with its date and source (the agency or 立法院); never change or estimate a number.
- Prefer the official figures over a notice when they differ; a 將來 figure is not in force yet, so say from when it applies.
- These are not articles: never put them in cites. Use them in answer (and next) only.
- A bill is not law until it is 三讀 and 公布: say its stage plainly. Say what each bill does (its 目的) in a few words, not just its name.
- 提案 by party says who proposed versions of it; a bill both big parties proposed has their support. How a party voted is only what a 記名表決 line says (most bills pass without one).
- A budget's amounts are only those its line gives (in 億元): quote them exactly; a line without amounts has none, so never give a figure for it. 凍結 isn't in the data.

`;
}

// What the answer carries: the notices and bills the model was given.
export function groundOut(g) {
  if (!hasGround(g)) return {};
  const notices = [...g.facts.map(f => ({ t: cut(f.t || f.text, 120), url: urls(f.src)[0] || '', d: cut(f.d ?? f.date ?? '', 40), agency: cut(f.agency ?? '', 40) })), ...g.news.map(n => ({ t: cut(n[2], 120), url: urls([n[3]])[0] || '', d: cut(n[0], 10), agency: cut(n[1], 40) }))];
  // (A budget first: it's what a budget question asked, not 預算法's bills; Jay 2026-10-27 found it under 更多1件.)
  const bills = [...budgetsOf(g).map(b => ({ k: `budget:${b.k}`, n: b.title, stage: -1, d: cut(b.stage, 20) })), ...g.bills.map(b => ({ k: b.k, n: b.n, stage: b.stage, ...(b.passed || b.u ? { d: String(b.passed || b.u).slice(0, 10) } : {}) }))];
  return { ...(notices.length ? { notices } : {}), ...(bills.length ? { bills } : {}) };
}
