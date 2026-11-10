// Rain in the next two hours at one place, from the radar (the proxy's
// `radar`: weather-radar.js `radarAt`), read one way by Orbit Weather's page
// and by its rain notice (weather.js weatherCheck).
//
// `radar`: { at, step, rate } — the rain rate at the place (mm an hour) every
// `step` minutes from `at`, null past what the radars can say.
// `rainNow(radar, now)` → null (no fresh radar), { kind: 'dry', until } (no
// rain coming within what it sees), or { kind: 'now' | 'start', from, to,
// peak, until, bars } (raining now, or from `from`; `to` null: still raining
// at `until`; `bars`: the rate every step from now, for a strip).

// A frame this old (its data time) is no longer read (weather-radar.js RADAR_OLD_MS).
export const RADAR_FRESH_MS = 40 * 60_000;
// Rain worth saying: mm an hour (weather-radar.js: under ~0.5 an echo is dry).
export const WET_RATE = 0.5;

// How hard it rains, in everyday words, with what it means for going out
// (Jay 2026-11-10: "3 毫米" told him nothing). By mm an hour: under 1 a
// drizzle, under 4 light rain, under 10 rain, under 40 heavy, then a downpour
// (CWA's 大雨 is 40 mm in an hour).
export const RAIN_WORDS = [
  { upTo: 1, level: 1, zh: '毛毛雨', en: 'Drizzle', short: 'Drizzle', tipZh: '帽子就擋得住', tipEn: 'a hood will do' },
  { upTo: 4, level: 2, zh: '小雨', en: 'Light rain', short: 'Light', tipZh: '記得帶傘', tipEn: 'take an umbrella' },
  { upTo: 10, level: 3, zh: '中雨', en: 'Rain', short: 'Rain', tipZh: '撐傘鞋子也會濕', tipEn: 'expect wet shoes' },
  { upTo: 40, level: 4, zh: '大雨', en: 'Heavy rain', short: 'Heavy', tipZh: '晚點再出門', tipEn: 'wait it out if you can' },
  { upTo: Infinity, level: 5, zh: '豪大雨', en: 'Downpour', short: 'Downpour', tipZh: '留在室內', tipEn: 'stay inside' }
];
export const rainWord = mmh => RAIN_WORDS.find(w => mmh < w.upTo) || RAIN_WORDS[RAIN_WORDS.length - 1];

export function rainNow(radar, now = Date.now()) {
  if (!radar?.rate?.length || !(now - radar.at < RADAR_FRESH_MS)) return null;
  const step = (radar.step || 5) * 60_000;
  // From the step now falls in, up to the first the radars can't say.
  const bars = [];
  let until = null;
  for (let i = 0; i < radar.rate.length; i++) {
    const t = radar.at + i * step;
    if (t + step <= now) continue;
    if (radar.rate[i] == null) break;
    bars.push({ t: Math.max(t, now), v: radar.rate[i] });
    until = t + step;
  }
  if (!bars.length) return null;
  const first = bars.findIndex(b => b.v >= WET_RATE);
  if (first < 0) return { kind: 'dry', until, bars };
  // The shower: from its first wet step on, a single dry step inside it kept.
  let last = first;
  while (last + 1 < bars.length && (bars[last + 1].v >= WET_RATE || (last + 2 < bars.length && bars[last + 2].v >= WET_RATE))) last++;
  const peak = Math.max(...bars.slice(first, last + 1).map(b => b.v));
  const to = last === bars.length - 1 ? null : bars[last + 1].t;
  return { kind: first === 0 ? 'now' : 'start', from: bars[first].t, to, peak, until, bars };
}
