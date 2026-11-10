// 看法案 (the plan's family links, Jay 11-10): the laws Taiwan's stories
// name, read against Orbit Law's bills of this term (its bills/items.json),
// so a story's sheet in Orbit News opens the law in Law, or its bill when a
// headline speaks of changing it (修法, 草案, 三讀…). Code only: a law's
// full name as written, or the short name the press uses (勞基法). Writes
// news/laws.json: { built, stories: { id: [{ n, p, k, bill, passed }] },
// bills: { k: [[id, title, at]] } } (the second for Law's bill page).

import { DATA, lawFetch } from '../law.js';
import { NEWS_PATH } from './news.js';

export const LAWS_PATH = 'news/laws.json';

// The press's short names, each for its full name (only those whose full
// name is one of the term's bills are used). Not 國安法 (Hong Kong's too),
// nor two-character names (刑法, 民法: named in every crime story and inside
// longer names).
export const SHORT = {
  勞基法: '勞動基準法', 食安法: '食品安全衛生管理法', 財劃法: '財政收支劃分法', 選罷法: '公職人員選舉罷免法', 憲訴法: '憲法訴訟法',
  公投法: '公民投票法', 個資法: '個人資料保護法', 兩岸條例: '臺灣地區與大陸地區人民關係條例', 職權行使法: '立法院職權行使法', 原基法: '原住民族基本法',
  環評法: '環境影響評估法', 證交法: '證券交易法', 健保法: '全民健康保險法', 勞保條例: '勞工保險條例', 跟騷法: '跟蹤騷擾防制法',
  毒品條例: '毒品危害防制條例', 道交條例: '道路交通管理處罰條例', 詐防條例: '詐欺犯罪危害防制條例', 兒少法: '兒童及少年福利與權益保障法',
  長照法: '長期照顧服務法', 核管法: '核子反應器設施管制法', 全民防衛動員法: '全民防衛動員準備法', 組織犯罪條例: '組織犯罪防制條例',
  再生能源條例: '再生能源發展條例', 警職法: '警察職權行使法', 都更條例: '都市更新條例', 空污法: '空氣污染防制法', 動保法: '動物保護法', 私校法: '私立學校法'
};
// A headline about changing a law, not only naming it (涉反滲透法 is no bill).
export const BILL_WORDS = /修法|修正|草案|三讀|二讀|一讀|初審|付委|逕付|審查|協商|覆議|提案|法案|立法院|立院|院會|退回/;
const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// The term's laws by every name: { re, byName: name → item }, null if none.
export function lawNames(items = []) {
  const byLaw = new Map();
  for (const it of items) if (it?.n && it.p && it.k && !it.dropped && (!byLaw.has(it.n) || (byLaw.get(it.n).term || 0) < (it.term || 0))) byLaw.set(it.n, it);
  const byName = new Map();
  for (const [n, it] of byLaw) if (n.length >= 3) byName.set(n, it);
  for (const [s, full] of Object.entries(SHORT)) if (byLaw.has(full)) byName.set(s, byLaw.get(full));
  if (!byName.size) return null;
  // (Longest first: 國民法官法 before any shorter name inside it; never in 港版….)
  return { re: new RegExp(`(?<![港區])(${[...byName.keys()].sort((a, b) => b.length - a.length).map(esc).join('|')})`, 'g'), byName };
}

// A story's laws: [{ n, p, k, bill, passed }], those its headlines speak of changing first.
export function lawsOf(story, names, most = 3) {
  if (!names) return [];
  const found = new Map();
  for (const t of [story.title, ...(story.items || []).map(it => it[1])]) {
    const s = String(t || '');
    const bill = BILL_WORDS.test(s);
    for (const m of s.matchAll(names.re)) {
      const it = names.byName.get(m[1]);
      const was = found.get(it.n);
      found.set(it.n, { n: it.n, p: it.p, k: it.k, bill: !!(was?.bill || bill), passed: it.passed || '', hits: (was?.hits || 0) + 1 });
    }
  }
  return [...found.values()]
    .sort((a, b) => b.bill - a.bill || b.hits - a.hits)
    .slice(0, most)
    .map(({ hits, ...l }) => l);
}

export function lawsPage(stories = [], items = [], now = Date.now()) {
  const names = lawNames(items);
  const out = { built: now, stories: {}, bills: {} };
  for (const s of stories) {
    const laws = lawsOf(s, names);
    if (!laws.length) continue;
    out.stories[s.id] = laws;
    for (const l of laws) if (l.bill) (out.bills[l.k] ||= []).push([s.id, s.title, s.at]);
  }
  for (const k of Object.keys(out.bills)) out.bills[k] = out.bills[k].sort((a, b) => b[2] - a[2]).slice(0, 8);
  return out;
}

export async function runNewsLaws({ store, now = Date.now() }) {
  const page = await store.json(NEWS_PATH);
  if (!page?.tw) return { skipped: 'no stories' };
  const res = await lawFetch(`${DATA}bills/items.json`, { cf: { cacheTtlByStatus: { '200-299': 3600, '500-599': 0 }, cacheEverything: true }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`law items ${res.status}`);
  const out = lawsPage(page.tw, (await res.json())?.items || [], now);
  // (Written only when a story's laws changed: the time alone isn't a change.)
  const was = await store.json(LAWS_PATH).catch(() => null);
  if (was && JSON.stringify(was.stories) === JSON.stringify(out.stories)) return { same: Object.keys(out.stories).length };
  await store.put(LAWS_PATH, out);
  return { stories: Object.keys(out.stories).length, bills: Object.keys(out.bills).length };
}
