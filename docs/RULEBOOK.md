# Orbit's rulebook

How to work on Orbit and every rule Jay (the owner) has set for the whole family. Dates are
Taiwan's day of Jay's word; when two lines differ, the newer wins. A rule that belongs to one
app lives in that app's `MAP.md` under **Rules**, in the same form; how a screen looks, in
detail, is `DESIGN.md`. A rule Jay changes is edited here (or in the app's MAP.md) in the same
push, the old version moved to §6 so nobody brings it back. These are strong defaults: when one
clearly makes a result worse, say so in a line rather than follow it blindly.

## 1. Working and shipping

**The owner.** Jay owns the family and decides what the products are. He judges the apps on his
iPhone and iPad (home-screen apps, Safari's engine), sends lists, screenshots and 除錯紀錄 from
the Pass sheet, lives in 新竹 (every app works for all of Taiwan), and doesn't read code: talk in
plain words and screenshots, and when a change touches structure say what moved and why in a
sentence. He values, in order: speed of delivery, clean code, efficiency, low cost, reuse. Other
people use the apps too, so polish matters for strangers. His complaints are a customer's
(11-03): find the cause and design what's best, never take his words as specs or stretch them
into absolutes; push back when a rule makes things worse.

**How to work.**
- 10-18 Fully automatic: build fixes and features without approval, then report in plain words. Decide, then tell (one line, so he can reverse it); ask only when a choice is truly his.
- 10-18 Never idle: never wait on another thread, a check or a merge; start the next independent item. Threads keep working overnight; a morning summary is not a stopping point (11-11).
- 10-18 Only what the task needs in context; helpers get only the files and checks they need and return short reports.
- 11-03 The right model and effort per task: the strongest model at high effort or more for design, architecture, the kit, anything across apps and anything that regressed before; lighter tiers only for mechanical work; always set both; do small jobs yourself. (Fable only for the hardest work, 11-11.)
- 10-19 Concrete work only: no general polish sweeps; walk the screens you changed.
- Fast and whole: the smallest correct change, the same fault fixed everywhere it lives, and any doc it made wrong, in the same round. Find the real cause and say it in a sentence; fix the rule, not the case (no hard-coded exception for the place Jay tested).
- 10-20 Prune whole: what goes is deleted everywhere (code, tests, help, proxy, data); no `off` flags, no backward-compatibility code, nothing kept "in case". Refactor freely while the tests pass.
- 10-30 "Faster" means a substantial, measured improvement: find where the wait really goes, cut it structurally, report before/after times.
- 10-23 Secrets stay sealed in Cloudflare/GitHub; never ask Jay to dig up keys. While he's away or quota is out: don't ask, wait for the reset and resume.
- Questions to Jay: tap options (a decision card, with "Other"), never typed questions, never overnight; one message when everything is done. Flag anything waiting on him at once.
- 11-06 A finished round's report is a new document written from scratch, each point led by before → after numbers; never the old one with dated sections stacked on (his recap too, 11-10).
- 11-11 Threads: resolve one as soon as its work is done and checked, rename it to its current scope, reuse an existing thread for a repeat; do related work together in one thread.
- The coordinator posts a digest (Live / In progress / Waiting on) only when something shipped.
- Files for Jay go into the project's shared folder by category (its `INDEX.md`), nothing loose at the top.

**Shipping.**
- 11-01 Only `main` exists in every repo: no branches, no PRs, never the session's `claude/...` branch even when a session's setup asks. Push with `sh ../Orbit-Core/tools/push.sh` (in Orbit-Core `sh tools/push.sh`) and nothing else (10-21, 10-22: never ask before pushing, kit included).
- 11-03 No "run failed" emails: `push.sh` rebases onto `origin/main` (10-21: never push a tree from an old checkout; a stale push once wiped Law's 裁判), runs what the deploy runs (the repo's tests against main's kit, Class's build, every app's tests on a kit change, the layout check) and pushes only when they pass.
- 10-22 Kit order: Orbit-Core first, wait for `pages.yml`, then the apps; never a cancelling `concurrency:` in a workflow (copy the `queue` job); builds check out main's tip.
- 10-22 Orbit-Securities: after a push, confirm its deploy started; if not, run `deploy.yml` by hand. Every thread confirms its deploy went green.
- 10-19 No separate test step and no Mac gate: check your own cloud screenshots (WebKit), push, Jay tests on his phone.
- 11-01 Every site is on Cloudflare under Jay's domain; GitHub keeps the code only (Pages off). A job that fetches or serves data runs in a Worker (edge cache, the existing crons, a Durable Object alarm), never a workflow writing to git. Actions keep build, test, deploy and only what Cloudflare can't do, writing to Cloudflare, never the repo; all inside the free plans, anything that could pass them put to Jay first.
- Tests for logic only (money, data, ranking, planning, settling: where a bug is silent), plus a guard test for every fixed bug. 11-03 Never a test that locks a design choice (a tab order, a layout): it makes the next change look like a regression.
- 11-03 Never reorder an app's tabs or change the tab it opens on without asking (Transit opens on 地圖).
- Features are listed: each repo's `FEATURES.md` names every feature and its code; its test fails when a mark goes. A new feature gets a line; one removed on purpose loses it in the same commit; a refactor that trips it brings the feature back.
- Commits: one plain line of what a person sees, numbers when there are numbers. Replies: a few lines (what changed, what he'll notice, any call you made, anything not checked).

**Code.**
- 10-27 Anything two apps use lives in the Orbit-Core kit, never copied; look first (`node tools/kit-find.mjs <word>`, `--apps` finds copies) and move duplicates there when you see them. 11-03 Apps stay thin: device storage, Pass sync, patching a screen in place and every shared piece are the kit's; an app keeps only what is truly its own.
- A new kit export is read with a fallback (`kitUI.newThing?.(…)`): a phone may still run an older kit, and importing a missing name stops the app. Once every phone has the kit it can go direct.
- One rule, one function, used by every view that shows it (Sports' `onAir`), so screens can't disagree. UI from the kit; draw your own only for what is truly the app's (a pitch, a map, a chart).
- Ids never change with a name (storage keys, cache names, manifests' `id`). Saved copies carry a version in their key (`fx.day.v4`), bumped when the meaning changes. A failed read is a failure, never "nothing there", and is never saved; never an older copy over a newer one.

**Docs.**
- 11-11 One structure, nothing twice, short enough to read before every task: the layout is in Orbit-Core's `CLAUDE.md`. Each fact has one home and is linked elsewhere; a doc is updated in the same push as the change that made it wrong; no handoffs, plans or logs in repos (the git log is the history).
- 11-03 Orbit-Core's `MAP.md` names every part of the architecture (`tests/claude-map.test.mjs`) so nothing is built twice.

## 2. Every app (family product rules)

**Principles.**
- 10-18 As real as Taiwan: real brokers, buses, trains, TV; remove what isn't real, add what is.
- 10-20 One quality, one family: every app works and feels the same. Chinese (Traditional, Taiwan) first, in Taiwan's words; English second.
- Real data, no guessing: a dash, not a made-up 0; 待定 when a time isn't set. Rules on real data decide what people see, not AI. 10-21 Never invent user data (no guessed 要帶 in Class, no made-up balances).
- Visual over text: icons, colour, pictures; no hints for the obvious, no source names or back-end notes on screen; automatic over buttons (10-21: no manual "check results" buttons). One question per tab.
- Every Orbit app sits behind the Orbit Pass and asks for Add to Home Screen on a phone (exception: Showcase).
- 10-21 AI editors can do anything the app can do by hand. 10-21 Never blame the network for a slow AI or a failed update.
- 10-20 Real logos and headshots, never letter tiles; pictures for everything that has one. 10-20 First-tap bugs are bugs: a button never needs two taps.
- 10-21 Stats show the current season; last season only where this one is empty. 10-21 Past-game pages show only that game's data. 10-21 One layout per page across states (before, live, after). 10-21 Reflect results the moment they happen: never hide data because a feed is stale; compute from live results.
- 10-21 No cross-app spending pop-ups; notification permission asked at most once.
- 10-23 Every team name in Chinese (`kit/names.mjs`); people in their own English names in both languages; never transliterate.
- 10-23 A typhoon day off (停班停課) acts like a holiday in every app (kit `dayoff.mjs`).
- 10-27 One app order everywhere the apps are listed: Sports, Transit, Weather, Class, Money, News, Words, Beats, Law, Securities (kit `APP_ORDER`, never a list of its own; Securities, the play-money game, last).
- 10-27 One language at a time: every page all Chinese or all English by the Orbit language; names in English where a source has them (kit `place()`); only what has no English stays Chinese, marked `lang="zh-Hant"`. `tools/gate.mjs` flags `mixed`.
- 11-06 No guard for people outside Taiwan: no country, clock or GPS checks, nothing closed abroad. English for a phone that lists no Chinese; 'today' by the phone's clock. °C and NT$ only.
- 11-06 A permission is asked when it's needed, never blocking; saying no never closes an app (it falls back). Location when an app opens on where you are (Transit's map, Weather), else on a tap; the compass only from a tap on 我的位置, once a launch, never after a no; the microphone on 錄音; notices on a switch or a tapped 允許. An answer is remembered.
- 11-10 Links out: iOS's quick view stays the default; one Pass switch (連結 › Safari App, following the pass everywhere) sends every app's links to Safari itself (kit `linkHref`/`openLink`). Links into other apps (YouTube, Maps, 高鐵 T Express) are iOS's either way; 高鐵訂票 offers T Express first.
- 10-27 Addresses: every app at `orbit.jaypengx.com/<short>` (one origin, one Pass sign-in), the proxy at `api.jaypengx.com`, the bare `jaypengx.com` Jay's own homepage (handle JayPengX only: no real name or school; no betting; open to all) with the showcase at `/showcase/`. Clean breaks, no redirects.

**Speed and steadiness.**
- 10-20 The loading screen lifts once, onto finished content, fast; nothing pops in after. 11-03 It lifts only after the opening's update check answered (at most 3 s past the app's readiness, at once offline: kit `boot.js`).
- 11-06 An update opens on its first opening, as fast as it can, never "next time": on a link that answered quickly the service worker opens the server's page itself (`sw.js pageFirst`); on a slow one the kept page opens and the 11-03 hold stands. A page already open is never swapped in front of the person: it swaps as they come back after 5 minutes away (`AWAY_MS`).
- 10-20 Slow internet must work: hashed files, nothing downloaded twice, no cache wipe on update.
- 11-01 Smooth in everything: a tap answers in the same frame; a sheet opens at once on what's known, shimmering places the size of what comes. 11-03 Instant everywhere: a screen paints at once on what the phone or the edge has and refreshes behind (stale-while-revalidate, never for a live number shown as live); a tap shows its result at once and settles when the server answers (undone with a word if it fails); what the person opens next is read ahead while idle, from the edge's cache, never a paid call.
- 11-01 A live update never moves the page (`kit/hold-place.mjs`); apps patch in place, never rebuild what didn't change; live beats wait while a finger is down. 11-03 Nothing jumps from the person's own taps either: a tapped control stays under the finger; a sized sheet never shrinks under the finger; a list being read is drawn as rows the size of those coming, never "none" before the day's reads are in. 11-03 A part read after the rest holds its place from the first drawing (kit `waiting(shape)`; Sports' `later()`), never a card popping in above what's read.
- 11-05 A live page holds still in Safari too: only a scroll the code asks for may move a held place; a scroll nobody made is put back. 11-05 Dragging iOS's scroll bar moves the page smoothly. Check with `node tools/live-scroll.mjs <app> --webkit`. 10-21 Test UI in WebKit, not only Chromium.
- 11-05 A tab you come back to is as you left it (place and drawing); a detail tapped in one tab opens over that tab, the same way for every kind.
- 10-21 The keyboard never pushes content off screen; the iPhone's own keyboard, never an in-app keypad (kit `watchKeyboard`). Input bars sit above the keyboard.

**The frame.**
- 10-27 One tab bar in every app: the kit's floating capsule (`tabBar`); an in-progress bar is a `.q-accessory` pill above it. 10-30 It stays whole while scrolling; the round action beside it is smaller than the bar, on its middle.
- 11-05 A swipe up to leave the app never picks a tab: a touch in the strip along the screen's foot picks only when the finger lifts; the bar stays as low as iOS's own.
- 10-22 One date selector in every app (kit `dayBar`/`dayStrip`). 11-06 At most a week on a wide page; 11-10 the week spans the page's width with 📅 at its end.
- 10-31 A sheet never scrolls sideways (`.q-sheet` `overflow-x: hidden`; date fields `appearance: none`, `min-width: 0`). 10-21 No wraps, orphan pills, cut numbers, sideways tables or scrolling sheets. 10-20 Balanced cards at any count, long names never wrap badly.
- 10-31 Never the browser's own popups: the kit's `ask()`/`tell()`/`confirm()`; a one-tap delete gets a 復原 toast (the admin page is the one exception left).
- 10-31 Every screen, either way up: a phone upright (320–440) or on its side, a tablet, a computer, each laid out for its own space (DESIGN §10). 11-01 Wide screens show more at a glance, not a phone's view made bigger. 11-06 A computer (mouse or trackpad, 1000 px+) gets a side bar (`html.q-desk`); an iPad keeps its rail. Details and the 11-06/11-11 layout rules: DESIGN §10.

**AI** (11-10, 11-11).
- 10-19 Paid AI runs only behind a person's tap, never automatically.
- 11-11 Code first: no AI where code reads or formats reliably; numbers come from code and AI only words them.
- 11-10 AI gets a small code-picked digest of what the page doesn't already show (insight, never a repeat of the card); prompts are crafted and tested (`/ops ai-try`); it asks back with tap pickers from the person's own lists where that helps; each call's cost shows in admin.
- 11-11 An AI answer is never plain text: it is drawn (kit `aiAnswer`: rows with icons, logos, faces, bars), with a skeleton of its shape while it's made (`aiAnswerWait`). Names in its words are chips: a player with their face, a team with its logo (`.q-ai-ref`).
- 11-11 Every smart feature, code-only ones too, carries the Orbit AI mark (kit `icons.ai`, `--q-ai`), never a sparkle.
- 11-11 A fallback is the same class from another maker (Sonnet ↔ GPT Sol for judgement, Haiku ↔ Luna for writing, Flash only for pictures and the cheapest), each answer naming its model in admin.

## 3. Design

How to apply these: `DESIGN.md`. The rules:
- 11-03 Orbit's own look (原生 Native) in all nine apps, every page: `<html data-look="native">`, graphite cards, colour only on what it names (`.q-band`), the app's colour for now and the main action (DESIGN §11). It is a UX redesign: layouts, navigation and flows may change, every feature kept (`FEATURES.md`).
- 11-03 Orbit's own design, never another app's (Apple's Weather, Sports, Stocks or anyone's: no layout, signature piece or look). Today's dark page is the base, never a sky, photo or colour filling the screen; one colour to a surface, never two clubs' colours blended. Each home is built around the person's day and the app's content, not one template. A new look change is shown to Jay before it ships.
- 10-27 One focal point a screen; weight 700 only for the focal number and large titles; the accent as a pointer (about 4 uses); chips only for taps or exceptions; one radius; 4-point spacing. Fix with design principles, change the kit, not every screen. 11-03 The accent is for meaning only (the tab you're on, live, a chart's line); buttons, numbers and strips are graphite; a home club is a small house after its name; in a game list a soft grey ★ 推薦 row marks the day's picks.
- 10-27 Tight spacing: 24 between sections, 16 between groups and after the focus, 8 under a line naming what follows; no gap bigger than what it separates.
- 10-19 No app-name title, no intro or status lines over content: open straight onto content. Top bar: the account pill and at most one tab action; help in the Pass sheet; refresh by pull. One sheet, one empty state, one segmented control (a whole view, at most 4), chips for filters, all from the kit.
- 11-03 One "more": the kit's quiet bar (`moreToggle`, `.q-more`), never accent text. 11-03 Never an accent-coloured text link (`tools/gate.mjs` `links`).
- 11-03 No uneven grid anywhere: like tiles fill every row (`fullRows`, `.q-rows-full`; a grid to pick from keeps every item, `.q-rows-keep`).
- 11-03 A long name stays on one line at its row's size: the short form where it fits, the room made for it, the last name alone only where nothing else fits; never smaller, never an ellipsis.
- 11-03 One way to put a list in order: a grip (three lines) at the row's end, held and dragged (kit `reorder` + `grip`); never arrows or 往前/往後.
- 10-22 Colour only where it means something (win or loss, a live state). 10-21 No bright white surfaces in dark mode; logos on their tile (`--q-logo-bg`), never white plates or see-through.
- 10-19 Nothing cut, no duplicates, no emoji icons, real logos, every sheet in the kit's style; check 320 and 390, light and dark, in WebKit.
- 10-23 App icons: each app its own bright hue, a big white symbol over the family ring; share cards are icon, name and one line (`kit/brand.mjs`). 10-23 Avatars: 96 drawn looks, never emoji; the signed-in dot small on the rim; picking a look shows no pop-up.
- 10-27 Maps weighted by relevance: markers get quieter, never hidden (DESIGN §7).
- 10-30 / 11-01 The tab rail is slim (60 wide), the pick a capsule hugging its tab. 11-06 It is the same in all apps and one column (tabs, round action and account one width), shaped by the kit alone (`kit/frame-guard.mjs`).
- 11-06 One layout for every screen: wide pages and sheets are built from kit pieces that read their own box (`.q-cols`, `.q-flow`, `.q-grid`, `.q-split`), and every push runs `tools/layout-check.mjs` (320, iPad, laptop: no narrow band, empty half, lone shrunk card or overflow). 11-11 A wide page balances by what's in it (`.q-flow-refit`), a heading search or total runs across the top, a grid fills rows evenly, a day strip stays one scrolling row, a picture tile at most twice its size (`.q-rows-snug`).
- Before calling UI done (Jay's test): open every tab and sheet you changed at 320 and 390, light and dark, phone on its side, tablet and computer (`node tools/shots.mjs <app> --before main`, 10-30); look for overflow, cut text, duplicates, small logos, emoji, empty screens, leftover old sheets; run `tools/gate.mjs`.
- 10-30 Screenshots are authentic: the world's data always live; only what a person keeps in their account comes from a demo account built by using the app. 10-27 Framing edits are fine (crop, a zoomed callout, a headline, a background), content edits never. 11-01 One set for the READMEs and the showcase, both languages (`tools/store-shots.mjs`), nothing used twice in a set. 10-28 Shot 1 is the app's strongest hero screen; niche or just-asked features later.

## 4. Data, money and cost

- 11-06 Only the domain is paid: Workers Free (heavy routes and crons' work in the Runner DO), TDX free tier, Google free tiers; everything runs by itself. 11-10 AI is the one exception: billing on for Anthropic, OpenAI and Gemini, prepaid as a hard stop where offered; a blind side-by-side test picks the model. Tests and our tools count against the same free amounts.
- 11-05 Never billed past what's included, and slowed only for real: the guard paces only once a count's real share passes 60/75/85% and the rate would reach the stop; a forecast is a warning in admin, never a slow-down; at 85% the basics first (sign-in, sync, notices) and nobody new let in. Paid outside APIs stop inside their free amounts (Maps at 90% of each SKU, Google Weather under its month).
- 11-06 Save quota hard, never at the person's cost: every request, CPU ms, KV/R2/D1 op and outside call cut wherever the person sees the same thing as fast; measured; phone data counts too. 11-10 Phone first: whatever a phone can read itself (open to browsers, no key, no form session) the phone reads, the Worker only its fallback; the Worker keeps keyed sources, sites closed to browsers or abroad, form sessions, and pages one Worker read serves to everyone.
- 11-10 Scraping is allowed: an operator's own site or app is a source like any API; dig for one before saying there's none.
- 10-27 Gemini is reliable, only costly: replace it only where a free path is as reliable; otherwise make calls cheaper. Every AI route has a global daily cap (D1); Google Weather is shared per 0.05° square.
- New Cron Triggers don't run: use the proxy's even/odd-minute crons or a Durable Object alarm.
- 11-06 One live copy of an app: the same app open twice keeps one copy reading; the others go quiet (已在別處開啟, 在這裡繼續); nothing is lost (`tests/kit-one-live.test.mjs`). 10-23 All apps can run at once.
- 10-27 Data must never be lost or corrupted; saves stay lean; kept collections get version history and nightly backups. 10-22 Removed items drop out of every total (an old device copy can't bring one back).
- 10-18 No paid TheSportsDB key. 10-19 No paid membership ever.
- 10-19 Orbit's economy: NT$200,000 to start, NT$10,000 every Monday, 急難紓困 NT$5,000 when worth is under 2,000, 財富等級 rewards (10× since 10-23: 300K/30K … 100M/3M). 10-22 Money lives in Securities: the Pass shows no balance; only the proxy adds money; a price or payout change is modelled in a test first and an exploit closed with a test that tries it. 11-06 Securities guards only so bad local data can't corrupt real data, not heavy fraud-proofing.
- 11-05 Priority passes and a fair door: a priority pass is never held to a per-session limit and always let in (global AI caps and the guard's stop still hold); when too many are in, those in keep their place at slower refreshes and newcomers wait in line (`door.js`).

## 5. The Orbit Pass and the admin panel

App rules: each app's `MAP.md` › Rules.

- 10-27 Pass card: avatar, 里程碑 n/30, the account number's first 6 without prefix, the medal strip on one row; no money on the Pass.
- 10-27 Milestones: one per app, bronze, silver and gold, kept for good; 外觀 leads with what's worn, then the nearest next medal (a faint progress ring), then one row each; no locks, greyed grid or glows.
- 10-27 Passkeys: any number per Pass, named and removable, one for every app and the admin page (RP ID the domain); a one-time offer 「加入 Face ID 登入」; the pass and passkeys both sign in, no passkey-only mode. Every sign-in is a form password managers fill.
- 10-27 The pass is stored hashed slow and peppered; no lockouts. 11-03 A pass the owner issued is replaced at its first sign-in (required, enforced by the Worker), then a passkey is offered (以後再說 skips it); passes in use are never asked.
- 11-05 Public giveaway at `/key/`, set in admin (count, open and close times, QR): opening claims nothing, one pass a device, an unused pass back to the pool after the hours set. Its empty accounts can be cleared (off until turned on; only giveaway accounts unused for the days set, with no passkey, priority, money or data; kept 30 days in history).
- 11-06 The admin panel is laid out around what Jay checks: 總覽, 帳戶, 健康, 額度, 設定, 工具; plain words, no legacy jargon, money in NT$ (US$ only typing a provider's balance). The money is a sheet (證券的錢) from 總覽, not a tab; a gone app is never shown or counted.
- 11-10 健康 › 外部來源 shows every outside source's health (a row each: state, last success, 24 h calls and failures, where it's read, data age, quota), counted from calls the apps make anyway; a new source gets its row in `kit/sources.mjs` in the same push.

## Per app (moving into each app's MAP.md tonight; remove each as it lands)

#### Transit
- 10-22 YouBike is crucial: never plan a trip without bikes as a fallback; make it load reliably instead.
- 10-30 YouBike shows its own logo everywhere except the map (map pins keep the bike glyph: it is the only bike); pins and cards count regular bikes and 電輔車 apart.
- 10-22 Navigation follows ONE standard table (leg type × phase × auto/user view) in one function (`navLook`); change the table, never add one-off rules.
- 10-22 On a ride: frame the remaining ride only, no zoom-follow on bus or train; own YouBike station icon-only (counts when Jay zooms in); no nearby stations or parking badges; boarding and start marks; ring one stop before yours; no swipe-down minimize.
- 10-23 Operators' 停駛 notices are rules: stopped services are never planned; likely-off is labelled 可能停駛, never 停駛.
- 10-23 附近 must load; on a "nothing running" day it still works and just says what's stopped.
- 10-27 A trip's legs fit one line (tighten, never wrap); 查時刻 is visual (journey bar, live 準點/晚, next train lit), not text.
- 10-29 偏好電輔車 is a per-trip choice on the plans card: of stations about as near, the one with 電輔車, ridden at their pace.
- 11-06 Trip results never change under the person ("it update the trip in front of me which is bad"; "Make sure it mean the first show is the final result you meant to deliver"): the plans card and 交通's trips show the whole plan once (the skeleton, or a trip's last ways, until then); after that a way shown keeps its place and labels and only its times update; a way found later joins quietly at the end (Transit `lib/steady.mjs`).
- 11-04 偏好電輔車 is also a setting in 我的 › 規劃, off by default ("prefer Electric Ubike off by default"): on, every trip starts with it on (the plans card's ⚡ still turns it off for one search) and station cards count 電輔車 first; off, nothing changes.
- 10-29 換附近的站 while navigating is asked only when a station runs low (2 or fewer bikes or docks; no 電輔車 for an e-bike ride); otherwise the count is a quiet tap.
- 11-03 Buses run early or late, trains on time ("leave maybe 5 minutes earlier for bus, train will be fine"): a plan has you at a bus stop 5 minutes before its timetable time, 2 before a bus TDX sees coming; trains as timed. Ranking unchanged, only the leave time.
- 11-03 A bus TDX sees arriving is that timetable run: once it's gone before you can be there, the plan and navigation move to the next run you can make, never the timetable's time for that bus again; and never "快一點" when hurrying can't make it (趕不上了).
- 11-03 追公車 ("you are the software you know the numbers the best"): from live data, any route, never hard-coded: a YouBike to a stop further along the bus's way where it still catches a bus you'd miss walking, planned when 3+ minutes sooner and offered while navigating.
- 11-06 追公車 is steady and safe ("it keep switching between the close one and the further one, and the further one … not safe enough to catch it"): offered only when clearly sooner (8+ minutes, more for a long ride), at the stop with real room (4+ minutes, more for a long ride or a far-off bus), never on a stopped feed; once a trip shows the near stop or the further one it keeps showing it until the other is 10 minutes sooner or it can't be made. Replaces 11-03's 3 minutes.
- 11-07 A trip with stops is one coherent trip while navigating (not its first stretch alone): the chips run to the last place, each step after a stop a tap to look at it; the bottom bar's time is the next stop's arrival ("full trip length should be about when I arrive my first stop so it's more real"); riding a YouBike to a stop, it asks 停著 or 還車 with which is sooner; with the free half hour, 附近換車 from 25 minutes on a bike.
- 11-03 Trains go beyond TPASS ("some train you buy ticket, HSR as well"): inside a TPASS area the train list and planner still keep to the pass's trains, but any 台鐵 or 高鐵 train can be set as the one you hold a ticket for (指定車次 by number, or 用這班規劃路線 from 查時刻), and the trip is planned around that exact train; 查時刻 has 全部班次 beside its TPASS note.
- 11-06 Google's places on Transit's map keep Google's own colours (Jay, of them greyed to Orbit's quiet: "Don't grey it out I hate it"); a tap on one must open it reliably and fast. Google's own bus stops stay off (ours have live times). A place's or a spot's card shows the YouBike near it, never its bus stops ("No more nearby bus stop cause it's … unhelpful").
- 11-06 When something goes wrong under way, one card, any mode ("we never really design flow to deal with if you can't catch a bus or you go on the wrong bus … either go for the same bus or go for the fastest option"; "not limited to bus though"): missed or late for a bus, train or metro → 下一班 (the same line, same stop) and 最快 (the quickest way from where you are), each with when you're there; no bike or dock nearby → 最快; on the wrong ride (GPS: moving at a ride's pace away from the stop, off its way) → 從這裡重新規劃. Never a YouBike to a stop further on while navigating or replanning under way (追公車 is for planning only). Steps move only by GPS. Transit `lib/trouble.mjs`.
- 11-04 A train you pick is the train you take ("I intentionally select a train later and it thought I am catching this one"): a later departure chosen over an earlier one (the plans card, 交通's 其他班次, 改搭別班, 指定車次) is never switched to a sooner one by itself; a plan you didn't pick still moves to a sooner train still to come (10-28).

#### Sports
- 11-06 A game's card is one game (Jay, iPad: "clicking empty space of that player area will result in opening player not the match"): only a player's face or name opens the player; any other spot on the card opens the game, and a press lights the whole card, never half of it. On a wide card who led each side stands beside that side's row. Sports `tests/home-recap-card.test.mjs`.
- 10-20 Every break gets a countdown, timeouts too.
- 10-21 Two sports' games clash only within 30 min of each other.
- 10-22 賽事 opens on 全部, never on the first followed league.
- 10-22 NBA 先發 from RotoWire (not ESPN core); injury words from a fixed list, never machine-translated.
- 10-22 Result notices checked every 2 minutes, first check at the sport's shortest length.
- 10-22 Soccer win chance from our own model (score, minute, reds), never a frozen market; 勝負未定 not 拉鋸; no "按住圖表" hints.
- 10-22 Leave closed-app CPBL result notices broken until next season; revisit sources before spring.
- 10-23 One game page standard for every sport (lineups, 陣容, 傷兵).
- 10-23 Cards show one channel row; the game page lists every channel and names whom a player cam follows.
- 10-23 Following a league counts like following a team; games 00:00–05:00 TW are never "my game".
- 10-23 Win-probability rows use team logos and shirt colours; the lead row lands on the right play.
- 10-26 For a game to come, the betting market goes ahead of ESPN's predictor.
- 10-27 Standings card: once first is settled, the race moves to 2nd, then 3rd, down the table until every place is settled (reverses a 10-26 "zones, not second place" change).
- 10-27 Swipes: 賽事's tabs swipe where there's no date strip (F1's 賽程 too), and past the last or first tab to the next league; team and player tabs swipe; not a game page (its charts take the finger).
- 11-01 Sides level on a record or points are ordered by their league's official tiebreaks, never at random, and the app says why ("make sure this know how same win teams are decided"; "tie breaker are included in all kind of sports"). NBA Cup: head-to-head, point differential and total points without overtime, last season's record, the draw (wild card and seeds without head-to-head), said under each card. Said in one short line, never wrapped, and only where a tie decides a spot (a group's first, a wild card, a seed, a zone's edge such as top 8 or the drop), never a list of every level pair ("honestly stupid cause tie numbers are often"). Sports `lib/tiebreak.mjs`. (Under a league table: nothing said since 11-06.)
- 11-06 No 同分 line under a league table (Jay: "I don't like the unbalance of card, maybe we should drop same point comparison"): tables are still in the league's tiebreak order, nothing said under them; the NBA Cup's bracket cards keep their one line. No green in the playoff bracket ("I hate the green"): a clinched seed is filled in the text's own colour. Where the screen has room the bracket shows every round at once, never two rounds across a whole iPad ("we don't have to limit to show two play off in the whole screen cause that's wasting screen size").
- 11-03 近期交手 is the last five meetings at most, each counted by its score: level is a draw, even one settled on penalties (marked PK; Jay: a 3-3 read as 曼聯's win). The summary fills the card's width: each side's wins, the draws between, and one bar across under them, a piece a meeting (Jay: "isn't it obvious that most of the time the middle is empty?"); 上季對戰 and 本季對戰 the same. Fewer than five shown means fewer exist in ESPN's list (FotMob's is shorter): never padded.
- 11-03 Past ELTA's published list (about two weeks), TV is predicted, not left blank (Jay: "home page can't go further than ELTA even though we know ELTA air every Premier League game… NBA we already got what it will air… we can still reliably guess it because it usually the same pattern"): every game of a league ELTA has whole (英超, 義甲, 德甲, 歐冠: every one in its lists) is on, the NBA's by NBA.com's list; the channel is guessed from ELTA's own recent line-up on the league's clock and named only where that's plain (a game alone in its slot; else just 愛爾達); every guess says 預估 and gives way to ELTA's listing. A league ELTA has in part (法甲, 歐霸, 歐協聯, 蘇超, 歐國聯) stays 轉播待公布: two rounds of its list can't tell its picks. Kit `eltaGuess`; measured by Sports `scripts/tv-guess.mjs` (every game of the four taken as on, none wrongly; the NBA's channel 23 of 23, football's 13 of 19 where named).
- 11-04 Code and data only for the leagues Sports shows (Jay: "remove any unsupported sports so we can be more efficient"): the 15 on ELTA or Apple TV (kit `BROADCAST`); nothing kept, built or read for another league (the WNBA, the NFL, NHL, NPB, KBO, EuroLeague, the NBL, K League, J League, LaLiga's schedule…). What players' pages need stays: clubs' Chinese names and old names met in a 生涯球隊, an NBA player's college, LaLiga's photos (its clubs play the cups).

#### Law
- 10-19 No Cloudflare cost; data built at deploy, never committed.
- 10-21 Three equal, linked pillars: law, rulings (all 憲法法庭/大法官 included), legislation; one id scheme, one search.
- 10-21 The AI answers anything in the app and makes the judgement call with citations; does the work itself (no generic 下一步 or 找哪個機關); verdict first, few facts, no wall of text; recent items first (newest budgets unless a year is asked).
- 10-21 Coverage: all 法規命令, ministry 行政規則, local 自治條例 and 規則 (Taiwan-only county sites through the Taiwan relay).
- 10-22 直播中 only when IVOD says so (fresh); never live from the schedule; never live on a day off.
- 10-27 問法律 shows only what it used: similar rulings and rules only when the answer cites them (a rule asked by name always); a city's 地方法規 only for the reader's own city (picked in 問法律, else their family places' county) or one the question names; few articles per question; the status says what it is really checking; every 立法院 card a tap away (a budget first, never behind 更多 N 件); citation chips one line.
- 10-30 問法律 has a place of its own ("dedicated place for Law AI"): the round action button beside the tab bar, lit while open; and it must be fast: the verdict and answer stream as written, nothing waits on what can run beside the plan.
- 10-31 Rulings get an AI of their own, like an article's 白話解釋 ("We need AI tool for rulings as well"): what it decided, why, who it affects, and questions about it, from the ruling's own paragraphs only, each point citing them; not legal advice. A ruling reads like the rest of the app: no justified, letter-spaced text, inside its card's padding.
- Rulings backfill runs 00:00–06:00 TW nightly; only `rulings.yml` writes that cache.
- 11-10 Law brings every source in (Jay: "our goal is to have as least plain text and at least need open external source as possible, if we can format it and show it properly in app we do that"): whatever a source holds (a PDF, a council's page, a 議事錄, a recording) is read at build or on the phone and shown formatted in the app (its parts, names, decisions, days), the original only as a fallback link; a raw text dump or a bare link out is the last resort, and a source that can't be brought in is named to Jay.
- 11-10 Council and 代表會 pages are for looking anything up, like 立法院's, not only what's recent (Jay: "right now it's focused heavily on 最近 unlike legislative yuan that I can basically look up anytime and anything"): every session of the term, every sitting, member, bill and recording, searchable; a long recording gets a short summary of its sitting.
- 11-10 A recording plays straight from its source and starts within the tap (Jay: the 新竹縣議會 video and 竹北's 錄音 "slow when it can be serve fast").

#### Weather
- 10-22 Graphs: rain bars by amount, readout in the title line, no hint boxes, a graph never drags the sheet.
- 10-22 Typhoon day-off chance: one number per county, the % is the only indicator (no accuracy shown), the official word wins; hidden under 5%.
- 11-10 Rain coming is said so anyone gets it (Jay: "3mm I don't know how much that is", the pill "not so obvious", "the coverage is like the whole 竹北市?"): how hard in everyday words (毛毛雨, 小雨, 中雨, 大雨, 豪大雨, kit `rain-now.mjs`), never millimetres; when it starts and stops as clock times; what to do; how far it reaches (~1.5 km). Only rain the radar really sees, tracked as it moves (`weather-radar.js`), never CWA's hour-sum forecast alone (it said rain over 竹北 with no echo near). The sky card, the hours, 降雨 and the notice say the same.

#### Securities
- 10-21 List every securities product a person in Taiwan can legally buy; 10-23: with its real rules, applications and restrictions, however annoying (kit `stock-access.mjs` gates + the app's 開戶與交易資格 sheet, live).
- 11-03 The home opens on 總資產 (Jay: "Forget my rules", asked whether 10-21's no balance on the home should hold in the redesign).
- 10-31 Home shows every market as a tile with its day's move (each country, 加密, 基金, 黃金, 外匯, 更多), not just 台股 (Jay: "too useless cause only Taiwan market on homepage"); no empty-holdings card.
- 10-30 No 信貸 (personal loan): a broker doesn't make one. The only borrowing is 融資 against the shares it buys (Jay: "be realistic, if it's not realistic or game breaking remove it").
- 10-27 現股當沖 follows TWSE: account open 3 months with 10 trades in the last year, or a credit account, plus the signed 風險預告書 (`stock-access.mjs` `daytrade`).
- 10-22 One product bar in 市場; every list = picks, then the whole listing.
- Orders are filled and cash counted by the proxy (`stock-fill.js`), never the phone.
- 10-23 Securities follows 臺北市's 停止上班 for trading days.
- 10-28 A symbol's sheet opens on the app's teal focus card (as 資產's), the chart on it in white; 買進/賣出 two even buttons, the price not repeated. The order ticket keeps one floating button, the total on its second line, the page fading under it (Jay: "floating is ugly, need redesign (not stripping away floating)").

#### Money (Jay's own books, real money)
- 11-10 拍照記帳 reads a paper 電子發票's QR codes on the phone first (Jay, of the research list: "All yes I only care about result"): exact number, day, total and items with no AI read, the seller's name from 經濟部's register; nothing to tap or see added (10-31's no 發票 features stands: no 對獎, 手機條碼, scanner or 載具 file). Any other picture goes to the AI.
- 10-27 Never invent entries, balances or categories; Jay started fresh 2026-11-01; never re-add the 天天記帳 import or commit his CSV.
- 10-31 No 發票 features (Jay: "發票 feature is weak… a more general tool… remove 條碼、自動對獎"): one 拍照記帳 for any picture (receipt, invoice, bill, app screenshot, transfer notice, price tag). AI reads amount, day, store, items, category and way to pay; it opens as a filled entry to check before saving, and a matching entry already logged (same amount, within a day) is offered to merge, never added twice. No 手機條碼, 對獎, QR scanner or 載具 file. (Replaces 10-27's 發票 hero.)
- 10-27 Categories have subs and are the person's to edit; auto-fill (自動帶入) is set per user, never hardcoded.
- 11-01 One set of categories for everyone (Jay picked it over presets): twelve broad spending ones, each with two to four broad subs (餐飲 早餐/午餐/晚餐/飲料點心; 交通 TPASS/搭車/長途/汽機車, with YouBike, 捷運, 公車 and 計程車 all under 搭車; 購物 服飾美妝/3C 家電/日用品; 居住 房租房貸/水電瓦斯/電信網路/管理修繕; 娛樂 休閒/旅遊/運動; 數位; 醫療 看診/藥品/保險; 學習; 人情; 家人 孝親/育兒/寵物; 稅費; 其他). What was logged under the old set moved once, amounts untouched. The person can still add, rename, hide or merge their own.
- 11-01 Meals stay three (Jay: one 三餐 sub is "bad for my 統計"): 餐飲's subs are 早餐/午餐/晚餐/飲料點心; 宵夜 counts as 晚餐; no 三餐 sub. Logs the twelve had put under 三餐 went back to the meal they were logged under (from the Pass's kept version before the twelve), else by the hour logged; amounts, days and totals untouched.
- 11-03 No 聚餐 sub (Jay: "so useless"): a meal out is counted as its meal. Logs under 聚餐 moved to the meal by the hour logged (else 晚餐); amounts, days and notes untouched.
- 11-03 統計's card has room and holds still (Jay: "Super densed and clicking months the UI jump and no intuitive way to switching between different month/day/year"): 支出/收入 and 篩選 on one row, the scale 日 / 週 / 月 / 年 on its own row, four even parts; the card leads with the period's name (its menu: recent periods and 自訂期間) and ‹ › to step; the total, two figures always (a dash where there's none), the bars of the periods with the average's name under them, never on the line. A pick, a step or a scale changes words and bars, never the card's size or the page's place (the view redraws through the app, title and all). 自訂期間's days are our own centred text over the phone's picker; buttons are the kit's flat gold. (Replaces 10-31's "every control on one row" and 週 / 月 / 年 / 自訂 as one control.)
- 10-27 Sheets fit their content; nothing that matters below the fold; 手機條碼 stays black on white in dark mode.
- 悠遊卡/一卡通 are 儲值卡, never 電子錢包; removing an account never loses history.
- 10-30 Cards carry their network (卡別: Visa, Mastercard, JCB, American Express, UnionPay…), picked when adding or editing a card and shown wherever the card is (its real mark).
- 10-27 記一筆: the amount is a field (tap the number, the iPhone's keys; no keypad of our own); every category in view, no pages to swipe. Something not set shows nothing (no example values); 預算 sits in 更多 until one is set, then in 統計. Ways to pay show their own logos.
- 10-27 退款 is never income: it comes off its spend, all or part. A friend's share of what you paid comes off too; their cash counts once handed over.
- 10-27 Every change to what entries mean works on what's already logged (old books upgraded on open).
- 10-27 A 自動加值 nobody in the books paid for (a parent's card) is 收入.
- 10-27 Fees (ATM, 境外交易手續費) are typed by the person from the bill, with a 1.5% tap for a credit card; never calculated on their own.
- 10-27 LINE Points (any points or gift card) can pay part of a spend; digital things (domains, AI plans, cloud, games) have their own category, 數位.
- 10-27 A TPASS (any sub with 有效天數) is counted down on 月曆, with a notice the evening before and the morning of its last day.
- 10-27 統計 is a full statistics area: every category with its subs and each one's share of the total, and every useful cut (account and way to pay, a category across months, against the period before, fixed vs day to day, fees, money back, largest, places, weekdays, income vs spending, any dates). 支出 and 收入 are separate views, never netted (a high income must not hide high spending); the share kept is secondary, under 收入.
- 10-31 Subs stay broad, because 統計 is built on them ("too specific"). 數位 has four: 專案維運 (a project's running costs: TDX, domains, hosting), 工具訂閱 (AI, apps, storage), 影音串流, 遊戲. Running costs stay under 數位, not a category of their own. Upkeep and fun stay apart. (Replaces 10-27's AI / 雲端網域 / 軟體 split.)
- 10-31 統計 and 帳戶 open dense: one short card (the total left, two figures right, like 月曆's), no chart when only one period has anything; groups of a list are 16 apart. 統計 has one scale (total 28, section 17, line 15, note 12; rows 44, tiles 28), every control on one row, a quick-facts strip (largest, count and average, place paid most), 分類 as a small donut beside one split bar (Jay kept the donut) with each line's share and change vs the period before, subs folded until tapped.
- 10-30 記一筆 guesses everything from the person's own entries (time of day, weekday/weekend, place when allowed, past picks): kind, category, sub and way to pay are pre-picked; the amount is only offered and fills on a tap. Location is opt-in (更多 › 智慧帶入), kept to about 100 m.
- 11-03 The guesses must be right far more often (Jay: "accuracy rate of 17%, suck so bad"): a person's first week guesses from the hour as most people live it (breakfast in the morning) until their own entries outweigh it; a catch-up (at night, or for an earlier day) goes through the day in its order; pay and bills on their day of the month. 智慧帶入's 猜中 counts only guesses made the current way. Any change is measured first (`scripts/backtest-guess.mjs`, before and after).
- 11-03 轉帳 shows only what a transfer has (Jay: "why so many other things from 收入/支出"): the amount, 從 and 到 (logo and balance, a swap), the day, 手續費, a note. No categories, subs or way to pay. It opens on the accounts the person usually moves between.

#### Class, Words
- 10-31 Words is a general practice app with its modes in view (練習模式 on 今天); the contest paper is one mode, 拼字比賽, named for no specific competition ("don't build orbit words around 區域決賽").
- 10-31 Words: only the memory model decides a word is known; no 我會了 / 太簡單 / "I know it" anywhere ("no user can decide if they know it only system can").
- 10-31 Words: every answer option one text size, never shrunk to fit (a shrunk one gives the answer away).
- 10-21 Class never guesses what to bring (要帶).
- Class's local schedule is kept aside if unreadable; the Pass copy restores.

#### Beats
- 10-18 No music training; the full mixer is on by default.
- 10-21 Songs must sound clearly different.
- 10-23 Easy listening: keep `eased()` and the quieter master; no choir beds or glassy doublings.
- Keep `noted()` hooks in `radio.mjs`; never a `.loading` class outside `#loading`; home cards static (nothing animates forever).
- `engine.mjs` is the port of `passion_beats.py`: a change to the songs goes into both. Nothing of a kit's sound is sent anywhere.
- 11-11 Beats yields: another sound (Law's live video, any app, a call) stops it, and it never starts again by itself (no retry, no resume on return or when the session frees): only a tap. Same for any Orbit app's sound.

#### News (started 11-10)
- 11-10 Orbit News: Taiwan's and English news grouped into stories, each outlet's side shown (藍綠 and 統獨 for Taiwan, US left/right for English); "like Ground News but for Taiwan" is the idea only, never its name, look or words (its "Blindspot" is our 單邊).
- 11-10 An outlet's place comes from a published source (`kit/news-outlets.mjs` BASIS) or its owner's stated stance marked weaker; never our own reading of its stories. No outlet placed 白: stories name the parties instead.
- 11-10 Headlines, links, the outlet's short summary and feed picture only, each credited; every tap opens the outlet. No AI in the builder.
- 11-10 Cloudflare goes out from Orbit-Core: News's site is published by Orbit-Core's `news-site.yml` with Orbit-Core's token (a secret can't be copied).
- 11-10 News is a hub for any story outlets could take sides on: politics in the wide sense, tech, the economy, society too. A story with no topic isn't shown; the topics are one table (`kit/news-outlets.mjs` TOPICS), so widening is a line each. (Widened the same day, 08:08, below: a crash or a game is shown now.)
- 11-10 Stories rank by importance (how many outlets, how much they wrote, for how many days), not newness; a big story stays for weeks (`builders/news.js` keepFor), its page growing as coverage comes.
- 11-10 Filler is left out (gossip, fortune, lottery, viral, clickbait, promos: `fillerOf`, `softOf`; sport is news from 08:08). Every story with a picture shows it; an outlet's own YouTube clip (found on its article page) plays in YouTube's player; never a channel's page read, never a clip or picture kept.
- 11-10 (08:08) Jay: "Make orbit news look better significantly, include more news sources, expand to support more kinds of news and let spectrum be one feature, support swipe gesture, fill the gap of 未評". So: life, health, science, culture and sport are News' too (TOPICS `spectrum: false`: never one-sided, no bar on their rows, sport and culture ranked lighter); a story of no topic (a game of Pokémon) still stays out. Every outlet has a place (AllSides, else Media Bias/Fact Check); only China's state media stand apart, as 官媒. Swipe: 頭條's lead stories, 台灣 and 國際 from topic to topic, a story's sheet from story to story.
- 11-10 (22:51) Jay: "international news … is limited to international news outlet no Taiwan news outlet … big news like CNN isn't even on the source list". So a world story shows how Taiwan's outlets put it (their own 藍綠 bar and headlines, `tw`; joined by a word list, `builders/news-words.js`, never AI), and the big world outlets are in, each placed by AllSides: CNN, Reuters, AP, NPR, MS NOW, USA Today, Axios, CNBC, Newsweek, The Independent, The Telegraph, The Washington Times, Newsmax; 民視 joins Taiwan's (two studies: 偏綠). A site that refuses a reader that isn't a browser is read through Bing News' feed of that site (Google News refuses Cloudflare); 民視, whose site answers only Taiwan, through its YouTube channel's reports.
- 11-10 (22:53) Jay: "Either really empty or categorize it wrong". A story's first topic is what most of its headlines name, a second only where 40% name it (a doctor's car crash isn't 健康; health and disasters aren't 社會); in a topic's tab a story's tag is that topic; a topic's tab needs 3 stories; each topic keeps its best 12 past the front's cap; a kind past the sides (health, science, culture, sport, life) forms from 2 outlets.
- 11-10 (22:57) Jay: YouTube Shorts "either remove or support it properly": Shorts are left out; a clip YouTube won't play here says so and opens YouTube; a channel is read only if its clips play in other pages and aren't mostly Shorts.
- 11-10 (22:58) Jay: "still kind of hard to navigate". A story's sheet keeps ‹ 上一則 · n / N · 下一則 › at its foot; each outlet once a side (its other headlines folded), four a side at first; 單邊 by 台灣 / 國際, each side's count a tap filter, its kinds as sections; one company's monthly report is never another's story.

#### Showcase (Jay's 自主學習 portfolio)
- 10-27 Open to all (no Pass, no install gate; an exception to §2) and a real desktop layout besides the phone one.
- 10-27 Only structure, numbers and demos; plain words for non-tech readers; Jay sets direction, Claude types.
- 10-27 No betting anywhere; every number from git; "on GitHub since", never "began on".
- 10-30 Demos may run the real apps on live data, not only a recording, and may use the APIs' quota; limited so they never get round the Orbit Pass: a short showcase pass (showcase.js) from the showcase's address only, reads only (no Pass, wallet, orders, AI, notices or writes), per-address and daily caps, paid asks from their own share; past any limit the recording plays. Full screen on phones, bug-free; small coach-mark tours.
- Content changes only when Jay says "catch up the showcase". The raw record stays private in project files, never in a repo.


## 6. Replaced rules (kept so nobody brings them back)

Gone for good, never revived: Longshot (shut down 10-31: Worker, data and secrets deleted; only a notice at `longshot.jaypengx.com`; its repo left for Jay) and with it Orbit Play, Slips, scratch cards, betting, VIP and free bets; Orbit Plus; Per-User-Display; StillFeed. Folder-Link (a Windows tool, 10-18: same-drive check strict, merges overwrite after the warning) has its own notes.

| Old rule | Replaced by | When |
|---|---|---|
| Keep the US$5 Workers Paid plan | Only the domain is paid (Workers Free, Runner DO) | 11-06 |
| Gemini on its free tier like everything else | AI may be paid, a blind test picks | 11-10 |
| Gemini/AI answers as text; team chips without logos | Drawn answers; a team chip with its logo | 11-11 |
| The look is final, no restyles (10-28) | A premium redesign, then Orbit's own look in all nine | 11-03 |
| Native samples: Weather on its sky, game cards in both clubs' colours | Today's dark page, one colour to a surface | 11-03 |
| Keep backgrounds: hero and focus cards on the app's colour (10-27) | Graphite cards, colour inset (`.q-band`) | 11-03 |
| Gradient hero per tab, colour tiles, tags for sentences; flat heroes; focus open on the page | One focus on a card, grey facts, chips for taps | 10-27 |
| 32 between sections | 24 | 10-27 |
| Read on demand, nothing prefetched | Instant everywhere: SWR, optimistic taps, read ahead from the edge | 11-03 |
| Fixed helper tiers (haiku/sonnet/opus by job) | The right model and effort per task | 11-03 |
| Push to a session branch and main; Apple UI on a branch for a Mac test | `main` only, own WebKit screenshots | 10-19, 11-01 |
| Only the kit thread changes the kit | Any thread, in kit push order | 10-21 |
| Phones only (320–440), wider screens a centred column (10-23) | Every screen, either way up | 10-31 |
| Securities and Longshot on a docked bar (`q-dock`) | Every app on the floating capsule | 10-27 |
| Help pill in the top bar | Help in the Pass sheet | 10-19 |
| Apps on GitHub Pages, read through `orbit-site` | Each repo publishes to Cloudflare (`deploy/cf-site.mjs`) | 11-01 |
| `jaypengx.github.io` paths, then `/<Repo>/` on the domain | `orbit.jaypengx.com/<short>`, no redirects | 10-27 |
| Money on the Pass | Money in Securities only | 10-22 |
| No forced resets for any pass | An issued pass is replaced at first sign-in | 11-03 |
| Showcase demos frozen snapshots only | Live, read-only behind a showcase pass | 10-30 |
| Screenshot sets lead with the latest feature asked for | Lead with the hero screen | 10-28 |
| "Don't touch the Cloudflare data rename" | Done (`orbit-data`, `orbit-store`) | 10-23 |
