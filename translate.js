// Plain translation, off the AI (Jay 11-13: "a full Traditional Chinese
// experience and a full English experience"; "using AI for translation is
// costly"). Only for text the AI never writes: an outlet's own headline or
// summary. What the AI writes (titles, 重點整理, 各方怎麼說) it writes in the
// reader's language itself, never run through here (no double translation).
//
// Google Cloud Translation (Basic, v2) on the server key, free for 500,000
// characters a month and billed past them: a hard month's cap under that
// (TR_MONTH), spread over the days left (dayLeft), counted in R2
// (private/tr-meter.json; no KV). Each text is translated once and kept by
// its caller. A provider is a function, so another (Azure's free 2M) can
// join the list when a key is set.
//
// Names (Jay 11-13): a foreign person's name stays in English, never a
// guessed Chinese one; a well-known one Taiwan writes one way (川普, 黃仁勳,
// 賴清德) is written that way (KNOWN).

export const TR_MONTH = 480_000;
export const TR_METER = 'private/tr-meter.json';
export const googleKey = env => env.GOOGLE_TRANSLATE_KEY || env.GOOGLE_WEATHER_KEY || '';

// ---- The meter: this month's characters, a day's share of what's left ----
const twMonth = now => new Date(now + 8 * 3_600_000).toISOString().slice(0, 7);
const twDayOf = now => new Date(now + 8 * 3_600_000).toISOString().slice(0, 10);
export function freshMeter(m, now = Date.now()) {
  const month = twMonth(now);
  const day = twDayOf(now);
  const base = m && m.month === month ? { ...m } : { month, chars: 0, n: 0, fail: 0 };
  if (base.day !== day) Object.assign(base, { day, today: 0 });
  return base;
}
// What today may still spend: twice the month's rest over its days left
// (today one of them): a day of catching up (every headline at once) can
// run, and each day after is a share of what's left, so the month's end is
// never without.
export function dayLeft(m, now = Date.now(), cap = TR_MONTH) {
  const d = new Date(now + 8 * 3_600_000);
  const days = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate() - d.getUTCDate() + 1;
  const rest = Math.max(0, cap - (m.chars - (m.today || 0)));
  return Math.max(0, Math.min(cap - m.chars, Math.floor((2 * rest) / days) - (m.today || 0)));
}
export async function readMeter(store, now = Date.now()) {
  return freshMeter(await store.json(TR_METER).catch(() => null), now);
}

// ---- Names ----
// Well-known people Taiwan writes in Chinese, as Taiwan writes them (an
// English name a source gives → its Chinese). Everyone else stays English.
export const KNOWN = {
  'Donald Trump': '川普', Trump: '川普', 'Joe Biden': '拜登', Biden: '拜登', 'Barack Obama': '歐巴馬', Obama: '歐巴馬', 'Kamala Harris': '賀錦麗',
  'JD Vance': '范斯', 'J.D. Vance': '范斯', Vance: '范斯', 'Marco Rubio': '盧比歐', Rubio: '盧比歐', 'Elon Musk': '馬斯克', Musk: '馬斯克',
  'Xi Jinping': '習近平', Xi: '習近平', 'Li Qiang': '李強', 'Wang Yi': '王毅', 'Vladimir Putin': '普丁', Putin: '普丁',
  'Volodymyr Zelensky': '澤倫斯基', 'Volodymyr Zelenskyy': '澤倫斯基', Zelensky: '澤倫斯基', Zelenskyy: '澤倫斯基',
  'Benjamin Netanyahu': '納坦雅胡', Netanyahu: '納坦雅胡', 'Kim Jong Un': '金正恩', 'Kim Jong-un': '金正恩', 'Narendra Modi': '莫迪', Modi: '莫迪',
  'Emmanuel Macron': '馬克宏', Macron: '馬克宏', 'Keir Starmer': '施凱爾', Starmer: '施凱爾', 'Friedrich Merz': '梅爾茨', Merz: '梅爾茨',
  'Sanae Takaichi': '高市早苗', Takaichi: '高市早苗', 'Shigeru Ishiba': '石破茂', Ishiba: '石破茂', 'Lee Jae-myung': '李在明',
  'Recep Tayyip Erdogan': '艾爾段', Erdogan: '艾爾段', 'Ali Khamenei': '哈米尼', Khamenei: '哈米尼', 'Nicolas Maduro': '馬杜洛', 'Nicolás Maduro': '馬杜洛', Maduro: '馬杜洛',
  'Pope Leo XIV': '教宗良十四世', 'Pope Leo': '教宗良十四世', 'Antonio Guterres': '古特瑞斯', 'António Guterres': '古特瑞斯',
  'Jensen Huang': '黃仁勳', 'Lisa Su': '蘇姿丰', 'Morris Chang': '張忠謀', 'C.C. Wei': '魏哲家',
  'Lai Ching-te': '賴清德', 'William Lai': '賴清德', 'Hsiao Bi-khim': '蕭美琴', 'Cho Jung-tai': '卓榮泰', 'Han Kuo-yu': '韓國瑜', 'Cheng Li-wun': '鄭麗文',
  'Eric Chu': '朱立倫', 'Ko Wen-je': '柯文哲', 'Huang Kuo-chang': '黃國昌', 'Tsai Ing-wen': '蔡英文', 'Ma Ying-jeou': '馬英九', 'Lin Chia-lung': '林佳龍',
  'Wellington Koo': '顧立雄', 'Chiang Wan-an': '蔣萬安', 'Lu Shiow-yen': '盧秀燕', 'Hou Yu-ih': '侯友宜'
};
// Words that make a run of capitals a place, a body or a title, not a person.
const NOT_PERSON = new Set(
  ('United States Kingdom Nations Union European America American Americans North South East West New Old Saint St Fort Port Lake River Mount Island Islands ' +
    'White House Senate Congress Parliament Court Supreme Federal Reserve Bank Department State States Ministry Office Agency Council Committee Commission Party ' +
    'Republican Republicans Democrat Democrats Democratic Labour Labor Conservative Liberal National Army Navy Air Force Guard Coast Police Security Defense Defence ' +
    'President Prime Minister Secretary Governor Mayor Senator Rep Representative Speaker Chancellor King Queen Prince Princess Pope General Admiral Chief Justice Judge ' +
    'University College School Hospital Institute Foundation Center Centre Museum Company Corp Inc Group Holdings Motors Airlines Airways Times Post News Journal Street Wall ' +
    'Monday Tuesday Wednesday Thursday Friday Saturday Sunday January February March April May June July August September October November December ' +
    'The A An In On At For From With After Before As By Of To And But Or Why How What When Where Who Is Are Was Were Will Would Can Could Should May Might Must ' +
    'His Her Their Its Our My This That These Those It He She They We You I Here There Breaking Live Watch Opinion Analysis Exclusive Video Photos Update Updates ' +
    'Middle Gulf Sea Ocean Strait Canal Bay Valley City County Province Region Square Bridge Tower Hall Palace Kremlin Pentagon Capitol Downing Trade Center World Cup Games ' +
    'Olympics League Series Open Championship Grand Prix Cup Day Week Year Christmas Easter Thanksgiving Ramadan God Lord Iran Israel China Taiwan Japan Russia Ukraine Gaza India ' +
    'Israeli Iranian Chinese Japanese Russian Ukrainian Indian Indonesian Mongolian Inner Orthodox Jewish Muslim Arab Palestinian British French German Korean Taiwanese ' +
    'Mexican Canadian Australian Venezuelan Syrian Lebanese Turkish Saudi Jazeera Black Secret Service Act Amendment Commandments Caucus Progressive Rights Voting Climate ' +
    'Unknown Soldier Tomb Circle Treasury Global Former Senior Top Another Inside Read Examining Upper Chamber Scoop Lieutenant Colonel Major Sergeant Captain Officer ' +
    'Microsoft Nvidia Apple Google Meta Amazon Tesla OpenAI Outlook Windows Abu Dhabi Buenos Aires Washington DC Big Bend Los Angeles San Francisco Hong Kong Tel Aviv ' +
    'GOP Dem Dems VP CEO AI UN US UK EU AP FBI CIA NATO Act Bill Law Plan Deal Talks War Forces Ministry Station Airport Railway Highway Road Avenue Hotel Church ' +
    'Mountain Desk Has Had Trap Speech Report Thing Magazine Conference Change Hurricane Storm Political Politics First Last Full Reason Honey Crossfire Network Media ' +
    'Show Podcast Live Tonight Morning Evening Weekend Daily Weekly Review Insider Brief Briefing Edition Special Story Stories Exclusive Interview Poll Survey Index')
    .split(/\s+/)
);
const CAP_WORD = "(?:[A-Z][a-z]+(?:[-'’][A-Za-z][a-z]+)?|[A-Z]\\.(?:[A-Z]\\.)?|[A-Z]{2})";
const RUN = new RegExp(`\\b${CAP_WORD}(?:\\s+${CAP_WORD}){1,2}\\b`, 'g');
// People named in English text written in sentence case (a feed's summary,
// an outlet's headline in sentence case): runs of two or three capitalised
// words none of which says place, body or title. Each one's last name too,
// so a title's "Leavitt" alone is hers. KNOWN's are left to KNOWN.
// (A headline in Title Case says nothing: every word is a capital.)
export const sentenceCase = t => (String(t || '').match(/(?:^|\s)[a-z]{5,}/g) || []).length >= 2;
export function peopleIn(texts) {
  const out = new Set();
  for (const t of texts) {
    if (!sentenceCase(t)) continue;
    for (const m of String(t || '').matchAll(RUN)) {
      let words = m[0].split(/\s+/);
      // (A run that starts a sentence: a first word like "Examining" is the sentence's.)
      if (/(?:ing|ed|ly)$/.test(words[0]) && /(?:^|[.!?:;]\s+|^["'‘“]|[—–-]\s+)$/.test(String(t).slice(0, m.index))) words = words.slice(1);
      if (words.length < 2 || KNOWN[words.join(' ')]) continue;
      if (words.some(w => NOT_PERSON.has(w.replace(/[’']s$/, '')) || NOT_PERSON.has(w.split('-')[0]) || /^(?:One|Two|Three|Four|Five|Six|Seven|Eight|Nine|Ten|AG|DA)$/.test(w))) continue;
      if (words.every(w => /^[A-Z]{2}$/.test(w))) continue;
      out.add(words.join(' ').replace(/[’']s$/, ''));
      const last = words[words.length - 1].replace(/[’']s$/, '');
      if (last.length > 2 && !/^[A-Z]\.?$/.test(last)) out.add(last);
    }
  }
  for (const k of Object.keys(KNOWN)) out.delete(k);
  return [...out];
}

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const unesc = s =>
  s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
const rx = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// English going to Chinese, as HTML: each name kept as written (a span
// Google leaves alone), a known one already in Taiwan's Chinese.
export function shielded(text, people = []) {
  const names = [...Object.keys(KNOWN), ...people].sort((a, b) => b.length - a.length);
  if (!names.length) return esc(text);
  const re = new RegExp(`(?<![A-Za-z])(?<!New )(${names.map(rx).join('|')})(?![a-z])`, 'g');
  let out = '';
  let at = 0;
  for (const m of text.matchAll(re)) {
    out += esc(text.slice(at, m.index)) + `<span translate="no">${esc(KNOWN[m[1]] || m[1])}</span>`;
    at = m.index + m[1].length;
  }
  return out + esc(text.slice(at));
}
// Chinese going to English: a well-known name as its English one (賴清德 →
// Lai Ching-te, never a pinyin guess; a one-word one where there is one:
// 川普 → Trump), and Taiwan's own words for its bodies and parties
// (藍委 → KMT legislator, 法人： → analysts:), each kept as written here.
const ZH_EN = (() => {
  const out = {};
  for (const [en, zh] of Object.entries(KNOWN)) if (!out[zh] || (!/\s/.test(en) && /\s/.test(out[zh]))) out[zh] = en;
  return out;
})();
export const TW_EN = {
  國民黨: 'KMT', 民進黨: 'DPP', 民眾黨: 'TPP', 藍營: 'the KMT', 綠營: 'the DPP', 白營: 'the TPP', 藍委: 'KMT legislator', 綠委: 'DPP legislator', 白委: 'TPP legislator', 立委: 'legislator',
  行政院: 'the Executive Yuan', 立法院: 'the Legislative Yuan', 司法院: 'the Judicial Yuan', 監察院: 'the Control Yuan', 考試院: 'the Examination Yuan', 總統府: 'the Presidential Office',
  陸委會: 'the Mainland Affairs Council', 國台辦: 'China’s Taiwan Affairs Office', 中選會: 'the Central Election Commission', 金管會: 'the Financial Supervisory Commission', 央行: 'the central bank', 疾管署: 'Taiwan CDC', 衛福部: 'the Ministry of Health and Welfare', 國防部: 'the Ministry of National Defense', 外交部: 'the Ministry of Foreign Affairs', 經濟部: 'the Ministry of Economic Affairs', 交通部: 'the Ministry of Transportation', 教育部: 'the Ministry of Education', 內政部: 'the Ministry of the Interior', 海巡署: 'the Coast Guard Administration', 氣象署: 'the Central Weather Administration',
  台積電: 'TSMC', 鴻海: 'Foxconn', 聯發科: 'MediaTek', 輝達: 'Nvidia', 加權指數: 'TAIEX', 台股: 'Taiwan stocks', 外資: 'foreign investors', 投信: 'investment trusts', 自營商: 'dealers'
};
const ZH_KEYS = [...Object.keys(ZH_EN), ...Object.keys(TW_EN), '法人'].sort((a, b) => b.length - a.length);
const ZH_RE = new RegExp(ZH_KEYS.map(rx).join('|'), 'g');
export function shieldedEn(text) {
  return esc(text).replace(ZH_RE, (w, at, all) => {
    // (法人 is analysts only where it speaks: 法人：, 法人指出, 法人認為, 法人預估.)
    if (w === '法人') return /^(?:[：:]|指出|認為|預估|表示|分析)/.test(all.slice(at + 2)) ? '<span translate="no">analysts</span>' : w;
    return `<span translate="no">${esc(ZH_EN[w] || TW_EN[w])}</span>`;
  });
}

// Google's answer back to plain text, in Taiwan's way of writing it.
export function unshield(html, to) {
  let h = String(html || '');
  // (In English a kept word never runs into the next: Trump's, not Trumpsaid.)
  if (to !== 'zh-TW') h = h.replace(/<\/span>(?=[A-Za-z0-9(])/g, '</span> ').replace(/(?<=[A-Za-z0-9,)])<span/g, ' <span');
  let t = unesc(h.replace(/<\/?span[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
  if (to === 'zh-TW') {
    // (A name kept in English inside Chinese: a space either side, as Taiwan's press writes it.)
    t = t
      .replace(/([㐀-鿿])([A-Za-z])/g, '$1 $2')
      .replace(/([A-Za-z.])([㐀-鿿])/g, '$1 $2')
      .replace(/(?<!\d),(?!\d)/g, '，')
      .replace(/(?<![\d A-Za-z]):(?!\d)/g, '：')
      .replace(/\?/g, '？')
      .replace(/!/g, '！')
      .replace(/ ?([，：；。？！」』）]) ?/g, '$1')
      .replace(/ ?([「『（]) ?/g, '$1');
  }
  return t;
}

// A Chinese report's day alone (12日) is this month's, as Taiwan's press
// writes it; a translator guesses another month (11-13: 12日 → December
// 12th). The month put in from when it was reported (Taiwan's), the
// month before when the day is still ahead of it.
export function withMonth(text, at = Date.now()) {
  const d = new Date(at + 8 * 3_600_000);
  return String(text).replace(/(?<![月\d])(\d{1,2})日/g, (all, day) => {
    const n = +day;
    if (n < 1 || n > 31) return all;
    const m = n > d.getUTCDate() + 1 ? ((d.getUTCMonth() + 11) % 12) + 1 : d.getUTCMonth() + 1;
    return `${m}月${n}日`;
  });
}

// ---- Providers ----
// Google v2: texts in one call (128 at most, 30k characters asked), → their translations in order.
export async function google(env, texts, to, { fetchImpl = fetch, html = false } = {}) {
  const key = googleKey(env);
  if (!key) throw new Error('no key');
  const r = await fetchImpl(`https://translation.googleapis.com/language/translate/v2?key=${encodeURIComponent(key)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ q: texts, target: to, format: html ? 'html' : 'text' })
  });
  if (!r.ok) throw new Error(`google ${r.status}: ${(await r.text().catch(() => '')).slice(0, 160)}`);
  const j = await r.json();
  const out = j?.data?.translations?.map(x => x?.translatedText || '') || [];
  if (out.length !== texts.length) throw new Error('google: answer short');
  return out;
}

// ---- Translating ----
// texts → { text: translation } for those it could (none past the day's
// share, none on a failure: the caller shows the outlet's own). `to`:
// 'zh-TW' or 'en'. `people`: names to keep (peopleIn of the story's
// English), or a function giving each text its own.
// The meter is read and written here, once a call.
export async function translate(env, store, texts, to, { people = [], now = Date.now(), fetchImpl = fetch, cap = TR_MONTH, max = Infinity, force = false, prep = t => t } = {}) {
  const want = [...new Set(texts.map(t => String(t || '').trim()).filter(Boolean))];
  if (!want.length || !googleKey(env)) return {};
  const meter = await readMeter(store, now);
  // (`force`: a run by hand asks at once, a key just turned on.)
  if (meter.off && meter.off > now && !force) return {};
  let left = Math.min(dayLeft(meter, now, cap), max);
  const pick = [];
  for (const t of want) {
    if (t.length > left) continue;
    pick.push(t);
    left -= t.length;
  }
  if (!pick.length) return {};
  const zh = to === 'zh-TW';
  const out = {};
  let spent = 0;
  try {
    for (let i = 0; i < pick.length; i += 100) {
      const part = pick.slice(i, i + 100);
      const asked = part.map(t => (zh ? shielded(prep(t), typeof people === 'function' ? people(t) : people) : shieldedEn(prep(t))));
      const got = await google(env, asked, to, { fetchImpl, html: true });
      spent += part.reduce((n, t, k) => n + asked[k].length, 0);
      part.forEach((t, k) => {
        let v = unshield(got[k], to);
        // (A headline with no stop of its own gets none: 談判。 → 談判; Nothing. → Nothing.)
        if (!/[.!?。！？…]\s*["'”」』)]?$/.test(t)) v = v.replace(zh ? /。$/ : /\.$/, '');
        if (v && v !== t) out[t] = v;
      });
    }
  } catch (e) {
    meter.fail = (meter.fail || 0) + 1;
    meter.why = String(e?.message || e).slice(0, 200);
    // (A refused key (not on yet, 403) waits 15 minutes before it's asked again.)
    if (/google 4\d\d/.test(meter.why)) meter.off = now + 900_000;
  }
  if (spent) Object.assign(meter, { chars: meter.chars + spent, today: (meter.today || 0) + spent, n: (meter.n || 0) + 1, off: 0 });
  await store.put(TR_METER, { ...meter, at: now });
  return out;
}
