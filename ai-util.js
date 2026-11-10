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

// A file for a model to read (a photo, a PDF), as the phone sends it: { mime_type, data } (base64),
// or null. `types`: the kinds allowed.
export function fileOf(f, types = /^image\/(jpeg|png|webp)$/, max = 2_400_000) {
  const data = typeof f?.data === 'string' ? f.data : '';
  const mime = types.test(f?.mime_type || '') ? f.mime_type : '';
  if (!mime || data.length < 1000 || data.length > max || /[^A-Za-z0-9+/=]/.test(data.slice(0, 2000))) return null;
  return { mime, data };
}
