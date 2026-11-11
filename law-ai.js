// Orbit Law's AI on the family's door (ai.js runs them; the plan's three
// Law items, Jay 11-10 "go to do everything"):
//
//   law-contract-read  拍合約幫你看, step 1 (a tap): a photo or PDF of a contract
//                      read into its clauses, word for word. Gemini reads.
//   law-contract       step 2 (a tap): each clause read against the articles
//                      code picked for its kind and words (Orbit Law's own
//                      copy of the law), every flag citing them. Sonnet judges.
//   law-minutes        會議紀錄變表格 (Law's nightly build, through /ai/build):
//                      a 代表會's minutes code couldn't split, or a scan, into
//                      rows: the proposal, who, the vote, the result. Flash-Lite.
//   law-weekly         你追蹤的法案週報's lines (the nightly build): what a bill
//                      that moved this week, or a law just amended, changes,
//                      one plain line each, made once and shared. Haiku.
//
// Code first: the clauses of a pasted contract, the minutes code can read
// (竹北's, every proposal form with its 議決) and the week itself (what
// moved, from Law's own data) never reach a model.
import { readLaw } from './law.js';
import { readGround, matchFacts } from './law-ground.js';
import { str, list, S, N, obj, arr, text, numbersFrom, fileOf } from './ai-util.js';

const ZH = '繁體中文（台灣用語，全形標點）';
const langOf = en => (en ? 'English' : ZH);

// ---- 拍合約幫你看 ------------------------------------------------------------------

export const CONTRACT_KINDS = { rent: '房屋租賃', work: '打工或工作', pledge: '切結書、同意書或保證書', other: '其他契約' };

// The articles a contract is read against: a few for its kind, then those
// its own words call for (a clause on 押金 brings 租賃條例 §7), then the two
// every contract answers to. 'pcode:key' as Orbit Law writes a cite.
const LAWS = { rent: 'D0060125', civil: 'B0000001', labor: 'N0030001', wage: 'N0030028', consumer: 'J0170001', pension: 'N0030020', insurance: 'N0050001', gender: 'N0030014', privacy: 'I0050021' };
const L = (law, ...keys) => keys.map(k => `${LAWS[law]}:${k}`);
const CORE = {
  rent: [...L('rent', 5, 7), ...L('civil', 423, 429), ...L('consumer', '11-1', 12)],
  work: [...L('labor', 21), ...L('wage', 5), ...L('labor', 22, 26, 24, 30, 38)],
  pledge: [...L('civil', 17, 72)],
  other: []
};
const ALWAYS = [...L('civil', 71, '247-1')];
// [words in the contract, the kinds they matter for ('' every kind), the articles]
const TOPICS = [
  [/押金|保證金|擔保金/, 'rent', L('rent', 7)],
  [/修繕|維修|修理|損壞|毀損|故障/, 'rent', [...L('rent', 8), ...L('civil', 429, 430, 432)]],
  [/轉租|分租|借住|同住/, 'rent', [...L('rent', 9), ...L('civil', 443)]],
  [/提前|終止|解約|退租|搬離|搬出/, 'rent', [...L('rent', 10, 11), ...L('civil', 450, 453)]],
  [/點交|返還|歸還|遷出|原狀/, 'rent', [...L('rent', 12), ...L('civil', 455)]],
  [/遲延|逾期|欠租|未繳|未付/, 'rent', L('civil', 440)],
  [/寵物|用途|使用方法|營業|改裝|裝潢/, 'rent', L('civil', 438)],
  [/房屋稅|地價稅|管理費|水電|電費|瓦斯/, 'rent', L('rent', 8)],
  [/違約金|罰款|罰金|罰則|賠償|扣除|沒收/, '', L('civil', 250, 252)],
  [/扣薪|扣款|扣除|預扣|罰款|賠償|押金|保證金/, 'work', L('labor', 22, 26)],
  [/加班|延長工作|延長工時|超時/, 'work', L('labor', 24, 32)],
  [/工時|上班時間|工作時間|每日|每週|休息/, 'work', L('labor', 30, 35, 36)],
  [/休假|例假|國定|特休|請假|颱風/, 'work', L('labor', 36, 37, 38, 39)],
  [/競業|同業|離職後/, 'work', L('labor', '9-1')],
  [/服務年限|最低服務|綁約|未滿.{0,4}(年|個月).{0,8}(離職|賠)|培訓費/, 'work', L('labor', '15-1')],
  [/離職|辭職|預告|提出/, 'work', L('labor', 15, 16)],
  [/資遣|解僱|開除|終止|懲戒/, 'work', L('labor', 11, 12, 14, 16, 17)],
  [/調動|調職|調派|輪調/, 'work', L('labor', '10-1')],
  [/勞保|健保|保險/, 'work', L('insurance', 6)],
  [/勞退|退休金|提繳/, 'work', L('pension', 6, 14)],
  [/結婚|懷孕|分娩|育兒|生育/, 'work', L('gender', 11)],
  [/夜間|晚上|午後|二十二時|22[:：時]|23[:：時]/, 'work', L('labor', 48, 49)],
  [/拋棄|放棄|不得主張|不得異議|概不負責|不負任何|一切責任|不得請求/, '', [...L('civil', 17, '247-1'), ...L('consumer', 12)]],
  [/審閱/, 'rent', L('consumer', '11-1')],
  [/個人資料|個資|肖像|照片|影像|錄影|監視/, '', L('privacy', 19, 20)],
  [/自由|不得離開|不得交往|戀愛|出國|人身/, '', L('civil', 17, 72)]
];
const MINOR = /未滿十八|未滿18|未成年|法定代理人|家長同意|監護人/;
const MINOR_ARTS = { '': L('civil', 77, 79), work: L('labor', 44, 46, 47, 48) };

export const CONTRACT_LIMITS = { clauses: 80, clause: 1200, chars: 14_000, arts: 28, artChars: 1000, allChars: 11_000 };

// The contract's kind from its own words, when the reader didn't say.
export function contractKind(t) {
  const s = String(t || '');
  if (/切結|保證書|同意書|承諾書/.test(s)) return 'pledge';
  if (/出租人|承租人|租金|房東|房客|租賃/.test(s)) return 'rent';
  if (/雇主|勞工|工資|時薪|薪資|勞動|僱傭|打工|受僱/.test(s)) return 'work';
  return 'other';
}

// The articles' keys for a contract, in the order they matter, at most `max`:
// its kind's first three, then one from each group in turn (the rest of its
// kind's, a minor's, each topic its words raise), so no topic crowds out another.
export function articlesFor({ kind, clauses, minor = false }, max = CONTRACT_LIMITS.arts) {
  const all = clauses.map(c => c.text).join('\n');
  const core = CORE[kind] || [];
  const groups = [core.slice(3)];
  if (minor || MINOR.test(all)) groups.push(...(kind === 'work' ? [MINOR_ARTS.work] : []), MINOR_ARTS['']);
  for (const [re, k, arts] of TOPICS) if ((!k || k === kind) && re.test(all)) groups.push(arts);
  const keys = [...core.slice(0, 3)];
  for (let i = 0; groups.some(g => g.length > i); i++) for (const g of groups) if (g[i]) keys.push(g[i]);
  const seen = new Set();
  const out = [];
  // (The two every contract answers to are kept whatever else is cut.)
  for (const k of keys) if (!seen.has(k) && !ALWAYS.includes(k)) seen.add(k) && out.push(k);
  return [...out.slice(0, max - ALWAYS.length), ...ALWAYS];
}

// The articles' words, read from Orbit Law's laws: [{ key, n (the law), label, text }].
export async function articleTexts(keys, read = readLaw) {
  const laws = new Map();
  for (const p of new Set(keys.map(k => k.split(':')[0]))) laws.set(p, await read(p).catch(() => null));
  const out = [];
  let chars = 0;
  for (const key of keys) {
    const [p, a] = key.split(':');
    const law = laws.get(p);
    const art = law?.a?.find(x => Array.isArray(x) && x[0] === 'A' && String(x[1]) === a);
    if (!art) continue;
    let t = String(art[2]);
    if (t.length > CONTRACT_LIMITS.artChars) t = `${t.slice(0, CONTRACT_LIMITS.artChars)}…`;
    if (chars + t.length > CONTRACT_LIMITS.allChars) continue;
    chars += t.length;
    const [n, sub] = a.split('-');
    out.push({ key, n: law.n.replace(/（.*?）$/, ''), label: `第${n}條${sub ? `之${sub}` : ''}`, text: t });
  }
  return out;
}

const clauseList = clauses => clauses.map(c => `[${c.id}] ${c.n ? `${c.n} ` : ''}${c.text}`).join('\n');
const LEVELS = ['void', 'unfair', 'check'];
export const RESULTS = ['通過', '修正通過', '保留', '不通過', '撤回', '退回', '擇日再議', '未議決'];

export const LAW_FEATURES = {
  'law-contract-read': {
    app: 'law',
    tap: true,
    models: ['flash', 'sonnet'],
    effort: { flash: 'low', sonnet: 'low' },
    timeoutMs: 60_000,
    maxIn: 3000,
    perPass: 12,
    perMinute: 4,
    input(raw) {
      const files = list(raw?.files, 8).map(f => fileOf(f, /^(image\/(jpeg|png|webp)|application\/pdf)$/, 5_500_000)).filter(Boolean);
      const pdfs = files.filter(f => f.mime === 'application/pdf');
      if (!files.length || (pdfs.length && files.length > 1) || files.reduce((n, f) => n + f.data.length, 0) > 5_600_000) return null;
      return { files, en: raw?.lang === 'en' };
    },
    parts: ({ files }) => [
      {
        text: [
          'This is a contract or a paper a person in Taiwan is asked to sign: a lease, a part-time job contract, a 切結書, an agreement. Photos are its pages in order.',
          'Transcribe it into its clauses, exactly as printed: the same words in the same order (fix only line breaks and obvious scan noise); never summarise, reword or translate.',
          'clauses: one item per numbered clause (第三條, 三、, 3.), its sub-items inside it; a part without a number (the opening, a note) is its own item. n: the clause number as printed, "" when none. text: its words. A blank to fill stays ＿＿; handwriting filled in goes in 【】.',
          'Leave out the signature block, stamps, addresses, phone numbers and ID numbers: write 〔個資略〕 in their place, never a person’s name or number.',
          'kind: rent (a lease of a home or room), work (a job, part-time work, an internship), pledge (切結書, 同意書, 保證書, 承諾書), other (another contract), none (not a contract, or unreadable).',
          'title: the paper’s own title. parties: each side as the paper names its role (出租人, 承租人, 甲方, 乙方, 雇主, 勞工, 立書人) and who that is in plain words (房東, 房客, 公司, 員工, 學生), never a person’s name.'
        ].join('\n')
      },
      ...files.map(f => ({ inlineData: { mimeType: f.mime, data: f.data } }))
    ],
    schema: obj({ kind: { type: 'string', enum: ['rent', 'work', 'pledge', 'other', 'none'] }, title: S, parties: arr(obj({ role: S, who: S })), clauses: arr(obj({ n: S, text: S })) }),
    clean(raw) {
      const kind = ['rent', 'work', 'pledge', 'other', 'none'].includes(raw?.kind) ? raw.kind : 'other';
      const clauses = list(raw?.clauses, CONTRACT_LIMITS.clauses)
        .map(c => ({ n: str(c?.n, 16), text: String(c?.text ?? '').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, CONTRACT_LIMITS.clause) }))
        .filter(c => c.text.length >= 2);
      if (kind === 'none' && !clauses.length) return { kind, title: '', parties: [], clauses: [] };
      if (!clauses.length) return null;
      const parties = list(raw?.parties, 4)
        .map(p => ({ role: str(p?.role, 12), who: str(p?.who, 12) }))
        .filter(p => p.role);
      return { kind: kind === 'none' ? contractKind(clauses.map(c => c.text).join('\n')) : kind, title: str(raw?.title, 40), parties, clauses };
    }
  },

  'law-contract': {
    app: 'law',
    tap: true,
    models: ['sonnet', 'sol'],
    effort: { sonnet: 'medium', flash: 'low' },
    timeoutMs: 90_000,
    maxIn: 30_000,
    perPass: 10,
    perMinute: 3,
    input(raw) {
      let chars = 0;
      const clauses = [];
      for (const c of list(raw?.clauses, CONTRACT_LIMITS.clauses)) {
        const t = String(c?.text ?? '').replace(/[ \t]+/g, ' ').trim().slice(0, CONTRACT_LIMITS.clause);
        if (t.length < 2 || chars + t.length > CONTRACT_LIMITS.chars) continue;
        chars += t.length;
        clauses.push({ id: clauses.length + 1, n: str(c?.n, 16), text: t });
      }
      if (!clauses.length) return null;
      const all = clauses.map(c => c.text).join('\n');
      const kind = CONTRACT_KINDS[raw?.kind] ? raw.kind : contractKind(all);
      return { kind, clauses, side: str(raw?.side, 12), who: str(raw?.who, 12), minor: raw?.minor === true, title: str(raw?.title, 40), en: raw?.lang === 'en' };
    },
    async parts(input) {
      const arts = await articleTexts(articlesFor(input));
      const facts = await readGround('ai/facts.json');
      const figs = matchFacts(facts?.facts, input.clauses.map(c => c.text).join('\n') + (input.kind === 'work' ? ' 最低工資' : '')).map(f => String(f.text || '')).filter(Boolean);
      // (Kept on the input for clean: the cites and numbers it may use.)
      input.arts = arts;
      input.figs = figs;
      const side = input.side ? `${input.side}${input.who ? `（${input.who}）` : ''}` : input.who;
      return text(
        [
          `You check a contract (${CONTRACT_KINDS[input.kind]}) that a person in Taiwan has been asked to sign, for them${side ? `: they are ${side}` : ''}${input.minor ? ', and they are under 18' : ''}.`,
          'Read every clause against the articles below (Taiwan’s law as Orbit Law publishes it) and flag only what matters to them:',
          '- level "void": the clause breaks one of these articles, the law makes it void (無效), or it has them give up a right an article gives them.',
          '- level "unfair": legal but one-sided against them, and an article gives them something to push back with (顯失公平, 違約金過高可酌減, 審閱期).',
          '- level "check": not against the law, but a cost or a rule they must not miss, where an article sets what happens otherwise.',
          `Each flag: clause = the clause’s number in [ ]; what = what the clause makes them do or give up (≤ 30 字); why = what the article says instead (≤ 70 字); cites = the article keys it rests on, exactly as given in [ ] (e.g. ${LAWS.labor}:26), at least one; ask = what to ask the other side to change it to (≤ 30 字), "" when nothing to ask. Most serious first; one flag a clause.`,
          'missing: at most 3 things these articles say a contract of this kind should settle and this one doesn’t (when the deposit comes back, who pays repairs), each with cites; [] when none.',
          'summary: ONE line (≤ 36 字): how many clauses need fixing and the most serious, or that none of these articles is broken.',
          'Never flag a clause these articles don’t speak to; never cite an article not given. Every number you write must be in the clauses, the articles or the figures. Plain words a high-school student understands; no disclaimers (the app shows one).',
          `Write in ${langOf(input.en)}; article names as given.`,
          figs.length ? `Official figures:\n${figs.join('\n')}` : '',
          `Articles:\n${arts.map(a => `[${a.key}] ${a.n} ${a.label}：${a.text}`).join('\n')}`,
          `${input.title ? `The paper: ${input.title}\n` : ''}Clauses:\n${clauseList(input.clauses)}`
        ]
          .filter(Boolean)
          .join('\n')
      );
    },
    schema: obj({
      summary: S,
      flags: arr(obj({ clause: N, level: { type: 'string', enum: LEVELS }, what: S, why: S, cites: arr(S), ask: S })),
      missing: arr(obj({ what: S, cites: arr(S) }))
    }),
    clean(raw, input) {
      const arts = new Map((input.arts || []).map(a => [a.key, a]));
      // (An article's own number, 第247條之1, may be named too.)
      const given = [clauseList(input.clauses), ...(input.arts || []).map(a => `${a.key} ${a.label} ${a.text}`), ...(input.figs || [])].join('\n');
      const keyOf = c => String(c ?? '').replace(/[：\s]/g, m => (m === '：' ? ':' : '')).replace(/^\[|\]$/g, '');
      const citesOf = x => [...new Set(list(x?.cites, 4).map(keyOf))].filter(k => arts.has(k));
      const ids = new Set(input.clauses.map(c => c.id));
      const flags = [];
      const used = new Set();
      for (const f of list(raw?.flags, 20)) {
        const clause = Number(f?.clause);
        const cites = citesOf(f);
        const what = str(f?.what, 80), why = str(f?.why, 160), ask = str(f?.ask, 80);
        if (!ids.has(clause) || !cites.length || !what || !LEVELS.includes(f?.level) || used.has(clause)) continue;
        if (!numbersFrom(`${what} ${why}`, given)) continue;
        used.add(clause);
        // (An ask with a number of its own, a sum it worked out, is left out; the flag stays.)
        flags.push({ clause, level: f.level, what, why, cites, ask: numbersFrom(ask, given) ? ask : '' });
        if (flags.length >= 12) break;
      }
      flags.sort((a, b) => LEVELS.indexOf(a.level) - LEVELS.indexOf(b.level));
      const missing = list(raw?.missing, 3)
        .map(m => ({ what: str(m?.what, 80), cites: citesOf(m) }))
        .filter(m => m.what && m.cites.length && numbersFrom(m.what, given));
      let summary = str(raw?.summary, input.en ? 160 : 80);
      if (!numbersFrom(summary, given)) summary = '';
      if (!summary && !flags.length && !missing.length) return null;
      // Each cited article's law and number, for the cards' chips (opened in the app by its key).
      const cited = [...new Set([...flags, ...missing].flatMap(x => x.cites))];
      const laws = Object.fromEntries(cited.map(k => [k, [arts.get(k).n, arts.get(k).label]]));
      return { summary, flags, missing, laws, kind: input.kind, checked: [...arts.keys()].length };
    }
  },

  // 會議紀錄變表格: only what Law's build couldn't read itself (lib/minutes.mjs
  // in Orbit Law: 竹北's sittings, every proposal form with its 議決).
  'law-minutes': {
    build: 'law',
    models: ['lite', 'luna'],
    effort: 'low',
    timeoutMs: 120_000,
    maxIn: 42_000,
    input(raw) {
      const t = String(raw?.text ?? '').slice(0, 40_000);
      const pdf = fileOf(raw?.pdf, /^application\/pdf$/, 9_000_000);
      if (t.replace(/\s/g, '').length < 200 && !pdf) return null;
      return { town: str(raw?.town, 30), session: str(raw?.session, 40), text: pdf ? '' : t, pdf, cut: !pdf && String(raw?.text ?? '').length > 40_000 };
    },
    parts: ({ town, session, text: t, pdf, cut }) => [
      {
        text: [
          `These are the minutes (議事錄) of ${town || 'a township council (代表會) in Taiwan'}${session ? `, ${session}` : ''}${pdf ? ' (a scanned PDF)' : ', as text: the speeches between proposals are cut'}${cut ? '; the text also stops before the end of the minutes, so a proposal whose result is past the end is 未議決' : ''}.`,
          'List every proposal (提案, 議案, 臨時動議) the council decided or discussed, in order:',
          'no: its number as written (鎮長提案第1號, 代表提案第3號, 臨時動議第1號, 甲字第2號), "" when none; kind: its 類別 (民政, 建設…) or ""; by: who proposed it as written (鄉長蔣煙燈 → 蔣煙燈; several joined by 、), "" when not said; what: its 案由 in the minutes’ own words, at most 60 字 (count them; keep in this order the project or place, what is asked, the total amount; drop the 補助/自籌 split first when it won’t fit; drop 敬請貴會…, 提請審議); copy every figure exactly as written: when a figure is cut off in the text (「合計新台幣467」 and the line ends), leave it out; never complete, round or add up figures (never 「467萬餘元」);',
          'result: one of 通過, 修正通過, 保留, 不通過, 撤回, 退回, 擇日再議, 未議決 (照案通過, 照原案通過 are 通過; 照審查意見通過 is 通過 only when the 審查意見 keeps the case as proposed, else 修正通過 with the change, e.g. 刪減50萬元, in note; 保留 = held for later in this session, 擇日再議 = moved to another day, 退回 = sent back to the 公所); note: how it was amended or why held, ≤ 30 字, else ""; vote: the count if a vote was taken (贊成 7 票、反對 2 票), else ""; d: the day it was decided, YYYY-MM-DD (西元 = 民國 + 1911, so 民國 114 年 = 2025), only when the proposal sits under a dated 次會 heading or a date is written next to it; never take it from the agenda (日程) list; when the meeting spans several days and this proposal’s day isn’t shown, "".',
          'Only what the minutes say. Never guess a result: when the minutes don’t say, 未議決. Speeches, reports (工作報告) and questions (質詢) are not proposals; when there is no proposal, items is []. by and no: keep the characters exactly as written (黄 stays 黄).'
        ].join('\n')
      },
      pdf ? { inlineData: { mimeType: 'application/pdf', data: pdf.data } } : { text: t }
    ],
    schema: obj({ items: arr(obj({ no: S, kind: S, by: S, what: S, result: { type: 'string', enum: RESULTS }, note: S, vote: S, d: S })) }),
    clean: (raw, input) => cleanMinutes(raw, input)
  },

  // 你追蹤的法案週報: Law's build sends the week's moved bills and amended
  // laws (their purpose and changed articles, code-cut); each gets one line.
  'law-weekly': {
    build: 'law',
    models: ['haiku', 'luna'],
    effort: { luna: 'low' },
    timeoutMs: 60_000,
    maxIn: 20_000,
    input(raw) {
      const items = list(raw?.items, 40)
        .map(x => ({ id: str(x?.id, 60), kind: x?.kind === 'law' ? 'law' : 'bill', name: str(x?.name, 80), about: str(x?.about, 320), arts: list(x?.arts, 6).map(a => str(a, 260)).filter(Boolean) }))
        .filter(x => x.id && x.name && (x.about || x.arts.length));
      return items.length ? { items } : null;
    },
    parts: ({ items }) =>
      text(
        [
          'For each item below, a bill in Taiwan’s 立法院 (kind bill: its stated purpose) or a law just amended (kind law: its changed articles), write ONE line saying what it changes for people, in plain words a high-school student understands.\nA bill’s about is its proposers’ stated purpose, sometimes several joined by ；. Text after 現行 describes today’s rule, not the change. A bill’s arts such as 第22條（8 案） only say which articles the proposals touch and how many proposals there are, not what they say. For a bill, name the concrete rule it would change (who must do what, what becomes allowed or required). Never present a 現行 rule as the change, and never add effects it does not state (no 更明確, 更完整, 保障健康).',
          `line: ${ZH}, ≤ 32 字, starting with what changes (不是「本法案旨在」), no law name (the card shows it), no stage (the card shows it), no opinion. Every number you write must be in that item, written as the item writes it; never take a number or date from the id.`,
          'A law’s arts are snippets of changed articles; … marks text left out. Each change shows as 【new words】（原：the words they replaced）, 【new words】 alone (words added), 【刪去：words taken out】, or a whole article that is new. Say what the change does for people, not that words moved. Taking out a limiting word widens who or what is covered: 認可之【刪去：民營】機構 means any approved institution may now do it, not only private ones (never write 不含民營). If a change depends on text hidden behind … (for example which 項 or 款 now apply), leave it out rather than guess.',
          'Return one item per id. If an item does not say concretely what changes (only a goal, or only article numbers and proposal counts), return line "" for it; never fill it with a guess or a restated goal.',
          JSON.stringify(items)
        ].join('\n')
      ),
    schema: obj({ items: arr(obj({ id: S, line: S })) }),
    clean(raw, { items }) {
      const given = new Map(items.map(x => [x.id, JSON.stringify([x.name, x.about, x.arts])]));
      const out = {};
      for (const it of list(raw?.items, 60)) {
        const src = given.get(String(it?.id || ''));
        const line = str(it?.line, 60);
        // (Past its length it was cut mid-word: left out, never shown cut.)
        if (!src || !line || String(it.line).trim().length > 48 || !numbersFrom(line, src)) continue;
        out[it.id] = line;
      }
      return Object.keys(out).length ? out : null;
    }
  }
};

// ---- 會議紀錄變表格: what may be kept -----------------------------------------------

const HAN = /[㐀-鿿]/;
const pairsOf = t => {
  const s = [...String(t).replace(/[^㐀-鿿A-Za-z0-9]/g, '')];
  const out = new Set();
  for (let i = 0; i + 1 < s.length; i++) out.add(s[i] + s[i + 1]);
  return out;
};
// A row stays when its words are the minutes' own: each proposer named in
// them, most of the 案由's character pairs found there, its numbers theirs.
// (A scan has no text to check against: its rows keep only what's well formed.)
export function cleanMinutes(raw, { text: t = '', pdf = null } = {}) {
  const src = String(t);
  const flat = src.replace(/\s/g, '');
  const have = pdf ? null : pairsOf(src);
  const out = [];
  for (const it of list(raw?.items, 120)) {
    const what = str(it?.what, 90);
    const result = RESULTS.includes(it?.result) ? it.result : '';
    if (!what || !result || !HAN.test(what)) continue;
    if (have) {
      const p = [...pairsOf(what)];
      if (!p.length || p.filter(x => have.has(x)).length / p.length < 0.7 || !numbersFrom(what, src)) continue;
    }
    const by = str(it?.by, 40)
      .split(/[、,，及和]/)
      .map(x => x.trim())
      .filter(x => x && (pdf || flat.includes(x)))
      .join('、');
    const d = /^\d{4}-\d{2}-\d{2}$/.test(it?.d || '') ? it.d : '';
    const vote = str(it?.vote, 30);
    out.push({ no: str(it?.no, 24).replace(/\s/g, ''), kind: str(it?.kind, 12), by, what, result, note: str(it?.note, 50), vote: !pdf && vote && !numbersFrom(vote, src) ? '' : vote, d });
  }
  return { items: out };
}
