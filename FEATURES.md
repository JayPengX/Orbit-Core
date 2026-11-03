# Features kept

Every feature the kit gives all the apps, with the code that makes it.
`tests/features.test.mjs` fails if any mark below disappears, so a refactor cannot
drop a feature silently (2026-11-03, after the lost-features audit).
To remove a feature on purpose, delete its line here in the same commit and say why.
- One tab bar (the floating capsule; a rail on wide screens) — `kit/orbit.mjs`: `export function tabBar`
- Every screen size: screenFit, wide sheets, columns of even height — `kit/orbit.mjs`, `kit/ui.mjs`: `screenFit`, `q-sheet-wide`, `export function flowColumns`
- A live update never moves the page — `kit/hold-place.mjs`, `kit/ui.mjs`: `scrollBusy`, `scrollers.push`
- One date selector — `kit/ui.mjs`: `export function dayBar`, `export function dayStrip`
- The kit's own dialogs, never the browser's — `kit/orbit.mjs`: `export function ask`, `export const tell`
- The keyboard never pushes content off screen — `kit/orbit.mjs`: `watchKeyboard`
- Add to Home Screen gate — `kit/orbit.mjs`: `installGate`
- Updates swap only once every file is on the phone — `kit/orbit.mjs`: `updateReady`
- Pass: 里程碑 medals, passkeys, 除錯紀錄 — `kit/pass.mjs`, `kit/help.mjs`, `kit/orbit.mjs`: `里程碑`, `passkey`, `除錯紀錄`
- A typhoon day off acts like a holiday — `kit/dayoff.mjs`: `dayOffOn`, `loadDayOff`
- Law's live feed keeps its last good read — `law-live.js`: `KEY_LAST`
