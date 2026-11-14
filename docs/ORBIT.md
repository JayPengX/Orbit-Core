# Orbit: how it behaves

Orbit (`orbit.jaypengx.com/app/`, `kit/suite.mjs`, `site/app/index.html`)
holds the apps in one home-screen app: every app, or the ones a person picked
(a home screen can hold several Orbits). This page is the rule for what the
person sees in each case. A change to Orbit's behaviour starts here, and a
case that behaves otherwise is a bug. (Jay 2026-11-14: "small behavior quirks
you need to think more about": each was fixed one at a time until this table.)

Words used below:

- **Home**: Orbit's own screen. It shows the app to go on with as one card,
  then this Orbit's apps as a home screen's icons in even rows (ten: five by
  two), then a button to choose which apps the Orbit holds.
- **Tab**: an app open in Orbit. Tabs sit beside the ⌄ switcher at the top
  line's left, or at the rail's foot on a wide screen.
- **Live**: something under way that the person expects to keep running:
  a Transit trip, a YouBike rental, a bus alert counting down, Class's
  專注飛行, or Beats playing.
- **進行中**: how a live app's tab, card and switcher row say it is live.
- **Closed**: Orbit swiped away in the app switcher, or the phone restarted.

## The table

| # | When | What the person sees |
| --- | --- | --- |
| 1 | Orbit opened, not signed in | The sign-in itself, before anything else (the pass or a passkey; Orbit's mark with its apps circling it, beside the form on a wide screen), never the Pass's settings. Once signed in: rule 2 or 3. |
| 2 | Orbit opened after it was closed, nothing live | Home. Every app starts fresh at its own start. |
| 3 | Orbit opened after it was closed, something live | The app looked at last, where it was left. The live app is a 進行中 tab beside it. If the live app was the one looked at last (or there's none), that app at its start, which shows what's under way. |
| 4 | Back to Orbit without closing it, within an hour | Exactly as left: the same app, screen and scroll, and every tab as it was. |
| 5 | Back after an hour or more, nothing live | Home, over the tabs, which are still open as they were. |
| 6 | Back after an hour or more, something live | As rule 4: as left. |
| 7 | A tab tapped | That app exactly as left, with no reload and an animated switch. |
| 8 | The 進行中 tab tapped (or the 進行中 card on home, or its row in the switcher) | What's under way, in full: a Transit trip's navigation, never its small bar. Other live apps show as left. |
| 9 | Switching to another app while a trip is in full navigation | Allowed straight away: the switcher is a button on the trip's own bar (beside ⋯ and 結束), never floating over the step's card. The trip goes on, and Transit's tab says 進行中. |
| 10 | A trip minimized in Transit | Transit stays on its own screen with the trip's bar. In every other app, Transit's tab says 進行中. |
| 11 | A trip or timer ends | Its 進行中 goes within 15 seconds. The tab stays as a plain tab. |
| 12 | A tab closed with ✕ in the ⌄ switcher | It's gone. If it was showing: the latest other tab, or home if none. A live app has no ✕: it's ended in its own app. |
| 13 | More than 3 quiet tabs | The one used longest ago closes quietly. Tapped later, it opens again where it was left (a short load). Live and playing apps are never closed. |
| 14 | A notice, link or cross-app action (今天, 問 Orbit, 去球場 …) | That app opens as a tab, on that screen. The app it came from stays a tab. |
| 15 | The page of an app scrolled to its top or foot | It bounces natively (on a phone the app's page scrolls in its body, so the bounce moves the page only), and the app's tab bar never moves, nor does Orbit's window (not even by the scroll bar's handle). Pull-to-refresh at the top still works. |
| 16 | An app's own home-screen icon (a separate app) | It never opens inside Orbit. At most once a day a quiet banner recommends Orbit: 打開 Orbit, or 不再顯示 (one tap, never again on that device). |
| 17 | Loading (Orbit or an app) | Orbit's own loading screen: its mark and colour, with the app's name (Orbit at launch). An app switched to comes up over the one left only once it has painted, so never a white flash, in dark mode too. |
| 18 | Orbit's add page, in the browser | Add it right away as it is: every app, named Orbit, the family icon. One quiet row above the steps, 自訂名稱、App 和圖示, opens the setup: a name, which apps (one is fine) and an icon out of 34 (twelve colours with the apps' coloured moons, the same with white moons, or an app's own icon). 完成 comes back to the add page, now with that name and icon. Setup is never required. |
| 19 | Several Orbits on one home screen | Each icon is its own Orbit: its own name, icon and apps, and its own manifest (`/api/orbit-manifest?o=…`). What tells them apart is a tag in the address the icon opens (`/app/?o=…`), which is the setup itself plus the Orbit's own id, minted when the add page opens, so nothing is stored anywhere and two Orbits never share the apps changed in one (Jay 11-14: a new Orbit opened with another's apps). |
| 20 | Inside an Orbit of some apps | Only its apps: on home, in the switcher and among the tabs. 選擇這個 Orbit 裡的 App, on home and at the foot of the ⌄ sheet, changes them, and the change follows the Pass to the same Orbit on another phone. Its name and icon stay as added (a phone can't change a home-screen icon). |
| 21 | A one-app Orbit | Opens straight into its app, with its ⌄ alone at the top. Its sheet shows that app alone and 在 Safari 設定新的 Orbit (Safari, the add page's setup): no other app is put in it (Jay 11-14, reversing "select more"). Made on the add page with one tap on an app, or in setup with one app picked: its name and icon are that app's, locked. An Orbit of several keeps two apps at least. |
| 22 | A separate app's page in the browser, not yet added | Goes to the add page of a one-app Orbit of that app. A separate app already on a home screen is untouched (rule 16). |
| 23 | The address bar | The app showing (`/sports/`, `/transit/` …) or `/` on home, never the setup (the add page alone keeps its tag). A reload comes back into the same Orbit. |

## Where each rule lives

- 2, 3, 5, 6: `launchTarget` and the fresh-launch reset in `site/app/index.html`.
- 4, 7, 12, 13: the frame host (`host`: `show`, `close`, `toClose`, `KEEP`).
- 8: the host's `full(id)` and `takeFull(id)`, which Transit reads at its start and
  on the window's `orbit-full` event.
- 9: `openSwitcher`, from the `apps` button on Transit's trip bar (`nav.mjs`).
- 10, 11: `setLive` (from the kit session's `putNow`) and the host's 15-second redraw.
- 15: `ownScroll` (suite.mjs) and `html.q-own-scroll` in `orbit.css`, phones only (overscroll-behavior on a framed root stopped Safari's wheel on a Mac); the host's `still`.
- 17: `kit/boot.js` (`framed`), the host's `raise` and `.q-suite-under`.
- 16: `start()` only runs inside Orbit's window (`inSuite`); the banner is `orbitTip` in `orbit.mjs`.
- 18–21: `setupPanel` and `editApps` in `site/app/index.html`; the tag, the
  manifest and the apps kept per Orbit in `kit/orbit-mine.mjs` (`syncOrbits` in
  `orbit.mjs` for the Pass); the manifest served by `orbit-manifest.js`.
- 22: `installGate` in `orbit.mjs` (before it, `isStandalone` returns: an
  installed separate app never moves).
- 23: `addressOf` in `site/app/index.html`; a reload: `reloadedInOrbit` in
  `suite.mjs`, and the home page sends an installed window back to `/app/`.
