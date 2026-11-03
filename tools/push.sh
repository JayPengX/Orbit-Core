#!/bin/sh
# The one way to push, from any Orbit repo: sh ../Orbit-Core/tools/push.sh
# (in Orbit-Core: sh tools/push.sh). A deploy that goes red mails Jay ("I
# don't like receiving those"), so main gets nothing that would fail what
# its deploy runs:
#   - the repo's tests, against the kit as the deploy sees it (Orbit-Core's
#     main: a clean Orbit-Core checkout beside it is fast-forwarded first);
#   - Orbit Class: its Vite build too;
#   - Orbit-Core with a kit/ change: every app's tests (tools/test-apps.mjs).
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

if [ "$name" = Orbit-Core ]; then
  if git diff --name-only origin/main HEAD | grep -q '^kit/'; then node tools/test-apps.mjs >"$log" 2>&1 || { cat "$log" >&2; no "an app fails with this kit"; }; fi
fi
rm -f "$log"
git push origin HEAD:main
