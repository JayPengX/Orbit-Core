# How a task goes

The steps every Orbit task follows, from Jay's ask to his phone, in order, with
the commands. Written so any agent starting from GitHub alone (no project
memory, no earlier conversation) works the way the family's threads do. The
rules behind each step live in `RULEBOOK.md` and are linked, never copied;
this page is the order and the tools. Since 2026-11-17 (Jay: "another agent
going from purely the GitHub can immediately deliver the same quality").

The short form: **find the cause, fix it everywhere, guard it with a test,
see it at every size in both languages, push to `main`, prove it's live,
show Jay screenshots, tell him in a few plain lines.**

## 1. Before writing anything

1. Read `CLAUDE.md`'s table and only what the task needs; working in an app,
   its `MAP.md` › Rules always.
2. Take the ask as a customer's (RULEBOOK §1): find what really goes wrong,
   not the words. See it first, on live data, the way Jay saw it (his size,
   language, light or dark): `node tools/preview.mjs <app> --live --width 390`
   (`--lang en`, `--dark`), or `node tools/shots.mjs <app> <page>` for a
   moment named in `tools/shots/pages.mjs` (a planned trip, a game sheet).
   A 除錯紀錄 he sends holds his phone's numbers: read them before guessing.
   His screenshots are iPhone or iPad, a home-screen app, Safari's engine.
3. Look for what exists: `node tools/kit-find.mjs <word…>` (`--apps` finds
   copies), and the last time it broke: `git log -S'<name>' --oneline` or
   `git log --grep '<word>'` in the repos. A fault that came back is fixed at
   its root this time, not patched again.
4. Say the cause in one sentence before fixing it. If the ask is a choice that
   is truly Jay's, ask with tap options (RULEBOOK §1) and keep working on the
   option you'd pick.

## 2. The change

- The smallest correct change, and the same fault fixed everywhere it lives
  (every app, when it's the kit's). No hard-coded case for the place Jay
  tested (RULEBOOK §1).
- **A guard test for every fixed bug, and it fails without the fix:** run it
  once on the old code (`git stash` the fix, see it red, `git stash pop`, see
  it green). Logic only, never a test that locks a layout (RULEBOOK §1). A
  bug only a real browser shows gets a test that plays it in a page
  (`tests/kit-keyboard.test.mjs` plays an iPhone's keys).
- AI: code first; a model only behind a person's tap (`aiTap`), on the
  smallest model that does it well, nothing made ahead (RULEBOOK §2 › AI).
  Our own work on a model (a batch job, a headless task) runs only on the
  free credit (RULEBOOK §4, `tools/credit/`, `agent.yml`).
- In the same push: the `MAP.md` it made wrong, a `FEATURES.md` line for a new
  feature, a rule Jay set in `RULEBOOK.md` or the app's `MAP.md`, `HANDOFF.md`
  for a new account, secret or schedule.
- The repos are public: never a key, Jay's real name, school or inbox.

## 3. See it before it ships

First time in a cloud container: the setup at the top of `tools/README.md`
(Chinese fonts; WebKit under `live-scroll.mjs`). Then, for what you changed:

| The change | Run |
| --- | --- |
| Anything visible | `node tools/shots.mjs <app> [page…] --before main`, then again with `--lang en`: 320 and 390, a phone on its side, tablet, computer, light and dark, against what's live |
| Many screens, or the kit | `node tools/family-check.mjs <app…>`: errors, a stuck loading screen, Chinese in English, cut text, in both languages |
| A layout | `node tools/layout-check.mjs <app…>`: 320, an iPad on its side, a laptop |
| A list, a sheet or anything live that scrolls | `node tools/live-scroll.mjs <app> --webkit`: nothing jumps in Safari's engine |
| The kit | `node tools/test-apps.mjs`: every app's tests against it |
| Wording, links, the loading screen | `node tools/gate.mjs <app>` |
| Transit's trips | `node scripts/live-check.mjs` in Orbit-Transit |

Then look at every shot the way Jay does (RULEBOOK §3, "Before calling UI
done"): overflow, cut or wrapped text, empty space, pieces out of proportion,
anything of the old look, too many words, unnatural Chinese or English.
Fix what you see before pushing; a tool passing is not the same as looking.

## 4. Ship

- `sh ../Orbit-Core/tools/push.sh` (in Orbit-Core `sh tools/push.sh`): straight
  to `main`, never a branch or a pull request, even when a session's own setup
  asks for one (RULEBOOK §1 › Shipping). It rebases and runs the repo's tests.
- Each finished fix pushed on its own, at once; never held behind unfinished
  work. A kit change first, then the apps that use it.
- The commit: one plain line of what a person sees, numbers when there are
  numbers, the cause in brackets.

## 5. Prove it's live

1. The deploy went green: the repo's Actions run (`pages.yml` the kit,
   `deploy.yml` the Workers, each app's own deploy).
2. The site serves your commit: `curl -s https://orbit.jaypengx.com/<slug>/version.json`
   for an app, `…/Orbit-Core/kit/version.json` for the kit, names it. A Worker:
   ask its route on `api.jaypengx.com`.
3. Shoot what's live, in both languages: `node tools/shots.mjs <app> [page…] --at main`
   (and `--lang en`), or `--before <the commit before yours> --at main` for a
   before and after of the live build.

A phone takes a new version on its next opening (RULEBOOK §2 › Speed).

## 6. Show Jay: every task ends with screenshots

Jay judges by looking, so a reply without a picture of the result isn't done.

- **What:** the screen the change is on, live, real data, the whole screen
  with its tab bar (crop or a zoomed callout only to frame, never to hide).
  Something changed: before and after side by side (`changes.png` from
  `shots.mjs`). A new screen: its phone shot, light and dark, Chinese and
  English, plus the iPad and computer when it's laid out for them
  (`sheet.png`). Something with no screen (a Worker, data, a cost): the screen
  it feeds, or the numbers before → after.
- **Real:** the world's data live, a person's own data only from a demo
  account made by using the app (`tools/README.md` › Authentic); never a
  made-up number or a mock.
- **Where:** attached to the reply, and kept where Jay can open them (the
  project's shared folder, `apps/<app>/<topic-date>/`), never in a repo.
- A screenshot set that sells an app (README, Showcase) follows RULEBOOK §3's
  shot rules: what the app is for first, one feature a shot, real numbers in
  the headlines, light and dark mixed, never a competitor's name.

## 7. Tell Jay

He reads on his phone, between other things, and doesn't read code
(RULEBOOK §1).

- Lead with the outcome in plain words: what he'll notice, and whether it's
  live. Then a few lines, never a wall: the cause in one sentence, numbers
  before → after where there are numbers.
- **What only his iPhone can show**, listed so he can check: the real keyboard
  (emoji, 注音), the home-screen app's window turning and coming back,
  notices arriving, passkeys and Face ID, iOS's quick view, sound with the
  screen off. Say which of them you checked another way (the iOS Simulator on
  his Mac, when it's on) and which you couldn't.
- **Any rule you overrode**, by name, and why in a line (RULEBOOK's opening:
  rules are strong defaults).
- Anything not checked, said plainly. A question is tap options, never a typed
  question.
- A report of a whole round is a new document written from scratch, never the
  last one with dated sections stacked on (RULEBOOK §1).

## 8. Close

When it's live and checked: the task (thread, issue, conversation) is closed
and named for what it did. A rule Jay set along the way is already in the
rulebook (§2); what an agent learned that the next one needs goes in the doc
it belongs to, in the same push.
