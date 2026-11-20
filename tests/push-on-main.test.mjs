// Jay 2026-11-20: "how could we ever remove those hooks". A cloud session
// starts on a branch of its own (claude/…); push.sh ships to main only, so
// the session's stop hook counted every shipped commit as unpushed against
// that branch. Once pushed, the checkout is left on main, at what was
// pushed: the hook compares with origin/main and finds nothing.
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const push = fileURLToPath(new URL('../tools/push.sh', import.meta.url));

test('after a push the checkout is on main, at what was pushed, with nothing left unpushed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'orbit-push-'));
  try {
    const git = (cwd, ...a) => execFileSync('git', a, { cwd, encoding: 'utf8', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } }).trim();
    const origin = join(dir, 'origin.git');
    // (Named Orbit-Core: push.sh then fetches no Orbit-Core beside it.)
    const repo = join(dir, 'Orbit-Core');
    git(dir, 'init', '-q', '--bare', '-b', 'main', origin);
    git(dir, 'init', '-q', '-b', 'main', repo);
    git(repo, 'remote', 'add', 'origin', origin);
    writeFileSync(join(repo, 'package.json'), JSON.stringify({ scripts: { test: 'true' } }));
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'start');
    git(repo, 'push', '-q', 'origin', 'main');
    // The session's own branch, on GitHub too, and a commit made on it.
    git(repo, 'checkout', '-q', '-b', 'claude/session');
    git(repo, 'push', '-q', 'origin', 'claude/session');
    writeFileSync(join(repo, 'a.txt'), 'fix');
    git(repo, 'add', '-A');
    git(repo, 'commit', '-q', '-m', 'fix');
    // (Something not yet committed stays as it is.)
    writeFileSync(join(repo, 'b.txt'), 'draft');
    execFileSync('sh', [push], { cwd: repo, stdio: 'pipe', env: { ...process.env, GIT_AUTHOR_NAME: 't', GIT_AUTHOR_EMAIL: 't@t', GIT_COMMITTER_NAME: 't', GIT_COMMITTER_EMAIL: 't@t' } });
    assert.equal(git(repo, 'branch', '--show-current'), 'main');
    assert.equal(git(repo, 'rev-parse', 'HEAD'), git(origin, 'rev-parse', 'main'), 'main on GitHub is what was pushed');
    assert.equal(git(repo, 'rev-list', '--count', 'origin/main..HEAD'), '0', 'nothing the hook could call unpushed');
    assert.equal(git(repo, 'rev-parse', '--abbrev-ref', 'main@{upstream}'), 'origin/main');
    assert.match(git(repo, 'status', '--porcelain'), /b\.txt/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
