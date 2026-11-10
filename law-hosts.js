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
  'exlaw.klcg.gov.tw', // 基隆市
  'hclaw.hsinchu.gov.tw', // 新竹縣
  'glrs.nantou.gov.tw', // 南投縣
  'law.cyhg.gov.tw', // 嘉義縣
  'law.penghu.gov.tw' // 澎湖縣
]);
const RULE_PAGE = /\/(LawQuery|LawCategoryContentList|LawContent)\.aspx$/i;

// The 縣市議會 sites that serve only Taiwan (2026-11-10: the cloud box refused):
// Orbit Law's nightly build reads their bill lists and 議事錄 through the same door;
// a 鄉鎮市民代表會's and its town hall's sites the same way.
export const COUNCIL_HOSTS = new Set([
  'bms.ntp.gov.tw', // 新北市議會's 議案查詢
  'www.ntp.gov.tw', // 新北市議會
  'www.tycc.gov.tw', // 桃園市議會
  'www.tcc.gov.tw', // 臺北市議會
  'tccvideo.tcc.gov.tw', // 臺北市議會's recordings (not on YouTube)
  'www.ptcc.gov.tw', // 屏東縣議會
  'www.ilcc.gov.tw', // 宜蘭縣議會
  'www.mlcc.gov.tw', // 苗栗縣議會
  'www.mtcc.gov.tw', // 連江縣議會
  'www.tthcc.gov.tw', // 臺東縣議會
  'www.zhubei.gov.tw' // 竹北市公所, whose CMS holds 竹北市民代表會's site (/jbc/; jbc.gov.tw is gone)
]);

// A url of those sites' rule pages, or a council's page: https, no credentials or port.
export function twOnly(raw) {
  let u;
  try {
    u = new URL(String(raw || ''));
  } catch {
    return false;
  }
  if (u.protocol !== 'https:' || u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase();
  return (TW_ONLY_HOSTS.has(host) && RULE_PAGE.test(u.pathname)) || COUNCIL_HOSTS.has(host);
}

// 司法院's judgment pages (judgment.judicial.gov.tw/FJUD/data.aspx) turned
// away every address outside Taiwan by 2026-10-27 (GitHub's US runner timed
// out connecting; the app's 類似判決 and #r= rulings never loaded): a
// Pass's /law-page read of one, and /law-chat's gist of one, go through
// gemini-relay from Taiwan too. That page only, GET only.
const JUDGMENT = /^\/FJUD\/data\.aspx$/i;
export function judgmentPage(raw) {
  let u;
  try {
    u = new URL(String(raw || ''));
  } catch {
    return false;
  }
  return u.protocol === 'https:' && !u.username && !u.password && !u.port && u.hostname.toLowerCase() === 'judgment.judicial.gov.tw' && JUDGMENT.test(u.pathname);
}
// A page read from Taiwan: a county's rule page or a judgment.
export const viaTaiwan = raw => twOnly(raw) || judgmentPage(raw);

// The build's key matches the secret (compared in constant time); no secret set, no door.
export function buildKeyOk(given, secret) {
  const a = String(given || '');
  const b = String(secret || '');
  if (b.length < 24 || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < b.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
