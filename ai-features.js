// Every AI feature of the family's, by name (ai.js runs them). Each is:
//   app        the kit id whose session may tap it (taps only)
//   tap        true: a person's tap through POST /ai; else built once by a builder (aiOnce)
//   build      a repo's own build may call it through POST /ai/build with its key ('law': LAW_BUILD_KEY)
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
import { sidesRecap } from './kit/news-outlets.mjs';
import { str, list, S, N, B, obj, arr, text, nums, numbersFrom, fileOf } from './ai-util.js';
import { LAW_FEATURES } from './law-ai.js';

export { numbersFrom };
const DAY = /^\d{4}-\d{2}-\d{2}$/;

// Orbit Beats' grooves (its lib/names.mjs STYLE_NAMES), for beats-say.
const BEATS_STYLES = "four (4-on-floor, 四拍), hiphop (Hip-hop, 嘻哈), trap (Trap), half (Half-time, 半速), broken (Breakbeat, 碎拍), house (House), dembow (Dembow), afro (Afro), drill (Drill), boombap (Boom Bap), jersey (Jersey), amapiano (Amapiano), lofi (Lo-fi), funk (Funk, 放克), garage (Garage, UK 車庫), dnb (D&B), reggae (Reggae, 雷鬼), phonk (Phonk), baile (Baile), techno (Techno), jazz (Jazz swing, 爵士搖擺), bossa (Bossa nova, 巴薩諾瓦), samba (Samba, 森巴), salsa (Salsa, 騷莎), rock (Rock, 搖滾), punk (Pop-punk, 流行龐克), metal (Metal, 金屬), citypop (City pop, City Pop), kpop (K-pop), synthwave (Synthwave, 合成器浪潮), disco (Disco, 迪斯可), gospel (Gospel, 福音), neosoul (Neo-soul, 新靈魂), ballad (Ballad, 抒情), ambient (Ambient, 氛圍), cinematic (Cinematic, 電影配樂), chiptune (Chiptune, 8-bit), kizomba (Kizomba), highlife (Highlife), cumbia (Cumbia, 昆比亞), bhangra (Bhangra, 班格拉), dubstep (Dubstep), footwork (Footwork), jungle (Jungle, 叢林), trance (Trance), hardstyle (Hardstyle), chinese (Chinese, 中國風), blues (Blues, 藍調), country (Country, 鄉村)";
const BEATS_IDS = BEATS_STYLES.split(', ').map(x => x.split(' (')[0]);

// 拍聯絡簿's items made safe: a kind, a subject only from the person's own
// list (a short name matched: 數 → 數學), a due day from yesterday to five
// months ahead, 24 at most, none twice.
export function cleanBook(raw, { today, subjects = [] }) {
  const t0 = Date.parse(`${today}T00:00:00Z`);
  const near = d => DAY.test(d) && Date.parse(`${d}T00:00:00Z`) >= t0 - 86_400_000 && Date.parse(`${d}T00:00:00Z`) <= t0 + 150 * 86_400_000;
  const subjectOf = v => {
    const s = str(v, 16);
    if (!s || !subjects.length) return subjects.length ? '' : s;
    return subjects.find(x => x === s) || subjects.find(x => x.startsWith(s) || s.startsWith(x)) || subjects.find(x => x.includes(s) || s.includes(x)) || '';
  };
  const seen = new Set();
  const items = [];
  for (const x of list(raw?.items, 40)) {
    const text = str(x?.text, 60);
    if (!text) continue;
    const subject = subjectOf(x?.subject);
    const kind = ['test', 'hw', 'bring', 'do'].includes(x?.kind) ? x.kind : 'do';
    const k = `${subject}|${text}`;
    if (seen.has(k)) continue;
    seen.add(k);
    const due = near(x?.due) ? x.due : '';
    items.push({ kind, subject, text, due, next: !due && x?.next === true });
    if (items.length >= 24) break;
  }
  return { items };
}

// A scope's numbers with its ranges' insides (L4-L6 names L5 too; Ch3–Ch5, Ch4).
export const spanOf = scope =>
  String(scope || '').replace(/(\d+)\s*[-~～–—至到]\s*[A-Za-z]{0,4}\s*(\d+)(?![-.]\d)/g, (m, a, b) => {
    const x = +a, y = +b;
    return y > x && y - x <= 20 ? `${m} ${Array.from({ length: y - x - 1 }, (_, i) => x + i + 1).join(' ')}` : m;
  });

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
          'Each fact line starting [id] is a table the app draws as rows and bars under your answer. First read what is asked: where the money went (by category, cat0…), how it was paid (by card, cash, LINE Pay, account: pay0…), inside a category (sub0.<cat>), income, places, the largest, against last month (vs), by month, this week, the budget.',
          'show: the ids of the one or two tables that answer it, the best first ([] when none does). line: ONE short sentence that answers it with the number asked first (zh at most 40 字, en at most 22 words); never list what the tables will show. mark: up to 3 row labels in those tables to light up, written exactly as in the facts.',
          'Every number in line must appear in the facts exactly (no new sums, no percentages they don’t give, no thousands commas). If the facts can’t answer it, line says so and what they do show, show [].',
          `Write line in ${en ? 'English' : 'Traditional Chinese (台灣用語)'}, plain words, no markdown. Never advise investing or borrowing.`,
          'Facts:',
          facts,
          `Question: ${q}`
        ].join('\n')
      ),
    schema: obj({ line: S, show: arr(S), mark: arr(S) }),
    clean: (raw, { facts }) => {
      const a = str(raw?.line ?? raw?.answer, 200);
      if (!a || !numbersFrom(a, facts)) return null;
      const ids = new Set([...facts.matchAll(/^\[([a-z0-9.]+)\]/gm)].map(m => m[1]));
      const show = [...new Set(list(raw?.show, 4).map(x => str(x, 40)).filter(x => ids.has(x)))].slice(0, 2);
      const mark = list(raw?.mark, 6).map(x => str(x, 40)).filter(x => x && facts.includes(x)).slice(0, 3);
      // (answer: what phones before 11-11 read.)
      return { answer: a, line: a, show, mark };
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
          `line: the answer in ONE short sentence in ${en ? 'English, ≤ 20 words' : 'Traditional Chinese (台灣用語), ≤ 35 字'}, the answer first, dates as 11/12（週四）, no markdown.`,
          'show: the days the app draws under it as that day’s periods (at most 3, the answer’s first), each { day: YYYY-MM-DD from the facts, periods: the period numbers that answer it, lit } ([] when no day helps). The app draws the times and subjects: never list them in line.',
          'Facts:',
          facts,
          `Question: ${q}`
        ].join('\n')
      ),
    schema: obj({ line: S, show: arr(obj({ day: S, periods: arr(N) })) }),
    clean: (raw, { facts }) => {
      const a = str(raw?.line ?? raw?.answer, 200);
      // (Times must be the timetable's own; counts and dates the AI may say.)
      const times = s => String(s).match(/\b\d{1,2}:\d{2}\b/g) || [];
      const have = new Set(times(facts).map(t => t.padStart(5, '0')));
      if (!a || !times(a).every(t => have.has(t.padStart(5, '0')))) return null;
      // (A day drawn is one of the facts' days; its periods ones it has.)
      const days = new Map([...facts.matchAll(/^(\d{4}-\d{2}-\d{2}) \w{3}: (.*)$/gm)].map(m => [m[1], new Set([...m[2].matchAll(/(?:^|; )(\d{1,2}) \d/g)].map(x => Number(x[1])))]));
      const show = list(raw?.show, 3)
        .filter(x => days.has(String(x?.day || '')))
        .map(x => ({ day: x.day, periods: list(x.periods, 12).filter(n => days.get(x.day).has(n)) }));
      // (answer: what phones before 11-11 read.)
      return { answer: a, line: a, show };
    }
  },

  // Orbit Class: 拍聯絡簿變待辦. A photo of the 聯絡簿, the board or a teacher's
  // note: each thing to do, its subject (one of the person's own), what, and
  // when it's due as the note says it. Code does the rest on the phone: a
  // "下次上課" or an undated one lands on that subject's next class (the
  // timetable as held), and everything is looked over before it's kept.
  'class-book': {
    app: 'orbit',
    tap: true,
    models: ['flash', 'haiku'],
    effort: 'low',
    timeoutMs: 40_000,
    maxIn: 3000,
    perPass: 20,
    perMinute: 4,
    input(raw) {
      const data = typeof raw?.image?.data === 'string' ? raw.image.data : '';
      const mime = /^image\/(jpeg|png|webp)$/.test(raw?.image?.mime_type || '') ? raw.image.mime_type : '';
      const today = DAY.test(raw?.today) ? raw.today : '';
      if (!mime || !today || data.length < 1000 || data.length > 2_400_000 || /[^A-Za-z0-9+/=]/.test(data.slice(0, 2000))) return null;
      const subjects = [...new Set(list(raw?.subjects, 40).map(s => str(s, 16)).filter(Boolean))];
      return { data, mime, today, subjects, en: raw?.lang === 'en' };
    },
    parts: ({ data, mime, today, subjects }) => [
      {
        text: [
          'This is a photo of a Taiwanese student’s 聯絡簿 (contact book), the class board, or a teacher’s note of what to do.',
          'List each thing the student must do, hand in, prepare or be tested on, one item each:',
          'kind: "test" a quiz or exam (小考, 考試, 段考, 默寫, 聽寫, 抽背); "hw" homework to hand in (作業, 習作, 學習單, 講義, 訂正, 心得, 報告); "bring" something to bring or pay (帶…, 繳費, 回條); "do" anything else (簽名, 報名, 練習, 背…).',
          subjects.length ? `subject: the subject it belongs to, written exactly as one of theirs: ${subjects.join('、')}. Match short names (數 → 數學, 英 → 英文). "" when the note doesn't say or none fits.` : 'subject: the subject as the note writes it, "" when it doesn’t say.',
          'text: what to do, short (≤ 24 字), the note’s own words without the subject or the date (數學習作 p.32-35 明天交 → "習作 p.32-35").',
          `due: the day it is due or held, YYYY-MM-DD, only from what the note says (明天, 下週二, 11/14, 週五…). Today is ${today} (${'日一二三四五六'[new Date(`${today}T12:00:00Z`).getUTCDay()]}); a weekday alone is the next one after today; 下週 is next week’s (weeks start on Monday). A date heading a day’s entries is when they were written, not a due date. "" when it isn’t said.`,
          'next: true when it says next class (下次上課, 下堂課, 下次交) and gives no date; else false.',
          'Only what is written: never add a task. A crossed-out or ticked-off line is done: skip it. No tasks: an empty list.'
        ].join('\n')
      },
      { inlineData: { mimeType: mime, data } }
    ],
    schema: obj({ items: arr(obj({ kind: { type: 'string', enum: ['test', 'hw', 'bring', 'do'] }, subject: S, text: S, due: S, next: B })) }),
    clean: (raw, input) => cleanBook(raw, input)
  },

  // Orbit Class: 考前讀書計畫. Code plans the time (which days, how many
  // sessions a subject gets, the last one the day before its exam: the
  // phone's plan.js); this writes only what to do in each session, from the
  // scope the student typed. A chapter or lesson it names is one of theirs.
  'class-plan': {
    app: 'orbit',
    tap: true,
    models: ['haiku', 'luna'],
    effort: { luna: 'low' },
    maxIn: 4000,
    perPass: 20,
    perMinute: 6,
    input(raw) {
      const today = DAY.test(raw?.today) ? raw.today : '';
      const subjects = list(raw?.subjects, 12)
        .map(s => ({ name: str(s?.name, 16), scope: str(s?.scope, 120), n: Math.max(1, Math.min(14, Math.round(Number(s?.n) || 0))), exam: DAY.test(s?.exam) ? s.exam : '', weak: s?.weak === true }))
        .filter(s => s.name && s.exam);
      if (!today || !subjects.length) return null;
      return { today, exam: str(raw?.exam, 30), subjects, en: raw?.lang === 'en' };
    },
    parts: ({ today, exam, subjects, en }) =>
      text(
        [
          `A Taiwanese high-school student is preparing for ${exam || 'an exam'}. Today is ${today}. Their study time is already planned: each subject below has n sessions of about 30–50 minutes, in order, the last one on the day before that subject’s exam.`,
          'For each subject write exactly n tasks, in order: what to do in that session, concrete and short (≤ 22 字): which part of the scope, and how (讀課文畫重點、整理筆記、做習作／講義、寫考古題、背單字、訂正錯題…).',
          'Spread the scope evenly, in its own order, over the sessions before the last. The last session is a whole review (總複習: 錯題、重點、計時寫一回). A subject marked weak gets more practice than reading.',
          'With no scope, plan sensible kinds of work for that subject without naming chapters. Name only chapters, lessons, units or pages the scope gives; never invent a number.',
          `Write in ${en ? 'English' : 'Traditional Chinese (台灣用語)'}, no markdown.`,
          ...subjects.map(s => `- ${s.name}: n ${s.n}, exam ${s.exam}${s.weak ? ', weak' : ''}, scope: ${s.scope || '(none)'}`)
        ].join('\n')
      ),
    schema: obj({ plans: arr(obj({ subject: S, tasks: arr(S) })) }),
    clean(raw, { subjects }) {
      const out = {};
      for (const s of subjects) {
        const p = list(raw?.plans, 20).find(x => str(x?.subject, 16) === s.name);
        if (!p) continue;
        // (Every number a task names is its scope's: a chapter, a lesson, a page.)
        const tasks = list(p.tasks, s.n).map(t => str(t, 44)).map(t => (t && numbersFrom(t, spanOf(s.scope)) ? t : ''));
        if (tasks.filter(Boolean).length >= Math.ceil(s.n / 2)) out[s.name] = tasks;
      }
      return Object.keys(out).length ? { plans: out } : null;
    }
  },

  // Orbit Class: 學校公告摘要, built once per school an hour (class-news.js):
  // code reads the school's own list; this words each new title for a
  // student: one line, which students it's for, what to do, by when. Every
  // number and date it writes is the title's.
  'class-news': {
    models: ['haiku', 'luna'],
    effort: { luna: 'low' },
    timeoutMs: 60_000,
    maxIn: 12_000,
    parts: ({ school, today, items }) =>
      text(
        [
          `These are the newest announcements on a Taiwanese school’s website (${school}). Today is ${today}. For each, from its title, unit and the start of its text:`,
          'who: which of the school’s students it concerns, a list: "all" every student; "1", "2", "3" a grade (高一 / 一年級 / 1xx班 = "1"; 高三, 畢業班, 升學 = "3"); "jh" its 國中部 or a 國中 grade (國一–國三, 七–九年級); "some" only some (a team, a club, those who signed up, applicants for a scholarship or a contest). [] when it isn’t for students at all: teachers (研習, 甄選, 公開觀課, 會議), staff, bids (招標, 採購), parents only, results lists for the public.',
          'line: one plain sentence for a student, ≤ 30 字: what happens or what they get, and when. Not the title again: drop 【轉知】, 公告, unit names and the school’s name; say it simply, no filler (請同學留意, 歡迎參加). Every date and number must be one the title or text gives.',
          'act: what they must do, ≤ 10 字 (報名, 繳回條, 上傳學習歷程, 帶…), "" when nothing.',
          'by: the deadline, or the day it happens, as YYYY-MM-DD when the title or text gives one (115年 = 2026; a month and day alone is the coming one), else "".',
          'Return one item per announcement with its id.',
          JSON.stringify(items.map(it => ({ id: it.id, title: it.title, unit: it.unit || it.kind || '', text: (it.desc || '').slice(0, 160) })))
        ].join('\n')
      ),
    schema: obj({ items: arr(obj({ id: S, who: arr({ type: 'string', enum: ['all', '1', '2', '3', 'jh', 'some'] }), line: S, act: S, by: S })) }),
    clean(raw, { items }) {
      const given = new Map(items.map(it => [it.id, it]));
      const out = {};
      for (const x of list(raw?.items, 60)) {
        const it = given.get(String(x?.id || ''));
        if (!it) continue;
        const src = `${it.title} ${it.desc || ''} ${it.date}`;
        const line = str(x.line, 60);
        const by = DAY.test(x.by) ? x.by : '';
        // (A date written 11/20 or 115年11月20日 is its own numbers; the deadline's month and day must be in the source.)
        const byOk = by && (by === it.date || [String(+by.slice(5, 7)), String(+by.slice(8, 10))].every(n => nums(src).includes(n)));
        out[it.id] = {
          line: line && numbersFrom(line, `${src} ${byOk ? by : ''}`) ? line : '',
          who: [...new Set(list(x.who, 6).filter(w => ['all', '1', '2', '3', 'jh', 'some'].includes(w)))],
          act: str(x.act, 20),
          by: byOk ? by : ''
        };
      }
      return Object.keys(out).length ? out : null;
    }
  },

  // Orbit Weather's 問天氣 (code first, Jay 11-10): the person's question is read
  // by code (day, place, what) and answered from the forecast by code; only a
  // place code can't find among Taiwan's townships (a mountain, a park, a
  // school) is asked here, on a tap: where it is, nothing more.
  // 用說的做節奏 (Beats, Jay 11-10): only words code can't place (lib/say.mjs
  // reads lo-fi, 慢, 下雨, 跑步…); the grooves and a tempo, never a sound.
  'beats-say': {
    app: 'beats',
    tap: true,
    models: ['luna', 'haiku'],
    effort: { luna: 'low' },
    maxIn: 2000,
    perPass: 30,
    perMinute: 6,
    input(raw) {
      const t = str(raw?.text, 80);
      return t ? { t } : null;
    },
    parts: ({ t }) =>
      text(
        [
          'Someone describes the music they want to hear (a mood, a time, a place, an activity, a sound). Pick the grooves from this list that fit best, 1 to 5, best first, by their ids only, and the tempo: "slow" (under 95 BPM), "mid", "fast" (over 125), or "" when the words imply none.',
          'If the words are not about music or a feeling at all, return no grooves and tempo "".',
          `Grooves (id (name)): ${BEATS_STYLES}`,
          `Their words: ${t}`
        ].join('\n')
      ),
    schema: obj({ styles: arr(S), tempo: S }),
    clean(raw) {
      const ids = new Set(BEATS_IDS);
      const styles = [...new Set(list(raw?.styles, 8).map(x => str(x, 20).toLowerCase()))].filter(x => ids.has(x)).slice(0, 5);
      const tempo = ['slow', 'mid', 'fast'].includes(raw?.tempo) ? raw.tempo : '';
      return { styles, tempo };
    }
  },
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
          `Write ONE suggestion for next month in ${en ? 'English, ≤ 25 words' : 'Traditional Chinese (台灣用語), ≤ 45 字'}: honest, kind and concrete. The person already sees the lines before the note in brackets on the same card: never restate them. Build it on what only the lines after the note show (weekends against weekdays, the small buys, the biggest one, the place, what grew inside a category), saying what to try, not the figure again. Not a lecture; no investing or borrowing advice; no markdown.`,
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
    models: ['flash', 'haiku'],
    effort: 'low',
    timeoutMs: 40_000,
    perPass: 20,
    perMinute: 4,
    input(raw) {
      return fileOf(raw?.image);
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
          'You write the one line of a game recap that the card above it can’t tell: HOW this game was decided. The reader already sees the final score, both records and each team’s top scorer with his points, rebounds and assists: never repeat any of those, and never name a player only for his totals.',
          'From the facts below, say the turn that decided it, as a sports desk in Taiwan would: a run and who drove it, a comeback from how far down, when the winner went ahead for good and on whose play, the period that broke it open, a late swing. One idea, not a list.',
          'Teams and players are tokens: write {t:<id>} for a team and {p:<id>} for a player exactly as the facts give them (the app shows them as their names), never their names in words.',
          'zh: ONE line in Traditional Chinese (台灣的體育報導用語), ≤ 40 字 not counting tokens, no English words. en: the same line in English, ≤ 22 words.',
          'Use only these facts. Every number you write must be one of theirs. No adjectives the facts don’t support.',
          'If the facts hold nothing that explains the result beyond the final score, return zh "" and en "".',
          'Facts:',
          facts
        ].join('\n')
      ),
    schema: obj({ zh: S, en: S }),
    clean: (raw, { facts }) => {
      const zh = str(raw?.zh, 160), en = str(raw?.en, 300);
      if (!zh && !en) return { zh: '', en: '' };
      // Every token one the facts give; no player or team typed out in words.
      const toks = `${zh} ${en}`.match(/\{[pt]:[^}]+\}/g) || [];
      if (!zh || !en || toks.some(t => !facts.includes(t))) return null;
      const bare = t => t.replace(/\{[pt]:[^}]+\}/g, '');
      if (/[A-Za-z]{3,}/.test(bare(zh))) return null;
      const names = [...facts.matchAll(/\{p:[^}]+\} = ([^;\n]+)/g)].map(m => m[1].trim().split(/\s+/).pop()).filter(n => n.length >= 3);
      if (names.some(n => bare(en).includes(n))) return null;
      return numbersFrom(bare(zh) + ' ' + bare(en), facts) ? { zh, en } : null;
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
          'You pick the moments that decided this Formula 1 race, for fans in Taiwan who already see the finishing order and a lap-by-lap list. Tell what the order can’t: the turning point (when the winner took the lead for good, and what came with it: a stop, a tyre change, a safety car), then who climbed or fell back most and why the facts show. Never recite the grid, every stint or every lap range.',
          'points: 2 to 4 moments, in lap order. Each: lap (the lap it happened, a number from the facts; 0 for the start) and no (the car number of the driver it is about, from #N in the facts; "" for the track, a safety car or red flag). zh: one line in Traditional Chinese, as Taiwan’s F1 coverage writes, ≤ 30 字, without the driver’s own name (his face shows it; another driver by surname in English). Tyres: soft 軟胎, medium 中性胎, hard 硬胎, inter 半雨胎, wet 全雨胎; 杆位起跑, 進站, 換胎, 安全車, 紅旗, 領跑, 退賽. en: the same, ≤ 16 words.',
          'Use only these facts. Every number you write must be one of theirs. Never give a reason the facts don’t show: no crash, penalty, rain or mistake they don’t name.',
          'Facts:',
          facts
        ].join('\n')
      ),
    schema: obj({ points: arr(obj({ lap: N, no: S, zh: S, en: S })) }),
    clean: (raw, { facts, laps = 0 }) => {
      const cars = new Set([...facts.matchAll(/#(\d{1,2})\b/g)].map(m => m[1]));
      const most = laps || Math.max(0, ...[...facts.matchAll(/(\d{1,3}) laps/g)].map(m => Number(m[1])));
      const points = list(raw?.points, 5)
        .map(p => ({ lap: Number.isInteger(p?.lap) && p.lap >= 0 && p.lap <= most ? p.lap : null, no: cars.has(String(p?.no || '').replace('#', '')) ? String(p.no).replace('#', '') : '', zh: str(p?.zh, 50), en: str(p?.en, 140) }))
        .filter(p => p.zh && p.en && numbersFrom(`${p.zh} ${p.en}`, facts))
        .slice(0, 4);
      return points.length >= 2 ? { points } : null;
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
    models: ['sonnet', 'sol'],
    timeoutMs: 90_000,
    maxIn: 9000,
    parts: ({ stories }) =>
      text(
        [
          'You compare how each side’s news outlets framed the same story, using only the headlines each side gave it. Sides: in Taiwan g = 偏綠 (green-leaning), c = 中間, b = 偏藍 (blue-leaning); for world news l = left-leaning, c = centre, r = right-leaning.',
          'For each story, for each side it gives (and only those): what that side’s headlines stress or leave out: their angle, who they quote, the words they choose. Not the facts every side shares. zh: at most 30 字, Traditional Chinese (台灣用語) with full-width punctuation (，：；); en: at most 18 words. Quote a headline’s telling word: in zh in 「」 (an English word translated into Chinese), in en in "" (a Chinese word translated into English).',
          'diff: what a reader of only one side would miss: a fact, a voice or a number one side reports and another leaves out (zh at most 40 字, en at most 24 words). The reader already sees each side’s line above it: never restate or sum them up, never quote a word they quote; both "" when nothing is left out.',
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
        // (A diff that only says each side's line again is dropped: sidesRecap.)
        const recap = sidesRecap(dz, Object.values(sides).map(x => x.zh));
        out[src.id] = { sides, diff: whole && dz && de && !recap && numbersFrom(dz + ' ' + de, text) ? { zh: dz, en: de } : null };
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
          'For each news story below (its outlets’ headlines), write one short neutral headline in the language asked: lang "zh": Traditional Chinese (台灣用語), ≤ 22 字; lang "en": English, ≤ 14 words.',
          'Only what the headlines all say; no outlet’s adjectives or framing; every number must be one the headlines give. Return one item per story with its id.',
          JSON.stringify(stories)
        ].join('\n')
      ),
    schema: obj({ items: arr(obj({ id: S, title: S })) }),
    clean(raw, { stories }) {
      const given = new Map(stories.map(s => [s.id, s]));
      const out = {};
      for (const it of list(raw?.items, 200)) {
        const s = given.get(String(it?.id || ''));
        if (!s) continue;
        const title = str(it.title, s.lang === 'zh' ? 40 : 120);
        if (title && numbersFrom(title, JSON.stringify(s.heads))) out[s.id] = { [s.lang]: title };
      }
      return out;
    }
  },

  // Orbit Law's: 拍合約幫你看, 會議紀錄變表格, 法案週報 (law-ai.js).
  ...LAW_FEATURES
};
