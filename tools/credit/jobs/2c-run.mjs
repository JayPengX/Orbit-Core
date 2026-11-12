// Job 2c: job 2a again on 11-12's prompts (the 11-11 and 11-12 prompt and size
// changes, before stabilize week ends): every AI feature's examples through its
// own Claude model, built exactly as live. Job 2d reviews it.
import { run } from '../lib.mjs';
import { examplesRun } from './2a-run.mjs';
run('2c-run', async () => examplesRun().map(({ custom_id, params }) => ({ custom_id, params })), 1200);
