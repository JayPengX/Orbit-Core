// ---- weather-radar.js ----
// Rain in the next hour from CWA's radar (F-B0046-001, 未來1小時雷達定量降雨預報:
// the radar's echoes moved on by extrapolation, as QPESUMS does it; Jay
// 2026-11-10 "All yes"). A ~1.4 km grid of Taiwan (441 × 561 at 0.0125°,
// TWD67) every 10 minutes, on CWA's public open-data bucket (no key).
//
// The cron (every 10 minutes, in the Runner: the file is 2.7 MB of text) packs
// it into one byte a cell (`weather/radar-qpf.bin` in R2, its time in the
// metadata); a /weather answer reads only the 3 × 3 cells around the place
// (one ranged R2 read, under a kilobyte): `radar: { at, mm, near }`, the
// next hour's millimetres there and the most within ~2 km.
export const RADAR_URL = 'https://cwaopendata.s3.ap-northeast-1.amazonaws.com/Forecast/F-B0046-001.json';
export const RADAR_KEY = 'weather/radar-qpf.bin';
export const NX = 441;
export const NY = 561;
const X0 = 118;
const Y0 = 20;
const STEP = 0.0125;
// A forecast this old (its data time) is no longer the next hour's.
export const RADAR_OLD_MS = 40 * 60_000;
// One byte a cell: 0.1 mm to 10 mm, then 0.5 mm to 87 mm; 255 unreadable.
// (CWA's -99, "invalid", is every cell no echo reaches: dry. 97% of the grid
// on a dry day; where the past hour's estimate saw rain, the same.)
export const encodeMm = v => (Number.isNaN(v) ? 255 : v < 0.05 ? 0 : v < 10 ? Math.max(1, Math.round(v * 10)) : Math.min(254, 100 + Math.round((v - 10) * 2)));
export const decodeMm = b => (b === 255 ? null : b <= 100 ? b / 10 : 10 + (b - 100) / 2);
// WGS84 to the grid's TWD67 (about 800 m east, 250 m north apart in Taiwan).
export function cellAt(lat, lon) {
  const row = Math.round((lat + 0.00225 - Y0) / STEP);
  const col = Math.round((lon - 0.008 - X0) / STEP);
  return row >= 1 && row < NY - 1 && col >= 1 && col < NX - 1 ? { row, col } : null;
}

// CWA's JSON → { at, bytes } (NX × NY, west to east, then south to north).
export function packRadar(j) {
  const set = j?.cwaopendata?.dataset;
  const p = set?.datasetInfo?.parameterSet;
  const text = set?.contents?.content;
  if (!p || typeof text !== 'string' || Number(p.GridDimensionX) !== NX || Number(p.GridDimensionY) !== NY || Number(p.GridResolution) !== STEP || Number(p.StartPointLongitude) !== X0 || Number(p.StartPointLatitude) !== Y0) return null;
  const at = Date.parse(p.DateTime);
  if (!Number.isFinite(at)) return null;
  const bytes = new Uint8Array(NX * NY);
  let i = 0;
  let from = 0;
  while (i < bytes.length) {
    const comma = text.indexOf(',', from);
    const end = comma < 0 ? text.length : comma;
    bytes[i++] = encodeMm(parseFloat(text.slice(from, end)));
    if (comma < 0) break;
    from = comma + 1;
  }
  return i === bytes.length ? { at, bytes } : null;
}

// The cron's work: CWA's newest, packed and kept when it's new.
export async function radarCron(env, { fetchFn = fetch } = {}) {
  if (!env.DATA) return { off: 'no bucket' };
  const res = await fetchFn(RADAR_URL, { signal: AbortSignal.timeout(25_000) });
  if (!res.ok) return { failed: res.status };
  const packed = packRadar(await res.json());
  if (!packed) return { failed: 'shape' };
  const head = await env.DATA.head(RADAR_KEY).catch(() => null);
  if (Number(head?.customMetadata?.at) === packed.at) return { same: packed.at };
  await env.DATA.put(RADAR_KEY, packed.bytes, { httpMetadata: { contentType: 'application/octet-stream' }, customMetadata: { at: String(packed.at) } });
  let wet = 0;
  for (const b of packed.bytes) if (b > 0 && b < 255) wet++;
  return { at: packed.at, wet };
}

// The next hour's rain at a place: { at, mm, near }, or null (no fresh
// forecast, the place off the grid). Kept a minute in this isolate.
const memo = new Map();
export async function radarAt(env, lat, lon, now = Date.now()) {
  const cell = cellAt(lat, lon);
  if (!cell || !env.DATA) return null;
  const key = `${cell.row},${cell.col}`;
  const kept = memo.get(key);
  if (kept && now - kept.read < 60_000) return kept.value;
  const offset = (cell.row - 1) * NX + (cell.col - 1);
  const obj = await env.DATA.get(RADAR_KEY, { range: { offset, length: 2 * NX + 3 } }).catch(() => null);
  let value = null;
  const at = Number(obj?.customMetadata?.at);
  if (obj && now - at < RADAR_OLD_MS) {
    const b = new Uint8Array(await obj.arrayBuffer());
    const near = [];
    for (const dy of [0, 1, 2]) for (const dx of [0, 1, 2]) near.push(decodeMm(b[dy * NX + dx]));
    const mm = near[4];
    const known = near.filter(x => x != null);
    if (mm != null) value = { at, mm, near: Math.max(...known) };
  }
  if (memo.size > 2000) memo.clear();
  memo.set(key, { read: now, value });
  return value;
}
