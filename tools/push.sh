#!/bin/sh
# The one way to push, from any Orbit repo: sh ../Orbit-Core/tools/push.sh
# (in Orbit-Core: sh tools/push.sh). A deploy that goes red mails Jay ("I
# don't like receiving those"), so main gets nothing that would fail what
# its deploy runs:
#   - the repo's tests, against the kit as the deploy sees it (Orbit-Core's
#     main: a clean Orbit-Core checkout beside it is fast-forwarded first);
#   - Orbit Class: its Vite build too.
# Nothing more (Jay 2026-11-15: "I want fast pushing that things go live as
# fast as it could": every app's tests on a kit change and the layout check
# made a push 15 minutes and caught nothing; run them by hand when wanted,
# tools/test-apps.mjs, tools/layout-check.mjs).
# The tree is rebased onto origin/main first; then `git push origin HEAD:main`.
repo=$(git rev-parse --show-toplevel) || exit 1
name=$(basename "$repo")
core=$(cd "$(dirname "$0")/.." && pwd)
log=$(mktemp)
no() { echo "push: $1, nothing pushed." >&2; [ -s "$log" ] && grep -E '^not ok|FAIL|Error|error' "$log" | head -15 >&2; rm -f "$log"; exit 1; }

git -C "$repo" fetch -q origin main || no "fetch failed"
git -C "$repo" rebase -q origin/main || no "rebase onto origin/main stopped (resolve it, then run this again)"

if [ "$name" != Orbit-Core ] && [ -z "$(git -C "$core" status --porcelain)" ]; then
  git -C "$core" fetch -q origin main 2>/dev/null && git -C "$core" merge -q --ff-only origin/main >/dev/null 2>&1
fi

cd "$repo" || exit 1
npm test >"$log" 2>&1 || no "npm test failed"
if [ "$name" = Orbit-Class ]; then npm run build >"$log" 2>&1 || no "the build failed"; fi

# (Another push may land meanwhile: then the tree is rebased onto it and
# its tests run again.)
for try in 1 2 3; do
  git push -q origin HEAD:main 2>"$log" && { rm -f "$log"; echo "push: pushed." >&2; exit 0; }
  grep -qE 'rejected|fetch first|non-fast-forward' "$log" || { cat "$log" >&2; no "the push failed"; }
  echo "push: main moved meanwhile; rebasing and testing again…" >&2
  git -C "$repo" fetch -q origin main || no "fetch failed"
  git -C "$repo" rebase -q origin/main || no "rebase onto origin/main stopped (resolve it, then run this again)"
  npm test >"$log" 2>&1 || no "npm test failed after the rebase"
done
no "main kept moving"
