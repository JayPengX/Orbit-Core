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
- Orbit's home: the app to go on with as one card (something under way first, 進行中), the apps used lately, then the rest as slim rows — `site/app/index.html`: `door-hero`, `door-row`
- Orbit's own loading screen when opened from its icon (its mark, name and indigo, not the app's) — `kit/boot.js`, `site/app/index.html`: `orbit.launch`, `q-boot-orbit`
- Updates swap only once every file is on the phone — `kit/orbit.mjs`: `updateReady`
- Pass: 里程碑 medals, passkeys, 除錯紀錄 — `kit/pass.mjs`, `kit/help.mjs`, `kit/orbit.mjs`: `里程碑`, `passkey`, `除錯紀錄`
- Orbit's sign-in page (apps circling its mark) and the passkey nudge banner — `site/app/index.html`, `kit/orbit.mjs`: `const orbitRing`, `export async function signInScreen`, `export function quietTip`
- Pass recovery email: linked by a mailed code, a lost pass recovered by one (then a new pass), a quiet tip to add one — `pass-mail.js`, `kit/pass-mail.mjs`, `kit/orbit.mjs`: `export async function mailRecover`, `export function recoverPanel`, `export function mailRows`, `export function mailTip`, `s.mailBegin`
- A typhoon day off acts like a holiday — `kit/dayoff.mjs`: `dayOffOn`, `loadDayOff`
- Law's 代表會 recordings play on iPhone — `law-audio.js`: `handleLawAudio`, `audioType`
- Law's live feed keeps its last good read — `law-live.js`: `KEY_LAST`
- One account, many places: what an app is in the middle of goes to the Pass from the place that runs it and is handed to the place that takes it over; the family's notebook follows the account, so separate home-screen apps hear each other — `kit/orbit.mjs`, `kit/family.mjs`, `eco.js`: `s.putNow = `, `emit('now', shelf)`, `mergeHeard`, `orbit-family`, `NOW_COLLECTION`, `mergeShelf`
- AI spends only on what someone opens: a story's 重點整理 and 各方怎麼說 made on first open and kept for everyone, without thinking; only 頭條's lead stories made ahead; a maker whose last call failed skipped for its backup; each maker's day cap — `ai-open.js`, `ai.js`, `gemini-use.js`: `export async function handleAiOpen`, `export async function newsOpenAhead`, `BULK_PAUSED`, `SICK_MS`, `PROVIDER_DAY`
