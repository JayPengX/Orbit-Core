// The brand: two families and their apps, one source for the names, the
// colours, the lines that describe them and the marks (SVG strings). The kit
// reads it (APPS, the Pass's app list, the loading screen); brand/generate.mjs
// draws every icon and share card from it.
//
//   Quadra  where the money is: Quadra Securities, Quadra Play, and the
//           Quadra Pass every app signs in with. A square tile with a gold
//           corner (the fourth quadrant).
//   Orbit   everyday tools: Orbit Class, Weather, Transit, Sports, Words,
//           Slips, Beats.
//           A planet with its ring and a moon.
//
// `id` stays what the apps and the pass store under (stock, odds, match,
// vocab…); only the names and looks are the brand's.

export const GOLD = '#f5c451';
export const FAMILIES = {
  quadra: { name: 'Quadra', from: '#1e293b', to: '#020617', ink: '#0f172a', accent: GOLD, tag: { zh: '投資與娛樂，一個帳戶', en: 'Markets and play, one account' } },
  orbit: { name: 'Orbit', from: '#312e81', to: '#020617', ink: '#1e1b4b', accent: '#a5b4fc', tag: { zh: '每天用得到的小工具', en: 'Everyday tools that keep you on track' } }
};

// repo: the GitHub repo (and Pages path) each app lives at.
export const BRANDS = {
  stock: { family: 'quadra', name: 'Quadra Securities', short: 'Securities', repo: 'Quadra-Securities', from: '#2dd4bf', to: '#0f3d5c', ink: '#0f766e', color: '#0d9488', role: { zh: '投資與理財', en: 'Invest and grow' }, tag: { zh: '全球股市模擬投資：真實報價、換匯與融資', en: 'Invest in markets worldwide with play money' } },
  odds: { family: 'quadra', name: 'Quadra Play', short: 'Play', repo: 'Quadra-Play', from: '#60a5fa', to: '#1e3a8a', ink: '#1d4ed8', color: '#2563eb', role: { zh: '運彩與彩券', en: 'Sports bets and lottery' }, tag: { zh: '運彩與彩券：每一注的數學都看得見', en: 'Sports bets and the lottery, with the maths shown' } },
  orbit: { family: 'orbit', name: 'Orbit Class', short: 'Class', repo: 'Orbit-Class', from: '#7dd3fc', to: '#0c4a6e', ink: '#0369a1', color: '#0ea5e9', role: { zh: '課表', en: 'Class schedule' }, tag: { zh: '即時課表：現在、下一節與倒數', en: 'Your class schedule, live' } },
  weather: { family: 'orbit', name: 'Orbit Weather', short: 'Weather', repo: 'Orbit-Weather', from: '#a5b4fc', to: '#312e81', ink: '#4338ca', color: '#6366f1', role: { zh: '天氣', en: 'Weather' }, tag: { zh: '一個答案的天氣：降雨、紫外線、空氣，跟著你的行程', en: 'One clear forecast for wherever you’ll be' } },
  transit: { family: 'orbit', name: 'Orbit Transit', short: 'Transit', repo: 'Orbit-Transit', from: '#6ee7b7', to: '#064e3b', ink: '#047857', color: '#10b981', role: { zh: '大眾運輸', en: 'Public transport' }, tag: { zh: '全台公車、火車、捷運與 YouBike，一次規劃', en: 'Buses, trains, metros and bikes across Taiwan' } },
  match: { family: 'orbit', name: 'Orbit Sports', short: 'Sports', repo: 'Orbit-Sports', was: 'Quadra-Fixtures', from: '#fdba74', to: '#9a3412', ink: '#c2410c', color: '#ea580c', role: { zh: '賽程與比分', en: 'Scores and schedules' }, tag: { zh: '所有運動的賽程、比分與數據', en: 'Every sport, every match, every stat' } },
  slip: { family: 'orbit', name: 'Orbit Slips', short: 'Slips', repo: 'Orbit-Slips', from: '#fcd34d', to: '#78350f', ink: '#b45309', color: '#d97706', role: { zh: '運彩追蹤', en: 'Ticket tracker' }, tag: { zh: '買了的運彩，即時追蹤：比分、機率、現在價值', en: 'Your sports lottery tickets, followed live' } },
  beats: { family: 'orbit', name: 'Orbit Beats', short: 'Beats', repo: 'Orbit-Beats', from: '#f0abfc', to: '#701a75', ink: '#a21caf', color: '#c026d3', role: { zh: '節拍作曲', en: 'Beat maker' }, tag: { zh: '把你的節拍片段，排成一首首新歌', en: 'Your beat pieces, arranged into new songs' } },
  law: { family: 'orbit', name: 'Orbit Law', short: 'Law', repo: 'Orbit-Law', from: '#a5b4fc', to: '#1e1b4b', ink: '#4338ca', color: '#4f46e5', role: { zh: '法規與法案', en: 'Laws and bills' }, tag: { zh: '台灣的法規，每個條號都能點；立法院的法案，走到哪一步一眼就懂。', en: 'Taiwan\'s laws with linked references, and 立法院 bills by stage' } },
  vocab: { family: 'orbit', name: 'Orbit Words', short: 'Words', repo: 'Orbit-Words', was: 'Quadra-Hub', from: '#f9a8d4', to: '#831843', ink: '#be185d', color: '#db2777', role: { zh: '英文單字', en: 'English words' }, tag: { zh: '背得住的英文單字：大考 6000 字，真人發音', en: 'English words that stay with you' } }
};
// `was` is an old repo name (brand/ and tools/moved/ forward it).
export const SITE_URL = 'https://jaypengx.github.io';
export const pathOf = id => {
  const b = BRANDS[id];
  return b ? `/${b.repo}/` : '/';
};
// Where an app will live (the new repo), for its links shared outside.
export const homeOf = id => `${SITE_URL}/${BRANDS[id].repo}/`;

// The Quadra Pass: the account, in every app's top-right.
export const PASS = { family: 'quadra', name: 'Quadra Pass', short: 'Pass', from: '#334155', to: '#020617', ink: '#0f172a', tag: { zh: '一組通行碼，所有 App 共用', en: 'One pass for every app' } };

// Each app's symbol in a 128×128 box, drawn in `c` (an accent `a` where it
// has a second colour).
export const GLYPHS = {
  // A rising line and its arrow.
  stock: c => `<path d="M22 96 L52 64 L72 80 L106 40" fill="none" stroke="${c}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/><path d="M82 38 L108 36 L106 62" fill="none" stroke="${c}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>`,
  // A play button inside a ticket.
  odds: c => `<path d="M20 36 H108 V54 A10 10 0 0 0 108 74 V92 H20 V74 A10 10 0 0 0 20 54 Z" fill="none" stroke="${c}" stroke-width="10" stroke-linejoin="round"/><path d="M54 48 L82 64 L54 80 Z" fill="${c}" stroke="${c}" stroke-width="6" stroke-linejoin="round"/>`,
  // The day's periods: a card of rows, the one now marked.
  orbit: c => `<rect x="24" y="22" width="80" height="84" rx="16" fill="none" stroke="${c}" stroke-width="10"/><path d="M44 48 H84 M44 66 H84 M44 84 H70" stroke="${c}" stroke-width="10" stroke-linecap="round"/>`,
  // The sun behind a cloud.
  weather: (c, a = '#f59e0b') => `<circle cx="78" cy="46" r="22" fill="${a}"/><path d="M34 98 H86 A18 18 0 0 0 86 62 A26 26 0 0 0 38 64 A17 17 0 0 0 34 98 Z" fill="${c}"/>`,
  // A bus, from the front.
  transit: (c, a = '#f59e0b') => `<rect x="30" y="18" width="68" height="80" rx="18" fill="none" stroke="${c}" stroke-width="10"/><rect x="40" y="32" width="48" height="28" rx="6" fill="${c}"/><circle cx="46" cy="78" r="6" fill="${a}"/><circle cx="82" cy="78" r="6" fill="${a}"/><path d="M42 98 V110 M86 98 V110" stroke="${c}" stroke-width="10" stroke-linecap="round"/>`,
  // A ball and its seams.
  match: c => `<circle cx="64" cy="64" r="42" fill="none" stroke="${c}" stroke-width="10"/><path d="M64 22 V106 M22 64 H106" stroke="${c}" stroke-width="8"/><path d="M34 34 C48 48 48 80 34 94 M94 34 C80 48 80 80 94 94" fill="none" stroke="${c}" stroke-width="8" stroke-linecap="round"/>`,
  // An open book.
  vocab: c => `<path d="M64 38 C52 28 34 26 18 30 V100 C34 96 52 98 64 108 C76 98 94 96 110 100 V30 C94 26 76 28 64 38 Z" fill="none" stroke="${c}" stroke-width="10" stroke-linejoin="round"/><path d="M64 38 V106" stroke="${c}" stroke-width="10" stroke-linecap="round"/>`,
  // A ticket torn along its line, a tick on it.
  slip: (c, a = '#16a34a') => `<path d="M24 30 H104 V54 A10 10 0 0 0 104 74 V98 H24 V74 A10 10 0 0 0 24 54 Z" fill="none" stroke="${c}" stroke-width="10" stroke-linejoin="round"/><path d="M48 64 L60 76 L82 50" fill="none" stroke="${a}" stroke-width="11" stroke-linecap="round" stroke-linejoin="round"/>`,
  // A waveform: five bars, the middle one tallest, a beat lit on it.
  beats: (c, a = '#f472b6') => `<path d="M24 52 V76 M44 38 V90 M64 22 V106 M84 38 V90 M104 52 V76" stroke="${c}" stroke-width="12" stroke-linecap="round"/><circle cx="64" cy="64" r="9" fill="${a}"/>`,
  // A pair of scales: a post, a beam, two pans.
  law: c => `<path d="M64 22 V100 M46 106 H82 M30 36 H98" fill="none" stroke="${c}" stroke-width="10" stroke-linecap="round"/><path d="M30 36 L16 70 M30 36 L44 70 M98 36 L84 70 M98 36 L112 70" fill="none" stroke="${c}" stroke-width="6" stroke-linecap="round"/><path d="M16 70 A14 14 0 0 0 44 70 Z M84 70 A14 14 0 0 0 112 70 Z" fill="${c}" stroke="${c}" stroke-width="4" stroke-linejoin="round"/>`,
  // The pass: a card with its chip.
  pass: (c, a = GOLD) => `<rect x="16" y="32" width="96" height="64" rx="12" fill="none" stroke="${c}" stroke-width="10"/><rect x="30" y="50" width="22" height="16" rx="4" fill="${a}"/><path d="M30 80 H72" stroke="${c}" stroke-width="8" stroke-linecap="round"/>`
};

const of = id => (id === 'pass' ? PASS : BRANDS[id]);
const bg = (id, a, { shape }) => {
  const r = shape === 'rounded' ? 116 : 0;
  return `<defs><linearGradient id="${id}-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a.from}"/><stop offset="1" stop-color="${a.to}"/></linearGradient><radialGradient id="${id}-hl" cx="0.22" cy="0.15" r="0.85"><stop offset="0" stop-color="#fff" stop-opacity="0.3"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="512" height="512" rx="${r}" fill="url(#${id}-bg)"/><rect width="512" height="512" rx="${r}" fill="url(#${id}-hl)"/>`;
};
// The family's sign on an icon, inside `s` (1 full size, less for a
// maskable icon's safe zone), centred on 256.
const quadraFace = (id, a, s) => {
  const t = (x, y) => `translate(${256 + (x - 256) * s} ${256 + (y - 256) * s}) scale(${s})`;
  return `<g transform="${t(0, 0)}"><rect x="352" y="64" width="104" height="104" rx="28" fill="${GOLD}"/><rect x="104" y="128" width="280" height="280" rx="72" fill="#fff"/><g transform="translate(104 128) scale(2.1875)">${GLYPHS[id](a.ink)}</g></g>`;
};
const orbitFace = (id, a, s) => `<g transform="translate(${256 - 256 * s} ${256 - 256 * s}) scale(${s})"><ellipse cx="256" cy="256" rx="218" ry="78" transform="rotate(-24 256 256)" fill="none" stroke="#fff" stroke-opacity="0.5" stroke-width="18"/><circle cx="256" cy="256" r="142" fill="#fff"/><ellipse cx="256" cy="256" rx="218" ry="78" transform="rotate(-24 256 256)" fill="none" stroke="#fff" stroke-width="18" stroke-dasharray="0 330 420 2000" stroke-linecap="round"/><circle cx="438" cy="152" r="24" fill="#fff"/><g transform="translate(158 158) scale(1.53125)">${GLYPHS[id](a.ink)}</g></g>`;

// An app's icon (512×512). shape: 'rounded' (a favicon, a picture in a
// page), 'square' (a home-screen icon: the phone rounds it) or 'maskable'
// (Android's adaptive icon: the sign inside the middle 80%).
export function appIcon(id, { shape = 'rounded' } = {}) {
  const a = of(id);
  const s = shape === 'maskable' ? 0.78 : 1;
  const face = a.family === 'orbit' ? orbitFace(id, a, s) : quadraFace(id, a, s);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${bg(id, a, { shape })}${face}</svg>`;
}

// A family's own mark. Quadra: four tiles, the fourth gold. Orbit: a planet,
// its ring and a moon.
export function familyMark(family, { shape = 'rounded', plain = false } = {}) {
  const f = FAMILIES[family];
  const back = plain ? '' : bg(`fam-${family}`, f, { shape });
  if (family === 'quadra') {
    const tile = (x, y, fill) => `<rect x="${x}" y="${y}" width="150" height="150" rx="38" fill="${fill}"/>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${back}${tile(96, 96, '#fff')}${tile(266, 96, GOLD)}${tile(96, 266, '#fff')}${tile(266, 266, '#fff')}</svg>`;
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">${back}<defs><linearGradient id="orbit-planet" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e0e7ff"/><stop offset="1" stop-color="#a5b4fc"/></linearGradient></defs><ellipse cx="256" cy="256" rx="220" ry="80" transform="rotate(-24 256 256)" fill="none" stroke="#fff" stroke-opacity="0.45" stroke-width="20"/><circle cx="256" cy="256" r="130" fill="url(#orbit-planet)"/><ellipse cx="256" cy="256" rx="220" ry="80" transform="rotate(-24 256 256)" fill="none" stroke="#fff" stroke-width="20" stroke-dasharray="0 330 420 2000" stroke-linecap="round"/><circle cx="440" cy="150" r="26" fill="#fff"/></svg>`;
}

export const familyOf = id => FAMILIES[of(id)?.family] || FAMILIES.quadra;

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
  playLive: { def: 5, min: 3, max: 120, unit: 's', group: 'play', zh: 'Play 即時比分與兌現', en: 'Play live scores', note: 'Quadra Play 有比賽進行中的注單、即時盤' },
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
export const DEV_GROUPS = { proxy: '代理（sports-proxy）', sports: 'Orbit Sports', f1: 'F1', play: 'Quadra Play', transit: 'Orbit Transit（TDX）', scale: '容量', data: '資料' };

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


// Each app's colour as quadra.css sets it under <html data-app="id"> (the
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

// <html data-app="id">: the app's colour from the first paint (quadra.css).
export function withApp(html, id) {
  return html.replace(/<html\b([^>]*)>/i, (tag, attrs) => (/\sdata-app=/.test(attrs) ? tag.replace(/\sdata-app=(["'])[^"']*\1/, ` data-app="${id}"`) : `<html${attrs} data-app="${id}">`));
}
