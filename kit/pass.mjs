// The Orbit Pass sheet, the same in every app (accountSheet in orbit.mjs
// opens it; loaded the first time it's opened). The Pass is the account and
// the family, never money (money lives in Securities). Four tabs:
//   Pass   this account: devices, notices, security
//   外觀   an avatar and a frame, free for everyone
//   App    every app, Orbit's and Orbit's, when it was last used, a way in
//   說明   every app's guide (help.mjs)
import { APPS, AVATARS, FRAMES, MILESTONES, DEFAULT_AVATAR, milestoneOf, avatarSrc, settingPatch, passAccount, appIcon, el as node } from '#kit/orbit.mjs';
import { HELP_ORDER, helpFor } from './help.mjs';
import { sheet, section } from './ui.mjs';

export const STRINGS = {
  zh: {
    looksTitle: '頭像與頭像框',
    lookOn: '戴著',
    avatarsTitle: '頭像',
    framesTitle: '頭像框',
    looksSub: '戴上後，每個 Orbit App 的帳戶按鈕都看得到。',
    msTitle: '里程碑',
    msDone: '已達成',
    failed: '沒有成功，請再試一次',
    usedToday: '今天用過',
    usedDaysAgo: '{n} 天前用過',
    neverUsed: '還沒用過',
    guide: '說明',
    open: '打開',
    passGuide: 'Orbit Pass 說明',
    frame_bronze: '青銅',
    frame_silver: '白銀',
    frame_jade: '翡翠',
    frame_gold: '黃金',
    frame_neon: '霓虹',
    frame_aurora: '極光',
    frame_legend: '傳奇',
    frame_mythic: '神話',
    frame_sakura: '櫻花',
    frame_ocean: '深海',
    frame_ember: '餘燼',
    frame_mint: '薄荷',
    frame_sapphire: '藍寶石',
    frame_ruby: '紅寶石',
    frame_prism: '稜鏡',
    frame_celestial: '星穹',
    frame_pearl: '珍珠',
    frame_matcha: '抹茶',
    frame_milktea: '奶茶',
    frame_sunset: '夕陽',
    frame_midnight: '午夜',
    frame_forest: '森林',
    frame_candy: '糖果',
    frame_lava: '熔岩',
    frame_skylantern: '天燈',
    close: '關閉',
    openApp: '打開 {app}',
    tab_pass: 'Pass',
    tab_looks: '外觀',
    tab_apps: 'App',
    tab_help: '說明',
    here: '這裡',
    appsSub: '每天用得到的 App，用同一個 Orbit Pass。'
  },
  en: {
    looksTitle: 'Avatar and frame',
    lookOn: 'Wearing',
    avatarsTitle: 'Avatars',
    framesTitle: 'Frames',
    looksSub: 'Worn on your account button in every Orbit app.',
    msTitle: 'Milestones',
    msDone: 'Earned',
    failed: 'That didn’t work; please try again',
    usedToday: 'Used today',
    usedDaysAgo: 'Used {n} days ago',
    neverUsed: 'Not used yet',
    guide: 'Guide',
    open: 'Open',
    passGuide: 'The Orbit Pass guide',
    frame_bronze: 'Bronze',
    frame_silver: 'Silver',
    frame_jade: 'Jade',
    frame_gold: 'Gold',
    frame_neon: 'Neon',
    frame_aurora: 'Aurora',
    frame_legend: 'Legend',
    frame_mythic: 'Mythic',
    frame_sakura: 'Sakura',
    frame_ocean: 'Ocean',
    frame_ember: 'Ember',
    frame_mint: 'Mint',
    frame_sapphire: 'Sapphire',
    frame_ruby: 'Ruby',
    frame_prism: 'Prism',
    frame_celestial: 'Celestial',
    frame_pearl: 'Pearl',
    frame_matcha: 'Matcha',
    frame_milktea: 'Milk tea',
    frame_sunset: 'Sunset',
    frame_midnight: 'Midnight',
    frame_forest: 'Forest',
    frame_candy: 'Candy',
    frame_lava: 'Lava',
    frame_skylantern: 'Sky lantern',
    close: 'Close',
    openApp: 'Open {app}',
    tab_pass: 'Pass',
    tab_looks: 'Looks',
    tab_apps: 'Apps',
    tab_help: 'Help',
    here: 'Here',
    appsSub: 'Everyday apps, on the same Orbit Pass.'
  }
};
const TABS = ['pass', 'looks', 'apps', 'help'];

// ---- Small pieces ---------------------------------------------------------------------------

const el = node;
const put = (box, ...kids) => box.replaceChildren(...kids.filter(k => k != null && k !== false));
let toastBox = null;
function toast(text, kind = '') {
  if (!toastBox) return;
  const box = el('div', { class: `toast ${kind}`, text });
  toastBox.append(box);
  setTimeout(() => box.remove(), 2600);
}
const svgUrl = svg => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;

// ---- The sheet ------------------------------------------------------------------------------

let open = null;
export function openPass(s, { extra = null, tab = 'pass', help = null } = {}) {
  const locale = s.lang === 'en' ? 'en' : 'zh';
  const dict = STRINGS[locale];
  const t = (key, vars = {}) => String(dict[key] ?? STRINGS.zh[key] ?? key).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
  open?.dialog.close();
  let dialog = null;
  const body = el('div', { class: 'q-pass-body' });
  const tabs = el('div', { class: 'q-chips q-pass-tabs', role: 'tablist' });
  toastBox = el('div', { class: 'toasts q-pass-toasts', 'aria-live': 'polite' });
  // Looks chosen here, until the write that carries them comes back.
  const pending = {};
  const state = { tab: TABS.includes(tab) ? tab : 'pass', help: help || { app: s.app, topic: null }, locale, extra };
  let account = null;
  const close = () => sh.close();
  const ctx = {
    q: s,
    t,
    locale,
    get state() {
      return { wallet: s.wallet || {}, locale };
    },
    wornOf: key => (key in pending ? pending[key] : s.wallet?.settings?.[key]?.value?.id) ?? null,
    async wear(key, id) {
      // The ring on the tile says it's on: no notice over the sheet.
      pending[key] = id;
      paint();
      try {
        await s.write({ wallet: settingPatch(key, id ? { id } : null) });
      } catch {
        toast(t('failed'));
      } finally {
        delete pending[key];
      }
    },
    // A milestone's avatar and frame, on (or off) together.
    async wearPair(id) {
      pending.avatar = id;
      pending.frame = id;
      paint();
      try {
        await s.write({ wallet: { settings: { ...settingPatch('avatar', id ? { id } : null).settings, ...settingPatch('frame', id ? { id } : null).settings } } });
      } catch {
        toast(t('failed'));
      } finally {
        delete pending.avatar;
        delete pending.frame;
      }
    },
    openHelp: (app = s.app, topic = null) => show('help', { app, topic })
  };
  function show(next, helpAt = null) {
    state.tab = next;
    if (helpAt) state.help = helpAt;
    paint();
    dialog.scrollTop = 0;
  }
  function paint() {
    put(tabs, ...TABS.map(id => el('button', { class: 'q-chip', type: 'button', role: 'tab', 'aria-selected': String(state.tab === id), 'aria-pressed': String(state.tab === id), text: t(`tab_${id}`), onclick: () => show(id) })));
    account?.stop();
    account = null;
    if (state.tab === 'pass') {
      account = passAccount(s, { extra: state.extra, close, looks: () => show('looks') });
      return put(body, ...account.nodes);
    }
    if (state.tab === 'looks') return put(body, looksSection(ctx));
    if (state.tab === 'apps') return renderApps(body, ctx);
    renderHelp(body, ctx, state.help);
  }
  // (The Pass tab only redraws its card: a device code or a note on it stays.)
  const onWallet = () => dialog?.open && !Object.keys(pending).length && (state.tab === 'pass' ? account?.card?.() : state.tab !== 'help' && paint());
  s.on?.('wallet', onWallet);
  paint();
  // The kit's one sheet (ui.mjs): ✕, Escape, a tap outside and a swipe all close it the same way.
  const sh = sheet({
    title: el('span', { class: 'q-pass-title' }, [el('img', { src: svgUrl(appIcon('pass')), alt: '', width: 28, height: 28 }), document.createTextNode('Orbit Pass')]),
    label: 'Orbit Pass',
    cls: 'q-pass',
    closeLabel: t('close'),
    body: [tabs, body, toastBox],
    onClose() {
      account?.stop();
      if (open?.dialog === dialog) open = null;
      // The address loses the guide it was opened on.
      if (/(?:^|[#&])help=/.test(location.hash)) {
        try {
          history.replaceState(history.state, '', `${location.pathname}${location.search}`);
        } catch {}
      }
    }
  });
  dialog = sh.el;
  open = { dialog, show };
  return dialog;
}

// ---- Help -----------------------------------------------------------------------------------

function renderHelp(box, { q, t, locale }, { app, topic }) {
  const at = HELP_ORDER.includes(app) ? app : 'pass';
  const name = a => (a === 'pass' ? 'Orbit Pass' : APPS[a]?.short || a);
  const chips = el(
    'div',
    { class: 'q-chips small' },
    HELP_ORDER.map(a => el('button', { class: 'q-chip', type: 'button', 'aria-pressed': String(at === a), text: name(a), onclick: () => renderHelp(box, { q, t, locale }, { app: a, topic: null }) }))
  );
  const cards = helpFor(at, locale).map(([id, title, paras]) => el('article', { class: `q-card pad help-card${topic === id ? ' focus' : ''}`, id: `q-help-${id}` }, [el('h3', { text: title }), ...paras.map(p => el('p', { text: p }))]));
  const go = at !== 'pass' && at !== q.app && APPS[at] ? el('button', { class: 'q-btn primary block', type: 'button', text: t('openApp', { app: APPS[at].name }), onclick: () => q.go(at) }) : null;
  put(box, chips, el('div', { class: 'help-list' }, cards), go);
  // The app's own chip in view (Transit's is far along the row at 320 px).
  setTimeout(() => { const on = chips.querySelector('[aria-pressed="true"]'); if (on) chips.scrollLeft = on.offsetLeft - (chips.clientWidth - on.offsetWidth) / 2; }, 0);
  if (topic) setTimeout(() => box.querySelector(`#q-help-${topic}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' }), 50);
}

// The looks: the milestones' (earned once, each an avatar and a frame, worn
// together), then the free avatars and frames. A tap wears one, a second
// tap takes it off.
const compact = (n, en) => (en ? (n >= 1e6 ? `${+(n / 1e6).toFixed(1)}M` : n >= 1000 ? `${Math.floor(n / 1000)}K` : String(n)) : n >= 10_000 ? `${Math.floor(n / 10_000)}萬` : String(n));
function looksSection({ q, t, locale, wornOf, wear, wearPair }) {
  const en = locale === 'en';
  const wallet = q.wallet || {};
  const avatar = wornOf('avatar');
  const frame = wornOf('frame');
  const face = id => el('img', { class: 'av-face', alt: '', src: avatarSrc(id) });
  const tile = (key, item, look) => {
    const on = wornOf(key) === item.id;
    const name = key === 'frame' ? t(`frame_${item.id}`) : item[locale];
    return el('button', { class: `av-tile${on ? ' on' : ''}`, type: 'button', 'aria-pressed': String(on), 'aria-label': name, onclick: () => wear(key, on ? null : item.id) }, key === 'frame' ? [look, el('small', { text: on ? t('lookOn') : name })] : [look]);
  };
  const faces = {
    avatar: a => face(a.id),
    frame: f => el('span', { class: `fr-preview q-framed q-frame-${f.id}${frame === f.id ? ' on' : ''}`, 'aria-hidden': 'true' }, [face(AVATARS.some(a => a.id === avatar) ? avatar : DEFAULT_AVATAR)])
  };
  const grid = (key, list) => el('div', { class: `av-grid ${key}s` }, list.map(x => tile(key, x, faces[key](x))));
  // A milestone: its look (dim, with a lock, until earned), its name, and
  // how far along (a bar and the count) or that it's earned.
  const ms = m => {
    const st = milestoneOf(wallet, m);
    const id = `ms-${m.id}`;
    const on = avatar === id && frame === id;
    const unit = m.unit[en ? 'en' : 'zh'];
    const count = m.money ? `${compact(st.n, en)}/${compact(m.goal, en)}` : `${st.n}/${m.goal}${unit ? ` ${unit}` : ''}`;
    return el('button', { class: `ms-tile${st.done ? ' got' : ''}${on ? ' on' : ''}`, type: 'button', 'aria-pressed': String(on), 'aria-disabled': String(!st.done), 'aria-label': `${m[locale]} ${st.done ? t('msDone') : count}`, onclick: () => st.done && wearPair(on ? null : id) }, [
      el('span', { class: `ms-look q-framed q-frame-${id}` }, [face(id), st.done ? null : el('span', { class: 'ms-lock', html: LOCK })]),
      el('strong', { text: m[locale] }),
      st.done
        ? el('small', { class: 'ms-state', text: on ? t('lookOn') : t('msDone') })
        : el('span', { class: 'ms-prog' }, [el('span', { class: 'ms-bar' }, [el('i', { style: `width:${Math.round((st.n / m.goal) * 100)}%` })]), el('small', { class: 'num' }, [el('img', { src: svgUrl(appIcon(m.id)), alt: '', width: 13, height: 13 }), document.createTextNode(count)])])
    ]);
  };
  return el('div', {}, [
    section(t('msTitle'), el('div', { class: 'ms-grid' }, MILESTONES.map(ms))),
    section(
      t('looksTitle'),
      el('div', { class: 'q-card pad looks' }, [el('small', { class: 'lv-h', text: t('avatarsTitle') }), grid('avatar', AVATARS), el('small', { class: 'lv-h', text: t('framesTitle') }), grid('frame', FRAMES)]),
      { sub: t('looksSub') }
    )
  ]);
}
const LOCK = '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="currentColor"/><path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" fill="none" stroke="currentColor" stroke-width="2.2"/></svg>';

// ---- Apps -----------------------------------------------------------------------------------

const ago = (t, then) => {
  const days = Math.floor((Date.now() - then) / 86_400_000);
  return days <= 0 ? t('usedToday') : t('usedDaysAgo', { n: days });
};
// Every app, Orbit's then Orbit's: what it's for, when it was last used,
// its guide and a way in.
function renderApps(box, { q, t, locale, state, openHelp }) {
  const w = state.wallet;
  const card = ([id, a]) => {
    const last = w.apps?.[id]?.last;
    const here = id === q.app;
    return el('div', { class: `q-card pad app-card${here ? ' here' : ''}` }, [
      el('div', { class: 'app-top' }, [el('img', { class: 'app-logo', src: svgUrl(appIcon(id)), alt: '', width: 48, height: 48 }), el('div', { class: 'app-name' }, [el('strong', { text: a.name }), el('small', { class: 'muted', text: a.role[locale === 'en' ? 'en' : 'zh'] })]), el('small', { class: 'muted app-last', text: here ? t('here') : last ? ago(t, last) : t('neverUsed') })]),
      el('div', { class: 'two-btn' }, [el('button', { class: 'q-btn', type: 'button', text: t('guide'), onclick: () => openHelp(id) }), here ? null : el('button', { class: 'q-btn primary', type: 'button', text: t('open'), onclick: () => q.go(id) })])
    ]);
  };
  put(box, section('Orbit', el('div', { class: 'app-list' }, Object.entries(APPS).map(card)), { sub: t('appsSub') }), el('button', { class: 'q-btn block ghost pass-guide', type: 'button', text: t('passGuide'), onclick: () => openHelp('pass') }));
}
