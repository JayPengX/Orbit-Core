// ---- worker.js ----
// orbit-workers-proxy: the Quadra apps' server side (Quadra Securities,
// Quadra Play, Orbit Sports, Orbit Words and Orbit Class). Routed by
// path:
//
//   GET/POST/PATCH/DELETE /eco   the Quadra Pass: one account and one NT$
//                                money pool for every Quadra app, and each
//                                app's data (eco.js)
//   POST  /gemini                Orbit Class's AI schedule-photo import
//   POST  /nl-edit               Orbit Class's natural-language edits
//   GET   /kambi                 Kambi's live scores for Quadra Play (kambi.js)
//   GET/POST /push/…             notices while an app is closed (push.js)
//   GET   /weather/…             Orbit Weather's blended forecast (weather.js)
//   GET   /transit/…             Orbit Transit's map, places, routes and TDX data (transit.js)
//
// Every route but /eco's sign-in needs a Quadra Pass session (`qt=`). The
// Quadra Pass is the only way anything is saved.
// Orbit Sports' /sports-proxy lives in its own Worker
// (sports-proxy-worker.js): this one's [placement] region pin (Taiwan's,
// gcp:asia-east1) applies to the whole script.

import en from './locales/en.js';
import zhTW from './locales/zh-TW.js';
import { handleEcoRequest } from './eco.js';
import { readToken, tokenSecret, sessionLimited } from './quadra-token.js';
import { handleKambiRequest, refreshKambiWatch, fetchKambiLive } from './kambi.js';
import { handlePush, sendDue } from './push.js';
import { handleWeather } from './weather.js';
import { weatherCron, skillReport } from './weather-skill.js';
import { handleTransit } from './transit.js';

const ALLOWED_ORIGINS = ['https://jaypengx.github.io'];

function isAllowedOrigin(origin) {
  return ALLOWED_ORIGINS.includes(origin) || /^http:\/\/localhost:\d+$/.test(origin || '');
}

// X-Worker-Colo carries the IATA code of the Cloudflare colo that actually
// executed this request (request.cf.colo) on every response, successful or
// not. Diagnostic only - this is what confirmed wrangler.toml's old
// [placement] mode = "smart" was consistently landing this Worker's traffic
// on Hong Kong (a colo Google's Gemini API refuses outright, unlike a
// merely-unlucky one - see that file's own comment on why [placement] now
// pins to an explicit region instead), and stays useful for the same reason
// going forward: ties a future "User location is not supported" report to a
// specific colo instead of leaving it a guess. Needs to be both set AND
// exposed - CORS hides all response headers from browser JS by default
// unless explicitly listed here.
function corsHeaders(origin, colo) {
  return {
    'Access-Control-Allow-Origin': isAllowedOrigin(origin) ? origin : 'null',
    'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Expose-Headers': 'X-Worker-Colo, X-Transit-Cache, X-Transit-Age',
    // Browsers keep a preflight this long (Chrome caps it at 2 hours): the
    // apps' JSON writes don't each cost a second Worker request.
    'Access-Control-Max-Age': '86400',
    'X-Worker-Colo': colo || 'unknown',
    Vary: 'Origin'
  };
}

function json(data, status, headers) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...headers, 'Content-Type': 'application/json' }
  });
}

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

// request.json() resolves to any JSON value, `null` included, so a failed
// parse needs a sentinel of its own: `(await readJsonBody(request)) ===
// INVALID_BODY` means the caller should answer INVALID_JSON.
const INVALID_BODY = Symbol('invalid body');
function readJsonBody(request) {
  return request.json().catch(() => INVALID_BODY);
}

// ---- Shared rate limiting (Workers KV, one counter per feature+IP+hour) ----
//
// Real, cross-request rate limiting via Workers KV (env.RATE_LIMIT_KV - see
// README, an optional but recommended one-time binding), shared across
// every edge location - unlike a plain in-memory Map (kept below as
// isRateLimitedInMemory, used only as a fallback if the KV binding is
// missing or a KV call errors): Workers run many isolates in parallel
// across Cloudflare's edge, so an in-memory counter resets per isolate and
// a distributed burst of requests can blow straight through it. KV is
// still not a hard security boundary on its own (an abuser can spread
// requests across enough source IPs to dodge a per-IP counter), but it
// closes the specific gap of "just send enough requests to outrun a single
// isolate's memory." The real, unconditional backstop underneath both is
// Cloudflare's own free-plan daily request cap.
const RATE_WINDOW_MS = 60 * 60 * 1000;
const RATE_WINDOW_SECONDS = RATE_WINDOW_MS / 1000;

// Workers KV's free-tier daily caps are wildly asymmetric - 100,000
// reads/day but only 1,000 writes/day, per account, shared by every
// namespace. The original version of this function called kv.put() on
// every single request that wasn't already over its limit - one write just
// to increment the same counter by one - so a single feature under
// ordinary traffic (SYNC_READ_RATE_LIMIT alone allows 6000 requests/hour
// per IP) could burn through the *entire account's* daily write budget in
// minutes, at which point every kv.put() anywhere in this Worker starts
// throwing and every feature silently falls back to isRateLimitedInMemory
// (see the catch in isRateLimited below) - a noisy neighbor on one path
// degrading rate-limit accuracy on all the others.
//
// The fix batches increments per isolate instead of persisting each one to
// KV individually: the authoritative count is read from KV once per window
// (a read, not a write), and further increments in this isolate accumulate
// in memory (pendingCounters) and are flushed as a single write no more
// than once every KV_FLUSH_INTERVAL_MS. The limit check below still runs
// against base+delta on every request, so enforcement stays effectively
// real-time for whichever isolate is actually handling that traffic; only
// *persisting* the count for other isolates to see is throttled, and it is
// still flushed at least once when a window rolls over so a burst's tail
// is never silently lost.
const KV_FLUSH_INTERVAL_MS = 60 * 1000;
const pendingCounters = new Map();

async function flushPendingCounter(kv, key, pending, windowSeconds = RATE_WINDOW_SECONDS) {
  const total = pending.base + pending.delta;
  pending.base = total;
  pending.delta = 0;
  pending.lastFlushAt = Date.now();
  // expirationTtl a little past the window so a key never outlives its own
  // bucket by much, instead of accumulating in the namespace forever.
  await kv.put(key, String(total), { expirationTtl: windowSeconds + 60 });
}

// `windowMs` defaults to the per-IP hourly window every existing call site
// already relies on; isDailyGlobalCapped below passes a full day instead,
// reusing this exact same batched-counter machinery for a completely
// different shape of limit (see that function's own comment).
async function isRateLimitedKV(kv, bucketKey, limit, windowMs = RATE_WINDOW_MS) {
  const windowSeconds = windowMs / 1000;
  const windowBucket = Math.floor(Date.now() / windowMs);
  let pending = pendingCounters.get(bucketKey);
  if (pending && pending.windowBucket !== windowBucket) {
    // The previous window just ended - flush its final tally so other
    // isolates aren't left permanently blind to this isolate's last few
    // increments (best-effort: a failure here just means that window's
    // very last increments are invisible elsewhere, no worse than what the
    // old per-request behavior already tolerated between accounts).
    if (pending.delta > 0) {
      await flushPendingCounter(kv, `rl:${bucketKey}:${pending.windowBucket}`, pending, windowSeconds).catch(
        () => {}
      );
    }
    pending = null;
  }
  if (!pending) {
    const stored = Number((await kv.get(`rl:${bucketKey}:${windowBucket}`)) || '0');
    pending = { windowBucket, base: stored, delta: 0, lastFlushAt: Date.now() };
    pendingCounters.set(bucketKey, pending);
  }
  if (pending.base + pending.delta >= limit) return true;
  pending.delta += 1;
  if (Date.now() - pending.lastFlushAt >= KV_FLUSH_INTERVAL_MS) {
    await flushPendingCounter(kv, `rl:${bucketKey}:${windowBucket}`, pending, windowSeconds);
  }
  return false;
}

const requestLog = new Map();
function isRateLimitedInMemory(bucketKey, limit, windowMs = RATE_WINDOW_MS) {
  const now = Date.now();
  const timestamps = (requestLog.get(bucketKey) || []).filter(time => now - time < windowMs);
  const limited = timestamps.length >= limit;
  timestamps.push(now);
  requestLog.set(bucketKey, timestamps);
  return limited;
}

// `feature` keys the counter (e.g. 'gemini', 'sync:read', 'sync:write') so
// every call site's limit is tracked completely independently of every
// other's - see the top-of-file comment for why that separation matters.
// Returns { limited, backend } rather than a plain boolean so the caller
// can surface `backend` as a diagnostic response header - there's no way
// to inspect a live Worker's internal state otherwise (no log access from
// outside the Cloudflare dashboard), and "is the binding even wired up"
// has turned out to need a real, checkable answer more than once.
//
// `windowMs` is optional (defaults to the per-IP hourly window) so this
// same function/bucket machinery can also serve isDailyGlobalCapped's
// completely different shape of limit below - one shared, already-tested
// counter implementation instead of a second one.
async function isRateLimited(env, ip, feature, limit, windowMs = RATE_WINDOW_MS) {
  const bucketKey = `${feature}:${ip}`;
  if (env.RATE_LIMIT_KV) {
    try {
      return { limited: await isRateLimitedKV(env.RATE_LIMIT_KV, bucketKey, limit, windowMs), backend: 'kv' };
    } catch (error) {
      return {
        limited: isRateLimitedInMemory(bucketKey, limit, windowMs),
        backend: `kv-error:${(error && error.message) || error}`
      };
    }
  }
  return { limited: isRateLimitedInMemory(bucketKey, limit, windowMs), backend: 'memory-no-binding' };
}

// Charges one request against `feature`'s per-IP hourly counter and returns
// the 429 response to send if it's over `limit`, else null. Also sets
// X-RateLimit-Backend on every response - diagnostic only (no IPs, no
// counts, just which code path ran), so "is the KV binding even wired up"
// can be checked with one curl instead of needing dashboard log access.
async function rateLimitResponse(env, ip, feature, limit, headers, request) {
  const { limited, backend } = await isRateLimited(env, ip, feature, limit);
  headers['X-RateLimit-Backend'] = backend;
  return limited ? errorJson('RATE_LIMITED', 429, headers, request) : null;
}

const DAY_WINDOW_MS = 24 * 60 * 60 * 1000;

// A hard ceiling on TOTAL calls to a real, billed Gemini route across EVERY
// caller combined - not per-IP like isRateLimited above, which a caller
// spread across enough source IPs (or behind enough proxies) can still
// outrun. Added once real billing was active on this account's
// GEMINI_API_KEY (see the origin gate below for the other half of this
// defense). This is the actual financial
// backstop: whatever else fails to keep an abuser out, this Worker will
// stop making real upstream Gemini calls once this many have happened
// today for this feature, full stop, no matter how many different IPs or
// spoofed headers the calls came from. Reuses isRateLimited's exact same
// batched-KV-counter machinery via a fixed pseudo-IP ('global') and a full
// day's window instead of an hour's - see that function's own comment.
async function isDailyGlobalCapped(env, feature, limit) {
  const result = await isRateLimited(env, 'global', `daily-cap:${feature}`, limit, DAY_WINDOW_MS);
  return result.limited;
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

function geminiUrl(model, env) {
  return `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${env.GEMINI_API_KEY}`;
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
async function proxyGeminiRequest(model, parts, schema, env, headers, ctx, feature) {
  try {
    const upstream = await fetch(geminiUrl(model, env), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts }],
        generationConfig: buildGenerationConfig(model, schema)
      })
    });
    let body = upstream.body;
    if (upstream.ok && body && ctx) {
      const [toClient, toLog] = body.tee();
      body = toClient;
      ctx.waitUntil(logGeminiUsage(toLog, feature, model));
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
async function logGeminiUsage(stream, feature, model) {
  try {
    const usage = JSON.parse(await new Response(stream).text()).usageMetadata || {};
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

  const body = await readJsonBody(request);
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

// ==== Firestore (the Quadra Pass's store) =====================================
//
// One Firebase service account, held here as secrets (FIREBASE_PROJECT_ID,
// FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY): Firestore's own rules deny
// every client, so this Worker is the only way in. Every document has one
// string field, `payload`.

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

function base64UrlFromBytes(bytes) {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64UrlFromString(str) {
  return base64UrlFromBytes(new TextEncoder().encode(str));
}
function pemToDer(pem) {
  const b64 = pem
    .trim()
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    // Handles pasting the key straight out of the downloaded JSON's
    // `private_key` string value, literal backslash-n escapes and all,
    // instead of the JSON-decoded value with real line breaks - a common
    // copy-paste artifact since Cloudflare's secret box is a single text
    // field either way. Order matters: this must run before the generic
    // whitespace strip below, since a *real* newline is already whitespace
    // but a literal `\n` (backslash then the letter n) is two ordinary,
    // non-whitespace characters that would otherwise survive into the
    // base64 string and corrupt it.
    .replace(/\\n/g, '')
    .replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

// Cached per-isolate (module scope) so a burst of requests on the same
// isolate reuses one access token instead of round-tripping to Google's
// OAuth endpoint on every single Firestore call - the token is valid for an
// hour, refetched a little early rather than right at expiry.
let cachedFirebaseToken = null;
async function getFirebaseAccessToken(env) {
  const now = Math.floor(Date.now() / 1000);
  if (cachedFirebaseToken && cachedFirebaseToken.expiry > now + 60) {
    return cachedFirebaseToken.token;
  }

  const header = { alg: 'RS256', typ: 'JWT' };
  const claim = {
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: 'https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600
  };
  const unsigned = `${base64UrlFromString(JSON.stringify(header))}.${base64UrlFromString(JSON.stringify(claim))}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToDer(env.FIREBASE_PRIVATE_KEY),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(unsigned)
  );
  const jwt = `${unsigned}.${base64UrlFromBytes(new Uint8Array(signature))}`;

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${encodeURIComponent(jwt)}`
  });
  if (!response.ok) {
    throw new Error(`Google OAuth token exchange failed: ${await response.text()}`);
  }
  const data = await response.json();
  cachedFirebaseToken = { token: data.access_token, expiry: now + (data.expires_in || 3600) };
  return cachedFirebaseToken.token;
}

function firestoreDocUrl(env, collection, code) {
  return `${firestoreBase(env)}/${encodeURIComponent(collection)}/${encodeURIComponent(code)}`;
}
function firestoreBase(env) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents`;
}
async function firestoreErrorMessage(response) {
  const errorJson = await response.json().catch(() => ({}));
  return errorJson.error?.message || response.statusText || `HTTP ${response.status}`;
}

async function firestoreGet(env, collection, code) {
  const token = await getFirebaseAccessToken(env);
  const response = await fetch(firestoreDocUrl(env, collection, code), {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (response.status === 404) return { exists: false, updateTime: '', payload: '' };
  if (!response.ok) throw new Error(await firestoreErrorMessage(response));
  const doc = await response.json();
  return { exists: true, updateTime: doc.updateTime || '', payload: doc.fields?.payload?.stringValue || '' };
}

// /eco's writes (see eco.js): the single `payload` field, optionally only if the document is still as it was read
// (`{ updateTime }`) or doesn't exist yet (`{ exists: false }`). A write that
// lost that race throws an error marked `precondition`, and eco.js reads
// and merges again.
async function firestoreWrite(env, collection, code, payload, precondition) {
  const token = await getFirebaseAccessToken(env);
  let query = 'updateMask.fieldPaths=payload';
  if (precondition?.updateTime) query += `&currentDocument.updateTime=${encodeURIComponent(precondition.updateTime)}`;
  else if (precondition?.exists === false) query += '&currentDocument.exists=false';
  const response = await fetch(`${firestoreDocUrl(env, collection, code)}?${query}`, {
    method: 'PATCH',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { payload: { stringValue: payload } } })
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error?.message || response.statusText || `HTTP ${response.status}`);
    const status = body.error?.status || '';
    if (precondition && (status === 'FAILED_PRECONDITION' || status === 'ALREADY_EXISTS' || status === 'NOT_FOUND' || response.status === 409)) error.precondition = true;
    throw error;
  }
  const doc = await response.json();
  return { updateTime: doc.updateTime || '' };
}

// Every document of a collection: [{ id, payload, updateTime }], a page at
// a time (`limit`: stop after that many).
// `idsOnly`: names without the payloads (a mask on a field no document has).
async function firestoreList(env, collection, pageSize = 300, { limit = Infinity, idsOnly = false } = {}) {
  const token = await getFirebaseAccessToken(env);
  const out = [];
  let pageToken = '';
  do {
    const response = await fetch(`${firestoreBase(env)}/${encodeURIComponent(collection)}?pageSize=${pageSize}${idsOnly ? '&mask.fieldPaths=_none' : ''}${pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ''}`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!response.ok) throw new Error(await firestoreErrorMessage(response));
    const data = await response.json();
    for (const doc of data.documents || []) out.push({ id: decodeURIComponent(doc.name.split('/').pop()), payload: doc.fields?.payload?.stringValue || '', updateTime: doc.updateTime || '' });
    pageToken = data.nextPageToken || '';
  } while (pageToken && out.length < limit);
  return out;
}

// The collections that exist (for the store's clean-up, eco-admin.js).
async function firestoreCollections(env) {
  const token = await getFirebaseAccessToken(env);
  const response = await fetch(`${firestoreBase(env)}:listCollectionIds`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ pageSize: 100 })
  });
  if (!response.ok) throw new Error(await firestoreErrorMessage(response));
  return (await response.json()).collectionIds || [];
}

// Up to 500 writes in one request: { delete: [collection, id] } or
// { update: [collection, id, payload], updateTime? } (only if unchanged).
// Each write stands alone: one that fails doesn't stop the rest.
async function firestoreBatch(env, writes) {
  const token = await getFirebaseAccessToken(env);
  const name = (c, id) => `projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents/${c}/${id}`;
  const response = await fetch(`${firestoreBase(env)}:batchWrite`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      writes: writes.map(w =>
        w.delete
          ? { delete: name(...w.delete) }
          : {
              update: { name: name(w.update[0], w.update[1]), fields: { payload: { stringValue: w.update[2] } } },
              updateMask: { fieldPaths: ['payload'] },
              ...(w.updateTime ? { currentDocument: { updateTime: w.updateTime } } : {})
            }
      )
    })
  });
  if (!response.ok) throw new Error(await firestoreErrorMessage(response));
  return response.json();
}

// Deletes a document; one already gone counts as deleted.
async function firestoreDelete(env, collection, code) {
  const token = await getFirebaseAccessToken(env);
  const response = await fetch(firestoreDocUrl(env, collection, code), {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok && response.status !== 404) throw new Error(await firestoreErrorMessage(response));
}

// ---- /eco: the Quadra Pass (see eco.js) ------------------------------------
const ECO_DEPS = {
  json,
  errorJson,
  upstreamFailed,
  readJsonBody,
  INVALID_BODY,
  rateLimitResponse,
  fsGet: firestoreGet,
  fsWrite: firestoreWrite,
  fsDelete: firestoreDelete,
  fsList: firestoreList,
  fsCollections: firestoreCollections,
  fsBatch: firestoreBatch,
  sha256Hex,
  generateCode,
  now: () => Date.now()
};

// /kambi (kambi.js): the same plumbing, and Kambi's live data.
const KAMBI_DEPS = { ...ECO_DEPS, fsList: firestoreList, fetchLive: fetchKambiLive };

// ==== Routing ================================================================

export default {
  async fetch(request, env, ctx) {
    const origin = request.headers.get('Origin') || '';
    const headers = corsHeaders(origin, request.cf?.colo);

    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });

    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const path = new URL(request.url).pathname.replace(/\/+$/, '');

    // See GEMINI_BILLED_PATHS' own comment - a real, enforced reject, not
    // just the advisory CORS headers already computed above.
    if (GEMINI_BILLED_PATHS.has(path) && !isAllowedOrigin(origin)) {
      return errorJson('FORBIDDEN_ORIGIN', 403, headers, request);
    }

    // Orbit Class's AI features need a Quadra Pass session (`qt=`).
    if (path === '/gemini' || path === '/nl-edit') {
      const qt = new URL(request.url).searchParams.get('qt');
      const session = qt ? await readToken(await tokenSecret(env), qt, 'ses') : null;
      return path === '/gemini' ? handleGeminiRequest(request, env, headers, ip, ctx, session) : handleNlEditRequest(request, env, headers, ip, ctx, session);
    }
    if (path === '/eco') return handleEcoRequest(request, env, headers, ip, ECO_DEPS);
    if (path === '/kambi') {
      // A Quadra Pass session only, counted per session in memory.
      const qt = new URL(request.url).searchParams.get('qt');
      const session = qt ? await readToken(await tokenSecret(env), qt, 'ses') : null;
      if (!session) return errorJson('ECO_TOKEN_INVALID', 401, headers, request);
      const deps = { ...KAMBI_DEPS, rateLimitResponse: async () => (sessionLimited(`k:${session.s}`, 60) ? errorJson('RATE_LIMITED', 429, headers, request) : null) };
      return handleKambiRequest(request, env, headers, ip, deps);
    }
    // Web Push (push.js): here, where the Quadra Pass tokens can be read.
    if (path.startsWith('/push/')) {
      const qt = new URL(request.url).searchParams.get('qt');
      const session = qt ? await readToken(await tokenSecret(env), qt, 'ses') : null;
      if (session && sessionLimited(`p:${session.s}`, 30)) return errorJson('RATE_LIMITED', 429, headers, request);
      return handlePush(request, env, headers, session, path);
    }
    // Orbit Weather (weather.js): a Quadra Pass session for the forecast and
    // the place; the township list, the keys' check and the skill are open.
    if (path === '/weather' || path.startsWith('/weather/')) {
      if (path === '/weather/skill') return new Response(JSON.stringify(await skillReport(env)), { headers: { ...headers, 'Content-Type': 'application/json' } });
      const qt = new URL(request.url).searchParams.get('qt');
      const session = qt ? await readToken(await tokenSecret(env), qt, 'ses') : null;
      return handleWeather(request, env, headers, path, { session, ctx, limited: () => sessionLimited(`w:${session?.s}`, 30) });
    }
    // Orbit Transit (transit.js): a Quadra Pass session for everything but
    // the usage page.
    if (path === '/transit' || path.startsWith('/transit/')) {
      const qt = new URL(request.url).searchParams.get('qt');
      const session = qt ? await readToken(await tokenSecret(env), qt, 'ses') : null;
      return handleTransit(request, env, headers, path, { session, ctx, limited: () => sessionLimited(`t:${session?.s}`, 90) });
    }
    return errorJson('NOT_FOUND', 404, headers, request);
  },

  // The cron (wrangler.toml [triggers]): the notices that are due (push.js),
  // and the latest score of each Kambi match Quadra Sportsbook has bets on
  // (kambi.js).
  async scheduled(event, env, ctx) {
    ctx.waitUntil(sendDue(env).then(r => r.sent && console.log('push sent', JSON.stringify(r))));
    // Orbit Weather's scoring, once an hour (weather-skill.js).
    if (new Date(event.scheduledTime || Date.now()).getUTCMinutes() === 10) ctx.waitUntil(weatherCron(env).then(r => console.log('weather skill', JSON.stringify(r))).catch(e => console.log('weather skill failed', String(e))));
    if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return;
    ctx.waitUntil(refreshKambiWatch(env, KAMBI_DEPS).then(r => console.log('kambi watch', JSON.stringify(r))));
  }
};
