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
  MISSING_WORD: '缺少或無效的單字。',
  INVALID_MNEMONIC: 'AI 沒有回傳有效的記憶法。',
  MISSING_KIND: '缺少或無效的種類參數。',
  SYNC_METHOD_NOT_ALLOWED: '僅支援 GET、POST、PATCH 或 DELETE 方法。',
  MISSING_FIREBASE_CONFIG: 'Worker 尚未設定 Firebase 服務帳戶。',
  INVALID_PASSCODE: '無效的密碼。',
  INVALID_PAIRING_CODE: '無效的配對代碼。',
  MISSING_PAYLOAD: '缺少或無效的內容資料。',
  SYNC_PASSCODE_NOT_FOUND: '找不到這組同步密碼。',
  PAIRING_CODE_NOT_FOUND: '找不到這組配對代碼。',
  MANAGER_PASSCODE_REQUIRED_WRITE: '需要正確的密碼才能寫入。',
  MANAGER_PASSCODE_REQUIRED_DELETE: '需要正確的密碼才能刪除整個同步。',
  FORBIDDEN_ORIGIN: '不允許的來源。',
  ECO_UNKNOWN_APP: '未知的應用程式',
  ECO_UNKNOWN_OP: '未知的操作',
  ECO_INVALID_RECIPIENT: '這不是四方通行碼。',
  ECO_SAME_ACCOUNT: '不能轉給同一個帳戶。',
  ECO_INVALID_AMOUNT: '金額無效',
  ECO_RECIPIENT_NOT_FOUND: '找不到這組四方通行碼的帳戶。',
  ECO_INSUFFICIENT_FUNDS: '資金池的錢不夠。',
  ECO_INVALID_SOURCES: '請列出 1 到 12 組要合併的代碼。',
  NOT_FOUND: '找不到此路徑。'
};
