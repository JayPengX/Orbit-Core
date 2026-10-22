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
  for (const part of String(text || '').split(/[，。；]/)) {
    const named = [...part.matchAll(/[今明後]\((\d{1,2})\)日/g)].map(m => Number(m[1]));
    if (named.length) days = named;
    const m = /平均風\s*(\d+)\s*級以上或陣風\s*(\d+)\s*級以上/.exec(part);
    if (!m) continue;
    for (const c of COUNTIES) if (tai(part).includes(c)) for (const dom of days.length ? days : [null]) (out[c] ||= []).push({ dom, wind: Number(m[1]), gust: Number(m[2]) });
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
    return p ? { t: Date.parse(tag(block, 'time') || at) || null, ...p, r7: Number.isFinite(r) ? r : null } : null;
  };
  const analysis = tag(s, 'analysis');
  const track = [analysis, ...[...s.matchAll(/<prediction>([\s\S]*?)<\/prediction>/g)].map(m => m[1])].filter(Boolean).map(b => point(b)).filter(p => p?.t);
  const areas = section(s, '警戒區域及事項');
  const land = /陸上[:：]([^。]*)/.exec(areas)?.[1] || '';
  return {
    name: tag(s, 'cwa_typhoon_name') || null,
    nameEn: tag(s, 'typhoon_name') || null,
    warning: head,
    land: COUNTIES.filter(c => tai(land).includes(c)),
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
  const body = from >= 0 ? text.slice(from).split(/資料來源|更新時間/)[0] : text;
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

// The official words, a sentence each: [{ text, off: 'all'|'class'|'work'|null }].
export function officialLines(text) {
  return String(text || '')
    .split(/[。\n]/)
    .map(x => x.trim())
    .filter(Boolean)
    .map(x => ({ text: x, off: /停止上班/.test(x) && /停止上課/.test(x) ? 'all' : /停止上課/.test(x) ? 'class' : /停止上班/.test(x) ? 'work' : null }));
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
// The storm circle (7級) over the place at some hour between from and to,
// along the track (hourly between its points; nothing past its last).
export function circleReaches(track, at, from, to) {
  const pts = (track || []).filter(p => p.t != null && p.r7 != null).sort((a, b) => a.t - b.t);
  for (let i = 0; i < pts.length - 1; i++) {
    const [a, b] = [pts[i], pts[i + 1]];
    for (let t = Math.max(a.t, from); t <= Math.min(b.t, to); t += HOUR) {
      const k = (t - a.t) / (b.t - a.t);
      const p = { lat: a.lat + (b.lat - a.lat) * k, lon: a.lon + (b.lon - a.lon) * k };
      if (km(p, at) <= a.r7 + (b.r7 - a.r7) * k) return true;
    }
  }
  return false;
}

// The day asked about: today until 10:00 (announced by then), else tomorrow.
export const targetDay = now => (new Date(now + TW).getUTCHours() < 10 ? twDate(now) : twDate(now + 24 * HOUR));

// The chance, 5–95 in steps of 5: how near the place's worst hour comes to
// the rule's bar (the higher of wind/7級, gusts/10級, the lamps, rain/350 mm),
// on a curve that is even at 90% of the bar; well under it (≤25) unless the
// storm circle is forecast over the place or the warning covers the county.
export function dayOffChance({ wind, gust, lampWind, lampGust, mm, land, reach }) {
  const windScore = Math.max((wind ?? 0) / 7, (gust ?? 0) / 10, lampWind ? 0.9 * Math.max(lampWind / 7, lampGust / 10) : 0);
  const r = Math.max(windScore, (mm ?? 0) / 350);
  const l = 1 / (1 + Math.exp(-8 * (r - 0.9)));
  const p = land || reach ? 15 + 80 * l : Math.min(25, 50 * l);
  return Math.min(95, Math.max(5, Math.round(p / 5) * 5));
}

// The answer's `dayOff` for a place (the forecast's hours, its county; `at` its position).
export function dayOffFor(resp, ty, dgpa, now, at = null) {
  if (!ty || !resp) return null;
  const county = tai(resp.place?.county || '');
  if (!COUNTIES.includes(county)) return null;
  const date = targetDay(now);
  const storm = { name: ty.name, nameEn: ty.nameEn, warning: ty.warning, date };
  const said = dgpa?.counties?.[county];
  if (said && !/無停班停課/.test(said)) return { ...storm, official: { lines: officialLines(said), at: dgpa.at } };
  const start = Date.parse(`${date}T00:00:00+08:00`);
  const from = Math.max(now, start);
  const to = start + 24 * HOUR;
  const hours = (resp.hours || []).filter(h => h.t >= from - HOUR && h.t < to);
  if (!hours.length) return null;
  const top = k => {
    const v = hours.map(h => h.wind?.[k]).filter(x => x != null);
    return v.length ? beaufortKmh(Math.max(...v)) : null;
  };
  // Rain: the 24 hours from the day's start (or now).
  const mm = Math.round((resp.hours || []).filter(h => h.t >= from - HOUR && h.t < from + 23 * HOUR).reduce((a, h) => a + (h.mm || 0), 0));
  const dom = twDom(start);
  const lamp = (ty.lamps?.[county] || []).filter(x => x.dom === dom || (x.dom == null && date === twDate(ty.at))).sort((a, b) => b.gust - a.gust)[0];
  const why = {
    wind: top('speed'),
    gust: top('gust'),
    mm,
    land: ty.land.includes(county),
    reach: at ? circleReaches(ty.track, at, from, to) : false,
    ...(lamp ? { lampWind: lamp.wind, lampGust: lamp.gust } : {})
  };
  return { ...storm, chance: dayOffChance(why), why };
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

// The typhoon in force now, or null.
export async function readTyphoon(fetchFn, now = Date.now()) {
  const hit = feedTyphoon(await text(fetchFn, NCDR_FEED));
  if (!hit) return null;
  const u = new URL(hit.href);
  if (u.protocol !== 'https:' || u.hostname !== NCDR_HOST) return null;
  const ty = parseTyphoonCap(await text(fetchFn, u.href), now);
  // (A warning not renewed for 6 hours past its end is over.)
  return ty && (!ty.expires || ty.expires + 6 * HOUR > now) ? ty : null;
}

// 人事行政總處's page, from Taiwan (the relay) when it's bound.
export async function readDgpa(env, fetchFn) {
  const via = env?.GEMINI_RELAY ? (u, init) => env.GEMINI_RELAY.fetch(`https://gemini-relay/?to=${encodeURIComponent(u)}`, init) : fetchFn;
  return parseDgpa(await text(via, DGPA_NDS));
}
