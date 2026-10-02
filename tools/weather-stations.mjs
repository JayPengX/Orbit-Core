// Rebuilds weather-stations.js, CWA's station table (where each station is,
// its township, what it measures), from the live Worker's samples
// (/weather/status?sample=…), so no key is needed here. Stations change a
// few times a year; rerun then:  node tools/weather-stations.mjs
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const BASE = process.env.WORKER || 'https://orbit-workers-proxy.pengzjay.workers.dev';
const sample = name => {
  const wrap = JSON.parse(execFileSync('curl', ['-sS', '-m', '120', `${BASE}/weather/status?sample=${name}`], { maxBuffer: 64 << 20 }).toString());
  if (wrap.status !== 200) throw new Error(`${name}: ${wrap.status}`);
  return JSON.parse(wrap.body).records.Station;
};

// Flags: a = O-A0001-001 (automatic, hourly), m = O-A0003-001 (manned, UV
// and visibility), r = O-A0002-001 (rain gauge).
const byId = new Map();
for (const [name, flag] of [['cwa-stations', 'a'], ['cwa-manned', 'm'], ['cwa-rain', 'r']]) {
  for (const s of sample(name)) {
    const c = s.GeoInfo.Coordinates.find(x => x.CoordinateName === 'WGS84');
    const row = byId.get(s.StationId) || [s.StationId, s.StationName, +(+c.StationLatitude).toFixed(4), +(+c.StationLongitude).toFixed(4), s.GeoInfo.CountyName, s.GeoInfo.TownName, ''];
    if (!row[6].includes(flag)) row[6] += flag;
    byId.set(s.StationId, row);
  }
}
const rows = [...byId.values()].sort((a, b) => a[0].localeCompare(b[0]));
writeFileSync(
  new URL('../weather-stations.js', import.meta.url),
  `// ---- weather-stations.js ----\n// CWA's stations: [id, name, lat, lon, county, town, flags] (flags: a\n// automatic O-A0001-001, m manned O-A0003-001, r rain gauge O-A0002-001).\n// Built by tools/weather-stations.mjs on ${new Date().toISOString().slice(0, 10)}; don't edit by hand.\nexport const STATIONS = [\n${rows.map(r => '  ' + JSON.stringify(r)).join(',\n')}\n];\n`
);
console.log(rows.length, 'stations');
