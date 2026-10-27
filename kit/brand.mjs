// The brand: one family, Orbit, and its apps: one source for the names, the
// colours, the lines that describe them and the marks (SVG strings). The kit
// reads it (APPS, the Pass's app list, the loading screen); brand/generate.mjs
// draws every icon and share card from it. Every app's icon is a planet with
// its ring and a moon, the app's symbol on the planet.
//
// `id` stays what the apps and the pass store under (stock, match,
// vocab…); only the names and looks are the brand's.

import { SITE } from './domain.mjs';

export const GOLD = '#f5c451';
export const FAMILY = { name: 'Orbit', from: '#312e81', to: '#020617', ink: '#1e1b4b', accent: '#a5b4fc', tag: { zh: '每天用得到的 App，一個 Orbit Pass', en: 'Everyday apps, one Orbit Pass' } };

// repo: the GitHub repo (and Pages path) each app lives at.
export const BRANDS = {
  stock: { name: 'Orbit Securities', short: 'Securities', repo: 'Orbit-Securities', from: '#2dd4bf', to: '#0f3d5c', ink: '#0f766e', color: '#0d9488', paint: ['#5eead4', '#0d9488', '#134e4a'], spot: '#fde047', pitch: { zh: '全球股市，模擬投資', en: 'Invest worldwide, risk-free' }, role: { zh: '投資與理財', en: 'Invest and grow' }, tag: { zh: '全球股市模擬投資：真實報價、換匯與融資', en: 'Invest in markets worldwide with play money' } },
  orbit: { name: 'Orbit Class', short: 'Class', repo: 'Orbit-Class', from: '#7dd3fc', to: '#0c4a6e', ink: '#0369a1', color: '#0ea5e9', paint: ['#67e8f9', '#0891b2', '#164e63'], spot: '#fde047', pitch: { zh: '今天的課，一眼看懂', en: 'Today’s classes at a glance' }, role: { zh: '課表', en: 'Class schedule' }, tag: { zh: '即時課表：現在、下一節與倒數', en: 'Your class schedule, live' } },
  weather: { name: 'Orbit Weather', short: 'Weather', repo: 'Orbit-Weather', from: '#a5b4fc', to: '#312e81', ink: '#4338ca', color: '#6366f1', paint: ['#93c5fd', '#2563eb', '#1e3a8a'], spot: '#fcd34d', pitch: { zh: '一個答案的天氣', en: 'One clear forecast' }, role: { zh: '天氣', en: 'Weather' }, tag: { zh: '一個答案的天氣：降雨、紫外線、空氣，跟著你的行程', en: 'One clear forecast for wherever you’ll be' } },
  transit: { name: 'Orbit Transit', short: 'Transit', repo: 'Orbit-Transit', from: '#6ee7b7', to: '#064e3b', ink: '#047857', color: '#10b981', paint: ['#86efac', '#16a34a', '#14532d'], spot: '#fde047', pitch: { zh: '公車、火車、YouBike', en: 'Bus, train and bike' }, role: { zh: '大眾運輸', en: 'Public transport' }, tag: { zh: '全台公車、火車、捷運與 YouBike，一次規劃', en: 'Buses, trains, metros and bikes across Taiwan' } },
  match: { name: 'Orbit Sports', short: 'Sports', repo: 'Orbit-Sports', from: '#fdba74', to: '#9a3412', ink: '#c2410c', color: '#ea580c', paint: ['#fdba74', '#f97316', '#9a3412'], spot: '#fff', pitch: { zh: '每場比賽，即時比分', en: 'Every game, live' }, role: { zh: '賽程與比分', en: 'Scores and schedules' }, tag: { zh: '所有運動的賽程、比分與數據', en: 'Every sport, every match, every stat' } },
  beats: { name: 'Orbit Beats', short: 'Beats', repo: 'Orbit-Beats', from: '#f0abfc', to: '#701a75', ink: '#a21caf', color: '#c026d3', paint: ['#f0abfc', '#c026d3', '#581c87'], spot: '#fde047', pitch: { zh: '做出你的節拍', en: 'Make your own beats' }, role: { zh: '節拍作曲', en: 'Beat maker' }, tag: { zh: '把你的節拍片段，排成一首首新歌', en: 'Your beat pieces, arranged into new songs' } },
  law: { name: 'Orbit Law', short: 'Law', repo: 'Orbit-Law', from: '#a5b4fc', to: '#1e1b4b', ink: '#4338ca', color: '#4f46e5', paint: ['#6366f1', '#3730a3', '#1e1b4b'], spot: '#fcd34d', pitch: { zh: '法規、裁判、立法', en: 'Laws, rulings, bills' }, role: { zh: '法規與法案', en: 'Laws and bills' }, tag: { zh: '台灣的法規，每個條號都能點；立法院的法案，走到哪一步一眼就懂。', en: 'Taiwan\'s laws with linked references, and 立法院 bills by stage' } },
  money: { name: 'Orbit Money', short: 'Money', repo: 'Orbit-Money', from: '#fde047', to: '#713f12', ink: '#a16207', color: '#ca8a04', paint: ['#facc15', '#ca8a04', '#713f12'], spot: GOLD, pitch: { zh: '每一筆，記得清楚', en: 'Every dollar, in its place' }, role: { zh: '記帳', en: 'Money tracker' }, tag: { zh: '記帳：月曆一眼看每天花多少，帳戶、悠遊卡、信用卡一起算，發票掃一下就記好', en: 'Your spending by day, every account and card, invoices scanned in' } },
  vocab: { name: 'Orbit Words', short: 'Words', repo: 'Orbit-Words', from: '#f9a8d4', to: '#831843', ink: '#be185d', color: '#db2777', paint: ['#fda4af', '#e11d48', '#881337'], spot: '#fde047', pitch: { zh: '背得住的英文單字', en: 'Words that stay' }, role: { zh: '英文單字', en: 'English words' }, tag: { zh: '背得住的英文單字：大考 6000 字，真人發音', en: 'English words that stay with you' } }
};
export const SITE_URL = SITE;
export const pathOf = id => {
  const b = BRANDS[id];
  return b ? `/${b.repo}/` : '/';
};
// Where an app will live (the new repo), for its links shared outside.
export const homeOf = id => `${SITE_URL}/${BRANDS[id].repo}/`;

// The Orbit Pass: the account, in every app's top-right.
export const PASS = { name: 'Orbit Pass', short: 'Pass', from: '#334155', to: '#020617', ink: '#0f172a', paint: ['#64748b', '#1e293b', '#020617'], spot: GOLD, pitch: { zh: '一組通行碼，所有 App', en: 'One pass, every app' }, tag: { zh: '一組通行碼，所有 App 共用', en: 'One pass for every app' } };

// Each app's symbol in a 128×128 box, drawn in `c` (white on the icons),
// its second colour `a` (the app's `spot`) where it has one, `d` the app's
// own deep colour (a bus's windows).
export const GLYPHS = {
  // A rising line and its arrow, a turn on it lit.
  stock: (c, a = GOLD) => `<path d="M18 98 L48 66 L70 82 L104 44" fill="none" stroke="${c}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/><path d="M78 40 L108 38 L106 68" fill="none" stroke="${c}" stroke-width="14" stroke-linecap="round" stroke-linejoin="round"/><circle cx="48" cy="66" r="9" fill="${a}"/>`,
  // The day's timetable: a page with its top bar, the period now lit.
  orbit: (c, a = GOLD) => `<rect x="20" y="18" width="88" height="94" rx="18" fill="none" stroke="${c}" stroke-width="11"/><path d="M20 44 H108" stroke="${c}" stroke-width="11"/><path d="M42 12 V26 M86 12 V26" stroke="${c}" stroke-width="11" stroke-linecap="round"/><rect x="36" y="58" width="56" height="16" rx="8" fill="${a}"/><path d="M42 92 H74" stroke="${c}" stroke-width="10" stroke-linecap="round"/>`,
  // The sun behind a cloud.
  weather: (c, a = GOLD) => `<circle cx="80" cy="44" r="24" fill="${a}"/><path d="M30 102 H88 A20 20 0 0 0 88 62 A28 28 0 0 0 36 64 A19 19 0 0 0 30 102 Z" fill="${c}"/>`,
  // A bus, from the front, its lights on.
  transit: (c, a = GOLD, d = '#14532d') => `<rect x="26" y="14" width="76" height="86" rx="20" fill="${c}"/><rect x="38" y="28" width="52" height="30" rx="7" fill="${d}"/><circle cx="45" cy="80" r="7" fill="${a}"/><circle cx="83" cy="80" r="7" fill="${a}"/><path d="M42 100 V112 M86 100 V112" stroke="${c}" stroke-width="12" stroke-linecap="round"/>`,
  // A ball and its seams.
  match: c => `<circle cx="64" cy="64" r="44" fill="none" stroke="${c}" stroke-width="11"/><path d="M64 20 V108 M20 64 H108" stroke="${c}" stroke-width="9"/><path d="M33 33 C48 48 48 80 33 95 M95 33 C80 48 80 80 95 95" fill="none" stroke="${c}" stroke-width="9" stroke-linecap="round"/>`,
  // An open book, a bookmark in it.
  vocab: (c, a = GOLD) => `<path d="M64 36 C52 26 32 24 14 28 V100 C32 96 52 98 64 108 C76 98 96 96 114 100 V28 C96 24 76 26 64 36 Z" fill="none" stroke="${c}" stroke-width="11" stroke-linejoin="round"/><path d="M64 36 V106" stroke="${c}" stroke-width="11" stroke-linecap="round"/><path d="M82 30 V62 L90 55 L98 62 V27" fill="${a}"/>`,
  // A waveform: five bars, the middle one tallest, a beat lit on it.
  beats: (c, a = GOLD) => `<path d="M22 52 V76 M43 36 V92 M64 18 V110 M85 36 V92 M106 52 V76" stroke="${c}" stroke-width="13" stroke-linecap="round"/><circle cx="64" cy="64" r="10" fill="${a}"/>`,
  // A pair of scales: a post, a beam, two gold pans.
  law: (c, a = GOLD) => `<path d="M64 20 V102 M42 108 H86 M26 34 H102" fill="none" stroke="${c}" stroke-width="11" stroke-linecap="round"/><circle cx="64" cy="22" r="8" fill="${c}"/><path d="M26 34 L12 70 M26 34 L40 70 M102 34 L88 70 M102 34 L116 70" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round"/><path d="M10 70 A16 16 0 0 0 42 70 Z M86 70 A16 16 0 0 0 118 70 Z" fill="${a}" stroke="${a}" stroke-width="4" stroke-linejoin="round"/>`,
  // The pass: a card with its chip.
  // A wallet, its clasp lit.
  money: (c, a = GOLD) => `<path d="M30 34 L82 16 L90 34" fill="none" stroke="${c}" stroke-width="10" stroke-linejoin="round" stroke-linecap="round"/><rect x="14" y="34" width="100" height="72" rx="18" fill="none" stroke="${c}" stroke-width="11"/><rect x="70" y="56" width="44" height="28" rx="12" fill="${c}"/><circle cx="88" cy="70" r="7" fill="${a}"/>`,
  pass: (c, a = GOLD) => `<rect x="12" y="28" width="104" height="72" rx="14" fill="none" stroke="${c}" stroke-width="11"/><rect x="28" y="48" width="26" height="20" rx="5" fill="${a}"/><path d="M28 82 H76" stroke="${c}" stroke-width="9" stroke-linecap="round"/>`
};

const of = id => (id === 'pass' ? PASS : BRANDS[id]);
// The app's colour, bright at the top to deep at the foot, lit from the top left.
const bg = (id, a, { shape }) => {
  const r = shape === 'rounded' ? 116 : 0;
  const [hi, mid, lo] = a.paint || [a.from, a.ink, a.to];
  return `<defs><linearGradient id="${id}-bg" x1="0.15" y1="0" x2="0.6" y2="1"><stop offset="0" stop-color="${hi}"/><stop offset="0.5" stop-color="${mid}"/><stop offset="1" stop-color="${lo}"/></linearGradient><radialGradient id="${id}-hl" cx="0.2" cy="0.05" r="0.75"><stop offset="0" stop-color="#fff" stop-opacity="0.32"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><filter id="${id}-sh" filterUnits="userSpaceOnUse" x="0" y="0" width="512" height="512"><feDropShadow dx="0" dy="10" stdDeviation="12" flood-color="#000" flood-opacity="0.3"/></filter></defs><rect width="512" height="512" rx="${r}" fill="url(#${id}-bg)"/><rect width="512" height="512" rx="${r}" fill="url(#${id}-hl)"/>`;
};
// The family's sign behind every symbol: a tilted orbit and its moon. The
// symbol itself big and white, so it reads at a home screen's size. Inside
// `s` (1 full size, less for a maskable icon's safe zone), centred on 256.
const orbitFace = (id, a, s) => `<g transform="translate(${256 - 256 * s} ${256 - 256 * s}) scale(${s})"><ellipse cx="256" cy="256" rx="236" ry="92" transform="rotate(-24 256 256)" fill="none" stroke="#fff" stroke-opacity="0.3" stroke-width="14"/><circle cx="424" cy="131" r="20" fill="#fff"/><g filter="url(#${id}-sh)"><g transform="translate(${256 - 64 * 2.3} ${256 - 64 * 2.3}) scale(2.3)">${GLYPHS[id]('#fff', a.spot, a.paint?.[1])}</g></g></g>`;

// An app's icon (512×512). shape: 'rounded' (a favicon, a picture in a
// page), 'square' (a home-screen icon: the phone rounds it) or 'maskable'
// (Android's adaptive icon: the sign inside the middle 80%).
export function appIcon(id, { shape = 'rounded' } = {}) {
  const a = of(id);
  const s = shape === 'maskable' ? 0.8 : 1;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${bg(id, a, { shape })}${orbitFace(id, a, s)}</svg>`;
}

// The family's own mark: a planet, its ring and a moon.
export function familyMark({ shape = 'rounded', plain = false } = {}) {
  const back = plain ? '' : bg('fam-orbit', FAMILY, { shape });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${back}<defs><linearGradient id="orbit-planet" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e0e7ff"/><stop offset="1" stop-color="#a5b4fc"/></linearGradient></defs><ellipse cx="256" cy="256" rx="220" ry="80" transform="rotate(-24 256 256)" fill="none" stroke="#fff" stroke-opacity="0.45" stroke-width="20"/><circle cx="256" cy="256" r="130" fill="url(#orbit-planet)"/><ellipse cx="256" cy="256" rx="220" ry="80" transform="rotate(-24 256 256)" fill="none" stroke="#fff" stroke-width="20" stroke-dasharray="0 330 420 2000" stroke-linecap="round"/><circle cx="440" cy="150" r="26" fill="#fff"/></svg>`;
}

// The developer settings (the admin panel's 開發): how fast live data is
// read again, by the apps and by the sports proxy, and the switches. Kept
// on the Worker (POST /eco admin 'config-set', GET /config for everyone);
// each app and the proxy read them, a missing or bad value its default.
//
// The defaults chase the sources' own speed, the worst case cut too: ESPN
// changes a live game about every 10 seconds and asking past its CDN gains
// nothing (2026-10-11: live games polled each second, plain and cache-busted,
// the plain one at most a second behind), so what's ours is kept small:
// the proxy 2 s, the phone 2 s, an open game read every 3 s (at most ~5 s
// behind ESPN). F1's feed is a fresh connection each read: every 4 s.
export const DEV = {
  proxyLive: { def: 2, min: 0, max: 60, unit: 's', group: 'proxy', zh: '代理保留即時資料', en: 'Proxy keeps live data', note: '越短越即時；0 = 跟著來源（ESPN 說可以保留多久的一半，2–5 秒）' },
  proxyFinalH: { def: 24, min: 1, max: 72, unit: 'h', group: 'proxy', zh: '代理保留已結束的比賽', en: 'Proxy keeps a game over', note: '比賽結束、整天都結束後，第一個人讀到就給所有人用這麼久' },
  sportsGame: { def: 3, min: 2, max: 120, unit: 's', group: 'sports', zh: '比賽頁重新讀取', en: 'Game sheet refresh', note: 'Orbit Sports 打開一場進行中的比賽時' },
  sportsList: { def: 5, min: 3, max: 120, unit: 's', group: 'sports', zh: '列表重新讀取', en: 'Lists refresh', note: '首頁、轉播、追蹤有比賽進行中時' },
  f1Feed: { def: 10, min: 4, max: 120, unit: 's', group: 'f1', zh: 'F1 即時計時（全 App）', en: 'F1 live timing, app-wide', note: '首頁卡片和誰在場上' },
  f1Board: { def: 4, min: 2, max: 60, unit: 's', group: 'f1', zh: 'F1 即時看板', en: 'F1 live board', note: '賽事頁打開進行中的一節（F1 的來源每 4 秒一次）' },
  f1Laps: { def: 15, min: 5, max: 120, unit: 's', group: 'f1', zh: 'F1 每圈資料', en: 'F1 laps', note: '數據的車手比較與圈速' },
  // Orbit Transit (TDX, measured 2026-10-11 by its own update times): bus
  // arrivals and the metro's board change every 30 s, trains' every 20-30,
  // YouBike every 60. Kept a third of that on the Worker, read as often.
  tdxLive: { def: 10, min: 5, max: 60, unit: 's', group: 'transit', zh: 'Worker 保留即時交通資料', en: 'Worker keeps live TDX', note: '公車到站、捷運與台鐵看板（TDX 每 30 秒更新）' },
  tdxBike: { def: 30, min: 10, max: 120, unit: 's', group: 'transit', zh: 'Worker 保留 YouBike', en: 'Worker keeps YouBike', note: 'TDX 每 60 秒更新' },
  transitLive: { def: 10, min: 5, max: 120, unit: 's', group: 'transit', zh: '交通卡片重新讀取', en: 'Transit cards refresh', note: '公車、捷運、台鐵、行程中' },
  transitBike: { def: 30, min: 15, max: 300, unit: 's', group: 'transit', zh: 'YouBike 重新讀取', en: 'YouBike refresh', note: '地圖上附近的車位' },
  // capacity.js: the live refreshes above slowed together when the people
  // expected in 30 days would run past Cloudflare's $5 plan (checked every
  // 6 hours); the numbers above stay the owner's own, the floor.
  autoScale: { def: false, group: 'scale', zh: '依人數自動調整', en: 'Scale with people', note: '人數預估會超過 Cloudflare $5 方案的額度時，上面的即時更新一起放慢（每 6 小時檢查）；有空間就回到上面的設定' },
  mirror: { def: true, group: 'data', zh: '使用每晚的資料副本', en: 'Use the nightly copies', note: '關掉：所有 App 都直接問代理（除錯用）' }
};
export const DEV_GROUPS = { proxy: '代理（sports-proxy）', sports: 'Orbit Sports', f1: 'F1', transit: 'Orbit Transit（TDX）', scale: '容量', data: '資料' };

// Settings as stored: each known key, in range, else its default.
export function cleanDev(x = {}) {
  const out = {};
  for (const [k, s] of Object.entries(DEV)) {
    const v = x?.[k];
    if (typeof s.def === 'boolean') out[k] = typeof v === 'boolean' ? v : s.def;
    else {
      const n = Number(v);
      out[k] = Number.isFinite(n) && v !== '' && v != null ? Math.min(s.max, Math.max(s.min, Math.round(n))) : s.def;
    }
  }
  return out;
}


// Each app's colour as orbit.css sets it under <html data-app="id"> (the
// block between app-colours markers; tools/accent-css.mjs writes it): the
// brand colour in light, halfway to its lighter `from` in dark. At no
// specificity, so an app's own :root { --q-accent } still wins.
const mix = (a, b) => `#${[1, 3, 5].map(i => Math.round((parseInt(a.slice(i, i + 2), 16) + parseInt(b.slice(i, i + 2), 16)) / 2).toString(16).padStart(2, '0')).join('')}`;
export const accentOf = (id, dark = false) => (dark ? mix(BRANDS[id].color || BRANDS[id].ink, BRANDS[id].from) : BRANDS[id].color || BRANDS[id].ink);
export function accentCss() {
  const ids = Object.keys(BRANDS);
  const rules = dark => ids.map(id => `:where(:root[data-app='${id}']${dark}) {\n  --q-accent: ${accentOf(id, Boolean(dark))};\n}`).join('\n');
  return `${rules('')}\n@media (prefers-color-scheme: dark) {\n${rules(":not([data-theme='light'])").replace(/^/gm, '  ')}\n}\n${rules("[data-theme='dark']")}`;
}

// <html data-app="id">: the app's colour from the first paint (orbit.css).
export function withApp(html, id) {
  return html.replace(/<html\b([^>]*)>/i, (tag, attrs) => (/\sdata-app=/.test(attrs) ? tag.replace(/\sdata-app=(["'])[^"']*\1/, ` data-app="${id}"`) : `<html${attrs} data-app="${id}">`));
}

// ---- Avatars ----------------------------------------------------------------------------
//
// Orbit's avatars: little planets with faces, drawn here as SVG (never
// emoji). Each is a colour (the palette: body, shade and sky) and a feature
// (a ring, bands, craters, a moon, a storm spot or a sparkle), with a face
// that changes along the list so neighbours never look alike. The planet and
// its tilted ring are the family mark's (familyMark, above).
//
// AVATARS: { id, zh, en } for every pairing; avatarSvg(id) the drawing;
// avatarSrc(id) a data: URL for an <img> (a picture keeps each drawing's
// gradients to itself, so many on one page never clash).

const PALETTES = [
  ['indigo', '靛藍', 'Indigo', '#eef2ff', '#a5b4fc', '#4338ca', '#0b1026'],
  ['mint', '薄荷', 'Mint', '#ecfdf5', '#6ee7b7', '#047857', '#022c22'],
  ['peach', '蜜桃', 'Peach', '#fff7ed', '#fdba74', '#c2410c', '#431407'],
  ['sakura', '櫻花', 'Sakura', '#fdf2f8', '#f9a8d4', '#be185d', '#500724'],
  ['sky', '晴空', 'Sky', '#f0f9ff', '#7dd3fc', '#0369a1', '#082f49'],
  ['orchid', '蘭紫', 'Orchid', '#fdf4ff', '#f0abfc', '#a21caf', '#4a044e'],
  ['lemon', '檸檬', 'Lemon', '#fefce8', '#fde047', '#a16207', '#422006'],
  ['teal', '湖水', 'Teal', '#f0fdfa', '#5eead4', '#0f766e', '#042f2e'],
  ['coral', '珊瑚', 'Coral', '#fff1f2', '#fda4af', '#be123c', '#4c0519'],
  ['matcha', '抹茶', 'Matcha', '#f7fee7', '#bef264', '#4d7c0f', '#1a2e05'],
  ['milktea', '奶茶', 'Milk tea', '#fffbeb', '#e7c9a0', '#92400e', '#2b1406'],
  ['violet', '紫羅蘭', 'Violet', '#f5f3ff', '#c4b5fd', '#6d28d9', '#2e1065'],
  ['moon', '月白', 'Moon', '#f8fafc', '#cbd5e1', '#475569', '#020617'],
  ['ocean', '海洋', 'Ocean', '#eff6ff', '#93c5fd', '#1d4ed8', '#172554'],
  ['amber', '琥珀', 'Amber', '#fffbeb', '#fbbf24', '#b45309', '#451a03'],
  ['lava', '熔岩', 'Lava', '#fef2f2', '#fca5a5', '#b91c1c', '#1c0a0a']
].map(([id, zh, en, light, body, deep, night]) => ({ id, zh, en, light, body, deep, night }));

const FEATURES = [
  ['ring', '光環', 'ring'],
  ['bands', '條紋', 'stripes'],
  ['craters', '隕石坑', 'craters'],
  ['moon', '小衛星', 'moon'],
  ['storm', '風暴', 'storm'],
  ['spark', '星光', 'stars']
].map(([id, zh, en]) => ({ id, zh, en }));

export const AVATARS = PALETTES.flatMap((p, i) => FEATURES.map((f, j) => ({ id: `${p.id}-${f.id}`, zh: `${p.zh}${f.zh}`, en: `${p.en} ${f.en}`, p: i, f: j })));
// Who hasn't picked one (or wore one that no longer exists) wears this.
export const DEFAULT_AVATAR = AVATARS[0].id;

const INK = '#1e1b4b';
const PLANET = { x: 32, y: 33, r: 20 };

// The faces: eyes near 29, the mouth near 37.
const FACES = [
  // Smile.
  () => `<circle cx="26" cy="30" r="2.2" fill="${INK}"/><circle cx="38" cy="30" r="2.2" fill="${INK}"/><path d="M27.5 35.5q4.5 4 9 0" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`,
  // Happy (closed eyes), blushing.
  () => `<path d="M23.5 31q2.5-3.2 5 0M35.5 31q2.5-3.2 5 0" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/><circle cx="22.5" cy="35" r="2.4" fill="#fb7185" opacity=".45"/><circle cx="41.5" cy="35" r="2.4" fill="#fb7185" opacity=".45"/><path d="M28 35q4 4 8 0" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`,
  // Grin.
  () => `<circle cx="26" cy="29.5" r="2.2" fill="${INK}"/><circle cx="38" cy="29.5" r="2.2" fill="${INK}"/><path d="M26.5 34.5h11q-1 5.5-5.5 5.5t-5.5-5.5z" fill="${INK}"/><path d="M29 38.2q3 1.6 6 0" fill="none" stroke="#fb7185" stroke-width="1.6" stroke-linecap="round"/>`,
  // Wink.
  () => `<circle cx="26" cy="30" r="2.2" fill="${INK}"/><path d="M35.5 30.5q2.5-2.4 5 0" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/><path d="M28 35.5q4 3.6 8 0" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`,
  // Wow: big bright eyes, a small round mouth.
  () => `<circle cx="26" cy="29.5" r="3" fill="${INK}"/><circle cx="38" cy="29.5" r="3" fill="${INK}"/><circle cx="27" cy="28.5" r="1" fill="#fff"/><circle cx="39" cy="28.5" r="1" fill="#fff"/><ellipse cx="32" cy="37" rx="2" ry="2.4" fill="${INK}"/>`,
  // Cool: sunglasses and a half smile.
  () => `<path d="M21.5 27.5h21v1.6h-1.4q-.4 4.4-4.6 4.4t-4.3-4.2h-.4q-.1 4.2-4.3 4.2t-4.6-4.4h-1.4z" fill="${INK}"/><path d="M24.5 29.5l2-1.4" stroke="#fff" stroke-opacity=".7" stroke-width="1.1" stroke-linecap="round"/><path d="M29 37q3.5 1.8 7-1" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/>`,
  // Sleepy.
  () => `<path d="M23.5 30q2.5 2.6 5 0M35.5 30q2.5 2.6 5 0" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/><ellipse cx="32" cy="36.5" rx="1.6" ry="1.2" fill="${INK}"/><path d="M44 19h4l-4 4h4" fill="none" stroke="#fff" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" opacity=".9"/>`,
  // Cheeky: a smile with its tongue out.
  () => `<circle cx="26" cy="30" r="2.2" fill="${INK}"/><circle cx="38" cy="30" r="2.2" fill="${INK}"/><path d="M27 35q5 3.4 10 0" fill="none" stroke="${INK}" stroke-width="2" stroke-linecap="round"/><path d="M32.4 36.6h3.4v1.6a1.7 1.7 0 0 1-3.4 0z" fill="#fb7185"/>`
];

// The features: what's drawn behind the planet, on it, and in front of it.
const FEAT = {
  ring: p => ({
    back: `<g transform="rotate(-18 32 41)"><path d="M5 41a27 7.5 0 0 1 54 0" fill="none" stroke="#fff" stroke-opacity=".5" stroke-width="3"/></g>`,
    front: `<g transform="rotate(-18 32 41)"><path d="M5 41a27 7.5 0 0 0 54 0" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round"/></g>`,
    sky: `<circle cx="51" cy="14" r="2" fill="#fff" opacity=".8"/>`
  }),
  bands: p => ({
    on: `<path d="M10 19h44v3.4H10zM10 43h44v3.6H10zM10 49h44v2.2H10z" fill="${p.deep}" opacity=".4"/>`,
    sky: `<circle cx="12" cy="15" r="1.4" fill="#fff" opacity=".7"/><circle cx="52" cy="50" r="1.2" fill="#fff" opacity=".6"/>`
  }),
  craters: p => ({
    on: `<circle cx="20" cy="40" r="3.4" fill="${p.deep}" opacity=".34"/><circle cx="43.5" cy="41.5" r="2.4" fill="${p.deep}" opacity=".34"/><circle cx="40" cy="20" r="2" fill="${p.deep}" opacity=".24"/><circle cx="33" cy="46.5" r="1.5" fill="${p.deep}" opacity=".24"/>`,
    sky: `<circle cx="11" cy="17" r="1.3" fill="#fff" opacity=".7"/>`
  }),
  moon: p => ({
    back: `<path d="M8 22a25 9 -20 0 1 48-6" fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="1.2" stroke-dasharray="2 2.4"/>`,
    front: `<circle cx="52" cy="13" r="5" fill="${p.light}"/><circle cx="50.6" cy="12" r="1.2" fill="${p.deep}" opacity=".3"/>`
  }),
  storm: p => ({
    on: `<ellipse cx="40" cy="43" rx="6" ry="3.2" fill="${p.deep}" opacity=".35"/><ellipse cx="40" cy="43" rx="3" ry="1.5" fill="${p.deep}" opacity=".35"/><path d="M14 23q8-3 16 0t20 0" fill="none" stroke="${p.deep}" stroke-opacity=".25" stroke-width="2.4" stroke-linecap="round"/>`,
    sky: `<circle cx="53" cy="18" r="1.3" fill="#fff" opacity=".75"/>`
  }),
  spark: () => ({
    sky: `<path d="M51 7l1.5 4 4 1.5-4 1.5-1.5 4-1.5-4-4-1.5 4-1.5zM11 45l1 2.6 2.6 1-2.6 1-1 2.6-1-2.6-2.6-1 2.6-1z" fill="#fff"/><circle cx="13" cy="14" r="1.4" fill="#fff" opacity=".8"/><circle cx="54" cy="44" r="1" fill="#fff" opacity=".7"/>`
  })
};

const svgs = new Map();
export function avatarSvg(id) {
  if (svgs.has(id)) return svgs.get(id);
  const a = AVATARS.find(x => x.id === id) || AVATARS[0];
  const p = PALETTES[a.p];
  const f = FEAT[FEATURES[a.f].id](p);
  const face = FACES[(a.p * 3 + a.f * 5) % FACES.length]();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><radialGradient id="s" cx=".3" cy=".2" r="1"><stop offset="0" stop-color="${p.deep}"/><stop offset="1" stop-color="${p.night}"/></radialGradient><radialGradient id="b" cx=".34" cy=".28" r=".8"><stop offset="0" stop-color="${p.light}"/><stop offset=".55" stop-color="${p.body}"/><stop offset="1" stop-color="${p.deep}" stop-opacity=".9"/></radialGradient><clipPath id="c"><circle cx="${PLANET.x}" cy="${PLANET.y}" r="${PLANET.r}"/></clipPath></defs><rect width="64" height="64" fill="url(#s)"/>${f.sky || ''}${f.back || ''}<circle cx="${PLANET.x}" cy="${PLANET.y}" r="${PLANET.r}" fill="url(#b)"/><g clip-path="url(#c)">${f.on || ''}<ellipse cx="25" cy="21" rx="6" ry="3.4" fill="#fff" opacity=".45" transform="rotate(-28 25 21)"/></g>${face}${f.front || ''}</svg>`;
  svgs.set(id, svg);
  return svg;
}
// Earned ones (orbit.mjs MILESTONES): one for each app and one for the
// family, `ms-<app>`, a planet in the app's colours in a gold ring, the
// app's sign on a gold medal.
const MEDAL = { pass: { body: '#a5b4fc', deep: '#4338ca', night: '#1e1b4b' } };
export const MEDAL_AVATARS = ['pass', ...Object.keys(BRANDS)].map(app => ({ id: `ms-${app}`, app }));
function medalSvg(app) {
  const b = BRANDS[app];
  const p = MEDAL[app] || { body: b.from, deep: b.ink, night: b.to };
  const ring = (d, o) => `<g transform="rotate(-18 32 41)"><path d="M3 41a29 8 0 0 ${d} 58 0" fill="none" stroke="url(#g)" stroke-width="3.4" stroke-linecap="round" opacity="${o}"/></g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><radialGradient id="s" cx=".3" cy=".2" r="1"><stop offset="0" stop-color="${p.deep}"/><stop offset="1" stop-color="${p.night}"/></radialGradient><radialGradient id="b" cx=".34" cy=".28" r=".8"><stop offset="0" stop-color="#f8fafc"/><stop offset=".5" stop-color="${p.body}"/><stop offset="1" stop-color="${p.deep}"/></radialGradient><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fef3c7"/><stop offset=".5" stop-color="#fbbf24"/><stop offset="1" stop-color="#b45309"/></linearGradient></defs><rect width="64" height="64" fill="url(#s)"/><path d="M51 6l1.4 3.6 3.6 1.4-3.6 1.4-1.4 3.6-1.4-3.6-3.6-1.4 3.6-1.4z" fill="#fde68a"/><circle cx="12" cy="14" r="1.3" fill="#fff" opacity=".8"/>${ring(1, 0.55)}<circle cx="${PLANET.x}" cy="${PLANET.y}" r="${PLANET.r}" fill="url(#b)"/><ellipse cx="25" cy="21" rx="6" ry="3.4" fill="#fff" opacity=".4" transform="rotate(-28 25 21)"/>${FACES[1]()}${ring(0, 1)}<circle cx="50" cy="50" r="11" fill="url(#g)" stroke="${p.night}" stroke-width="1.6"/><g transform="translate(41.5 41.5) scale(.1328)">${GLYPHS[app](p.night, '#fff')}</g></svg>`;
}
export const avatarSrc = id => `data:image/svg+xml,${encodeURIComponent(/^ms-/.test(id) && MEDAL_AVATARS.some(m => m.id === id) ? medalSvg(id.slice(3)) : avatarSvg(id))}`;
