// Taiwan's national days off (行政院人事行政總處's calendar): the holidays
// (on a weekend too, so a Saturday can be named) and the days given in
// their place (補假), for every app that plans a
// school or work day: Orbit Class (no classes, no class notices), Weather
// (no 到學校 advice), Transit (no commute picked for you). Weekends are off
// anyway and aren't listed. Quadra Securities keeps the exchange's own
// calendar (TWSE also closes the two days before Lunar New Year, which
// aren't days off for anyone else).
//
// Loaded with import('#kit/holidays.mjs').catch(() => null) or statically
// where the kit's own files are: an older kit without it is every weekday a
// working day, as before.
//
//   twHoliday(t)    the holiday's name ({ zh, en }) on Taiwan's day of t (a Date, ms or 'YYYY-MM-DD'), else null
//   twDayOff(t)     a weekend or a holiday
//   twWorkday(t)    the opposite (a 補班 Saturday too)

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
    '04-30': ['勞動節補假', 'Labour Day (in lieu)'],
    '05-01': ['勞動節', 'Labour Day'],
    '06-09': ['端午節', 'Dragon Boat Festival'],
    '09-15': ['中秋節', 'Mid-Autumn Festival'],
    '09-28': ['教師節', "Teachers' Day"],
    '10-10': ['國慶日', 'National Day'],
    '10-11': ['國慶日補假', 'National Day (in lieu)'],
    '10-25': ['光復節', 'Retrocession Day'],
    '12-24': ['行憲紀念日補假', 'Constitution Day (in lieu)'],
    '12-25': ['行憲紀念日', 'Constitution Day']
  }
};
// Saturdays worked in place of a day off (補班): none announced for these years.
const WORKDAYS = { 2026: [], 2027: [] };

// The fixed-date holidays, for a year past the list (its in-lieu days and the lunar ones can't be known).
const FIXED = { '01-01': HOLIDAYS[2026]['01-01'], '02-28': ['和平紀念日', 'Peace Memorial Day'], '04-04': ['兒童節', "Children's Day"], '05-01': ['勞動節', 'Labour Day'], '09-28': ['教師節', "Teachers' Day"], '10-10': ['國慶日', 'National Day'], '10-25': ['光復節', 'Retrocession Day'], '12-25': ['行憲紀念日', 'Constitution Day'] };

// Taiwan's calendar day of a time: 'YYYY-MM-DD'.
export function twDay(t) {
  if (typeof t === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const ms = t instanceof Date ? t.getTime() : Number(t);
  return new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10);
}

export function twHoliday(t) {
  const day = twDay(t);
  const [y, md] = [day.slice(0, 4), day.slice(5)];
  const hit = HOLIDAYS[y] ? HOLIDAYS[y][md] : FIXED[md];
  return hit ? { zh: hit[0], en: hit[1], day } : null;
}

const weekend = day => [0, 6].includes(new Date(`${day}T00:00:00Z`).getUTCDay());
export const twWorkday = t => {
  const day = twDay(t);
  if ((WORKDAYS[day.slice(0, 4)] || []).includes(day.slice(5))) return true;
  return !weekend(day) && !twHoliday(day);
};
export const twDayOff = t => !twWorkday(t);
