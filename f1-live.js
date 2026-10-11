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
const TOPICS = ['SessionInfo', 'SessionStatus', 'TrackStatus', 'LapCount', 'ExtrapolatedClock', 'DriverList', 'TimingData', 'TimingAppData', 'TimingStats', 'RaceControlMessages'];
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
        sectors: list(ts[no]?.BestSectors).map(x => ({ v: x?.Value || '', p: Number(x?.Position) || 0 })),
        speed: { v: Number(ts[no]?.BestSpeeds?.ST?.Value) || 0, p: Number(ts[no]?.BestSpeeds?.ST?.Position) || 0 },
        // Every speed trap's best (the two intermediates, the finish line, the trap), each with its place.
        speeds: Object.fromEntries(['I1', 'I2', 'FL', 'ST'].map(k => [k.toLowerCase(), { v: Number(ts[no]?.BestSpeeds?.[k]?.Value) || 0, p: Number(ts[no]?.BestSpeeds?.[k]?.Position) || 0 }])),
        // A qualifying's best lap in each part (Q1, Q2, Q3), '' for a part not run.
        parts: list(l.BestLapTimes).map(x => x?.Value || ''),
        pb: ts[no]?.PersonalBestLapTime?.Value ? { v: ts[no].PersonalBestLapTime.Value, lap: Number(ts[no].PersonalBestLapTime.Lap) || 0, p: Number(ts[no].PersonalBestLapTime.Position) || 0 } : null
      };
    })
    .sort((a, b) => a.pos - b.pos);
  const rcm = list(r?.RaceControlMessages?.Messages).at(-1);
  return {
    at: now,
    session: { key: info.Key || 0, type: info.Type || '', name: info.Name || '', start: info.StartDate || '', gmt: info.GmtOffset || '', status: r?.SessionStatus?.Status || info.SessionStatus || '' },
    meeting: info.Meeting?.Name || '',
    part,
    entries: list(td.NoEntries).map(Number),
    clock: { left: Math.max(0, Math.round(left)), running: Boolean(clock.Extrapolating) },
    track: { status: String(r?.TrackStatus?.Status || ''), message: r?.TrackStatus?.Message || '' },
    lap: r?.LapCount ? { now: Number(r.LapCount.CurrentLap) || 0, of: Number(r.LapCount.TotalLaps) || 0 } : null,
    message: rcm ? { text: rcm.Message || '', at: rcm.Utc || '' } : null,
    // The safety car, the virtual one and the flags so far (Orbit Sports' race chart shades them), and what sent them out (a car stopped, a collision).
    control: list(r?.RaceControlMessages?.Messages)
      .filter(m => m.Category === 'SafetyCar' || /SAFETY CAR|VSC|STOPPED|CRASH|BARRIER|GRAVEL|INCIDENT INVOLVING|\bRED FLAG\b|TRACK CLEAR/i.test(m.Message || '') || m.Flag === 'RED' || (m.Flag === 'GREEN' && /RESUME|TRACK CLEAR/i.test(m.Message || '')))
      .slice(-30)
      .map(m => ({ at: m.Utc || '', lap: Number(m.Lap) || 0, category: m.Category || '', flag: m.Flag || '', message: m.Message || '' })),
    cars
  };
}

// One snapshot of the feed's state (its SignalR answer to Subscribe).
async function snapshot() {
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
    await send(`${JSON.stringify({ type: 1, target: 'Subscribe', arguments: [TOPICS], invocationId: '0' })}${RS}`);
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

export async function f1LiveResponse(url) {
  const json = (body, status) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (url.pathname === '/session.json') {
    try {
      return json(await archived(url.searchParams.get('start') || ''), 200);
    } catch (error) {
      return json({ error: String(error.message || error) }, 502);
    }
  }
  if (url.pathname !== '/now.json') return json({ error: 'unknown' }, 404);
  try {
    return json(trimF1Live(await snapshot()), 200);
  } catch (error) {
    return json({ error: String(error.message || error) }, 502);
  }
}
