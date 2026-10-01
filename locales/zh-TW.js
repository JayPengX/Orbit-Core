// ---- locales/zh-TW.js ----
// Traditional Chinese text for every stable error `code` this Worker
// returns (see worker.js's ERROR_MESSAGES/errorJson) and pickLocale()'s
// fallback locale for any request that doesn't clearly prefer English.
// The codes that were already Chinese before bilingual support existed
// (RATE_LIMITED, DAILY_QUOTA_EXCEEDED, MISSING_API_KEY, INVALID_MNEMONIC)
// keep their original wording byte-for-byte here.
export default {
  POST_ONLY: '僅支援 POST 方法。',
  RATE_LIMITED: '請求過於頻繁，請稍後再試。',
  DAILY_QUOTA_EXCEEDED: '今日額度已用盡，請明天再試。',
  INVALID_JSON: '無效的 JSON 請求內容。',
  UNSUPPORTED_MODEL: '不支援的模型。',
  MISSING_API_KEY: 'Worker 尚未設定 GEMINI_API_KEY。',
  MISSING_TEXT: '缺少或無效的文字內容。',
  MISSING_CONTEXT: '缺少或無效的情境資料。',
  CONTEXT_TOO_LARGE: '情境資料過大。',
  SYNC_METHOD_NOT_ALLOWED: '僅支援 GET、POST、PATCH 或 DELETE 方法。',
  MISSING_FIREBASE_CONFIG: 'Worker 尚未設定 Firebase 服務帳戶。',
  INVALID_PASSCODE: '無效的密碼。',
  MISSING_PAYLOAD: '缺少或無效的內容資料。',
  SYNC_PASSCODE_NOT_FOUND: '找不到這組同步密碼。',
  FORBIDDEN_ORIGIN: '不允許的來源。',
  ECO_UNKNOWN_APP: '未知的應用程式',
  ECO_UNKNOWN_OP: '未知的操作',
  ECO_INVALID_SOURCES: '請列出 1 到 12 組要合併的代碼。',
  NOT_FOUND: '找不到此路徑。',
  ECO_TOKEN_INVALID: '登入已過期，正在重新登入…',
  ECO_SIGNED_OUT: '這台裝置已登出，請用 Quadra Pass 登入。',
  ECO_SESSION_MOVED: 'Quadra 正在另一個 App 使用中。',
  ECO_HANDOFF_EXPIRED: '這個連結已過期，請用 Quadra Pass 登入。',
  ECO_NOTHING_TO_SHARE: '還沒有課表可以分享。',
  ECO_SHARE_NOT_FOUND: '找不到這組金鑰，或已過期。'
};
