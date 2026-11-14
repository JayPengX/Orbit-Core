// ---- law-town.js: /law-ask's mode 'town', one member's 總質詢 in a few lines ----
// { mode: 'town', tc, file, url, n, lang }: a 代表會's 總質詢 day as Orbit Law reads it from the PDF
// (council/town/<tc>/<file>.json: papers[url].turns, .asks[n] = one member's questions and the answers).
// Gemini answers from those turns only, numbered, and every point cites the turns it rests on (one not
// given is dropped); the cited turns go back with it, so the app shows who said it under each point.
// Asked only on a person's tap, kept a year: the first reader's tap answers everyone after.
// (law.js does the rest: the Pass, the counts, the cache.)
import { sha256Hex } from './http.js';
import { readData, cited } from './law.js';

export const TOWN_LIMITS = { chars: 30_000, quote: 220, points: 5 };
const TOWN_TTL_S = 365 * 86_400;

// The ask's own fields, checked: a township's code, its session file, a paper's address, a question's number.
export const townAsk = b => /^\d{8}$/.test(String(b?.tc)) && /^t\d{1,2}-\d{1,3}[re]$/.test(String(b?.file)) && typeof b?.url === 'string' && (/^https:\/\/[\w.-]+\.gov\.tw\/[^\s"<>]{1,300}\.pdf$/i.test(b.url) || /^asr:[\w-]{12,80}$/.test(b.url)) && Number.isInteger(b?.n) && b.n >= 0 && b.n < 400;

// The turns of one member's questions, numbered from 1, as many as the prompt holds.
export function townTurns(paper, n, max = TOWN_LIMITS.chars) {
  const ask = paper?.asks?.[n];
  if (!ask || !Array.isArray(paper.turns)) return null;
  const rows = [];
  let used = 0;
  for (const [i, t] of paper.turns.slice(ask.from, ask.to + 1).entries()) {
    const text = String(t?.t || '').replace(/\s+/g, ' ').trim();
    if (!text || used + text.length > max) continue;
    used += text.length;
    rows.push({ key: String(i + 1), w: String(t.w || ''), r: String(t.r || ''), text });
  }
  return rows.length ? { ask, rows } : null;
}

const LANG = lang => (lang === 'en' ? 'plain English' : 'Traditional Chinese as used in Taiwan (繁體中文)');

// machine: the recording made into text by speech recognition (Law's scripts/town-hear.mjs): words may be misheard,
// speakers read from the meeting's order and some left unnamed.
export function townPrompt(where, ask, rows, lang, machine = false) {
  const body = rows.map(t => `[turn "${t.key}"] ${t.w}（${t.r || (machine ? '不確定是誰' : '發言')}）: ${t.text}`).join('\n');
  const who = ask.w || 'a member';
  return `Below is part of a ${machine ? 'machine transcript (speech recognition of the recording: some words are misheard and there is little punctuation; speakers were worked out from the meeting\'s order and some are unnamed)' : 'transcript'} of a Taiwanese township council's 總質詢 (${where}): one member, ${who}, questioning the township office, and the answers. Each turn has a number. Return JSON matching the schema.

Turns:
${body}

answer: 2 to 3 plain sentences for a resident: what ${who} raised and what the office answered.
points: up to ${TOWN_LIMITS.points}, each one concrete thing asked or answered (a place, a figure, a date, a decision), in the order said.
promised: one sentence on what the office or the chair said would be done, or "" if nothing was promised.

Rules:
- Use only the turns above. Nothing from outside; don't fill gaps or guess motives.
- points: each one short statement, and its cites lists the number of every turn it rests on, exactly as given in quotes (e.g. "3"). Never a point without a cite, never a number not listed above.
- Leave out greetings, thanks and the chair's calls to speak. Keep names as the transcript gives them.
- Neutral: report what was said, never judge who was right.${machine ? '\n- A misheard word: read it as the meeting most plainly meant, but never build a point on a word you can\'t make out; leave a name out rather than guess it.' : ''}
- covered: true when the turns hold real questions and answers.
- Write everything in ${LANG(lang)}.`;
}

export const TOWN_SCHEMA = {
  type: 'object',
  properties: {
    answer: { type: 'string' },
    points: { type: 'array', items: { type: 'object', properties: { text: { type: 'string' }, cites: { type: 'array', items: { type: 'string' } } }, required: ['text', 'cites'] } },
    promised: { type: 'string' },
    covered: { type: 'boolean' }
  },
  required: ['answer', 'points', 'promised', 'covered']
};

const turnKey = c => String(c ?? '').replace(/[^\d]/g, '').replace(/^0+/, '');
const clip = (s, n) => (s.length > n ? `${s.slice(0, n)}…` : s);

// The model's answer, checked: a point stays only if every turn it cites was given; the cited turns go back
// as quotes ({ key: [who, role, text] }).
export function checkTown(raw, rows) {
  const byKey = new Map(rows.map(t => [t.key, t]));
  const points = cited(raw?.points, new Set(byKey.keys()), turnKey, TOWN_LIMITS.points);
  const str = x => (typeof x === 'string' ? x.trim() : '');
  const quotes = {};
  for (const k of points.flatMap(p => p.cites)) quotes[k] ||= [byKey.get(k).w, byKey.get(k).r, clip(byKey.get(k).text, TOWN_LIMITS.quote)];
  return { answer: str(raw?.answer), points, promised: str(raw?.promised), quotes, covered: raw?.covered === true && points.length > 0 };
}

// /law-ask's job for one member's questions (law.js JOBS); fail(code, status) for a turn-away.
export async function townJob(ask, { fail }) {
  const doc = await readData(`council/town/${ask.tc}/${ask.file}.json`);
  const paper = doc?.papers?.[ask.url];
  const got = townTurns(paper, ask.n);
  if (!got) return fail('town', 404);
  const where = [doc.n, paper.nth, paper.d].filter(Boolean).join(' ');
  return {
    key: `law:town:v1:${await sha256Hex([ask.tc, ask.file, ask.url, ask.n, got.ask.from, got.ask.to, got.ask.w, ask.lang, ...(paper.machine ? [paper.built] : [])].join('|'))}`,
    ttl: TOWN_TTL_S,
    info: { town: { w: got.ask.w, d: paper.d || '' } },
    prompt: townPrompt(where, got.ask, got.rows, ask.lang, !!paper.machine),
    schema: TOWN_SCHEMA,
    check: raw => checkTown(raw, got.rows)
  };
}

// ---- mode 'paper': one part of a 代表會's paper in a few lines ----
// { mode: 'paper', tc, file, url, from, to, lang }: a part of a paper Orbit Law reads into the app (施政報告, one
// office's 工作報告, 致詞: papers[url].text, its characters from … to, the part as Law's lib/town-paper.mjs splits it).
// Gemini sums up that part only, on a person's tap, kept a year: the first reader's tap answers everyone after.
export const PAPER_LIMITS = { chars: 12_000, points: 6 };
export const paperAsk = b => /^\d{8}$/.test(String(b?.tc)) && /^t\d{1,2}-\d{1,3}[re]$/.test(String(b?.file)) && typeof b?.url === 'string' && /^https:\/\/[\w.-]+\.gov\.tw\/[^\s"<>]{1,300}\.pdf$/i.test(b.url) && Number.isInteger(b?.from) && Number.isInteger(b?.to) && b.from >= 0 && b.to > b.from && b.to - b.from <= 60_000;

export function paperPrompt(where, kind, text, lang) {
  return `Below is part of a paper from a Taiwanese township council's session (${where}): ${kind}, as read from its PDF (table columns may run together). Return JSON matching the schema.

Paper:
${text}

answer: 1 to 2 plain sentences for a resident: what this part reports.
points: up to ${PAPER_LIMITS.points}, the most useful concrete things in it for a resident (a project and where it stands, a figure, a date, a place), each one short sentence, in the order they appear.

Rules:
- Use only the paper above. Nothing from outside; don't fill gaps or judge.
- Keep every figure, date and name exactly as the paper gives them.
- Leave out greetings, thanks and routine filing ("如書面資料").
- covered: true when the part holds real content.
- Write everything in ${LANG(lang)}.`;
}

export const PAPER_SCHEMA = {
  type: 'object',
  properties: { answer: { type: 'string' }, points: { type: 'array', items: { type: 'string' } }, covered: { type: 'boolean' } },
  required: ['answer', 'points', 'covered']
};

export function checkPaper(raw) {
  const str = x => (typeof x === 'string' ? x.trim() : '');
  const points = (Array.isArray(raw?.points) ? raw.points : []).map(str).filter(Boolean).slice(0, PAPER_LIMITS.points);
  const answer = str(raw?.answer);
  return { answer, points, covered: raw?.covered === true && (points.length > 0 || answer.length > 0) };
}

export async function paperJob(ask, { fail }) {
  const doc = await readData(`council/town/${ask.tc}/${ask.file}.json`);
  const paper = doc?.papers?.[ask.url];
  const text = typeof paper?.text === 'string' ? paper.text.slice(ask.from, ask.to).slice(0, PAPER_LIMITS.chars).trim() : '';
  if (text.replace(/\s/g, '').length < 40) return fail('town', 404);
  return {
    key: `law:paper:v1:${await sha256Hex([ask.tc, ask.file, ask.url, ask.from, ask.to, ask.lang, text.length].join('|'))}`,
    ttl: TOWN_TTL_S,
    info: {},
    prompt: paperPrompt(doc.n || '', paper.k || '', text, ask.lang),
    schema: PAPER_SCHEMA,
    check: checkPaper
  };
}
