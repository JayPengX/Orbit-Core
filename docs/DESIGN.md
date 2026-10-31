# How Orbit looks

The design rules for every Orbit screen. The kit (`kit/orbit.css`,
`kit/ui.mjs`) carries the tokens; this page says how to use them. The test
for every rule is the same: hold the phone at arm's length and squint. One
thing should still stand out, and it should be the thing the person opened
the tab for.

Why this page exists (Jay, 2026-10-27): the apps looked "AI-made". Not from
any one mistake, but from the same few habits on every screen: a glowing
gradient card on every tab, every fact in a capsule, every number bold, every
group in its own box with the same radius, the app's colour sprinkled on
everything. Each habit is fine once. Repeated, they flatten the screen so
nothing leads. The fix is not another app's look; it's restraint, so the few
loud things mean something.

## 1. One focal point per screen

- Every tab answers one question (TRUTH §6). The answer is the focal point:
  the biggest type on the screen, with the most space around it. Money's
  月曆: what I spent this month. Weather: how warm it is now. Sports: the
  game on now.
- **The focus sits on the app's colour.** The focal block (`.q-focus`: a
  quiet label, the number at `--q-t-focal`, one line under it, at most three
  small figures) is a card in the app's colour lit from the corner, the same
  surface as `.q-hero-card` (an app may give it its own, as Money's black and
  gold). What's *on* it stays calm: one big number, plain words, no capsules.
  Jay 2026-10-27: the rollout's open, colourless focus made every screen
  "feel so empty"; "the cleaner approach is right, but stripping out
  background is shitty". Clean the content, keep the colour.
- At most **one** coloured surface per screen. A second one means two
  things are shouting; demote one.
- Everything else steps down: section heads, then rows, then captions. If
  two things on one screen are the same size and weight, ask which matters
  more and shrink the other.

## 2. Type: few sizes, two weights

| Role | Token | Use |
| --- | --- | --- |
| Focal | `--q-t-focal` (44/50 rounded 700) | the one number a screen is about |
| Large title | `--q-t-large` (34, 700) | a tab's name, non-home tabs only |
| Section | `--q-t-title3` (20, 600) | a part of the page |
| List label | `.q-list-head` (15, 600, grey) | the name of a group of rows |
| Body | 16–17, 400 / 500 | row titles, values |
| Secondary | `--q-t-subhead` (15, 400, `--q-label-2`) | the line under something |
| Caption | `--q-t-footnote` / `--q-t-caption` (13 / 12, grey) | labels over figures, small print |
| Figure | `--q-t-figure` (17, 600 rounded) | a number beside the focal one |

- **700 is for two things only:** the focal number and a large title. A
  screen with five bold numbers has no bold number.
- Row values are 500, not bold: the row's *name* is what you scan for.
- Grey (`--q-label-2`) is the second voice: labels, units, the line under.
  Never grey on grey (grey text on a `--q-fill` box); put grey text on the
  page or a white cell.
- Numbers are tabular (`font-variant-numeric: tabular-nums`) and
  right-aligned in one column, so they line up down a list.
- No letter-spaced caps over-lines (`700 13px, 0.04em`): they read as a
  template. A label is a plain word in grey.

## 3. Colour with a meaning

- **Neutral by default.** Text is black (white in dark) and grey; surfaces
  are the grouped background and white cells.
- **The app's colour is a pointer, not paint.** It marks: the chosen tab,
  the primary action, a link, the selected item, and *one* highlight that
  tells the person something (Money's big days). If a screen uses the
  accent on more than about four things, take it off the ones that only
  decorate.
- **Meaning colours** only where the value carries the meaning: red/green
  for up/down (Taiwan's way, `--q-up` / `--q-down`), `--q-good` for money
  in, red for over budget or empty, `--q-live` for live. Never as decoration.
- **Keep the surfaces.** The hero and focus cards wear the app's colour lit
  from the corner with a soft shadow of it; class, subject and sport cards
  their own colour; icon tiles a gradient. Calm comes from what's on a card
  (fewer capsules, weights and accent marks), never from stripping its
  background (Jay 2026-10-27). Don't add a second coloured hero to a screen
  that has one.
- Icon tiles (white glyph on a colour squircle) say *which kind* (a
  category, an account). Not on every row or heading, and a group that's all
  the same kind needs none.

## 4. Space: a 4-point scale, used as a rhythm

Tokens `--q-s-1` … `--q-s-7` = 4, 8, 12, 16, 24, 32, 48.

- 16: the page margin and a card's padding. Everything lines up on that
  one left edge (16 + 16 inside a card).
- 4–8: things that belong together (a label over its number, a list label
  over its rows).
- 16: after the focal block, and between groups of one list (現金 / 銀行帳戶).
- 24: between sections (`.q-section`). Never more between two parts of
  one page: a gap bigger than the thing it separates reads as a hole
  (Jay 2026-10-27, "so much gap for IDK what" on Money 帳戶 and Sports
  首頁). A line naming what follows (Sports' 今天 · 11 場) sits 8 above it.
- **Group by space before lines, and by lines before boxes.** Closer = related.
  If a hairline already separates two rows, they don't also need two cards.
- Equal gaps for equal relationships. A random 14 here and 10 there is
  what makes a screen feel assembled rather than designed.

## 5. Shapes: one family

- One container radius, `--q-r-card` (22): the hero, row cards, lists,
  cards. `--q-r-cell` (12) for tiles and cells inside. Capsules for
  controls only (buttons, chips, the segmented control, search).
- **Don't box single things.** A card holds rows that belong together. One
  number doesn't need a card; one row can sit in a list with its siblings.
- No card inside a card. No box around a section head.

## 6. A chip or plain text?

A capsule says "tap me" or "this is a state". So:

| It is… | Use |
| --- | --- |
| a filter or a choice you tap | chip (`.q-chip`); chosen = accent text on its wash |
| switching a whole tab's view (≤ 4) | segmented (`.q-seg`) |
| a status that's the exception (逾期, 直播中, 已停售) | one tag (`.q-tag`) |
| a fact (平均每天 NT$645, 3 站, 20 日繳款) | plain text, grey |
| on every row | not a tag: it's a column, write it as text |

At most one tag per row. A row of three tags is a sentence; write the
sentence.

## 7. Maps: weight by relevance

Jay's example (Transit 地圖, 2026-10-27): a dozen identical yellow bubbles,
each with a bike icon, a number, a bolt and another number, all as loud as
each other and louder than the streets, the bus stops and your own position.
The map's question is "where am I and what can I use near me". So:

- **Three weights for markers.**
  1. *Quiet* (the default): a small dot in the kind's colour with a white
     ring, no text. YouBike: a 12 px yellow dot. Bus stops the same in green.
  2. *Informative*: the count appears, in a small white capsule with dark
     text and only a yellow edge, for the stations nearest you (3–5) and
     for all stations once zoomed into street level (≥ 17).
  3. *Alert*: a station with 0 bikes is the exception worth seeing: its
     dot goes grey and hollow (nothing to take), never red-loud; a station
     you've chosen or are walking to is the one filled yellow capsule.
- E-bike counts (⚡) belong to the station's sheet, not the map: one number
  per marker.
- Your position and your saved places sit above everything; markers never
  cover the blue dot.
- YouBike stays always visible and reliable (YOUBIKE CRUCIAL): quieter, not
  hidden.
- Same idea for any map or chart: the reader's own data loud, context quiet.

## 8. Do and don't, from real Orbit screens

- **Money 月曆, before:** a black-and-gold gradient card with four bold
  numbers, then 31 day squares each tinted gold, each with a bold date and a
  bold amount. Nothing led. **After:** the month's spending on its focus card
  at the focal size, a 4 px budget bar, one grey line, income and 結餘 as two
  small figures. Days are plain numerals with the amount small and grey;
  only the month's few biggest days (over twice the budget's daily share,
  top five) carry the accent. Today is accent text; the picked day the one
  filled circle.
- **Money 帳戶:** the net worth on its black-and-gold focus card; 現金 / 銀行帳戶 / 信用卡 are
  list labels (15, grey), not section titles competing with it; balances 500.
- **Money 統計:** "平均每天 NT$645" was a gold capsule: a fact, so plain text.
- **Law 首頁:** the 問法律 card kept (it's an action) in its indigo; the
  over-line a plain grey word, not spaced caps.
- **Don't:** strip a card's colour to make it calm (it reads empty); a
  gap bigger than what it separates; a colour tile on every row; a tag on
  every row; bold values in every row; 3 radii on one screen; accent on
  icons, labels, numbers and buttons all at once.

## 9. Checking a screen

Before pushing a visible change: every screen (320 and 390 upright, a
phone on its side, a tablet, a computer), light and dark
(`tools/shots.mjs <app> --before main`; WebKit where it's installed). Then ask, in order:

1. Squinting, what stands out? Is it the answer to the tab's question?
2. How many bold things, how many accent things, how many boxes? Can one go?
3. Do the left edges line up, and the numbers down their column?
4. Is every capsule something to tap or a real exception?
5. Same gap for the same relationship everywhere?
6. On a wide screen: is the space used (columns, a grid), or is it one
   phone's column with empty sides or one row stretched across?

## 10. Every screen, either way up

Jay 2026-10-31: every app works on a phone upright or on its side, a
tablet and a computer, each laid out for its own space with today's look.
The kit reads the screen (`orbit.mjs` `screenFit()`, `onScreen(fn)`) and
marks `<html>`:

| Mark | When | What the kit does |
| --- | --- | --- |
| `q-tabrail` | a phone on its side (520 px tall or less), or 1100 px wide and up | the tab bar stands down the left side as a rail; the app's round action under it; nothing floats along the foot but an accessory |
| `q-float` | 600 px wide and up, taller than 520 | sheets are cards in the middle of the screen, every corner round |
| `q-wide` | the page has 640 px or more | the app lays the page out in two columns |
| `q-w3` | the page has 1000 px or more | three columns where there's content for them |

The page sits between the safe edges (the notch on a phone on its side)
and the rail, no wider than `--q-page-max` (720 by default: one readable
column), centred. Fixed things use `--q-vw` (the page's width), `--q-col-l`
and `--q-col-r` (beside it), `--q-mid` (its middle); never `100vw`.

**Laying a page out wide.** An app that lays out raises its own
`--q-page-max` (`:root.q-wide { --q-page-max: 1180px }`) and then:

- **Keeps the phone's order.** Reading left to right, top to bottom gives
  the same order as the phone's one column. The focus stays first: top
  left, or across the top.
- **Two columns of phone width, not one wide one.** The tab's answer and
  its list on the left; what goes with it (related lists, tools, the next
  thing) on the right. `.q-cols` (two, `.q-cols-3` three on `q-w3`, `.q-span`
  runs across). Each column is laid out as on a phone, so nothing inside
  needs a wide version.
- **A list and what it opens, side by side** where a tab is a list of
  things that each open a page (games, laws, entries): on a wide screen
  the opened one can fill the right pane instead of a sheet.
- **Like cards become a grid** (`repeat(auto-fill, minmax(300px, 1fr))`),
  never a list row 1200 px long. A sideways rail of cards shows more cards,
  never a lone half card at the end.
- **Reading stays narrow.** Running text (a law, a ruling, a word's
  meaning) keeps lines under about 40 Chinese characters (720 px).
- **A phone on its side is short** (330–390 px): no hero taller than half
  the screen, nothing extra pinned to the top or foot, sheets up from the
  foot, 600 wide at most.
- **Inside a sheet** stays a phone's width (600 at most): one column.
- Charts, maps and canvases redraw at the new size on `onScreen()`.

