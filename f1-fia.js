// The stewards' grid drops for an F1 race, from the FIA's own decision
// documents (fia.com, a PDF each), known days before the race: an engine
// part over the season's allowance is decided on the Thursday or Friday
// (Las Vegas 2026: Antonelli 5 places, Stroll, Sainz and Piastri 10,
// Bearman 35, all before qualifying), a collision in the last race at the
// end of that race. Race control says few of them (Jay 2026-11-21: "get the
// Grid Penalty info … a lot of grid penalty is known well before the race
// start"). Orbit Sports' projected grid.
//
// Served by the sports proxy as if from `https://f1-live.orbit/drops.json?start=<the race's start>`.
// The races in order from Jolpica's schedule (F1's archive index refuses the Workers).

const FIA = 'https://www.fia.com';
const F1_DOCS = `${FIA}/documents/championships/fia-formula-one-world-championship-14`;
const TIMEOUT = 10_000;

// ---- A PDF's words ----
// The FIA's documents are Word's PDFs: Arial subsets (Type0, Identity-H),
// each with its ToUnicode map or none (then Arial's own glyph order: glyph
// 3 the space, a letter its code less 29). Text drawn with Tj and TJ. Enough
// for these documents; not a PDF reader.
const latin1 = bytes => {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return s;
};
// zlib's deflate (PDF's FlateDecode), by the platform's own stream (Workers, Node 18+).
export const inflate = async bytes => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());

export async function pdfText(bytes) {
  const s = latin1(bytes);
  const streams = [];
  for (const m0 of s.matchAll(/(\d+) 0 obj([\s\S]*?)stream\r?\n/g)) {
    // (Only this stream's own object: the match runs on from an object with
    // no stream into the next one's, the dictionaries of both taken for it.)
    const k = m0[2].lastIndexOf('endobj');
    const own = k < 0 ? null : /(\d+) 0 obj([\s\S]*)$/.exec(m0[2].slice(k));
    const m = own ? { index: m0.index, 0: m0[0], 1: own[1], 2: own[2] } : m0;
    const start = m.index + m[0].length;
    const end = s.indexOf('endstream', start);
    // (Not a picture or a font's file: only page text and maps are read; a
    // picture's bytes held "Tj" by chance and the reading stalled on them.)
    // (A form, Word's page body here, is read: only a picture or a font's file is left.)
    if (end < 0 || /\/Subtype\s*\/Image|\/Length1|\/FontFile|\/BitsPerComponent/.test(m[2])) continue;
    // (Cut at its own /Length where it says one: the platform's inflate refuses the line break left before endstream.)
    const len = /\/Length (\d+)(?!\s+\d+\s+R)/.exec(m[2]);
    let data = bytes.subarray(start, len ? start + Number(len[1]) : end);
    if (/FlateDecode/.test(m[2])) {
      try {
        data = await inflate(data);
      } catch {
        // (A stream cut short: what came of it, if anything.)
        continue;
      }
    }
    streams.push({ id: m[1], text: latin1(data) });
  }
  const objs = new Map([...s.matchAll(/(\d+) 0 obj([\s\S]*?)endobj/g)].map(x => [x[1], x[2]]));
  const cmapOf = id => {
    const map = new Map();
    const st = streams.find(x => x.id === id);
    if (!st) return map;
    for (const b of st.text.matchAll(/beginbfchar([\s\S]*?)endbfchar/g)) for (const p of b[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) map.set(parseInt(p[1], 16), String.fromCodePoint(...p[2].match(/.{4}/g).map(h => parseInt(h, 16))));
    for (const b of st.text.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
      for (const p of b[1].matchAll(/<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g)) {
        const [a, z, u] = [parseInt(p[1], 16), parseInt(p[2], 16), parseInt(p[3], 16)];
        for (let i = a; i <= z && i - a < 512; i++) map.set(i, String.fromCodePoint(u + i - a));
      }
    return map;
  };
  // A font's name as the page calls it → its glyphs' letters.
  const fonts = new Map();
  for (const body of objs.values())
    for (const f of body.matchAll(/\/Font\s*<<([^>]*)>>/g))
      for (const r of f[1].matchAll(/\/([^\s/]+)\s+(\d+) 0 R/g)) {
        if (fonts.has(r[1])) continue;
        const fo = objs.get(r[2]) || '';
        const tu = /\/ToUnicode (\d+) 0 R/.exec(fo);
        fonts.set(r[1], { map: tu ? cmapOf(tu[1]) : new Map(), two: /Type0|Identity-H/.test(fo) });
      }
  const decode = (str, font) => {
    const bytes = [];
    if (str.startsWith('<')) {
      const h = str.slice(1, -1);
      for (let i = 0; i + 1 < h.length; i += 2) bytes.push(parseInt(h.slice(i, i + 2), 16));
    } else {
      const t = str.slice(1, -1);
      for (let i = 0; i < t.length; i++) {
        if (t[i] !== '\\') {
          bytes.push(t.charCodeAt(i));
          continue;
        }
        const n = t[++i];
        if (/[0-7]/.test(n)) {
          let o = n;
          while (/[0-7]/.test(t[i + 1]) && o.length < 3) o += t[++i];
          bytes.push(parseInt(o, 8));
        } else bytes.push({ n: 10, r: 13, t: 9, b: 8, f: 12 }[n] ?? n.charCodeAt(0));
      }
    }
    let out = '';
    if (font?.two)
      for (let i = 0; i + 1 < bytes.length; i += 2) {
        const g = bytes[i] * 256 + bytes[i + 1];
        out += font.map.get(g) ?? (g >= 3 && g <= 97 ? String.fromCharCode(g + 29) : '');
      }
    else for (const b of bytes) out += font?.map.get(b) ?? String.fromCharCode(b);
    return out;
  };
  let text = '';
  for (const st of streams) {
    if (!/T[jJ]/.test(st.text) || /begincmap/.test(st.text) || st.text.length > 400_000 || !/\bBT\b/.test(st.text)) continue;
    let font = null;
    for (const t of st.text.matchAll(/\/([^\s/]+)\s+[\d.]+\s+Tf|(\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f]*>)\s*Tj|\[((?:\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f]*>|[^\]])*)\]\s*TJ|(T\*|Td|TD|ET)\b/g)) {
      if (t[1]) font = fonts.get(t[1]) || null;
      else if (t[2]) text += decode(t[2], font);
      else if (t[3] != null) for (const p of t[3].matchAll(/\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f]*>|(-?\d+(?:\.\d+)?)/g)) text += p[1] != null ? (Number(p[1]) < -200 ? ' ' : '') : decode(p[0], font);
      else if (t[4]) text += ' ';
    }
  }
  return text.replace(/\s+/g, ' ').trim();
}

// ---- A decision's drop ----
// { no, name, session, kind: 'places'|'back'|'pitlane', n } from a stewards'
// document's words, or null (no grid drop in it: a fine, a reprimand, a
// time penalty, a lap deleted).
export function dropOf(text) {
  const t = String(text || '');
  // (The driver's name up to the document's next field, Competitor.)
  const who = /\b(\d{1,2}) - ([A-Z][\p{L}'’.-]+(?: [A-Z][\p{L}'’.-]+)*?)(?= Competitor\b| Team\b|$)/u.exec(t) || /\b(\d{1,2}) - ([A-Z][\p{L}'’.-]+(?: [A-Z][\p{L}'’.-]+){1,2})/u.exec(t);
  if (!who) return null;
  const places = /\bDrop of (\d+) grid positions?\b/i.exec(t);
  const kind = places ? 'places' : /\bback of the (?:starting )?grid\b/i.test(t) ? 'back' : /\bfrom the pit ?lane\b/i.test(t) ? 'pitlane' : '';
  if (!kind) return null;
  const session = /\b(Free Practice \d|Sprint Qualifying|Sprint Shootout|Qualifying|Sprint|Race)\b/.exec(t.slice(who.index))?.[1] || '';
  return { no: who[1], name: who[2], session, kind, n: places ? Number(places[1]) : 0 };
}

// ---- The documents ----
const page = (url, f) => f(url, { signal: AbortSignal.timeout(TIMEOUT) }).then(r => (r.ok ? r.text() : Promise.reject(new Error(`fia ${r.status}`))));
// A stewards' document that can decide a drop, by its file's name (never a
// classification, a lap deleted, the notes, a procedure).
// (By the file's name alone: every link's folder is decision-document/, and
// every document was read for it, the event's points and timetable too.)
export const mayDrop = href => {
  const name = String(href || '').split('/').pop();
  return /(infringement|decision|offence)/i.test(name) && !/deleted_lap|classification|summons|notes|procedure|entry_list|scrutineering|starting_grid|points/i.test(name);
};
export function docLinks(html, slug = '') {
  const links = [...String(html || '').matchAll(/href="(\/system\/files\/decision-document\/[^"]+\.pdf)"/g)].map(x => x[1]);
  return [...new Set(links)].filter(h => mayDrop(h) && (!slug || h.includes(slug)));
}
// "São Paulo Grand Prix" → "sao_paulo_grand_prix" (the documents' file names).
export const slugOf = name =>
  String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');

// A year's races in order, from Jolpica's schedule (F1's archive index
// turned the Workers away, 401): [{ name, at }], at the race's start (ms).
// Its names are the FIA's ("São Paulo Grand Prix", "Las Vegas Grand Prix").
export function racesOf(schedule) {
  return (schedule?.MRData?.RaceTable?.Races || [])
    .map(r => ({ name: r.raceName || '', at: Date.parse(`${r.date}T${r.time || '12:00:00Z'}`) }))
    .filter(r => r.name && Number.isFinite(r.at))
    .sort((a, b) => a.at - b.at);
}
// Whether a drop is served at this race: the last meeting's only if its
// race decided it (for the next one); this one's never if its race did
// (that's the next one's), but a pit-lane start, decided for this race, is.
export const servedAt = (d, last) => (last ? d.session === 'Race' : d.session !== 'Race' || d.kind === 'pitlane');

// Each of `list` through `fn`, four at a time (the FIA's site slowed to a
// stop asked for twenty PDFs at once).
async function inTurn(list, fn, n = 4) {
  const out = new Array(list.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(n, list.length) }, async () => {
    while (next < list.length) {
      const i = next++;
      out[i] = await fn(list[i]).catch(() => null);
    }
  }));
  return out;
}

// The race starting at `start`: its meeting's drops (all of them) and the
// last meeting's from its race (served at the next one), each car's once.
// [{ no, name, kind, n, session, doc }]
export async function raceDrops(start, { f = fetch } = {}) {
  const at = Date.parse(start);
  if (!Number.isFinite(at)) throw new Error('start');
  const year = new Date(at).getUTCFullYear();
  const schedule = await f(`https://api.jolpi.ca/ergast/f1/${year}.json?limit=100`, { signal: AbortSignal.timeout(TIMEOUT), cf: { cacheTtl: 6 * 3_600, cacheEverything: true } })
    .then(r => (r.ok ? r.json() : null))
    .catch(() => null);
  const races = racesOf(schedule);
  const root = await page(`${F1_DOCS}`, f).catch(() => '');
  const season = new RegExp(`season-${year}-(\\d+)`).exec(root)?.[1];
  if (!season) return [];
  // (No schedule read: no answer, never a guess. The FIA's open event stood
  // in once and was the last race's: Qatar given Las Vegas's drops.)
  if (!races.length) throw new Error('no schedule');
  const i = races.findIndex(r => Math.abs(r.at - at) < 86_400_000);
  if (i < 0) return [];
  const meetings = races;
  const event = async (m, last) => {
    const html = await page(`${F1_DOCS}/season/season-${year}-${season}/event/${encodeURIComponent(m.name)}`, f).catch(() => '');
    const docs = docLinks(html, `${year}_${slugOf(m.name)}`);
    const read = await inTurn(
      docs,
      async href => {
        const res = await f(`${FIA}${href}`, { signal: AbortSignal.timeout(TIMEOUT), cf: { cacheTtl: 7 * 86_400, cacheEverything: true } }).catch(() => null);
        if (!res?.ok) return null;
        const d = dropOf(await pdfText(new Uint8Array(await res.arrayBuffer())).catch(() => ''));
        return d && servedAt(d, last) ? { ...d, doc: `${FIA}${href}` } : null;
      }
    );
    return read.filter(Boolean);
  };
  const [prev, now] = await Promise.all([i > 0 ? event(meetings[i - 1], true) : [], event(meetings[i], false)]);
  const seen = new Set();
  return [...prev, ...now].filter(d => !seen.has(`${d.no}|${d.kind}|${d.n}|${d.session}`) && seen.add(`${d.no}|${d.kind}|${d.n}|${d.session}`));
}
