// ---- law-local.js: what /law-chat finds in the councils and the 代表會 ----
// 問法律 about anything in Law (Jay 11-10: "from the smallest and deepest
// regulation to small council"): a question naming a council (彰化縣議會, 議員
// 某某) or a 代表會 (溪湖鎮民代表會, 溪湖鎮代表) is grounded, besides the
// articles, by what Orbit Law shows of it, picked by code:
//   council/index.json, council/<c>.json   the 22 councils: their sessions,
//                     their members, their newest bills (a council of its own site's);
//   all.cc.govapi.tw  the councils' bills this term, searched by the question's words;
//   council/reps.json, council/town/<tc>.json, council/town/<tc>/<paper>.json
//                     every 代表會's members, sessions and what its papers said:
//                     proposals and their 議決 (會議紀錄), 決議案, 質詢, 書面質詢;
//   …/meet_transcripts  what councillors said in their council's sittings (質詢), a
//                     named councillor's newest, or anyone's on the question's words.
// Each bill, turn or row is quoted by an id the answer may cite ("cc:…", "cq:…", "tw:…") and
// carried back as a link into the app.
import { readGround } from './law-ground.js';
import { readData } from './law.js';

export const LOCAL_LIMITS = { councils: 2, towns: 2, bills: 6, billChars: 200, people: 3, sessions: 6, rows: 8, rowChars: 160, talks: 4, talkChars: 220 };
const CC_API = 'https://all.cc.govapi.tw/api/';
const LOCAL_WORDS = /議會|議員|議長|縣議|市議|代表會|代表|公所|鄉長|鎮長|臨時會|定期會|議事錄|質詢|提案|決議/;
export const asksLocal = text => LOCAL_WORDS.test(String(text || ''));

const HAN = /[㐀-鿿豈-﫿]/;
function hanPairs(text) {
  const out = new Set();
  const chars = [...String(text || '')];
  for (let i = 0; i + 1 < chars.length; i++) if (HAN.test(chars[i]) && HAN.test(chars[i + 1])) out.add(chars[i] + chars[i + 1]);
  return out;
}
const shared = (a, want) => [...hanPairs(a)].filter(p => want.has(p)).length;
const tai = s => String(s || '').replace(/台/g, '臺');
const cut = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n)}…` : t;
};
// The words that say nothing of what a bill is about.
const PLAIN = /議會|議員|議長|代表會|代表|公所|鄉長|鎮長|市長|縣長|臨時會|定期會|議事錄|質詢|提案|決議|最近|今年|這屆|本屆|哪些|什麼|有沒有|怎麼|如何|通過|審議|討論|請問|想知道|關於/g;

// The councils and 代表會 a question names, as Orbit Law lists them.
// councils: [{ c, n, city }] (by city: 彰化, 彰化縣議會; or the reader's
// city when it only says 議會 / 議員); towns: [{ tc, town, city, reps }].
export function placesIn(text, idx, reps, cities = []) {
  const t = tai(text);
  const all = (idx?.councils || []).filter(c => c?.c && c.city);
  const towns = [];
  for (const p of reps?.places || [])
    for (const x of p.towns || []) {
      const short = x.town.replace(/[鄉鎮市區]$/, '');
      // 溪湖鎮 always; 溪湖 with a word of the 代表會's beside it (北區, 東區: their full name only).
      if (t.includes(x.town) || (short.length >= 2 && t.includes(short) && /代表|鄉|鎮|公所/.test(t) && !all.some(c => tai(c.city).startsWith(short)))) towns.push({ ...x, city: p.city });
    }
  const named = all.filter(c => t.includes(tai(c.city)) || (!/^(新竹|嘉義)/.test(c.city) && t.includes(tai(c.city).slice(0, 2))));
  // A 代表會's question names its county too (溪湖鎮 is 彰化's): the council only when it says 議會 or 議員.
  const wantsCouncil = /議會|議員|議長|縣議|市議/.test(t);
  let councils = towns.length && !wantsCouncil ? [] : named;
  if (!councils.length && wantsCouncil && !towns.length) councils = all.filter(c => cities.map(tai).includes(tai(c.city)));
  // (新竹 and 嘉義 are a city and a county: both, unless one is said.)
  if (!councils.length && wantsCouncil) councils = all.filter(c => /^(新竹|嘉義)/.test(c.city) && t.includes(c.city.slice(0, 2)) && (t.includes(c.city) || !t.match(/(新竹|嘉義)(市|縣)/)));
  return { councils: councils.slice(0, LOCAL_LIMITS.councils), towns: towns.slice(0, LOCAL_LIMITS.towns) };
}

// The question's own words for a search (the plan's terms first): at most 2.
export function searchWords(text, terms = []) {
  const out = [];
  for (const w of [...terms, ...tai(text).replace(PLAIN, ' ').split(/[\s，。、？?！!「」:：,.;；（）()的了嗎呢和與及在是有要]+/)]) {
    const s = String(w || '').trim();
    if (s.length >= 2 && s.length <= 12 && HAN.test(s) && !out.includes(s)) out.push(s);
    if (out.length >= 2) break;
  }
  return out;
}

// A council's bill, as the API gives it, in a few words.
export const apiBill = b => ({ id: String(b['代碼'] || ''), t: cut(b['案由'], LOCAL_LIMITS.billChars), by: cut(b['提案人'] || b['提案單位'], 30), cat: String(b['類別'] || ''), no: String(b['案號'] || ''), res: cut(b['議決'], 80), d: String(b['日期'] || b['議決日期'] || '').slice(0, 10) });
// A council's kept bill (council/<c>.json bills) the same way.
const keptBill = b => ({ id: String(b.id || ''), t: cut(b.t, LOCAL_LIMITS.billChars), by: cut(b.by, 30), cat: String(b.cat || ''), no: String(b.no || ''), res: b.out === 'yes' ? '通過' : b.out === 'no' ? '不通過' : '', d: String(b.d || '') });

async function apiBills(c, words, get) {
  if (!c.term || !words.length) return [];
  const found = await Promise.all(
    words.map(w =>
      get(`${CC_API}bills?${new URLSearchParams({ 議會代碼: c.c, 屆: String(c.term), q: w, limit: String(LOCAL_LIMITS.bills) })}`)
        .then(r => (Array.isArray(r?.bills) ? r.bills.map(apiBill) : []))
        .catch(() => [])
    )
  );
  return found.flat();
}
// What councillors said (質詢, 發言): one row a councillor's sitting, the turn that best
// matches the question (else the longest) as its gist. The chair's and officials' turns left out.
const TALK_WORDS = /質詢|發言|說了|問了|講了|怎麼說|說什麼|問什麼|立場|關心|主張/;
export function talksOf(rows, want) {
  const meets = new Map();
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r?.['發言內容'] || !r['代碼'] || (r['身分類別'] ? r['身分類別'] !== '議員' : !/議員/.test(r['職稱'] || ''))) continue;
    const k = `${r['會議代碼'] || r['日期']}|${r['姓名']}`;
    if (!meets.has(k)) meets.set(k, []);
    meets.get(k).push(r);
  }
  return [...meets.values()]
    .map(turns => {
      const best = turns.map(t => [shared(t['發言內容'], want) * 40 + Math.min(String(t['發言內容']).length, 400) / 10, t]).sort((a, b) => b[0] - a[0])[0];
      const t = best[1];
      // (Long turns from where the question's words come up.)
      const said = String(t['發言內容']).replace(/\s+/g, ' ');
      const at = Math.max(0, ...[...want].map(w => said.indexOf(w)).filter(i => i >= 0).slice(0, 1).map(i => i - 50));
      return { id: String(t['代碼']), d: String(t['日期'] || '').slice(0, 10), who: String(t['姓名'] || ''), t: (at ? '…' : '') + cut(said.slice(at), LOCAL_LIMITS.talkChars), url: /^https:\/\//.test(t['來源網址'] || '') ? t['來源網址'] : '', score: best[0] };
    })
    .filter(x => x.t.length >= 12)
    .sort((a, b) => (a.d < b.d ? 1 : a.d > b.d ? -1 : b.score - a.score))
    .slice(0, LOCAL_LIMITS.talks)
    .map(({ score, ...x }) => x);
}
async function apiTalks(c, people, words, text, get) {
  if (!people.length && !(TALK_WORDS.test(text) && words.length)) return [];
  const q = people.length ? { 姓名: people[0].n, limit: '150' } : { q: words[0], limit: '60' };
  const r = await get(`${CC_API}meet_transcripts?${new URLSearchParams({ 議會代碼: c.c, sort: '日期>', ...q })}`).catch(() => null);
  return talksOf(r?.meet_transcripts, hanPairs(words.join(' ')));
}

const apiJson = url => fetch(url, { cf: { cacheTtlByStatus: { '200-299': 3600, 404: 60, '500-599': 0 }, cacheEverything: true }, signal: AbortSignal.timeout(5000) }).then(r => (r.ok ? r.json() : null));

// A council: its people the question names, and its bills on the question's words.
async function councilFor(c, text, words, { read, get }) {
  const file = await read(`council/${c.c}.json`).catch(() => null);
  const want = hanPairs(`${text} ${words.join(' ')}`);
  const t = tai(text);
  const people = (file?.people || []).filter(p => p?.n && t.includes(p.n)).slice(0, LOCAL_LIMITS.people);
  const [live, talks] = await Promise.all([file?.own && !file.own.add ? [] : apiBills({ ...c, term: file?.term || c.term }, [...people.map(p => p.n), ...words].slice(0, 2), get), apiTalks(c, people, words, text, get)]);
  const kept = (file?.bills || []).map(keptBill).filter(b => shared(b.t, want) >= 3 || people.some(p => b.by.includes(p.n)));
  const seen = new Set();
  // (A row the API split wrong, 「法」部分條文案，敬請查照。, is left out.)
  const bills = [...live, ...kept].filter(b => b.id && (b.t.match(/[㐀-鿿]/g) || []).length >= 10 && !/^[」』，。、)）]/.test(b.t) && !seen.has(b.id) && seen.add(b.id)).slice(0, LOCAL_LIMITS.bills);
  const last = file?.last || c.last;
  return {
    c: c.c,
    n: file?.n || c.n,
    term: file?.term || c.term,
    head: file?.head || c.head || '',
    deputy: file?.deputy || c.deputy || '',
    seats: file?.seats || c.seats || 0,
    on: file?.on || c.on || null,
    next: file?.next || c.next || null,
    last: last ? { n: last.n, from: last.from, to: last.to } : null,
    people: people.map(p => ({ id: String(p.id || ''), n: p.n, party: p.party || '', area: p.area || '', bills: p.bills || 0 })),
    bills,
    talks
  };
}

const paperFile = s => `t${s.term}-${s.no}${s.kind === '定期會' ? 'r' : 'e'}`;
// A 代表會's paper's rows, one shape: { k, s, no, by, t, r, d }.
export function paperRows(paper, s) {
  const out = [];
  for (const it of paper?.items || []) out.push({ k: '提案', s, no: it.no || '', by: it.by || '', t: it.what || '', r: [it.result, it.note, it.vote].filter(Boolean).join('，'), d: it.d || '' });
  for (const r of paper?.res || []) out.push({ k: '決議案', s, no: r['案號'] || '', by: r['提案人'] || '', t: r['案由'] || '', r: r['議決'] || '', d: r.d || '' });
  for (const q of paper?.wq || []) out.push({ k: '書面質詢', s, no: q.no || '', by: q.w || '', t: q.ask || '', r: q.reply || '', d: q.d || '' });
  for (const q of paper?.asks || []) out.push({ k: '質詢', s, no: '', by: q.w || '', t: q.gist || '', r: '', d: '' });
  return out.filter(x => x.t);
}

// A 代表會: its members the question names, its newest sessions, and the rows of its papers on the question's words.
async function townFor(x, text, words, { read }) {
  const own = await read(`council/town/${x.tc}.json`).catch(() => null);
  const t = tai(text);
  const people = (x.reps || []).filter(r => t.includes(r[0])).map(r => ({ n: r[0], party: r[1] || '', area: r[2] || '' }));
  const sessions = (own?.sessions || []).slice(0, LOCAL_LIMITS.sessions);
  const papers = await Promise.all(sessions.map(s => (s.read || s.props || s.res || s.asks || s.wq ? read(`council/town/${x.tc}/${paperFile(s)}.json`).catch(() => null) : null)));
  const rows = papers.flatMap((p, i) => Object.values(p?.papers || {}).flatMap(paper => paperRows(paper, sessions[i].n)));
  const want = hanPairs(`${words.join(' ')} ${people.map(p => p.n).join(' ')}`);
  const scored = rows.map((r, i) => [shared(`${r.t} ${r.by}`, want) * 2 + (people.some(p => r.by.includes(p.n)) ? 4 : 0) - i / 1000, r]);
  // (Nothing on its words: the newest session's, so 「溪湖鎮代表會最近在做什麼」 still answers.)
  const hits = scored.filter(([s]) => s >= 3);
  const picked = (hits.length ? hits.sort((a, b) => b[0] - a[0]) : scored.filter(([, r]) => r.s === rows[0]?.s)).slice(0, LOCAL_LIMITS.rows).map(([, r]) => r);
  return {
    tc: x.tc,
    n: `${x.town}民代表會`,
    city: x.city,
    term: own?.term || 0,
    reps: (x.reps || []).length,
    people,
    sessions: sessions.slice(0, 3).map(s => ({ n: s.n, from: s.from || '', to: s.to || '', props: s.props || 0, res: s.res || 0, asks: s.asks || 0, wq: s.wq || 0 })),
    rows: picked.map((r, i) => ({ id: `tw:${x.tc}:${i + 1}`, ...r, t: cut(r.t, LOCAL_LIMITS.rowChars), r: cut(r.r, 80) }))
  };
}

// { councils, towns } for a question (empty when it names none); each read only when asked.
export async function localFor(text, { terms = [], cities = [], read = readData, get = apiJson, ground = readGround } = {}) {
  if (!asksLocal(text)) return { councils: [], towns: [] };
  const [idx, reps] = await Promise.all([ground('council/index.json'), ground('council/reps.json')]);
  const { councils, towns } = placesIn(text, idx, reps, cities);
  if (!councils.length && !towns.length) return { councils: [], towns: [] };
  const words = searchWords(text, terms);
  const [cs, ts] = await Promise.all([Promise.all(councils.map(c => councilFor(c, text, words, { read, get }))), Promise.all(towns.map(x => townFor(x, text, words, { read })))]);
  return { councils: cs, towns: ts };
}

export const hasLocal = l => Boolean(l && (l.councils.length || l.towns.length));
export const localKey = l => (hasLocal(l) ? [...l.councils.flatMap(c => [c.c, ...c.bills.map(b => b.id), ...(c.talks || []).map(x => x.id)]), ...l.towns.flatMap(t => [t.tc, ...t.rows.map(r => `${r.s}${r.no}${r.t.slice(0, 12)}`)])].join('|') : '');
// The ids an answer may cite: each bill and row given.
export const localCites = l => (hasLocal(l) ? [...l.councils.flatMap(c => [...c.bills.map(b => `cc:${b.id}`), ...(c.talks || []).map(x => `cq:${x.id}`)]), ...l.towns.flatMap(t => t.rows.map(r => r.id))] : []);

const span = (a, b) => [a, b].filter(Boolean).join('–');
export function localPrompt(l) {
  if (!hasLocal(l)) return '';
  const blocks = [];
  for (const c of l.councils) {
    const state = c.on ? `開會中：${c.on.n}（${span(c.on.from, c.on.to)}）` : c.next ? `下次開會：${c.next.n}（${span(c.next.from, c.next.to)}）` : c.last ? `上次開會：${c.last.n}（${span(c.last.from, c.last.to)}）` : '';
    const lines = [`${c.n}（第 ${c.term} 屆${c.seats ? `，${c.seats} 席` : ''}${c.head ? `，議長 ${c.head}` : ''}${c.deputy ? `，副議長 ${c.deputy}` : ''}）${state ? `；${state}` : ''}`];
    for (const p of c.people) lines.push(`- 議員 ${p.n}（${p.party || '無黨籍'}，${p.area}）：本屆提案 ${p.bills} 件`);
    for (const b of c.bills) lines.push(`[cite "cc:${b.id}"] ${[b.no, b.cat, b.d].filter(Boolean).join('，')}${b.by ? `，提案：${b.by}` : ''}\n案由：${b.t}${b.res ? `\n議決：${b.res}` : ''}`);
    if (!c.bills.length) lines.push('（這屆的提案中沒有找到與問題相關的）');
    for (const x of c.talks || []) lines.push(`[cite "cq:${x.id}"] ${x.d}，議員 ${x.who} 在議會發言（速記錄節錄）：${x.t}`);
    blocks.push(lines.join('\n'));
  }
  for (const t of l.towns) {
    const lines = [`${t.city}${t.n}（第 ${t.term || '?'} 屆，${t.reps} 位代表）`];
    for (const p of t.people) lines.push(`- 代表 ${p.n}（${p.party || '無黨籍'}，${p.area}）`);
    for (const s of t.sessions) lines.push(`- ${s.n}（${span(s.from, s.to)}）${[s.props && `提案 ${s.props} 案`, s.res && `決議案 ${s.res} 案`, s.asks && `質詢 ${s.asks} 次`, s.wq && `書面質詢 ${s.wq} 件`].filter(Boolean).join('、')}`);
    for (const r of t.rows) lines.push(`[cite "${r.id}"] ${r.s} ${r.k}${r.no ? ` ${r.no}` : ''}${r.by ? `，${r.by}` : ''}${r.d ? `，${r.d}` : ''}\n${r.k.includes('質詢') ? '問' : '案由'}：${r.t}${r.r ? `\n${r.k.includes('質詢') ? '答' : '議決'}：${r.r}` : ''}`);
    if (!t.rows.length) lines.push('（這個代表會的議事錄還沒有可讀的內容）');
    blocks.push(lines.join('\n'));
  }
  return `地方議會與代表會 (what Orbit Law shows of the councils the reader named: their bills, councillors' words in sittings and minutes as published; cite a bill or row by its id in quotes; say a council's own decision is not a law):\n${blocks.join('\n\n')}\n\n`;
}

// What the answer carries: links into the app (a council bill opens its sheet; a 代表會 opens its page).
export function localOut(l) {
  if (!hasLocal(l)) return {};
  return {
    local: {
      councils: l.councils.map(c => ({ c: c.c, n: c.n, people: c.people.map(p => ({ id: p.id, n: p.n })), bills: c.bills.map(b => ({ id: b.id, t: cut(b.t, 80), by: b.by, res: cut(b.res, 20), d: b.d })), talks: (c.talks || []).map(x => ({ id: x.id, who: x.who, d: x.d, t: cut(x.t, 80) })) })),
      towns: l.towns.map(t => ({ tc: t.tc, n: t.n, rows: t.rows.map(r => ({ id: r.id, k: r.k, s: r.s, t: cut(r.t, 80), by: r.by, r: cut(r.r, 20) })) }))
    }
  };
}
