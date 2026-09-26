// Quadra 四方: the brand's marks, as SVG strings. One mark for the whole
// family (four tiles, one per app) and one icon per app: the same four
// tiles on the app's own colour, its own tile solid white with its symbol.
export const APPS = {
  stock: { zh: '四方證券', en: 'Quadra Securities', tagZh: '全球股市模擬交易：真實報價、真實手續費、換匯與融資', tagEn: 'A play-money brokerage for markets worldwide', from: '#2dd4bf', to: '#0f3d5c', ink: '#0f766e', tile: 0, repo: 'Stock-Study' },
  odds: { zh: '四方運彩', en: 'Quadra Sportsbook', tagZh: '用數學看運彩：公平機率、估計賠率、模擬下注', tagEn: 'Sports lottery odds, the maths and a practice account', from: '#60a5fa', to: '#1e3a8a', ink: '#1d4ed8', tile: 1, repo: 'Odds-Study' },
  match: { zh: '四方賽程', en: 'Quadra Fixtures', tagZh: '今晚看什麼：依精彩程度排好的賽程', tagEn: 'What\'s worth watching, planned in your own time', from: '#fbbf24', to: '#9a3412', ink: '#c2410c', tile: 2, repo: 'Match-Find' },
  vocab: { zh: '四方單字', en: 'Quadra Words', tagZh: '高中英文 Level 4–6 聽寫與複習，答對還能賺錢', tagEn: 'High-school English words, dictation and review', from: '#a5b4fc', to: '#312e81', ink: '#4f46e5', tile: 3, repo: 'Orbit-Vocab' }
};

// Each app's symbol, drawn in a 128×128 tile, in `c`.
const GLYPH = {
  stock: c => `<path d="M22 96 L52 64 L72 80 L106 40" fill="none" stroke="${c}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/><path d="M82 38 L108 36 L106 62" fill="none" stroke="${c}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>`,
  odds: c => `<circle cx="42" cy="42" r="16" fill="none" stroke="${c}" stroke-width="12"/><circle cx="86" cy="86" r="16" fill="none" stroke="${c}" stroke-width="12"/><path d="M92 30 L36 98" stroke="${c}" stroke-width="13" stroke-linecap="round"/>`,
  match: c => `<rect x="24" y="32" width="80" height="72" rx="14" fill="none" stroke="${c}" stroke-width="11"/><path d="M24 56 H104" stroke="${c}" stroke-width="11"/><path d="M46 22 V40 M82 22 V40" stroke="${c}" stroke-width="11" stroke-linecap="round"/><circle cx="64" cy="80" r="9" fill="${c}"/>`,
  vocab: c => `<path d="M30 104 L58 26 H70 L98 104" fill="none" stroke="${c}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/><path d="M42 76 H86" stroke="${c}" stroke-width="12" stroke-linecap="round"/>`
};
const ORDER = ['stock', 'odds', 'match', 'vocab'];
const POS = [[116, 116], [268, 116], [116, 268], [268, 268]];

export function appIcon(id, { rounded = true } = {}) {
  const a = APPS[id];
  const tiles = ORDER.map((other, i) => {
    const [x, y] = POS[i];
    if (other !== id) return `<rect x="${x}" y="${y}" width="128" height="128" rx="30" fill="#fff" fill-opacity="0.26"/>`;
    return `<rect x="${x}" y="${y}" width="128" height="128" rx="30" fill="#fff"/><g transform="translate(${x} ${y})">${GLYPH[id](a.ink)}</g>`;
  }).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="q-${id}-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a.from}"/><stop offset="1" stop-color="${a.to}"/></linearGradient>
    <radialGradient id="q-${id}-hl" cx="0.22" cy="0.15" r="0.85"><stop offset="0" stop-color="#fff" stop-opacity="0.28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="512" height="512" rx="${rounded ? 116 : 0}" fill="url(#q-${id}-bg)"/>
  <rect width="512" height="512" rx="${rounded ? 116 : 0}" fill="url(#q-${id}-hl)"/>
  ${tiles}
</svg>`;
}

// The family's own mark: the four tiles in the four apps' colours.
export function quadraMark() {
  const tiles = ORDER.map((id, i) => {
    const [x, y] = POS[i];
    const a = APPS[id];
    return `<rect x="${x}" y="${y}" width="128" height="128" rx="30" fill="url(#qm-${id})"/><g transform="translate(${x} ${y})">${GLYPH[id]('#fff')}</g>`;
  }).join('');
  const grads = ORDER.map(id => `<linearGradient id="qm-${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${APPS[id].from}"/><stop offset="1" stop-color="${APPS[id].to}"/></linearGradient>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512"><defs>${grads}</defs><rect width="512" height="512" rx="116" fill="#0b1020"/>${tiles}</svg>`;
}

// A link preview card (1200×630, or 1200×1200 square) for an app.
export function shareCard(id, { square = false } = {}) {
  const a = APPS[id];
  const h = square ? 1200 : 630;
  const dots = ORDER.map(o => `<span style="background:linear-gradient(135deg,${APPS[o].from},${APPS[o].to})"></span>`).join('');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0}
  body{width:1200px;height:${h}px;overflow:hidden;font-family:'Noto Sans TC','PingFang TC','Noto Sans CJK TC',system-ui,sans-serif;color:#fff;
    background:radial-gradient(900px 600px at 85% 10%, ${a.from}55, transparent 60%), linear-gradient(135deg, ${a.to} 0%, #0b1020 75%);}
  .wrap{position:absolute;inset:0;padding:${square ? '120px 96px' : '72px 80px'};display:flex;flex-direction:${square ? 'column' : 'row'};gap:${square ? 56 : 64}px;align-items:${square ? 'flex-start' : 'center'}}
  .icon{width:${square ? 300 : 300}px;height:${square ? 300 : 300}px;flex:none;filter:drop-shadow(0 24px 48px rgba(0,0,0,.35))}
  .brand{font-size:30px;letter-spacing:.3em;font-weight:800;opacity:.8;display:flex;align-items:center;gap:14px}
  .dots{display:flex;gap:8px}.dots span{width:18px;height:18px;border-radius:6px;display:block}
  h1{font-size:${square ? 112 : 96}px;font-weight:900;line-height:1.05;margin-top:18px}
  h2{font-size:${square ? 52 : 44}px;font-weight:700;opacity:.9;margin-top:10px}
  p{font-size:${square ? 40 : 32}px;line-height:1.45;opacity:.82;margin-top:26px;max-width:${square ? 1000 : 700}px}
  .foot span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.foot span:first-child{flex:none}.foot{gap:40px;position:absolute;left:${square ? 96 : 80}px;right:${square ? 96 : 80}px;bottom:${square ? 90 : 48}px;display:flex;justify-content:space-between;font-size:26px;opacity:.7}
  </style></head><body><div class="wrap"><img class="icon" src="data:image/svg+xml;base64,${Buffer.from(appIcon(id)).toString('base64')}"><div>
  <div class="brand"><span class="dots">${dots}</span>四方 QUADRA</div><h1>${a.zh}</h1><h2>${a.en}</h2><p>${a.tagZh}</p></div></div>
  <div class="foot"><span>jaypengx.github.io/${a.repo}</span><span>${a.tagEn}</span></div></body></html>`;
}
