// Sharing a link, in every app: the share sheet with its QR code, the
// person's own (colours, the dots' and corners' shape, a centre icon or
// photo, the margin), saved as PNG or SVG for print. Loaded when first
// opened (orbit.mjs shareSheet).
//
//   shareSheet({ url, title, app, icon, lang })
//     url: what's shared; title: its name (the system share's title, the
//     files' name); app: whose icon goes in the middle and whose colour the
//     sheet takes (a kit id, or '' for the family's); icon: an SVG or image
//     URL instead of the app's icon.
//   qrSvg(text, style) → { svg, plate }, qrPng(text, style, logo, px) → a PNG blob:
//     the code alone, for a page of its own.
//
// Codes that scan: error correction H whenever something covers the middle
// (30% of the code can be lost; the icon covers under 8%), Q otherwise; the
// quiet margin never under 2 modules; the three corner squares are never
// covered; and a colour pair too close, or light dots on a dark ground
// (many cameras read only dark on light), is said under the code.
import qrcode from './qrcode.mjs';
import { appIcon, BRANDS } from './brand.mjs';
import { h, sheet, toast } from './ui.mjs';

// ---- The code ---------------------------------------------------------------------------------

export const QR_DOTS = ['square', 'round', 'dots'];
export const QR_CORNERS = ['square', 'round', 'circle'];
export const QR_MARGINS = [2, 4, 6];
export const QR_DEFAULT = { fg: '#000000', bg: '#ffffff', dots: 'square', corners: 'square', logo: 'icon', margin: 4 };
// The icon's share of the code's width (its white plate a module wider each side).
const LOGO = 0.22;

// The modules of `text` (UTF-8, so Chinese in a link reads the same),
// as rows of booleans.
export function qrMatrix(text, ecc = 'Q') {
  const qr = qrcode(0, ecc);
  qr.addData(unescape(encodeURIComponent(String(text))), 'Byte');
  qr.make();
  const n = qr.getModuleCount();
  return Array.from({ length: n }, (_, r) => Array.from({ length: n }, (_, c) => qr.isDark(r, c)));
}

const num = x => +x.toFixed(3);
// One module as a square whose corners round only where nothing joins it.
function roundModule(x, y, dark) {
  const r = 0.5;
  const up = dark(-1, 0);
  const down = dark(1, 0);
  const left = dark(0, -1);
  const right = dark(0, 1);
  const tl = !up && !left;
  const tr = !up && !right;
  const br = !down && !right;
  const bl = !down && !left;
  return (
    `M${x + (tl ? r : 0)} ${y}` +
    `H${x + 1 - (tr ? r : 0)}` +
    (tr ? `A${r} ${r} 0 0 1 ${x + 1} ${y + r}` : '') +
    `V${y + 1 - (br ? r : 0)}` +
    (br ? `A${r} ${r} 0 0 1 ${x + 1 - r} ${y + 1}` : '') +
    `H${x + (bl ? r : 0)}` +
    (bl ? `A${r} ${r} 0 0 1 ${x} ${y + 1 - r}` : '') +
    `V${y + (tl ? r : 0)}` +
    (tl ? `A${r} ${r} 0 0 1 ${x + r} ${y}` : '') +
    'Z'
  );
}
// A rounded square (r 0: square; r half the side: a circle) as path data.
function roundRect(x, y, s, r) {
  if (!r) return `M${x} ${y}h${s}v${s}h${-s}Z`;
  const k = s - 2 * r;
  return `M${num(x + r)} ${y}h${num(k)}a${r} ${r} 0 0 1 ${r} ${r}v${num(k)}a${r} ${r} 0 0 1 ${-r} ${r}h${num(-k)}a${r} ${r} 0 0 1 ${-r} ${-r}v${num(-k)}a${r} ${r} 0 0 1 ${r} ${-r}Z`;
}
// A corner square (7 modules): its ring and its centre.
function finder(x, y, corners) {
  const [outer, inner, eye] = corners === 'circle' ? [3.5, 2.5, 1.5] : corners === 'round' ? [2.2, 1.5, 1] : [0, 0, 0];
  return { ring: roundRect(x, y, 7, outer) + roundRect(x + 1, y + 1, 5, inner), eye: roundRect(x + 2, y + 2, 3, eye) };
}

const esc = s => String(s).replace(/[&<>"]/g, c => `&#${c.charCodeAt(0)};`);
const color = (c, fallback) => (/^#[0-9a-f]{6}$/i.test(String(c || '')) ? String(c).toLowerCase() : fallback);

// The code as SVG, in its own units (one module = 1). style: QR_DEFAULT's
// keys; logo: an image URL for the middle ('' none). plate: where the
// middle is, as shares of the side ({ x, y, size }, null without one), for
// a PNG that draws the image itself.
export function qrSvg(text, { fg, bg, dots, corners, margin, logo = '' } = {}) {
  fg = color(fg, QR_DEFAULT.fg);
  bg = color(bg, QR_DEFAULT.bg);
  dots = QR_DOTS.includes(dots) ? dots : QR_DEFAULT.dots;
  corners = QR_CORNERS.includes(corners) ? corners : QR_DEFAULT.corners;
  const m = Math.max(2, Math.min(8, Math.round(Number.isFinite(Number(margin)) && margin !== '' && margin != null ? Number(margin) : QR_DEFAULT.margin)));
  const grid = qrMatrix(text, logo ? 'H' : 'Q');
  const n = grid.length;
  const side = n + 2 * m;
  const isFinder = (r, c) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
  // The middle: an odd number of modules, on the grid, so it covers whole ones.
  let hole = null;
  if (logo) {
    let k = Math.round(n * LOGO);
    if (k % 2 !== n % 2) k += 1;
    const p = k + 2;
    const at = (n - p) / 2;
    hole = { at, p, k };
  }
  const covered = (r, c) => hole && r >= hole.at && r < hole.at + hole.p && c >= hole.at && c < hole.at + hole.p;
  const on = (r, c) => r >= 0 && c >= 0 && r < n && c < n && grid[r][c] && !isFinder(r, c) && !covered(r, c);
  let d = '';
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (!on(r, c)) continue;
      const x = c + m;
      const y = r + m;
      if (dots === 'square') {
        // A run of dark modules in one row as one rectangle (no seams between them).
        let e = c;
        while (on(r, e + 1)) e++;
        d += `M${x} ${y}h${e - c + 1}v1h${-(e - c + 1)}Z`;
        c = e;
      } else if (dots === 'dots') d += `M${x} ${y + 0.5}a0.5 0.5 0 1 0 1 0a0.5 0.5 0 1 0 -1 0Z`;
      else d += roundModule(x, y, (dr, dc) => on(r + dr, c + dc));
    }
  }
  const eyes = [
    [m, m],
    [m + n - 7, m],
    [m, m + n - 7]
  ].map(([x, y]) => finder(x, y, corners));
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" width="${side * 8}" height="${side * 8}"${dots === 'square' && corners === 'square' ? ' shape-rendering="crispEdges"' : ''}>`,
    `<rect width="${side}" height="${side}" fill="${bg}"/>`,
    `<path fill="${fg}" d="${d}"/>`,
    `<path fill="${fg}" fill-rule="evenodd" d="${eyes.map(e => e.ring).join('')}"/>`,
    `<path fill="${fg}" d="${eyes.map(e => e.eye).join('')}"/>`
  ];
  let plate = null;
  if (hole) {
    const x = hole.at + m + 1;
    parts.push(`<image href="${esc(logo)}" x="${x}" y="${x}" width="${hole.k}" height="${hole.k}" preserveAspectRatio="xMidYMid meet"/>`);
    plate = { x: x / side, y: x / side, size: hole.k / side };
  }
  parts.push('</svg>');
  return { svg: parts.join(''), plate, modules: n, side };
}

// ---- Can it be read --------------------------------------------------------------------------

const lum = hex => {
  const v = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(x => (x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
  return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2];
};
export const contrast = (a, b) => {
  const [x, y] = [lum(color(a, '#000000')), lum(color(b, '#ffffff'))];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};
// What may stop a camera reading it: 'inverted' (light dots on dark),
// 'faint' (under 4:1), or ''.
export function qrRisk({ fg, bg } = {}) {
  fg = color(fg, QR_DEFAULT.fg);
  bg = color(bg, QR_DEFAULT.bg);
  if (lum(fg) > lum(bg)) return 'inverted';
  return contrast(fg, bg) < 4 ? 'faint' : '';
}

// ---- The sheet -------------------------------------------------------------------------------

const KEY = 'orbit.qrStyle';
const readStyle = () => {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) || 'null') || {};
    return { ...QR_DEFAULT, ...s, logo: s.logo === 'none' ? 'none' : 'icon' };
  } catch {
    return { ...QR_DEFAULT };
  }
};
const keepStyle = s => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ ...s, logo: s.logo === 'none' ? 'none' : 'icon' }));
  } catch {}
};
const svgUrl = svg => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
// Dark dots for a light ground: black, then each app's own deep colour.
const SWATCHES = ['#000000', ...['law', 'transit', 'match', 'vocab'].map(id => BRANDS[id]?.ink).filter(c => c && qrRisk({ fg: c, bg: '#ffffff' }) === '')].slice(0, 5);
const loadImage = src =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
const fileName = (title, url) =>
  `${String(title || '')
    .replace(/[\\/:*?"<>|\s]+/g, '-')
    .replace(/^-+|-+$/g, '') ||
  String(url)
    .replace(/^https?:\/\//, '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^-+|-+$/g, '')}-qr`;
// A photo for the middle, made square and small (it stays in the code's SVG).
async function photoUrl(file) {
  const img = await loadImage(URL.createObjectURL(file));
  const s = Math.min(img.naturalWidth, img.naturalHeight);
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, 256, 256);
  URL.revokeObjectURL(img.src);
  return c.toDataURL('image/png');
}
// The PNG, drawn on a canvas: the code without its middle, then the middle
// on its own (an SVG holding an image isn't drawn by every browser).
export async function qrPng(text, style, logo, px) {
  const { svg, plate } = qrSvg(text, { ...style, logo: logo ? 'x' : '' });
  const plain = svg.replace(/<image [^>]*\/>/, '');
  const c = document.createElement('canvas');
  c.width = c.height = px;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.drawImage(await loadImage(svgUrl(plain.replace(/width="\d+" height="\d+"/, `width="${px}" height="${px}"`))), 0, 0, px, px);
  if (plate && logo) {
    g.imageSmoothingEnabled = true;
    const img = await loadImage(logo);
    const s = plate.size * px;
    const r = Math.min(img.naturalWidth || s, img.naturalHeight || s);
    const w = ((img.naturalWidth || s) / r) * s;
    const hh = ((img.naturalHeight || s) / r) * s;
    // (meet: the whole image inside the square, centred)
    const k = Math.min(s / w, s / hh);
    g.drawImage(img, plate.x * px + (s - w * k) / 2, plate.y * px + (s - hh * k) / 2, w * k, hh * k);
  }
  return new Promise(resolve => c.toBlob(resolve, 'image/png'));
}
const phone = () => /iP(hone|ad|od)|Android/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
// Saved: a phone hands the file to its share sheet (Save Image, Files);
// a computer downloads it.
async function save(blob, name) {
  const file = new File([blob], name, { type: blob.type });
  if (phone() && navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      return true;
    } catch (e) {
      if (e?.name === 'AbortError') return false;
    }
  }
  const a = h('a', { href: URL.createObjectURL(blob), download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 30_000);
  return true;
}

export function shareSheet({ url, title = '', app = '', icon = '', lang = 'zh' } = {}) {
  const en = lang === 'en';
  const T = (zh, e) => (en ? e : zh);
  const style = readStyle();
  const iconUrl = icon ? (String(icon).trim().startsWith('<svg') ? svgUrl(icon) : icon) : svgUrl(appIcon(BRANDS[app] ? app : 'pass'));
  let photo = '';
  const logo = () => (style.logo === 'none' ? '' : style.logo === 'photo' && photo ? photo : iconUrl);
  const preview = h('div', { class: 'q-share-qr', role: 'img', 'aria-label': T(`${url} 的 QR code`, `QR code for ${url}`) });
  const warn = h('p', { class: 'q-share-warn', role: 'status' });
  const paint = () => {
    preview.innerHTML = qrSvg(url, { ...style, logo: logo() }).svg;
    const risk = qrRisk(style);
    warn.textContent = risk === 'inverted' ? T('淺色點配深色底，有些相機讀不到', 'Light dots on a dark ground: some cameras can’t read it') : risk === 'faint' ? T('兩個顏色太接近，可能掃不到', 'The colours are too close: it may not scan') : '';
    keepStyle(style);
  };
  const set = patch => {
    Object.assign(style, patch);
    paint();
    marks();
  };
  // The swatch on: a preset on white, else the custom one.
  const preset = () => style.bg === '#ffffff' && SWATCHES.includes(style.fg);
  const marks = () => swatchRow.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.fg ? preset() && b.dataset.fg === style.fg : !preset())));
  // A segmented row: its label, then the choice.
  const seg = (label, key, options) => {
    const box = h('div', { class: 'q-seg', role: 'group', 'aria-label': label });
    const buttons = options.map(([id, text]) =>
      h('button', {
        type: 'button',
        'aria-pressed': String(style[key] === id),
        text,
        onclick: () => {
          if (key === 'logo' && id === 'photo') return pick.click();
          buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(options[i][0] === id)));
          set({ [key]: id });
        }
      })
    );
    box.append(...buttons);
    return Object.assign(h('div', { class: 'q-share-row' }, [h('span', { text: label }), box]), { buttons });
  };
  const pick = h('input', { type: 'file', accept: 'image/*', hidden: true });
  const custom = (key, label) => {
    const input = h('input', { type: 'color', value: style[key], 'aria-label': label });
    input.addEventListener('input', () => set({ [key]: input.value }));
    return Object.assign(h('label', { class: 'q-share-color' }, [input, h('span', { text: label })]), { input });
  };
  const fgPick = custom('fg', T('點', 'Dots'));
  const bgPick = custom('bg', T('底', 'Ground'));
  const swatchRow = h(
    'div',
    { class: 'q-share-swatches', role: 'group', 'aria-label': T('顏色', 'Colour') },
    SWATCHES.map(c =>
      h('button', {
        type: 'button',
        class: 'q-share-swatch',
        'data-fg': c,
        style: `--sw:${c}`,
        'aria-label': c,
        onclick: () => {
          fgPick.input.value = c;
          bgPick.input.value = '#ffffff';
          customRow.hidden = true;
          set({ fg: c, bg: '#ffffff' });
        }
      })
    ).concat(
      // Any two colours: the dots' and the ground's, in a row of their own.
      h('button', { type: 'button', class: 'q-share-swatch custom', 'aria-label': T('自訂顏色', 'Custom colours'), onclick: () => ((customRow.hidden = !customRow.hidden), marks()) })
    )
  );
  const customRow = h('div', { class: 'q-share-row', hidden: preset() }, [h('span', { text: T('自訂', 'Custom') }), h('div', { class: 'q-share-colours' }, [fgPick, bgPick])]);
  marks();
  const logoRow = seg(T('中間', 'Middle'), 'logo', [
    ['none', T('無', 'None')],
    ['icon', T('圖示', 'Icon')],
    ['photo', T('照片', 'Photo')]
  ]);
  pick.addEventListener('change', async () => {
    const file = pick.files?.[0];
    pick.value = '';
    if (!file) return;
    try {
      photo = await photoUrl(file);
      logoRow.buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(i === 2)));
      set({ logo: 'photo' });
    } catch {
      toast(T('這張照片打不開', 'That photo couldn’t be opened'));
    }
  });
  const name = fileName(title, url);
  const busy = async (b, fn) => {
    b.disabled = true;
    try {
      await fn();
    } catch {
      toast(T('沒有存成功，再試一次', 'Not saved: try again'));
    } finally {
      b.disabled = false;
    }
  };
  const png = h('button', { class: 'q-btn primary', type: 'button', text: T('存成 PNG', 'Save PNG'), onclick: e => busy(e.currentTarget, async () => save(await qrPng(url, style, logo(), 2048), `${name}.png`)) });
  const svg = h('button', { class: 'q-btn', type: 'button', text: T('存成 SVG', 'Save SVG'), onclick: e => busy(e.currentTarget, () => save(new Blob([qrSvg(url, { ...style, logo: logo() }).svg], { type: 'image/svg+xml' }), `${name}.svg`)) });
  const copy = h('button', {
    class: 'q-btn',
    type: 'button',
    text: T('複製連結', 'Copy link'),
    onclick: async () => {
      try {
        await navigator.clipboard.writeText(url);
        copy.textContent = T('已複製 ✓', 'Copied ✓');
      } catch {
        toast(T('無法複製', 'Couldn’t copy'));
      }
    }
  });
  const send = navigator.share ? h('button', { class: 'q-btn primary', type: 'button', text: T('分享連結', 'Share link'), onclick: () => navigator.share({ url, title: title || undefined }).catch(() => {}) }) : null;
  paint();
  const accent = BRANDS[app]?.color || BRANDS[app]?.ink;
  const sh = sheet({
    title: T('分享', 'Share'),
    subtitle: url.replace(/^https?:\/\//, ''),
    label: T('分享', 'Share'),
    cls: 'q-share',
    detent: 'large',
    closeLabel: T('關閉', 'Close'),
    body: [
      h('div', { class: 'q-share-top' }, [preview, warn, h('div', { class: 'q-share-actions' }, [send, copy])]),
      h('h3', { class: 'q-sheet-h', text: T('QR code 樣式', 'QR code style') }),
      h('div', { class: 'q-rows q-share-style' }, [
        h('div', { class: 'q-share-row' }, [h('span', { text: T('顏色', 'Colour') }), swatchRow]),
        customRow,
        seg(T('點', 'Dots'), 'dots', [
          ['square', T('方', 'Square')],
          ['round', T('圓滑', 'Smooth')],
          ['dots', T('圓點', 'Dots')]
        ]),
        seg(T('角', 'Corners'), 'corners', [
          ['square', T('方', 'Square')],
          ['round', T('圓角', 'Round')],
          ['circle', T('圓', 'Circle')]
        ]),
        logoRow,
        seg(T('留白', 'Margin'), 'margin', QR_MARGINS.map((v, i) => [v, [T('窄', 'Narrow'), T('標準', 'Normal'), T('寬', 'Wide')][i]]))
      ]),
      pick
    ],
    foot: h('div', { class: 'q-sheet-foot q-share-foot' }, [svg, png])
  });
  if (accent) sh.el.style.setProperty('--q-accent', accent);
  return sh;
}
