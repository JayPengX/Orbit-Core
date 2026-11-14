// Share cards (link previews and stories) for each app, its family and the
// Orbit Pass, as HTML pages brand/generate.mjs photographs. The marks,
// names and colours are the kit's (kit/brand.mjs).
import { execFileSync } from 'node:child_process';
import { BRANDS, PASS, APP_ORDER, ORBIT_PALETTES, appIcon, familyMark } from '../kit/brand.mjs';

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

// Whose card: an app id, 'pass', or 'family' (Orbit itself: the home of every
// app, orbit.<domain>/ and /app/). Orbit Class's own id is 'orbit'.
function subject(id) {
  // (A card of its own, as { short, icon, paint, pitch, brand }: the showcase, Jay's homepage.)
  if (id && typeof id === 'object') return { brand: '', ...id };
  if (id === 'family') return { short: 'Orbit', icon: familyMark({ shape: 'rounded' }), paint: ORBIT_PALETTES.find(p => p.id === 'night').bg, pitch: { zh: '每天用得到的 App，都在這裡' }, brand: '' };
  const a = id === 'pass' ? PASS : BRANDS[id];
  return { short: a.short, icon: appIcon(id), paint: a.paint, pitch: a.pitch, brand: 'ORBIT' };
}
// The family's moons (kit/brand.mjs), big and faint across a card.
const moons = () => {
  const n = APP_ORDER.length, step = 360 / n, r = 200;
  const at = d => [256 + r * Math.cos((d * Math.PI) / 180), 256 + r * Math.sin((d * Math.PI) / 180)].map(x => x.toFixed(1)).join(' ');
  return APP_ORDER.map((_, j) => `<path d="M${at(-90 + j * step + 9)} A${r} ${r} 0 0 1 ${at(-90 + (j + 1) * step - 9)}" fill="none" stroke="#fff" stroke-opacity=".13" stroke-width="22" stroke-linecap="round"/>`).join('');
};

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
  // The family's ring of moons (its new mark, 2026-11-14), big and faint behind.
  const motif = `<svg class="motif" viewBox="0 0 512 512">${moons()}</svg>`;
  // (Circling the icon, clear of the words: centre and radius per format.)
  const [cx, cy, r] = stacked ? [600, 435, 310] : format === 'x' ? [260, 300, 240] : [270, 315, 250];
  const side = Math.round((r * 512) / 200);
  const motifCss = `width:${side}px;left:${cx - side / 2}px;top:${cy - side / 2}px`;
  const name = stacked ? 150 : 168;
  return `<!doctype html><html><head><meta charset="utf-8">
<style>${fontCss(`${s.short}${s.pitch.zh}${s.brand}`)}
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
<div class="wrap"><img class="icon" src="${b64(s.icon)}"><div class="text">${s.brand ? `<div class="brand">${s.brand}</div>` : ''}<h1>${esc(s.short)}</h1><p class="pitch">${esc(s.pitch.zh)}</p></div></div>
<script>window.fitted = document.fonts.ready.then(() => { for (const el of document.querySelectorAll('h1,.pitch')) { let f = parseFloat(getComputedStyle(el).fontSize); while (el.scrollWidth > el.parentNode.clientWidth && f > 20) el.style.fontSize = (f -= 2) + 'px'; } });</script>
</body></html>`;
}
