// The guide (kit coach.mjs): every app's steps say something in both
// languages, each points at one selector at most, the apps are ones with a
// guide in Help, and no step taps something that saves, buys or deletes
// (Jay 2026-11-19: a guide never changes anything; such a step is `show`).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { GUIDES, hasGuide } from '../kit/coach.mjs';
import { HELP } from '../kit/help.mjs';

test('each guide: both languages, a selector or a line, an app with Help, nothing that writes tapped', () => {
  assert.ok(Object.keys(GUIDES).length > 0);
  for (const [app, steps] of Object.entries(GUIDES)) {
    assert.ok(HELP[app], `${app}: an app with a guide in Help`);
    assert.ok(hasGuide(app));
    assert.ok(steps.length >= 3 && steps.length <= 12, `${app}: ${steps.length} steps`);
    for (const s of steps) {
      assert.ok(Array.isArray(s.say) && s.say.length === 2 && s.say.every(w => typeof w === 'string' && w.trim()), `${app}: say in zh and en`);
      assert.ok(!(s.tap && s.show), `${app}: tap or show, not both`);
      if (s.tap) assert.doesNotMatch(s.tap, /(^|[^a-z-])(place|save|submit|delete|remove|buy|sell|confirm)([^a-z]|$)|\.primary/i, `${app}: ${s.tap} would change something; make it a show`);
    }
    assert.ok(!steps[0].tap, `${app}: opens on a line, before any tap`);
  }
});
