# Quadra handoff — 2026-10-01

## Resume: Quadra Hub

The owner asked to pause the Hub overhaul and leave a handoff. Do not treat
the Hub working tree as deployable or push it until this work is reviewed,
finished, and tested. The repository and public URL remain `Quadra-Rewards`;
the user will rename them separately.

All other requested app and shared-kit changes have been pushed to `main`.
Latest task commits:

- Shared-Proxy: `99cea23` Hub wallet rules, `9394be2` Windows kit-sync path
  fix, `ed221ba` stale-device cleanup guard, `aa9fc74` this handoff.
- Securities: `0c5558b`. Fixtures: `a99e2c1` and `74711f1`. Play:
  `28d66ca` and `052cfb4`. Orbit Class: `98903d8`.
- Verified suites: Shared-Proxy 81, Securities 106, Fixtures 67, Play 148,
  Orbit Class 304; Orbit lint and build passed. Repositories are clean and
  synced to `origin/main`, except the paused Hub worktree below.

## Hub worktree — uncommitted, paused

`Quadra-Rewards` is on `main` at `9c09c3c`, with changes not committed or
pushed. The in-progress local changes rename the product to Quadra Hub and
remove game UI, game missions, XP scoring and arcade assets; retain
vocabulary/pass features; and move avatar/frame customization to Plus. The
current worktree also changes vocabulary question distractors. These edits
are incomplete and have not had a complete post-change test run. Do not
assume deleted files or behavior are fully audited. The owner explicitly
paused this work for another agent to take over. The current Hub agent was
repeatedly instructed to stop and not commit or push, but had not acknowledged
or yielded when this handoff was written. The next agent should check the Hub
worktree status first and preserve all local work.

The worktree includes pre-existing local changes to
`public/data/audio/Celsius.mp3`, `Fahrenheit.mp3`, and `Internet.mp3`; preserve
those files unless the owner says otherwise. Review `git status` before
editing. The last known baseline was 44/44 tests before the current
game-removal edits; that does not validate this worktree.

Finish the requested vocabulary distractor improvement and Quadra Truth
financial-education content, then audit for all retired game screens, modules,
assets, tests, text, cache entries, and APIs. Remove obsolete code rather than
adding compatibility paths. Inspect the full diff, run `npm test`, and do
not push without the owner's direction.

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

The NBA Taiwan schedule only identifies ELTA, not its channel. Matched
Fixtures games currently open ELTA Sports 1; unmatched games are not assumed
to be carried.

Canonical shared kit: edit only `Shared-Proxy/kit/`, then run
`node kit/sync.mjs`. Run `npm test` in changed apps; Orbit Class also needs
`npx eslint .`.
