// 測試工具: the tester's tools, for the owner or a developer, in every app.
//
// Hidden until unlocked on this device (orbit.mjs testerHead: seven taps on
// the Orbit Pass's 除錯紀錄 heading, then a yes); loaded only when used. Kept
// in localStorage 'orbit.tester' ({ on, clock: { off }, place: { lat, lng,
// name }, net, flags }), which boot.js reads before the app's own code runs:
//
// - 時間: every Date in the page runs from the time picked (an offset, so
//   time still moves). Notices aren't sent to the Worker meanwhile
//   (orbit.mjs schedulePush), no milestone day is counted (msTick), and the device's kept reads are dropped at
//   each change (a copy read "now" would look fresh at another time).
// - 位置: the page's geolocation answers at the place picked.
// - 網路: off, slow (3 s each), or every read failing (503).
// - 通知: one shown now on this device; one sent by the Worker a minute from now.
// - 這個 App: the app's own switches and actions, which it adds to
//   globalThis.ORBIT_TEST_TOOLS (no import, so an app works on any kit):
//     { app, title, sub, run: async () => 'what happened' }
//     { app, title, sub, flag: 'name' }               (a switch: ORBIT_TEST.flags.name)
//     { app, title, sub, flag: 'name', options: [{ id, label }] }  (a choice)
//   A flag's change reloads the app; the app reads ORBIT_TEST?.flags?.name.
// - The app, the kit and this device's versions, to copy into a report.
//
// Writes the app makes while testing are real: they go to the person's Pass.
import { h, sheet, toast, segmented, toggle } from './ui.mjs';
import { ask, clearData, pushTest, readJson, writeStore } from './orbit.mjs';

const KEY = 'orbit.tester';
const en = () => !/^zh/i.test(document.documentElement.lang || 'zh');
const T = (zh, e) => (en() ? e : zh);
const state = () => readJson(KEY, null) || {};
const realNow = () => globalThis.Date.real?.() ?? Date.now();
function save(next, reload = true) {
  writeStore(KEY, JSON.stringify(next));
  if (!reload) return;
  clearData();
  setTimeout(() => location.reload(), 120);
}

// Places anyone can find on a map (stations, airports), and one abroad.
export const PLACES = [
  { id: 'tpe', name: '台北車站', en: 'Taipei Main Station', lat: 25.0478, lng: 121.517 },
  { id: '101', name: '台北 101', en: 'Taipei 101', lat: 25.034, lng: 121.5645 },
  { id: 'bq', name: '板橋車站', en: 'Banqiao Station', lat: 25.0143, lng: 121.4637 },
  { id: 'tyap', name: '桃園機場', en: 'Taoyuan Airport', lat: 25.0797, lng: 121.2342 },
  { id: 'hsz', name: '新竹車站', en: 'Hsinchu Station', lat: 24.8016, lng: 120.9716 },
  { id: 'hszh', name: '高鐵新竹站', en: 'HSR Hsinchu', lat: 24.8083, lng: 121.0402 },
  { id: 'txg', name: '台中車站', en: 'Taichung Station', lat: 24.1372, lng: 120.6869 },
  { id: 'tnn', name: '台南車站', en: 'Tainan Station', lat: 22.9971, lng: 120.2128 },
  { id: 'khh', name: '高雄車站', en: 'Kaohsiung Station', lat: 22.6394, lng: 120.3022 },
  { id: 'hun', name: '花蓮車站', en: 'Hualien Station', lat: 23.993, lng: 121.6011 },
  { id: 'ttt', name: '台東車站', en: 'Taitung Station', lat: 22.7932, lng: 121.1235 },
  { id: 'knh', name: '金門機場', en: 'Kinmen Airport', lat: 24.4278, lng: 118.3594 },
  { id: 'mzg', name: '馬祖南竿', en: 'Matsu Nangan', lat: 26.1597, lng: 119.9497 },
  { id: 'yushan', name: '玉山主峰', en: 'Yushan peak', lat: 23.47, lng: 120.9573 },
  { id: 'tyo', name: '東京車站（國外）', en: 'Tokyo Station (abroad)', lat: 35.6812, lng: 139.7671 }
];
// "25.04, 121.51", or a Google Maps link (…@25.04,121.51,… or ?q=25.04,121.51).
export function parsePlace(text) {
  const m = /(-?\d{1,2}\.\d+)\s*,\s*(-?\d{1,3}\.\d+)/.exec(String(text || ''));
  if (!m) return null;
  const lat = Number(m[1]);
  const lng = Number(m[2]);
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? { lat, lng } : null;
}
// The date and time fields' own text for a moment (the device's own zone).
const pad = n => String(n).padStart(2, '0');
export const dayText = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const timeText = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const shortWhen = d => `${d.getMonth() + 1}/${d.getDate()} ${timeText(d)}`;
// The offset for a day and time typed in, against the real clock.
export function offsetFor(day, time, real = realNow()) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day || '');
  const t = /^(\d{1,2}):(\d{2})/.exec(time || '') || [0, '0', '0'];
  if (!m) return null;
  const at = new (globalThis.Date)(Number(m[1]), Number(m[2]) - 1, Number(m[3]), Number(t[1]), Number(t[2])).getTime();
  return Number.isFinite(at) ? at - real : null;
}

// What's on, in a few words (the pill, the sheet's top line).
export function summary(t = state()) {
  const out = [];
  if (t.clock?.off) out.push(shortWhen(new Date(realNow() + t.clock.off)));
  if (t.place) out.push(en() ? t.place.en || t.place.name : t.place.name);
  if (t.feed) out.push(T(`模擬行程${t.clock?.rate > 1 ? ` ${t.clock.rate} 倍速` : ''}`, `Trip replay${t.clock?.rate > 1 ? ` ×${t.clock.rate}` : ''}`));
  if (t.net === 'off') out.push(T('離線', 'Offline'));
  if (t.net === 'slow') out.push(T('網路慢', 'Slow'));
  if (t.net === 'fail') out.push(T('伺服器錯誤', 'Server errors'));
  const flags = Object.entries(t.flags || {}).filter(([, v]) => v);
  if (flags.length) out.push(T(`${flags.length} 個開關`, `${flags.length} switch${flags.length > 1 ? 'es' : ''}`));
  return out;
}

export async function unlock(s) {
  if (state().on) return true;
  const yes = await ask({
    lang: s?.lang,
    icon: '🧪',
    title: T('打開測試工具？', 'Turn on tester tools?'),
    body: T('給開發和測試用：模擬時間、位置、網路和通知，以及每個 App 自己的測試開關。只在這台裝置的這個 App 有效，隨時可以關掉。', 'For building and testing: a different time, place and network, test notices, and each app’s own switches. On this device and app only; turn it off any time.'),
    ok: T('打開', 'Turn on')
  });
  if (!yes) return false;
  save({ on: 1 }, false);
  globalThis.ORBIT_TEST = { on: 1, active: [] };
  return true;
}

// The pill on the page while anything is changed: what's on; a tap opens the tools.
export function pill(opener = () => openTester()) {
  const words = summary();
  document.querySelector('.q-test-pill')?.remove();
  if (!words.length) return;
  const b = h('button', { class: 'q-test-pill', type: 'button', 'aria-label': T('測試工具', 'Tester tools'), onclick: () => opener() }, [h('span', { 'aria-hidden': 'true', text: '🧪' }), h('span', { class: 'q-test-pill-text', text: words.join(' · ') })]);
  document.body.append(b);
  // The clock's minutes go on.
  if (state().clock?.off) setInterval(() => b.isConnected && (b.lastChild.textContent = summary().join(' · ')), 20_000);
}

const btn = (text, onclick, cls = 'q-chip') => h('button', { class: cls, type: 'button', text, onclick });
const head = text => h('h3', { class: 'q-sheet-h', text });
const sub = text => h('p', { class: 'q-sheet-sub', text });
const row = (title, note, control) => h('div', { class: 'q-test-row' }, [h('div', { class: 'q-test-row-text' }, [h('strong', { text: title }), note ? h('small', { text: note }) : null]), control]);

function clockPart() {
  const t = state();
  const now = new Date(realNow() + (t.clock?.off || 0));
  const day = h('input', { type: 'date', class: 'q-field', value: dayText(now), 'aria-label': T('日期', 'Date') });
  const time = h('input', { type: 'time', class: 'q-field', value: timeText(now), 'aria-label': T('時間', 'Time') });
  const set = off => save({ ...state(), clock: Math.abs(off) >= 60_000 ? { off } : undefined });
  const step = ms => set((state().clock?.off || 0) + ms);
  return [
    head(T('時間', 'Time')),
    sub(t.clock?.off ? T(`App 現在以為是 ${shortWhen(now)}，時間照樣往前走。模擬時不會排通知。`, `The app thinks it is ${shortWhen(now)}; time still runs. No notices are scheduled meanwhile.`) : T('App 用的時間（例如明早 7:50 看公車、比賽前 10 分鐘、上課中）。', 'The time the app runs at (a bus at 7:50 tomorrow, 10 minutes before a game, mid-class).')),
    h('div', { class: 'q-test-when' }, [day, time, btn(T('套用', 'Apply'), () => { const off = offsetFor(day.value, time.value); if (off != null) set(Math.round(off / 1000) * 1000); }, 'q-btn primary')]),
    h('div', { class: 'q-chips wrap' }, [
      btn(T('−1 天', '−1 day'), () => step(-86_400_000)),
      btn(T('−1 小時', '−1 hr'), () => step(-3_600_000)),
      btn(T('+10 分', '+10 min'), () => step(600_000)),
      btn(T('+1 小時', '+1 hr'), () => step(3_600_000)),
      btn(T('+1 天', '+1 day'), () => step(86_400_000)),
      btn(T('+7 天', '+7 days'), () => step(7 * 86_400_000)),
      t.clock?.off ? btn(T('回到現在', 'Back to now'), () => set(0)) : null
    ])
  ];
}

function placePart() {
  const t = state();
  const field = h('input', { type: 'text', class: 'q-field', inputmode: 'decimal', placeholder: T('緯度, 經度 或 Google 地圖連結', 'lat, lng or a Google Maps link'), 'aria-label': T('自訂位置', 'Custom place') });
  const set = place => save({ ...state(), place: place || undefined });
  return [
    head(T('位置', 'Place')),
    sub(t.place ? T(`App 收到的位置：${t.place.name}（${t.place.lat.toFixed(4)}, ${t.place.lng.toFixed(4)}）`, `The app gets: ${t.place.en || t.place.name} (${t.place.lat.toFixed(4)}, ${t.place.lng.toFixed(4)})`) : T('App 問位置時會拿到這裡（交通、天氣、記帳的地點）。', 'Where the app is told it is when it asks (Transit, Weather, Money’s places).')),
    h('div', { class: 'q-chips wrap' }, [
      ...PLACES.map(p => btn(en() ? p.en : p.name, () => set({ name: p.name, en: p.en, lat: p.lat, lng: p.lng }), t.place?.name === p.name ? 'q-chip on' : 'q-chip')),
      t.place ? btn(T('用真的位置', 'Real place'), () => set(null)) : null
    ]),
    h('div', { class: 'q-test-when' }, [
      field,
      btn(T('套用', 'Apply'), () => {
        const p = parsePlace(field.value);
        if (!p) return toast(T('看不懂這個位置', 'Couldn’t read that place'));
        set({ name: T('自訂', 'Custom'), en: 'Custom', ...p });
      }, 'q-btn primary')
    ])
  ];
}

// A trip replayed into the page's GPS (boot.js `feed`), started by an app's
// own tool (Transit's 模擬行程): `fixes` [[got s, lat, lng, acc, at s]] from
// `from` (the page's time it starts), the clock `rate` times as fast. The page reloads into it.
export function playTrip({ from = Date.now(), fixes, rate = 1 }) {
  const real = realNow();
  save({ ...state(), on: 1, place: undefined, feed: { from, fixes }, clock: { off: from - real, rate, from: real } });
}
function feedPart() {
  const t = state();
  if (!t.feed) return [];
  const n = t.feed.fixes?.length || 0;
  const at = globalThis.ORBIT_TEST?.feedAt || 0;
  return [
    head(T('模擬行程', 'Trip replay')),
    sub(at >= n ? T(`${n} 個位置都送完了`, `All ${n} fixes sent`) : T(`第 ${at} / ${n} 個位置${t.clock?.rate > 1 ? `，${t.clock.rate} 倍速` : ''}`, `Fix ${at} of ${n}${t.clock?.rate > 1 ? `, ×${t.clock.rate}` : ''}`)),
    h('div', { class: 'q-chips wrap' }, [btn(T('停止模擬', 'Stop replay'), () => save({ ...state(), feed: undefined, clock: undefined }))])
  ];
}

function netPart() {
  const t = state();
  return [
    head(T('網路', 'Network')),
    sub(T('讀取資料的網路（App 本身的檔案照常載入）：很慢＝每次讀 8 秒；伺服器錯＝每次都回 503；離線＝完全連不上。', 'The network for data (the app’s own files still load): slow = 8 s a read; errors = every read answers 503; offline = nothing gets through.')),
    segmented(
      [
        { id: '', label: T('正常', 'Normal') },
        { id: 'slow', label: T('很慢', 'Slow') },
        { id: 'fail', label: T('伺服器錯', 'Errors') },
        { id: 'off', label: T('離線', 'Offline') }
      ],
      { value: t.net || '', onChange: v => save({ ...state(), net: v || undefined }), label: T('網路', 'Network') }
    )
  ];
}

function noticePart(s) {
  const app = s?.app || '';
  const list = readJson(`orbit.push.list.${app}`, []);
  const rows = (Array.isArray(list) ? list : []).filter(x => x?.at > realNow() - 3_600_000).slice(0, 12);
  const local = async () => {
    if (!('Notification' in globalThis)) return toast(T('這個瀏覽器不能通知（iPhone 要先加到主畫面）', 'This browser can’t notify (an iPhone needs the app on its home screen)'));
    if (Notification.permission !== 'granted' && (await Notification.requestPermission()) !== 'granted') return toast(T('沒有通知權限', 'Notifications not allowed'));
    const reg = await navigator.serviceWorker?.ready;
    const title = T('Orbit 測試通知', 'Orbit test notice');
    const body = T(`這台裝置現在跳出 · ${timeText(new Date())}`, `Shown on this device · ${timeText(new Date())}`);
    if (reg?.showNotification) await reg.showNotification(title, { body, tag: `${app}:tester-local`, data: { url: location.href } });
    else new Notification(title, { body });
  };
  const server = async () => {
    if (!s) return;
    const ok = await pushTest(s, { title: T('Orbit 測試通知', 'Orbit test notice'), body: T('伺服器排定，一分鐘後送達', 'Sent by the server a minute later') }).catch(() => false);
    toast(ok ? T('一分鐘後會收到（可以先關掉 App）', 'Arrives in a minute (you can close the app)') : T('排不進去：先在 Orbit Pass 打開通知', 'Couldn’t: turn on notices in the Orbit Pass first'));
  };
  return [
    head(T('通知', 'Notices')),
    h('div', { class: 'q-chips wrap' }, [btn(T('現在跳一則（本機）', 'Show one now (this device)'), () => local().catch(() => toast(T('沒辦法通知', 'Couldn’t notify')))), s ? btn(T('一分鐘後由伺服器送', 'From the server in a minute'), server) : null]),
    rows.length
      ? h(
          'div',
          { class: 'q-test-list' },
          rows.map(x => row(x.title || x.tag, `${shortWhen(new Date(x.at))}${x.kind ? ` · ${x.kind}` : ''}${x.body ? ` · ${x.body}` : ''}`, null))
        )
      : sub(T('這個 App 目前沒有排定的通知。', 'This app has no notices scheduled.'))
  ];
}

function appPart(app) {
  const tools = (globalThis.ORBIT_TEST_TOOLS || []).filter(x => x && (!x.app || x.app === app));
  if (!tools.length) return [];
  const flags = state().flags || {};
  const setFlag = (name, v) => save({ ...state(), flags: { ...(state().flags || {}), [name]: v || undefined } });
  return [
    head(T('這個 App', 'This app')),
    h(
      'div',
      { class: 'q-test-list' },
      tools.map(x => {
        if (x.flag && x.options)
          return h('div', { class: 'q-test-row q-test-choice' }, [
            h('div', { class: 'q-test-row-text' }, [h('strong', { text: x.title }), x.sub ? h('small', { text: x.sub }) : null]),
            h('div', { class: 'q-chips wrap' }, [{ id: '', label: T('關', 'Off') }, ...x.options].map(o => btn(o.label, () => setFlag(x.flag, o.id), (flags[x.flag] || '') === o.id ? 'q-chip on' : 'q-chip')))
          ]);
        if (x.flag) return row(x.title, x.sub, toggle({ checked: Boolean(flags[x.flag]), label: x.title, onChange: v => setFlag(x.flag, v ? 1 : 0) }));
        return row(
          x.title,
          x.sub,
          btn(x.label || T('執行', 'Run'), async e => {
            const b = e.currentTarget;
            b.disabled = true;
            try {
              const said = await x.run?.();
              if (said) toast(String(said));
            } catch (err) {
              toast(T(`沒成功：${err?.message || err}`, `Failed: ${err?.message || err}`));
            } finally {
              b.disabled = false;
            }
          })
        );
      })
    )
  ];
}

export function deviceInfo(s) {
  const meta = n => document.querySelector(`meta[name="${n}"]`)?.content || '';
  return {
    app: s?.app || document.documentElement.dataset.app || '',
    build: meta('build-version') || meta('app-version'),
    kit: globalThis.ORBIT_KIT?.version || '',
    page: location.pathname + location.hash,
    screen: `${innerWidth}×${innerHeight} @${devicePixelRatio}x`,
    installed: matchMedia('(display-mode: standalone)').matches,
    lang: document.documentElement.lang,
    online: navigator.onLine,
    worker: Boolean(navigator.serviceWorker?.controller),
    account: (s?.pass || '').slice(0, 6),
    time: new Date().toString(),
    tester: summary().join(' · '),
    ua: navigator.userAgent
  };
}

function infoPart(s) {
  const info = deviceInfo(s);
  const rows = [
    [T('App 版本', 'App build'), info.build || '—'],
    [T('套件版本', 'Kit'), info.kit || '—'],
    [T('畫面', 'Screen'), `${info.screen}${info.installed ? T(' · 主畫面', ' · home screen') : ''}`],
    [T('帳號', 'Account'), info.account || '—'],
    [T('離線可用', 'Works offline'), info.worker ? T('是', 'Yes') : T('否', 'No')]
  ];
  return [
    head(T('版本與裝置', 'Versions and device')),
    h('div', { class: 'q-test-list' }, rows.map(([a, b]) => row(a, '', h('span', { class: 'q-test-val num', text: b })))),
    h('div', { class: 'q-chips wrap' }, [
      btn(T('複製（貼到回報）', 'Copy (for a report)'), async () => {
        await navigator.clipboard.writeText(JSON.stringify(info, null, 1)).catch(() => {});
        toast(T('已複製', 'Copied'));
      }),
      btn(T('清除讀過的資料並重新載入', 'Drop kept data and reload'), () => {
        clearData();
        setTimeout(() => location.reload(), 120);
      }),
      btn(T(en() ? '中文' : 'English', en() ? '中文' : 'English'), () => {
        writeStore('orbit.lang', en() ? 'zh' : 'en');
        location.reload();
      })
    ])
  ];
}

let open = null;
export function openTester(s = globalThis.ORBIT_TEST_SESSION) {
  if (s) globalThis.ORBIT_TEST_SESSION = s;
  open?.close?.();
  const words = summary();
  const body = [
    words.length ? h('p', { class: 'q-test-now', text: T(`模擬中：${words.join(' · ')}`, `Changed: ${words.join(' · ')}`) }) : sub(T('只在這台裝置的這個 App 有效。測試時做的新增、修改照樣會存進你的 Orbit Pass。', 'This device and app only. What you add or change while testing is still saved to your Orbit Pass.')),
    ...appPart(s?.app),
    ...feedPart(),
    ...clockPart(),
    ...placePart(),
    ...netPart(),
    ...noticePart(s),
    ...infoPart(s),
    h('div', { class: 'q-test-foot' }, [
      words.length ? btn(T('全部恢復正常', 'Back to normal'), () => save({ on: 1 }), 'q-btn') : null,
      btn(T('關閉測試工具', 'Turn off tester tools'), () => {
        writeStore(KEY, null);
        clearData();
        setTimeout(() => location.reload(), 120);
      }, 'q-btn danger')
    ])
  ];
  open = sheet({ title: T('測試工具', 'Tester tools'), body, cls: 'q-tester', detent: 'large' });
  return open;
}
