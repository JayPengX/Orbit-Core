// Taiwan's national days off (行政院人事行政總處's calendar): the holidays
// (on a weekend too, so a Saturday can be named) and the days given in
// their place (補假), for every app that plans a
// school or work day: Orbit Class (no classes, no class notices), Weather
// (no 到學校 advice), Transit (no commute picked for you). Weekends are off
// anyway and aren't listed. Orbit Securities derives the exchange's calendar
// from this one (stock-holidays.mjs: TWSE also closes the two days before
// Lunar New Year, which aren't days off for anyone else).
//
// The years 人事行政總處 has published are listed (its 政府行政機關辦公日曆表,
// data.gov.tw dataset 14718); a year past them is worked out by the rules of
// 紀念日及節日實施條例 (2025) as those years apply them, on the lunar dates of
// 香港天文台's 公曆與農曆日期對照表 (UTC+8, Taiwan's calendar too), so the
// apps keep the right days off with nobody adding a year (both listed years
// come out the same by the rules: tests/kit-calendar.test.mjs).
//
//   twHoliday(t)    the holiday's name ({ zh, en }) on Taiwan's day of t (a Date, ms or 'YYYY-MM-DD'), else null
//   twDayOff(t)     a weekend or a holiday
//   twWorkday(t)    the opposite (a 補班 Saturday too)
//   lunarNewYearOff(y)  the first day of that year's Lunar New Year days off ('YYYY-MM-DD'), or null

import { twDay } from './format.mjs';

const HOLIDAYS = {
  2026: {
    '01-01': ['元旦', "New Year's Day"],
    '02-15': ['小年夜', 'The eve of the eve'],
    '02-16': ['除夕', "Lunar New Year's Eve"],
    '02-17': ['春節', 'Lunar New Year'],
    '02-18': ['春節', 'Lunar New Year'],
    '02-19': ['春節', 'Lunar New Year'],
    '02-20': ['春節補假', 'Lunar New Year (in lieu)'],
    '02-27': ['和平紀念日補假', 'Peace Memorial Day (in lieu)'],
    '02-28': ['和平紀念日', 'Peace Memorial Day'],
    '04-03': ['兒童節補假', "Children's Day (in lieu)"],
    '04-04': ['兒童節', "Children's Day"],
    '04-05': ['清明節', 'Tomb Sweeping Day'],
    '04-06': ['清明節補假', 'Tomb Sweeping Day (in lieu)'],
    '05-01': ['勞動節', 'Labour Day'],
    '06-19': ['端午節', 'Dragon Boat Festival'],
    '09-25': ['中秋節', 'Mid-Autumn Festival'],
    '09-28': ['教師節', "Teachers' Day"],
    '10-09': ['國慶日補假', 'National Day (in lieu)'],
    '10-10': ['國慶日', 'National Day'],
    '10-25': ['光復節', 'Retrocession Day'],
    '10-26': ['光復節補假', 'Retrocession Day (in lieu)'],
    '12-25': ['行憲紀念日', 'Constitution Day']
  },
  2027: {
    '01-01': ['元旦', "New Year's Day"],
    '02-04': ['小年夜', 'The eve of the eve'],
    '02-05': ['除夕', "Lunar New Year's Eve"],
    '02-06': ['春節', 'Lunar New Year'],
    '02-07': ['春節', 'Lunar New Year'],
    '02-08': ['春節', 'Lunar New Year'],
    '02-09': ['春節補假', 'Lunar New Year (in lieu)'],
    '02-10': ['春節補假', 'Lunar New Year (in lieu)'],
    '02-28': ['和平紀念日', 'Peace Memorial Day'],
    '03-01': ['和平紀念日補假', 'Peace Memorial Day (in lieu)'],
    '04-04': ['兒童節', "Children's Day"],
    '04-05': ['清明節', 'Tomb Sweeping Day'],
    '04-06': ['兒童節補假', "Children's Day (in lieu)"],
    '04-30': ['勞動節補假', 'Labour Day (in lieu)'],
    '05-01': ['勞動節', 'Labour Day'],
    '06-09': ['端午節', 'Dragon Boat Festival'],
    '09-15': ['中秋節', 'Mid-Autumn Festival'],
    '09-28': ['教師節', "Teachers' Day"],
    '10-10': ['國慶日', 'National Day'],
    '10-11': ['國慶日補假', 'National Day (in lieu)'],
    '10-25': ['光復節', 'Retrocession Day'],
    '12-24': ['行憲紀念日補假', 'Constitution Day (in lieu)'],
    '12-25': ['行憲紀念日', 'Constitution Day'],
    // (2028's New Year's Day is a Saturday: given on 2027's last day.)
    '12-31': ['元旦補假', "New Year's Day (in lieu)"]
  }
};
// Saturdays worked in place of a day off (補班): none announced for these years.
const WORKDAYS = { 2026: [], 2027: [] };

// ---- A year past the list, by the rules ----
// Each year's first day of the lunar year (正月初一), 清明 (the solar term),
// 端午 (五月初五) and 中秋 (八月十五), 'MM-DD', from 香港天文台's tables
// (hko.gov.hk/tc/gts/time/conversion.htm; 2026 and 2027 there match the
// published calendars). A year past these has its fixed-date holidays only.
const LUNAR = {
  2028: ['01-26', '04-04', '05-28', '10-03'],
  2029: ['02-13', '04-04', '06-16', '09-22'],
  2030: ['02-03', '04-05', '06-05', '09-12'],
  2031: ['01-23', '04-05', '06-24', '10-01'],
  2032: ['02-11', '04-04', '06-12', '09-19'],
  2033: ['01-31', '04-04', '06-01', '09-08'],
  2034: ['02-19', '04-05', '06-20', '09-27'],
  2035: ['02-08', '04-05', '06-10', '09-16'],
  2036: ['01-28', '04-04', '05-30', '10-04']
};
const FIXED = [
  ['01-01', '元旦', "New Year's Day"],
  ['02-28', '和平紀念日', 'Peace Memorial Day'],
  ['04-04', '兒童節', "Children's Day"],
  ['05-01', '勞動節', 'Labour Day'],
  ['09-28', '教師節', "Teachers' Day"],
  ['10-10', '國慶日', 'National Day'],
  ['10-25', '光復節', 'Retrocession Day'],
  ['12-25', '行憲紀念日', 'Constitution Day']
];
const DAY = 86_400_000;
const dayAt = ms => new Date(ms).toISOString().slice(0, 10);
const msOf = day => Date.parse(`${day}T00:00:00Z`);
const dowOf = day => new Date(msOf(day)).getUTCDay();
const isWeekend = day => [0, 6].includes(dowOf(day));

// One year's days off by 紀念日及節日實施條例 as 人事行政總處 applies it (its
// 2026 and 2027 calendars): a holiday on a Saturday is given on the workday
// before it, on a Sunday the workday after; 兒童節 on 清明's day moves to the
// day before; the Lunar New Year's five days (小年夜 to 初三) give one
// workday after them for each that falls on a weekend; next year's New
// Year's Day on a Saturday is given on this year's last day.
// → { 'MM-DD': [zh, en] }, every holiday (on a weekend too) and day in lieu.
export function rulesYear(y, lunar = LUNAR[y]) {
  const off = new Map();
  const put = (day, zh, en) => off.has(day) || off.set(day, [zh, en]);
  const own = [];
  const [lny, qingming, duanwu, midAutumn] = (lunar || []).map(md => `${y}-${md}`);
  if (lny) {
    const first = msOf(lny) - 2 * DAY;
    const names = [['小年夜', 'The eve of the eve'], ['除夕', "Lunar New Year's Eve"], ['春節', 'Lunar New Year'], ['春節', 'Lunar New Year'], ['春節', 'Lunar New Year']];
    names.forEach(([zh, en], i) => put(dayAt(first + i * DAY), zh, en));
  }
  for (const [md, zh, en] of FIXED) {
    // (兒童節 on 清明's day: the day before, named as given in its place.)
    const moved = md === '04-04' && qingming === `${y}-04-04`;
    const day = moved ? `${y}-04-03` : `${y}-${md}`;
    put(day, moved ? `${zh}補假` : zh, moved ? `${en} (in lieu)` : en);
    own.push([day, zh, en]);
  }
  for (const [day, zh, en] of [[qingming, '清明節', 'Tomb Sweeping Day'], [duanwu, '端午節', 'Dragon Boat Festival'], [midAutumn, '中秋節', 'Mid-Autumn Festival']]) if (day) (put(day, zh, en), own.push([day, zh, en]));
  const free = day => !isWeekend(day) && !off.has(day);
  const lieu = (from, step, zh, en) => {
    let t = msOf(from) + step * DAY;
    while (!free(dayAt(t))) t += step * DAY;
    put(dayAt(t), `${zh}補假`, `${en} (in lieu)`);
  };
  // The Lunar New Year's: after its five days, a workday for each on a weekend.
  if (lny) {
    const block = [-2, -1, 0, 1, 2].map(k => dayAt(msOf(lny) + k * DAY));
    let t = msOf(block[4]);
    for (let n = block.filter(isWeekend).length; n > 0; n--) {
      do t += DAY;
      while (!free(dayAt(t)));
      put(dayAt(t), '春節補假', 'Lunar New Year (in lieu)');
    }
  }
  // The rest, in the year's order: Saturday's the workday before, Sunday's the workday after.
  for (const [day, zh, en] of own.sort((a, b) => a[0].localeCompare(b[0]))) {
    const dow = dowOf(day);
    if (dow === 6 && !(day.endsWith('-01-01'))) lieu(day, -1, zh, en);
    if (dow === 0) lieu(day, 1, zh, en);
  }
  if (dowOf(`${y + 1}-01-01`) === 6) put(`${y}-12-31`, '元旦補假', "New Year's Day (in lieu)");
  const out = {};
  for (const [day, name] of [...off].sort((a, b) => a[0].localeCompare(b[0]))) if (day.startsWith(`${y}-`)) out[day.slice(5)] = name;
  return out;
}
const ruled = new Map();
const yearOf = y => HOLIDAYS[y] || (ruled.has(y) ? ruled.get(y) : ruled.set(y, rulesYear(Number(y))).get(y));

export function twHoliday(t) {
  const day = twDay(t);
  if (!day) return null;
  const hit = yearOf(day.slice(0, 4))[day.slice(5)];
  return hit ? { zh: hit[0], en: hit[1], day } : null;
}
// The first of a year's Lunar New Year days off (小年夜), or null where it isn't known.
export function lunarNewYearOff(y) {
  const days = yearOf(String(y));
  const md = Object.keys(days).find(k => days[k][0] === '小年夜');
  return md ? `${y}-${md}` : null;
}

export const twWorkday = t => {
  const day = twDay(t);
  if ((WORKDAYS[day.slice(0, 4)] || []).includes(day.slice(5))) return true;
  return !isWeekend(day) && !twHoliday(day);
};
export const twDayOff = t => !twWorkday(t);
