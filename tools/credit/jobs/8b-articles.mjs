// Job 8b: job 8's explainer on the everyday laws' next articles, past the first 3,500
// (MAX_ARTS more, 3,500 unless set). Out: out/8b-articles.jsonl, exported with job 8's.
import { run } from '../lib.mjs';
import { build } from './8-articles.mjs';

run('8b-articles', () => build({ from: 3500, max: Number(process.env.MAX_ARTS || 3500) }), 1100);
