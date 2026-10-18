// node tools/jp-lists.mjs
// Writes kit/stock-jp-lists.mjs from JPX's own files: TOPIX500 (the TOPIX
// weights file's Core30, Large70 and Mid400 rows, the issues on the finer
// tick table) and every ETF's trading unit (each one's fact sheet, read with
// poppler's pdftotext). Run it after TOPIX's October review and now and
// then for new ETFs (one not listed trades in 1s).
import { writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const JPX = 'https://www.jpx.co.jp';
const WEIGHTS = `${JPX}/automation/markets/indices/topix/files/topixweight_j.csv`;
const ETF_LISTS = ['/equities/products/etfs/issues/01.html', '/equities/products/etfs/leveraged-inverse/01.html'];
const get = async url => Buffer.from(await (await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } })).arrayBuffer());

const csv = new TextDecoder('shift_jis').decode(await get(WEIGHTS)).split(/\r?\n/).map(l => l.split(','));
const asOf = csv[1]?.[0]?.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
const t500 = [...new Set(csv.filter(r => /TOPIX (Core30|Large70|Mid400)/.test(r[5] || '')).map(r => r[2]))].sort();
if (t500.length < 450) throw new Error(`TOPIX500: ${t500.length} codes`);

const units = new Map();
let count = 0;
for (const page of ETF_LISTS) {
  const html = (await get(JPX + page)).toString('utf8');
  const codes = [...new Set([...html.matchAll(/href="\.\/files\/([0-9A-Z]{4})-j\.pdf"/g)].map(m => m[1]))];
  for (const code of codes) {
    const pdf = await get(new URL(`files/${code}-j.pdf`, JPX + page).href);
    const text = execFileSync('pdftotext', ['-layout', '-', '-'], { input: pdf }).toString('utf8');
    const unit = Number(/売買単位\s*([\d,]+)口/.exec(text)?.[1]?.replace(/,/g, ''));
    if (!(unit > 0)) throw new Error(`${code}: no trading unit`);
    count++;
    if (unit !== 1) units.set(unit, [...(units.get(unit) || []), code]);
  }
}
const wrap = (codes, indent) => codes.join(' ').replace(/(.{1,99})(\s|$)/g, `${indent}$1\n`).trimEnd();
writeFileSync(new URL('../kit/stock-jp-lists.mjs', import.meta.url), `// Tokyo's lists the account needs, from JPX's own files (tools/jp-lists.mjs).
//   TOPIX500 (TOPIX100 and Mid400): the issues on the finer tick table,
//     from JPX's TOPIX weights file (topixweight_j.csv) of ${asOf},
//     its Core30, Large70 and Mid400 rows (${t500.length} codes).
//   ETF trading units (売買単位): each ETF's own, from its JPX fact sheet
//     (銘柄一覧（ETF） and レバレッジ型・インバース型, ${count} ETFs on ${new Date().toISOString().slice(0, 10)});
//     every one not listed here trades in 1s.
// Codes as Yahoo has them before '.T' (alphanumeric ones too: 285A).

export const TOPIX500 = \`
${wrap(t500, '')}
\`;
export const JP_ETF_UNITS = {
${[...units].sort((a, b) => a[0] - b[0]).map(([u, c]) => `  ${u}: \`\n${wrap(c.sort(), '    ')}\n  \`,`).join('\n')}
};
`);
console.log(`TOPIX500 ${t500.length} codes (${asOf}); ${count} ETFs, ${[...units.values()].flat().length} not in 1s`);
