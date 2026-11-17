// What every AI feature's definition is written with (ai-features.js,
// law-ai.js): safe strings and lists, the JSON shapes a feature answers in
// (Gemini's OpenAPI subset; ai-other.js turns it into JSON Schema), and the
// check that numbers come from code, never the model.
export const str = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
export const list = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);
export const S = { type: 'string' }, N = { type: 'number' }, B = { type: 'boolean' };
export const obj = (properties, required = Object.keys(properties)) => ({ type: 'object', properties, required });
export const arr = items => ({ type: 'array', items });
export const text = t => [{ text: t }];

// Every number an answer writes must be one the input gave (numbers come
// from code; a model only puts them in words). Years and small counts too.
// (1,290 is 1290: a thousands comma either side.)
export const nums = t => String(t).replace(/(\d),(?=\d{3}(?!\d))/g, '$1').match(/\d+(?:\.\d+)?/g) || [];
// (The law writes its numbers in words: 百分之六, 三十日, 二個月 count as 6, 30, 2 too.)
const CN_DIGIT = { 零: 0, 〇: 0, 一: 1, 二: 2, 兩: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
const CN_UNIT = { 十: 10, 百: 100, 千: 1000 };
export function cnNumber(t) {
  let total = 0, wan = 0, digit = 0;
  for (const ch of t) {
    if (ch in CN_DIGIT) digit = CN_DIGIT[ch];
    else if (ch in CN_UNIT) ((total += (digit || 1) * CN_UNIT[ch]), (digit = 0));
    else if (ch === '萬') ((wan += (total + digit) * 10_000), (total = 0), (digit = 0));
  }
  return wan + total + digit;
}
const cnNums = t => (String(t).match(/[零〇一二兩三四五六七八九十百千萬]+/g) || []).map(w => String(cnNumber(w)));
export function numbersFrom(out, given) {
  const have = new Set([...nums(given), ...cnNums(given)]);
  return nums(out).every(n => have.has(n));
}

// Numbers a model worked out from the input (Jay 11-17: an answer that gave
// 3,683 of 5,820 but not the share asked for is "kind of stupid"): each
// `{ n, op, of }` in its `calc` is done again here from the input's own
// numbers, and an answer may write it (rounded as it likes: 63.3 or 63).
// op: sum, diff (the gap between two), pct (the first as a share of the
// second), avg, ratio, times. A calc that doesn't hold is dropped, and an
// answer leaning on it fails numbersFrom as before.
const OPS = {
  sum: v => v.reduce((a, b) => a + b, 0),
  diff: v => (v.length === 2 ? Math.abs(v[0] - v[1]) : NaN),
  pct: v => (v.length === 2 && v[1] ? (v[0] / v[1]) * 100 : NaN),
  avg: v => v.reduce((a, b) => a + b, 0) / v.length,
  ratio: v => (v.length === 2 && v[1] ? v[0] / v[1] : NaN),
  times: v => (v.length === 2 ? v[0] * v[1] : NaN)
};
export const CALC = arr(obj({ n: N, op: { type: 'string', enum: Object.keys(OPS) }, of: arr(N) }));
export const CALC_RULE =
  'You may work out a number the facts don’t give (a share as a percentage, a total of several rows, the gap between two, an average): use only the facts’ own numbers (or one worked out above it in calc), round a percentage to a whole number, and list each in calc as { n: the result, op: sum | diff | pct | avg | ratio | times, of: the facts’ numbers it is made from, in order (pct: the part, then the whole) }; the app checks every one. calc is [] when nothing was worked out.';
export function worked(calc, given) {
  const have = new Set(nums(given).map(Number));
  const out = [];
  for (const c of list(calc, 8)) {
    const f = OPS[c?.op];
    const of = list(c?.of, 40).map(Number);
    // (An operand is the input's own or a result worked out before it: a total, then its share.)
    const known = x => Number.isFinite(x) && (have.has(x) || out.some(w => Math.abs(w - x) <= 0.5));
    if (!f || !of.length || !of.every(known)) continue;
    const exact = f(of);
    if (Number.isFinite(exact)) out.push(exact);
  }
  return out;
}
// numbersFrom with the worked numbers: one written may be any rounding of them.
export function numbersWorked(out, given, calc) {
  const have = new Set([...nums(given), ...cnNums(given)]);
  const done = worked(calc, given);
  return nums(out).every(n => {
    if (have.has(n)) return true;
    const places = (n.split('.')[1] || '').length;
    return done.some(w => Math.abs(Number(n) - w) <= 0.5 * 10 ** -places + 1e-9);
  });
}

// A file for a model to read (a photo, a PDF), as the phone sends it: { mime_type, data } (base64),
// or null. `types`: the kinds allowed.
export function fileOf(f, types = /^image\/(jpeg|png|webp)$/, max = 2_400_000) {
  const data = typeof f?.data === 'string' ? f.data : '';
  const mime = types.test(f?.mime_type || '') ? f.mime_type : '';
  if (!mime || data.length < 1000 || data.length > max || /[^A-Za-z0-9+/=]/.test(data.slice(0, 2000))) return null;
  return { mime, data };
}
