# Features kept

Every feature the kit gives all the apps, with the code that makes it.
`tests/features.test.mjs` fails if any mark below disappears, so a refactor cannot
drop a feature silently (2026-11-03, after the lost-features audit).
To remove a feature on purpose, delete its line here in the same commit and say why.
- One tab bar (the floating capsule; a rail on wide screens) — `kit/orbit.mjs`: `export function tabBar`
- Every screen size: screenFit, wide sheets, columns of even height — `kit/orbit.mjs`, `kit/ui.mjs`: `screenFit`, `q-sheet-wide`, `export function flowColumns`
- A live update never moves the page — `kit/hold-place.mjs`, `kit/ui.mjs`: `scrollBusy`, `scrollers.push`
- A tap or swipe keeps its control under the finger; a map's moving cars never pull the page — `kit/hold-place.mjs`: `function keepTap`, `export const loose`
- A sheet sized to its content keeps its height while open — `kit/hold-place.mjs`, `kit/orbit.css`: `--q-sheet-floor`
- One quiet 再看/收起 bar for a list's more — `kit/ui.mjs`, `kit/orbit.css`: `export function moreToggle`, `export function moreHtml`, `.q-more {`
- A part read after the first drawing holds its place in the shape that's coming — `kit/ui.mjs`, `kit/orbit.css`, `tools/live-scroll.mjs`: `export function waiting`, `.q-wait .q-wait-bit {`, `const late = async`
- One date selector — `kit/ui.mjs`: `export function dayBar`, `export function dayStrip`
- The kit's own dialogs, never the browser's — `kit/orbit.mjs`: `export function ask`, `export const tell`
- The keyboard never pushes content off screen — `kit/orbit.mjs`: `watchKeyboard`
- Add to Home Screen gate — `kit/orbit.mjs`: `installGate`
- Orbit, every app in one home-screen app: one sign-in, a switcher, back and forward across apps, each app reopened where it was left — `kit/suite.mjs`, `kit/orbit.mjs`, `site/app/index.html`: `export function inSuite`, `export function back`, `export function forward`, `export function resumeOf`, `orbit.suite.v1`
- Orbit keeps every app opened running in its window (a frame each): back shows it as left, an app playing sound (Beats) never closed, at most 3 quiet ones kept — `kit/suite.mjs`: `export function host`, `export function toClose`
- Orbit opens on an app with something live, else the last app within an hour (an Orbit the phone kept), else the app list (last app on top; always after Orbit was closed, every app at its start); signed in to the Pass first — `kit/suite.mjs`, `site/app/index.html`: `export function launchTarget`, `export function setLive`, `door-sign`
- A separate app recommends Orbit in a quiet banner (once a day at most, 打開 Orbit, one-tap 不再顯示 kept for good) and on its add-to-home-screen page — `kit/orbit.mjs`, `kit/orbit.css`: `export function tipDue`, `export function orbitTarget`, `q-orbit-tip`, `q-gate-orbit`
- Orbit shows the apps open as tabs at the foot (a trip or timer first, marked 進行中), each closable with ✕ in the switcher, and slides between apps with no white flash — `kit/suite.mjs`, `kit/orbit.css`: `function drawTabs`, `q-suite-tab`, `q-suite-x`
- Grids of apps and icons keep even rows at every width (ten apps five by two, never a lonely last row) — `kit/ui.mjs`: `export function evenCols`, `export function evenGrid`
- Several Orbits on one home screen, each with its own name, apps (one is fine) and icon out of 34, set up before Add to Home Screen and never required; each its own manifest from a tag in its address — `kit/orbit-mine.mjs`, `orbit-manifest.js`, `site/app/index.html`: `export function encodeSetup`, `export function orbitManifest`, `export function handleOrbitManifest`, `function setupPanel`
- An Orbit's apps changed inside it (from home or the ⌄ sheet, a one-app Orbit too), kept per Orbit and on the Pass (newest wins) — `kit/orbit-mine.mjs`, `kit/orbit.mjs`, `kit/suite.mjs`, `kit/orbit.css`, `site/app/index.html`: `export function mergeMine`, `export async function syncOrbits`, `function editApps`, `editApps: edit ?`, `q-sw-edit`
- A separate app opened in the browser goes to a one-app Orbit's add page (installed separate apps untouched) — `kit/orbit.mjs`: `location.replace(startOf(encodeSetup({ apps: [app], id: newId() })))`
- Orbit's address shows the app on screen (`/sports/`), and a reload comes back into Orbit — `site/app/index.html`, `kit/suite.mjs`: `function addressOf`, `function reloadedInOrbit`
- Every Orbit icon and app icon in the moon style: the family's ten app-colour moons, each app's own moon lit in its ring — `kit/brand.mjs`: `export function orbitIcon`, `const moonRing`
- Orbit's home: the app to go on with as one card (something under way first, 進行中), then this Orbit's apps as a home screen's icons in even rows, and a button to choose them — `site/app/index.html`: `door-hero`, `door-tile`, `door-edit`
- Orbit's own loading screen when opened from its icon (its mark, name and indigo, not the app's) — `kit/boot.js`, `site/app/index.html`: `orbit.launch`, `q-boot-orbit`
- Updates swap only once every file is on the phone — `kit/orbit.mjs`: `updateReady`
- Pass: 里程碑 medals, passkeys, 除錯紀錄 — `kit/pass.mjs`, `kit/help.mjs`, `kit/orbit.mjs`: `里程碑`, `passkey`, `除錯紀錄`
- Anyone makes a pass on the sign-in screen with an email proved by a code (one account an address; a device signed in before is pointed to finding its pass), at the 基本 level (no AI); its AI taps shown locked before a tap, a tap says why — `kit/orbit.mjs`, `kit/pass-mail.mjs`, `kit/orbit.css`: `q-gate-make`, `export function createPanel`, `HAD_KEY`, `export function passLevel`, `export function aiLock`, `data-ai-lock`
- Orbit AI allowances: a day, a month or in all, until a date, for a level, one account or every account there is now; counted only when a model is asked; what's left on the Pass sheet — `ai-allow.js`, `eco-admin.js`, `site/admin/index.html`, `kit/orbit.mjs`, `kit/ai.mjs`: `export async function aiSpend`, `'ai-grant-all'`, `id="ai-allow"`, `export function aiLeftText`, `function aiRows`, `error === 'used'`
- An invite QR in admin opens Orbit's sign-up at once (`/app/?join`) — `site/admin/index.html`, `kit/orbit.mjs`: `id="tool-invite"`, `[?&]join`
- One sign-in screen in every app and Orbit (Orbit's mark with the apps circling it) and the passkey nudge banner — `kit/orbit.mjs`, `kit/orbit.css`: `export function orbitRing`, `.q-orbit-ring-spin`, `export async function signInScreen`, `export function quietTip`
- Pass recovery email: linked by a mailed code, a lost pass recovered by one (then a new pass), a quiet tip to add one — `pass-mail.js`, `kit/pass-mail.mjs`, `kit/orbit.mjs`: `export async function mailRecover`, `export function recoverPanel`, `export function mailRows`, `export function mailTip`, `s.mailBegin`
- Anonymous usage counts (no id, no content; GPC respected), a one-time note, Pass › 隱私 › 使用統計 off switch, admin 使用 — `kit/usage.mjs`, `usage.js`, `kit/orbit.mjs`, `site/admin/index.html`: `export function cleanBeacon`, `export function takeUsage`, `export function usageNotice`, `function usageRows`, `async function loadUse`
- Privacy policy and terms of use, Chinese and English — `site/privacy/index.html`, `site/terms/index.html`: `privacy@jaypengx.com`, `Terms of Use`
- Data requests by mail to privacy@ answered by code: a 24-hour link to download a copy (once in 30 days), delete the Pass or stop stats; the recovery email proves it, else the pass — `privacy-mail.js`, `site/privacy/request/index.html`: `export async function privacyMail`, `export async function privacyDo`, `PRIVACY_EXPORT_WAIT`, `export function mailLang`, `export async function unpack`
- The data copy: each app unpacked into readable JSON under its name, times as dates, and a readable web-page copy on the download page — `privacy-mail.js`, `site/privacy/request/index.html`: `betweenApps`, `const readable`
- Every notice banner one kind: the same time on screen, swiped away up or sideways — `kit/orbit.mjs`: `export function noticeLife`
- A typhoon day off acts like a holiday — `kit/dayoff.mjs`: `dayOffOn`, `loadDayOff`
- Law's 代表會 recordings play on iPhone — `law-audio.js`: `handleLawAudio`, `audioType`
- Law's live feed keeps its last good read — `law-live.js`: `KEY_LAST`
- One account, many places: what an app is in the middle of goes to the Pass from the place that runs it and is handed to the place that takes it over; the family's notebook follows the account, so separate home-screen apps hear each other — `kit/orbit.mjs`, `kit/family.mjs`, `eco.js`: `s.putNow = `, `emit('now', shelf)`, `mergeHeard`, `orbit-family`, `NOW_COLLECTION`, `mergeShelf`
- AI spends only on what someone opens: a story's 重點整理 and 各方怎麼說 made on first open and kept for everyone, without thinking; only 頭條's lead stories made ahead; a maker whose last call failed skipped for its backup; each maker's day cap — `ai-open.js`, `ai.js`, `gemini-use.js`: `export async function handleAiOpen`, `export async function newsOpenAhead`, `BULK_PAUSED`, `SICK_MS`, `PROVIDER_DAY`
- Admin alerts by mail: what 健康 and 額度 show red mailed to the owner from the domain, each problem once a day, never at night but a stopped proxy, fixed ones said — `mail-alerts.js`, `mail.js`: `export function plan`, `export async function mailAlerts`, `export async function sendMail`
- Admin 寫信: five looks (公告, 短信, 更新, 邀請, 感謝) and the app colours, a live preview that is the mail sent, a try to yourself first — `site/admin/mail-look.mjs`, `site/admin/index.html`, `eco-admin.js`: `export const MAIL_LOOKS`, `export function mailRender`, `cm-frame`, `'mail-send'`
