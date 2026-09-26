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
  MISSING_WORD: 'Missing or invalid word',
  INVALID_MNEMONIC: 'The AI did not return a valid mnemonic.',
  MISSING_KIND: 'Missing or invalid kind',
  SYNC_METHOD_NOT_ALLOWED: 'GET, POST, PATCH or DELETE only',
  MISSING_FIREBASE_CONFIG: 'The worker has not configured its Firebase service account.',
  INVALID_PASSCODE: 'Invalid passcode',
  INVALID_PAIRING_CODE: 'Invalid pairing code',
  MISSING_PAYLOAD: 'Missing or invalid payload',
  SYNC_PASSCODE_NOT_FOUND: 'This sync passcode was not found.',
  PAIRING_CODE_NOT_FOUND: 'This pairing code was not found.',
  MANAGER_PASSCODE_REQUIRED_WRITE: 'The correct passcode is required to write.',
  MANAGER_PASSCODE_REQUIRED_DELETE: 'The correct passcode is required to delete the whole sync.',
  FORBIDDEN_ORIGIN: 'Forbidden origin',
  ECO_UNKNOWN_APP: 'Unknown app',
  ECO_UNKNOWN_OP: 'Unknown operation',
  ECO_INVALID_RECIPIENT: 'That is not a Quadra Pass code.',
  ECO_SAME_ACCOUNT: 'You cannot send money to the same account.',
  ECO_INVALID_AMOUNT: 'Invalid amount',
  ECO_RECIPIENT_NOT_FOUND: 'No account has that Quadra Pass code.',
  ECO_INSUFFICIENT_FUNDS: 'Not enough money in the pool.',
  ECO_INVALID_SOURCES: 'List 1 to 12 codes to merge.',
  NOT_FOUND: 'Not found'
};
