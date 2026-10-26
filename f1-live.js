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
// Served by the sports proxy as if from `https://f1-live.orbit/now.json`.

export const F1_LIVE_HOST = 'f1-live.orbit';
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
// In a race (`raced`: the car's laps), the set on now has run at least the
// laps since the last stop: the feed's count lagged (Stroll from the pit
// lane, Austin 2026: 1 lap on it at lap 4).
export function stintsOf(raw, raced = 0) {
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
  const stints = out.map(x => ({ c: x.c, laps: Math.max(0, x.total - x.start), new: x.new }));
  const last = stints.at(-1);
  if (last && raced) last.laps = Math.max(last.laps, raced - stints.slice(0, -1).reduce((n, x) => n + x.laps, 0));
  return stints;
}

// Each car's standing with the stewards from race control's messages: its
// penalties not yet served (5s, 10s, drive-through, stop-go) and whether an
// incident of its is under investigation (until a word on that incident,
// by its time stamp, closes it). { '63': { pen: ['5s'], probe: false } }.
export function stewardsOf(msgs) {
  const out = {};
  const of = no => (out[no] ||= { pen: [], probe: false });
  const probes = new Map();
  for (const m of list(msgs)) {
    const t = String(m?.Message || '').toUpperCase();
    const cars = [...t.matchAll(/\bCARS? (\d+) \(\w+\)(?: AND (\d+) \(\w+\))?/g)].flatMap(x => [x[1], x[2]]).filter(Boolean);
    const stamp = /\((\d\d:\d\d:\d\d)\)\s*$/.exec(t)?.[1] || '';
    const kind = /(\d+) SECOND TIME PENALTY/.exec(t)?.[1] ? `${/(\d+) SECOND TIME PENALTY/.exec(t)[1]}s` : /DRIVE THROUGH PENALTY/.test(t) ? 'DT' : /(\d+) SECOND STOP\/GO PENALTY/.test(t) ? `SG${/(\d+) SECOND STOP\/GO/.exec(t)[1]}` : /STOP\/GO PENALTY/.test(t) ? 'SG' : '';
    if (/UNDER INVESTIGATION/.test(t)) {
      probes.set(stamp || t, cars);
      continue;
    }
    // Any later word on the incident (a penalty, no further action, a reprimand) closes it.
    if (stamp && probes.has(stamp) && /STEWARDS|PENALTY|NO FURTHER|REPRIMAND|NOT INVESTIGATED/.test(t)) probes.delete(stamp);
    if (!kind || !cars.length) continue;
    const car = of(cars[0]);
    if (/PENALTY SERVED/.test(t)) {
      const i = car.pen.indexOf(kind);
      if (i >= 0) car.pen.splice(i, 1);
    } else if (!/REVOKED|CANCELLED|WITHDRAWN/.test(t)) car.pen.push(kind);
  }
  for (const cars of probes.values()) for (const no of cars) of(no).probe = true;
  for (const [no, x] of Object.entries(out)) if (!x.pen.length && !x.probe) delete out[no];
  return out;
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
        stints: stintsOf(app[no]?.Stints, /race/i.test(info.Type || '') ? Number(l.NumberOfLaps) || 0 : 0),
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
    // Who's under investigation or has a penalty to serve (Orbit Sports' 成績).
    stewards: stewardsOf(r?.RaceControlMessages?.Messages),
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
// A finished session: F1's archive, else (it turns everyone away) OpenF1's tables.
async function archived(start) {
  try {
    return await archiveSession(start);
  } catch (error) {
    if (!/archive 40[13]|not archived/.test(String(error.message))) throw error;
    return openF1Archived(start).catch(e => {
      throw new Error(`${error.message}; ${e.message}`);
    });
  }
}
async function archiveSession(start) {
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
// The session to log: the index's running one; the index unread (F1 turned
// its whole archive away, 401, mid-race on 2026-10-25), the feed's own
// session while it's within its four hours (`info`: its SessionInfo, null
// before the feed is read). False: nothing to log.
export function sessionToLog(index, info, now = Date.now()) {
  if (index) return liveSession(index, now) || false;
  if (info === null) return null;
  const t = Date.parse(sessionStartUtc(info));
  return Number.isFinite(t) && t - 10 * 60_000 <= now && now <= t + 4 * 3_600_000 && !/^(Finalised|Ends)$/i.test(info.SessionStatus || '') ? info : false;
}
export async function sampleLive(log, now = Date.now()) {
  if (!log) return 'no log';
  const index = await indexOf(new Date(now).getUTCFullYear()).catch(() => null);
  if (sessionToLog(index, null, now) === false) return 'idle';
  const raw = await snapshot(SAMPLE_TOPICS);
  const s = sessionToLog(index, raw.SessionInfo || {}, now);
  if (!s) return 'idle';
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

// Every car's laps from OpenF1's tables (its laps, gaps, places and stops),
// for when F1's archive turns everyone away (from 2026-10-25, every year's,
// a CloudFront 401). `rows` = { laps, intervals, position, pit }, each
// OpenF1's list. The same shape as the archive's: { cars: { no: [[lap, ms,
// gap, place, pit]…] }, places: { no: [grid, lap 1, …] }, stops: { no: [[lap, stop s, lane s]…] } }.
// Every car's laps from OpenF1's laps table alone (the intervals and
// positions tables, 3.5 MB a race, got the Worker turned away, 429): when
// each car crossed the line at each lap's end (the next lap's start, else
// this one's start and time), its place among the cars to finish that lap
// (by when), its gap to the first of them (none a lap or more down, as F1's
// own: "1L"); lap 0 its grid place. `{ cars: { no: [[lap, ms, gap, pos, pit]] }, places, stops }`.
export function openF1Laps({ laps = [], pit = [], starting_grid = [] } = {}) {
  const byCar = {};
  for (const l of laps || []) if (l?.driver_number != null && Number(l.lap_number) > 0) (byCar[l.driver_number] ||= new Map()).set(Number(l.lap_number), l);
  // When a car crossed the line ending lap n (ms), or NaN.
  const crossed = (no, n) => {
    const next = Date.parse(byCar[no].get(n + 1)?.date_start || '');
    if (Number.isFinite(next)) return next;
    const l = byCar[no].get(n);
    return Date.parse(l?.date_start || '') + (Number(l?.lap_duration) || NaN) * 1000;
  };
  const nos = Object.keys(byCar);
  const most = Math.max(0, ...nos.map(no => Math.max(...byCar[no].keys())));
  const at = {};
  for (let n = 1; n <= most; n++) {
    const line = nos.map(no => [no, crossed(no, n)]).filter(([, t]) => Number.isFinite(t)).sort((x, y) => x[1] - y[1]);
    const lead = line[0];
    line.forEach(([no, t], i) => {
      // (A lap or more down: crossed after the leader ended its next lap.)
      const down = lead && Number.isFinite(crossed(lead[0], n + 1)) && t > crossed(lead[0], n + 1);
      (at[no] ||= {})[n] = { pos: i + 1, gap: i === 0 ? 0 : down ? null : Math.round(t - lead[1]) / 1000 };
    });
  }
  const grid = Object.fromEntries((starting_grid || []).map(r => [r.driver_number, Number(r.position) || 0]));
  const stopsBy = {};
  for (const p of pit || []) if (p?.driver_number != null && p.lap_number) (stopsBy[p.driver_number] ||= []).push(p);
  const cars = {}, places = {}, stops = {};
  for (const no of nos) {
    const pitLaps = new Set((stopsBy[no] || []).map(p => Number(p.lap_number)));
    const out = [];
    const ps = [grid[no] || 0];
    for (const n of [...byCar[no].keys()].sort((x, y) => x - y)) {
      const l = byCar[no].get(n);
      const ms = Math.round((Number(l.lap_duration) || 0) * 1000);
      const here = at[no]?.[n];
      ps[n] = here?.pos || 0;
      if (ms) out.push([n, ms, here ? here.gap : null, here?.pos || 0, pitLaps.has(n) || l.is_pit_out_lap ? 1 : 0]);
    }
    cars[no] = out;
    places[no] = Array.from(ps, x => x || 0);
  }
  for (const [no, ps] of Object.entries(stopsBy))
    stops[no] = ps
      .map(p => [Number(p.lap_number), Number(p.stop_duration) || 0, Number(p.lane_duration ?? p.pit_duration) || 0])
      .sort((a, b) => a[0] - b[0]);
  return { cars, places, stops };
}
const OPENF1 = 'https://api.openf1.org/v1/';
// (OpenF1 allows a few asks a second: one turned away (429) asked again a moment later.)
// (Nothing there: OpenF1's 404 "No results found", an empty table. Too many
// asked, from the Worker's shared addresses too: waited out, its Retry-After
// when it says, up to four times.)
const openF1Json = async path => {
  for (let k = 0; ; k++) {
    const res = await fetch(`${OPENF1}${path}`, { signal: AbortSignal.timeout(20_000) });
    if (res.ok) return res.json();
    if (res.status === 404) return [];
    if (res.status !== 429 || k >= 4) throw new Error(`openf1 ${res.status}`);
    await new Promise(r => setTimeout(r, Math.min(5_000, (Number(res.headers.get('retry-after')) || k + 1) * 1000)));
  }
};
// The grid a session started from: OpenF1 files it under the qualifying
// that set it (the meeting's, the last of them before the session).
export const gridOf = (rows, sessionKey) => {
  const keys = [...new Set(rows.map(r => r.session_key))].filter(k => k < sessionKey);
  const from = Math.max(...keys);
  return rows.filter(r => r.session_key === from);
};
// The session starting at `start` and the tables named, from OpenF1, one at
// a time a third of a second apart (three a second is its limit). A table
// it won't give fails the whole read: a copy kept for good is never one
// with a hole in it. { session, meeting, rows: { name: [...] } }.
async function openF1Rows(start, names) {
  const t = Date.parse(start);
  const day = new Date(t).toISOString().slice(0, 10);
  const found = await openF1Json(`sessions?date_start%3E%3D${day}&date_start%3C${new Date(t + 86_400_000).toISOString().slice(0, 10)}`);
  const session = (found || []).find(x => Math.abs(Date.parse(x.date_start) - t) < 20 * 60_000);
  if (!session) throw new Error('not in openf1');
  const pause = () => new Promise(r => setTimeout(r, 340));
  await pause();
  const meeting = (await openF1Json(`meetings?meeting_key=${session.meeting_key}`))?.[0] || null;
  const rows = {};
  for (const n of names) {
    await pause();
    rows[n] = n === 'starting_grid' ? gridOf(await openF1Json(`starting_grid?meeting_key=${session.meeting_key}`), session.session_key) : await openF1Json(`${n}?session_key=${session.session_key}`);
  }
  return { session, meeting, rows };
}
async function openF1Session(start) {
  const { rows } = await openF1Rows(start, ['laps', 'pit', 'starting_grid']);
  const got = openF1Laps(rows);
  if (!Object.values(got.cars).some(x => x.length)) throw new Error('openf1 no laps');
  return { at: Date.now(), ...got };
}

// A finished session's archive files (as trimF1Live reads them) made from
// OpenF1's tables, for when F1's archive turns everyone away: the order and
// gaps (session_result), each car's laps, best sectors and speed traps
// (laps), tyres (stints), stops (pit), the grid (starting_grid), race
// control, the weather. Pure: rows in, the files out.
const clockOf = s => {
  if (!(Number(s) > 0)) return '';
  const m = Math.floor(s / 60);
  const rest = (s - m * 60).toFixed(3).padStart(6, '0');
  return m ? `${m}:${rest}` : (s - m * 60).toFixed(3);
};
export function openF1Raw({ session = {}, meeting = null, rows = {} } = {}) {
  const race = /race/i.test(session.session_type || session.session_name || '');
  const quali = /qualifying|shootout/i.test(session.session_type || session.session_name || '');
  const by = (xs, key = 'driver_number') => {
    const m = {};
    for (const x of xs || []) if (x?.[key] != null) (m[x[key]] ||= []).push(x);
    return m;
  };
  const laps = by(rows.laps);
  // A car out unclassified has no place in OpenF1's results: after the
  // classified ones, the most laps first (F1's own order; the board drew "99").
  const res = rows.session_result || [];
  const placed = Math.max(0, ...res.map(r => Number(r.position) || 0));
  const unplaced = res.filter(r => !(Number(r.position) > 0)).sort((a, b) => (Number(b.number_of_laps) || 0) - (Number(a.number_of_laps) || 0));
  const results = Object.fromEntries(res.map(r => [r.driver_number, Number(r.position) > 0 ? r : { ...r, position: placed + 1 + unplaced.indexOf(r) }]));
  const grid = Object.fromEntries((rows.starting_grid || []).map(r => [r.driver_number, r.position]));
  const stops = by(rows.pit);
  const nos = [...new Set([...(rows.drivers || []).map(d => d.driver_number), ...Object.keys(results).map(Number)])].map(String);
  // Each car's best of a lap's measure, and its place among all cars' bests (lower better, or higher for speeds).
  const bestOf = (no, key, high = false) => {
    const vs = (laps[no] || []).map(l => Number(l[key])).filter(v => v > 0);
    return vs.length ? (high ? Math.max(...vs) : Math.min(...vs)) : 0;
  };
  const placeOf = (no, key, high = false) => {
    const mine = bestOf(no, key, high);
    if (!mine) return 0;
    return 1 + nos.filter(o => o !== no && bestOf(o, key, high) && (high ? bestOf(o, key, high) > mine : bestOf(o, key, high) < mine)).length;
  };
  const gapText = g => (typeof g === 'number' ? (g > 0 ? `+${g.toFixed(3)}` : '') : typeof g === 'string' ? g.replace(/^\+?(\d+) LAPS?$/i, '$1L') : '');
  const Lines = {}, App = {}, Stats = {}, Series = {}, Pits = {};
  for (const no of nos) {
    const r = results[no] || {};
    const mine = (laps[no] || []).sort((a, b) => a.lap_number - b.lap_number);
    const last = [...mine].reverse().find(l => l.lap_duration > 0);
    const best = bestOf(no, 'lap_duration');
    const bestLap = mine.find(l => Number(l.lap_duration) === best);
    const durations = Array.isArray(r.duration) ? r.duration : [];
    const gap = Array.isArray(r.gap_to_leader) ? r.gap_to_leader.filter(x => x != null).at(-1) : r.gap_to_leader;
    Lines[no] = {
      Position: String(r.position || ''),
      BestLapTime: { Value: clockOf(quali && durations.some(x => x > 0) ? Math.min(...durations.filter(x => x > 0)) : best) },
      BestLapTimes: quali ? durations.map(x => ({ Value: clockOf(x) })) : undefined,
      LastLapTime: { Value: clockOf(last?.lap_duration) },
      GapToLeader: r.position === 1 ? '' : gapText(gap),
      NumberOfLaps: Number(r.number_of_laps) || mine.length,
      NumberOfPitStops: (stops[no] || []).length,
      Retired: Boolean(r.dnf),
      Stopped: Boolean(r.dns),
      KnockedOut: quali && durations.length > 0 && durations.filter(x => x > 0).length < 3 && r.position > 10
    };
    if (!race) Lines[no].TimeDiffToFastest = gapText(gap);
    const stints = (rows.stints || []).filter(x => String(x.driver_number) === no).sort((a, b) => a.stint_number - b.stint_number);
    App[no] = {
      GridPos: String(grid[no] || ''),
      Stints: stints.map(x => {
        const start = Number(x.tyre_age_at_start) || 0;
        const run = Math.max(0, (Number(x.lap_end) || 0) - (Number(x.lap_start) || 0) + 1);
        return { Compound: String(x.compound || '').toUpperCase(), StartLaps: start, TotalLaps: start + run, New: String(start === 0) };
      })
    };
    const pb = bestLap ? { Value: clockOf(best), Lap: bestLap.lap_number, Position: placeOf(no, 'lap_duration') } : null;
    Stats[no] = {
      BestSectors: ['duration_sector_1', 'duration_sector_2', 'duration_sector_3'].map(k => ({ Value: bestOf(no, k) ? bestOf(no, k).toFixed(3) : '', Position: placeOf(no, k) })),
      BestSpeeds: Object.fromEntries([['I1', 'i1_speed'], ['I2', 'i2_speed'], ['ST', 'st_speed']].map(([k, f]) => [k, { Value: String(bestOf(no, f, true) || ''), Position: placeOf(no, f, true) }])),
      PersonalBestLapTime: pb
    };
  }
  const lapRows = race ? openF1Laps(rows) : { places: {}, stops: {} };
  for (const [no, ps] of Object.entries(lapRows.places)) Series[no] = { LapPosition: ps.map(String) };
  for (const [no, ps] of Object.entries(lapRows.stops)) Pits[no] = ps.map(([Lap, PitStopTime, PitLaneTime]) => ({ PitStop: { Lap, PitStopTime, PitLaneTime } }));
  const w = (rows.weather || []).at(-1);
  const most = Math.max(0, ...Object.values(Lines).map(l => l.NumberOfLaps));
  const gmt = String(session.gmt_offset || '00:00:00');
  // (The start as F1 writes it: local, with the offset beside it.)
  const sign = gmt.startsWith('-') ? -1 : 1;
  const [h, mm] = gmt.replace('-', '').split(':').map(Number);
  const local = new Date(Date.parse(session.date_start) + sign * ((h || 0) * 60 + (mm || 0)) * 60_000).toISOString().slice(0, 19);
  return {
    SessionInfo: { Key: session.session_key, Type: race ? 'Race' : quali ? 'Qualifying' : 'Practice', Name: session.session_name || '', StartDate: local, GmtOffset: gmt, Meeting: { Name: meeting?.meeting_name || '', Circuit: { Key: session.circuit_key || meeting?.circuit_key || 0 } } },
    SessionStatus: { Status: 'Finalised' },
    DriverList: Object.fromEntries((rows.drivers || []).map(d => [String(d.driver_number), { Tla: d.name_acronym || '', FirstName: d.first_name || '', LastName: d.last_name || '', FullName: d.full_name || '', TeamName: d.team_name || '', TeamColour: d.team_colour || '' }])),
    TimingData: { Lines, SessionPart: 0 },
    TimingAppData: { Lines: App },
    TimingStats: { Lines: Stats },
    RaceControlMessages: { Messages: (rows.race_control || []).map(m => ({ Utc: m.date, Lap: m.lap_number || 0, Category: m.category || '', Flag: m.flag || '', Message: m.message || '' })) },
    WeatherData: w ? { AirTemp: w.air_temperature, TrackTemp: w.track_temperature, Rainfall: w.rainfall ? '1' : '0', WindSpeed: w.wind_speed, Humidity: w.humidity } : null,
    LapCount: race && most ? { CurrentLap: most, TotalLaps: most } : null,
    LapSeries: Series,
    PitStopSeries: { PitTimes: Pits }
  };
}
async function openF1Archived(start) {
  const names = ['drivers', 'session_result', 'laps', 'stints', 'pit', 'race_control', 'weather', 'starting_grid'];
  const got = await openF1Rows(start, names);
  // (Kept for good once read: never from a table OpenF1 didn't give.)
  for (const n of ['drivers', 'session_result', 'laps', 'stints']) if (!(got.rows[n] || []).length) throw new Error(`openf1 no ${n}`);
  return { ...trimF1Live(openF1Raw(got)), final: true, from: 'openf1' };
}

// Every car's laps: once over, from F1's archive (the timing stream, exact
// at each line), else OpenF1's; while it runs, the log. `{ at, cars, places, stops, live }`.
async function laps(start, log, final = false) {
  try {
    return await archiveLaps(start, final ? null : log);
  } catch (error) {
    // (F1's archive shut: OpenF1's, open once the session's over; still
    // running, or OpenF1 shut too, the log, or the archive's own failure.)
    let why = String(error.message);
    const kept = /archive 40[13]|stream 40[13]|not archived|not in the index/.test(why) ? await openF1Session(start).catch(e => ((why += `; ${e.message}`), null)) : null;
    if (kept) return kept;
    // (Over and nothing else: what the log kept while it ran, marked so the
    // phone asks again, and why the whole race isn't in.)
    const logged = final && log ? await log.get(new Date(start).toISOString()).catch(() => null) : null;
    if (logged) return { ...logged, live: true, why };
    throw error;
  }
}
async function archiveLaps(start, log) {
  if (!Number.isFinite(Date.parse(start))) throw new Error('start');
  // (The index unread, F1's archive turned away: the log, under the start asked for.)
  const index = log ? await indexOf(new Date(start).getUTCFullYear()).catch(() => null) : await indexOf(new Date(start).getUTCFullYear());
  const s = index ? indexedSession(index, start) : null;
  if (index && !s) throw new Error('not in the index');
  if (!s?.Path) {
    const kept = log ? await log.get(s ? sessionStartUtc(s) : new Date(start).toISOString()) : null;
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
      return json(url.pathname === '/laps.json' ? await laps(url.searchParams.get('start') || '', log, Boolean(url.searchParams.get('final'))) : await circuit(url.searchParams.get('key'), url.searchParams.get('year')), 200);
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
