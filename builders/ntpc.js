// 新北's own list of its bus routes (data.ntpc.gov.tw, open data, no key):
// each route's first and last bus both ways, its headways and, for some,
// the times it leaves each end. TDX's timetable has only one way for 291 of
// New Taipei's 636 routes (2026-11-09: 988 往 新市站 at 新北板橋公車站 said
// 沒有排班資料); the way it lacks is filled from this list, at the way's
// first stop (the app adds the ride to the stops after it).
export const NTPC_ROUTES = 'https://data.ntpc.gov.tw/api/datasets/0ee4e6bf-cee6-4ec8-8fe1-71f544015127/csv/file';

// RFC 4180 CSV → [{ column: value }].
export function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let q = false;
  const s = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) {
      if (c === '"' && s[i + 1] === '"') (cell += '"'), i++;
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') row.push(cell), (cell = '');
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i++;
      row.push(cell), rows.push(row), (row = []), (cell = '');
    } else cell += c;
  }
  if (cell || row.length) row.push(cell), rows.push(row);
  const [head, ...body] = rows;
  return (head ? body : []).filter(r => r.length > 1).map(r => Object.fromEntries(head.map((h, i) => [h.trim(), (r[i] ?? '').trim()])));
}

const WEEKDAYS = 62; // Monday to Friday (bit 0 Sunday, as buses.js daysOf)
const HOLIDAYS = 65; // Saturday and Sunday
const mins = t => {
  const m = /^(\d{1,2}):?(\d{2})$/.exec(String(t || '').trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};
const hhmm = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
// '1215' → [12, 15]; '10' → [10, 10]; '' → null.
const headway = x => {
  const d = String(x || '').replace(/\D/g, '');
  if (!d) return null;
  const [a, b] = d.length === 4 ? [Number(d.slice(0, 2)), Number(d.slice(2))] : [Number(d), Number(d)];
  return a > 0 || b > 0 ? [Math.min(a, b) || Math.max(a, b), Math.max(a, b)] : null;
};
// A description's lists of times: 「988新北板橋公車站班表:0640 0740 …」 →
// [{ name: '988新北板橋公車站', times: [400, 460, …] }] (two at least).
export function timeLists(desc) {
  const out = [];
  // (A time is 4 digits or H:MM standing alone: 「… 2340 988直…」's 988 is the next list's name.)
  const T = '(?:(?:[01]?\\d|2[0-4]):[0-5]\\d|(?:[01]\\d|2[0-4])[0-5]\\d)(?![\\d:])';
  const re = new RegExp(`([^\\s:：、，,]*?)班表\\s*[:：]\\s*((?:${T}(?:[\\s、，,]+|$))+)`, 'g');
  for (let m; (m = re.exec(String(desc || ''))); ) {
    const times = (m[2].match(new RegExp(T, 'g')) || []).map(mins).filter(x => x != null);
    if (times.length >= 2) out.push({ name: m[1], times });
  }
  return out;
}

// One way's departures from its first stop on a kind of day, as the list
// has them: its own times where a list is of that way (named for its first
// stop, or starting at its first bus and ending at its last), else its
// first to last bus at the headway given (none given: first and last alone,
// a headway of 0). → { lists: [{ name, times }], freq: [from, to, min, max] | null }
function wayDay(row, back, holiday) {
  const f = k => row[(holiday ? 'holiday' : '') + k];
  const first = mins(f(back ? 'backfirstbustime' : 'gofirstbustime'));
  const last = mins(f(back ? 'backlastbustime' : 'golastbustime'));
  if (first == null || last == null) return null;
  const lists = timeLists(`${f('bustimedesc')} ${f('headwaydesc')}`);
  const hw = [headway(f('peakheadway')), headway(f('offpeakheadway'))].filter(Boolean);
  return { first, last, lists, freq: [hhmm(first), hhmm(last), hw.length ? Math.min(...hw.map(h => h[0])) : 0, hw.length ? Math.max(...hw.map(h => h[1])) : 0] };
}

// Fills, in a city pack (buses.js packCity's), each route's way that TDX
// has no timetable for. → how many ways were filled.
export function fillMissing(pack, rows) {
  const byName = new Map();
  for (const r of rows) if (r.namezh && !byName.has(r.namezh)) byName.set(r.namezh, r);
  const name = u => pack.stops?.[u]?.[0] || '';
  let filled = 0;
  for (const route of pack.routes || []) {
    const row = byName.get(route.name);
    if (!row) continue;
    const timed = new Set(route.sched.map(s => s[1]));
    for (const dir of [...new Set(route.ways.map(w => w[2]))]) {
      if (timed.has(dir)) continue;
      // (TDX's 0 the way out, 1 the way back, as the list's go and back.)
      const ways = route.ways.filter(w => w[2] === dir && w[3].length);
      if (!ways.length) continue;
      // (The route's own way first: its sub named as the route, else the one with the most stops.)
      const main = ways.find(w => w[1] === route.name) || ways.slice().sort((a, b) => b[3].length - a[3].length)[0];
      const trips = new Map(); // sub → [[days, minute]]
      const freq = [];
      for (const [holiday, bits] of [[false, WEEKDAYS], [true, HOLIDAYS]]) {
        const d = wayDay(row, dir === 1, holiday);
        if (!d) continue;
        // Its lists of this way: named for its first stop, or from its first bus to its last.
        const mine = d.lists.filter(l => ways.some(w => name(w[3][0]) && l.name.includes(name(w[3][0]))) || (l.times[0] === d.first && l.times.at(-1) === d.last));
        if (mine.length) {
          for (const l of mine) {
            // (Which sub: 「988直新北板橋公車站」 is 988直新市站's, by what's left of its name.)
            const v = l.name.replace(route.name, '').replace(name(main[3][0]), '');
            const tail = w => (w[1] || '').replace(route.name, '');
            const way = ways.filter(w => !v || tail(w).startsWith(v)).sort((a, b) => tail(a).length - tail(b).length)[0] || main;
            if (!trips.has(way[0])) trips.set(way[0], { way, list: [] });
            for (const t of l.times) trips.get(way[0]).list.push([bits, t]);
          }
        } else freq.push([bits, ...d.freq]);
      }
      if (!trips.size && !freq.length) continue;
      for (const { way, list } of trips.values()) route.sched.push([way[0], dir, [way[3][0]], list, []]);
      if (freq.length) route.sched.push([main[0], dir, [main[3][0]], [], freq]);
      filled++;
    }
  }
  return filled;
}

// New Taipei's pack filled from the list, read now (a week's build, one
// read). Failing, the pack stays as TDX has it. → how many ways were filled.
export async function fillNewTaipei(pack, get = fetch) {
  const r = await get(NTPC_ROUTES, { signal: AbortSignal.timeout?.(20_000) });
  if (!r.ok) return 0;
  return fillMissing(pack, parseCsv(await r.text()));
}
