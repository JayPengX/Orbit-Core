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
- Orbit's own loading screen when opened from its icon (its mark, name and indigo, not the app's) — `kit/boot.js`, `site/app/index.html`: `orbit.launch`, `q-boot-orbit`
- Updates swap only once every file is on the phone — `kit/orbit.mjs`: `updateReady`
- Pass: 里程碑 medals, passkeys, 除錯紀錄 — `kit/pass.mjs`, `kit/help.mjs`, `kit/orbit.mjs`: `里程碑`, `passkey`, `除錯紀錄`
- A typhoon day off acts like a holiday — `kit/dayoff.mjs`: `dayOffOn`, `loadDayOff`
- Law's live feed keeps its last good read — `law-live.js`: `KEY_LAST`
