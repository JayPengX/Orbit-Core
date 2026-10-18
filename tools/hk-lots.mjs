// node tools/hk-lots.mjs [ListOfSecurities.xlsx]
// Writes kit/stock-hk-lots.mjs: every HKEX equity, ETF and REIT's board lot,
// from HKEX's List of Securities (downloaded unless a copy is given). Run it
// now and then: a stock listed since isn't in the table (orders refused,
// lotUnknown) until it's run again.
import { readFileSync, writeFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

const LIST = 'https://www.hkex.com.hk/eng/services/trading/securities/securitieslists/ListOfSecurities.xlsx';
const KINDS = new Set(['Equity', 'Exchange Traded Products', 'Real Estate Investment Trusts']);

// One file out of a zip (an .xlsx), by its central directory.
function unzip(buf, name) {
  let end = buf.length - 22;
  while (end >= 0 && buf.readUInt32LE(end) !== 0x06054b50) end--;
  let at = buf.readUInt32LE(end + 16);
  for (let n = buf.readUInt16LE(end + 10); n > 0; n--) {
    const [method, size, nameLen, extraLen, commentLen, local] = [buf.readUInt16LE(at + 10), buf.readUInt32LE(at + 20), buf.readUInt16LE(at + 28), buf.readUInt16LE(at + 30), buf.readUInt16LE(at + 32), buf.readUInt32LE(at + 42)];
    if (buf.toString('utf8', at + 46, at + 46 + nameLen) === name) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      return (method === 8 ? inflateRawSync(data) : data).toString('utf8');
    }
    at += 46 + nameLen + extraLen + commentLen;
  }
  throw new Error(`${name} not in the file`);
}
const text = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

const buf = process.argv[2] ? readFileSync(process.argv[2]) : Buffer.from(await (await fetch(LIST)).arrayBuffer());
const strings = [...unzip(buf, 'xl/sharedStrings.xml').matchAll(/<(?:x:)?si>([\s\S]*?)<\/(?:x:)?si>/g)].map(m => text([...m[1].matchAll(/<(?:x:)?t[^>]*>([^<]*)<\/(?:x:)?t>/g)].map(t => t[1]).join('')));
const rows = [...unzip(buf, 'xl/worksheets/sheet1.xml').matchAll(/<(?:x:)?row[^>]*>([\s\S]*?)<\/(?:x:)?row>/g)].map(r => {
  const cells = {};
  for (const c of r[1].matchAll(/<(?:x:)?c r="([A-Z]+)\d+"([^>]*?)(?:\/>|>([\s\S]*?)<\/(?:x:)?c>)/g)) {
    const v = /<(?:x:)?v>([^<]*)<\/(?:x:)?v>/.exec(c[3] || '')?.[1] ?? '';
    cells[c[1]] = /t="s"/.test(c[2]) && v ? strings[Number(v)] : text(v);
  }
  return cells;
});
const head = rows.findIndex(r => r.A === 'Stock Code');
const col = name => Object.keys(rows[head]).find(k => rows[head][k] === name);
const [code, kind, lotCol] = ['Stock Code', 'Category', 'Board Lot'].map(col);
const asOf = rows.slice(0, head).map(r => r.A).find(a => /Updated as at/.test(a || '')) || '';
const byLot = new Map();
for (const r of rows.slice(head + 1)) {
  const n = Number(r[code]);
  const lot = Number(String(r[lotCol] || '').replace(/,/g, ''));
  if (!KINDS.has(r[kind]) || !(n > 0) || !(lot > 0)) continue;
  byLot.set(lot, [...(byLot.get(lot) || []), n]);
}
// Each lot's codes sorted, as base-36 gaps from the one before.
const lines = [...byLot].sort((a, b) => b[1].length - a[1].length).map(([lot, codes]) => {
  codes.sort((a, b) => a - b);
  return `  ${lot}: '${codes.map((c, i) => (c - (codes[i - 1] || 0)).toString(36)).join(',')}'`;
});
const count = [...byLot.values()].reduce((s, c) => s + c.length, 0);
writeFileSync(new URL('../kit/stock-hk-lots.mjs', import.meta.url), `// Every HKEX equity, ETF and REIT's board lot (HKEX List of Securities,
// ${asOf.replace(/^Updated as at /, 'as at ')}; ${count} securities): written by tools/hk-lots.mjs.
// { lot: codes }, each code a base-36 gap from the one before it.
export const HK_LOT_TABLE = {
${lines.join(',\n')}
};
`);
console.log(`${count} securities, ${byLot.size} lot sizes, ${asOf}`);
