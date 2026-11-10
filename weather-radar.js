// ---- weather-radar.js ----
// Rain in the next two hours at a place, from CWA's radar as it is now
// (O-A0059-001, 雷達合成回波: what the seven radars see, every 10 minutes, on
// CWA's public open-data bucket, no key), moved on the way it is moving.
//
// Why not CWA's own "next hour" forecast (F-B0046-001, used until
// 2026-11-10): on Jay's evening of 11-10 it put 2–11 mm over the whole of
// 竹北 and the coast while no radar saw an echo within 30 km and every gauge
// there read 0 (Jay: the alert said rain, the page said 晴). Real echoes,
// tracked, can only say rain that exists; and tracked, they say when it comes
// and goes, not just an hour's sum.
//
// The cron (every 10 minutes, in the Runner: the file is 9 MB of text) keeps
// Taiwan's part of the grid, one byte a cell (`weather/radar-echo.bin` in R2,
// ~1.4 km cells), and how the echoes moved since the last frame, tile by tile
// (40 km tiles, block matching, `motionOf`), in the object's metadata.
// A /weather answer reads one ranged slice around the place (~50 KB) and
// walks back along the motion from the place: what is upwind now is what
// arrives (`radarAt`: `{ at, step, rate, mm, near }`, the rain rate at the
// place every 5 minutes for two hours from the frame's time, mm an hour).
export const ECHO_URL = 'https://cwaopendata.s3.ap-northeast-1.amazonaws.com/Observation/O-A0059-001.json';
export const RADAR_KEY = 'weather/radar-echo.bin';
// Taiwan's part (the grid CWA's rain products use): 118–123.5°E, 20–27°N.
export const NX = 441;
export const NY = 561;
const X0 = 118;
const Y0 = 20;
const STEP = 0.0125;
// CWA's whole echo grid, and where Taiwan's part starts in it.
const EX = 921;
const EY = 881;
const EX0 = 115;
const EY0 = 18;
const COL0 = Math.round((X0 - EX0) / STEP);
const ROW0 = Math.round((Y0 - EY0) / STEP);
// A frame this old (its data time) is no longer now.
export const RADAR_OLD_MS = 40 * 60_000;
// Two hours ahead, a step every 5 minutes.
export const STEP_MIN = 5;
export const STEPS = 25;
// Motion: square tiles of TILE cells, a shift of up to MAX_MOVE cells in 10 minutes (~60 km/h).
export const TILE = 32;
const TX = Math.ceil(NX / TILE);
const TY = Math.ceil(NY / TILE);
const MAX_MOVE = 8;
// The slice read around a place: WIN rows each side (75 km).
const WIN = 60;

// One byte a cell: half dBZ steps (0 no echo, 255 outside the radars).
export const encodeDbz = v => (Number.isNaN(v) || v <= -500 ? 255 : v < 0.5 ? 0 : Math.min(254, Math.round(v * 2)));
export const decodeDbz = b => (b === 255 ? null : b / 2);
// dBZ to rain, mm an hour (Marshall–Palmer, Z = 200 R^1.6); under 18 dBZ
// (~0.5 mm/h) an echo is mostly drops that never reach the ground: dry.
export const WET_DBZ = 18;
export const rateOf = dbz => (dbz == null || dbz < WET_DBZ ? 0 : Math.round(Math.pow(Math.pow(10, dbz / 10) / 200, 1 / 1.6) * 10) / 10);
const zOf = b => (b === 0 || b === 255 ? 0 : Math.pow(10, b / 20));

// WGS84 to the grid's TWD67 (about 800 m east, 250 m north apart in Taiwan), fractional.
export function cellAt(lat, lon) {
  const row = (lat + 0.00225 - Y0) / STEP;
  const col = (lon - 0.008 - X0) / STEP;
  return row >= 1 && row < NY - 1 && col >= 1 && col < NX - 1 ? { row, col } : null;
}

// CWA's JSON → { at, bytes } (NX × NY, west to east, then south to north).
export function packEcho(j) {
  const set = j?.cwaopendata?.dataset;
  const p = set?.datasetInfo?.parameterSet;
  const text = set?.contents?.content;
  if (!p || typeof text !== 'string' || Number(p.GridDimensionX) !== EX || Number(p.GridDimensionY) !== EY || Number(p.GridResolution) !== STEP || Number(p.StartPointLongitude) !== EX0 || Number(p.StartPointLatitude) !== EY0) return null;
  const at = Date.parse(p.DateTime);
  if (!Number.isFinite(at)) return null;
  const bytes = new Uint8Array(NX * NY);
  let from = 0;
  for (let i = 0; i < EX * EY; i++) {
    const comma = text.indexOf(',', from);
    const end = comma < 0 ? text.length : comma;
    const row = Math.floor(i / EX) - ROW0;
    const col = (i % EX) - COL0;
    if (row >= 0 && row < NY && col >= 0 && col < NX) bytes[row * NX + col] = encodeDbz(parseFloat(text.slice(from, end)));
    if (comma < 0) return i === EX * EY - 1 ? { at, bytes } : null;
    from = comma + 1;
  }
  return { at, bytes };
}

// How the echoes moved from `prev` to `next` (`gap` minutes apart), tile by
// tile: { dx, dy } in cells per 10 minutes (east, north), as an Int8Array of
// half cells (dx, dy for each tile, west to east, then south to north).
// A tile with too little rain to match takes its neighbours' (weighted by
// distance), and with no rain anywhere every tile stands still.
export function motionOf(prev, next, gap = 10) {
  const reach = Math.max(1, Math.round((MAX_MOVE * gap) / 10));
  const v = b => (b === 255 || b < 2 * 10 ? 0 : Math.min(b, 110));
  const found = [];
  for (let ty = 0; ty < TY; ty++)
    for (let tx = 0; tx < TX; tx++) {
      const r0 = ty * TILE;
      const c0 = tx * TILE;
      const r1 = Math.min(NY, r0 + TILE);
      const c1 = Math.min(NX, c0 + TILE);
      let wet = 0;
      for (let r = r0; r < r1; r++) for (let c = c0; c < c1; c++) if (prev[r * NX + c] >= 2 * WET_DBZ && prev[r * NX + c] !== 255) wet++;
      if (wet < 24) continue;
      let best = null;
      for (let dy = -reach; dy <= reach; dy++)
        for (let dx = -reach; dx <= reach; dx++) {
          let cost = 0;
          let n = 0;
          for (let r = r0; r < r1; r++) {
            const rr = r + dy;
            if (rr < 0 || rr >= NY) continue;
            for (let c = c0; c < c1; c++) {
              const cc = c + dx;
              if (cc < 0 || cc >= NX) continue;
              cost += Math.abs(v(prev[r * NX + c]) - v(next[rr * NX + cc]));
              n++;
            }
          }
          if (!n) continue;
          const mean = cost / n + (Math.abs(dx) + Math.abs(dy)) * 0.01;
          if (!best || mean < best.mean) best = { mean, dx, dy };
        }
      if (best) found.push({ tx, ty, dx: (best.dx * 10) / gap, dy: (best.dy * 10) / gap });
    }
  // (A lone tile against all its neighbours is a mismatch: the neighbours' median.)
  const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
  // (One with too few neighbours to judge it by: against every tile's median, more loosely.)
  const all = found.length >= 3 ? { dx: med(found.map(g => g.dx)), dy: med(found.map(g => g.dy)) } : null;
  const kept = found.map(f => {
    const near = found.filter(g => g !== f && Math.abs(g.tx - f.tx) <= 1 && Math.abs(g.ty - f.ty) <= 1);
    const [ref, far] = near.length >= 2 ? [{ dx: med(near.map(g => g.dx)), dy: med(near.map(g => g.dy)) }, 3] : [all, 4];
    return ref && Math.hypot(f.dx - ref.dx, f.dy - ref.dy) > far ? { ...f, ...ref } : f;
  });
  const out = new Int8Array(TX * TY * 2);
  for (let ty = 0; ty < TY; ty++)
    for (let tx = 0; tx < TX; tx++) {
      const own = kept.find(f => f.tx === tx && f.ty === ty);
      let dx = 0;
      let dy = 0;
      if (own) ({ dx, dy } = own);
      else if (kept.length) {
        let w = 0;
        for (const f of kept) {
          const k = 1 / (1 + (f.tx - tx) ** 2 + (f.ty - ty) ** 2);
          dx += f.dx * k;
          dy += f.dy * k;
          w += k;
        }
        dx /= w;
        dy /= w;
      }
      const i = (ty * TX + tx) * 2;
      out[i] = Math.max(-127, Math.min(127, Math.round(dx * 2)));
      out[i + 1] = Math.max(-127, Math.min(127, Math.round(dy * 2)));
    }
  return out;
}
const b64 = a => btoa(String.fromCharCode(...new Uint8Array(a.buffer)));
const unb64 = s => new Int8Array(Uint8Array.from(atob(s), ch => ch.charCodeAt(0)).buffer);

// The cron's work: CWA's newest frame, packed, its motion from the last one, kept when new.
export async function radarCron(env, { fetchFn = fetch } = {}) {
  if (!env.DATA) return { off: 'no bucket' };
  const res = await fetchFn(ECHO_URL, { signal: AbortSignal.timeout(25_000) });
  if (!res.ok) return { failed: res.status };
  const packed = packEcho(await res.json());
  if (!packed) return { failed: 'shape' };
  const old = await env.DATA.get(RADAR_KEY).catch(() => null);
  const oldAt = Number(old?.customMetadata?.at);
  if (oldAt === packed.at) return { same: packed.at };
  const gap = (packed.at - oldAt) / 60_000;
  let motion = null;
  if (old && gap > 0 && gap <= 30) motion = b64(motionOf(new Uint8Array(await old.arrayBuffer()), packed.bytes, gap));
  // (No frame just before this one: the last motion, while it's under 30 minutes old.)
  else if (old?.customMetadata?.motion && packed.at - Number(old.customMetadata.movedAt || oldAt) <= 30 * 60_000) motion = old.customMetadata.motion;
  const meta = { at: String(packed.at), tile: String(TILE) };
  if (motion) Object.assign(meta, { motion, movedAt: String(gap > 0 && gap <= 30 ? packed.at : old.customMetadata.movedAt || oldAt) });
  await env.DATA.put(RADAR_KEY, packed.bytes, { httpMetadata: { contentType: 'application/octet-stream' }, customMetadata: meta });
  let wet = 0;
  for (const b of packed.bytes) if (b >= 2 * WET_DBZ && b < 255) wet++;
  return { at: packed.at, wet, moving: !!motion };
}

// The rain rate at a place every STEP_MIN from the frame's time: walk back
// along the motion from the place (where the rain that reaches it then is
// now), its echo read between the four cells around (Z, not dBZ, blended).
export function railOf(slice, r0, rows, { row, col }, motion) {
  const at = (r, c) => {
    const rr = Math.floor(r);
    const cc = Math.floor(c);
    if (rr < r0 || rr + 1 >= r0 + rows || cc < 0 || cc + 1 >= NX) return null;
    const fr = r - rr;
    const fc = c - cc;
    const b = (y, x) => slice[(y - r0) * NX + x];
    const cells = [b(rr, cc), b(rr, cc + 1), b(rr + 1, cc), b(rr + 1, cc + 1)];
    if (cells.includes(255)) return null;
    const z = zOf(cells[0]) * (1 - fr) * (1 - fc) + zOf(cells[1]) * (1 - fr) * fc + zOf(cells[2]) * fr * (1 - fc) + zOf(cells[3]) * fr * fc;
    return z > 0 ? 10 * Math.log10(z) : 0;
  };
  const moveAt = (r, c) => {
    if (!motion) return [0, 0];
    const tx = Math.max(0, Math.min(TX - 1, Math.floor(c / TILE)));
    const ty = Math.max(0, Math.min(TY - 1, Math.floor(r / TILE)));
    const i = (ty * TX + tx) * 2;
    return [motion[i] / 2, motion[i + 1] / 2];
  };
  const out = [];
  let r = row;
  let c = col;
  // (Standing still, the frame says only the next half hour.)
  const steps = motion ? STEPS : 7;
  for (let k = 0; k < steps; k++) {
    const dbz = at(r, c);
    out.push(dbz == null ? null : rateOf(dbz));
    const [dx, dy] = moveAt(r, c);
    r -= (dy * STEP_MIN) / 10;
    c -= (dx * STEP_MIN) / 10;
  }
  return out;
}

// The next two hours' rain at a place: { at, step, rate, mm, near }, or null
// (no fresh frame, the place off the grid). `rate`: mm an hour every `step`
// minutes from `at` (null where the radars can't say); `mm`, `near`: the next
// hour's sum (as the app read it before 2026-11-10). Kept a minute in this isolate.
const memo = new Map();
export async function radarAt(env, lat, lon, now = Date.now()) {
  const cell = cellAt(lat, lon);
  if (!cell || !env.DATA) return null;
  const key = `${Math.round(cell.row * 2)},${Math.round(cell.col * 2)}`;
  const kept = memo.get(key);
  if (kept && now - kept.read < 60_000) return kept.value;
  const r0 = Math.max(0, Math.floor(cell.row) - WIN);
  const rows = Math.min(NY, Math.floor(cell.row) + WIN + 2) - r0;
  const obj = await env.DATA.get(RADAR_KEY, { range: { offset: r0 * NX, length: rows * NX } }).catch(() => null);
  let value = null;
  const at = Number(obj?.customMetadata?.at);
  if (obj && now - at < RADAR_OLD_MS) {
    const slice = new Uint8Array(await obj.arrayBuffer());
    const motion = obj.customMetadata.motion ? unb64(obj.customMetadata.motion) : null;
    const rate = railOf(slice, r0, rows, cell, motion);
    const hour = rate.slice(0, 12).reduce((a, x) => a + (x || 0), 0) * (STEP_MIN / 60);
    const mm = Math.round(hour * 10) / 10;
    value = { at, step: STEP_MIN, rate, moving: !!motion, mm, near: mm };
  }
  if (memo.size > 2000) memo.clear();
  memo.set(key, { read: now, value });
  return value;
}
