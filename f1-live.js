// F1's own live timing (the feed F1's app and timing screen read), for
// Orbit Sports' live board: the session's part and clock, the track's flag, the
// race's lap and each car's place, laps, gaps, tyres and whether it's in the
// pits or out. ESPN's copy of a live session is minutes behind and its gaps
// stand still, and OpenF1 closes to everyone while a session runs.
//
// The feed is SignalR (livetiming.formula1.com/signalrcore), open without a
// login over server-sent events: negotiate, open the stream, shake hands,
// subscribe, and the first answer is the whole state. One snapshot a call
// (the stream is closed after it), cached a few seconds for everyone.
//
// Served by the sports proxy as if from `https://f1-live.quadra/now.json`.

export const F1_LIVE_HOST = 'f1-live.quadra';
const BASE = 'https://livetiming.formula1.com/signalrcore';
const TOPICS = ['SessionInfo', 'SessionStatus', 'TrackStatus', 'LapCount', 'ExtrapolatedClock', 'DriverList', 'TimingData', 'TimingAppData', 'TimingStats', 'RaceControlMessages', 'WeatherData', 'Position.z', 'LapSeries', 'PitStopSeries'];
const RS = '\x1e';
const TIMEOUT = 8_000;

// "00:12:09" → seconds.
const seconds = t => String(t || '').split(':').reduce((n, x) => n * 60 + Number(x || 0), 0) || 0;
const list = x => (Array.isArray(x) ? x : x && typeof x === 'object' ? Object.values(x) : []);

// Each set of tyres a car ran: its compound, the laps on it here (TotalLaps
// is the set's age: less the age it was fitted at), new or used. A stint
// the feed splits without a change of tyres (TyresNotChanged: a red flag,
// the laps to the grid) is the same set: one stint, not a stop.
export function stintsOf(raw) {
  const out = [];
  for (const x of list(raw)) {
    const total = Number(x?.TotalLaps) || 0;
    const prev = out.at(-1);
    if (prev && x?.TyresNotChanged === '1') {
      prev.total = total;
      continue;
    }
    out.push({ c: x?.Compound || '', start: Number(x?.StartLaps) || 0, total, new: x?.New === 'true' });
  }
  return out.map(x => ({ c: x.c, laps: Math.max(0, x.total - x.start), new: x.new }));
}

// The feed's state, trimmed to what the board shows.
export function trimF1Live(r, now = Date.now()) {
  const info = r?.SessionInfo || {};
  const td = r?.TimingData || {};
  const app = r?.TimingAppData?.Lines || {};
  const ts = r?.TimingStats?.Lines || {};
  const drivers = r?.DriverList || {};
  const clock = r?.ExtrapolatedClock || {};
  const part = Number(td.SessionPart) || 0;
  // The time left as of now while it runs.
  const where = list(r?.Position?.Position).at(-1)?.Entries || {};
  const left = seconds(clock.Remaining) - (clock.Extrapolating && clock.Utc ? (now - Date.parse(clock.Utc)) / 1000 : 0);
  const cars = Object.entries(td.Lines || {})
    .map(([no, l]) => {
      const d = drivers[no] || {};
      const stint = list(app[no]?.Stints).at(-1);
      const stats = list(l.Stats)[part - 1] || {};
      return {
        no,
        tla: d.Tla || '',
        name: [d.FirstName, d.LastName].filter(Boolean).join(' ') || d.FullName || '',
        team: d.TeamName || '',
        colour: d.TeamColour ? `#${d.TeamColour}` : '',
        pos: Number(l.Position) || 99,
        best: list(l.BestLapTimes)[part - 1]?.Value || l.BestLapTime?.Value || '',
        last: l.LastLapTime?.Value || '',
        // (A practice gives its gaps on the line itself, not per part: none showed.)
        gap: typeof l.GapToLeader === 'string' ? l.GapToLeader : stats.TimeDiffToFastest || l.TimeDiffToFastest || '',
        interval: l.IntervalToPositionAhead?.Value ?? stats.TimeDifftoPositionAhead ?? l.TimeDiffToPositionAhead ?? '',
        laps: Number(l.NumberOfLaps) || 0,
        pits: Number(l.NumberOfPitStops) || 0,
        inPit: Boolean(l.InPit),
        pitOut: Boolean(l.PitOut),
        retired: Boolean(l.Retired),
        stopped: Boolean(l.Stopped),
        out: Boolean(l.KnockedOut),
        tyre: stint?.Compound || '',
        tyreLaps: Number(stint?.TotalLaps) || 0,
        tyreNew: stint?.New === 'true',
        // Orbit Sports' 數據: every stint (compound, laps), the grid slot, the best sectors and the speed trap's best (each with its place).
        stints: stintsOf(app[no]?.Stints),
        grid: Number(app[no]?.GridPos) || 0,
        // Its last lap's three sectors (as each comes; the one not done yet empty).
        lastSectors: list(l.Sectors).map(x => x?.Value || ''),
        sectors: list(ts[no]?.BestSectors).map(x => ({ v: x?.Value || '', p: Number(x?.Position) || 0 })),
        speed: { v: Number(ts[no]?.BestSpeeds?.ST?.Value) || 0, p: Number(ts[no]?.BestSpeeds?.ST?.Position) || 0 },
        // Every speed trap's best (the two intermediates, the finish line, the trap), each with its place.
        speeds: Object.fromEntries(['I1', 'I2', 'FL', 'ST'].map(k => [k.toLowerCase(), { v: Number(ts[no]?.BestSpeeds?.[k]?.Value) || 0, p: Number(ts[no]?.BestSpeeds?.[k]?.Position) || 0 }])),
        // A qualifying's best lap in each part (Q1, Q2, Q3), '' for a part not run.
        parts: list(l.BestLapTimes).map(x => x?.Value || ''),
        // How far round its lap: the mini-sectors passed of all (each timing
        // point's status set as the car passes it, cleared at the line).
        // F1's feed stopped giving the cars' x/y (Position.z) to everyone in
        // 2026: the map places each car by this instead.
        seg: (() => {
          const segs = list(l.Sectors).flatMap(x => list(x?.Segments));
          let done = 0;
          while (done < segs.length && segs[done]?.Status) done++;
          return segs.length ? [done, segs.length] : null;
        })(),
        // Each mini-sector's colour this lap, as F1's timing screen has it
        // (0 not yet, 2048 yellow, 2049 green: its own best, 2051 purple:
        // the session's best, 2064 the pit lane).
        segStatus: list(l.Sectors).flatMap(x => list(x?.Segments)).map(x => Number(x?.Status) || 0),
        // Where the car is on the track now (Position.z, F1's own x/y; the circuit's map is in the same space).
        at: where[no] && where[no].Status !== 'OffTrack' ? [where[no].X, where[no].Y] : null,
        pb: ts[no]?.PersonalBestLapTime?.Value ? { v: ts[no].PersonalBestLapTime.Value, lap: Number(ts[no].PersonalBestLapTime.Lap) || 0, p: Number(ts[no].PersonalBestLapTime.Position) || 0 } : null
      };
    })
    .sort((a, b) => a.pos - b.pos);
  const rcm = list(r?.RaceControlMessages?.Messages).at(-1);
  return {
    at: now,
    session: { key: info.Key || 0, type: info.Type || '', name: info.Name || '', start: info.StartDate || '', gmt: info.GmtOffset || '', status: r?.SessionStatus?.Status || info.SessionStatus || '', circuit: info.Meeting?.Circuit?.Key || 0 },
    weather: r?.WeatherData ? { air: Number(r.WeatherData.AirTemp) || 0, track: Number(r.WeatherData.TrackTemp) || 0, rain: r.WeatherData.Rainfall === '1' || Number(r.WeatherData.Rainfall) > 0, wind: Number(r.WeatherData.WindSpeed) || 0, humidity: Number(r.WeatherData.Humidity) || 0 } : null,
    meeting: info.Meeting?.Name || '',
    part,
    // How many mini-sectors each of the three sectors has (the same for every car): where the sector lines go on the map.
    sectorSegs: list(Object.values(td.Lines || {})[0]?.Sectors).map(x => list(x?.Segments).length),
    entries: list(td.NoEntries).map(Number),
    clock: { left: Math.max(0, Math.round(left)), running: Boolean(clock.Extrapolating) },
    track: { status: String(r?.TrackStatus?.Status || ''), message: r?.TrackStatus?.Message || '' },
    lap: r?.LapCount ? { now: Number(r.LapCount.CurrentLap) || 0, of: Number(r.LapCount.TotalLaps) || 0 } : null,
    message: rcm ? { text: rcm.Message || '', at: rcm.Utc || '' } : null,
    // Each car's place on every lap since the start, and its stops (Orbit Sports' 車手比較).
    places: placesOf(r?.LapSeries),
    stops: stopsOf(r?.PitStopSeries),
    // Race control's last words, newest first (the blue flags left out: a race has hundreds, each to one car being lapped).
    messages: list(r?.RaceControlMessages?.Messages)
      .filter(m => m?.Message && !/^WAVED BLUE FLAG/.test(m.Message))
      .slice(-8)
      .reverse()
      .map(m => ({ text: m.Message, at: m.Utc || '', lap: Number(m.Lap) || 0, flag: m.Flag || '', category: m.Category || '' })),
    // The safety car, the virtual one and the flags so far (Orbit Sports' race chart shades them), and what sent them out (a car stopped, a collision).
    control: list(r?.RaceControlMessages?.Messages)
      .filter(m => m.Category === 'SafetyCar' || /SAFETY CAR|VSC|STOPPED|CRASH|BARRIER|GRAVEL|INCIDENT INVOLVING|\bRED FLAG\b|TRACK CLEAR/i.test(m.Message || '') || m.Flag === 'RED' || (m.Flag === 'GREEN' && /RESUME|TRACK CLEAR/i.test(m.Message || '')))
      .slice(-30)
      .map(m => ({ at: m.Utc || '', lap: Number(m.Lap) || 0, category: m.Category || '', flag: m.Flag || '', message: m.Message || '' })),
    cars
  };
}

// One snapshot of the feed's state (its SignalR answer to Subscribe).
async function snapshot(topics = TOPICS) {
  const neg = await fetch(`${BASE}/negotiate?negotiateVersion=1`, { method: 'POST', signal: AbortSignal.timeout(TIMEOUT) });
  if (!neg.ok) throw new Error(`negotiate ${neg.status}`);
  const { connectionToken } = await neg.json();
  // The load balancer's cookie keeps the three calls on one server.
  const cookie = (neg.headers.getSetCookie?.() || [neg.headers.get('Set-Cookie') || '']).map(c => c.split(';')[0]).filter(Boolean).join('; ');
  const url = `${BASE}?id=${encodeURIComponent(connectionToken)}`;
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT);
  try {
    const stream = await fetch(url, { headers: { Accept: 'text/event-stream', Cookie: cookie }, signal: abort.signal });
    if (!stream.ok || !stream.body) throw new Error(`stream ${stream.status}`);
    const send = body => fetch(url, { method: 'POST', headers: { 'Content-Type': 'text/plain', Cookie: cookie }, body, signal: abort.signal });
    await send(`{"protocol":"json","version":1}${RS}`);
    await send(`${JSON.stringify({ type: 1, target: 'Subscribe', arguments: [topics], invocationId: '0' })}${RS}`);
    const reader = stream.body.getReader();
    const decoder = new TextDecoder();
    let text = '';
    for (;;) {
      const { value, done } = await reader.read();
      if (done) throw new Error('stream ended');
      text += decoder.decode(value, { stream: true }).replace(/\r/g, '');
      // Each event: "data: <frames>\n\n", the frames ended by RS.
      let end;
      while ((end = text.indexOf('\n\n')) >= 0) {
        const event = text.slice(0, end);
        text = text.slice(end + 2);
        const data = event.split('\n').filter(l => l.startsWith('data: ')).map(l => l.slice(6)).join('\n');
        for (const frame of data.split(RS)) {
          if (!frame.includes('"invocationId":"0"')) continue;
          const msg = JSON.parse(frame);
          if (msg.type === 3) {
            reader.cancel().catch(() => {});
            return msg.result || {};
          }
        }
      }
    }
  } finally {
    clearTimeout(timer);
    abort.abort();
  }
}

// A finished session from F1's own archive (livetiming.formula1.com/static,
// open, its final state a few minutes after the flag): the same trim as the
// live board, so a practice that's over still shows each car's best lap
// (ESPN has only the order). `start`: the session's start (UTC, ISO); the
// year's index says which session that is.
const ARCHIVE = 'https://livetiming.formula1.com/static/';
const archiveJson = async path => {
  const res = await fetch(`${ARCHIVE}${path}`, { signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) throw new Error(`archive ${res.status}`);
  return JSON.parse((await res.text()).replace(/^\uFEFF/, ''));
};
// The index's session starting at `start` ({ Path, … }), or null.
export function archivedSession(index, start) {
  const at = Date.parse(start);
  for (const m of index?.Meetings || [])
    for (const s of m.Sessions || []) {
      if (!s.Path || !s.StartDate) continue;
      const [h, mm] = String(s.GmtOffset || '0:0').split(':').map(Number);
      const t = Date.parse(`${s.StartDate}Z`) - ((h || 0) * 60 + (mm || 0)) * 60_000;
      if (Math.abs(t - at) < 20 * 60_000) return s;
    }
  return null;
}
async function archived(start) {
  if (!Number.isFinite(Date.parse(start))) throw new Error('start');
  const year = new Date(start).getUTCFullYear();
  const s = archivedSession(await archiveJson(`${year}/Index.json`), start);
  if (!s) throw new Error('not archived');
  const names = ['SessionInfo', 'SessionStatus', 'TimingData', 'TimingAppData', 'TimingStats', 'DriverList', 'RaceControlMessages'];
  const read = n => archiveJson(`${s.Path}${n}.json`).catch(() => null);
  const parts = await Promise.all(names.map(read));
  const r = Object.fromEntries(names.map((n, i) => [n, parts[i]]));
  // What 數據 is drawn from: a file not read (slow, or not up yet just after
  // the flag) is asked again, and still missing the whole answer fails
  // (a 502 isn't kept: an answer without tyres or speeds was, for a day).
  for (const n of ['TimingData', 'TimingAppData', 'TimingStats']) if (!r[n]) r[n] = await read(n);
  if (!r.TimingData?.Lines) throw new Error('no timing');
  if (!r.TimingAppData?.Lines || !r.TimingStats?.Lines) throw new Error('archive incomplete');
  return { ...trimF1Live(r), final: true };
}

// Position.z: base64 of deflated JSON ({ Position: [{ Timestamp, Entries }] }).
export async function inflate(b64) {
  if (typeof b64 !== 'string' || !b64) return null;
  const bytes = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  return JSON.parse(await new Response(stream).text());
}

// Every car's laps from F1's timing stream (TimingData.jsonStream: each
// change as it came, written as the session runs): [lap, time, gap to the
// leader, place, pit] at each line crossed. Lap 1 has no time (F1 gives
// none from the grid). Only the lines that can say any of it are parsed.
export function lapsOf(text) {
  const n = {}, gap = {}, pos = {}, pit = {}, out = {};
  for (const line of String(text).replace(/^\uFEFF/, '').split('\n')) {
    const i = line.indexOf('{');
    if (i < 0 || !/LastLapTime|NumberOfLaps|GapToLeader|Position|InPit|PitOut/.test(line)) continue;
    let m;
    try {
      m = JSON.parse(line.slice(i));
    } catch {
      continue;
    }
    for (const [no, l] of Object.entries(m.Lines || {})) {
      if (!l || typeof l !== 'object') continue;
      if (l.NumberOfLaps != null) n[no] = Number(l.NumberOfLaps) || 0;
      if (typeof l.GapToLeader === 'string') gap[no] = l.GapToLeader;
      if (l.Position != null) pos[no] = Number(l.Position) || 0;
      if (l.InPit === true || l.PitOut === true) pit[no] = true;
      const v = l.LastLapTime?.Value;
      if (v && n[no]) {
        const laps = (out[no] ||= []);
        if (laps.at(-1)?.[0] === n[no]) continue;
        // (The leader's gap is "LAP 20": 0; a lapped car's "1L": null.)
        const g = pos[no] === 1 ? 0 : /^\+?\d+(\.\d+)?$/.test(gap[no] || '') ? Number(gap[no].replace('+', '')) : null;
        laps.push([n[no], Math.round(lapMs(v)), g, pos[no] || 0, pit[no] ? 1 : 0]);
        pit[no] = false;
      }
    }
  }
  return out;
}
const lapMs = t => String(t || '').split(':').reduce((ms, x) => ms * 60 + Number(x || 0), 0) * 1000 || 0;

// A session's start in UTC (the index and SessionInfo give it local, with the offset).
export function sessionStartUtc(s) {
  if (!s?.StartDate) return '';
  const [h, mm] = String(s.GmtOffset || '0:0').split(':').map(Number);
  const sign = String(s.GmtOffset || '').startsWith('-') ? -1 : 1;
  const t = Date.parse(`${String(s.StartDate).replace(/Z$/, '')}Z`) - sign * ((Math.abs(h) || 0) * 60 + (mm || 0)) * 60_000;
  return Number.isFinite(t) ? new Date(t).toISOString() : '';
}
// The index's session starting at `start`, archived or not ({ s, meeting }), or null.
export function indexedSession(index, start) {
  const at = Date.parse(start);
  for (const m of index?.Meetings || [])
    for (const s of m.Sessions || []) if (s.StartDate && Math.abs(Date.parse(sessionStartUtc(s)) - at) < 20 * 60_000) return s;
  return null;
}
// The session running now: started (or about to), not archived yet (F1
// writes its path in the index minutes after the flag), at most 4 hours in.
export function liveSession(index, now = Date.now()) {
  for (const m of index?.Meetings || [])
    for (const s of m.Sessions || []) {
      const t = Date.parse(sessionStartUtc(s));
      if (!s.Path && t - 10 * 60_000 <= now && now <= t + 4 * 3_600_000) return s;
    }
  return null;
}

// ---- Every lap while a session runs ---------------------------------------
// F1's archive has a session's laps only once it's over, and the feed says
// only each car's last lap (OpenF1 closes while a session runs), so a phone
// opened at lap 30 had nothing before it. Each minute while a session runs
// (the sports proxy's cron: sampleLive) each car's last lap is kept, with
// the feed's place for every car on every lap since the start (LapSeries)
// and its stops (PitStopSeries): a lap takes over a minute, so none is
// missed. laps.json serves it until the archive has the session.
const SAMPLE_TOPICS = ['SessionInfo', 'TimingData', 'LapSeries', 'PitStopSeries'];
// Each car's place on every lap ({ no: [place…] }, lap 0 the grid).
export function placesOf(raw) {
  const out = {};
  for (const [no, x] of Object.entries(raw || {})) out[no] = list(x?.LapPosition).map(Number);
  return out;
}
// Each car's stops ({ no: [[lap, stop s, pit lane s]…] }).
export function stopsOf(raw) {
  const out = {};
  for (const [no, xs] of Object.entries(raw?.PitTimes || {}))
    out[no] = list(xs)
      .map(x => x?.PitStop || x)
      .map(p => [Number(p?.Lap) || 0, Number(p?.PitStopTime) || 0, Number(p?.PitLaneTime) || 0])
      .filter(p => p[0]);
  return out;
}
// One minute's look: each car's last lap, [lap, ms, gap, place, pit].
export function lapSample(raw) {
  const cars = {};
  for (const [no, l] of Object.entries(raw?.TimingData?.Lines || {})) {
    const n = Number(l?.NumberOfLaps) || 0;
    const ms = Math.round(lapMs(l?.LastLapTime?.Value));
    if (!n || !ms) continue;
    const pos = Number(l.Position) || 0;
    const gap = pos === 1 ? 0 : /^\+?\d+(\.\d+)?$/.test(l.GapToLeader || '') ? Number(l.GapToLeader.replace('+', '')) : null;
    cars[no] = [n, ms, gap, pos, l.InPit || l.PitOut ? 1 : 0];
  }
  return { cars, places: placesOf(raw?.LapSeries), stops: stopsOf(raw?.PitStopSeries) };
}
// The log with a look added: a car's lap kept once (the first look at it), the places and stops as the feed has them now.
export function addSample(log, sample, now = Date.now()) {
  const out = { at: now, cars: { ...(log?.cars || {}) }, places: log?.places || {}, stops: log?.stops || {} };
  for (const [no, lap] of Object.entries(sample?.cars || {})) {
    const laps = out.cars[no] || [];
    if (!laps.some(x => x[0] === lap[0])) out.cars[no] = [...laps, lap].sort((a, b) => a[0] - b[0]);
  }
  if (Object.keys(sample?.places || {}).length) out.places = sample.places;
  if (Object.keys(sample?.stops || {}).length) out.stops = sample.stops;
  return out;
}

// The year's index, kept five minutes in this colo (the cron asks each minute).
async function indexOf(year) {
  const url = `${ARCHIVE}${year}/Index.json`;
  const cache = globalThis.caches?.default;
  const hit = cache ? await cache.match(url).catch(() => null) : null;
  if (hit) return hit.json();
  const index = await archiveJson(`${year}/Index.json`);
  if (cache) await cache.put(url, new Response(JSON.stringify(index), { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=300' } })).catch(() => {});
  return index;
}

// The cron's minute: nothing unless a session runs; then one look, kept.
export async function sampleLive(log, now = Date.now()) {
  if (!log) return 'no log';
  const s = liveSession(await indexOf(new Date(now).getUTCFullYear()), now);
  if (!s) return 'idle';
  const raw = await snapshot(SAMPLE_TOPICS);
  // (The feed on another session than the index's, between two: not kept.)
  const key = sessionStartUtc(s);
  if (raw.SessionInfo?.StartDate && Math.abs(Date.parse(sessionStartUtc(raw.SessionInfo)) - Date.parse(key)) > 20 * 60_000) return 'other session';
  const sample = lapSample(raw);
  await log.add(key, sample);
  return `${s.Name}: ${Object.keys(sample.cars).length} cars`;
}

// The log kept in a Durable Object (one for every session: a session's log
// under its start), the sports proxy's F1_LOG.
export class F1Log {
  constructor(state) {
    this.storage = state.storage;
  }
  async fetch(request) {
    const url = new URL(request.url);
    const key = url.searchParams.get('key') || '';
    if (!key) return new Response('key', { status: 400 });
    if (request.method === 'POST') {
      const log = addSample(await this.storage.get(key), await request.json());
      await this.storage.put(key, log);
      // A fortnight's sessions kept: those older listed (keys are their
      // starts, in time order), once an hour, not every log read whole at
      // every minute's sample.
      if (!(Date.now() - (this.pruned || 0) < 3_600_000)) {
        this.pruned = Date.now();
        const cutoff = Date.now() - 14 * 86_400_000;
        for (const k of (await this.storage.list({ end: new Date(cutoff + 86_400_000).toISOString() })).keys()) if (Date.parse(k) < cutoff) await this.storage.delete(k);
      }
      return new Response('ok');
    }
    return new Response(JSON.stringify((await this.storage.get(key)) || null), { headers: { 'Content-Type': 'application/json' } });
  }
}
export function doLog(ns) {
  if (!ns) return null;
  const stub = () => ns.get(ns.idFromName('f1'));
  return {
    get: key => stub().fetch(`https://f1-log/?key=${encodeURIComponent(key)}`).then(r => (r.ok ? r.json() : null)),
    add: (key, sample) => stub().fetch(`https://f1-log/?key=${encodeURIComponent(key)}`, { method: 'POST', body: JSON.stringify(sample) }).then(r => r.text())
  };
}
// A log in memory (the preview tool).
export function memoryLog() {
  const m = new Map();
  return { get: async key => m.get(key) || null, add: async (key, sample) => void m.set(key, addSample(m.get(key), sample)) };
}

// Every car's laps: once over, from F1's archive (the timing stream, exact
// at each line); while it runs, the log. `{ at, cars, places, stops, live }`.
async function laps(start, log) {
  if (!Number.isFinite(Date.parse(start))) throw new Error('start');
  const s = indexedSession(await indexOf(new Date(start).getUTCFullYear()), start);
  if (!s) throw new Error('not in the index');
  if (!s.Path) {
    const kept = log ? await log.get(sessionStartUtc(s)) : null;
    if (!kept) throw new Error('not archived');
    return { ...kept, live: true };
  }
  const [res, places, stops] = await Promise.all([
    fetch(`${ARCHIVE}${s.Path}TimingData.jsonStream`, { signal: AbortSignal.timeout(TIMEOUT) }),
    archiveJson(`${s.Path}LapSeries.json`).catch(() => null),
    archiveJson(`${s.Path}PitStopSeries.json`).catch(() => null)
  ]);
  if (!res.ok) throw new Error(`stream ${res.status}`);
  return { at: Date.now(), cars: lapsOf(await res.text()), places: placesOf(places), stops: stopsOf(stops) };
}

// A circuit's outline (MultiViewer's map, F1's own coordinates), its corners
// and what a stop in the pits costs there.
async function circuit(key, year) {
  const res = await fetch(`https://api.multiviewer.app/api/v1/circuits/${Number(key)}/${Number(year)}`, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: AbortSignal.timeout(TIMEOUT) });
  if (!res.ok) throw new Error(`circuit ${res.status}`);
  const c = await res.json();
  return {
    name: c.circuitName || '',
    rotation: Number(c.rotation) || 0,
    x: c.x || [],
    y: c.y || [],
    // The track's points where each mini-sector starts (some circuits), so a car placed by its mini-sectors sits on the right one.
    mini: Array.isArray(c.miniSectorsIndexes) ? c.miniSectorsIndexes.map(Number) : [],
    // How far into a lap (ms) each point was on the lap the outline was drawn from (some circuits): a share of a lap's time to its point.
    times: Array.isArray(c.trackPositionTime) ? c.trackPositionTime.map(Number) : [],
    corners: (c.corners || []).map(k => ({ n: k.number, x: Math.round(k.trackPosition?.x || 0), y: Math.round(k.trackPosition?.y || 0) })),
    pitLoss: { normal: Number(c.pitLoss?.normal) || 0, sc: Number(c.pitLoss?.sc) || 0, vsc: Number(c.pitLoss?.vsc) || 0 }
  };
}

export async function f1LiveResponse(url, { log = null } = {}) {
  const json = (body, status) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.pathname === '/session.json') {
    try {
      return json(await archived(url.searchParams.get('start') || ''), 200);
    } catch (error) {
      return json({ error: String(error.message || error) }, 502);
    }
  }
  if (url.pathname === '/laps.json' || url.pathname === '/circuit.json') {
    try {
      return json(url.pathname === '/laps.json' ? await laps(url.searchParams.get('start') || '', url.searchParams.get('final') ? null : log) : await circuit(url.searchParams.get('key'), url.searchParams.get('year')), 200);
    } catch (error) {
      return json({ error: String(error.message || error) }, 502);
    }
  }
  if (url.pathname !== '/now.json') return json({ error: 'unknown' }, 404);
  try {
    const raw = await snapshot();
    raw.Position = await inflate(raw['Position.z']).catch(() => null);
    return json(trimF1Live(raw), 200);
  } catch (error) {
    return json({ error: String(error.message || error) }, 502);
  }
}
