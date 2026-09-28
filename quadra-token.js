// ---- quadra-token.js ----
// Signed Quadra Pass tokens, shared by both Workers (worker.js's /eco signs
// them, sports-proxy-worker.js only checks them).
//
// A token is `<body>.<sig>`: body is base64url JSON, sig its HMAC-SHA256
// under the token secret. Nothing in a token is secret (it names the
// account's hash, never the pass); it only proves /eco issued it.
//
//   { k: kind, d: account (the pass's SHA-256), a: app, s: session id,
//     g: the account's token generation, e: expiry (ms) }
//
// kinds:
//   ses  a session: reads and writes /eco, fetches through /sports-proxy.
//        Short (SESSION_MS); /eco hands a fresh one back while the session
//        is the account's live one, so an app the person has moved away
//        from runs out within minutes.
//   ref  a device's refresh token: trades for a new session (60 days).
//
// The secret: ECO_TOKEN_SECRET (set on both Workers). Without it /eco falls
// back to one derived from its Firebase key, and /sports-proxy (which has no
// Firebase key) doesn't check tokens at all: nothing breaks before the
// secret is set, the gate simply isn't on yet.

export const SESSION_MS = 20 * 60_000;
export const REFRESH_MS = 60 * 86_400_000;

const enc = new TextEncoder();
const keys = new Map();

function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function unb64url(text) {
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}

export async function tokenSecret(env) {
  if (env.ECO_TOKEN_SECRET) return env.ECO_TOKEN_SECRET;
  if (!env.FIREBASE_PRIVATE_KEY) return '';
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(`quadra-token:${env.FIREBASE_PRIVATE_KEY}`));
  return b64url(new Uint8Array(digest));
}

async function hmacKey(secret) {
  if (!keys.has(secret)) keys.set(secret, crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']));
  return keys.get(secret);
}

export async function signToken(secret, claims) {
  const body = b64url(enc.encode(JSON.stringify(claims)));
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', await hmacKey(secret), enc.encode(body)));
  return `${body}.${b64url(sig)}`;
}

// The claims of a valid, unexpired token of `kind`, else null.
export async function readToken(secret, token, kind, now = Date.now()) {
  if (!secret || typeof token !== 'string' || token.length > 1024) return null;
  const [body, sig] = token.split('.');
  if (!body || !sig) return null;
  try {
    const ok = await crypto.subtle.verify('HMAC', await hmacKey(secret), unb64url(sig), enc.encode(body));
    if (!ok) return null;
    const claims = JSON.parse(new TextDecoder().decode(unb64url(body)));
    if (!claims || claims.k !== kind || !(claims.e > now)) return null;
    return claims;
  } catch {
    return null;
  }
}

// ---- Handoff: a pass carried to another app, sealed ---------------------------
//
// Moving from one app to another on a phone (home-screen apps don't share
// storage) used to put the pass itself in the address. Now the address
// carries it sealed (AES-GCM under a key from the same secret) and good for
// HANDOFF_MS only; the app it opens trades it at /eco for the pass.

export const HANDOFF_MS = 3 * 60_000;

async function sealKey(secret) {
  const raw = await crypto.subtle.digest('SHA-256', enc.encode(`quadra-seal:${secret}`));
  return crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function seal(secret, data) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await sealKey(secret), enc.encode(JSON.stringify(data))));
  const out = new Uint8Array(iv.length + ct.length);
  out.set(iv);
  out.set(ct, iv.length);
  return b64url(out);
}

export async function unseal(secret, text) {
  if (!secret || typeof text !== 'string' || text.length > 512) return null;
  try {
    const bytes = unb64url(text);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.slice(0, 12) }, await sealKey(secret), bytes.slice(12));
    return JSON.parse(new TextDecoder().decode(plain));
  } catch {
    return null;
  }
}

// ---- A limiter that never touches KV --------------------------------------------
//
// Requests carrying a valid token are counted per session in the isolate's
// memory only: the token already proves a real Quadra Pass is behind them, so
// the per-IP KV counters (a KV write per busy minute per IP) aren't needed.
const counts = new Map();
export function sessionLimited(sid, limit, windowMs = 60_000, now = Date.now()) {
  const bucket = Math.floor(now / windowMs);
  const c = counts.get(sid);
  if (!c || c.bucket !== bucket) {
    if (counts.size > 5000) counts.clear();
    counts.set(sid, { bucket, n: 1 });
    return false;
  }
  c.n++;
  return c.n > limit;
}
