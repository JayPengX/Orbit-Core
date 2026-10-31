// ---- law-more.js: what /law-chat finds besides the articles and law-ground.js ----
// Orbit Law's build publishes, next to the laws (Pages, data/):
//   rulings/all.json { rulings: [[jid, date, 案由, ['p:key' cited]]] }: the top
//                    courts' judgments of the last 3 years (no text: the
//                    best few are read from 司法院's page, 30 days at the edge);
//   ly/people.json   { people: [{ id, n, party, area, from, to, counts }] } and
//   ly/person/<id>.json { bills: [[id, date, name, status]], … }: the legislators;
//   ly/votes.json    { names, votes: [[id, date, 議題, agenda, yes, no, abstain, laws]] }
//                    (yes/no/abstain: places in names);
//   ly/agenda.json   { meets: [{ id, title, room, days: [{ d, from, to }], why, bills }] };
//   cons/index.json  { items: [[id, date, 案名, 爭點, ['p:key'], refs, bills]] } and
//                    cons/<id>.json { main, reason }: 大法官解釋 (s748) and 憲法判決 (j111-10);
//   agency/all.json  { rules: [[id, name, agency, date, url, ['p:key'], [p]]] } and
//   agency/text/<file>.json { t }: ministries' 行政規則.
// The question (and the articles found for it) picks a few of each; the
// prompt quotes them, and the answer carries them as links into the app.
// A judgment and a rule can be cited like an article (by its id); a file
// not there yet is simply left out.
import { readGround } from './law-ground.js';
import { readData } from './law.js';

// A small file read for one answer (a day at the edge, not kept here); null when it can't be.
const readOne = path => readData(path).catch(() => null);

export const MORE_LIMITS = { cases: 6, caseTexts: 3, caseChars: 900, people: 3, votes: 6, meets: 3, rules: 3, ruleChars: 1500, mine: 8 };
const JUDGMENT = 'https://judgment.judicial.gov.tw/FJUD/data.aspx?ty=JD&id=';
export const CONS_ID = /^(s\d{1,4}|j\d{3}-\d{1,3})$/;
export const JID = /^[A-Z]{3,5},\d{2,3},[^,\s]{1,12},\d{1,6},\d{8},\d{1,3}$/u;
export const RULE_ID = /^[\p{L}\p{N}_-]{2,12}:[\p{L}\p{N}_.-]{1,40}$/u;

const HAN = /[㐀-鿿豈-﫿]/;
function hanPairs(text) {
  const out = new Set();
  const chars = [...String(text || '')];
  for (let i = 0; i + 1 < chars.length; i++) if (HAN.test(chars[i]) && HAN.test(chars[i + 1])) out.add(chars[i] + chars[i + 1]);
  return out;
}
const shared = (a, want) => [...hanPairs(a)].filter(p => want.has(p)).length;
const cut = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};
const textFile = id => String(id).replace(/[^A-Za-z0-9_-]/g, '_');

// ---- Rulings ----------------------------------------------------------------------

const COURT = { TPS: '最高法院', TPA: '最高行政法院', JCC: '憲法法庭' };
export const courtName = jid => COURT[String(jid).slice(0, 3)] || '';
const KIND = { M: '刑事', V: '民事', A: '行政' };
export const caseLabel = (jid, label = '') => {
  if (CONS_ID.test(jid)) return label || (jid[0] === 's' ? `司法院釋字第${jid.slice(1)}號` : `憲法法庭${jid.slice(1).replace('-', '年憲判字第')}號`);
  const [head, y, w, n] = String(jid).split(',');
  return `${courtName(jid)}${head.startsWith('TPS') ? KIND[head[3]] || '' : ''} ${y}年度${w}字第${n}號`;
};

// The judgments most like the question: 3 for each article found they cite
// (1/4 for a law found, 1 at most), and 1.5 for each pair their 案由 shares
// with the question; 4.5 at least and their 案由 sharing a pair with it,
// newer first on a tie. (Articles alone brought 加重詐欺 to a fake plate:
// a 詐欺 case cites 刑法 第212條 too. Jay 2026-10-27: useless.)
export function matchRulings(rows, cites, text, max = MORE_LIMITS.cases) {
  const arts = new Set(cites);
  const laws = new Set(cites.map(c => c.split(':')[0]));
  const want = hanPairs(text);
  const scored = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!Array.isArray(r) || typeof r[0] !== 'string' || !JID.test(r[0])) continue;
    const cs = Array.isArray(r[3]) ? r[3] : [];
    let s = 0, near = 0;
    for (const c of cs) arts.has(c) ? (s += 3) : laws.has(String(c).split(':')[0]) ? (near += 0.25) : 0;
    const words = shared(r[2], want);
    s += Math.min(1, near) + words * 1.5;
    if (words && s >= 4.5) scored.push([s, r]);
  }
  return scored
    .sort((a, b) => b[0] - a[0] || String(b[1][1]).localeCompare(String(a[1][1])))
    .slice(0, max)
    .map(([, r]) => ({ jid: r[0], d: String(r[1] || ''), t: String(r[2] || ''), cites: (r[3] || []).slice(0, 8) }));
}

// A judgment page's text in brief: 主文, then the start of the reasons.
export function judgmentGist(html, max = MORE_LIMITS.caseChars) {
  const s = String(html || '');
  const at = s.search(/class="(htmlcontent|text-pre)/);
  if (at < 0) return '';
  const end = s.indexOf('id="JudrelaLaw"', at);
  const text = s
    .slice(at, end > 0 ? end : undefined)
    .replace(/<[^>]+>/g, '\n')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/[ \t　]+/g, '')
    .replace(/\n+/g, '\n');
  const main = text.match(/主\s*文\n?([\s\S]*?)\n(?:理\s*由|事\s*實|事實及理由)/)?.[1] || '';
  const why = text.split(/\n(?:理\s*由|事實及理由|事\s*實)\n/)[1] || '';
  const flat = t => t.replace(/\n/g, '');
  const m = cut(flat(main), 300);
  return m || why ? `主文：${m}${why ? `／理由：${cut(flat(why), Math.max(200, max - m.length))}` : ''}` : '';
}

// 釋字 and 憲判字 like the question, at most 2: one on an article found
// whose name or question shares a pair with it, or one sharing 5.
export function matchCons(rows, cites, text, max = 2) {
  const arts = new Set(cites);
  const want = hanPairs(text);
  const scored = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!Array.isArray(r) || !CONS_ID.test(String(r[0]))) continue;
    const words = shared(`${r[2] || ''} ${r[3] || ''}`, want);
    const on = (r[4] || []).filter(c => arts.has(c)).length;
    if ((on && words) || words >= 5) scored.push([on * 3 + words * 0.75, r]);
  }
  return scored
    .sort((a, b) => b[0] - a[0] || String(b[1][1]).localeCompare(String(a[1][1])))
    .slice(0, max)
    .map(([, r]) => ({ jid: r[0], d: String(r[1] || ''), t: String(r[2] || r[3] || ''), cites: (r[4] || []).slice(0, 8) }));
}

// A judgment's gist: kept (gists: { get, put }, the proxy's KV) once read, since
// a judgment never changes; else read from 司法院's page (through Taiwan, a slow
// site: 3.5 s at most, then the case goes in by its 案由 alone).
async function caseText(jid, fetcher = fetch, gists = null) {
  if (CONS_ID.test(jid)) {
    const j = await readOne(`cons/${jid}.json`);
    return j ? `${j.issue ? `爭點：${cut(j.issue, 200)}／` : ''}主文：${cut(j.main, 400)}${j.reason ? `／理由：${cut(j.reason, 500)}` : ''}` : '';
  }
  const had = await gists?.get(jid).catch(() => null);
  if (had) return had;
  try {
    const res = await fetcher(`${JUDGMENT}${encodeURIComponent(jid)}`, { signal: AbortSignal.timeout(3500) });
    const gist = res.ok ? judgmentGist(await res.text()) : '';
    if (gist) gists?.put(jid, gist);
    return gist;
  } catch {
    return '';
  }
}

// ---- Legislators, votes and meetings -------------------------------------------------

// The legislators the text names (the longest name first; one place each).
export function matchPeople(people, text, also = []) {
  const t = String(text || '');
  const list = (Array.isArray(people) ? people : []).filter(p => p && typeof p.n === 'string' && p.n.length >= 2 && p.id != null);
  const named = list.filter(p => t.includes(p.n) || also.includes(String(p.id)));
  const seen = new Set();
  return named.filter(p => !seen.has(p.n) && seen.add(p.n)).slice(0, MORE_LIMITS.people);
}

const VOTE_WORDS = /表決|投票|贊成|反對|棄權|投了|怎麼投|支持|立場|兩大黨|兩黨|朝野|跨黨派|藍綠|vote/i;
const BOTH = /兩大黨|兩黨|朝野|跨黨派|藍綠|共識|共同支持/;
// Most of each big party's members voted yes (10 at least each).
const BIG = ['民主進步黨', '中國國民黨'];
export function bothYes(v, names, partyOf) {
  const of = (list, p) => (list || []).filter(i => partyOf.get(names[i]) === p).length;
  return BIG.every(p => of(v[4], p) >= 10 && of(v[4], p) > of(v[5], p) + of(v[6], p));
}
// The question names this law (its full name, or without 法/條例 at the end).
export const lawNamed = (text, n) => Boolean(n) && (String(text).includes(n) || (n.length > 3 && String(text).includes(n.replace(/(施行細則|條例|法)$/, ''))));
// The votes a question is about: a law found or named (by its code), the
// newest first; else, when it names legislators, their newest; else, with
// vote words, the ones whose 議題 shares the most with it. Asked what both
// big parties backed: only whole-bill votes most of each voted yes on (any law when
// none found has one).
export function matchVotes(data, text, ps, people, partyOf = new Map()) {
  let rows = (Array.isArray(data?.votes) ? data.votes : []).filter(v => Array.isArray(v) && typeof v[0] === 'string');
  const newer = (a, b) => String(b[1]).localeCompare(String(a[1]));
  const asked = VOTE_WORDS.test(text) || people.length > 0;
  if (!asked) return [];
  // (Whole bills only: a 復議案 or one article's 再修正動議 isn't a law both backed.)
  if (BOTH.test(text) && partyOf.size) rows = rows.filter(v => /全案/.test(v[2]) && bothYes(v, data.names || [], partyOf));
  const want = new Set(ps);
  const ofLaw = rows.filter(v => (v[7] || []).some(p => want.has(p)));
  if (ofLaw.length) return ofLaw.sort(newer).slice(0, MORE_LIMITS.votes);
  if (people.length) {
    const names = data.names || [];
    const at = new Set(people.map(p => names.indexOf(p.n)).filter(i => i >= 0));
    return rows.filter(v => [v[4], v[5], v[6]].some(l => (l || []).some(i => at.has(i)))).sort(newer).slice(0, MORE_LIMITS.votes);
  }
  if (BOTH.test(text) && partyOf.size) return rows.sort(newer).slice(0, MORE_LIMITS.votes);
  const w = hanPairs(text);
  return rows
    .map(v => [shared(v[2], w), v])
    .filter(([s]) => s >= 2)
    .sort((a, b) => b[0] - a[0] || newer(a[1], b[1]))
    .slice(0, MORE_LIMITS.votes)
    .map(([, v]) => v);
}

// What a vote was on: its 議案's title (the 議事錄's, its ─完成三讀─ dropped) before its 議題 (討論事項第二十四案 全案表決 alone says nothing).
export function voteTopic(v, data) {
  const ag = (Array.isArray(data?.agendas) ? data.agendas : []).find(a => Array.isArray(a) && a[0] === v[3])?.[1];
  const t = String(ag || '').replace(/─[^─]*─/g, '').replace(/[（(]前接.*$/, '').trim();
  return t && !String(v[2]).includes(t.slice(0, 8)) ? `${cut(t, 80)}：${v[2]}` : String(v[2] || '');
}
// A vote in a line: the counts by party, and how each named legislator voted.
export function voteLine(v, data, partyOf, people) {
  const names = data.names || [];
  const tally = list => {
    const by = new Map();
    for (const i of list || []) {
      const p = partyOf.get(names[i]) || '其他';
      by.set(p, (by.get(p) || 0) + 1);
    }
    return [...by].sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p}${n}`).join('、');
  };
  const [yes, no, ab] = [v[4] || [], v[5] || [], v[6] || []];
  const how = people.map(p => {
    const i = names.indexOf(p.n);
    const m = yes.includes(i) ? '贊成' : no.includes(i) ? '反對' : ab.includes(i) ? '棄權' : '未投票';
    return `${p.n}${m}`;
  });
  return `${cut(v[1], 10)} 表決「${cut(voteTopic(v, data), 160)}」：${yes.length > no.length ? '通過' : '未通過'}，贊成 ${yes.length}（${tally(yes) || '—'}）、反對 ${no.length}（${tally(no) || '—'}）、棄權 ${ab.length}${how.length ? `；${how.join('、')}` : ''}`;
}

const MEET_WORDS = /議程|開會|會議|審查|排入|排審|今天|明天|本週|這週|下週|什麼時候|何時|when|agenda|meeting/i;
// The coming meetings that take up a law found or a name the text has (its
// title, 事由 or bills), soonest first; only on a question about when.
export function matchMeets(meets, text, lawNames, today) {
  if (!MEET_WORDS.test(text)) return [];
  const names = lawNames.filter(n => n && n.length >= 2);
  const w = hanPairs(text);
  const day = m => (Array.isArray(m?.days) ? m.days.map(x => x?.d).filter(Boolean).sort()[0] : '') || '';
  const list = (Array.isArray(meets) ? meets : []).filter(m => m && typeof m.id === 'string' && day(m) >= today);
  const about = m => [m.title, m.why, ...(m.bills || []).map(b => b?.t)].join(' ');
  const hit = list.filter(m => names.some(n => about(m).includes(n)) || shared(m.title, w) >= 3);
  return hit.sort((a, b) => day(a).localeCompare(day(b))).slice(0, MORE_LIMITS.meets).map(m => ({ id: m.id, t: cut(m.title, 80), d: day(m), why: cut(m.why, 200) }));
}

// ---- 行政規則 -------------------------------------------------------------------------

// The rules the question is about: its pairs in their names (2 each), an
// article found that they rest on (3), a law found (0.5); 6 at least.
export function matchRules(rows, text, cites) {
  const arts = new Set(cites);
  const laws = new Set(cites.map(c => c.split(':')[0]));
  const want = hanPairs(text);
  const scored = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!Array.isArray(r) || typeof r[0] !== 'string' || typeof r[1] !== 'string' || !RULE_ID.test(r[0])) continue;
    let s = shared(r[1], want) * 2;
    for (const c of r[5] || []) if (arts.has(c)) s += 3;
    for (const p of r[6] || []) if (laws.has(p)) s += 0.5;
    if (s >= 6) scored.push([s, r]);
  }
  return scored
    .sort((a, b) => b[0] - a[0] || String(b[1][3]).localeCompare(String(a[1][3])))
    .slice(0, MORE_LIMITS.rules)
    .map(([, r]) => ({ id: r[0], n: r[1], agency: String(r[2] || ''), d: String(r[3] || ''), url: /^https:\/\//.test(r[4]) ? r[4] : '', dir: r.dir || 'agency' }));
}
// The cities' 地方法規 (local/all.json: [id, name, city, date, url, laws]) as
// rule rows: only those of the cities given (a city's rules bind only who
// lives there: Jay 2026-10-27, 高雄's and 臺南's towing rules on a fake plate).
export const localRows = (rows, cities = null) =>
  Array.isArray(rows) ? rows.filter(r => Array.isArray(r) && (!cities || cities.has(tai(r[2])))).map(r => Object.assign([r[0], r[1], r[2], r[3], r[4], [], r[5] || []], { dir: 'local' })) : [];
const tai = s => String(s || '').replace(/台/g, '臺');
// The cities a question names (臺北市, 台北, 高雄…) among those the rules have.
export function citiesIn(text, rows) {
  const t = tai(text);
  const all = new Set((Array.isArray(rows) ? rows : []).filter(Array.isArray).map(r => tai(r[2])).filter(Boolean));
  return [...all].filter(c => t.includes(c) || (c.length === 3 && t.includes(c.slice(0, 2)) && !/^(新竹|嘉義)/.test(c)));
}

// The ministries' rule sites (one software: SearchAllResultList, LawContent), as build-agency.mjs lists them.
export const RULE_SITES = [
  ['MOE', '教育部', 'https://edu.law.moe.gov.tw'],
  ['MOA', '農業部', 'https://law.moa.gov.tw'],
  ['MOENV', '環境部', 'https://oaout.moenv.gov.tw/law'],
  ['MOF', '財政部', 'https://law-out.mof.gov.tw'],
  ['HAKKALAW', '客委會', 'https://law.hakka.gov.tw'],
  ['NSTC', '國科會', 'https://law.nstc.gov.tw']
];
const VENDOR_PAGE = /^https:\/\/[\w.-]+\.gov\.tw\/(?:[\w-]+\/)?LawContent\.aspx\?id=\w+/;
// A rule's name the question gives (高級中等學校訂定學生服裝儀容規定之原則): the longest run ending as one does.
export function ruleTitle(text) {
  const asked = String(text || '').replace(/(?:怎麼|怎樣|如何|是否|有沒有|有哪些|是什麼|什麼|內容|全文|可不可以|可以|能不能|嗎|呢|裡面|中的|中有)/g, '，');
  const all = asked.match(/[㐀-鿿（）()、]{6,60}(?:要點|注意事項|原則|須知|規定|基準|規範|作業程序|實施計畫)/g) || [];
  const best = all.sort((a, b) => b.length - a.length)[0] || '';
  return best.replace(/^(?:請問|想問|我想問|關於|依照|根據|依)/, '');
}
const unent = t => t.replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n))).replace(/&amp;/g, '&');
// A search page's rows: [{ id, name }].
export function vendorHits(html) {
  return [...String(html || '').matchAll(/href="LawContent\.aspx\?id=(\w+)[^"]*"[^>]*>([\s\S]*?)<\/a>/g)].map(m => ({ id: m[1], name: unent(m[2].replace(/<[^>]+>/g, '')).trim() })).filter(r => r.name);
}
// A rule page's text (agency.mjs vendorText's rule).
export function vendorText(html) {
  const m = String(html || '').match(/id="ctl00_cp_content_divLawContent\d*"[^>]*>([\s\S]*?)<\/div>/);
  return m ? unent(m[1].replace(/<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '')).trim() : '';
}
async function page(url) {
  try {
    const res = await fetch(url, { cf: { cacheTtlByStatus: { '200-299': 86_400, 404: 60, '500-599': 0 }, cacheEverything: true }, signal: AbortSignal.timeout(6000) });
    return res.ok ? await res.text() : '';
  } catch {
    return '';
  }
}
// The rule of that name on the ministries' sites (asked of all at once), with its text; null if none has it.
export async function liveRule(title) {
  const want = hanPairs(title);
  const found = await Promise.all(RULE_SITES.map(async ([code, agency, base]) => vendorHits(await page(`${base}/SearchAllResultList.aspx?KW=${encodeURIComponent(title)}`)).map(r => ({ ...r, code, agency, base }))));
  const best = found
    .flat()
    .map(r => [r.name === title ? 1e3 : shared(r.name, want) / Math.max(want.size, hanPairs(r.name).size), r])
    .filter(([s]) => s >= 0.7)
    .sort((a, b) => b[0] - a[0])[0]?.[1];
  if (!best) return null;
  const url = `${best.base}/LawContent.aspx?id=${best.id}`;
  return { id: `${best.code}:${best.id}`, n: best.name, agency: best.agency, d: '', url, text: cut(vendorText(await page(url)), MORE_LIMITS.ruleChars) };
}

// ---- The reader's own --------------------------------------------------------------------

const LY_ONLY = /修法|草案|立委|立法院|表決|投票|三讀|二讀|一讀|進度|議程|預算|法案/;
export const asksLy = text => LY_ONLY.test(String(text || ''));
const MINE_WORDS = /我(的|追蹤|關注|收藏|存的|標記)|追蹤的|收藏的|書籤|my |i follow|followed|saved|bookmark/i;
// What the reader follows and marked ({ laws: [p], items: [k], people: [id],
// marks: ['p:key'] }), checked; a string is what's wrong with it.
export function readMine(m) {
  if (m == null) return { laws: [], items: [], people: [], marks: [] };
  if (typeof m !== 'object') return 'mine';
  const out = {};
  const shapes = { laws: /^[A-Z]\d{7}$/, items: /^\d{1,2}:[\w-]{1,20}$/, people: /^\d{1,6}$/, marks: /^[A-Z]\d{7}:\d{1,4}(-\d{1,3})?$/ };
  for (const [k, re] of Object.entries(shapes)) {
    const v = m[k] ?? [];
    if (!Array.isArray(v) || v.length > 40) return 'mine';
    out[k] = [...new Set(v.map(String).filter(x => re.test(x)))].slice(0, MORE_LIMITS.mine);
  }
  return out;
}
export const asksMine = text => MINE_WORDS.test(String(text || ''));

// ---- All of it, for a question --------------------------------------------------------------

// { cases, people, votes, meets, rules, mine } for the question, given the
// articles found ([{ p, n, key }]) and the bills' items; each read only
// when the question can use it. cities: the reader's own (their 地方法規
// only; none, only a city the question names); fetcher: how a judgment's
// page is read (from Taiwan: law-hosts.js).
const MORE_FILES = ['rulings/all.json', 'ly/people.json', 'ly/votes.json', 'ly/agenda.json', 'agency/all.json', 'cons/index.json', 'local/all.json'];
// Its files read ahead (while the plan is written): moreFor finds them read.
export const warmMore = () => Promise.all(MORE_FILES.map(p => readGround(p)));
export async function moreFor(text, articles, { mine = null, items = [], today = '', cities = [], fetcher = fetch, gists = null } = {}) {
  const cites = articles.map(a => `${a.p}:${a.key}`);
  const ps = [...new Set(articles.map(a => a.p))];
  const lawNames = [...new Set(articles.map(a => a.n))];
  const own = mine && asksMine(text) ? mine : null;
  const [rulings, peopleF, votesF, agendaF, rulesF, consF, localF] = await warmMore();
  const people = matchPeople(peopleF?.people, text, own?.people || []);
  const partyOf = new Map((peopleF?.people || []).map(p => [p.n, p.party]));
  // Asked about legislators (by name, or the ones followed): their newest votes,
  // narrowed to a law only when the question names it (an article the search
  // found for 我追蹤的立委投了什麼票 would pin the answer to that law's old votes).
  const named = people.length ? ps.filter(p => lawNamed(text, articles.find(a => a.p === p)?.n)) : ps;
  const votes = votesF ? matchVotes(votesF, text, named, people, partyOf) : [];
  const votesThrough = votesF ? (votesF.votes || []).reduce((m, v) => (Array.isArray(v) && String(v[1]) > m ? String(v[1]) : m), '') : '';
  const cons = matchCons(consF?.items, cites, text);
  // (A question about the 立法院's work gets no judgments or rules: they'd be noise there.)
  const ly = LY_ONLY.test(text);
  const cases = ly ? [] : [...cons, ...matchRulings(rulings?.rulings, cites, text)].slice(0, MORE_LIMITS.cases);
  const texts = await Promise.all(cases.slice(0, MORE_LIMITS.caseTexts + cons.length).map(c => caseText(c.jid, fetcher, gists)));
  texts.forEach((t, i) => (cases[i].gist = t));
  // The ministries' 行政規則 and the cities' 地方法規, one list; a text kept on the site is read from there.
  const mineCities = new Set([...cities, ...citiesIn(text, localF?.rules)].map(tai));
  let rules = ly ? [] : matchRules([...(rulesF?.rules || []), ...localRows(localF?.rules, mineCities)], text, cites);
  const ruleTexts = await Promise.all(rules.map(r => readOne(`${r.dir}/text/${textFile(r.id)}.json`)));
  ruleTexts.forEach((j, i) => ((rules[i].text = typeof j?.t === 'string' ? cut(j.t, MORE_LIMITS.ruleChars) : ''), (rules[i].kept = Boolean(rules[i].text))));
  // A rule asked by its name that the nightly build hasn't reached: found on its ministry's site now.
  const title = ruleTitle(text);
  if (title && !rules.some(r => r.n === title && r.text)) {
    const live = await liveRule(title);
    if (live) rules = [live, ...rules.filter(r => r.n !== live.n)].slice(0, MORE_LIMITS.rules);
  }
  // (A rule asked for by its name is shown whether or not the answer cites it.)
  for (const r of rules) if (title && r.n === title) r.asked = true;
  // A rule kept by name only: its text read from its page now.
  await Promise.all(rules.filter(r => !r.text && VENDOR_PAGE.test(r.url)).slice(0, 2).map(async r => (r.text = cut(vendorText(await page(r.url)), MORE_LIMITS.ruleChars))));
  const persons = await Promise.all(people.map(p => readOne(`ly/person/${p.id}.json`)));
  people.forEach((p, i) => (p.bills = (persons[i]?.bills || []).filter(Array.isArray).slice(0, 5)));
  const meets = matchMeets(agendaF?.meets, text, lawNames, today);
  const myItems = own ? (Array.isArray(items) ? items : []).filter(b => own.items.includes(b?.k)) : [];
  return {
    cases,
    people,
    votes: votes.map(v => ({ id: v[0], d: String(v[1] || ''), t: voteTopic(v, votesF), line: voteLine(v, votesF, partyOf, people) })),
    votesThrough,
    meets,
    rules,
    mine: own ? { ...own, items: myItems } : null
  };
}

export const hasMore = m => Boolean(m && (m.cases.length || m.people.length || m.votes.length || m.meets.length || m.rules.length || m.mine));
export const moreKey = m => (hasMore(m) ? [...m.cases.map(c => c.jid), ...m.people.map(p => `p${p.id}`), ...m.votes.map(v => v.id), ...m.meets.map(x => `${x.id}@${x.d}`), ...m.rules.map(r => `${r.id}@${r.d}`), m.mine ? JSON.stringify(m.mine) : ''].join('|') : '');
// The ids an answer may cite besides the articles: the judgments and rules given.
export const moreCites = m => (m ? [...m.cases.map(c => c.jid), ...m.rules.map(r => r.id)] : []);

const STAGES = ['提案', '一讀', '委員會', '審查完畢', '協商', '二讀', '三讀', '公布'];
// The prompt's blocks (empty when nothing matched).
export function morePrompt(m) {
  if (!hasMore(m)) return '';
  const blocks = [];
  if (m.rules.length) blocks.push(`行政規則 (ministries' administrative rules; cite one by its id in quotes):\n${m.rules.map(r => `[cite "${r.id}"] ${r.agency}「${r.n}」${r.d ? `（${r.d}）` : ''}${r.text ? `\n${r.text}` : '（全文未收錄，只有名稱）'}`).join('\n\n')}`);
  if (m.cases.length) blocks.push(`法院判決 (similar cases the courts decided; cite one by its id in quotes):\n${m.cases.map(c => `[cite "${c.jid}"] ${caseLabel(c.jid, c.label)}（${c.d}）${CONS_ID.test(c.jid) ? '' : '案由：'}${cut(c.t, 60)}${c.gist ? `\n${c.gist}` : ''}`).join('\n\n')}`);
  if (m.people.length) blocks.push(`立委 (legislators the reader named; this term):\n${m.people.map(p => `- ${p.n}（${p.party || '無黨籍'}，${p.area || ''}${p.to && p.to < '2028' && p.to !== p.from ? `，任期至 ${p.to}` : ''}）：提案 ${p.counts?.bills ?? '?'} 件、連署 ${p.counts?.cosign ?? '?'} 件、記名表決 ${p.counts?.votes ?? '?'} 次、質詢影片 ${p.counts?.clips ?? '?'} 段${p.bills.length ? `；最近提案：${p.bills.map(b => `${cut(b[1], 10)}「${cut(b[2], 60)}」${cut(b[3], 12)}`).join('；')}` : ''}`).join('\n')}`);
  if (m.votes.length) blocks.push(`記名表決 (roll-call votes in 立法院${m.votesThrough ? `; 立法院公報 has published them through ${m.votesThrough}, later floor votes aren't out yet: say so when the reader asks for the latest` : ''}):\n${m.votes.map(v => `- ${v.line}`).join('\n')}`);
  if (m.meets.length) blocks.push(`立法院議程 (coming meetings):\n${m.meets.map(x => `- ${x.d}「${x.t}」${x.why ? `：${x.why}` : ''}`).join('\n')}`);
  if (m.mine) {
    const lines = [];
    if (m.mine.items.length) lines.push(...m.mine.items.map(b => `- 追蹤的法案「${cut(b.n, 60)}」進度：${STAGES[b.stage] || ''}${b.passed ? `（三讀 ${b.passed}）` : ''}${b.u ? `；更新 ${b.u}` : ''}`));
    if (m.mine.marks.length) lines.push(`- 收藏的條文：${m.mine.marks.join('、')}（其內容若在上面的 Articles 中可引用）`);
    if (lines.length) blocks.push(`讀者自己追蹤與收藏的 (the reader's own follows and bookmarks, on their phone):\n${lines.join('\n')}`);
  }
  return blocks.length ? `${blocks.join('\n\n')}\n\n` : '';
}

// What the answer carries: links into the app.
export function moreOut(m) {
  if (!hasMore(m)) return {};
  const out = {};
  if (m.cases.length) out.cases = m.cases.map(c => ({ jid: c.jid, d: c.d, t: cut(c.t, 60), no: caseLabel(c.jid, c.label) }));
  if (m.rules.length) out.rules = m.rules.map(r => ({ id: r.id, n: r.n, agency: r.agency, d: r.d, url: r.url, text: Boolean(r.kept), ...(r.dir === 'local' ? { dir: 'local' } : {}), ...(r.asked ? { asked: true } : {}) }));
  if (m.people.length) out.people = m.people.map(p => ({ id: String(p.id), n: p.n, party: p.party || '' }));
  if (m.votes.length) out.votes = m.votes.map(v => ({ id: v.id, d: v.d, t: cut(v.t, 80) }));
  if (m.meets.length) out.meets = m.meets.map(x => ({ id: x.id, t: x.t, d: x.d }));
  return out;
}
