// Quadra: the brand's marks, as SVG strings. One mark for the whole family
// (four tiles, one per app) and one icon per app: the same four tiles on the
// app's own colour, its own tile solid white with its symbol. Orbit Class,
// the related add-on, has its own mark on the same tile.
export const APPS = {
  stock: { en: 'Quadra Securities', short: 'Securities', tag: 'Invest in markets worldwide with play money', tagZh: '全球股市模擬投資：真實報價、換匯與融資', from: '#2dd4bf', to: '#0f3d5c', ink: '#0f766e', tile: 0, repo: 'Quadra-Securities' },
  odds: { en: 'Quadra Play', short: 'Play', tag: 'Sports bets and the lottery, with the maths shown', tagZh: '運彩與彩券：每一注的數學都看得見', from: '#60a5fa', to: '#1e3a8a', ink: '#1d4ed8', tile: 1, repo: 'Quadra-Play' },
  match: { en: 'Quadra Fixtures', short: 'Fixtures', tag: 'Every sport, every match, every stat', tagZh: '所有運動的賽程、比分與數據', from: '#fdba74', to: '#9a3412', ink: '#c2410c', tile: 2, repo: 'Quadra-Fixtures' },
  vocab: { en: 'Quadra Hub', short: 'Hub', tag: 'Learn words, manage your pass, see where the money goes', tagZh: '背單字、管理帳戶，看清楚錢怎麼流', from: '#c4b5fd', to: '#3b0764', ink: '#6d28d9', tile: 3, repo: 'Quadra-Rewards' },
  orbit: { en: 'Orbit Class', short: 'Orbit Class', tag: 'Your class schedule, live, with Quadra', tagZh: '即時課表，加入 Quadra', from: '#7dd3fc', to: '#0c4a6e', ink: '#0369a1', repo: 'Orbit-Class', related: true }
};

// Each app's symbol, drawn in a 128×128 tile, in `c`.
const GLYPH = {
  stock: c => `<path d="M22 96 L52 64 L72 80 L106 40" fill="none" stroke="${c}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/><path d="M82 38 L108 36 L106 62" fill="none" stroke="${c}" stroke-width="13" stroke-linecap="round" stroke-linejoin="round"/>`,
  // A play button inside a ticket.
  odds: c => `<path d="M20 36 H108 V54 A10 10 0 0 0 108 74 V92 H20 V74 A10 10 0 0 0 20 54 Z" fill="none" stroke="${c}" stroke-width="10" stroke-linejoin="round"/><path d="M54 48 L82 64 L54 80 Z" fill="${c}" stroke="${c}" stroke-width="6" stroke-linejoin="round"/>`,
  match: c => `<rect x="24" y="32" width="80" height="72" rx="14" fill="none" stroke="${c}" stroke-width="11"/><path d="M24 56 H104" stroke="${c}" stroke-width="11"/><path d="M46 22 V40 M82 22 V40" stroke="${c}" stroke-width="11" stroke-linecap="round"/><circle cx="64" cy="80" r="9" fill="${c}"/>`,
  // An open book.
  vocab: c => `<path d="M64 38 C52 28 34 26 18 30 V100 C34 96 52 98 64 108 C76 98 94 96 110 100 V30 C94 26 76 28 64 38 Z" fill="none" stroke="${c}" stroke-width="10" stroke-linejoin="round"/><path d="M64 38 V106" stroke="${c}" stroke-width="10" stroke-linecap="round"/>`
};
const ORDER = ['stock', 'odds', 'match', 'vocab'];
const POS = [[116, 116], [268, 116], [116, 268], [268, 268]];

// Orbit Class, the related add-on: its own mark (an orbit round a class
// period) on the Quadra tile shape, with the family's four tiles small in a
// corner, so it reads as a partner of Quadra rather than one of the four.
function orbitIcon({ rounded = true } = {}) {
  const a = APPS.orbit;
  const mini = ORDER.map((id, i) => `<rect x="${360 + (i % 2) * 44}" y="${360 + Math.floor(i / 2) * 44}" width="38" height="38" rx="10" fill="#fff" fill-opacity="${i === 0 ? 0.9 : 0.35}"/>`).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="q-orbit-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a.from}"/><stop offset="1" stop-color="${a.to}"/></linearGradient>
    <radialGradient id="q-orbit-hl" cx="0.22" cy="0.15" r="0.85"><stop offset="0" stop-color="#fff" stop-opacity="0.28"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
  </defs>
  <rect width="512" height="512" rx="${rounded ? 116 : 0}" fill="url(#q-orbit-bg)"/>
  <rect width="512" height="512" rx="${rounded ? 116 : 0}" fill="url(#q-orbit-hl)"/>
  <ellipse cx="236" cy="236" rx="176" ry="74" transform="rotate(-28 236 236)" fill="none" stroke="#fff" stroke-width="22" stroke-opacity="0.9"/>
  <rect x="166" y="166" width="140" height="140" rx="34" fill="#fff"/>
  <path d="M200 214 H272 M200 246 H256 M200 278 H240" stroke="${a.ink}" stroke-width="16" stroke-linecap="round"/>
  <circle cx="392" cy="150" r="26" fill="#fff"/>
  ${mini}
</svg>`;
}

export function appIcon(id, { rounded = true } = {}) {
  if (id === 'orbit') return orbitIcon({ rounded });
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
  p{font-size:${square ? 40 : 32}px;line-height:1.45;opacity:.85;margin-top:26px;max-width:${square ? 1000 : 700}px}p.zh{margin-top:8px;opacity:.7;font-size:${square ? 34 : 28}px}
  .foot span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.foot span:first-child{flex:none}.foot{gap:40px;position:absolute;left:${square ? 96 : 80}px;right:${square ? 96 : 80}px;bottom:${square ? 90 : 48}px;display:flex;justify-content:space-between;font-size:26px;opacity:.7}
  </style></head><body><div class="wrap"><img class="icon" src="data:image/svg+xml;base64,${Buffer.from(appIcon(id)).toString('base64')}"><div>
  <div class="brand"><span class="dots">${dots}</span>${a.related ? 'WITH QUADRA' : 'QUADRA'}</div><h1>${a.en}</h1><p>${a.tag}</p><p class="zh">${a.tagZh}</p></div></div>
  <div class="foot"><span>jaypengx.github.io/${a.repo}</span></div></body></html>`;
}
