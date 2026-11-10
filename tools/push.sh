#!/bin/sh
# The one way to push, from any Orbit repo: sh ../Orbit-Core/tools/push.sh
# (in Orbit-Core: sh tools/push.sh). A deploy that goes red mails Jay ("I
# don't like receiving those"), so main gets nothing that would fail what
# its deploy runs:
#   - the repo's tests, against the kit as the deploy sees it (Orbit-Core's
#     main: a clean Orbit-Core checkout beside it is fast-forwarded first);
#   - Orbit Class: its Vite build too;
#   - Orbit-Core with a kit/ change: every app's tests (tools/test-apps.mjs);
#   - the layout check (tools/layout-check.mjs: every tab and sheet that
#     matters at 320, an iPad and a laptop; no narrow band, no empty half, no
#     overflow): an app's when its visible files changed, every app's when
#     the kit's CSS or frame did (Jay 2026-11-06: "I hope I don't have to
#     fix issue a third time"). Where no browser can run, it's skipped.
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
changed=$(git diff --name-only origin/main HEAD)
apps=""
case "$name" in
  Orbit-Core) echo "$changed" | grep -qE '^kit/(orbit\.css|ui\.mjs|orbit\.mjs|hold-place\.mjs)$' && apps="sports transit weather orbit money news words beats law securities" ;;
  Orbit-Class) echo "$changed" | grep -qE '^(src|css|public)/|^index\.html$' && apps=orbit ;;
  Orbit-Showcase) ;;
  Orbit-*) echo "$changed" | grep -qE '^public/' && apps=$(echo "${name#Orbit-}" | tr 'A-Z' 'a-z') ;;
esac
if [ -n "$apps" ]; then
  echo "push: the layout check ($apps)…" >&2
  node "$core/tools/layout-check.mjs" $apps >"$log" 2>&1 || { cat "$log" >&2; no "the layout check failed (the shots it names are in /tmp/orbit-layout)"; }
  grep -E '^[a-z]+: ' "$log" >&2
fi
# (The checks above can take half an hour; another push may land meanwhile.
# Then the tree is rebased onto it and its tests run again, not the whole
# check: what landed passed its own.)
for try in 1 2 3; do
  git push -q origin HEAD:main 2>"$log" && { rm -f "$log"; echo "push: pushed." >&2; exit 0; }
  grep -qE 'rejected|fetch first|non-fast-forward' "$log" || { cat "$log" >&2; no "the push failed"; }
  echo "push: main moved meanwhile; rebasing and testing again…" >&2
  git -C "$repo" fetch -q origin main || no "fetch failed"
  git -C "$repo" rebase -q origin/main || no "rebase onto origin/main stopped (resolve it, then run this again)"
  npm test >"$log" 2>&1 || no "npm test failed after the rebase"
done
no "main kept moving"
