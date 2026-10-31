// Drivers the F1 sites don't know: a practice's stand-in (an F2 or F3
// driver, a team's reserve) has no formula1.com page and no ESPN headshot.
// Two reads for Orbit Sports, through the F1 live host (f1-live.js):
//   /about.json?name=Gabriele Minì: who he is, Wikipedia's first lines
//     ({ en, zh, url }: the Chinese article's own where there is one);
//   /face.json?u=<a TheSportsDB cutout>: where his head is in it
//     ({ x, y, s }: the crop's centre as shares of the picture, and how far
//     in to go), so a round face is his head and shoulders like ESPN's,
//     not a small whole torso (TheSportsDB's cutouts are mostly half-body,
//     a few already head-and-shoulders: only a reading of the picture tells).
const UA = 'OrbitSports/1.0 (https://jaypengx.com; sports data for a phone app)';
const TIMEOUT = 8_000;
const get = (url, headers = {}) => fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: AbortSignal.timeout(TIMEOUT) });

// ---- Who he is ----------------------------------------------------------------------
// Wikipedia's summary of the article by his name, only when it's a racing
// driver's (a namesake's is no one's background); the Chinese article's
// (Taiwan's wording) where the English one links one.
const WIKI_DRIVER = /racing driver|racecar driver|race car driver|motorsport/i;
async function summary(host, title, headers) {
  const res = await get(`https://${host}/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g, '_'))}?redirect=true`, headers);
  if (!res.ok) return null;
  const d = await res.json();
  return d?.type === 'standard' ? d : null;
}
export async function driverAbout(name) {
  const n = String(name || '').replace(/\s+/g, ' ').trim();
  if (!n || n.length > 60) return null;
  let en = await summary('en.wikipedia.org', n);
  if (en && !WIKI_DRIVER.test(`${en.description || ''} ${en.extract || ''}`)) en = null;
  // "Ryo Hirakawa" may be under "Ryō Hirakawa": Wikipedia's search, its first driver.
  if (!en) {
    const res = await get(`https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(`${n} racing driver`)}&srlimit=3&format=json`);
    const hits = res.ok ? (await res.json())?.query?.search || [] : [];
    const fold = s => s.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
    const last = fold(n.split(' ').at(-1));
    for (const h of hits) {
      if (!fold(h.title).includes(last)) continue;
      const s = await summary('en.wikipedia.org', h.title);
      if (s && WIKI_DRIVER.test(`${s.description || ''} ${s.extract || ''}`)) {
        en = s;
        break;
      }
    }
  }
  if (!en) return { en: '', zh: '', url: '' };
  let zh = '';
  try {
    const res = await get(`https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(en.title)}&prop=langlinks&lllang=zh&format=json&redirects=1`);
    const page = Object.values((res.ok ? await res.json() : null)?.query?.pages || {})[0];
    const title = page?.langlinks?.[0]?.['*'];
    if (title) zh = (await summary('zh.wikipedia.org', title, { 'Accept-Language': 'zh-tw' }))?.extract || '';
  } catch {}
  return { en: en.extract || '', zh, url: en.content_urls?.mobile?.page || '' };
}

// ---- Where his head is ----------------------------------------------------------------
// A PNG read as far as its alpha: 8-bit RGBA or grey with alpha, not
// interlaced (TheSportsDB's cutouts); anything else is null (no crop).
export async function pngAlpha(bytes) {
  const u8 = new Uint8Array(bytes);
  const view = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (view.getUint32(0) !== 0x89504e47) return null;
  let at = 8, w = 0, h = 0, kind = 0;
  const idat = [];
  while (at + 8 <= u8.length) {
    const len = view.getUint32(at);
    const type = String.fromCharCode(...u8.subarray(at + 4, at + 8));
    const body = u8.subarray(at + 8, at + 8 + len);
    if (type === 'IHDR') {
      w = view.getUint32(at + 8);
      h = view.getUint32(at + 12);
      if (body[8] !== 8 || body[12] !== 0) return null;
      kind = body[9];
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'IEND') break;
    at += 12 + len;
  }
  const bpp = kind === 6 ? 4 : kind === 4 ? 2 : 0;
  if (!bpp || !w || !h) return null;
  const raw = new Uint8Array(await new Response(new Blob(idat).stream().pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  const stride = w * bpp;
  if (raw.length < (stride + 1) * h) return null;
  const alpha = new Uint8Array(w * h);
  let prev = new Uint8Array(stride);
  for (let y = 0; y < h; y++) {
    const f = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const cur = new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= bpp ? cur[i - bpp] : 0, b = prev[i], c = i >= bpp ? prev[i - bpp] : 0;
      const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
      const pred = f === 1 ? a : f === 2 ? b : f === 3 ? (a + b) >> 1 : f === 4 ? (pa <= pb && pa <= pc ? a : pb <= pc ? b : c) : 0;
      cur[i] = (line[i] + pred) & 255;
    }
    for (let x = 0; x < w; x++) alpha[y * w + x] = cur[x * bpp + bpp - 1];
    prev = cur;
  }
  return { w, h, alpha };
}
// The crop of a cutout that is his head and shoulders: the top of his head
// (the first row with him in it), his head's width a little below it, and a
// square about 2.4 heads across from just above it (the head about half of
// a round face, as ESPN's are). { x, y, s }: s 1 when the picture is that already.
export function faceCrop({ w, h, alpha }) {
  const span = y => {
    let a = -1, b = -1;
    for (let x = 0; x < w; x++) if (alpha[y * w + x] > 128) (a < 0 && (a = x), (b = x));
    return a < 0 ? null : [a, b];
  };
  let top = 0;
  while (top < h && !(span(top) && span(top)[1] - span(top)[0] > 2)) top++;
  if (top >= h * 0.6) return null;
  // The head's width: the widest of a few rows a tenth to a sixth of the way down from its top (under the hair's crown, above the ears' widest).
  const rows = [0.09, 0.11, 0.13].map(k => span(Math.min(h - 1, Math.round(top + k * h)))).filter(Boolean);
  if (!rows.length) return null;
  const [a, b] = rows.reduce((m, r) => (r[1] - r[0] < m[1] - m[0] ? r : m));
  const head = b - a + 1;
  const size = Math.min(w, h, head * 2.4);
  const s = Math.max(1, Math.min(3, Math.min(w, h) / size));
  const side = Math.min(w, h) / s;
  const cx = Math.min(w - side / 2, Math.max(side / 2, (a + b) / 2));
  const cy = Math.min(h - side / 2, Math.max(side / 2, top - side * 0.08 + side / 2));
  const r = n => Math.round(n * 1000) / 1000;
  return { x: r(cx / w), y: r(cy / h), s: r(s) };
}
const CUTOUT = /^https:\/\/r2\.thesportsdb\.com\/images\/media\/player\/cutout\/[a-z0-9]+\.png$/i;
export async function face(u) {
  const url = String(u || '').replace(/\/(small|medium|tiny)$/, '');
  if (!CUTOUT.test(url)) return null;
  const res = await get(`${url}/small`);
  if (!res.ok) throw new Error(`cutout ${res.status}`);
  const png = await pngAlpha(await res.arrayBuffer());
  return (png && faceCrop(png)) || { x: 0.5, y: 0.5, s: 1 };
}
