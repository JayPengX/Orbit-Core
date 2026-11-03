// An F1 session as F1's live feed had it at a moment, rebuilt from OpenF1's
// recorded tables: Orbit Sports' live board (a red flag, a safety car, a
// pit window) shot on real data when no session is on.
//
//   node tools/f1-replay.mjs --start 2026-11-01T20:00:00Z --at 2026-11-01T21:20:00Z [--out dir]
//
// Writes now.json (the proxy's /now.json at that moment: trimF1Live of the
// feed's topics), laps.json (every car's laps done by then) and
// scoreboard.json (ESPN's F1 scoreboard of that day, the session on), and
// the preview's arguments (printed, and in args.txt for shots.mjs). Nothing is made up: each value is the
// table's at that moment (a car in the pits, its tyres, its gap, race
// control's words); F1's track status is walked from race control's flags
// as the feed walks it (a sector's yellow says 2 under a red flag too).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { trimF1Live, openF1Laps } from '../f1-live.js';

const arg = (name, fallback = '') => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : fallback;
};
const start = arg('start');
const at = arg('at');
if (!Date.parse(start) || !Date.parse(at)) {
  console.log('node tools/f1-replay.mjs --start <session start, UTC> --at <the moment, UTC> [--out dir]');
  process.exit(1);
}
const T = Date.parse(at);
const out = arg('out', join(tmpdir(), `f1-replay-${at.replace(/[:.]/g, '')}`));
await mkdir(out, { recursive: true });

const OPENF1 = 'https://api.openf1.org/v1/';
const cacheDir = join(tmpdir(), 'f1-replay-cache');
await mkdir(cacheDir, { recursive: true });
// One table, kept on disk (OpenF1 allows a few asks a second).
const table = async path => {
  const file = join(cacheDir, `${path.replace(/[^\w=.-]+/g, '_')}.json`);
  try {
    return JSON.parse(await readFile(file, 'utf8'));
  } catch {}
  for (let k = 0; ; k++) {
    const res = await fetch(`${OPENF1}${path}`);
    if (res.ok) {
      const rows = await res.json();
      await writeFile(file, JSON.stringify(rows));
      await new Promise(r => setTimeout(r, 400));
      return rows;
    }
    if (res.status === 404) return [];
    if (k > 4) throw new Error(`openf1 ${res.status} ${path}`);
    await new Promise(r => setTimeout(r, 2000));
  }
};

const t0 = Date.parse(start);
const day = new Date(t0 - 2 * 3_600_000).toISOString().slice(0, 10);
const sessions = await table(`sessions?date_start%3E%3D${day}&date_start%3C${new Date(t0 + 26 * 3_600_000).toISOString().slice(0, 10)}`);
const session = sessions.sort((a, b) => Math.abs(Date.parse(a.date_start) - t0) - Math.abs(Date.parse(b.date_start) - t0))[0];
if (!session) throw new Error('no such session in OpenF1');
const q = `session_key=${session.session_key}`;
const [meeting] = await table(`meetings?meeting_key=${session.meeting_key}`);
const rows = {};
for (const n of ['drivers', 'laps', 'position', 'intervals', 'stints', 'pit', 'race_control', 'weather', 'session_result', 'starting_grid']) rows[n] = await table(`${n}?${q}`);
const race = /race|sprint$/i.test(session.session_type) || /^Sprint$/.test(session.session_name);

const ms = d => Date.parse(d);
// (OpenF1's pit table has each car's trip from the garage to the grid as a stop, before the start: not one.)
rows.pit = rows.pit.filter(x => ms(x.date) >= t0 && x.pit_duration != null);
const by = (xs, key = 'driver_number') => {
  const m = {};
  for (const x of xs) (m[x[key]] ||= []).push(x);
  return m;
};
// The last row of each car's by then.
const lastBy = xs => {
  const m = {};
  for (const x of xs) if (ms(x.date) <= T && (!m[x.driver_number] || ms(m[x.driver_number].date) <= ms(x.date))) m[x.driver_number] = x;
  return m;
};
const clock = s => {
  if (!(s > 0)) return '';
  const m = Math.floor(s / 60);
  return m ? `${m}:${(s - m * 60).toFixed(3).padStart(6, '0')}` : (s - m * 60).toFixed(3);
};
const lapsOf = by(rows.laps);
for (const no of Object.keys(lapsOf)) lapsOf[no].sort((a, b) => a.lap_number - b.lap_number);
// When a lap ended: the next one's start, else its own start and time.
const endOf = (no, l) => {
  const next = lapsOf[no].find(x => x.lap_number === l.lap_number + 1);
  return next?.date_start ? ms(next.date_start) : l.date_start && l.lap_duration ? ms(l.date_start) + l.lap_duration * 1000 : NaN;
};
const done = no => (lapsOf[no] || []).filter(l => endOf(no, l) <= T);
const onLap = no => [...(lapsOf[no] || [])].reverse().find(l => l.date_start && ms(l.date_start) <= T);
const result = Object.fromEntries(rows.session_result.map(r => [r.driver_number, r]));
const place = lastBy(rows.position);
const gaps = lastBy(rows.intervals);
const msgs = rows.race_control.filter(m => ms(m.date) <= T).sort((a, b) => ms(a.date) - ms(b.date));

// The session's state and the track's, walked through race control as the feed walks them.
let status = 'Inactive';
let track = '1';
const yellow = new Set();
for (const m of msgs) {
  const t = m.message.toUpperCase();
  if (m.category === 'SessionStatus') status = /STARTED/.test(t) ? 'Started' : /ABORTED/.test(t) ? 'Aborted' : /FINISHED|ENDED/.test(t) ? 'Finished' : status;
  if (/VSC DEPLOYED|VIRTUAL SAFETY CAR DEPLOYED/.test(t)) track = '6';
  else if (/VSC ENDING|VIRTUAL SAFETY CAR ENDING/.test(t)) track = '7';
  else if (/SAFETY CAR DEPLOYED/.test(t)) track = '4';
  else if (/\bRED FLAG\b/.test(t) || m.flag === 'RED') track = '5';
  else if (t === 'TRACK CLEAR' || /^GREEN LIGHT/.test(t)) (track = '1'), yellow.clear();
  else if (/^(DOUBLE )?YELLOW IN TRACK SECTOR (\d+)/.test(t)) yellow.add(/SECTOR (\d+)/.exec(t)[1]), track === '1' && (track = '2');
  else if (/^CLEAR IN TRACK SECTOR (\d+)/.test(t)) {
    yellow.delete(/SECTOR (\d+)/.exec(t)[1]);
    if (track === '2' && !yellow.size) track = '1';
  }
  if (/CHEQUERED FLAG/.test(t)) status = 'Finished';
}
const red = status === 'Aborted';
const nos = rows.drivers.map(d => String(d.driver_number));
const leaderLap = Math.max(0, ...nos.map(no => onLap(no)?.lap_number || 0));
const total = Math.max(...rows.session_result.map(r => r.number_of_laps || 0));
const stopsBy = by(rows.pit);
const kept = await (async () => {
  const got = openF1Laps(rows);
  const cars = {}, places = {}, stops = {};
  const leaderDone = Math.max(0, ...nos.map(no => done(no).length ? done(no).at(-1).lap_number : 0));
  for (const no of nos) {
    const n = done(no).length ? done(no).at(-1).lap_number : 0;
    cars[no] = (got.cars[no] || []).filter(x => x[0] <= n);
    places[no] = (got.places[no] || []).slice(0, leaderDone + 1);
    stops[no] = (got.stops[no] || []).filter(x => (stopsBy[no] || []).some(p => p.lap_number === x[0] && ms(p.date) <= T));
  }
  return { cars, places, stops };
})();
// The grid: OpenF1's, else each car's place before its first lap.
const grid = Object.fromEntries(rows.starting_grid.map(r => [r.driver_number, r.position]));
const gridOf = no => grid[no] || kept.places[no]?.[0] || 0;
const lines = {}, app = {}, stats = {}, series = {}, pits = {};
for (const no of nos) {
  const mine = done(no);
  const cur = onLap(no);
  const r = result[no] || {};
  const lastEnd = mine.length ? endOf(no, mine.at(-1)) : 0;
  const out = Boolean(r.dnf && (mine.at(-1)?.lap_number || 0) >= (r.number_of_laps || 0) && T > lastEnd + 60_000);
  const g = gaps[no];
  const p = place[no]?.position;
  const lane = (stopsBy[no] || []).find(x => ms(x.date) <= T && T <= ms(x.date) + (x.lane_duration ?? x.pit_duration ?? 25) * 1000);
  const laneOut = (stopsBy[no] || []).find(x => { const e = ms(x.date) + (x.lane_duration ?? x.pit_duration ?? 25) * 1000; return e < T && T < e + 25_000; });
  const timed = mine.filter(l => l.lap_duration > 0);
  const best = timed.length ? Math.min(...timed.map(l => l.lap_duration)) : 0;
  // How far round its lap: each sector's mini-sectors passed by its time.
  const segN = [cur?.segments_sector_1?.length || 8, cur?.segments_sector_2?.length || 8, cur?.segments_sector_3?.length || 6];
  const into = cur?.date_start ? (T - ms(cur.date_start)) / 1000 : 0;
  const secs = [cur?.duration_sector_1, cur?.duration_sector_2, cur?.duration_sector_3];
  let left = into;
  const sectors = segN.map((n, i) => {
    const s = secs[i] || (cur?.lap_duration ? cur.lap_duration / 3 : 30);
    const share = Math.max(0, Math.min(1, left / s));
    left -= s;
    const passed = out ? 0 : Math.floor(share * n);
    return { Value: share >= 1 && secs[i] ? secs[i].toFixed(3) : '', Segments: Array.from({ length: n }, (_, k) => ({ Status: k < passed ? 2048 : 0 })) };
  });
  const gapText = v => (typeof v === 'number' ? `+${v.toFixed(3)}` : typeof v === 'string' ? v.replace(/^\+?(\d+) LAPS?$/i, '$1L') : '');
  lines[no] = {
    Position: String(p || r.position || 99),
    GapToLeader: p === 1 ? `LAP ${cur?.lap_number || leaderLap}` : gapText(g?.gap_to_leader),
    IntervalToPositionAhead: { Value: p === 1 ? '' : gapText(g?.interval) },
    NumberOfLaps: mine.length ? mine.at(-1).lap_number : 0,
    NumberOfPitStops: (stopsBy[no] || []).filter(x => ms(x.date) <= T).length,
    // (A red flag: every car in the pit lane, as the feed shows them.)
    InPit: !out && (Boolean(lane) || red),
    PitOut: !out && !red && Boolean(laneOut),
    Retired: out,
    Stopped: false,
    LastLapTime: { Value: clock(mine.at(-1)?.lap_duration) },
    BestLapTime: { Value: clock(best) },
    Sectors: sectors
  };
  const stints = rows.stints.filter(x => x.driver_number === Number(no) && x.lap_start <= (cur?.lap_number || 0)).sort((a, b) => a.stint_number - b.stint_number);
  app[no] = {
    GridPos: String(gridOf(no) || ''),
    Stints: stints.map(x => ({ Compound: String(x.compound || '').toUpperCase(), StartLaps: x.tyre_age_at_start || 0, TotalLaps: (x.tyre_age_at_start || 0) + Math.max(0, Math.min(x.lap_end || Infinity, cur?.lap_number || 0) - x.lap_start + 1), New: String(!x.tyre_age_at_start) }))
  };
  const bestOf = k => Math.min(...mine.map(l => l[k]).filter(v => v > 0));
  stats[no] = {
    BestSectors: [1, 2, 3].map(i => ({ Value: Number.isFinite(bestOf(`duration_sector_${i}`)) ? bestOf(`duration_sector_${i}`).toFixed(3) : '', Position: 0 })),
    BestSpeeds: { ST: { Value: String(Math.max(0, ...mine.map(l => l.st_speed || 0)) || ''), Position: 0 } },
    PersonalBestLapTime: best ? { Value: clock(best), Lap: timed.find(l => l.lap_duration === best).lap_number, Position: 0 } : null
  };
  series[no] = { LapPosition: (kept.places[no] || []).map(String) };
  pits[no] = (kept.stops[no] || []).map(([Lap, PitStopTime, PitLaneTime]) => ({ PitStop: { Lap, PitStopTime, PitLaneTime } }));
}
const weather = rows.weather.filter(w => ms(w.date) <= T).at(-1);
const gmt = String(session.gmt_offset || '00:00:00');
const sign = gmt.startsWith('-') ? -1 : 1;
const [h, mm] = gmt.replace('-', '').split(':').map(Number);
const raw = {
  SessionInfo: { Key: session.session_key, Type: race ? 'Race' : /qualifying|shootout/i.test(session.session_type) ? 'Qualifying' : 'Practice', Name: session.session_name, StartDate: new Date(t0 + sign * (h * 60 + mm) * 60_000).toISOString().slice(0, 19), GmtOffset: gmt, Meeting: { Name: meeting?.meeting_name || '', Circuit: { Key: session.circuit_key } } },
  SessionStatus: { Status: status },
  TrackStatus: { Status: track, Message: { 1: 'AllClear', 2: 'Yellow', 4: 'SCDeployed', 5: 'Red', 6: 'VSCDeployed', 7: 'VSCEnding' }[track] },
  LapCount: race ? { CurrentLap: leaderLap, TotalLaps: total } : null,
  ExtrapolatedClock: { Remaining: '00:00:00', Extrapolating: false, Utc: new Date(T).toISOString() },
  DriverList: Object.fromEntries(rows.drivers.map(d => [String(d.driver_number), { Tla: d.name_acronym, FirstName: d.first_name, LastName: d.last_name, FullName: d.full_name, TeamName: d.team_name, TeamColour: d.team_colour }])),
  TimingData: { Lines: lines, SessionPart: 0 },
  TimingAppData: { Lines: app },
  TimingStats: { Lines: stats },
  RaceControlMessages: { Messages: msgs.map(m => ({ Utc: m.date, Lap: m.lap_number || 0, Category: m.category, Flag: m.flag || '', Scope: m.scope || '', Sector: m.sector || null, Message: m.message })) },
  WeatherData: weather ? { AirTemp: weather.air_temperature, TrackTemp: weather.track_temperature, Rainfall: weather.rainfall ? '1' : '0', WindSpeed: weather.wind_speed, Humidity: weather.humidity } : null,
  LapSeries: series,
  PitStopSeries: { PitTimes: pits },
  Position: null
};
await writeFile(join(out, 'now.json'), JSON.stringify(trimF1Live(raw, T)));
await writeFile(join(out, 'laps.json'), JSON.stringify({ at: T, ...kept, live: true }));

// ESPN's F1 scoreboard that day, the session on (its own status said "in" as it was then).
const espnDay = new Date(t0).toISOString().slice(0, 10).replace(/-/g, '');
const board = await (await fetch(`https://site.api.espn.com/apis/site/v2/sports/racing/f1/scoreboard?dates=${espnDay}`)).json();
for (const ev of board.events || [])
  for (const c of ev.competitions || [])
    if (Math.abs(Date.parse(c.date) - t0) < 30 * 60_000 && c.status?.type) c.status.type = { ...c.status.type, name: 'STATUS_IN_PROGRESS', state: 'in', completed: false, description: 'In Progress', detail: 'In Progress', shortDetail: 'In Progress' };
await writeFile(join(out, 'scoreboard.json'), JSON.stringify(board));
console.log(`${session.session_name} at ${new Date(T).toISOString()}: lap ${leaderLap}/${total}, session ${status}, track ${track}`);
// (The preview's arguments in args.txt too: `node tools/shots.mjs sports f1-live -- $(cat <out>/args.txt)`.)
const args = `--clock ${new Date(T).toISOString()} --fixture f1-live.orbit/now.json=${join(out, 'now.json')} --fixture f1-live.orbit/laps.json=${join(out, 'laps.json')} --fixture racing/f1/scoreboard=${join(out, 'scoreboard.json')}`;
await writeFile(join(out, 'args.txt'), args);
console.log(`node tools/preview.mjs sports ${args}`);
console.log(`node tools/shots.mjs sports f1-live f1-live-chart -- $(cat ${join(out, 'args.txt')})`);
