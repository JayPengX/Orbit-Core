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
- 11-12 Orbit (`/app/`, kit `suite.mjs`): every app in one home-screen app, to become the main way to use Orbit; the separate apps are always kept and stay unchanged. Never called a "portal" on screen. It feels like the separate apps (no grid of tiles): a light switcher, back and forward across apps, every cross-app feature opening in place. A separate app may suggest Orbit at a hop to another app, always declinable, never nagging (`suiteAsk`).
- 11-13 Orbit keeps every app opened running: switching back never loads it again, and an app playing sound (Beats) is never closed however many apps are opened after it.
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
- 10-21 The keyboard never pushes content off screen; the iPhone's own keyboard, never an in-app keypad (kit `watchKeyboard`). Input bars sit above the keyboard. 11-11 A field takes the keys right the first time (Jay: "I often need to click on a typing field then close it then opens again to have a perfect focus … in the kit so every typing field gets it"): a field about to be typed in first ends any movement carrying it (a sheet's slide: iOS placed the caret mid-slide, under the screen), the keys are read again once they settle (kit `landField`, `watchKeyboard`); a sheet opened to be typed in focuses its field in the tap that opened it, never a frame or a timer later.

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
- 11-12 No wasted space (Jay: "empty space and disproportion"): a card is as tall as what it holds; no empty band above, below or beside content; no blank half of a row, card or screen; a quiet screen is short, never padded out. The only gaps are the spacing rule's (24/16/8); anything emptier is a bug.
- 11-12 In proportion: every piece is sized for what it carries, at the kit's sizes: no bar, button or card bigger than its content needs, no icon or logo small next to the text it sits with, like pieces in a row the same size, a hero never taller than its facts need (half the screen at most on a phone on its side).
- 11-12 No text wraps where it shouldn't: titles, names, numbers, buttons, chips, tags and tab labels stay on one line at 320 (the short form, or room made: the long-name rule above); running text breaks only between words or phrases, never one character or one word alone on a line.
- 11-12 No old look left: anything a newer design replaced (§6 and DESIGN §11) is a bug wherever it remains: gradient or app-colour-filled cards, colour tiles, a sky or photo behind the page, two clubs' colours on one card, old sweeps and animations, a docked bar, a help pill, accent text links, sparkle AI icons, letter tiles, white logo plates, ↑↓ reorder arrows, 32 gaps, an app's own dialogs or sheets.
- 11-12 Features don't explain themselves (Jay: "it explains it too much, when all it needs is one sentence or none"): a screen, card or sheet carries at most one short line of explanation, and none where the controls already say it; no paragraphs, how-it-works notes, feature tours in the page, or lines repeating what a label or picture shows. Help belongs in the Pass sheet's 說明. When adding a feature, write its words last and cut them to the fewest.
- 11-12 Wording, both languages: Chinese is natural Traditional Chinese in Taiwan's words (not translated from English, no mainland terms); English is natural, plain and short (not translated from Chinese); the same thing has the same name everywhere in an app and across the family, in both; every string exists in both, means the same in both, and fits the same space; no typos, wrong measure words or mixed punctuation (full-width in Chinese, half-width in English).
- 11-12 Nothing out of place: a piece that looks different from what's around it (its own font size, colour, corner, shadow, spacing, button or control shape; not built from the kit) is rebuilt from the kit's components in the family's style. If the kit lacks it, it goes into the kit, never a one-off.
- Before calling UI done (Jay's test): open every tab and sheet you changed at 320 and 390, light and dark, phone on its side, tablet and computer (`node tools/shots.mjs <app> --before main`, 10-30); look for overflow, cut text, wrapped labels, empty space, pieces out of proportion, duplicates, small logos, emoji, empty screens, anything of the old look, over-explaining text, wording that isn't natural in either language; run `tools/gate.mjs`.
- 10-30 Screenshots are authentic: the world's data always live; only what a person keeps in their account comes from a demo account built by using the app. 10-27 Framing edits are fine (crop, a zoomed callout, a headline, a background), content edits never. 11-01 One set for the READMEs and the showcase, both languages (`tools/store-shots.mjs`), nothing used twice in a set. 10-28 Shot 1 is the app's strongest hero screen; niche or just-asked features later.
- 11-12 A screenshot set sells the app (Jay: "think like a marketer"): shot 1 makes plain what the app is for; each shot after it is one main feature that makes the app special, in proportion to how central it is, never chosen for being new (the 11-11 set gave Law four 代表會 shots and Sports mostly AI). Each headline is confident and carries a real number where one sells (counted from the data, rounded so it stays true: 「5.4 萬部法規」). Every shot shows different content (another story, game, stock, word); one shot per feature; Orbit AI one shot at most, only where it is central; never a competitor's name or a comparison. The plan with each set's one-line reason: `tools/shots/store.mjs`.

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
| Nine shots a set, specials (AI, 議會, the flight) mixed with basics | A seller's set: what it is, then what makes it special, numbers in the headlines | 11-12 |
| "Don't touch the Cloudflare data rename" | Done (`orbit-data`, `orbit-store`) | 10-23 |
