// ---- worker.js ----
// orbit-workers-proxy: the one proxy, every app's server side (Quadra
// Securities and Play, Orbit Sports, Transit, Weather, Words and Class).
// Routed by path, each route's work in its own file:
//
//   GET/POST/PATCH/DELETE /eco   the Quadra Pass: one account and one NT$
//                                money pool for every Quadra app, and each
//                                app's data (eco.js)
//   POST  /gemini                Orbit Class's AI schedule-photo import
//   POST  /nl-edit               Orbit Class's natural-language edits
//   GET   /slip, POST /slip-scan Slip Tracker's game lists and ticket photos (slip.js)
//   POST  /law-ask               Orbit Law's questions on a law's articles (law.js)
//   POST  /law-chat              Orbit Law's 問法律, answered from the articles it finds (law-chat.js)
//   GET   /law-page              A government page (gov.tw) read inside Orbit Law (law-page.js)
//   POST  /law-gist              Orbit Law's shared one-line bill and law summaries (law-gist.js)
//   GET   /kambi                 Kambi's live scores for Quadra Play (kambi.js)
//   GET/POST /push/…             notices while an app is closed (push.js)
//   GET   /weather/…             Orbit Weather's blended forecast (weather.js)
//   GET   /transit/…             Orbit Transit's map, places, routes and TDX data (transit.js)
//   GET/POST /play               Quadra Play's slips placed, cashed out and settled (settle.js)
//   POST  /stock                 Quadra Securities' orders filled at the proxy's own quote (stock-fill.js)
//   GET   /sports-proxy          the data proxy for Sports, Play and Securities (sports.js)
//   GET   /data/…                the family's data in R2: packs, the mirror, bus packs (data.js)
//   GET   /config                the developer settings
//
// The crons (scheduled, below): notices, Kambi, the weather's scoring and
// capacity on the even minutes; Play's slips and lottery on the odd ones; F1's
// laps each minute Thursday to Monday; the family's data (builders/: Play's board every ten minutes, the rest hourly or daily). Every route but /eco's sign-in needs a
// Quadra Pass session (`qt=`); CORS and JSON answers come from http.js. It
// runs in Taiwan ([placement], wrangler.toml), where the people and most
// sources are. The Quadra Pass is the only way anything is saved.

import { handleSlip, handleSlipScan } from './slip.js';
import { handleLawAsk } from './law.js';
import { handleLawChat } from './law-chat.js';
import { handleLawGist } from './law-gist.js';
import { handleLawPage } from './law-page.js';
import en from './locales/en.js';
import zhTW from './locales/zh-TW.js';
import { handleEcoRequest, LOCK_SINCE } from './eco.js';
import { checkStock } from './stock-check.js';
import { readToken, tokenSecret, signToken, sessionLimited } from './quadra-token.js';
import { handleKambiRequest, refreshKambiWatch, fetchKambiLive } from './kambi.js';
import { handlePush, sendDue, notifyNow } from './push.js';
import { handlePlay, settleCron, moveSlips } from './settle.js';
import { lottoCron, moveTickets } from './lotto.js';
import { asiaBaseballResponse, ASIA_HOST } from './asia-baseball.js';
import { f1LiveResponse, F1_LIVE_HOST } from './f1-live.js';
import { handleWeather } from './weather.js';
import { weatherCron, skillReport } from './weather-skill.js';
import { handleTransit, tally } from './transit.js';
import { readDev, capacityCron } from './eco-admin.js';
import { paceOf } from './pace.js';
import { beat, tellOwner, systemReport, tell, billNotice, OPS_DOC } from './ops.js';
import { applyScale } from './capacity.js';
import { handleSports, sportsCron, useDevSettings } from './sports.js';
import { isAllowedOrigin, corsHeaders, json, LOCAL_ORIGIN, bodyText } from './http.js';
import { handleData } from './data.js';
import { handleStock, moveBook } from './stock-fill.js';
import { runBuilders, SLOTS as BUILD_SLOTS } from './builders/run.js';
import { docStore, storeReady } from './doc-store.js';
import { STATE_KEY as GUARD_STATE } from './guard.js';
// The F1 lap log's Durable Object (f1-live.js), bound as F1_LOG.
export { F1Log } from './f1-live.js';

// ---- Bilingual error responses ----------------------------------------
//
// Every error this Worker returns used to be a plain, fixed-language
// `message` string - some written in English, some in Traditional Chinese,
// picked ad hoc by whoever wrote that call site rather than by any
// consistent rule. That made the response impossible for a caller to
// localize (an English-reading Match Find-style consumer would see raw
// Chinese with no way to tell what it meant) and impossible to branch on
// reliably (matching against message text breaks the moment the wording is
// tweaked).
//
// The fix: every error carries a stable, never-translated `code` (for a
// caller that wants to render its own UI string) alongside a `message` that
// is picked at response time from ERROR_MESSAGES based on the request's
// `Accept-Language` header (for a caller that just wants to display
// something reasonable as-is, same as before).
//
// Each language's actual text lives in its own file under locales/ (see
// locales/en.js, locales/zh-TW.js, imported at the top of this file) -
// ERROR_MESSAGES below just zips them together by code, so errorJson() can
// keep doing `ERROR_MESSAGES[code][locale]`. Adding a third language later:
// copy locales/en.js to locales/<code>.js (every code `en` has should exist
// there too), import it above, add one line below, and add a branch to
// pickLocale().
//
// `en` is treated as authoritative for the codes that were already English
// before bilingual support existed (POST_ONLY, INVALID_JSON, etc.) - the
// zh-TW text next to them is a later translation, not a change to English
// callers' behavior. The codes that were already Chinese (RATE_LIMITED,
// DAILY_QUOTA_EXCEEDED, MISSING_API_KEY) keep their
// original zh-TW wording byte-for-byte, with English added alongside.
const ERROR_MESSAGES = Object.fromEntries(
  Object.keys(en).map((code) => [code, { en: en[code], 'zh-TW': zhTW[code] }])
);

// Defaults to zh-TW whenever the header is absent or doesn't clearly prefer
// English, to preserve current behavior for callers that don't send this
// header - only a request that
// actually says English first (`en`, `en-US`, `..., en;q=...`, etc.) gets
// English back.
function pickLocale(request) {
  const header = (request.headers.get('Accept-Language') || '').trim();
  if (/^en\b/i.test(header) || /,\s*en\b/i.test(header)) return 'en';
  return 'zh-TW';
}

// Every static, fixed-wording error goes through this - looks up `code` in
// ERROR_MESSAGES and picks the response language from the request's
// Accept-Language header. The response shape (`{ error: { code, message } }`)
// keeps the pre-existing `message` field so callers that just display
// `error.message` raw keep working unchanged.
function errorJson(code, status, headers, request) {
  const msgs = ERROR_MESSAGES[code] || {};
  const message = msgs[pickLocale(request)] ?? msgs['zh-TW'] ?? code;
  return json({ error: { code, message } }, status, headers);
}

// The one error whose message is dynamic (the upstream's own error text),
// so it can't come from ERROR_MESSAGES.
function upstreamFailed(error, headers) {
  return json({ error: { code: 'UPSTREAM_FAILED', message: error.message || 'Upstream request failed' } }, 502, headers);
}

// A body parses to any JSON value, `null` included, so a failed parse needs
// a sentinel of its own: `(await readJsonBody(request)) === INVALID_BODY`
// means the caller should answer INVALID_JSON. So does one past `max` bytes
// (http.js bodyText): an app's save is at most a few MB, a photo import 18.
const INVALID_BODY = Symbol('invalid body');
const BODY_MAX = 8_000_000;
async function readJsonBody(request, max = BODY_MAX) {
  try {
    const text = await bodyText(request, max);
    return text == null ? INVALID_BODY : JSON.parse(text);
  } catch {
    return INVALID_BODY;
  }
}

// ---- Shared rate limiting (in memory, never KV) ----
//
// Counted in each isolate's memory, one counter per feature and IP an hour.
// It used to be counted in Workers KV so every isolate saw the same count,
// but that cost a KV write per busy minute per IP and kept running the
// account into KV's free-tier daily caps (1,000 writes, 100,000 reads),
// which emailed the owner and broke every feature that stores in KV.
// The guard that matters is the Quadra Pass: the routes worth abusing need
// one, and those count per session (quadra-token.js sessionLimited).
// Under that, a per-isolate count still stops a single client's flood, and
// Cloudflare's own daily request cap is the backstop.
const RATE_WINDOW_MS = 60 * 60 * 1000;
const DAY_WINDOW_MS = 24 * 60 * 60 * 1000;

const requestLog = new Map();
export function isRateLimitedInMemory(bucketKey, limit, windowMs = RATE_WINDOW_MS, now = Date.now()) {
  const bucket = Math.floor(now / windowMs);
  const c = requestLog.get(bucketKey);
  if (!c || c.bucket !== bucket) {
    // Full: drop the past windows' counts, then per-client ones; never the
    // global daily caps (a spray of new addresses mustn't reset them).
    if (requestLog.size > 20000) {
      for (const [k, v] of requestLog) if (v.bucket !== Math.floor(now / (k.startsWith('daily-cap:') ? DAY_WINDOW_MS : windowMs))) requestLog.delete(k);
      if (requestLog.size > 20000) for (const k of requestLog.keys()) if (!k.startsWith('daily-cap:')) requestLog.delete(k);
    }
    requestLog.set(bucketKey, { bucket, n: 1 });
    return 1 > limit;
  }
  c.n++;
  return c.n > limit;
}

// `feature` keys the counter (e.g. 'gemini', 'sync:read', 'sync:write') so
// every call site's limit is tracked apart from every other's.
function isRateLimited(env, ip, feature, limit, windowMs = RATE_WINDOW_MS) {
  return isRateLimitedInMemory(`${feature}:${ip}`, limit, windowMs);
}

// Charges one request against `feature`'s per-IP hourly counter and returns
// the 429 response to send if it's over `limit`, else null.
// X-RateLimit-Backend says which limiter ran (diagnostic only).
async function rateLimitResponse(env, ip, feature, limit, headers, request) {
  headers['X-RateLimit-Backend'] = 'memory';
  return isRateLimited(env, ip, feature, limit) ? errorJson('RATE_LIMITED', 429, headers, request) : null;
}

// A ceiling on TOTAL calls to a billed Gemini route a day across every
// caller, not per IP. It is counted per isolate, so the true ceiling is
// this many per running isolate (a handful, with the Worker placed in one
// region). The origin gate below and Google's own billing cap on the
// key are the other halves.
async function isDailyGlobalCapped(env, feature, limit) {
  return isRateLimited(env, 'global', `daily-cap:${feature}`, limit, DAY_WINDOW_MS);
}

// ---- Origin gate for every route that calls the real, billed Gemini API ---
//
// On its own, `isAllowedOrigin` only feeds corsHeaders - purely ADVISORY, since CORS is a browser-side
// promise, not a server-side one: it stops a well-behaved BROWSER from
// reading a disallowed page's response, but the request itself was always
// fully processed (including the real, billed Gemini call) before that
// browser was ever told no. A direct curl/script call doesn't send or care
// about CORS at all, so every one of these routes was, in practice,
// callable by anyone who simply knew the URL - exactly the exposure a
// public GitHub repo whose client source contains that same URL creates.
//
// GEMINI_BILLED_PATHS makes the check an actual, enforced GATE instead: reject before
// EVER reaching a billed handler if Origin is missing or not in
// ALLOWED_ORIGINS. This costs every real caller nothing - every route this
// applies to is a POST with a JSON body, which browsers always treat as a
// CORS "non-simple" request and always attach a real Origin header to,
// preflight included - so a legitimate call from Orbit/Orbit Vocab's own
// already-working pages is completely unaffected; only a bare
// script/curl call (no Origin at all) or a request from some OTHER site
// embedding a fetch to this Worker (a real Origin, just not an allowed
// one) is newly rejected.
//
// HONEST LIMIT: an Origin header is just text a non-browser client can set
// to whatever it wants - a targeted attacker who reads this file (this is
// a public, open-source repo) can trivially copy the allowed Origin value
// verbatim. This gate stops opportunistic/naive abuse (URL scanners,
// another site's page silently spending your quota through its visitors'
// browsers) and, combined with isDailyGlobalCapped above, hard-bounds the
// worst case even against someone who does spoof it. It is NOT real
// authentication - this app has no user accounts to authenticate, and no
// client-side secret can ever be genuinely secret in a fully public static
// site's own source. Real lock-down would need a backend with real user
// identity, which is a materially bigger change than this route currently
// has any other reason to need.
const GEMINI_BILLED_PATHS = new Set(['/gemini', '/nl-edit']);

// ==== /gemini - AI schedule-photo import ====================================

// Taiwan is UTC+8 with no DST, so a fixed offset gives the exact local
// calendar date - no timezone database needed for a Worker that otherwise
// runs in UTC. Used to anchor buildGeminiPrompt's year-less-date rule to "today"
// from this app's users' own point of view, not the server's.
function todayIsoInTaipei() {
  return new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// Exact copy of the prompt that used to live in src/gemini-ocr.js's
// AIVisionProcessor.buildPrompt() - kept here now instead, since the whole
// point of moving it server-side is that the client no longer sends it.
//
// Single-file, and self-classifying, deliberately: an earlier version split
// this into two separate fixed prompts (a "timetable" one and a
// "registration" one) and had the CLIENT decide, purely from upload order,
// which file went to which - file 1 was always assumed to be the timetable,
// every file after it a registration record. That broke completely the
// moment someone picked the files in the other order: the registration form
// got read as if it were a timetable grid (producing garbage), and the
// actual timetable photo got read as if it were a course list (finding
// nothing to extract). There is no reliable signal in upload order - a file
// picker doesn't know or care what's in the files - so the model has to
// determine this itself instead of trusting how the files arrived. Every
// file now gets exactly this one prompt, and "documentKind" is the model's
// own answer to "what am I looking at", read back by
// src/gemini-ocr.js's recognizeAndMerge to route each file's result
// correctly regardless of what order it was uploaded in.
//
// This does cost a little more per call than the two-separate-prompts
// version did (every call now carries both rule sets, not just the one that
// turned out to matter) - a fixed, modest, worthwhile trade for a bug class
// this is not: getting the whole import right no matter what order the
// files came in, rather than getting it cheaply and only when they came in
// the order the code silently assumed.
// A function of "today" rather than a plain constant: countdownEvents below
// needs a reference date so the model can resolve a year-less calendar date
// (e.g. a poster showing only "1/22", no year) to the correct year itself,
// instead of guessing one with no anchor at all - which in practice skewed
// toward whatever year the model's training data made it default to, often
// landing the "countdown" in the past. Computed fresh per request rather
// than once at module load, since a Worker instance can stay warm across
// requests spanning a real date change.
function buildGeminiPrompt(todayIso) {
  return `Look at the attached file and decide what kind of document it is, then extract accordingly. Return a single JSON object matching this exact schema:
{
  "documentKind": "timetable",
  "bellTimes": [],
  "breakTimes": [{"name":"午休","start":"12:00","end":"13:00"}],
  "classes": [{"key":"c1","subject":"國文","teacher":"陳老師","location":"A101"}, {"key":"c2","subject":"英文","teacher":"王老師","location":"B202"}],
  "weeklySchedule": {"1": ["c1","c2",null], "2": [], "3": [], "4": [], "5": []},
  "reverseWeek": false,
  "courses": [{"subject":"多媒體音樂 I","teacher":"徐蓉莉","location":"","day":1,"periods":[3,4]}],
  "countdownEvents": [{"name":"116 學測","startDate":"2027-01-22","endDate":"2027-01-24"}]
}

First, set "documentKind" to exactly one of:
- "timetable" - the file shows a weekly class schedule grid: a table with days as one axis and periods as the other, each cell showing a subject (and often a teacher/room) for a whole week.
- "registration" - the file is a course-registration confirmation, enrollment list, or similar record: a list or table where each row names one specific course a student is actually taking, generally alongside which day and period(s) it meets. It does NOT show a full weekly grid.
- "other" - neither of the above (an unrelated photo, a notice with no course rows or grid, etc).

Then extract only the fields that match the documentKind you chose, and leave every other field at its empty default (empty array, empty object, or false) rather than guessing or leaving it inconsistent with documentKind. countdownEvents is the one exception - check for it regardless of documentKind, per its own rule below.

If documentKind is "timetable", fill in bellTimes/breakTimes/classes/weeklySchedule/reverseWeek (leave courses as an empty array):
- Read class period times from the image when available. Use 24-hour "HH:MM" strings, one entry per period in order, exactly as shown (either ["08:10","09:00"] or {"start":"08:10","end":"09:00"} is acceptable). Preserve the actual times; never invent, guess, or fall back to standard/default school times. If no class times are visible anywhere, return an empty bellTimes array.
- Identify visible subjects, teachers, classrooms, breaks, and other timetable information.
- classes: one entry per distinct subject actually visible in the photo — do not invent subjects that aren't shown. "key" is your own short identifier for that entry (e.g. "c1", "c2") — it is never shown to anyone, it only links weeklySchedule slots back to this entry, so make each one unique. "subject" is the full Chinese subject name. Use "" for teacher/location when that information is not readable.
- Every entry in classes MUST be placed at least once in weeklySchedule, at the exact day/period position where it visually appears in the grid. A subject you cannot place at a specific day and period is not a recognized class — leave it out of classes entirely rather than adding it unassigned. Do not stop at recognizing a subject's name; always also locate the cell(s) it occupies.
- weeklySchedule: keys "1" through "5" (Monday–Friday) are REQUIRED and must all be present, even as an empty array — never omit or truncate "5" (Friday) even if it is partially cut off in the photo. Add "6" (Saturday) and/or "0" (Sunday) ONLY if the photo actually shows a column for that day; otherwise omit them entirely. Keep each day's array aligned with the detected periods (one entry per bellTimes index). Use null when a slot is genuinely empty or cannot be identified — never fill a blank or unreadable cell by copying in a class from a different day or period just because a slot exists there; every non-null entry must be a "key" that exists in classes.
- If odd/even weeks contain alternatives in the same slot (shown as two stacked subject+teacher pairs, often marked 單/雙 or "odd/even"), read each alternative's subject and its own teacher as two separate pieces of text first, then combine same-role pieces with "/" — all subjects joined into one "/"-separated subject string, all teachers joined the same way into one "/"-separated teacher string, both in the same left-to-right order, as one shared classes entry for that slot. Never fold a teacher's name into the subject string, or vice versa: subject must end up containing only subject names, teacher only teacher names.
- Set reverseWeek to true only when the photo clearly indicates a reversed odd/even week orientation; otherwise false.
- Add breakTimes only for explicitly shown non-class periods such as lunch or cleaning — not empty/free periods.

If documentKind is "registration", fill in courses (leave bellTimes/breakTimes/classes/weeklySchedule empty, reverseWeek false):
- This kind of file's day/period information may be written out plainly, or packed together compactly — one shorthand seen often enough to call out explicitly: a single day character immediately followed by a run of digits with no separator, where each individual digit is its own period number (so a two-digit run like "34" means periods 3 AND 4, both occupied by that one row, never "period 34" or a "3 through 4" range). Whatever notation this file actually uses, decode it using the day-naming and period-numbering it establishes itself.
- courses: one entry per distinct course row actually shown — do not invent rows. "day" is an integer: 1 for Monday through 5 for Friday, 6 for Saturday, 0 for Sunday. "periods" is every period number that row's course occupies, as a plain array of integers in ascending order (e.g. a row spanning two consecutive periods is periods:[3,4], never a combined number like 34 or a string). Use "" for teacher/location when not given or not legible.

Regardless of documentKind:
- Add countdownEvents only for clearly visible events/exams with a readable calendar date, formatted as "YYYY-MM-DD". Set startDate and endDate to the same date for a single-day event; use the visible first and last dates for a multi-day event/exam period. Only include dates you can actually read the day and month of; otherwise return an empty array. A file can carry a countdown/exam notice with no timetable or course-list content at all (documentKind "other") - still report it.
- Today's date is ${todayIso}. If a countdown/exam date shows a day and month but no visible year, infer the year yourself so the resulting date is the nearest upcoming date on or after today: use this year unless that month/day has already passed this year, in which case use next year instead. Never infer a year that puts the event in the past. If a year is actually visible in the photo, always use that one instead, even if it looks like it's already past.
- Do not invent information. When uncertain, prefer an empty value, empty array, or null.
- Every field in the response schema you are given must be present, even when empty.
- Keep all fields internally consistent.
- Return ONLY the raw JSON object — no markdown fences, no comments, no extra text.`;
}

// Must match src/gemini-ocr.js's AIVisionProcessor.geminiModels exactly -
// this is the actual enforcement point that stops the model name from being
// an arbitrary passthrough to Gemini's API. Ordered fastest-first there and
// mirrored here; see that file for why the order flipped.
//
// gemini-2.5-flash, which used to close out this list, is gone rather than
// demoted: confirmed live against the real API (not assumed from a
// changelog) that it now 404s for every caller - "no longer available to
// new users" - so keeping it in the fallback chain would only ever waste a
// retry.
//
// gemini-3.6-flash is gone too, for a worse reason: run against this
// feature's actual prompt+schema+multi-file request shape (not just
// pinged), it reproduced two separate real failures, not a one-off - a
// single-file request that burned through 24576 output tokens over 94
// seconds before finally coming back truncated and unusable, and a
// multi-file request that came back fast but recognized just 1 of 12
// classes. Both look like the same underlying problem: this model version
// misbehaving specifically under schema-constrained decoding. A fallback
// that can silently cost 94 seconds and still fail is worse than having no
// fallback there at all, since the retry loop below waits through the full
// thing before ever trying the next model.
//
// gemini-3.8-flash, the newest release, was tried as a replacement and
// rejected for a different reason: three attempts with backoff all came
// back 503 "high demand" - it simply isn't reliably available yet, not a
// correctness problem. Worth reconsidering once it's out of that state.
//
// That leaves two, both verified correct and reasonably fast on repeated
// single- and multi-file live runs.
const GEMINI_ALLOWED_MODELS = ['gemini-3.5-flash-lite', 'gemini-3.7-flash'];

// Gemini from Taiwan: through the relay (gemini-relay.js, pinned there) when
// bound; this Worker runs near each caller, which Gemini may refuse (Hong Kong).
const geminiFetch = (env, url, init) => (env.GEMINI_RELAY ? env.GEMINI_RELAY.fetch(`https://gemini-relay/?to=${encodeURIComponent(url)}`, init) : fetch(url, init));
function geminiUrl(model, env) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${env.GEMINI_API_KEY}`;
}
// One tiny Gemini call (a few tokens), the way Orbit Class's calls go: the
// key, the relay and the model answering (the admin panel's 系統, and /ops
// for the repo's workflow). Never the key or the URL in the answer.
async function geminiCheck(env, model = GEMINI_ALLOWED_MODELS[0]) {
  const t = Date.now();
  if (!env.GEMINI_API_KEY) return { ok: false, model, error: 'GEMINI_API_KEY not set' };
  try {
    const res = await geminiFetch(env, geminiUrl(model, env), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: 'Reply with the single word OK.' }] }], generationConfig: { maxOutputTokens: 256, thinkingConfig: buildGenerationConfig(model).thinkingConfig } }),
      signal: AbortSignal.timeout(20_000)
    });
    const j = await res.json().catch(() => null);
    const text = (j?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
    return { ok: res.ok && !!text, status: res.status, model, via: env.GEMINI_RELAY ? 'relay (Taiwan)' : 'direct', ms: Date.now() - t, reply: text.slice(0, 20), tokens: j?.usageMetadata?.totalTokenCount ?? null, error: res.ok ? undefined : String(j?.error?.message || '').slice(0, 160) };
  } catch (e) {
    return { ok: false, model, ms: Date.now() - t, error: String(e?.message || e).slice(0, 160) };
  }
}

// The exact shape src/gemini-ocr.js's normalizeAIOutput() reads back,
// handed to the model as a response schema rather than only described in
// prompt prose. Constrained decoding is the single biggest lever this proxy
// has on how long a request takes: the model can no longer spend output
// tokens on a markdown fence, a preamble, a trailing explanation or a
// differently-shaped object, so there are simply fewer tokens to generate,
// and the client's own fence-stripping/brace-hunting salvage path in
// parseResponse() stops being the normal case. It is not a substitute for
// the prompt - the prompt still says what to extract and what not to invent
// - only for the half of it that describes JSON punctuation.
//
// Deliberately loose in one place: bellTimes/breakTimes times stay plain
// strings (normalizeTime() already accepts and repairs several forms, and a
// stricter pattern would make the model drop a period it could otherwise
// half-read); weeklySchedule is a fixed set of seven arrays because a schema
// cannot express "these keys are required, the others optional".
//
// classes is an ARRAY of {key, subject, teacher, location} objects, not the
// free-form {subjectKey: [subject, teacher, location]} map an earlier
// version of this schema used. That map is impossible to describe here:
// Gemini's response_schema is the OpenAPI-3.0 subset Schema object, which -
// confirmed empirically against the real API, not just the docs - has no
// `additionalProperties`. A request that tried to schema-constrain a
// free-form map's values was rejected outright with a 400 before the model
// ever ran, for every model, every time; dropping the constraint down to a
// bare `type: 'object'` (so it was schema-legal but told the model nothing
// about what belonged inside it) made the model leave the field empty far
// more often than not - nothing about an undescribed nested object signals
// "you are still expected to fill this in". An array of fully-typed objects
// has neither problem: it is legal to describe field-by-field, and it gives
// the model exactly as much structure as the map version's prose used to.
// See src/gemini-ocr.js's normalizeAIOutput() for how "key" gets turned back
// into the app's own internal id.
const GEMINI_TIME_RANGE_SCHEMA = {
  type: 'object',
  properties: { start: { type: 'string' }, end: { type: 'string' } },
  required: ['start', 'end']
};
const GEMINI_DAY_SCHEMA = { type: 'array', items: { type: 'string', nullable: true } };
// Shared by GEMINI_RESPONSE_SCHEMA (/gemini, photo import) and
// NL_EDIT_RESPONSE_SCHEMA (/nl-edit, natural-language edits) below - both
// describe the exact same weeklySchedule/breakTimes shapes
// src/editor-backup.js's normalizeSettingsData expects, so there's one
// definition of each instead of two that could quietly drift apart. classes
// is the one exception (see NL_EDIT_CLASS_SCHEMA below) - the two endpoints
// need different `required` lists for the same fields.
const GEMINI_CLASS_PROPERTIES = {
  key: { type: 'string' },
  subject: { type: 'string' },
  teacher: { type: 'string' },
  location: { type: 'string' }
};
const GEMINI_CLASS_SCHEMA = {
  type: 'object',
  properties: GEMINI_CLASS_PROPERTIES,
  // teacher/location genuinely are optional here: a freshly scanned photo
  // legitimately may not show a room number or a name at all.
  required: ['key', 'subject']
};
// /nl-edit's own classes schema - same properties as GEMINI_CLASS_SCHEMA
// above, deliberately different `required`: unlike photo
// import, /nl-edit's prompt requires the model to echo every class it isn't
// touching back byte-for-byte from the given context, and under a schema
// where teacher/location are optional, Gemini would sometimes just omit
// them for an unmodified class instead of copying the value across -
// src/editor-nl-edit.js's applyNlEditResult then reads a missing field as
// "" and silently wipes that class's teacher/room, even though nothing
// about it was ever supposed to change. Marking all four fields required
// closes that loophole: the model has to put some value there, and with the
// unmodified value already sitting right there in context, it reliably
// copies it rather than inventing one.
const NL_EDIT_CLASS_SCHEMA = {
  type: 'object',
  properties: GEMINI_CLASS_PROPERTIES,
  required: ['key', 'subject', 'teacher', 'location']
};
const GEMINI_BREAK_TIME_SCHEMA = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    start: { type: 'string' },
    end: { type: 'string' }
  },
  required: ['name', 'start', 'end']
};
const GEMINI_WEEKLY_SCHEDULE_SCHEMA = {
  type: 'object',
  properties: {
    0: GEMINI_DAY_SCHEMA,
    1: GEMINI_DAY_SCHEMA,
    2: GEMINI_DAY_SCHEMA,
    3: GEMINI_DAY_SCHEMA,
    4: GEMINI_DAY_SCHEMA,
    5: GEMINI_DAY_SCHEMA,
    6: GEMINI_DAY_SCHEMA
  },
  required: ['1', '2', '3', '4', '5']
};
const GEMINI_COUNTDOWN_EVENTS_SCHEMA = {
  type: 'array',
  items: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      startDate: { type: 'string' },
      endDate: { type: 'string' }
    },
    required: ['name', 'startDate', 'endDate']
  }
};
// One shape covering everything buildGeminiPrompt's prompt can return, discriminated by
// "documentKind" - see that prompt's own comment for why this is one prompt
// and one schema now rather than two: which fields the model actually fills
// in depends on what it decided the file was, never on which request it
// happened to receive, so there is nothing for a separate schema-per-kind to
// buy here. src/gemini-ocr.js's parseResponse reads documentKind back to
// decide which normalizer applies to the rest of the object.
const GEMINI_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    documentKind: { type: 'string', enum: ['timetable', 'registration', 'other'] },
    bellTimes: { type: 'array', items: GEMINI_TIME_RANGE_SCHEMA },
    breakTimes: { type: 'array', items: GEMINI_BREAK_TIME_SCHEMA },
    classes: { type: 'array', items: GEMINI_CLASS_SCHEMA },
    weeklySchedule: GEMINI_WEEKLY_SCHEDULE_SCHEMA,
    reverseWeek: { type: 'boolean' },
    // "day"/"periods" as plain integers (not the source document's own
    // notation) is what lets src/gemini-ocr.js's
    // mergeRegistrationIntoCandidate match a course straight onto
    // weeklySchedule's day keys and bellTimes indices without parsing
    // anything itself.
    courses: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          subject: { type: 'string' },
          teacher: { type: 'string' },
          location: { type: 'string' },
          day: { type: 'integer' },
          periods: { type: 'array', items: { type: 'integer' } }
        },
        required: ['subject', 'day', 'periods']
      }
    },
    countdownEvents: GEMINI_COUNTDOWN_EVENTS_SCHEMA
  },
  required: ['documentKind', 'bellTimes', 'classes', 'weeklySchedule', 'courses', 'countdownEvents']
};

// Same reasoning as AIVisionProcessor.buildGenerationConfig() (which this
// replaces client-side) - plain structured extraction gets no benefit from
// the models' default "thinking" pass, and different model families expose
// that knob differently.
//
// maxOutputTokens is 24576, not the 8192 an earlier version of this used -
// found by running this exact prompt+schema+model list against the real
// API with a synthetic two-file request: gemini-3.6-flash hit the 8192 cap
// under schema-constrained decoding (finishReason MAX_TOKENS), burned the
// full 31 seconds doing it, and handed back JSON truncated mid-string -
// silently unusable, and the single slowest, worst failure mode this whole
// feature can produce. The same request finished in 4 seconds using well
// under 1000 tokens once the cap was raised - the model was not trying to
// say more, it just needed headroom to reach the end without being cut off
// partway through a still-valid generation. A higher ceiling costs nothing
// when it isn't needed (it bounds worst case, it doesn't change target
// length), so it stays generous for every model and file count.
// temperature is 0, not the 0.1 an earlier version of this used - this is a
// read-what's-there extraction task with a schema-constrained output, never
// a creative one, so there is nothing for sampling randomness to buy: it
// only means the same two files can come back with a different merge result
// (e.g. which slots got a placeholder replaced) between otherwise-identical
// attempts, which is exactly the "inconsistent" failure mode this feature
// most needs to avoid.
function buildGenerationConfig(model, schema) {
  return {
    response_mime_type: 'application/json',
    response_schema: schema,
    temperature: 0,
    maxOutputTokens: 24576,
    thinkingConfig: /^gemini-2\./.test(model) ? { thinkingBudget: 0 } : { thinkingLevel: 'low' }
  };
}

// The shared upstream call for /gemini and /nl-edit. The response is piped
// straight through rather than parsed and re-serialized here: the body is
// JSON the client parses itself either way, and buffering the whole thing
// in the Worker first only adds the upstream's full download time to every
// request before a single byte reaches the browser.
// (timeoutMs: given up on after that long; Orbit Law's asks, a few seconds' work.)
async function proxyGeminiRequest(model, parts, schema, env, headers, ctx, feature, timeoutMs) {
  try {
    const upstream = await geminiFetch(env, geminiUrl(model, env), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: buildGenerationConfig(model, schema)
      }),
      signal: timeoutMs ? AbortSignal.timeout(timeoutMs) : undefined
    });
    let body = upstream.body;
    if (upstream.ok && body && ctx) {
      const [toClient, toLog] = body.tee();
      body = toClient;
      ctx.waitUntil(logGeminiUsage(toLog, feature, model, env, ctx));
    }
    return new Response(body, {
      status: upstream.status,
      headers: { ...headers, 'Content-Type': 'application/json' }
    });
  } catch (error) {
    return upstreamFailed(error, headers);
  }
}

// One log line per billed Gemini call, with the token counts Gemini itself
// reports (usageMetadata) - how many were read from the implicit cache and
// how many went to thinking are exactly the numbers needed to judge further
// cost tuning. Read off a tee of the upstream body after the client's copy
// is already streaming (see proxyGeminiRequest), so it adds no latency; see
// it with `wrangler tail` or the Cloudflare dashboard's Workers logs. Only
// counts are logged - never the prompt, the schedule, or the reply text.
async function logGeminiUsage(stream, feature, model, env = null, ctx = null) {
  try {
    const usage = JSON.parse(await new Response(stream).text()).usageMetadata || {};
    // Counted too (the admin panel's Google 帳單): by Taiwan's day and the
    // model, tokens read (less those from the cache), from the cache, and
    // written (thinking is billed as output).
    if (env) {
      const day = new Date(Date.now() + 8 * 3_600_000).toISOString().slice(0, 10);
      const cached = usage.cachedContentTokenCount ?? 0;
      const counts = { in: Math.max(0, (usage.promptTokenCount ?? 0) - cached), cached, out: (usage.candidatesTokenCount ?? 0) + (usage.thoughtsTokenCount ?? 0) };
      for (const [k, n] of Object.entries(counts)) if (n) await tally(env, `gem:${model}:${k}:${day}`, n, Date.now(), ctx);
    }
    console.log(
      JSON.stringify({
        event: 'gemini_usage',
        feature,
        model,
        prompt: usage.promptTokenCount ?? 0,
        cached: usage.cachedContentTokenCount ?? 0,
        thoughts: usage.thoughtsTokenCount ?? 0,
        output: usage.candidatesTokenCount ?? 0,
        total: usage.totalTokenCount ?? 0
      })
    );
  } catch {
    // Logging must never affect the request it describes.
  }
}

// What a single submitted file may be. Images and PDFs are the two things
// Gemini actually *looks at* rather than flattening to text (see its
// document-understanding docs), and between them they cover every way a
// student realistically has a timetable on their phone: a photo, a
// screenshot, an iPhone HEIC straight out of the camera roll, or the PDF
// the school published. Anything else is refused here rather than being
// forwarded and billed for.
const GEMINI_ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'application/pdf'
];
// A downscaled JPEG (see src/gemini-ocr.js's encodeCanvasAsJpeg) is
// realistically a few hundred KB base64-encoded; this caps well above that
// so a legitimate photo - or a pass-through PDF the browser could not
// re-encode - is never rejected, while still bounding how much upstream
// bandwidth/tokens one request can burn.
const MAX_FILE_BASE64_LENGTH = 10_000_000;
// Gemini's own inline-data ceiling for a whole request is 20MB; this stays
// under it with room for the prompt, and is what stops "send several files
// at once" from turning into an unbounded upload.
const MAX_TOTAL_BASE64_LENGTH = 18_000_000;
const MAX_FILES_PER_REQUEST = 6;

// One legitimate user action (one photo import, one NL-edit submission) can
// now cost up to 3 real requests against this same counter when it hits a
// location block - the initial attempt plus the 2 location-block retries in
// src/gemini-ocr.js/editor-nl-edit.js - so this stays roughly 3x what a
// "one request per action" budget would be, rather than leaving a run of
// bad luck (or a couple of manual retries on top of it) burn through a
// tighter limit for reasons that have nothing to do with actual abuse.
const GEMINI_RATE_LIMIT = 30;
// See isDailyGlobalCapped's own comment - a hard ceiling on TOTAL real
// Gemini calls across every caller combined, independent of source IP.
const GEMINI_DAILY_GLOBAL_CAP = 300;

// Reads the `files: [{mime_type, data}, ...]` body. Returns a plain error
// string rather than throwing - every failure here is a 400 with that
// message.
function readGeminiFiles(body) {
  const files = Array.isArray(body?.files) ? body.files : null;
  if (!files || !files.length) return { error: 'Missing or invalid files' };
  if (files.length > MAX_FILES_PER_REQUEST) {
    return { error: `At most ${MAX_FILES_PER_REQUEST} files per request` };
  }
  let total = 0;
  for (const file of files) {
    if (
      !file ||
      typeof file.mime_type !== 'string' ||
      !GEMINI_ALLOWED_MIME_TYPES.includes(file.mime_type) ||
      typeof file.data !== 'string' ||
      !file.data ||
      file.data.length > MAX_FILE_BASE64_LENGTH
    ) {
      return { error: 'Missing or invalid files' };
    }
    total += file.data.length;
  }
  if (total > MAX_TOTAL_BASE64_LENGTH) return { error: 'Submitted files are too large' };
  return { files };
}

async function handleGeminiRequest(request, env, headers, ip, ctx, session = null) {
  // A warm-up ping, sent the moment the user opens the file picker (see
  // src/gemini-ocr.js's warmUpGeminiProxy) - long before there's anything
  // to actually send. It exists purely to pay the connection's setup cost
  // (DNS, TLS, and this Worker's own first-request initialization) while
  // the user is still choosing a file, instead of on the critical path
  // afterwards. Deliberately does no work, calls nothing upstream, and is
  // not rate-limited: it must stay far cheaper than the request it is
  // warming the path for, or it would be a worse denial-of-service target
  // than the real endpoint.
  if (request.method === 'GET') return json({ ok: true }, 200, headers);
  if (request.method !== 'POST') return errorJson('POST_ONLY', 405, headers, request);

  // Signed in with a Quadra Pass (required): counted per session in memory.
  if (!session) return errorJson('ECO_TOKEN_INVALID', 401, headers, request);
  if (sessionLimited(`g:${session.s}`, GEMINI_RATE_LIMIT, 3_600_000)) return errorJson('RATE_LIMITED', 429, headers, request);
  if (await isDailyGlobalCapped(env, 'gemini', GEMINI_DAILY_GLOBAL_CAP)) {
    return errorJson('DAILY_QUOTA_EXCEEDED', 429, headers, request);
  }

  const body = await readJsonBody(request, MAX_TOTAL_BASE64_LENGTH + 1_000_000);
  if (body === INVALID_BODY) return errorJson('INVALID_JSON', 400, headers, request);
  const { model } = body || {};
  if (!GEMINI_ALLOWED_MODELS.includes(model)) {
    return errorJson('UNSUPPORTED_MODEL', 400, headers, request);
  }
  const parsedFiles = readGeminiFiles(body);
  if (parsedFiles.error) {
    return json({ error: { code: 'FILE_PARSE_ERROR', message: parsedFiles.error } }, 400, headers);
  }
  if (!env.GEMINI_API_KEY) {
    return errorJson('MISSING_API_KEY', 500, headers, request);
  }

  // Every submitted file goes into one part list, in the order the user
  // picked them. In practice src/gemini-ocr.js now sends exactly one file
  // per request (each classified and extracted independently - see
  // recognizeAndMerge for why), but this stays capable of taking several -
  // e.g. two photos of one physical page split across the frame. The prompt
  // leads, so the instructions are in context before the first file rather
  // than after the last.
  const parts = [
    { text: buildGeminiPrompt(todayIsoInTaipei()) },
    ...parsedFiles.files.map(file => ({
      inline_data: { mime_type: file.mime_type, data: file.data }
    }))
  ];
  return proxyGeminiRequest(model, parts, GEMINI_RESPONSE_SCHEMA, env, headers, ctx, 'gemini');
}

// ==== /nl-edit - natural-language schedule edits ============================
//
// Same discipline as /gemini above: the client (src/editor-nl-edit.js) only
// ever sends {model, text, context} - a short instruction plus a small,
// already-typed snapshot of the caller's own current schedule. This Worker
// owns the actual prompt and response_schema, so the deployed proxy URL
// (public in the client bundle either way, same reasoning as /gemini) can
// only ever be used to run this one fixed "turn this instruction into one
// schedule edit" request, never an arbitrary free-form prompt.
//
// Reuses GEMINI_API_KEY and GEMINI_ALLOWED_MODELS rather than needing its
// own secret or its own model list - it's the same underlying Gemini access,
// just a different fixed prompt/schema pair.

// Deliberately tight: a real instruction ("把我週二第三節改成物理") is a
// handful of words. Anything dramatically longer than that is not a
// schedule-edit instruction this feature is meant to serve - refusing it
// here keeps a misuse attempt cheap to reject instead of costing a Gemini
// call.
const MAX_NL_EDIT_TEXT_LENGTH = 200;
// The context now includes everything editable via this feature - see
// buildNlEditContext in src/editor-nl-edit.js and NL_EDIT_RESPONSE_SCHEMA's
// own comment on why. Still just one school's own data (a few KB of JSON at
// most); this stays generous above that while still refusing something
// that's clearly not this shape (a client bug, or a request built by hand
// that skipped the real client entirely) before it ever reaches Gemini.
const MAX_NL_EDIT_CONTEXT_LENGTH = 40000;
// See GEMINI_RATE_LIMIT's own comment - same reasoning, same 3x headroom for
// the location-block retry's own worst case.
const NL_EDIT_RATE_LIMIT = 30;
const NL_EDIT_DAILY_GLOBAL_CAP = 300;

// /nl-edit's own schedule-cell edit shape: one (day, period, key) triple -
// see NL_EDIT_RESPONSE_SCHEMA's own comment for why the response describes
// only the cells that actually change rather than every day's full array.
const NL_EDIT_SCHEDULE_EDIT_SCHEMA = {
  type: 'object',
  properties: {
    day: { type: 'integer' },
    period: { type: 'integer' },
    key: { type: 'string' }
  },
  required: ['day', 'period', 'key']
};

// Sparse patch, not full-state: an earlier revision of this schema had the
// model echo back the COMPLETE new value of every editable field - classes,
// weeklySchedule day-by-day, bellTimes, breakTimes, countdownEvents -
// including everything the instruction never asked to touch, copied back
// verbatim (see git history for that version, and its own comment on why it
// replaced an even earlier fixed-verb design). That put "reproduce a few
// dozen unrelated classes/schedule cells/times byte-for-byte, every single
// request" on the model's plate as real work in its own right, on top of
// actually figuring out the edit - and an LLM asked to copy a wall of JSON
// it has no reason to even be touching is exactly the kind of task where it
// occasionally drops or mis-types something, showing up as an unrelated,
// unexplained change in the diff the user is asked to confirm. The fix
// isn't a stricter prompt asking it to copy more carefully - it's not
// asking it to copy that data at all: classUpserts/deletedClassKeys/
// scheduleEdits below only ever contain the classes and schedule cells
// actually being added, changed, or removed; everything else is taken
// straight from the client's own current data (see
// src/editor-nl-edit.js's applyNlEditResult), never retyped by the model,
// so it is structurally impossible for an untouched class or cell to come
// back different. bellTimes/breakTimes/countdownEvents/reverseWeek stay
// whole-value fields (see their own *Changed booleans below) rather than
// getting the same sparse treatment - each is one short list/value already
// sitting fully in view (a handful of periods/breaks/events at most), not
// a few dozen scattered entries, so sparse-patching them would only add
// complexity without meaningfully lowering the same copy risk; the
// *Changed flag still means an untouched one is never even asked for.
// classUpserts reuses NL_EDIT_CLASS_SCHEMA (see that schema's own comment)
// - the other shapes mirror GEMINI_BREAK_TIME_SCHEMA/
// GEMINI_COUNTDOWN_EVENTS_SCHEMA above, both of which ultimately have to
// produce something src/editor-backup.js's normalizeSettingsData accepts,
// so there is one definition of each shape, not two that could drift
// apart. That function is also the real safety net on the client side once
// a patch comes back and gets applied on top of the current data - same as
// it already is for AI photo import and manual backup import - so this
// Worker still never has to parse or judge the content itself, only
// shape-check what's about to be embedded in the prompt (see
// readNlEditContext below).
const NL_EDIT_RESPONSE_SCHEMA = {
  type: 'object',
  properties: {
    status: { type: 'string', enum: ['ok', 'unclear', 'not_found'] },
    reason: { type: 'string' },
    classUpserts: { type: 'array', items: NL_EDIT_CLASS_SCHEMA },
    deletedClassKeys: { type: 'array', items: { type: 'string' } },
    scheduleEdits: { type: 'array', items: NL_EDIT_SCHEDULE_EDIT_SCHEMA },
    bellTimesChanged: { type: 'boolean' },
    bellTimes: { type: 'array', items: { type: 'array', items: { type: 'string' } } },
    breakTimesChanged: { type: 'boolean' },
    breakTimes: { type: 'array', items: GEMINI_BREAK_TIME_SCHEMA },
    countdownEventsChanged: { type: 'boolean' },
    countdownEvents: GEMINI_COUNTDOWN_EVENTS_SCHEMA,
    reverseWeekChanged: { type: 'boolean' },
    reverseWeek: { type: 'boolean' }
  },
  required: [
    'status',
    'reason',
    'classUpserts',
    'deletedClassKeys',
    'scheduleEdits',
    'bellTimesChanged',
    'bellTimes',
    'breakTimesChanged',
    'breakTimes',
    'countdownEventsChanged',
    'countdownEvents',
    'reverseWeekChanged',
    'reverseWeek'
  ]
};

// The fixed, server-owned prompt - the client never sends prompt text of
// its own (see the top-of-section comment). `context` is embedded directly
// rather than sent as a separate structured turn: a single-turn
// generateContent call has nowhere else to put it, and it's already small
// (see MAX_NL_EDIT_CONTEXT_LENGTH). Both go at the very END, after every
// fixed rule: Gemini's implicit caching discounts a request whose opening
// text matches a recent one, so keeping the ~3k-token fixed part as an
// identical prefix lets it be billed at the cached rate, instead of the
// per-user context splitting it in two.
function buildNlEditPrompt(text, context) {
  return `You read a Traditional Chinese natural-language instruction about a weekly class schedule and return ONLY a sparse patch describing the classes/schedule cells/settings that actually change - never the whole schedule, never anything the instruction didn't ask about. Return a single JSON object matching this exact schema:
{
  "status": "ok",
  "reason": "",
  "classUpserts": [{"key": "A", "subject": "物理", "teacher": "", "location": ""}],
  "deletedClassKeys": [],
  "scheduleEdits": [{"day": 1, "period": 2, "key": "A"}],
  "bellTimesChanged": false,
  "bellTimes": [],
  "breakTimesChanged": false,
  "breakTimes": [],
  "countdownEventsChanged": false,
  "countdownEvents": [],
  "reverseWeekChanged": false,
  "reverseWeek": false
}

THE SINGLE MOST IMPORTANT RULE: this is a PATCH, not a copy of the schedule. List a class in "classUpserts" only if you are adding it or changing one of its fields; list a key in "deletedClassKeys" only if the instruction removes that class entirely; list an entry in "scheduleEdits" only for a (day, period) cell whose class actually changes. Never include a class, cell, break time, or countdown event just because it already exists - every one the instruction doesn't touch must be left out of the result entirely, never repeated back. This is also why "bellTimesChanged"/"breakTimesChanged"/"countdownEventsChanged"/"reverseWeekChanged" exist: leave the flag false (and its matching field empty/false) whenever the instruction doesn't touch that field at all; set the flag true, and only then fill in the field, when it does. The result is shown to the user as a diff against the current data before anything is saved, so anything you include here that the instruction didn't actually ask for shows up as a confusing, unwanted line in that diff.

Field shapes and meaning:
- "classUpserts": one entry per class being added or changed, as {key, subject, teacher, location} - all four fields are required on every entry you DO include (adding or changing a class replaces that whole entry, so if only the teacher changes, still repeat that same class's existing subject/location unchanged inside this one entry - never touch any other class just to do that). "key" is an internal id, not shown to the user - reuse a class's EXISTING key (from the context below) whenever you're changing that same course, even if you rename its subject/teacher/location, so "scheduleEdits" references to it stay valid. For a genuinely NEW course, invent a short new key not already used by any class in the context (e.g. "new1", "new2", ...); leave teacher/location as "" if the instruction didn't specify them. Defining a new course is a complete, valid request entirely on its own even when the instruction never says where to schedule it (e.g. "新增一個課程叫社團活動", "幫我建一個王老師教的數學課" with no day/period mentioned) - in that case just add it to "classUpserts" with a new key and leave "scheduleEdits" empty; never invent a day/period for it just because a course needs one eventually - the user places it into a slot themselves afterward.
- "deletedClassKeys": keys (from the context below) of classes the instruction removes entirely. Also add a "scheduleEdits" entry with "key": "" for every cell in the context that still references a deleted key, so nothing is left pointing at a class that no longer exists.
- "scheduleEdits": one entry per (day, period) cell whose class actually changes, as {day, period, key} - "key": "" clears that period (makes it free that day). Only list a cell here if the class it should now hold is different from what the context below already shows there. Moving a class is two entries (clear its old cell, set its new one); swapping two classes is two entries (each cell gets the other's key).
- "bellTimes"/"breakTimes"/"countdownEvents"/"reverseWeek": each has a matching *Changed boolean (see above). When the instruction adds, removes, or edits ANY period/break/event/the odd-even split, set that one flag true and give the COMPLETE new value of that whole field, in order (not a partial patch within it) - e.g. adding one bell period still means the complete "bellTimes" array including the new one; adding one break time still means the complete "breakTimes" array including the new one, and so on. "bellTimes" is the list of [start, end] 24-hour time strings ("HH:MM"), one per period, in the same order "scheduleEdits"' period numbers use. Adding a period means appending a new [start, end] pair; removing or reordering a period shifts every later period's index - when that happens, also add "scheduleEdits" entries for whatever classes sat in those later periods, moving each to its new index (and clearing its old one), so nothing silently ends up in the wrong period. "breakTimes" is named special/break times (e.g. 午休, 打掃時間, 就寢時間) as {name, start, end} - independent of "bellTimes"/the schedule, not tied to any period index. "countdownEvents" is named date-range events (e.g. 段考, 校慶) as {name, startDate, endDate} ("YYYY-MM-DD" each, the same day for a single-day event).

單雙週分堂課 (odd/even-week split classes): ONE class entry can alternate between two different subject/teacher pairs depending on whether the real-world week is 單週 (odd) or 雙週 (even) - this is a single "classUpserts" entry (never two, and never two "scheduleEdits" cells) whose "subject" and/or "teacher" string is written as "單週內容/雙週內容", the two halves joined by a "/" (a full-width "／" means the same thing - normalize it to "/"). Example: {"subject": "國文/公民", "teacher": "李老師/陳老師"} is one slot that shows 國文 taught by 李老師 on 單週 weeks and 公民 taught by 陳老師 on 雙週 weeks; "location" is never split this way, it's the same room either week. Recognizing, creating, and editing these:
  - An existing class already has this split if its subject or teacher (in the context below) contains "/". The part before "/" is what shows on 單週, the part after is 雙週.
  - To turn an existing single-subject class into a split one (e.g. "週三第二節國文，改成單週上國文、雙週上公民" or "幫我把這堂課弄成單雙週，雙週改成地理" where only one side is named and the other should stay what it already was), add ONE "classUpserts" entry reusing that class's existing key, joining the 單週 content and 雙週 content with "/" in whichever of subject/teacher actually alternates - leave the other field its existing plain unsplit value if it doesn't alternate (e.g. same teacher both weeks).
  - To create a brand-new split class from scratch (e.g. "新增一節課，單週英文王老師、雙週美術林老師"), it works exactly like creating any new course (see "classUpserts" above), just with "/"-joined subject/teacher instead of plain ones.
  - To edit only one side of an already-split class (e.g. "雙週那半改成地理" or "單週的公民老師換成陳老師"), the "classUpserts" entry's untouched side must repeat that side's text exactly as it already was in context, only the named side actually changes - this is still "only change what's asked", just scoped to half of one field inside one entry rather than the whole field.
  - To un-split one back into a single subject/teacher for every week (e.g. "OO老師的課取消單雙週，都固定上物理"), the "classUpserts" entry replaces the whole "/"-joined string with the one value that now applies always.

Day numbering: 0 = 週日, 1 = 週一, 2 = 週二, 3 = 週三, 4 = 週四, 5 = 週五, 6 = 週六 (matches JavaScript's Date.getDay(), the same numbering the context's own weeklySchedule keys use).
Period numbering: 0-based, matching the index into a weeklySchedule day array and into bellTimes (period 0 is 第一節, period 1 is 第二節, and so on).
Numbers may be Chinese or Arabic, and several periods may be packed together ("二三節", "2、3節", "二到四節" all mean more than one period); always pick the reading where every day/period actually exists in the context.

Read the instruction the way a colleague would, not a compiler: it may be indirect, colloquial, or point at its target through context instead of naming it outright - e.g. "把國文課挪到早自習後面" means move it to whichever period immediately follows whatever's named/labeled 早自習 in the given context; "這兩堂對調" without the word "交換" still means swap them; "把雙週那半改掉" implicitly means the class in question already has a 單/雙週 split (see above) and only that half changes. Work out the concrete edit a reasonable teacher would mean from the wording and the context you were given, rather than requiring the instruction to spell out mechanics literally. This reasoning is about READING the instruction, not about inventing content: still never invent a day, period, subject, teacher, location, time, or event that neither the instruction nor the given context actually supports.

Decide "status":
- "ok": the instruction maps cleanly onto a change (or several - see below) to the data below, using only days/periods/classes/times that make sense given the context (and, for a multi-part instruction, given the effect of any earlier part already applied - e.g. moving a class out of a slot and then putting a different class into that now-empty slot is a perfectly ordinary two-part instruction, not a conflict). Fill in only whichever of "classUpserts"/"deletedClassKeys"/"scheduleEdits"/the four *Changed fields the patch actually needs - leave every other field/flag empty/false.
- "unclear": after actually reasoning through the wording and context as above, the instruction (or any part of it, if it describes several changes) still has multiple equally plausible readings with nothing to prefer one over another, is contradictory, or does not describe an edit to this data at all. This is not the same as "phrased indirectly" - reserve "unclear" for genuine ambiguity, not for instructions that merely require a little inference to resolve. Leave every field/flag empty/false (i.e. no actual change). Briefly explain why in "reason" (Traditional Chinese, one short sentence).
- "not_found": the instruction is clear about what it wants, but names a day, period, class, break time, or countdown event that does not exist in the given context at the point it's referenced. Leave every field/flag empty/false. Briefly explain in "reason" (Traditional Chinese, one short sentence).

A single instruction may describe more than one distinct change (e.g. joined by "而且"/"然後"/"，"/"、", or a numbered/bulleted list) - apply all of them together in the one result you return (e.g. several "scheduleEdits" entries, or a "classUpserts" entry alongside a "scheduleEdits" entry), same as if each had been requested separately in order. If any one part is ambiguous or refers to something that doesn't exist, treat the WHOLE instruction as "unclear"/"not_found" rather than silently applying only the parts that made sense.

Return ONLY the raw JSON object — no markdown fences, no comments, no extra text.

The current data, given as read-only context so you know what already exists and can decide what to change - do NOT copy any of it back into your result, only refer to it by key/day/period:
${JSON.stringify(context)}

The instruction to translate: "${text}"`;
}

// Structural shape check only (mirrors readGeminiFiles' own level of
// strictness) - src/editor-nl-edit.js's validateNlEditResult()/
// applyNlEditResult() are what actually re-check and normalize the
// *response* once Gemini answers; this just makes sure what's about to be
// embedded in the prompt is the shape the prompt claims it is.
function readNlEditContext(context) {
  if (!context || typeof context !== 'object') return null;
  const { weeklySchedule, classes, bellTimes, breakTimes, countdownEvents, reverseWeek } = context;
  if (!weeklySchedule || typeof weeklySchedule !== 'object' || Array.isArray(weeklySchedule))
    return null;
  if (!Array.isArray(classes) || !Array.isArray(bellTimes)) return null;
  if (!Array.isArray(breakTimes) || !Array.isArray(countdownEvents)) return null;
  if (typeof reverseWeek !== 'boolean') return null;
  if (Object.values(weeklySchedule).some(day => !Array.isArray(day))) return null;
  if (
    classes.some(
      entry => !entry || typeof entry !== 'object' || typeof entry.key !== 'string' || typeof entry.subject !== 'string'
    )
  )
    return null;
  if (
    bellTimes.some(
      item => !Array.isArray(item) || item.length !== 2 || typeof item[0] !== 'string' || typeof item[1] !== 'string'
    )
  )
    return null;
  if (breakTimes.some(entry => !entry || typeof entry !== 'object')) return null;
  if (countdownEvents.some(entry => !entry || typeof entry !== 'object')) return null;
  return { weeklySchedule, classes, bellTimes, breakTimes, countdownEvents, reverseWeek };
}

async function handleNlEditRequest(request, env, headers, ip, ctx, session = null) {
  if (request.method !== 'POST') return errorJson('POST_ONLY', 405, headers, request);

  if (!session) return errorJson('ECO_TOKEN_INVALID', 401, headers, request);
  if (sessionLimited(`n:${session.s}`, NL_EDIT_RATE_LIMIT, 3_600_000)) return errorJson('RATE_LIMITED', 429, headers, request);
  if (await isDailyGlobalCapped(env, 'nl-edit', NL_EDIT_DAILY_GLOBAL_CAP)) {
    return errorJson('DAILY_QUOTA_EXCEEDED', 429, headers, request);
  }

  const body = await readJsonBody(request);
  if (body === INVALID_BODY) return errorJson('INVALID_JSON', 400, headers, request);
  const { model } = body || {};
  if (!GEMINI_ALLOWED_MODELS.includes(model)) {
    return errorJson('UNSUPPORTED_MODEL', 400, headers, request);
  }
  const text = typeof body?.text === 'string' ? body.text.trim() : '';
  if (!text || text.length > MAX_NL_EDIT_TEXT_LENGTH) {
    return errorJson('MISSING_TEXT', 400, headers, request);
  }
  const context = readNlEditContext(body?.context);
  if (!context) return errorJson('MISSING_CONTEXT', 400, headers, request);
  if (JSON.stringify(context).length > MAX_NL_EDIT_CONTEXT_LENGTH) {
    return errorJson('CONTEXT_TOO_LARGE', 400, headers, request);
  }
  if (!env.GEMINI_API_KEY) {
    return errorJson('MISSING_API_KEY', 500, headers, request);
  }

  return proxyGeminiRequest(
    model,
    [{ text: buildNlEditPrompt(text, context) }],
    NL_EDIT_RESPONSE_SCHEMA,
    env,
    headers,
    ctx,
    'nl-edit'
  );
}

// ==== The Quadra Pass's store: D1 (doc-store.js) =============================
//
// Every document has one string field, `payload`; only this Worker reads or
// writes it.

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
// A random code (passes, session ids, keys): never 0, 1, O or I.
function generateCode(length) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, byte => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}

// Codes are random (never chosen by a person), so a plain SHA-256 is enough:
// a leak of the database never hands over a working pass.
async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('');
}

// ---- /eco: the Quadra Pass (see eco.js) ------------------------------------
// The Pass's store (doc-store.js): D1.
const DOCS = docStore();
const ECO_DEPS = {
  json,
  errorJson,
  upstreamFailed,
  readJsonBody,
  INVALID_BODY,
  rateLimitResponse,
  fsGet: DOCS.get,
  fsWrite: DOCS.write,
  fsDelete: DOCS.delete,
  fsList: DOCS.list,
  fsCollections: DOCS.collections,
  fsBatch: DOCS.batch,
  sha256Hex,
  generateCode,
  now: () => Date.now(),
  // The admin panel's 系統 (ops.js): the store's collections, a Gemini check, a builder by hand.
  count: DOCS.count,
  geminiCheck: env => geminiCheck(env),
  build: (env, job) => runBuilders(env, { proxy: builderProxy(env), now: Date.now(), ...(job === 'watch-full' ? { job: 'watch', full: true } : ['watch', 'cutouts', 'buses'].includes(job) ? { job } : { only: job }), log: () => {} }),
  // Securities' money counted here (stock-check.js), its market data read as the apps read it.
  checkStock: (env, docId, payload, wallet) => checkStock(env, docId, payload, wallet, { read: url => priceReads(env).read(url), fsGet: DOCS.get, fsWrite: DOCS.write }, LOCK_SINCE),
  // A pass merged into another: what this Worker watches for it moves too.
  moveRecords: async (env, from, to, now) => {
    const deps = { fsGet: DOCS.get, fsWrite: DOCS.write, fsDelete: DOCS.delete, fsList: DOCS.list, now: () => Date.now() };
    await moveSlips(env, deps, from, to);
    await moveTickets(env, deps, from, to);
    await moveBook(env, deps, from, to, now);
  }
};

// /kambi (kambi.js): the same plumbing, and Kambi's live data.
const KAMBI_DEPS = { ...ECO_DEPS, fsList: DOCS.list, fetchLive: fetchKambiLive };

// /play (settle.js): the sources read directly (the Asian leagues' months
// and F1's archive in this Worker, as the sports proxy serves them), and the
// notice through push.js.
async function readSource(url) {
  try {
    const u = new URL(url);
    const res = u.hostname === ASIA_HOST ? await asiaBaseballResponse(u) : u.hostname === F1_LIVE_HOST ? (u.pathname === '/session.json' ? await f1LiveResponse(u) : null) : await fetch(url, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(8000) });
    return res?.ok ? await res.json() : null;
  } catch {
    return null;
  }
}
// A placed slip's prices are read as Play reads them: through the sports
// proxy (its cache and trims; this Worker's own route, with a short session
// of its own), the season packs from R2 (/data/).
// (One short session of this Worker's own per app it reads for.)
const workerTokens = new Map();
async function sportsToken(env, app = 'odds') {
  const had = workerTokens.get(app);
  if (had && had.until > Date.now() + 60_000) return had.value;
  const until = Date.now() + 10 * 60_000;
  const value = await signToken(await tokenSecret(env), { k: 'ses', s: `worker:${app}`, a: app, d: 'worker', g: 0, e: until });
  workerTokens.set(app, { value, until });
  return value;
}
// (The sports proxy is this Worker's own route: called in place, its cache
// writes kept within this call.)
const inPlace = { waitUntil: p => p?.catch?.(() => {}), passThroughOnException() {} };
// (`within`: every read on a copy at most that many seconds old; a live bet's second look.)
const priceReads = (env, within) => ({
  read: async (url, trim = '') => {
    const ask = `https://orbit-workers-proxy.quadra/sports-proxy?url=${encodeURIComponent(url)}&app=odds${trim ? `&trim=${encodeURIComponent(trim)}` : ''}${within != null ? `&within=${within}` : ''}&qt=${encodeURIComponent(await sportsToken(env))}`;
    const res = await handleSports(new Request(ask), env, inPlace, {}, 'worker');
    if (!res.ok) throw new Error(`proxy ${res.status}`);
    return res.json();
  },
  // The family's data, read in place (data.js: R2, else Pages while moving).
  pack: async path => {
    const res = await handleData(new Request(`https://orbit-workers-proxy.quadra/data/${path}`), env, inPlace, {}, 'worker', `/data/${path}`);
    if (!res.ok) throw new Error(`pack ${res.status}`);
    return res.json();
  }
});
// Securities' quotes read as the phone reads them: the data proxy's route in place (its cache).
const stockReads = env => async url => {
  const ask = `https://orbit-workers-proxy.quadra/sports-proxy?url=${encodeURIComponent(url)}&app=stock&qt=${encodeURIComponent(await sportsToken(env, 'stock'))}`;
  const res = await handleSports(new Request(ask), env, inPlace, {}, 'worker');
  if (!res.ok) throw new Error(`proxy ${res.status}`);
  return res.json();
};
// The builders' reads through the data proxy's route, as Orbit Sports' (its trims, its cache).
const builderProxy = env => async (url, trim = '') => {
  const ask = `https://orbit-workers-proxy.quadra/sports-proxy?url=${encodeURIComponent(url)}&app=match${trim ? `&trim=${encodeURIComponent(trim)}` : ''}&qt=${encodeURIComponent(await sportsToken(env, 'match'))}`;
  const res = await handleSports(new Request(ask), env, inPlace, {}, 'worker');
  return res.ok ? res.json() : null;
};
const playDeps = env => ({ ...ECO_DEPS, read: readSource, prices: priceReads(env), livePrices: priceReads(env, 2), notify: (account, make) => notifyNow(env, account, 'odds', 'slip', make) });

// ==== Routing ================================================================

// wrangler.toml's second cron.
const SETTLE_CRON = '1-59/2 * * * *';
// F1's lap log each minute Thursday to Monday (UTC), on both crons; the
// family's data built on the even minutes its jobs have (builders/run.js SLOTS); the
// bill's guard woken every ten minutes. (Crons of their own were registered
// on 2026-10-13 and never run.)
const F1_DAYS = new Set([0, 1, 4, 5, 6]);


// The developer settings as GET /config answers them: kept a minute in
// Cloudflare's cache (one read of the store a minute, however many ask).
async function devBody(env, ctx) {
  const key = new Request('https://orbit-config.quadra/dev');
  const hit = await caches.default.match(key);
  if (hit) return hit.text();
  // Paced by the bill's guard (pace.js): every live refresh `slow` times slower.
  const pace = await paceOf(env);
  const dev = await readDev(env, ECO_DEPS);
  const body = JSON.stringify(pace.slow > 1 ? { ...applyScale(dev, pace.slow), pace: pace.pace } : dev);
  ctx.waitUntil(caches.default.put(key, new Response(body, { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' } })));
  return body;
}
// …which the sports proxy's cache times follow (sports.js), read at most once a minute.
useDevSettings((env, ctx) => devBody(env, ctx).then(JSON.parse));

// The Quadra Pass session a request carries (`qt=`), or null.
async function sessionOf(request, env) {
  const qt = new URL(request.url).searchParams.get('qt');
  return qt ? readToken(await tokenSecret(env), qt, 'ses') : null;
}

// Every route, by path (fetch below answers anything that throws).
async function route(request, env, ctx, headers, origin) {
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const path = new URL(request.url).pathname.replace(/\/+$/, '');

  // See GEMINI_BILLED_PATHS' own comment - a real, enforced reject, not
  // just the advisory CORS headers fetch computed.
  if (GEMINI_BILLED_PATHS.has(path) && !isAllowedOrigin(origin)) {
    return errorJson('FORBIDDEN_ORIGIN', 403, headers, request);
  }

  // Orbit Class's AI features need a Quadra Pass session (`qt=`).
  if (path === '/gemini' || path === '/nl-edit') {
    const session = await sessionOf(request, env);
    return path === '/gemini' ? handleGeminiRequest(request, env, headers, ip, ctx, session) : handleNlEditRequest(request, env, headers, ip, ctx, session);
  }
  if (path === '/eco') return handleEcoRequest(request, env, headers, ip, ECO_DEPS);
  // The data proxy for Sports, Play and Securities (sports.js): its own
  // session gate and per-app limits.
  if (path === '/sports-proxy') return handleSports(request, env, ctx, headers, ip);
  // Slip Tracker's narrow door (slip.js): no pass, Asian baseball only, small caps.
  if (path === '/slip') return handleSlip(request, env, ctx, headers, ip);
  // …and its ticket photos, read by Gemini (no pass, a few a day).
  if (path === '/slip-scan') return handleSlipScan(request, env, headers, ip, (model, parts, schema) => proxyGeminiRequest(model, parts, schema, env, headers, ctx, 'slip-scan'));
  // Orbit Law's questions (law.js) and its 問法律 (law-chat.js): a Quadra
  // Pass of Orbit Law's, its origin only, a day's caps a Pass in D1.
  // (Gemini's first model, Flash-Lite: a few seconds' work.)
  const lawGemini = feature => (parts, schema) => proxyGeminiRequest(GEMINI_ALLOWED_MODELS[0], parts, schema, env, headers, ctx, feature, 25_000);
  if (path === '/law-ask') return handleLawAsk(request, env, ctx, headers, await sessionOf(request, env), lawGemini('law-ask'));
  if (path === '/law-chat') return handleLawChat(request, env, ctx, headers, await sessionOf(request, env), lawGemini('law-chat'));
  // …and its summaries for cards (law-gist.js): the same Pass, shared and kept, a day's cap in all.
  if (path === '/law-gist') return handleLawGist(request, env, ctx, headers, await sessionOf(request, env), lawGemini('law-gist'));
  // …and government pages read inside the app (law-page.js): the same Pass, gov.tw only, nothing stored.
  if (path === '/law-page') return handleLawPage(request, env, ctx, headers, await sessionOf(request, env));
  // The bill's guard (guard.js), as it last read the bill: armed or not,
  // each count's share of the $5 plan, stopped or not. No key or token.
  if (path === '/guard' && request.method === 'GET') {
    const g = JSON.parse((await env.RATE_LIMIT_KV?.get(GUARD_STATE).catch(() => null)) || 'null');
    return json(g ? { at: g.at, armed: g.armed, error: g.error || null, partial: g.partial || null, cpuWay: g.cpuWay || null, stopAt: g.stopAt, share: g.share || null, stopped: g.stopped ? { at: g.stopped.at, why: g.stopped.why } : null, period: g.period || null, pace: g.pace || 0, paceTop: g.paceTop ?? null, alert: g.alert || 0, accountFound: !!g.account } : { ran: false }, 200, headers);
  }
  // The Pass's store (doc-store.js): each collection's count (no
  // document), from a localhost page (the dev door).
  if (path === '/store/check' && request.method === 'GET') {
    if (!LOCAL_ORIGIN.test(origin) || sessionLimited(`store:${ip}`, 2)) return errorJson('FORBIDDEN_ORIGIN', 403, headers, request);
    if (!env.STORE) return json({ d1: false }, 200, headers);
    return json({ d1: true, collections: await DOCS.count(env) }, 200, headers);
  }
  // The repo's own checks (Shared-Proxy's build.yml), Bearer DATA_PUSH_SECRET:
  // ?check=gemini (one tiny call through the relay) or system (ops.js).
  if (path === '/ops' && request.method === 'POST') {
    if (!env.DATA_PUSH_SECRET || request.headers.get('Authorization') !== `Bearer ${env.DATA_PUSH_SECRET}`) return errorJson('FORBIDDEN_ORIGIN', 403, headers, request);
    const check = new URL(request.url).searchParams.get('check');
    if (check === 'gemini') return json(await geminiCheck(env), 200, headers);
    if (check === 'system') return json(await systemReport(env, ECO_DEPS), 200, headers);
    return json({ error: { message: 'check=gemini|system' } }, 400, headers);
  }
  // A builder's job now (builders/run.js), by hand: Bearer DATA_PUSH_SECRET
  // (Shared-Proxy's build.yml). ?job=watch|cutouts|buses|play, or
  // ?only=asia|cpbl|sports|photos|winprob|play; &full=1 a full watch run.
  if (path === '/data/build' && request.method === 'POST') {
    if (!env.DATA_PUSH_SECRET || request.headers.get('Authorization') !== `Bearer ${env.DATA_PUSH_SECRET}`) return errorJson('FORBIDDEN_ORIGIN', 403, headers, request);
    const q = new URL(request.url).searchParams;
    const r = await runBuilders(env, { proxy: builderProxy(env), job: q.get('job') || undefined, only: q.get('only') || undefined, full: q.get('full') === '1' ? true : undefined, now: Date.now() });
    return json(r, 200, headers);
  }
  // The family's data, kept in R2 (data.js): packs, the mirror, bus packs.
  if (path.startsWith('/data/')) return handleData(request, env, ctx, headers, ip, path);
  // The developer settings (kit/devconfig.mjs), for every app and the
  // sports proxy: kept a minute in Cloudflare's cache (one read of the
  // store a minute, however many ask).
  if (path === '/config' && request.method === 'GET') {
    const body = await devBody(env, ctx);
    return new Response(body, { headers: { ...headers, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=60' } });
  }
  if (path === '/kambi') {
    // A Quadra Pass session only, counted per session in memory.
    const session = await sessionOf(request, env);
    if (!session) return errorJson('ECO_TOKEN_INVALID', 401, headers, request);
    const deps = { ...KAMBI_DEPS, rateLimitResponse: async () => (sessionLimited(`k:${session.s}`, 60) ? errorJson('RATE_LIMITED', 429, headers, request) : null) };
    return handleKambiRequest(request, env, headers, ip, deps);
  }
  // Quadra Play's slips settled here (settle.js): a Quadra Pass session of Play's.
  // Quadra Securities' orders filled here (stock-fill.js): a Securities session.
  if (path === '/stock') {
    const session = await sessionOf(request, env);
    if (session && sessionLimited(`st:${session.s}`, 30)) return errorJson('RATE_LIMITED', 429, headers, request);
    return handleStock(request, env, headers, session, { json, errorJson, fsGet: DOCS.get, fsWrite: DOCS.write, now: () => Date.now(), read: url => stockReads(env)(url) });
  }
  if (path === '/play') {
    const session = await sessionOf(request, env);
    if (session && sessionLimited(`pl:${session.s}`, 30)) return errorJson('RATE_LIMITED', 429, headers, request);
    // The dev door: a localhost page may have a slip's prices checked (nothing placed), 10 a minute an address.
    const dev = !session && LOCAL_ORIGIN.test(origin);
    if (dev && sessionLimited(`pl:dev:${ip}`, 10)) return errorJson('RATE_LIMITED', 429, headers, request);
    return handlePlay(request, env, headers, session, { ...playDeps(env), dev });
  }
  // Web Push (push.js): here, where the Quadra Pass tokens can be read.
  if (path.startsWith('/push/')) {
    const session = await sessionOf(request, env);
    if (session && sessionLimited(`p:${session.s}`, 30)) return errorJson('RATE_LIMITED', 429, headers, request);
    return handlePush(request, env, headers, session, path);
  }
  // Orbit Weather (weather.js): a Quadra Pass session for the forecast and
  // the place; the township list, the keys' check and the skill are open.
  // Or a local dev page (localhost: the preview's --live, timing the
  // forecast on real data), as Transit's: no account, 30 asks a minute an
  // address; Google's calls stay under the day's cap either way.
  // WEATHER_DEV = "off" (wrangler.toml [vars]) closes it.
  if (path === '/weather' || path.startsWith('/weather/')) {
    if (path === '/weather/skill') return new Response(JSON.stringify(await skillReport(env)), { headers: { ...headers, 'Content-Type': 'application/json' } });
    const signed = await sessionOf(request, env);
    const dev = !signed && env.WEATHER_DEV !== 'off' && LOCAL_ORIGIN.test(origin);
    const session = signed || (dev ? { s: 'dev', dev: true } : null);
    return handleWeather(request, env, headers, path, { session, ctx, limited: () => sessionLimited(dev ? `w:dev:${ip}` : `w:${session?.s}`, 30) });
  }
  // Orbit Transit (transit.js): a Quadra Pass session for everything but
  // the usage page. Or a local dev page (localhost, http or https: the
  // preview's --live, testing on today's real buses and trains): transit
  // data only, no account, 300 asks a minute an address (a search is dozens); Google's paid asks
  // stay under transit.js's monthly caps either way. TRANSIT_DEV = "off"
  // (wrangler.toml [vars]) closes it.
  if (path === '/transit' || path.startsWith('/transit/')) {
    const signed = await sessionOf(request, env);
    const dev = !signed && env.TRANSIT_DEV !== 'off' && LOCAL_ORIGIN.test(origin);
    const session = signed || (dev ? { s: 'dev', dev: true } : null);
    return handleTransit(request, env, headers, path, { session, ctx, limited: () => sessionLimited(dev ? `t:dev:${ip}` : `t:${session?.s}`, dev ? 300 : 90) });
  }
  return errorJson('NOT_FOUND', 404, headers, request);
}

export default {
  // A route that throws is still answered with the CORS headers (an app sees
  // a failure it can try again, not a blocked request), and logged.
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin, request.cf?.colo);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    try {
      return await route(request, env, ctx, headers, origin);
    } catch (error) {
      console.log('route failed', new URL(request.url).pathname, String(error?.message || error).slice(0, 200));
      return errorJson('WORKER_FAILED', 500, headers, request);
    }
  },

  // The cron (wrangler.toml [triggers]): the notices that are due (push.js),
  // and the latest score of each Kambi match Quadra Sportsbook has bets on
  // (kambi.js).
  async scheduled(event, env, ctx) {
    const tick = new Date(event.scheduledTime || Date.now());
    const min = tick.getUTCMinutes();
    // Each job's heartbeat kept (ops.js: the admin panel's 系統); a failure logged.
    const run = (job, fn, log = r => r) => ctx.waitUntil(beat(env, job, fn).then(r => (r = log(r)) && console.log(job, JSON.stringify(r))).catch(e => console.log(`${job} failed`, String(e?.message || e))));
    // F1's laps while a session runs (sports.js, f1-live.js): every minute of an F1 weekend.
    if (F1_DAYS.has(tick.getUTCDay())) run('f1', () => sportsCron(env, tick.getTime()), () => null);
    // (The bill's pace, pace.js: what can wait waits.)
    const pace = (await paceOf(env)).pace;
    // The family's data (builders/), each job at its minute.
    if (event.cron !== SETTLE_CRON && BUILD_SLOTS[min]) run(`build:${BUILD_SLOTS[min]}`, () => runBuilders(env, { proxy: builderProxy(env), now: tick.getTime(), pace, log: () => {} }));
    // The bill's guard: its clock woken (started if it isn't); and what the
    // owner should hear of it (ops.js tellOwner: a higher alert, a stop, a new pace).
    if (event.cron !== SETTLE_CRON && min % 10 === 0) {
      if (env.GUARD) ctx.waitUntil(env.GUARD.fetch('https://quota-guard/tick').catch(() => {}));
      if (storeReady(env)) run('alerts', () => tellOwner(env, ECO_DEPS), r => (r.news ? r : null));
    }
    // Odd minutes: Quadra Play's slips whose games should be over (settle.js),
    // in an invocation of its own (its own fetches and CPU).
    if (event.cron === SETTLE_CRON) {
      // (Every fourth minute the lottery's tickets instead, lotto.js: each run its own fetches.)
      if (!storeReady(env)) return;
      if (min % 4 === 3) run('lottery', () => lottoCron(env, playDeps(env)), r => (r.settled ? r : null));
      else run('settle', () => settleCron(env, playDeps(env)), r => (r.looked ? r : null));
      return;
    }
    run('notices', () => sendDue(env), r => (r.sent ? r : null));
    // Orbit Weather's scoring, once an hour (weather-skill.js).
    if (!pace && min === 10) run('weather-skill', () => weatherCron(env));
    if (!storeReady(env)) return;
    // The live refreshes by how many people there are (capacity.js), every 6 hours.
    if (min === 20 && tick.getUTCHours() % 6 === 0) run('capacity', () => capacityCron(env, ECO_DEPS));
    run('kambi', () => refreshKambiWatch(env, KAMBI_DEPS), r => (r.checked || r.saved ? r : null));
  }
};
