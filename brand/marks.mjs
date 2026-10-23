// Share cards (link previews and stories) for each app, its family and the
// Orbit Pass, as HTML pages brand/generate.mjs photographs. The marks,
// names and colours are the kit's (kit/brand.mjs).
import { execFileSync } from 'node:child_process';
import { BRANDS, PASS, appIcon } from '../kit/brand.mjs';

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
export const FORMATS = {
  og: { w: 1200, h: 630, file: 'og.jpg' },
  square: { w: 1200, h: 1200, file: 'square.jpg' },
  x: { w: 1200, h: 600, file: 'x.jpg' }
};

const b64 = svg => `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
const esc = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;');

// Whose card: an app id or 'pass' (Orbit Class's own id is 'orbit').
function subject(id) {
  const a = id === 'pass' ? PASS : BRANDS[id];
  return { short: a.short, icon: appIcon(id), paint: a.paint, pitch: a.pitch };
}

// A card is read as a chat's small preview (a link card about 250 px wide,
// a square thumbnail smaller still), so it says three things, big: the
// icon, the app's name and one short line. No addresses, no sentences.
// A name or line too wide for the card is made smaller once the fonts are
// in (window.fitted, which generate.mjs waits for).
export function shareCard(id, format = 'og') {
  const { w, h } = FORMATS[format];
  const s = subject(id);
  const [hi, mid, lo] = s.paint;
  const stacked = format === 'square';
  const icon = stacked ? 500 : format === 'x' ? 340 : 360;
  // The family's ring, big and faint across the card, and its moon.
  const motif = `<svg class="motif" viewBox="0 0 512 512"><ellipse cx="256" cy="256" rx="236" ry="92" transform="rotate(-24 256 256)" fill="none" stroke="#fff" stroke-opacity=".16" stroke-width="5"/><circle cx="424" cy="131" r="10" fill="#fff" fill-opacity=".7"/></svg>`;
  const motifCss = stacked ? 'width:1500px;left:-150px;top:-120px' : 'width:1500px;left:-60px;top:-430px';
  const name = stacked ? 150 : 168;
  return `<!doctype html><html><head><meta charset="utf-8">
<style>${fontCss(`${s.short}${s.pitch.zh}ORBIT`)}
*{box-sizing:border-box;margin:0}
body{width:${w}px;height:${h}px;overflow:hidden;position:relative;color:#fff;font-family:Inter,'Noto Sans TC',system-ui,sans-serif;
  background:radial-gradient(${Math.round(w * 0.8)}px ${Math.round(h * 0.8)}px at 0% 0%, ${hi}, transparent 75%),linear-gradient(${stacked ? 170 : 120}deg, ${mid} 0%, ${lo} 100%)}
.motif{position:absolute;${motifCss}}
.wrap{position:absolute;inset:0;display:flex;${stacked ? 'flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:0 80px;gap:56px' : 'align-items:center;padding:0 90px;gap:72px'}}
.icon{width:${icon}px;height:${icon}px;flex:none;border-radius:${Math.round(icon * 0.225)}px;box-shadow:0 34px 80px rgba(0,0,0,.4),0 0 0 4px rgba(255,255,255,.18)}
.text{min-width:0;flex:${stacked ? 'none;width:100%' : 1}}
.brand{font-weight:800;font-size:${stacked ? 44 : 42}px;letter-spacing:.3em;opacity:.8}
h1{font-weight:900;font-size:${name}px;line-height:1;letter-spacing:-.035em;margin-top:10px;white-space:nowrap}
.pitch{font-family:'Noto Sans TC',sans-serif;font-weight:900;font-size:${stacked ? 72 : 62}px;line-height:1.2;margin-top:26px;white-space:nowrap;text-shadow:0 2px 12px rgba(0,0,0,.25)}
</style></head><body>${motif}
<div class="wrap"><img class="icon" src="${b64(s.icon)}"><div class="text"><div class="brand">ORBIT</div><h1>${esc(s.short)}</h1><p class="pitch">${esc(s.pitch.zh)}</p></div></div>
<script>window.fitted = document.fonts.ready.then(() => { for (const el of document.querySelectorAll('h1,.pitch')) { let f = parseFloat(getComputedStyle(el).fontSize); while (el.scrollWidth > el.parentNode.clientWidth && f > 20) el.style.fontSize = (f -= 2) + 'px'; } });</script>
</body></html>`;
}
