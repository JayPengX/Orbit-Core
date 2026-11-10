// Every AI feature of the family's, by name (ai.js runs them). Each is:
//   app        the kit id whose session may tap it (taps only)
//   tap        true: a person's tap through POST /ai; else built once by a builder (aiOnce)
//   models     tried in order (ai.js MODELS' names), the next when one fails or answers nothing usable
//   effort     the model's effort ('low' | 'medium' | 'high'; Gemini's thinking), or per model
//   clarify    may ask one short question back with options to tap, rather than guess (ai.js withAsk)
//   pick       the person's own lists it may ask about (['cat', 'pay']: input.cats, input.pays, [{ id, name }])
//   perPass    a tap's cap a Pass a day
//   input(raw) the phone's input made safe (null: refused)
//   parts(in)  the fixed prompt and the input, as Gemini's parts
//   schema     the JSON it answers (Gemini's OpenAPI subset; ai-other.js turns it into JSON Schema)
//   clean(raw, in) what may be shown (null: nothing usable)
// Code first (Jay 11-10): each is only what code can't do reliably; the
// apps parse what they can themselves and ask here for the rest.
import { cleanBuys } from './money-read.js';

const str = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
const S = { type: 'string' }, N = { type: 'number' }, B = { type: 'boolean' };
const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required });
const arr = items => ({ type: 'array', items });
const text = t => [{ text: t }];

// Every number an answer writes must be one the input gave (numbers come
// from code; a model only puts them in words). Years and small counts too.
// (1,290 is 1290: a thousands comma either side.)
const nums = t => String(t).replace(/(\d),(?=\d{3}(?!\d))/g, '$1').match(/\d+(?:\.\d+)?/g) || [];
export function numbersFrom(out, given) {
  const have = new Set(nums(given));
  return nums(out).every(n => have.has(n));
}

export const FEATURES = {
  // Orbit Money: 用說的記帳, the sentences the app's own parser couldn't
  // read ("跟同學吃火鍋花了三百五"). Entries for the person to look over, as 拍照記帳's.
  'money-say': {
    app: 'money',
    tap: true,
    clarify: true,
    pick: ['cat', 'pay'],
    models: ['luna', 'haiku'],
    effort: { luna: 'low' },
    perPass: 60,
    perMinute: 20,
    input(raw) {
      const t = str(raw?.text, 400);
      const today = DAY.test(raw?.today) ? raw.today : '';
      if (!t || !today) return null;
      const cats = list(raw?.cats, 160)
        .map(c => ({ id: str(c?.id, 64), name: str(c?.name, 48), k: c?.k === 'in' ? 'in' : 'out' }))
        .filter(c => c.id && c.name);
      const pays = list(raw?.pays, 60)
        .map(c => ({ id: str(c?.id, 64), name: str(c?.name, 48) }))
        .filter(c => c.id && c.name);
      return { text: t, today, cats, pays, en: raw?.lang === 'en' };
    },
    parts: ({ text: t, today, cats = [], pays = [] }) =>
      text(
        [
          'You turn what a person in Taiwan typed or said into entries for their own money book.',
          `Today is ${today} (Asia/Taipei). 昨天, 前天, 上週五 and dates without a year are the latest such day not after today.`,
          'Each separate amount is one entry: k "out" for money spent, "in" for money received; day YYYY-MM-DD; store: what or where, short, in their words (火鍋, 全家, 捷運); total: a whole number of NT$ (三百五 = 350, 1.2k = 1200, 兩千 = 2000); items [].',
          cats.length ? `cat: the id of the one category below that fits best, "" when unsure. 早餐, 午餐 and 晚餐 are separate: pick by the meal or the hour said. Categories (id: name):\n${cats.map(c => `${c.id}: ${c.name}${c.k === 'in' ? ' (income)' : ''}`).join('\n')}` : 'cat: "".',
          pays.length ? `pay: the id of the way they paid, only when they said it (a card, 現金, LINE Pay, 悠遊卡); "" otherwise. Ways to pay (id: name):\n${pays.map(p => `${p.id}: ${p.name}`).join('\n')}` : 'pay: "".',
          'invoice "" always.',
          'Only what was said. Never guess an amount. Nothing about money: an empty `buys`.',
          'Ask back only when an amount, which entry is income, or the meal (早餐/午餐/晚餐) really can’t be told; a category or way to pay they didn’t say is NOT a reason to ask: leave it "".',
          `What they said: ${t}`
        ].join('\n')
      ),
    schema: obj({ buys: arr(obj({ k: { type: 'string', enum: ['out', 'in'] }, day: S, store: S, total: N, items: arr(obj({ name: S, amt: N })), cat: S, pay: S, invoice: S })) }),
    clean(raw, input) {
      const buys = cleanBuys(raw, input.today, { cats: input.cats || [], pays: input.pays || [] }).map(b => ({ ...b, day: b.day || input.today }));
      return { buys };
    }
  },

  // Orbit Money: 問我的帳. The app adds up the person's own entries (lib/ask.mjs
  // booksFacts: three months by category, the places, the largest, the
  // changes, each number once); the AI only finds the answer in them and
  // says it. Every number it writes must be one of those.
  'money-ask': {
    app: 'money',
    tap: true,
    models: ['haiku', 'luna'],
    effort: { luna: 'low' },
    maxIn: 6000,
    perPass: 40,
    perMinute: 10,
    input(raw) {
      const q = str(raw?.question, 200);
      const facts = String(raw?.facts || '').slice(0, 5000);
      if (!q || facts.length < 20) return null;
      return { q, facts, en: raw?.lang === 'en' };
    },
    parts: ({ q, facts, en }) =>
      text(
        [
          'You answer a question about a person’s own money book (NT$, Taiwan). The facts below are their real entries, already added up by the app.',
          'Answer only from the facts: every number you write must appear in them exactly (no new sums, no percentages they don’t give, no thousands commas). If the facts can’t answer it, say so in one line and say what they do show.',
          `Answer in ${en ? 'English' : 'Traditional Chinese (台灣用語)'}: at most 3 short sentences, the number they asked first, plain words, no markdown, no lists. Never advise investing or borrowing; a gentle observation is fine.`,
          'Facts:',
          facts,
          `Question: ${q}`
        ].join('\n')
      ),
    schema: obj({ answer: S }),
    clean: (raw, { facts }) => {
      const a = str(raw?.answer, 400);
      return a && numbersFrom(a, facts) ? { answer: a } : null;
    }
  },

  // Orbit Money: 每月回顧's one suggestion. The figures are the phone's
  // (lib/month.mjs reviewFacts); the AI writes one honest, kind line from
  // them, asked once a month a phone.
  // Orbit Class: 問我的課表, a question about the person's own timetable
  // (the editor's AI box: one that's a question, not an edit). The app
  // writes the next two weeks as held (調課, 單雙週, days off applied); the
  // AI only reads them. Every time it writes must be one of theirs.
  'class-ask': {
    app: 'orbit',
    tap: true,
    models: ['haiku', 'luna'],
    effort: { luna: 'low' },
    maxIn: 5000,
    perPass: 40,
    perMinute: 10,
    input(raw) {
      const q = str(raw?.question, 200);
      const facts = String(raw?.facts || '').slice(0, 4500);
      if (!q || facts.length < 20) return null;
      return { q, facts, en: raw?.lang === 'en' };
    },
    parts: ({ q, facts, en }) =>
      text(
        [
          'You answer a student’s question about their own school timetable (Taiwan). The facts below are their next two weeks of classes exactly as they will be held: each day, each period’s number, start–end time and subject (swaps, odd/even weeks and days off already applied; a day not listed has no classes). Now is the date and time on the first line: a class that has ended is past, so never hedge with “if it has already happened”.',
          'Answer only from the facts. A time you write must be one the facts give. Counting periods or days is fine; say which days. If the facts can’t answer it, say so in one line and what they do show. Never remark on what the facts cover otherwise.',
          `Answer in ${en ? 'English' : 'Traditional Chinese (台灣用語)'}: at most 3 short sentences, the answer first, dates as 11/12（週四）, no markdown, no lists.`,
          'Facts:',
          facts,
          `Question: ${q}`
        ].join('\n')
      ),
    schema: obj({ answer: S }),
    clean: (raw, { facts }) => {
      const a = str(raw?.answer, 400);
      // (Times must be the timetable's own; counts and dates the AI may say.)
      const times = s => String(s).match(/\b\d{1,2}:\d{2}\b/g) || [];
      const have = new Set(times(facts).map(t => t.padStart(5, '0')));
      return a && times(a).every(t => have.has(t.padStart(5, '0'))) ? { answer: a } : null;
    }
  },

  // Orbit Weather's 問天氣 (code first, Jay 11-10): the person's question is read
  // by code (day, place, what) and answered from the forecast by code; only a
  // place code can't find among Taiwan's townships (a mountain, a park, a
  // school) is asked here, on a tap: where it is, nothing more.
  'weather-ask': {
    app: 'weather',
    tap: true,
    models: ['luna', 'haiku'],
    effort: { luna: 'low' },
    maxIn: 1200,
    perPass: 30,
    perMinute: 6,
    input(raw) {
      const q = str(raw?.question, 60);
      const place = str(raw?.place, 30);
      return q && place ? { q, place } : null;
    },
    parts: ({ q, place }) =>
      text(
        [
          'A person in Taiwan asks about the weather at a place. Say where that place is: its usual name in Traditional Chinese (台灣用語), the county or city it is in, and its coordinates in decimal degrees (a mountain: its summit; a town, park, school or sight: its centre).',
          'Only a real place you know. If it is not one, or it could be several places and the question gives no hint which, return name "" and lat 0, lon 0. Never guess.',
          `The place as they wrote it: ${place}`,
          `Their question: ${q}`
        ].join('\n')
      ),
    schema: obj({ name: S, county: S, lat: N, lon: N }),
    clean(raw) {
      const name = str(raw?.name, 30);
      const lat = Number(raw?.lat), lon = Number(raw?.lon);
      // (Anywhere on the map; Taiwan's own is what it's for, abroad Google's forecast answers too.)
      if (!name || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180 || (lat === 0 && lon === 0)) return { name: '', county: '', lat: 0, lon: 0 };
      return { name, county: str(raw?.county, 20), lat: Math.round(lat * 1e4) / 1e4, lon: Math.round(lon * 1e4) / 1e4 };
    }
  },

  'money-month': {
    app: 'money',
    tap: true,
    models: ['haiku', 'luna'],
    effort: { luna: 'low' },
    maxIn: 1500,
    perPass: 4,
    perMinute: 3,
    input(raw) {
      const facts = String(raw?.facts || '').slice(0, 1200);
      return facts.length > 20 ? { facts, en: raw?.lang === 'en' } : null;
    },
    parts: ({ facts, en }) =>
      text(
        [
          'A student or young person in Taiwan keeps their own money book. Here is last month, added up by the app.',
          `Write ONE suggestion for next month in ${en ? 'English, ≤ 25 words' : 'Traditional Chinese (台灣用語), ≤ 45 字'}: honest, kind and concrete, about the biggest thing these figures show (a category that grew, a place visited often, how much was kept). Not a lecture; no investing or borrowing advice; no markdown.`,
          'Any number you write must appear in the figures exactly (no thousands commas, no new sums or percentages).',
          facts
        ].join('\n')
      ),
    schema: obj({ tip: S }),
    clean: (raw, { facts }) => {
      const tip = str(raw?.tip, 160);
      return tip && numbersFrom(tip, facts) ? { tip } : null;
    }
  },

  // Orbit Words: 檢查我的句子. A sentence the learner wrote with the word,
  // corrected, with one line on why (in Chinese, or English on English phones).
  'words-check': {
    app: 'vocab',
    tap: true,
    models: ['haiku', 'luna'],
    effort: { luna: 'low' },
    perPass: 80,
    perMinute: 20,
    input(raw) {
      const word = str(raw?.word, 60), sentence = str(raw?.sentence, 300);
      if (!word || !sentence || sentence.length < 3) return null;
      return { word, meaning: str(raw?.meaning, 120), sentence, en: raw?.lang === 'en' };
    },
    parts: ({ word, meaning, sentence, en }) =>
      text(
        [
          'You are an English teacher for a Taiwanese high-school student learning vocabulary.',
          `The word: ${word}${meaning ? ` (${meaning})` : ''}`,
          `Their sentence: ${sentence}`,
          'Check the sentence. ok: true only when it is natural, correct English AND uses the word in the right meaning and form.',
          'fixed: the sentence corrected with the fewest changes (the same sentence when ok). Keep their idea; never write a new sentence.',
          'When their English is right but the word is used in another meaning or part of speech than the one given: ok false, fixed is their sentence unchanged (never add a word to force the meaning), and why names the meaning they used and shows the asked one in a 2–5 word example (e.g. a novel idea).',
          `why: when not ok, one short line on the main mistake${en ? ', in English' : ', in Traditional Chinese (台灣用語), ≤ 40 字'}; when ok, one short line of praise naming what they did well. No markdown.`,
          'used: true when the word itself (any form: plural, tense) is in their sentence.'
        ].join('\n')
      ),
    schema: obj({ ok: B, fixed: S, why: S, used: B }),
    clean: raw => (typeof raw?.fixed === 'string' && raw.fixed.trim() ? { ok: !!raw.ok, fixed: str(raw.fixed, 400), why: str(raw.why, 120), used: raw.used !== false } : null)
  },

  // Orbit Words: 用新字聊天. A short chat that has the student use the
  // words they're learning: each turn the AI fixes their last line (fewest
  // changes, one line why) and answers with a question that invites one of
  // the words not used yet. The phone keeps the chat and sends its last turns.
  'words-chat': {
    app: 'vocab',
    tap: true,
    models: ['haiku', 'luna'],
    effort: { luna: 'low' },
    maxIn: 3000,
    perPass: 120,
    perMinute: 20,
    input(raw) {
      const words = list(raw?.words, 6).map(w => str(w, 40)).filter(Boolean);
      const turns = list(raw?.turns, 8)
        .map(x => ({ who: x?.who === 'me' ? 'me' : 'ai', text: str(x?.text, 300) }))
        .filter(x => x.text);
      if (!words.length || !turns.length || turns.at(-1).who !== 'me') return null;
      return { words, used: list(raw?.used, 6).map(w => str(w, 40)), turns: turns.slice(-8), en: raw?.lang === 'en' };
    },
    parts: ({ words, used = [], turns, en }) =>
      text(
        [
          'You chat in English with a Taiwanese high-school student so they practise the words they are learning. Be warm, curious and brief, about everyday things a teenager in Taiwan knows (school, food, friends, weekends).',
          `Their words: ${words.join(', ')}. Used well already: ${used.length ? used.join(', ') : 'none'}.`,
          'fixed: their last line corrected with the fewest changes, "" when it is already natural and correct. Keep their idea.',
          `why: when fixed, one short line on the main mistake${en ? ', in English' : ', in Traditional Chinese (台灣用語), ≤ 30 字'}; "" otherwise.`,
          'used: which of their words their last line uses correctly (in a right meaning, any form).',
          'reply: your next line, ≤ 25 words, simple English (CEFR B1): react to what they said, then one question that gives them a natural chance to use one word not used yet. Never use their words yourself, never explain them, never list them.',
          'The chat so far (me = the student):',
          ...turns.map(x => `${x.who}: ${x.text}`)
        ].join('\n')
      ),
    schema: obj({ fixed: S, why: S, used: arr(S), reply: S }),
    clean: (raw, { words }) => {
      const reply = str(raw?.reply, 240);
      if (!reply) return null;
      const known = new Map(words.map(w => [w.toLowerCase(), w]));
      return { fixed: str(raw?.fixed, 400), why: str(raw?.why, 120), used: [...new Set(list(raw?.used, 6).map(w => known.get(String(w).toLowerCase().trim())).filter(Boolean))], reply };
    }
  },

  // Orbit Words: 拍一頁變單字卡. A photo of a textbook page, a word list or
  // a worksheet: the English words it teaches, base forms. The phone matches
  // them to its own list (only those it has are kept) and stars them.
  'words-photo': {
    app: 'vocab',
    tap: true,
    models: ['flash', 'lite'],
    effort: 'low',
    timeoutMs: 40_000,
    perPass: 20,
    perMinute: 4,
    input(raw) {
      const data = typeof raw?.image?.data === 'string' ? raw.image.data : '';
      const mime = /^image\/(jpeg|png|webp)$/.test(raw?.image?.mime_type || '') ? raw.image.mime_type : '';
      if (!mime || data.length < 1000 || data.length > 2_400_000 || /[^A-Za-z0-9+/=]/.test(data.slice(0, 2000))) return null;
      return { data, mime };
    },
    parts: ({ data, mime }) => [
      {
        text: [
          'This is a photo of a page a Taiwanese high-school student studies English from: a textbook, a vocabulary list, a worksheet or notes.',
          'List the English vocabulary it teaches: the words in a word list or in bold, the new words of a lesson; on a page of plain text, its less common words (not the, is, and, you, have…).',
          'Each in its base form (studies → study, went → go), lower case, once. Phrases only when the page lists them as one (look forward to). At most 60. None: an empty list.'
        ].join('\n')
      },
      { inlineData: { mimeType: mime, data } }
    ],
    schema: obj({ words: arr(S) }),
    clean: raw => ({
      words: [...new Set(list(raw?.words, 120).map(w => String(w || '').toLowerCase().trim().replace(/\s+/g, ' ')).filter(w => /^[a-z][a-z' .-]{0,40}$/.test(w)))].slice(0, 80)
    })
  },

  // Orbit Words: 例句與記憶法, made once for the whole list (builders/ai.js)
  // and kept in R2: two example sentences, a memory hook, the words it's confused with.
  'words-cards': {
    models: ['haiku', 'luna'],
    timeoutMs: 60_000,
    parts: ({ words }) =>
      text(
        [
          'For each English word below (with its meaning for a Taiwanese high-school student), write a study card.',
          'ex: two short, natural example sentences (≤ 14 words each) using the word in that meaning, each with a natural Traditional Chinese translation (台灣用語). Use the word itself or a plain form of it.',
          'hook: one memory hook in Traditional Chinese, ≤ 30 字: a real word root or word parts (e.g. “re- 再 + view 看”), a sound-alike, or a vivid picture tying the spelling to the meaning. Never just restate the meaning or the example; no made-up roots. "" when there is no hook that truly helps (most easy words).',
          'confuse: up to 3 English words learners mix it up with (look or sound alike, or near meanings), [] when none.',
          'Return one card per word, the word spelled exactly as given.',
          ...words.map(w => `${w.w}: ${w.zh}`)
        ].join('\n')
      ),
    schema: obj({ cards: arr(obj({ w: S, ex: arr(obj({ en: S, zh: S })), hook: S, confuse: arr(S) })) }),
    clean(raw, { words }) {
      const asked = new Map(words.map(w => [w.w.toLowerCase(), w.w]));
      const out = {};
      for (const c of list(raw?.cards, 200)) {
        const w = asked.get(String(c?.w || '').toLowerCase());
        if (!w) continue;
        const stem = w.toLowerCase().slice(0, Math.max(3, Math.min(5, w.length - 2)));
        const ex = list(c.ex, 2)
          .map(e => ({ en: str(e?.en, 160), zh: str(e?.zh, 80) }))
          .filter(e => e.en && e.zh && e.en.toLowerCase().includes(stem));
        if (!ex.length) continue;
        out[w] = { ex, hook: str(c.hook, 60), confuse: list(c.confuse, 3).map(x => str(x, 30)).filter(x => x && x.toLowerCase() !== w.toLowerCase()) };
      }
      return Object.keys(out).length ? out : null;
    }
  },

  // Orbit Sports: 賽後三句話's one "why" line, made once a final
  // (builders/recaps.js): the score lines are code's; this is the line code
  // can't write, from the game's own facts only, every number one of theirs.
  'sports-recap': {
    models: ['haiku', 'luna'],
    maxIn: 3000,
    parts: ({ facts }) =>
      text(
        [
          'You write the one line of a game recap that the score can’t tell: WHY this game ended as it did. The reader already sees the final score, the teams and their records, so never repeat those.',
          'Say the deciding moment or player, as a sports desk in Taiwan would: a late run, a swing play, a pitcher who shut them down, a goal against the run of play.',
          'zh: ONE line in Traditional Chinese (台灣的體育報導用語), ≤ 40 字. Team names exactly as the facts write them (Chinese); players in English as written.',
          'en: the same line in English, ≤ 22 words, teams by their English names given.',
          'Use only these facts. Every number you write must be one of theirs. No adjectives the facts don’t support. When the facts don’t show why, say the plainest true thing (who led the scoring for the winner).',
          'Facts:',
          facts
        ].join('\n')
      ),
    schema: obj({ zh: S, en: S }),
    clean: (raw, { facts }) => {
      const zh = str(raw?.zh, 80), en = str(raw?.en, 200);
      return zh && en && numbersFrom(zh + ' ' + en, facts) ? { zh, en } : null;
    }
  },

  // Orbit Sports' F1 賽後故事: how a race or sprint was won, told once from
  // code's digest of F1's own timing (builders/f1story.js): the result with
  // grids, stops and tyres, who led which laps, climbs, retirements, safety
  // cars. Every number must be the digest's.
  'f1-story': {
    models: ['haiku', 'luna'],
    maxIn: 3000,
    parts: ({ facts }) =>
      text(
        [
          'You write the short story of how this Formula 1 race was won, for fans in Taiwan who already see the finishing order. Tell what the order can’t: lead with the turning point (when the winner took the lead for good, and what came with it: a stop, a tyre change, a safety car), then who climbed or fell back most. Never recite the grid, every stint or every lap range: pick what decided it.',
          'zh: 2 or 3 sentences in Traditional Chinese, as Taiwan’s F1 coverage writes, ≤ 110 字. Tyres: soft 軟胎, medium 中性胎, hard 硬胎, inter 半雨胎, wet 全雨胎. From grid slot 1 is 杆位起跑; also 進站, 換胎, 安全車, 紅旗, 領跑, 退賽. Drivers by surname as written in English (Norris), teams in English.',
          'en: the same story in English, ≤ 60 words.',
          'Use only these facts. Every number you write must be one of theirs. Never give a reason the facts don’t show: no crash, penalty, rain or mistake they don’t name; a tyre change from inter to soft and back says only that the cars changed tyres.',
          'Facts:',
          facts
        ].join('\n')
      ),
    schema: obj({ zh: S, en: S }),
    clean: (raw, { facts }) => {
      const zh = str(raw?.zh, 180), en = str(raw?.en, 420);
      return zh && en && numbersFrom(zh + ' ' + en, facts) ? { zh, en } : null;
    }
  },

  // Orbit Transit: an operator's free-text notice (its own site's, not
  // TDX's, which names its routes) read into which lines, stops and days.
  // Every route and stop must be words of the notice's own.
  'transit-notice': {
    models: ['luna', 'haiku'],
    effort: { luna: 'low' },
    parts: ({ title, body, today }) =>
      text(
        [
          'Read this Taiwanese public-transport notice and say what it changes.',
          `Today is ${today}.`,
          'routes: the route or line names it affects, exactly as written (e.g. 307, 紅2, 板南線); stops: stop or station names it names; from / to: YYYY-MM-DD HH:MM when it starts and ends ("" when not said); kind: one of 停駛 改道 施工 停靠調整 班次調整 票價 其他; short: one line ≤ 30 字 of what a rider must know.',
          `Title: ${title}`,
          `Text: ${body}`
        ].join('\n')
      ),
    schema: obj({ routes: arr(S), stops: arr(S), from: S, to: S, kind: S, short: S }),
    clean: (raw, { title, body }) => {
      const all = `${title}\n${body}`;
      const routes = list(raw?.routes, 40).map(r => str(r, 20)).filter(r => r && all.includes(r));
      const stops = list(raw?.stops, 40).map(r => str(r, 30)).filter(r => r && all.includes(r));
      const when = v => (/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(v || '') ? v : '');
      return { routes, stops, from: when(raw?.from), to: when(raw?.to), kind: str(raw?.kind, 8), short: str(raw?.short, 60) };
    }
  },

  // Orbit News' 各方怎麼說 (built once a story, builders/ai.js newsSides): how
  // each side's outlets framed it, from their own headlines only, never
  // which side is right. Sonnet: telling an angle from a fact is judgment.
  'news-sides': {
    models: ['sonnet', 'haiku'],
    timeoutMs: 90_000,
    maxIn: 9000,
    parts: ({ stories }) =>
      text(
        [
          'You compare how each side’s news outlets framed the same story, using only the headlines each side gave it. Sides: in Taiwan g = 偏綠 (green-leaning), c = 中間, b = 偏藍 (blue-leaning); for world news l = left-leaning, c = centre, r = right-leaning.',
          'For each story, for each side it gives (and only those): what that side’s headlines stress or leave out: their angle, who they quote, the words they choose. Not the facts every side shares. zh: at most 30 字, Traditional Chinese (台灣用語) with full-width punctuation (，：；); en: at most 18 words. Quote a headline’s telling word: in zh in 「」 (an English word translated into Chinese), in en in "" (a Chinese word translated into English).',
          'diff: the ONE difference between the sides that matters most, not a recap of each (zh at most 40 字, en at most 24 words); both "" when the sides frame it the same way.',
          'Never say which side is right, never call an outlet biased or propaganda, add no adjective of your own about anyone. Every number you write must be in the headlines. Names as the headlines write them.',
          'Return one item per story with its id.',
          JSON.stringify(stories)
        ].join('\n')
      ),
    schema: obj({ items: arr(obj({ id: S, sides: arr(obj({ side: S, zh: S, en: S })), diff: obj({ zh: S, en: S }) })) }),
    clean(raw, { stories }) {
      const given = new Map(stories.map(s => [s.id, s]));
      const out = {};
      for (const it of list(raw?.items, 40)) {
        const src = given.get(String(it?.id || ''));
        if (!src) continue;
        const text = JSON.stringify(src);
        const sides = {};
        for (const x of list(it.sides, 3)) {
          const k = String(x?.side || '');
          const zh = str(x?.zh, 50), en = str(x?.en, 160);
          // (Past its length it was cut mid-word: a side said too long is left out.)
          if (String(x?.zh || '').trim().length > 50) continue;
          if (src.sides[k]?.length && zh && en && numbersFrom(zh + ' ' + en, text)) sides[k] = { zh, en };
        }
        if (Object.keys(sides).length < 2) continue;
        const dz = str(it.diff?.zh, 80), de = str(it.diff?.en, 200);
        const whole = String(it.diff?.zh || '').trim().length <= 70;
        out[src.id] = { sides, diff: whole && dz && de && numbersFrom(dz + ' ' + de, text) ? { zh: dz, en: de } : null };
      }
      return out;
    }
  },

  // Orbit News: 一句話講清楚 and 國際新聞中文標題, made once a story
  // (builders/news.js), from the outlets' own headlines and summaries only.
  'news-lines': {
    models: ['haiku', 'luna'],
    timeoutMs: 60_000,
    parts: ({ stories }) =>
      text(
        [
          'For each news story below (the headlines and short summaries different outlets gave it), write:',
          'line: one neutral sentence in Traditional Chinese (台灣用語), ≤ 45 字, of what happened. Only facts every given outlet agrees on; no outlet’s adjectives or framing; no opinion; every number must be one the headlines or summaries give.',
          'zh: a short Traditional Chinese headline (≤ 22 字), neutral.',
          'en: a short neutral English headline (≤ 14 words).',
          'Return one item per story with its id.',
          JSON.stringify(stories)
        ].join('\n')
      ),
    schema: obj({ items: arr(obj({ id: S, line: S, zh: S, en: S })) }),
    clean(raw, { stories }) {
      const given = new Map(stories.map(s => [s.id, JSON.stringify(s)]));
      const out = {};
      for (const it of list(raw?.items, 200)) {
        const src = given.get(String(it?.id || ''));
        if (!src) continue;
        const line = str(it.line, 90), zh = str(it.zh, 40), en = str(it.en, 120);
        if (line && numbersFrom(line + zh + en, src)) out[it.id] = { line, zh, en };
      }
      return out;
    }
  }
};
