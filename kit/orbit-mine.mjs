// Each Orbit's own setup (Jay 2026-11-14): a home screen can hold several
// Orbits, each with its own name, its own apps (one app is fine: a one-app
// Orbit is how a single app is added now) and its own icon (a look,
// kit/brand.mjs LOOKS). Setup is optional: the plain Orbit has every app, the
// name Orbit and the first look.
//
// What tells two Orbits apart is a tag in the address the home-screen icon
// opens (/app/?o=<tag>): Android installs only one app per manifest id, and an
// iPhone gives each home-screen app storage of its own, empty at first, so a
// new Orbit learns its setup from its address. The tag is the setup itself
// (base64url of { n, a, l }), so it needs nothing stored anywhere to be read,
// and the proxy serves each tag's manifest from it (orbit-manifest.js). Once
// open, Orbit takes the tag out of the address (docs/ORBIT.md).
//
// Apps added or taken out later, inside an Orbit, are kept per tag
// (MINE_KEY: Android's Orbits share one storage) and on the Pass (wallet
// setting 'orbits', newest wins per tag), so the same Orbit on another phone
// follows. The name and icon are the phone's: fixed when it was added.
import { APP_ORDER, BRANDS, DEFAULT_LOOK, isLook, lookApp } from './brand.mjs';

export const MINE_KEY = 'orbit.mine.v1';
// This window's Orbit (sessionStorage): its tag, kept for a reload.
export const WHICH_KEY = 'orbit.which';
export const NAME_MAX = 20;

const b64 = {
  to: text => {
    const bytes = new TextEncoder().encode(text);
    let bin = '';
    for (const x of bytes) bin += String.fromCharCode(x);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },
  from: code => {
    const bin = atob(String(code).replace(/-/g, '+').replace(/_/g, '/'));
    return new TextDecoder().decode(Uint8Array.from(bin, c => c.charCodeAt(0)));
  }
};

// Only real apps, each once, in the family's order.
export const cleanApps = apps => {
  const want = new Set((Array.isArray(apps) ? apps : []).filter(id => BRANDS[id]));
  return APP_ORDER.filter(id => want.has(id));
};
export const cleanName = name => String(name ?? '').replace(/[\u0000-\u001f<>"]/g, '').replace(/\s+/g, ' ').trim().slice(0, NAME_MAX);

// The name an Orbit is offered: an app's own for a one-app Orbit, else Orbit.
export const defaultName = apps => (apps.length === 1 ? BRANDS[apps[0]].short : 'Orbit');
// The look an Orbit is offered: a one-app Orbit wears its app's icon.
export const defaultLook = apps => (apps.length === 1 ? `app-${apps[0]}` : DEFAULT_LOOK);

// Each Orbit's own id (Jay 2026-11-14: a new Orbit opened with the apps
// picked in another): minted on the add page, so two Orbits alike in every
// other way never share the apps changed in one of them.
const ID = /^[a-z0-9]{6,12}$/;
export const newId = () => Array.from(globalThis.crypto.getRandomValues(new Uint8Array(8)), b => '0123456789abcdefghijklmnopqrstuvwxyz'[b % 36]).join('');
// A setup made whole: every app when none is said, a name and a look.
export function cleanSetup(s = {}) {
  const apps = cleanApps(s.apps);
  const all = apps.length ? apps : [...APP_ORDER];
  const out = { name: cleanName(s.name) || defaultName(all), apps: all, look: isLook(s.look) ? s.look : defaultLook(all) };
  if (ID.test(s.id || '')) out.id = s.id;
  return out;
}
// The plain Orbit: every app, its name and first look.
export const isPlain = s => s.apps.length === APP_ORDER.length && s.name === 'Orbit' && s.look === DEFAULT_LOOK;

// A setup as its tag ('' for the plain Orbit without an id; the plain one
// with an id is its id alone), and back (null if it isn't one).
export function encodeSetup(setup) {
  const s = cleanSetup(setup);
  if (isPlain(s)) return s.id ? b64.to(JSON.stringify({ i: s.id })) : '';
  return b64.to(JSON.stringify({ n: s.name, a: s.apps.join('.'), l: s.look, ...(s.id ? { i: s.id } : {}) }));
}
export function decodeSetup(tag) {
  if (!tag || typeof tag !== 'string' || tag.length > 400 || !/^[A-Za-z0-9_-]+$/.test(tag)) return null;
  try {
    const x = JSON.parse(b64.from(tag));
    if (!x || typeof x !== 'object') return null;
    const id = ID.test(x.i || '') ? x.i : undefined;
    const apps = x.a == null && id ? [...APP_ORDER] : cleanApps(String(x.a || '').split('.'));
    if (!apps.length) return null;
    return cleanSetup({ name: x.n, apps, look: x.l, id });
  } catch {
    return null;
  }
}

// Where a look's home-screen pictures are (an app's look: that app's own).
export function lookFiles(look) {
  const app = lookApp(look);
  if (app) {
    const at = `/${BRANDS[app].slug}/icons/`;
    return { apple: `${at}apple-touch-icon.png`, icon: `${at}icon-512.png`, maskable: `${at}maskable-512.png` };
  }
  const at = `/app/looks/${isLook(look) ? look : DEFAULT_LOOK}/`;
  return { apple: `${at}apple.png`, icon: `${at}icon.png`, maskable: `${at}maskable.png` };
}

// The address an Orbit's icon opens, and its manifest's (served by the proxy).
export const startOf = tag => (tag ? `/app/?o=${tag}` : '/app/');
export const manifestOf = tag => (tag ? `/api/orbit-manifest?o=${tag}` : '/app/manifest.webmanifest');

// A tag's web app manifest (the proxy's /orbit-manifest; the plain Orbit's
// own file, site/app/manifest.webmanifest, says the same).
export function orbitManifest(tag) {
  const s = decodeSetup(tag);
  if (!s) return null;
  const f = lookFiles(s.look);
  return {
    name: s.name,
    short_name: s.name,
    description: s.apps.length === 1 ? BRANDS[s.apps[0]].tag?.zh || '' : `${s.apps.map(id => BRANDS[id].short).join('、')}，在一個 Orbit 裡。`,
    lang: 'zh-Hant-TW',
    id: startOf(tag),
    start_url: startOf(tag),
    scope: '/',
    display: 'standalone',
    orientation: 'any',
    background_color: '#f2f2f7',
    theme_color: '#f2f2f7',
    icons: [
      { src: f.icon, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: f.maskable, sizes: '512x512', type: 'image/png', purpose: 'maskable' }
    ]
  };
}

// ---- Apps changed inside an Orbit ----
const read = (store, key) => {
  try {
    return JSON.parse(globalThis[store]?.getItem(key) || 'null');
  } catch {
    return null;
  }
};
const write = (store, key, v) => {
  try {
    globalThis[store]?.setItem(key, JSON.stringify(v));
  } catch {}
};
// { [tag]: { apps, t } }, '' the plain Orbit.
export const mineSaved = () => {
  const m = read('localStorage', MINE_KEY);
  return m && typeof m === 'object' && !Array.isArray(m) ? m : {};
};
// This window's tag ('' the plain Orbit).
export const whichTag = () => {
  try {
    return globalThis.sessionStorage?.getItem(WHICH_KEY) || '';
  } catch {
    return '';
  }
};
// An Orbit's apps now: changed inside it, else as it was set up.
export function appsOf(tag = whichTag(), saved = mineSaved()) {
  const own = cleanApps(saved[tag]?.apps);
  if (own.length) return own;
  return (decodeSetup(tag) || cleanSetup({})).apps;
}
// An Orbit's setup now (its name and look as added; its apps as now).
export const setupOf = (tag = whichTag()) => ({ ...(decodeSetup(tag) || cleanSetup({})), apps: appsOf(tag) });
export function setApps(tag, apps, now = Date.now()) {
  const clean = cleanApps(apps);
  if (!clean.length) return false;
  write('localStorage', MINE_KEY, { ...mineSaved(), [tag]: { apps: clean, t: now } });
  globalThis.dispatchEvent?.(new CustomEvent('orbit-mine'));
  return true;
}

// The Pass's copy (wallet.settings.orbits = { value: { [tag]: { apps, t } }, t })
// and this phone's, made one: the newer per tag wins. Returns what to send up
// (null when the Pass has it all).
export function mergeMine(local, held) {
  const out = { ...local };
  let changed = false;
  for (const [tag, v] of Object.entries(held && typeof held === 'object' ? held : {})) {
    const apps = cleanApps(v?.apps);
    if (apps.length && Number(v.t) > (Number(out[tag]?.t) || 0)) {
      out[tag] = { apps, t: Number(v.t) };
      changed = true;
    }
  }
  const up = Object.entries(out).some(([tag, v]) => (Number(v?.t) || 0) > (Number(held?.[tag]?.t) || 0));
  // (The Pass keeps a setting of at most 4,000 characters: the newest Orbits first.)
  const keep = Object.fromEntries(
    Object.entries(out)
      .sort((a, b) => (Number(b[1]?.t) || 0) - (Number(a[1]?.t) || 0))
      .filter((_, i, all) => JSON.stringify(Object.fromEntries(all.slice(0, i + 1))).length < 3800)
  );
  return { local: out, changed, up: up ? keep : null };
}
