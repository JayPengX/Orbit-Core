// ---- mail.js: mail from the domain (Jay 2026-11-14) ----
// The alert mails to the owner (mail-alerts.js) and the admin panel's 寫信
// (eco-admin.js `mail-send`), sent from <name>@<DOMAIN>.
//
// Two ways out, both free:
//   - Cloudflare's own (the `MAIL` send_email binding, wrangler.toml): to a
//     verified destination address of the account's Email Routing (the
//     owner's own inbox), free on Workers Free and never counted. The
//     domain's SPF, DKIM (cf2024-1) and DMARC are Email Routing's.
//   - Resend (RESEND_API_KEY, a GitHub secret deploy.yml copies): to anyone,
//     once the owner added the domain there. Its free plan: 100 a day,
//     3,000 a month; we stop at RESEND_DAY and RESEND_MONTH.
// Cloudflare first; Resend only for an address Cloudflare refuses.
//
// The settings (the panel's 工具 › 郵件): D1 `orbit-config/mail`
// { to, on, quiet, name } — the owner's address lives there, never in git.

import { keptRead, keptPut } from './kept-store.js';
import { DOMAIN } from './kit/domain.mjs';

export const MAIL_DOC = ['orbit-config', 'mail'];
export const RESEND_DAY = 90;
export const RESEND_MONTH = 2_900;
// The most addresses one 寫信 sends to (one mail each).
export const MAX_TO = 20;
const COUNT_KEY = 'mail:count';
const LOG_KEY = 'mail:log';
const twDay = (ms = Date.now()) => new Date(ms + 8 * 3_600_000).toISOString().slice(0, 10);

export const isAddress = s => /^[^\s@<>()",;:]+@[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(String(s || '').trim()) && String(s).length <= 254;
// Addresses from what was typed (commas, spaces, new lines, `Name <a@b>`), each once.
export function addressesOf(raw) {
  const out = [];
  for (const part of String(raw || '').replace(/[^,;\n，；<]*<([^>]+)>/g, ' $1 ').split(/[\s,;，；]+/)) {
    const a = part.trim().toLowerCase();
    if (a && !out.includes(a)) out.push(a);
  }
  return out;
}

export async function mailSettings(env, deps) {
  const doc = await deps.fsGet(env, ...MAIL_DOC).catch(() => null);
  let s = {};
  try {
    if (doc?.exists) s = JSON.parse(doc.payload);
  } catch {}
  return { to: isAddress(s.to) ? s.to : '', on: s.on !== false, quiet: s.quiet !== false, name: String(s.name || 'Orbit').slice(0, 60) };
}
export async function setMailSettings(env, deps, body) {
  const now = await mailSettings(env, deps);
  const to = body.to === undefined ? now.to : String(body.to || '').trim().toLowerCase();
  if (to && !isAddress(to)) return { error: 'MAIL_BAD_ADDRESS', status: 400 };
  const next = { to, on: body.on === undefined ? now.on : !!body.on, quiet: body.quiet === undefined ? now.quiet : !!body.quiet, name: body.name === undefined ? now.name : String(body.name || 'Orbit').trim().slice(0, 60) || 'Orbit', at: deps.now() };
  await deps.fsWrite(env, ...MAIL_DOC, JSON.stringify(next));
  return next;
}

// Resend's count this Taiwan day and month: { day, month, dayN, monthN }.
export async function sentCounts(env, now = Date.now()) {
  const c = (await keptRead(env, COUNT_KEY)) || {};
  const day = twDay(now);
  return { day, dayN: c.day === day ? c.dayN || 0 : 0, monthN: c.month === day.slice(0, 7) ? c.monthN || 0 : 0 };
}
async function countResend(env, now) {
  const c = await sentCounts(env, now);
  await keptPut(env, COUNT_KEY, { day: c.day, dayN: c.dayN + 1, month: c.day.slice(0, 7), monthN: c.monthN + 1 }, 40 * 86_400);
}
// The last 40 mails sent (the panel's 最近寄出).
export async function mailLog(env) {
  return (await keptRead(env, LOG_KEY)) || [];
}
async function logSent(env, row) {
  const log = await mailLog(env);
  await keptPut(env, LOG_KEY, [row, ...log].slice(0, 40), 60 * 86_400);
}

// Why a mail didn't go, in the panel's words.
const WHY = {
  E_RECIPIENT_NOT_ALLOWED: '這個信箱還沒在 Cloudflare 驗證（Email Routing › 目的地地址）',
  E_SENDER_NOT_VERIFIED: '寄件網域還沒在 Cloudflare 開好寄信',
  E_SENDER_DOMAIN_NOT_AVAILABLE: '寄件網域還沒在 Cloudflare 開好寄信',
  E_RATE_LIMIT_EXCEEDED: 'Cloudflare 說寄太快了，等一下再寄',
  E_DAILY_LIMIT_EXCEEDED: 'Cloudflare 今天的寄信量用完了',
  E_RECIPIENT_SUPPRESSED: '這個信箱之前退信，Cloudflare 不再寄給它'
};
export const whyOf = e => WHY[e?.code] || (/destination address|not verified|recipient/i.test(String(e?.message || '')) ? WHY.E_RECIPIENT_NOT_ALLOWED : String(e?.message || e).slice(0, 160));

// One mail: { to, subject, html, text, from: { name, user }, replyTo, kind }.
// → { via, id } or throws an Error whose `why` is the panel's words.
export async function sendMail(env, { to, subject, html, text, from = {}, replyTo = '', kind = 'mail' }, { fetchImpl = fetch, now = Date.now() } = {}) {
  if (!isAddress(to)) throw Object.assign(new Error('bad address'), { why: '信箱格式不對' });
  const sender = { email: `${from.user || 'hello'}@${DOMAIN}`, name: from.name || 'Orbit' };
  let cfWhy = '';
  if (env.MAIL?.send) {
    try {
      const r = await env.MAIL.send({ to, from: sender, subject, html, text, ...(replyTo ? { replyTo } : {}) });
      await logSent(env, { at: now, to, subject, via: 'cloudflare', kind }).catch(() => {});
      return { via: 'cloudflare', id: r?.messageId || '' };
    } catch (e) {
      cfWhy = whyOf(e);
      console.log('mail: cloudflare refused', e?.code || '', String(e?.message || e).slice(0, 160));
    }
  } else cfWhy = '代理沒有 MAIL 綁定（還沒部署）';
  if (!env.RESEND_API_KEY) throw Object.assign(new Error(cfWhy), { why: cfWhy, needsResend: /驗證/.test(cfWhy) });
  const c = await sentCounts(env, now);
  if (c.dayN >= RESEND_DAY || c.monthN >= RESEND_MONTH) throw Object.assign(new Error('resend full'), { why: c.dayN >= RESEND_DAY ? `Resend 今天免費的 ${RESEND_DAY} 封用完了，明天再寄` : `Resend 這個月免費的 ${RESEND_MONTH} 封用完了` });
  const res = await fetchImpl('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: `${sender.name.replace(/[<>"]/g, '')} <${sender.email}>`, to: [to], subject, html, text, ...(replyTo ? { reply_to: replyTo } : {}) }),
    signal: AbortSignal.timeout(15_000)
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const why = `Resend：${String(body?.message || `HTTP ${res.status}`).slice(0, 160)}`;
    throw Object.assign(new Error(why), { why });
  }
  await countResend(env, now).catch(() => {});
  await logSent(env, { at: now, to, subject, via: 'resend', kind }).catch(() => {});
  return { via: 'resend', id: body?.id || '' };
}
