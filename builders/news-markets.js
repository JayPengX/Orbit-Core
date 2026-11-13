// 預測市場 (Jay 11-12: "link news to prediction market … if 黃仁勳 will
// still be CEO when news is suggesting he may be investigated, or polls of
// election"): Polymarket's open markets on the questions Orbit News'
// stories are about, each beside its story. Code finds the candidates (a
// market's names and its question's words, in English or as Taiwan's press
// writes them in Chinese); the AI only confirms each pair (a wrong match is
// worse than none: news-markets in ai-features.js) and words the question
// in both languages; every number is Polymarket's own price. Read-only:
// Polymarket's public Gamma API (no key), never a trade or a link to one.
// Run on its own even minutes (run.js SLOTS 'markets', every 30 minutes).
//
// news/markets.json: { built, stories: { id: [{ e, slug, zh, en,
//   kind: 'yes' | 'dates' | 'pick', one?, rows: [{ p, d, en?, zh?, md?, who? }] }] } }
// p a chance (0–1), d its move in a day (−1–1), md a deadline (M/D or Y/M/D);
// one: the options exclude each other (their chances add to 100%).
// Its memory (each pair's answer, each market's words): private/news/markets.json.
import { aiOnce } from '../ai.js';
import { NEWS_PATH } from './news.js';

export const MARKETS_PATH = 'news/markets.json';
const MEMORY = 'private/news/markets.v4.json';
// The words' version: a market worded under an older prompt is worded again,
// its old words shown until then (never a page emptied by a prompt change).
// 2: a person's name as written in English unless the headlines write it in Chinese (Jay 11-13);
// 3: Taiwan's candidates by their own Chinese names, a question's unknown person kept in English.
export const WORDS_V = 3;
// AI calls a run (each batch can take a few of the Worker's 50 subrequests; the rest wait for the next run).
const CALLS = 4;
const LINES = 'news/lines.json';
const GAMMA = 'https://gamma-api.polymarket.com/events';
// Polymarket's sections whose markets stories can be about (50 each, busiest first).
export const TAGS = ['politics', 'geopolitics', 'world', 'elections', 'taiwan', 'china', 'tech', 'business', 'economy'];
// Markets no story is about: games, coins, weather, counts of posts, who says or hugs what.
const SKIP_TAGS = /^(sports|esports|games|crypto|crypto prices|hit price|up or down|weather|daily temperature|tweet markets|mention markets|mentions|recurring|pre-market|fdv|airdrops|token launch|movies|music|awards)$/i;
const SKIP_TITLE = /#|\b(tweets?|posts?|shake hands|hug|kiss|say|says|said|mention|insult|wear|attend|odds)\b/i;
// A market few trade says little: under US$10,000 traded, left out.
export const MIN_VOL = 10_000;
// The stories looked at: each region's first 100, of the topics a market can be about.
const TOP = 100;
const TOPICS = new Set(['pol', 'cs', 'world', 'def', 'eco', 'tech', 'law', 'energy', 'soc']);
export const MOST = 2; // markets a story
const BATCH = 6;
const AGAIN = 12 * 3_600_000; // a pair asked again once its story's coverage doubled and this passed

// Taiwan's election days: from ten days before the vote until the polls
// close no poll may be published or cited (公職人員選舉罷免法 §53), so a
// market on a Taiwan vote is left out then (Polymarket's chances are not a
// poll, but the line isn't ours to test).
export const TW_VOTES = ['2026-11-28'];
const TW_VOTE = /\b(elections?|mayor|mayoral|magistrate|referendum|recall|races?)\b/i;
export function quiet(ev, now = Date.now()) {
  const about = `${ev.title} ${(ev.tags || []).join(' ')}`;
  if (!/taiwan/i.test(about) || !TW_VOTE.test(about)) return false;
  return TW_VOTES.some(day => now >= Date.parse(`${day}T00:00:00+08:00`) - 10 * 86_400_000 && now < Date.parse(`${day}T16:00:00+08:00`));
}

const arrOf = v => {
  if (Array.isArray(v)) return v;
  try {
    const a = JSON.parse(v);
    return Array.isArray(a) ? a : [];
  } catch {
    return [];
  }
};

// An event as kept: its question, tags, and each open Yes/No market's price.
export function trimEvent(e, now = Date.now()) {
  if (!e || e.closed || e.active === false || !Array.isArray(e.markets) || !e.title) return null;
  const tags = (e.tags || []).map(t => String(t?.label || '').trim()).filter(Boolean);
  if (tags.some(t => SKIP_TAGS.test(t)) || SKIP_TITLE.test(e.title)) return null;
  if ((Number(e.volume) || 0) < MIN_VOL) return null;
  const markets = [];
  // (The options already settled: "Not resigned/removed; …" closed tells the question's first half is decided.)
  const gone = [];
  for (const m of e.markets) {
    if (m?.closed && m.groupItemTitle) gone.push(String(m.groupItemTitle).trim());
    if (!m || m.closed || m.active === false) continue;
    const outs = arrOf(m.outcomes);
    const p = Number(arrOf(m.outcomePrices)[0]);
    if (outs[0] !== 'Yes' || !(p >= 0 && p <= 1)) continue;
    const end = Date.parse(m.endDate || '') || 0;
    if (end && end < now - 86_400_000) continue;
    markets.push({ label: String(m.groupItemTitle || '').trim(), p, d: Number(m.oneDayPriceChange) || 0, end });
  }
  if (!markets.length) return null;
  // (What it resolves on: the threshold, the side that counts, the deadline. negRisk: its options exclude each other.)
  return { id: String(e.id), slug: String(e.slug || ''), title: String(e.title).trim(), about: String(e.description || '').replace(/\s+/g, ' ').slice(0, 600), tags, vol: Number(e.volume) || 0, one: e.negRisk === true, gone: gone.slice(0, 6), markets };
}

export async function readEvents(fetchImpl = fetch, now = Date.now()) {
  const byId = new Map();
  for (const tag of TAGS) {
    const res = await fetchImpl(`${GAMMA}?closed=false&active=true&limit=50&order=volume24hr&ascending=false&tag_slug=${tag}`, { headers: { accept: 'application/json' } });
    // (A failed read is a failure: the last page stays, never one missing a section's markets.)
    if (!res.ok) throw new Error(`polymarket ${tag} ${res.status}`);
    for (const e of await res.json()) {
      const t = trimEvent(e, now);
      if (t) byId.set(t.id, t);
    }
  }
  return [...byId.values()];
}

// ---- What a market is about, in English and as Taiwan's press writes it ----
// Names (people, places, bodies, firms): `w` 1 for a name in a great many
// stories (a country, Trump), else 2. Chinese as Taiwan's outlets write it.
export const NAMES = {
  'jensen huang': ['黃仁勳'], nvidia: ['輝達', 'nvidia'], tsmc: ['台積電', '臺積電'], 'morris chang': ['張忠謀'], 'c.c. wei': ['魏哲家'],
  apple: ['蘋果'], tesla: ['特斯拉'], 'elon musk': ['馬斯克'], musk: ['馬斯克'], openai: ['openai'], anthropic: ['anthropic'], 'sam altman': ['奧特曼', '阿特曼'], google: ['谷歌', 'google'], microsoft: ['微軟'], meta: ['meta'], intel: ['英特爾'], amazon: ['亞馬遜'], spacex: ['spacex'],
  'lai ching-te': ['賴清德', '賴總統'], 'cho jung-tai': ['卓榮泰'], 'hsiao bi-khim': ['蕭美琴'], 'ko wen-je': ['柯文哲'], 'huang kuo-chang': ['黃國昌'], 'cheng li-wun': ['鄭麗文'], 'chiang wan-an': ['蔣萬安'], 'lu shiow-yen': ['盧秀燕'], 'tsai ing-wen': ['蔡英文'], 'han kuo-yu': ['韓國瑜'],
  kmt: ['國民黨', '藍營'], dpp: ['民進黨', '綠營'], tpp: ['民眾黨'], 'legislative yuan': ['立法院', '立院'],
  taipei: ['台北', '臺北'], 'new taipei': ['新北'], taoyuan: ['桃園'], taichung: ['台中', '臺中'], tainan: ['台南', '臺南'], kaohsiung: ['高雄'], keelung: ['基隆'], 'hsinchu city': ['新竹市', '竹市'], 'hsinchu county': ['新竹縣', '竹縣'],
  miaoli: ['苗栗'], changhua: ['彰化'], nantou: ['南投'], yunlin: ['雲林'], 'chiayi city': ['嘉義市'], 'chiayi county': ['嘉義縣'], pingtung: ['屏東'], yilan: ['宜蘭'], hualien: ['花蓮'], taitung: ['台東', '臺東'], penghu: ['澎湖'], kinmen: ['金門'], lienchiang: ['連江', '馬祖'],
  'xi jinping': ['習近平'], xi: ['習近平'], 'hu jintao': ['胡錦濤'], 'li qiang': ['李強'], 'hong kong': ['香港'], 'jimmy lai': ['黎智英'], pla: ['解放軍', '共軍'],
  trump: ['川普'], vance: ['范斯', '萬斯'], hegseth: ['赫格塞斯', '赫塞斯'], rubio: ['盧比歐'], bessent: ['貝森特'], 'kevin warsh': ['華許'], powell: ['鮑爾'], fed: ['聯準會', 'fed'], fomc: ['聯準會'], schumer: ['舒默'], epstein: ['艾普斯坦', '愛潑斯坦'], newsom: ['紐森'], 'aoc': ['寇蒂茲'],
  putin: ['普丁', '蒲亭'], zelensky: ['澤倫斯基'], zelenskyy: ['澤倫斯基'], netanyahu: ['內唐亞胡', '納坦雅胡', '尼坦雅胡'], khamenei: ['哈米尼'], 'reza pahlavi': ['巴勒維'], hezbollah: ['真主黨'], hamas: ['哈瑪斯'], gaza: ['加薩'], 'strait of hormuz': ['荷莫茲', '霍爾木茲'], hormuz: ['荷莫茲', '霍爾木茲'],
  takaichi: ['高市早苗', '高市'], 'lee jae-myung': ['李在明'], starmer: ['施凱爾', '斯塔默'], macron: ['馬克宏'], modi: ['莫迪'], 'pope leo': ['教宗'], maduro: ['馬杜洛'], milei: ['米雷伊'], lula: ['魯拉'],
  apec: ['apec', 'APEC'], nato: ['北約'], 'united nations': ['聯合國'], wto: ['世貿'], opec: ['石油輸出國'],
  china: ['中國', '中共', '大陸'], taiwan: ['台灣', '臺灣'], 'united states': ['美國'], us: ['美國'], iran: ['伊朗'], israel: ['以色列'], russia: ['俄羅斯', '俄國', '俄'], ukraine: ['烏克蘭', '烏'], japan: ['日本'], 'south korea': ['南韓', '韓國'], 'north korea': ['北韓'], philippines: ['菲律賓'], india: ['印度'],
  france: ['法國'], germany: ['德國'], 'united kingdom': ['英國'], uk: ['英國'], spain: ['西班牙'], italy: ['義大利'], venezuela: ['委內瑞拉'], lebanon: ['黎巴嫩'], syria: ['敘利亞'], lithuania: ['立陶宛'], sweden: ['瑞典'], 'new zealand': ['紐西蘭'], indonesia: ['印尼'], mexico: ['墨西哥'], canada: ['加拿大'], brazil: ['巴西']
};
// Names in a great many stories: they count, but alone never make a match.
const BROAD = new Set(['china', 'taiwan', 'united states', 'us', 'trump', 'iran', 'israel', 'russia', 'ukraine', 'japan', 'south korea', 'north korea', 'india', 'france', 'germany', 'united kingdom', 'uk', 'kmt', 'dpp', 'tpp', 'fed', 'fomc', 'xi', 'pla', 'apple', 'google', 'meta', 'amazon', 'microsoft', 'nato', 'united nations', 'philippines']);
// What the question is about, each in English (the market's and a world story's words) and Chinese.
export const CONCEPTS = [
  ['out', /\b(resign\w*|remov\w*|out as|ousted|oust|step(s|ped)? down|replac\w*|fired?|leave|leaves|exit)\b/i, /辭職|請辭|下台|下臺|卸任|撤換|去留|罷免|撤職|開除|離職|交棒|接班/],
  ['ceo', /\b(ceo|chief executive|board)\b/i, /執行長|董事會|總裁/],
  ['ceasefire', /\b(cease-?fire|truce|peace|armistice)\b/i, /停火|停戰|和平|和談|休戰/],
  ['deal', /\b(deal|agreement|accord|treaty)\b/i, /協議|協定|條約|談判|達成/],
  ['invade', /\b(invad\w*|invasion|blockade|military clash|clash|war|strikes?|attack\w*)\b/i, /入侵|侵略|攻台|侵台|武統|封鎖|衝突|交火|開戰|戰爭|空襲|襲擊|攻擊|軍演/],
  ['impeach', /\b(impeach\w*|recall\w*|no-confidence)\b/i, /彈劾|罷免|不信任/],
  ['vote', /\b(elections?|electoral|mayor\w*|magistrate|nominee|primary|runoff|votes?|wins?|winner|polls?|senate|governor|president(ial)?|prime minister|chancellor|speaker|leader)\b/i, /選舉|大選|選戰|當選|勝選|參選|提名|民調|初選|市長|縣長|總統|總理|首相|議長|黨魁|主席/],
  ['ipo', /\b(ipo|listing|valuation|market cap)\b/i, /ipo|上市|估值|市值/i],
  ['rates', /\b(rates?|rate cut|hike|fomc|interest)\b/i, /利率|降息|升息|聯準會/],
  ['tariff', /\b(tariffs?|trade war|sanction\w*|export controls?)\b/i, /關稅|貿易戰|制裁|出口管制|禁令/],
  ['law', /\b(arrest\w*|charg\w*|indict\w*|convict\w*|sentenc\w*|prison|jail|investigat\w*|probe|released?|freed)\b/i, /逮捕|被捕|起訴|定罪|判刑|入獄|調查|偵辦|釋放|獲釋|涉嫌|醜聞/],
  ['meet', /\b(meet\w*|summit|talks?|visit\w*)\b/i, /會面|會晤|峰會|會談|訪問|出訪|過境|會見/],
  ['nuclear', /\bnuclear\b/i, /核武|核協議|核談|核設施/],
  ['economy', /\b(gdp|recession|inflation|cpi|unemployment|jobs)\b/i, /經濟成長|衰退|通膨|物價|失業/]
];

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTHS_LONG = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// (An English name as a whole word: 'us' never inside "focus", 'xi' never in "taxi".)
const enRe = new Map();
const enHas = (text, name) => {
  let re = enRe.get(name);
  if (!re) enRe.set(name, (re = new RegExp(`(^|[^a-z0-9])${esc(name)}(?![a-z0-9])`, 'i')));
  return re.test(text);
};
// The US as the question writes it (U.S., USA).
const usOf = t => t.replace(/\bU\.S\.A?\.?|\bUSA\b|\bUS\b/g, ' us ');

// The capitals in a question that start it or ask it, never a name.
const ASKS = new Set(['will', 'who', 'what', 'which', 'when', 'where', 'how', 'next', 'the', 'largest', 'best', 'highest', 'top', 'second', 'third', 'new', 'final', 'senior', 'mayor', 'mayoral', 'election', 'elections', 'winner', 'president', 'presidential', 'prime', 'minister', 'secretary', 'defense', 'party', 'general', 'county', 'city', 'magistrate', 'nominee', 'senate', 'house', 'ceo', 'combo', 'margin', 'victory', 'local', 'military', 'clash', 'ceasefire', 'agreement', 'deal', 'by', 'before', 'end', 'of', 'in', 'out', 'and', 'or', 'x', 'vs', 'leader', 'minority', 'majority', 'democratic', 'republican', 'governor', 'legislative', 'chinese', 'american', 'taiwanese', 'russian', 'israeli', 'iranian', 'european', 'ipo', 'ai', 'fed', 'gdp', 'cpi', 'q1', 'q2', 'q3', 'q4', 'list', 'companies', 'company', 'decision', 'rate', 'rates', 'tariff', 'nuclear', 'energy', 'effective', 'begins', 'announced', 'resignation', 'removal', 'arrested', 'impeached', 'charged', 'federally', 'released', 'visits', 'meet', 'meets', 'summit', 'monthly', 'annual', 'inflation', 'pp', 'vox', 'first', 'fourth', 'fifth', 'another'].concat(MONTHS_LONG));
// An event's names (those its question names, and the sharp ones its tags
// add), what it asks (the first concept is the question's own), and the
// capitalised names no table knows (an English story must name them too).
export function aboutEvent(ev) {
  const title = usOf(ev.title);
  const tags = usOf(ev.tags.join(' · '));
  const inTitle = Object.keys(NAMES).filter(n => enHas(title, n));
  const inTags = Object.keys(NAMES).filter(n => !BROAD.has(n) && enHas(tags, n));
  const names = [...new Set([...inTitle, ...inTags])];
  // (A longer name holds the shorter: Xi Jinping, not Xi too; New Taipei, not Taipei.)
  const kept = names.filter(n => !names.some(m => m !== n && m.length > n.length && enHas(m, n)));
  const concepts = CONCEPTS.filter(([, en]) => en.test(ev.title)).map(([k]) => k);
  const known = kept.join(' ');
  const unknown = [...ev.title.matchAll(/\b[A-Z][a-z][\w'-]+/g)].map(m => m[0]).filter(w => !ASKS.has(w.toLowerCase()) && !enHas(known, w.toLowerCase()) && !Object.keys(NAMES).some(n => enHas(n, w.toLowerCase())));
  return { names: kept, must: inTitle.filter(n => kept.includes(n) && !BROAD.has(n)), concepts, unknown };
}

// A story's text: its title (with the AI's in the other language) and each outlet's headline, both ways.
const both = t => ({ en: usOf(t), zh: t });
export function storyText(s, line) {
  const heads = (s.items || []).map(it => both(String(it[1] || '')));
  return { title: both([s.title, line?.en, line?.zh].filter(Boolean).join(' \n ')), heads, cjk: /[一-鿿]/.test(s.title) };
}
const nameAt = (t, n) => enHas(t.en, n) || (NAMES[n] || []).some(z => /[一-鿿]/.test(z) && t.zh.includes(z));
const conceptAt = (t, k) => {
  const c = CONCEPTS.find(x => x[0] === k);
  return !!c && (c[1].test(t.en) || c[2].test(t.zh));
};
// What the story is about: in its title, or in a good share of its headlines (a long story's stray one doesn't count).
const strong = (text, at, share) => at(text.title) || (text.heads.length > 0 && text.heads.filter(at).length / text.heads.length >= share);

// How well an event fits a story, 0 when it can't: the question's own
// names all in the story, what it asks too, and a name past the broad ones
// with one thing more, or two broad names. The AI confirms what passes.
export function fitOf(text, about) {
  const names = about.names.filter(n => strong(text, t => nameAt(t, n), 1 / 3));
  // (The question's own sharp names in the story's title: a story of 苗栗's debate that names 台中 inside isn't 台中's race.)
  if (about.must.some(n => !nameAt(text.title, n))) return 0;
  // (A name no table knows, in an English story's words: "Alice Huang" isn't Jensen Huang.)
  if (!text.cjk && about.unknown.some(w => !strong(text, t => enHas(t.en, w.toLowerCase()), 1 / 4))) return 0;
  const asks = about.concepts[0];
  if (asks && !strong(text, t => conceptAt(t, asks), 1 / 4)) return 0;
  const concepts = about.concepts.filter(k => strong(text, t => conceptAt(t, k), 1 / 4)).length;
  const broad = names.filter(n => BROAD.has(n)).length;
  const sharp = names.length - broad;
  const ok = (sharp >= 1 && sharp + broad + concepts >= 2) || (broad >= 2 && concepts >= 1);
  return ok ? sharp * 2 + broad + concepts : 0;
}

// Each story's candidates: its best two events, by fit then money traded.
export function candidates(stories, events, lines = {}) {
  const abouts = events.map(ev => [ev, aboutEvent(ev)]).filter(([, a]) => a.names.length);
  const out = [];
  for (const s of stories) {
    const text = storyText(s, lines[s.id]);
    const fits = [];
    for (const [ev, a] of abouts) {
      const score = fitOf(text, a);
      if (score) fits.push({ ev, score });
    }
    fits.sort((x, y) => y.score - x.score || y.ev.vol - x.ev.vol);
    for (const f of fits.slice(0, 2)) out.push({ s, ev: f.ev, score: f.score });
  }
  return out;
}

// ---- What a story shows ----
// A deadline's label (December 31, March 31, 2027) as M/D (or Y/M/D past this year), null if it isn't one.
export function deadline(label, now = Date.now()) {
  const m = String(label || '').match(/^(?:by\s+)?([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:,?\s+(\d{4}))?$/i);
  const mo = m ? MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()) + 1 : 0;
  if (!mo || +m[2] < 1 || +m[2] > 31) return null;
  const year = new Date(now + 8 * 3_600_000).getUTCFullYear();
  return m[3] && +m[3] !== year ? `${m[3]}/${mo}/${+m[2]}` : `${mo}/${+m[2]}`;
}
// Party names as Taiwan writes them (an outcome that's a party).
const PARTIES = { KMT: '國民黨', DPP: '民進黨', TPP: '民眾黨', Republicans: '共和黨', Republican: '共和黨', Democrats: '民主黨', Democratic: '民主黨', Labour: '工黨', Conservatives: '保守黨', Other: '其他', Independent: '無黨籍' };
const round = (x, n = 3) => Math.round(x * 10 ** n) / 10 ** n;

// An outcome's name both ways: "X (No Change)" says no change (it was cut
// at a phone's width), else the AI's short labels, a party as Taiwan writes
// it, or the option as written (a part every option shares left out:
// "Resigned/removed; Over $4T" beside "…; Under $4T" is Over $4T).
export function labelOf(label, labels = {}, short = label) {
  if (/\(no change\)$/i.test(label)) return { en: 'No change', zh: '不換人' };
  const l = labels?.[label] || {};
  // (A person: the name as the market writes it, in Chinese only as the story's headlines do.)
  if (l.who) return { en: short, ...(l.zh ? { zh: l.zh } : {}), who: 1 };
  const zh = l.zh || PARTIES[label];
  const en = l.en || short;
  return zh ? { en, zh } : { en };
}
// What tells the options apart: the parts ("; ") all of them share left out.
export function shortLabels(labels) {
  const parts = labels.map(l => l.split(/\s*;\s*/));
  const n = parts[0]?.length || 0;
  if (n < 2 || parts.some(p => p.length !== n)) return labels;
  const keep = [...Array(n).keys()].filter(i => parts.some(p => p[i] !== parts[0][i]));
  return keep.length ? parts.map(p => keep.map(i => p[i]).join('; ')) : labels;
}
// The event as a story shows it: one chance; chances by deadline; or the leading outcomes.
export function shownEvent(ev, words, now = Date.now()) {
  const ms = ev.markets;
  const base = { e: ev.id, slug: ev.slug, zh: words.zh, en: words.en };
  if (ms.length === 1) return { ...base, kind: 'yes', rows: [{ p: round(ms[0].p), d: round(ms[0].d) }] };
  const dates = ms.map(m => deadline(m.label, now));
  if (dates.every(Boolean))
    return {
      ...base,
      kind: 'dates',
      rows: ms
        .map((m, i) => ({ md: dates[i], en: m.label, p: round(m.p), d: round(m.d), end: m.end }))
        .sort((a, b) => a.end - b.end)
        .slice(0, 4)
        .map(({ end, ...r }) => r)
    };
  const picked = [...ms]
    .filter(m => m.label && m.p >= 0.005)
    .sort((a, b) => b.p - a.p)
    .slice(0, 4);
  const short = shortLabels(picked.map(m => m.label));
  // (Options that exclude each other are chances that add to 100%: each price
  // over all of theirs, never 56% beside 45%. The page then rounds them to 100.)
  const sum = ms.reduce((a, m) => a + m.p, 0);
  const one = ev.one && sum > 0.9 && sum < 1.1;
  let rows = picked.map((m, i) => ({ ...labelOf(m.label, words.labels, short[i]), p: round(one ? m.p / sum : m.p), d: round(m.d) }));
  // (A person without a Chinese name the headlines use keeps theirs in English, Jay 11-13; any
  // other row without Chinese turns the whole card to the options as written, never half-translated.)
  if (rows.some(r => !r.zh && !r.who)) rows = rows.map(({ zh, ...r }) => r);
  rows = rows.map(({ who, ...r }) => r);
  return rows.length ? { ...base, kind: 'pick', ...(one ? { one: 1 } : {}), rows } : null;
}
// How the card shows it (the AI words the question to fit): one chance, a ladder of deadlines, or options.
export const kindOf = ev => (ev.markets.length === 1 ? 'yes' : ev.markets.every(m => deadline(m.label)) ? 'dates' : 'pick');
// The day it's settled by, as the market's US Eastern clock reads it (a deadline of 11:59 PM ET, never Taiwan's next morning).
export function endsOf(ev) {
  const end = Math.max(0, ...ev.markets.map(m => m.end || 0));
  return end ? new Date(end - 5 * 3_600_000).toISOString().slice(0, 10) : '';
}
// The outcomes the AI is asked to label (a pick's leading four).
export const optionsOf = ev => (ev.markets.length > 1 && !ev.markets.every(m => deadline(m.label)) ? [...ev.markets].filter(m => m.label).sort((a, b) => b.p - a.p).slice(0, 4).map(m => m.label) : []);

// A pair as the AI is told it: the story's headlines (an outlet once, five at most) and the market's question.
export function pairFacts({ s, ev }, line) {
  const seen = new Set();
  const heads = [];
  for (const [outlet, title] of s.items || []) {
    if (seen.has(outlet) || heads.length >= 5) continue;
    seen.add(outlet);
    heads.push(String(title).slice(0, 100));
  }
  if (line?.en && s.region !== 'intl') heads.push(String(line.en).slice(0, 100));
  const kind = kindOf(ev);
  const market = { q: ev.title, about: ev.about, kind, options: optionsOf(ev) };
  // (A person no table knows keeps the name as the market writes it: Alice Huang, never a guessed 黃樂. Jay 11-13.)
  const unknown = aboutEvent(ev).unknown;
  const keep = [...new Set([...ev.title.matchAll(/\b[A-Z][a-z'-]+(?: [A-Z][a-z'-]+){1,2}\b/g)].map(m => m[0]).filter(n => unknown.includes(n.split(' ')[0]) && !NAMES[n.toLowerCase()]))];
  if (keep.length) market.keep = keep;
  // (Taiwan's own races: each candidate by their own Chinese name.)
  if (ev.tags.some(t => /taiwan/i.test(t))) market.tw = true;
  if (kind !== 'dates' && endsOf(ev)) market.ends = endsOf(ev);
  if (ev.gone?.length && kind === 'pick') market.settled = ev.gone;
  return { k: `${s.id}|${ev.id}`, story: heads, market };
}

export async function runNewsMarkets({ store, env, ctx = null, cap = async () => 0, now = Date.now(), fetchImpl = fetch, until = now + 4 * 60_000 }) {
  const index = await store.json(NEWS_PATH);
  if (!index?.tw) return { skipped: 'no stories' };
  const lines = (await store.json(LINES).catch(() => null))?.lines || {};
  const events = (await readEvents(fetchImpl, now)).filter(ev => !quiet(ev, now));
  const stories = ['tw', 'intl'].flatMap(r => (index[r] || []).slice(0, TOP).filter(s => (s.topics || []).some(t => TOPICS.has(t))).map(s => ({ ...s, region: r })));
  const found = candidates(stories, events, lines);
  const mem = (await store.json(MEMORY).catch(() => null)) || {};
  const pairs = mem.pairs || {};
  const words = mem.words || {};
  // Asked: a pair never asked, or whose story's coverage doubled since (12 hours on).
  const need = found.filter(({ s, ev }) => {
    const was = pairs[`${s.id}|${ev.id}`];
    return !was || ((s.m || 0) >= 2 * (was.m || 0) && now - (was.at || 0) > AGAIN) || (was.ok && words[ev.id]?.v !== WORDS_V);
  });
  let calls = 0, asked = 0;
  const missed = [];
  const c = await cap('news-markets');
  // (Never-asked pairs first, then the ones only re-worded.)
  need.sort((a, b) => !!pairs[`${a.s.id}|${a.ev.id}`] - !!pairs[`${b.s.id}|${b.ev.id}`]);
  for (let i = 0; i < need.length && calls < CALLS && Date.now() < until; i += BATCH) {
    const batch = need.slice(i, i + BATCH);
    const r = await aiOnce(env, ctx, 'news-markets', { pairs: batch.map(x => pairFacts(x, lines[x.s.id])) }, c);
    calls++;
    if (!r) break;
    if (r.error) {
      missed.push(r.error);
      continue;
    }
    for (const x of batch) {
      const k = `${x.s.id}|${x.ev.id}`;
      const a = r.out?.[k];
      if (!a) continue;
      asked++;
      pairs[k] = { ok: a.ok ? 1 : 0, m: x.s.m || 0, at: now };
      if (a.ok) words[x.ev.id] = { zh: a.zh, en: a.en, labels: words[x.ev.id]?.v === WORDS_V ? { ...words[x.ev.id].labels, ...a.labels } : a.labels, v: WORDS_V };
    }
  }
  // The page: each story's confirmed markets, best fit first, at today's prices.
  const out = {};
  for (const { s, ev } of found) {
    const k = `${s.id}|${ev.id}`;
    if (!pairs[k]?.ok || !words[ev.id] || (out[s.id]?.length || 0) >= MOST) continue;
    const shown = shownEvent(ev, words[ev.id], now);
    if (shown) (out[s.id] ||= []).push(shown);
  }
  // (Memory of stories still on the front only; a market's words while it's open.)
  const live = new Set(stories.map(s => s.id));
  const open = new Set(events.map(ev => ev.id));
  for (const k of Object.keys(pairs)) if (!live.has(k.split('|')[0])) delete pairs[k];
  for (const id of Object.keys(words)) if (!open.has(id)) delete words[id];
  await store.put(MEMORY, { pairs, words });
  await store.put(MARKETS_PATH, { built: now, stories: out });
  return { events: events.length, candidates: found.length, asked, calls, stories: Object.keys(out).length, ...(missed.length ? { missed: missed.slice(0, 4) } : {}) };
}
