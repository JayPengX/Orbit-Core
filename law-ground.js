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
// it is about a law or 立法院 work, up to 5 bills; on a budget question, the
// budgets of the year it names (民國 or western), else the 2 newest. The prompt quotes them as
// "政府公告與數字" and "立法院進度"; the answer carries them as notices and
// bills. A file not there yet (or unreadable) is simply left out.
import { DATA } from './law.js';

export const GROUND_LIMITS = { news: 3, newsMin: 6, bills: 5, budgets: 2, factChars: 600, newsChars: 300 };
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
const LY_WORDS = /修法|修正|草案|立法院|立委|三讀|二讀|一讀|法案|提案|審查|預算/;

// The bills a question is about: those of a law it names (2 characters at
// least), newest first; with 立法院 words and no law named, the bills whose
// names share the most with it.
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
  const want = hanPairs(t);
  const scored = list.map(b => [[...hanPairs(b.n)].filter(p => want.has(p)).length, b]).filter(([s]) => s >= 2);
  return scored
    .sort((a, b) => b[0] - a[0] || newer(a[1], b[1]))
    .slice(0, max)
    .map(([, b]) => b);
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
  return `「${cut(b.n, 120)}」進度：${stage}${marks ? `（${marks}）` : ''}${by ? `；提案：${by}` : ''}${b.u ? `；更新 ${b.u}` : ''}`;
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
- A bill is not law until it is 三讀 and 公布: say its stage plainly.
- A budget's amounts are only those its line gives (in 億元): quote them exactly; a line without amounts has none, so never give a figure for it. 凍結 isn't in the data.

`;
}

// What the answer carries: the notices and bills the model was given.
export function groundOut(g) {
  if (!hasGround(g)) return {};
  const notices = [...g.facts.map(f => ({ t: cut(f.t || f.text, 120), url: urls(f.src)[0] || '', d: cut(f.d ?? f.date ?? '', 40), agency: cut(f.agency ?? '', 40) })), ...g.news.map(n => ({ t: cut(n[2], 120), url: urls([n[3]])[0] || '', d: cut(n[0], 10), agency: cut(n[1], 40) }))];
  // (A budget first: it's what a budget question asked, not 預算法's bills; Jay 2026-10-27 found it under 更多1件.)
  const bills = [...budgetsOf(g).map(b => ({ k: `budget:${b.k}`, n: b.title, stage: -1, d: cut(b.stage, 20) })), ...g.bills.map(b => ({ k: b.k, n: b.n, stage: b.stage }))];
  return { ...(notices.length ? { notices } : {}), ...(bills.length ? { bills } : {}) };
}
