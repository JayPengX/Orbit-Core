// Share cards (link previews and stories) for each app, its family and the
// Quadra Pass, as HTML pages brand/generate.mjs photographs. The marks,
// names and colours are the kit's (kit/brand.mjs).
import { execFileSync } from 'node:child_process';
import { BRANDS, FAMILIES, PASS, appIcon, familyMark, homeOf } from '../kit/brand.mjs';

// The cards' fonts (Inter, Noto Sans TC), cut by Google Fonts to the
// characters a card uses and put inside it, so the picture never waits on
// (or misses) a download. curl, which goes through this machine's proxy.
const fonts = new Map();
function fontCss(text) {
  const chars = [...new Set(text)].sort().join('');
  if (fonts.has(chars)) return fonts.get(chars);
  const get = (url, binary = false) => execFileSync('curl', ['-sSfL', '-A', 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/124 Safari/537.36', url], { encoding: binary ? 'buffer' : 'utf8', maxBuffer: 64 << 20 });
  let css = '';
  for (const family of ['Inter:wght@500;600;700;800;900', 'Noto+Sans+TC:wght@500;700;900']) {
    try {
      css += get(`https://fonts.googleapis.com/css2?family=${family}&text=${encodeURIComponent(chars)}&display=block`);
    } catch {}
  }
  css = css.replace(/url\((https:[^)]+)\)/g, (_, url) => {
    try {
      return `url(data:font/woff2;base64,${get(url, true).toString('base64')})`;
    } catch {
      return 'url()';
    }
  });
  fonts.set(chars, css);
  return css;
}

// The sizes each place asks for:
//   og      1200×630   Facebook, LINE, Messenger, LinkedIn, Discord, Slack,
//                      Telegram, iMessage (og:image)
//   square  1200×1200  WhatsApp, WeChat and chat apps' small square previews
//                      (the second og:image)
//   x       1200×600   X / Twitter's large card (twitter:image, 2:1)
//   story   1080×1920  Instagram, Threads, Facebook and LINE stories (posted
//                      by hand, not a meta tag)
export const FORMATS = {
  og: { w: 1200, h: 630, file: 'og.jpg' },
  square: { w: 1200, h: 1200, file: 'square.jpg' },
  x: { w: 1200, h: 600, file: 'x.jpg' },
  story: { w: 1080, h: 1920, file: 'story.jpg' }
};

const b64 = svg => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// Whose card: an app id, 'pass', or a family ('family:quadra',
// 'family:orbit'; Orbit Class's own id is 'orbit').
function subject(id) {
  if (id.startsWith('family:')) {
    id = id.slice(7);
    const f = FAMILIES[id];
    const apps = Object.entries(BRANDS).filter(([, b]) => b.family === id);
    return { family: id, name: f.name, icon: familyMark(id), from: f.from, to: f.to, tag: f.tag, url: 'jaypengx.github.io/Shared-Proxy', apps };
  }
  const a = id === 'pass' ? PASS : BRANDS[id];
  return { family: a.family, name: a.name, icon: appIcon(id), from: a.from, to: a.to, tag: a.tag, url: id === 'pass' ? 'jaypengx.github.io/Shared-Proxy' : homeOf(id).replace(/^https:\/\//, '').replace(/\/$/, '') };
}

export function shareCard(id, format = 'og') {
  const { w, h } = FORMATS[format];
  const s = subject(id);
  const fam = FAMILIES[s.family];
  const tall = format === 'story';
  const stacked = tall || format === 'square';
  const k = tall ? 1.25 : 1;
  // The family's own sign, big and faint behind the card: Quadra's four
  // tiles, Orbit's ring.
  const motif =
    s.family === 'quadra'
      ? `<svg class="motif" viewBox="0 0 512 512"><rect x="96" y="96" width="150" height="150" rx="38" fill="#fff" fill-opacity=".06"/><rect x="266" y="96" width="150" height="150" rx="38" fill="${fam.accent}" fill-opacity=".22"/><rect x="96" y="266" width="150" height="150" rx="38" fill="#fff" fill-opacity=".06"/><rect x="266" y="266" width="150" height="150" rx="38" fill="#fff" fill-opacity=".06"/></svg>`
      : `<svg class="motif" viewBox="0 0 512 512"><ellipse cx="256" cy="256" rx="236" ry="86" transform="rotate(-24 256 256)" fill="none" stroke="#fff" stroke-opacity=".14" stroke-width="6"/><circle cx="472" cy="160" r="12" fill="#fff" fill-opacity=".5"/></svg>`;
  const apps = s.apps ? `<div class="apps">${s.apps.map(([aid, b]) => `<span><img src="${b64(appIcon(aid))}">${esc(b.name.replace(/^(Quadra|Orbit) /, ''))}</span>`).join('')}</div>` : '';
  const badge = `<div class="badge"><img src="${b64(familyMark(s.family))}">${s.family === 'quadra' ? 'QUADRA' : 'ORBIT'}</div>`;
  const motifCss = tall ? 'width:1500px;right:-520px;top:-160px' : stacked ? 'width:1100px;right:-380px;top:-300px' : 'width:980px;right:-300px;top:-200px';
  return `<!doctype html><html><head><meta charset="utf-8">
<style>${fontCss(`${s.name}${s.tag.en}${s.tag.zh}${s.url}${fam.tag.en}QUADRAORBIT${(s.apps || []).map(([, b]) => b.name).join('')}`)}
*{box-sizing:border-box;margin:0}
body{width:${w}px;height:${h}px;overflow:hidden;position:relative;color:#fff;font-family:Inter,'Noto Sans TC',system-ui,sans-serif;
  background:radial-gradient(${Math.round(w * 0.9)}px ${Math.round(h * 0.9)}px at 0% 0%, ${s.from}cc, transparent 70%),linear-gradient(${stacked ? 160 : 125}deg, ${s.to} 0%, #020617 88%)}
.motif{position:absolute;${motifCss}}
.wrap{position:absolute;inset:0;display:flex;${stacked ? `flex-direction:column;justify-content:center;padding:0 ${96 * k}px;gap:${48 * k}px` : 'align-items:center;padding:0 88px;gap:64px'}}
.icon{width:${tall ? 400 : stacked ? 300 : 280}px;height:${tall ? 400 : stacked ? 300 : 280}px;flex:none;border-radius:${tall ? 92 : 64}px;box-shadow:0 30px 70px rgba(0,0,0,.45)}
.badge{display:flex;align-items:center;gap:${14 * k}px;font-weight:800;font-size:${26 * k}px;letter-spacing:.32em;opacity:.85}
.badge img{width:${40 * k}px;height:${40 * k}px;border-radius:${10 * k}px}
h1{font-weight:900;font-size:${(tall ? 120 : stacked ? 112 : format === 'x' ? 84 : 92) * 1}px;line-height:1.02;letter-spacing:-.02em;margin-top:${16 * k}px}
.en{font-size:${(stacked ? 44 : 34) * k}px;font-weight:700;opacity:.92;margin-top:${22 * k}px;line-height:1.3;max-width:${stacked ? 1000 : 700}px}
.zh{font-family:'Noto Sans TC',sans-serif;font-size:${(stacked ? 38 : 30) * k}px;font-weight:500;opacity:.72;margin-top:${12 * k}px;line-height:1.45;max-width:${stacked ? 1000 : 700}px}
.apps{display:flex;flex-wrap:wrap;gap:${14 * k}px;margin-top:${30 * k}px}
.apps span{display:flex;align-items:center;gap:10px;font-size:${(stacked ? 30 : 24) * k}px;font-weight:700;background:rgba(255,255,255,.1);border-radius:999px;padding:8px 20px 8px 8px}
.apps img{width:${(stacked ? 48 : 40) * k}px;height:${(stacked ? 48 : 40) * k}px;border-radius:${12 * k}px}
.foot{position:absolute;left:${(stacked ? 96 : 88) * k}px;right:${(stacked ? 96 : 88) * k}px;bottom:${(tall ? 120 : stacked ? 80 : 44)}px;display:flex;justify-content:space-between;align-items:center;font-size:${(stacked ? 30 : 24) * k}px;font-weight:600;opacity:.7;gap:32px}
.foot span{white-space:nowrap}${stacked ? '.foot{flex-direction:column;align-items:flex-start;gap:10px}' : ''}
</style></head><body>${motif}
<div class="wrap"><img class="icon" src="${b64(s.icon)}"><div>${badge}<h1>${esc(s.name)}</h1><p class="en">${esc(s.tag.en)}</p><p class="zh">${esc(s.tag.zh)}</p>${apps}</div></div>
<div class="foot"><span>${esc(s.url)}</span><span>${s.family === 'quadra' ? '' : esc(fam.tag.en)}</span></div>
</body></html>`;
}
