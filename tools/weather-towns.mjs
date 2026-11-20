// Rebuilds weather-towns.js, the point 搜尋地點 puts each of Taiwan's 368
// townships at: CWA's own point for it (its 公所, where CWA's township
// forecast is for; from the live Worker's samples,
// /weather/status?sample=cwa-towns-…, so no key is needed here) when NLSC
// says it's inside the township; else the mean of its stations, else its
// station nearest CWA's point, the first NLSC places inside. (43 of CWA's
// points weren't: 旗津區's in the harbour, 泰武鄉's in 萬巒鄉.)
// Townships change rarely; rerun then:  node tools/weather-towns.mjs
// (Until 2026-11-20 the point was the mean of the township's stations: 19 of
// 368 fell outside their township, 旗津區 in the South China Sea with
// 東沙島 and 南沙島's stations, 基隆市中正區 22 km out with 彭佳嶼's.)
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { COUNTY_IDS, townIds, km, parseVillage } from '../weather.js';
import { STATIONS } from '../weather-stations.js';

const BASE = process.env.WORKER || 'https://orbit-workers-proxy.pengzjay.workers.dev';
const rows = [];
for (const county of Object.keys(COUNTY_IDS)) {
  const id = townIds(county)[0];
  const wrap = JSON.parse(execFileSync('curl', ['-sS', '-m', '120', `${BASE}/weather/status?sample=cwa-towns-${id}`], { maxBuffer: 64 << 20 }).toString());
  if (wrap.status !== 200) throw new Error(`${county} ${id}: ${wrap.status}`);
  const locs = JSON.parse(wrap.body).records.Locations[0];
  if (locs.LocationsName.replace(/台/g, '臺') !== county) throw new Error(`${id} is ${locs.LocationsName}, not ${county}`);
  for (const l of locs.Location) rows.push([county, l.LocationName.replace(/台/g, '臺'), +(+l.Latitude).toFixed(4), +(+l.Longitude).toFixed(4)]);
}
if (rows.length !== 368) throw new Error(`${rows.length} townships, not 368`);

// NLSC's township at a point (a blank answer is asked again: it gives one now and then).
const tai = s => String(s || '').replace(/台/g, '臺');
async function townAt(lat, lon) {
  for (let i = 0; i < 4; i++) {
    const p = await fetch(`https://api.nlsc.gov.tw/other/TownVillagePointQuery1/${lon}/${lat}`, { signal: AbortSignal.timeout(15_000) })
      .then(r => r.text())
      .then(parseVillage)
      .catch(() => ({}));
    if (p.county) return `${tai(p.county)}|${tai(p.town)}`;
    await new Promise(r => setTimeout(r, 500));
  }
  return null;
}
const queue = [...rows];
const moved = [];
await Promise.all(
  Array.from({ length: 4 }, async () => {
    for (let row; (row = queue.shift()); ) {
      const [county, town, lat, lon] = row;
      const own = STATIONS.filter(s => s[4] === county && s[5] === town);
      const mean = own.length ? [+(own.reduce((a, s) => a + s[2], 0) / own.length).toFixed(4), +(own.reduce((a, s) => a + s[3], 0) / own.length).toFixed(4)] : null;
      // (Last, a township with no station of its own: rings around CWA's point, 0.5 to 3 km.)
      const rings = [0.005, 0.01, 0.015, 0.02, 0.03].flatMap(r => Array.from({ length: 8 }, (_, i) => [+(lat + r * Math.sin((i * Math.PI) / 4)).toFixed(4), +(lon + r * Math.cos((i * Math.PI) / 4)).toFixed(4)]));
      const tries = [[lat, lon], mean, ...own.sort((a, b) => km(lat, lon, a[2], a[3]) - km(lat, lon, b[2], b[3])).map(s => [s[2], s[3]]), ...rings].filter(Boolean);
      // (NLSC doesn't know 連江縣 at all, 2026-11-20: its townships keep CWA's point.)
      const hit = county === '連江縣' ? [lat, lon] : await (async () => {
        for (const p of tries) if ((await townAt(...p)) === `${county}|${town}`) return p;
        return null;
      })();
      if (!hit) throw new Error(`${county}${town}: no point inside it`);
      if (hit[0] !== lat || hit[1] !== lon) moved.push(`${county}${town} ${Math.round(km(lat, lon, hit[0], hit[1]) * 10) / 10} km`);
      [row[2], row[3]] = hit;
    }
  })
);
console.log('off CWA\'s point:', moved.length, moved.join(', '));
const order = Object.keys(COUNTY_IDS);
rows.sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]) || a[1].localeCompare(b[1], 'zh-Hant'));
writeFileSync(
  new URL('../weather-towns.js', import.meta.url),
  `// ---- weather-towns.js ----\n// Taiwan's townships: [county, town, lat, lon], each at CWA's own point for\n// it (its 公所), for 搜尋地點. Built by tools/weather-towns.mjs on ${new Date().toISOString().slice(0, 10)}; don't edit by hand.\nexport const TOWNS = [\n${rows.map(r => '  ' + JSON.stringify(r)).join(',\n')}\n];\n`
);
console.log(rows.length, 'townships');
