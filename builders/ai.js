// The family's AI made once and kept (Jay 11-14: AI only on what someone
// opens; nothing made ahead for everyone): one step left, the admin's
// 除錯紀錄週報 (rec-weekly.js), Mondays from 06:00 Taiwan, once a week; by
// hand (`ai-weekly`) it makes it now. Run with the 'ai' slot (run.js), the
// call through the AI door's aiOnce (ai.js: the feature's day cap, its
// models in turn, every call logged).
import { aiOnce } from '../ai.js';
import { runRecWeekly } from '../rec-weekly.js';
import { usage as meterUsage } from '../transit.js';

export async function runAi({ store, env, now = Date.now(), cap = async () => 0, ctx = null, only = null }) {
  if (only && only !== 'weekly') return {};
  const t = Date.now();
  let weekly;
  try {
    weekly = await runRecWeekly({ store, env, ctx, cap: await cap('rec-weekly'), now, aiOnce, usage: () => meterUsage(env, now), force: only === 'weekly' });
  } catch (e) {
    weekly = { failed: String(e?.message || e).slice(0, 200) };
  }
  const ms = Date.now() - t;
  return { weekly, ...(ms >= 1000 ? { ms: { weekly: ms } } : {}) };
}
