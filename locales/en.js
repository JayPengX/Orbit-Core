// ---- locales/en.js ----
// English text for every stable error `code` this Worker returns (see
// worker.js's ERROR_MESSAGES/errorJson). `en` is authoritative for the
// codes that were already English before bilingual support existed
// (POST_ONLY, INVALID_JSON, etc.) - locales/zh-TW.js is a later
// translation alongside them, not a change to English callers' behavior.
export default {
  POST_ONLY: 'POST only',
  RATE_LIMITED: 'Too many requests. Please try again later.',
  DAILY_QUOTA_EXCEEDED: "Today's quota has been used up. Please try again tomorrow.",
  INVALID_JSON: 'Invalid JSON body',
  UNSUPPORTED_MODEL: 'Unsupported model',
  MISSING_API_KEY: 'The worker has not configured GEMINI_API_KEY.',
  MISSING_TEXT: 'Missing or invalid text',
  MISSING_CONTEXT: 'Missing or invalid context',
  CONTEXT_TOO_LARGE: 'Context too large',
  SYNC_METHOD_NOT_ALLOWED: 'GET, POST, PATCH or DELETE only',
  MISSING_FIREBASE_CONFIG: 'The worker has not configured its Firebase service account.',
  INVALID_PASSCODE: 'Invalid passcode',
  MISSING_PAYLOAD: 'Missing or invalid payload',
  SYNC_PASSCODE_NOT_FOUND: 'This sync passcode was not found.',
  FORBIDDEN_ORIGIN: 'Forbidden origin',
  ECO_UNKNOWN_APP: 'Unknown app',
  ECO_UNKNOWN_OP: 'Unknown operation',
  ECO_INVALID_SOURCES: 'List 1 to 12 codes to merge.',
  NOT_FOUND: 'Not found',
  ECO_TOKEN_INVALID: 'Your sign-in has expired. Signing in again…',
  ECO_SIGNED_OUT: 'This device was signed out. Sign in with your Quadra Pass.',
  ECO_SESSION_MOVED: 'Quadra is open in another app.',
  ECO_HANDOFF_EXPIRED: 'This link has expired. Sign in with your Quadra Pass.',
  ECO_NOTHING_TO_SHARE: 'There is no schedule to share yet.',
  ECO_SHARE_NOT_FOUND: 'No schedule has this key, or it has expired.'
};
