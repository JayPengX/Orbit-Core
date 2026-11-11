// The credit jobs' answers into Orbit Law's ai/ folder (committed there,
// copied into data/ai/ at its deploy), each in the shape the proxy's
// /law-ask job checks as if the model had just answered (law.js `ready`):
//   ai/ruling/<bucket>-<lang>.json  { id: { v, raw } }    job 3 (v: the ruling's date)
//   ai/explain/<p>-<bucket>.json    { key: { m, raw } }   job 8 (m: the law's version)
// (Packed by law.js aiBucket: about a hundred files, not five thousand: a
// site's files are counted, 20,000 at most on Cloudflare's free plan.)
//   ai/agency.json               { id: [line, words] }  job 4
//   ai/phrases.json              [{ p, say, law, arts }] job 5, checked in the text
//   ai/gold.json                 [{ q, p, n, arts, fit }] jobs 5 and 1: Law's test questions
//   node tools/credit/export-law.mjs ../Orbit-Law
import fs from 'node:fs';
import path from 'node:path';
import { aiBucket } from '../../law.js';

const OUT = path.resolve(process.argv[2] || '../Orbit-Law', 'ai');
const HERE = path.join(path.dirname(new URL(import.meta.url).pathname), 'out');
const DATA = 'https://orbit.jaypengx.com/law/data/';
const rd = f => fs.readFileSync(path.join(HERE, f), 'utf8').trim().split('\n').map(l => JSON.parse(l));
const ok = r => r.stop === 'end_turn' && r.text;
const write = (f, j) => (fs.mkdirSync(path.dirname(f), { recursive: true }), fs.writeFileSync(f, JSON.stringify(j)));
const textFile = id => String(id).replace(/[^A-Za-z0-9_-]/g, '_');

// Rulings: each with the date of the text it was explained from.
const cons = new Map((await (await fetch(DATA + 'cons/index.json')).json()).items.map(r => [r[0], r[1]]));
let n = 0;
const packs = {};
const put = (file, key, val) => ((packs[file] ||= {})[key] = val);
for (const r of rd('3-rulings.jsonl').filter(ok)) {
  const [, id, lang] = r.id.match(/^(.+)_(zh|en)$/) || [];
  if (!id || !cons.has(id)) continue;
  put(`ruling/${aiBucket(id)}-${lang}.json`, id, { v: cons.get(id), raw: JSON.parse(r.text) });
  n++;
}
console.log('rulings', n);

// Articles: each with the version of the law it was explained from.
const laws = new Map();
n = 0;
for (const r of rd('8-articles.jsonl').filter(ok)) {
  const [, p, key] = r.id.match(/^([A-Z]\d{7})_(.+)$/) || [];
  if (!p) continue;
  if (!laws.has(p)) laws.set(p, await (await fetch(`${DATA}law/${p}.json`)).json());
  const law = laws.get(p);
  // (A key like 15-1 came back as 15-1; one the id had to change is found by its shape.)
  const art = law.a.find(a => a[0] === 'A' && textFile(a[1]) === key);
  if (!art) continue;
  put(`explain/${p}-${aiBucket(String(art[1]))}.json`, String(art[1]), { m: String(law.m ?? ''), raw: JSON.parse(r.text) });
  n++;
}
console.log('articles', n);
fs.rmSync(path.join(OUT, 'ruling'), { recursive: true, force: true });
fs.rmSync(path.join(OUT, 'explain'), { recursive: true, force: true });
for (const [f, j] of Object.entries(packs)) write(path.join(OUT, f), j);
console.log('packed files', Object.keys(packs).length);

// Agency rules: a line and the words people search them by (filler openings off).
const { rules } = await (await fetch(DATA + 'agency/all.json')).json();
const byFile = new Map(rules.map(r => [textFile(r[0]).slice(0, 64), r[0]]));
const agency = {};
for (const r of rd('4-agency.jsonl').filter(ok)) {
  const id = byFile.get(r.id);
  if (!id) continue;
  const j = JSON.parse(r.text);
  const line = String(j.line || '').trim().replace(/^(這則|此|本)(規定|辦法|要點|規則|須知|作業要點|注意事項|函釋|令)?(是在|在|主要)?(說明|規定|規範)?/, '').replace(/^[，、：]/, '');
  const words = [...new Set((j.words || []).map(w => String(w).replace(/\s+/g, '')).filter(w => w.length >= 2 && w.length <= 10))].slice(0, 8);
  if (line) agency[id] = [line, words];
}
write(path.join(OUT, 'agency.json'), agency);
console.log('agency', Object.keys(agency).length);

// Phrases and the test questions.
const phrases = JSON.parse(fs.readFileSync(path.join(HERE, 'phrases.json'), 'utf8'));
write(path.join(OUT, 'phrases.json'), phrases);
const gold = JSON.parse(fs.readFileSync(path.join(HERE, 'gold.json'), 'utf8'));
for (const r of rd('1-gold.jsonl').filter(ok)) {
  const i = Number(r.id.slice(1));
  const j = JSON.parse(r.text);
  if (gold[i]) Object.assign(gold[i], { fit: j.fit, best: (j.best || []).map(String).filter(k => gold[i].arts.includes(k)) });
}
write(path.join(OUT, 'gold.json'), gold);
console.log('phrases', phrases.length, 'gold', gold.length, 'yes', gold.filter(g => g.fit === 'yes').length);
