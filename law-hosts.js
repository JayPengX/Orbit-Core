// The county 法規查詢 sites that serve only Taiwan (2026-10-21: the cloud box
// and GitHub's US runners were both refused). Orbit Law's nightly build reads
// them through /law-page with its build key (LAW_BUILD_KEY, a secret both
// sides hold), fetched from Taiwan by gemini-relay.js: their rule pages only, GET only.
export const TW_ONLY_HOSTS = new Set([
  'law.tycg.gov.tw', // 桃園市
  'law01.tainan.gov.tw', // 臺南市
  'glrslaw.e-land.gov.tw', // 宜蘭縣
  'law.yunlin.gov.tw', // 雲林縣
  'ptlaw.pthg.gov.tw', // 屏東縣
  'law.taitung.gov.tw', // 臺東縣
  'glrs.hl.gov.tw', // 花蓮縣
  'law.klcg.gov.tw', // 基隆市
  'law.hsinchu.gov.tw', // 新竹縣
  'law.nantou.gov.tw', // 南投縣
  'law.cyhg.gov.tw', // 嘉義縣
  'law.penghu.gov.tw' // 澎湖縣
]);
const RULE_PAGE = /\/(LawQuery|LawCategoryContentList|LawContent)\.aspx$/i;

// A url of those sites' rule pages: https, no credentials or port.
export function twOnly(raw) {
  let u;
  try {
    u = new URL(String(raw || ''));
  } catch {
    return false;
  }
  return u.protocol === 'https:' && !u.username && !u.password && !u.port && TW_ONLY_HOSTS.has(u.hostname.toLowerCase()) && RULE_PAGE.test(u.pathname);
}

// The build's key matches the secret (compared in constant time); no secret set, no door.
export function buildKeyOk(given, secret) {
  const a = String(given || '');
  const b = String(secret || '');
  if (b.length < 24 || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < b.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
