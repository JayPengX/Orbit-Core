# Quadra handoff — 2026-10-01

## Resume: Quadra Hub

The owner asked to pause the Hub overhaul and leave a handoff. Do not treat
the Hub working tree as deployable or push it until this work is reviewed,
finished, and tested. The repository and public URL remain `Quadra-Rewards`;
the user will rename them separately.

All other requested app and shared-kit changes have been pushed to `main`.

The Hub working tree has uncommitted changes for the Quadra Hub name, removal
of game UI and game XP/missions, Plus-only avatar/frame customization, and
vocabulary learning. It also includes pre-existing local changes to
`public/data/audio/Celsius.mp3`, `Fahrenheit.mp3`, and `Internet.mp3`; preserve
those files unless the owner says otherwise. Review `git status` before
editing. The current Hub changes have not had a complete post-change test run
and must not be represented as complete.

Finish the requested vocabulary distractor improvement and Quadra Truth
financial-education content, then audit for all retired game screens, modules,
assets, tests, text, cache entries, and APIs. Remove obsolete code rather than
adding compatibility paths. Run `npm test`, inspect the full diff, then ask
the owner before pushing if product or data-removal behavior is unclear.

## Production data cleanup

Shared Proxy contains the Hub wallet migration. It removes game XP and retired
game/cosmetic records, keeps vocabulary progress and active wallet data, and
preserves old cosmetic XP spends as debits (no refunds). It also prevents a
stale device from restoring pre-cleanup avatar/frame settings while allowing
newer Plus customization.

No live Firestore cleanup has been run. `ADMIN_TOKEN_HASH` in `eco-admin.js`
is empty, so the admin scan/clean endpoint is disabled. Active wallets migrate
when next written; inactive wallets need an authorized admin cleanup after
the token is deliberately configured. Verify the scan counts before any live
clean operation. Do not claim production data is fully purged until that run
is confirmed.

## Working rules

- The canonical shared kit is `Shared-Proxy/kit/`; edit it there and run
  `node kit/sync.mjs`, never hand-edit app copies.
- Run `npm test` in changed repositories before pushing to `main`. Orbit Class
  also uses `npx eslint .`.
- Preserve unrelated work in dirty worktrees. Do not commit the Hub audio
  changes as part of the Hub redesign without the owner's approval.
