// Orbit Weather's typhoon day off (停班停課), on /weather while CWA has a
// typhoon warning out: the county's official word when 人事行政總處's page
// has one, else a chance from the rule the counties decide by (天然災害停止
// 上班及上課作業辦法: the 7級 storm circle reaching, average wind 7級 or gusts
// 10級, or 350 mm in 24 hours), read against this place's forecast, the
// warning's land areas, its track and its 強風 lamps. Nothing is shown
// without a warning.
//
// Sources: NCDR's open CAP feed (CWA's typhoon warning, no key) and the
// DGPA page (served only in Taiwan: read through gemini-relay, pinned there).

const MIN = 60_000;
const HOUR = 60 * MIN;
const TW = 8 * HOUR;
export const NCDR_FEED = 'https://alerts.ncdr.nat.gov.tw/RssAtomFeed.ashx';
const NCDR_HOST = 'alerts.ncdr.nat.gov.tw';
export const DGPA_NDS = 'https://www.dgpa.gov.tw/typh/daily/nds.html';

const tai = s => String(s || '').replace(/台/g, '臺');
export const COUNTIES = ['基隆市', '臺北市', '新北市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '臺中市', '彰化縣', '南投縣', '雲林縣', '嘉義市', '嘉義縣', '臺南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣'];
const twDate = t => new Date(t + TW).toISOString().slice(0, 10);
const twDom = t => new Date(t + TW).getUTCDate();
const tag = (xml, name) => new RegExp(`<${name}\\b[^>]*>([\\s\\S]*?)</${name}>`).exec(xml)?.[1]?.trim() ?? null;
const section = (xml, title) => new RegExp(`<section title="${title}">([\\s\\S]*?)</section>`).exec(xml)?.[1]?.trim() ?? '';
const unent = s => String(s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&');

// The newest typhoon warning in NCDR's feed: its CAP file's link, or null.
export function feedTyphoon(xml) {
  const entries = String(xml || '').split('<entry>').slice(1);
  const ty = entries
    .filter(x => /typhoon-warning/i.test(tag(x, 'id') || '') && /term="颱風"/.test(x) && (tag(x, 'cap:status') || 'Actual') === 'Actual')
    .map(x => ({ href: unent(/<link[^>]*href="([^"]+)"/.exec(x)?.[1] || ''), at: Date.parse(tag(x, 'updated') || '') || 0 }))
    .filter(x => x.href)
    .sort((a, b) => b.at - a.at)[0];
  return ty || null;
}

// A position "lat,lon".
const pos = s => {
  const [lat, lon] = String(s || '').split(',').map(Number);
  return Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
};

// The 強風 lamps: { county: [{ dom (day of month), wind, gust }] }, from
// sentences like 今(22)日臺中市、彰化縣局部地區有平均風9級以上或陣風11級以上…(橙色燈號).
export function parseLamps(text) {
  const out = {};
  let days = [];
  // (A sentence's days hold for all its parts: 今(22)日…，明(23)日…，蘭嶼、新北市…(橙色燈號).)
  for (const sentence of String(text || '').split(/[。；]/)) {
    const named = [...sentence.matchAll(/[今明後]\((\d{1,2})\)日/g)].map(m => Number(m[1]));
    if (named.length) days = named;
    for (const part of sentence.split('，')) {
      const m = /平均風\s*(\d+)\s*級以上或陣風\s*(\d+)\s*級以上/.exec(part);
      if (!m) continue;
      for (const c of COUNTIES) if (tai(part).includes(c)) for (const dom of days.length ? days : [null]) (out[c] ||= []).push({ dom, wind: Number(m[1]), gust: Number(m[2]) });
    }
  }
  return out;
}

// CWA's typhoon warning (CAP 1.2): the storm, the warning, its track, the
// land it covers and the 強風 lamps; null for a lifted warning.
export function parseTyphoonCap(xml, now = Date.now()) {
  const s = String(xml || '');
  if (!/<event>颱風<\/event>/.test(s)) return null;
  const head = tag(s, 'headline') || '';
  if (tag(s, 'msgType') === 'Cancel' || /解除/.test(head) || (tag(s, 'status') || 'Actual') !== 'Actual') return null;
  const point = (block, at) => {
    const p = pos(tag(block, 'position'));
    const r = Number(tag(block, 'radius_of_15mps'));
    const v = Number(tag(block, 'max_winds'));
    return p ? { t: Date.parse(tag(block, 'time') || at) || null, ...p, r7: Number.isFinite(r) ? r : null, v: Number.isFinite(v) ? v : null } : null;
  };
  const analysis = tag(s, 'analysis');
  const track = [analysis, ...[...s.matchAll(/<prediction>([\s\S]*?)<\/prediction>/g)].map(m => m[1])].filter(Boolean).map(b => point(b)).filter(p => p?.t);
  // The land it covers: the warning's county areas, and its words (陸上：宜蘭、花蓮、恆春半島…).
  const areas = section(s, '警戒區域及事項');
  const land = tai(/陸上[:：]([^。]*)/.exec(areas)?.[1] || '');
  const named = [...s.matchAll(/<areaDesc>([^<]+)<\/areaDesc>/g)].map(m => tai(m[1]));
  return {
    name: tag(s, 'cwa_typhoon_name') || null,
    nameEn: tag(s, 'typhoon_name') || null,
    warning: head,
    land: COUNTIES.filter(c => named.includes(c) || land.includes(c) || new RegExp(`${c.slice(0, 2)}(?![市縣])`).test(land)),
    lamps: parseLamps(section(s, '強風特報')),
    track,
    at: Date.parse(tag(s, 'sent') || '') || now,
    expires: Date.parse(tag(s, 'expires') || '') || null
  };
}

// The 人事行政總處 page: { at, counties: { 臺北市: '明天停止上班、停止上課。' } }
// (no county named: nothing announced). The page's table read as text, a
// county's words running to the next county.
export function parseDgpa(html) {
  const text = unent(
    String(html || '')
      .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, '')
      .replace(/<br\s*\/?>|<\/(td|th|tr|p|div|li|h\d)>/gi, '\n')
      .replace(/<[^>]+>/g, '')
  );
  const at = /更新時間[:：]\s*(\d{4})\/(\d{1,2})\/(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(text);
  const when = at ? Date.UTC(+at[1], +at[2] - 1, +at[3], +at[4], +at[5], +(at[6] || 0)) - TW : null;
  const from = text.indexOf('縣市名稱');
  // (The page's numbered notes after the table, 1.若欲進入… 5.民間事業單位…, are not a county's words.)
  const body = (from >= 0 ? text.slice(from) : text).split(/資料來源|更新時間|(?:^|\s)1\.\s*若欲|語音查詢/)[0];
  const counties = {};
  const re = new RegExp(`(${COUNTIES.join('|')}|${COUNTIES.map(c => c.replace('臺', '台')).join('|')})`, 'g');
  const hits = [...body.matchAll(re)];
  hits.forEach((m, i) => {
    const county = tai(m[1]);
    const words = body.slice(m.index + m[1].length, hits[i + 1]?.index ?? body.length).replace(/\s+/g, ' ').replace(/^[\s:：|]+/, '').trim();
    // (A county named inside another's words, e.g. 新竹縣 in 新竹市's, runs on: kept with the first.)
    if (words && !counties[county]) counties[county] = words.slice(0, 240);
  });
  return { at: when, counties };
}

// What one of the page's sentences says: 'all' | 'class' | 'work' (closed),
// 'open' (照常, 未達…標準, 尚未列入警戒區), or 'wait' (尚未宣布消息). The page
// words it several ways: 停止上班、停止上課; 已達停止上班及上課標準; 未達停止
// 上班、已達停止上課標準; 照常上班、停止上課; 12:00起停止上班….
export function offOf(x) {
  const s = String(x || '');
  if (/尚未宣布/.test(s)) return 'wait';
  const none = /未達停止上班及上課標準/.test(s);
  const work = !none && (/已達停止上班/.test(s) || (/停止(上班|辦公)/.test(s) && !/未達停止上班/.test(s)));
  const school = !none && (/已達停止(上班及)?上課/.test(s) || (/停止上課/.test(s) && !/未達停止上課|未達停止上班及上課/.test(s)));
  return work && school ? 'all' : school ? 'class' : work ? 'work' : 'open';
}

// The official words, a sentence each: [{ text, off }] (offOf's).
export function officialLines(text) {
  return String(text || '')
    .split(/[。\n]/)
    .map(x => x.trim())
    .filter(x => /上班|上課|辦公|宣布|警戒區/.test(x) && !/^\d+\./.test(x))
    .map(x => ({ text: x, off: offOf(x) }));
}

// Beaufort from km/h (CWA's scale).
const BFT = [1, 6, 12, 20, 29, 39, 50, 62, 75, 89, 103, 118];
export const beaufortKmh = v => (v == null ? null : BFT.findIndex(x => v < x) === -1 ? 12 : BFT.findIndex(x => v < x));

const km = (a, b) => {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
};
// The storm at an hour: between the track's points, and on past the last
// one at its last pace for up to a day (its circle and strength held).
export function stormAt(track, t) {
  const pts = (track || []).filter(p => p.t != null).sort((a, b) => a.t - b.t);
  if (!pts.length || t < pts[0].t) return null;
  let i = pts.findIndex(p => p.t >= t);
  if (i === -1) {
    const [a, b] = pts.length > 1 ? pts.slice(-2) : [pts[0], pts[0]];
    if (t - b.t > 24 * HOUR) return null;
    const k = b.t > a.t ? (t - b.t) / (b.t - a.t) : 0;
    return { lat: b.lat + (b.lat - a.lat) * k, lon: b.lon + (b.lon - a.lon) * k, r7: b.r7, v: b.v };
  }
  if (i === 0) return pts[0];
  const [a, b] = [pts[i - 1], pts[i]];
  const k = (t - a.t) / (b.t - a.t);
  const mix = (x, y) => (x == null ? y : y == null ? x : x + (y - x) * k);
  return { lat: mix(a.lat, b.lat), lon: mix(a.lon, b.lon), r7: mix(a.r7, b.r7), v: mix(a.v, b.v) };
}

// The storm circle's (7級) nearest edge to a place over the hours from..to,
// in km (below 0: inside it), and the storm's strength then (m/s).
export function circleEdge(track, at, from, to) {
  let best = null;
  for (let t = from; t <= to; t += HOUR) {
    const p = stormAt(track, t);
    if (!p) continue;
    const edge = km(p, at) - (p.r7 ?? 0);
    if (!best || edge < best.edge) best = { edge, v: p.v };
  }
  return best;
}
export const circleReaches = (track, at, from, to) => (circleEdge(track, at, from, to)?.edge ?? Infinity) <= 0;

// Taiwan's main island, for how near the storm comes to it at all (its
// county seats).
const MAIN = [[25.131, 121.744], [25.0375, 121.5637], [25.0123, 121.4654], [24.9937, 121.301], [24.8066, 120.9686], [24.827, 121.0128], [24.565, 120.8205], [24.1618, 120.6469], [24.0758, 120.544], [23.9025, 120.6906], [23.699, 120.5263], [23.4801, 120.4491], [23.4588, 120.2925], [22.9917, 120.1849], [22.623, 120.3014], [22.6829, 120.488], [24.7303, 121.7631], [23.9913, 121.6197], [22.7559, 121.1504]].map(([lat, lon]) => ({ lat, lon }));

// The day asked about: today until 10:00 (announced by then), else tomorrow.
export const targetDay = now => (new Date(now + TW).getUTCHours() < 10 ? twDate(now) : twDate(now + 24 * HOUR));

// The chance a county closes on the day, fitted to what counties decided
// for 68 storms, 2019-08 to 2026-09 (4,671 county-days of storms near
// Taiwan; 人事行政總處's archive): a logistic curve on the storm circle's
// nearest edge to the place and to the main island, the storm's strength,
// the day's peak gust and its rain (CWA's stations then; the forecast now).
// Checked on storms it wasn't fitted on: what it calls 20% closed about one
// time in five. 1–99, never rounded to steps.
// One fit per set of inputs the forecast has (a cell without Google's
// hours has no gust or rain for the day: those fits leave them out rather
// than read them as calm and dry), each with and without the neighbours'
// share. The `Near` fits: the share of neighbours (county seats within
// 75 km) that closed, from the archive's final pages, mixed in by how many
// of them have announced so far.
const FITS = {
  full: {k: -7.6913, edge: 0.0644, inside: 0.374, v: 1.0683, gust: 4.412, rain: 2.5424, island: -0.6472},
  fullNear: {k: -6.9982, edge: 0.0059, inside: 0.1157, v: 0.5935, gust: 2.1137, rain: 1.5224, island: -0.4118, near: 6.1854},
  noRain: {k: -6.6805, edge: -0.022, inside: 0.4879, v: 0.5436, gust: 5.0268, island: -0.5634},
  noRainNear: {k: -6.6199, edge: 0.0894, inside: 0.2989, v: 0.3332, gust: 2.3624, island: -0.445, near: 6.3334},
  noGust: {k: -6.4202, edge: 0.2465, inside: 0.6651, v: 0.9876, rain: 3.1661, island: -0.8723},
  noGustNear: {k: -6.3507, edge: 0.0554, inside: 0.1713, v: 0.5652, rain: 1.6936, island: -0.5211, near: 6.3503},
  track: {k: -4.6298, edge: 0.0994, inside: 0.7927, v: 0.1861, island: -0.7393},
  trackNear: {k: -5.7964, edge: 0.1297, inside: 0.3822, v: 0.2421, island: -0.5388, near: 6.5595}
};
export const NEIGHBOURS = {"基隆市": ["臺北市", "新北市", "桃園市", "宜蘭縣"], "臺北市": ["基隆市", "新北市", "桃園市", "新竹市", "新竹縣", "宜蘭縣"], "新北市": ["基隆市", "臺北市", "桃園市", "新竹市", "新竹縣", "宜蘭縣"], "桃園市": ["基隆市", "臺北市", "新北市", "新竹市", "新竹縣", "苗栗縣", "宜蘭縣"], "新竹市": ["臺北市", "新北市", "桃園市", "新竹縣", "苗栗縣"], "新竹縣": ["臺北市", "新北市", "桃園市", "新竹市", "苗栗縣"], "苗栗縣": ["桃園市", "新竹市", "新竹縣", "臺中市", "彰化縣", "南投縣"], "臺中市": ["苗栗縣", "彰化縣", "南投縣", "雲林縣"], "彰化縣": ["苗栗縣", "臺中市", "南投縣", "雲林縣", "嘉義市", "嘉義縣"], "南投縣": ["苗栗縣", "臺中市", "彰化縣", "雲林縣", "嘉義市", "嘉義縣"], "雲林縣": ["臺中市", "彰化縣", "南投縣", "嘉義市", "嘉義縣"], "嘉義市": ["彰化縣", "南投縣", "雲林縣", "嘉義縣", "臺南市"], "嘉義縣": ["彰化縣", "南投縣", "雲林縣", "嘉義市", "臺南市", "澎湖縣"], "臺南市": ["嘉義市", "嘉義縣", "高雄市", "屏東縣"], "高雄市": ["臺南市", "屏東縣"], "屏東縣": ["臺南市", "高雄市", "臺東縣"], "宜蘭縣": ["基隆市", "臺北市", "新北市", "桃園市"], "花蓮縣": [], "臺東縣": ["屏東縣"], "澎湖縣": ["嘉義縣"], "金門縣": [], "連江縣": []};
const clip = (x, lo, hi) => Math.min(hi, Math.max(lo, x));
const logit = (f, { edge, islandEdge, vmax, gust, mm }) =>
  f.k +
  f.edge * (clip(edge ?? 600, -300, 600) / 100) +
  f.inside * (clip(-(edge ?? 600), 0, 300) / 100) +
  f.v * (((vmax ?? 0) * 1.9438) / 100) +
  (f.gust ?? 0) * ((gust ?? 0) / 30) +
  (f.rain ?? 0) * (Math.log1p(Math.max(0, mm ?? 0)) / Math.log1p(350)) +
  f.island * (clip(islandEdge ?? 600, -300, 600) / 100);
// `near`: { closed, open, of } — the neighbours that announced each way, of
// how many. A gust or rain of null: not in the forecast (not 0).
export function dayOffChance(x, near = null) {
  const set = x.gust != null && x.mm != null ? 'full' : x.gust != null ? 'noRain' : x.mm != null ? 'noGust' : 'track';
  let z = logit(FITS[set], x);
  const told = near ? near.closed + near.open : 0;
  if (told) {
    const w = told / near.of;
    const f = FITS[`${set}Near`];
    z = (1 - w) * z + w * (logit(f, x) + f.near * (near.closed / told));
  }
  return Math.min(99, Math.max(1, Math.round(100 / (1 + Math.exp(-z)))));
}

// A Beaufort level's lowest gust (m/s), for the 強風 lamps' 陣風 N 級.
const BFT_MS = [0, 0.3, 1.6, 3.4, 5.5, 8, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7];

// A county's lines on the page, each with its day (今天 or 明天 from the
// page's own time) and whether it covers only some towns.
function linesOf(dgpa, county) {
  const said = dgpa?.counties?.[county];
  if (!said || /無停班停課/.test(said)) return [];
  const day = twDate(dgpa.at || Date.now());
  const next = twDate(Date.parse(`${day}T12:00:00+08:00`) + 24 * HOUR);
  return officialLines(said).map(l => ({ ...l, date: /明天|明日/.test(l.text) ? next : day, scoped: /^[^\d\s][^:：]{0,40}[:：]/.test(l.text) }));
}

// The answer's `dayOff` for a place (the forecast's hours, its county; `at` its position).
export function dayOffFor(resp, ty, dgpa, now, at = null) {
  if (!ty || !resp) return null;
  const county = tai(resp.place?.county || '');
  if (!COUNTIES.includes(county)) return null;
  const date = targetDay(now);
  const storm = { name: ty.name, nameEn: ty.nameEn, warning: ty.warning, date };
  // The county's own decision for the day (a line for the whole county, not
  // 尚未宣布) replaces the chance; its other lines (some towns only, 綠島鄉:…;
  // another day) go under it.
  const lines = linesOf(dgpa, county);
  if (lines.some(l => !l.scoped && l.date === date && l.off !== 'wait')) return { ...storm, official: { lines: lines.map(({ text, off }) => ({ text, off })), at: dgpa.at } };
  const local = lines.filter(l => l.off !== 'wait').map(({ text, off }) => ({ text, off }));
  const towns = local.length ? { local: { lines: local, at: dgpa.at } } : {};
  // Neighbours that have decided the day, each way.
  const nearby = NEIGHBOURS[county] || [];
  const near = { closed: 0, open: 0, of: nearby.length };
  for (const c of nearby) {
    const l = linesOf(dgpa, c).find(x => !x.scoped && x.date === date && x.off !== 'wait');
    if (l) near[l.off === 'open' ? 'open' : 'closed']++;
  }
  const start = Date.parse(`${date}T00:00:00+08:00`);
  const to = start + 24 * HOUR;
  // The day's hours (today's: those still ahead).
  const hours = (resp.hours || []).filter(h => h.t >= Math.max(now, start) - HOUR && h.t < to);
  if (!hours.length) return null;
  const peak = k => {
    const v = hours.map(h => h.wind?.[k]).filter(x => x != null);
    return v.length ? Math.max(...v) : null;
  };
  // (Rain: null when the forecast has no amounts for the day.)
  const mm = hours.some(h => h.mm != null) ? Math.round(hours.reduce((a, h) => a + (h.mm || 0), 0)) : null;
  const dom = twDom(start);
  const lamp = (ty.lamps?.[county] || []).filter(x => x.dom === dom || (x.dom == null && date === twDate(ty.at))).sort((a, b) => b.gust - a.gust)[0];
  // The day's peak gust (m/s): the forecast's, or the lamp's lowest when CWA says more.
  // (null when neither has one.)
  const gust = peak('gust') == null && !lamp ? null : Math.max((peak('gust') ?? 0) / 3.6, lamp ? BFT_MS[Math.min(12, lamp.gust)] : 0);
  const here = at ? circleEdge(ty.track, at, start, to) : null;
  const island = MAIN.reduce((best, p) => {
    const c = circleEdge(ty.track, p, start, to);
    return c && (!best || c.edge < best.edge) ? c : best;
  }, null);
  const why = {
    wind: beaufortKmh(peak('speed')),
    gust: Math.max(beaufortKmh(peak('gust')) ?? 0, lamp?.gust ?? 0) || null,
    mm,
    land: ty.land.includes(county),
    reach: (here?.edge ?? Infinity) <= 0,
    ...(near.closed ? { nearClosed: near.closed } : {})
  };
  const chance = dayOffChance({ edge: here?.edge, islandEdge: island?.edge, vmax: here?.v ?? island?.v, gust, mm }, near);
  return { ...storm, chance, why, ...towns };
}

// ---- Reads (kept shared in KV by the caller's `shared`) ------------------------------

async function text(fetchFn, url, timeout = 5000) {
  const res = await fetchFn(url, { headers: { Accept: 'text/html,application/xml;q=0.9,*/*;q=0.8', 'User-Agent': 'Mozilla/5.0 OrbitWeather' }, signal: AbortSignal.timeout(timeout) });
  if (!res.ok) throw new Error(`${res.status}`);
  const buf = await res.arrayBuffer();
  const head = new TextDecoder('latin1').decode(buf.slice(0, 2048));
  const cs = /charset=["']?([\w-]+)/i.exec(res.headers?.get?.('content-type') || '')?.[1] || /charset=["']?([\w-]+)/i.exec(head)?.[1] || 'utf-8';
  return new TextDecoder(/big5/i.test(cs) ? 'big5' : 'utf-8').decode(buf);
}

// CWA's track forecast (W-C0034-005) for a storm: its last fix, then each
// forecast hour out to 5 days (the warning's CAP has only a day ahead).
export function parseTrack(j, ty) {
  const all = j?.records?.TropicalCyclones?.TropicalCyclone || [];
  const tc = all.find(c => (ty.name && c.CwaTyphoonName === ty.name) || (ty.nameEn && String(c.TyphoonName).toUpperCase() === String(ty.nameEn).toUpperCase()));
  if (!tc) return null;
  const pt = (f, t) => {
    const lat = Number(f.CoordinateLatitude);
    const lon = Number(f.CoordinateLongitude);
    const r = Number(f.Circle15ms?.Radius);
    const v = Number(f.MaxWindSpeed);
    return Number.isFinite(lat) && Number.isFinite(lon) && t ? { t, lat, lon, r7: Number.isFinite(r) ? r : 0, v: Number.isFinite(v) ? v : null } : null;
  };
  const last = (tc.AnalysisData?.Fix || []).at(-1);
  const fc = (tc.ForecastData?.Fix || []).map(f => pt(f, Date.parse(f.InitialTime) + Number(f.ForecastHour) * HOUR));
  const track = [last && pt(last, Date.parse(last.DateTime)), ...fc].filter(Boolean);
  return track.length > 1 ? track : null;
}

// The typhoon in force now, or null; `trackUrl`: CWA's track forecast,
// which replaces the warning's day-ahead track when it reads.
export async function readTyphoon(fetchFn, now = Date.now(), trackUrl = null) {
  const hit = feedTyphoon(await text(fetchFn, NCDR_FEED));
  if (!hit) return null;
  const u = new URL(hit.href);
  if (u.protocol !== 'https:' || u.hostname !== NCDR_HOST) return null;
  const ty = parseTyphoonCap(await text(fetchFn, u.href), now);
  // (A warning not renewed for 6 hours past its end is over.)
  if (!ty || (ty.expires && ty.expires + 6 * HOUR <= now)) return null;
  if (trackUrl) {
    const track = await text(fetchFn, trackUrl)
      .then(t => parseTrack(JSON.parse(t), ty))
      .catch(() => null);
    if (track) ty.track = track;
  }
  return ty;
}

// 人事行政總處's page, from Taiwan (the relay) when it's bound.
export async function readDgpa(env, fetchFn) {
  const via = env?.GEMINI_RELAY ? (u, init) => env.GEMINI_RELAY.fetch(`https://gemini-relay/?to=${encodeURIComponent(u)}`, init) : fetchFn;
  return parseDgpa(await text(via, DGPA_NDS));
}
