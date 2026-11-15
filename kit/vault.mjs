// Each app's data locked on the phone before it goes to the Pass (Jay 11-15:
// "prevent from our cloud be able to read the detail"; "no way to lose data
// unless the pass is actually lost"). End to end: the cloud keeps only
// locked copies, and it never holds a key that opens them.
//
//   - Every account has one data key (AES-256-GCM), made on a phone.
//   - The cloud keeps it only locked (`wallet.vault`): by a key made from the
//     Orbit Pass with PBKDF2-SHA256, PASS_ROUNDS rounds and a salt of its own
//     (a different salt and count from the Pass's id: knowing the account's
//     id gives nothing towards it). A pass is 10 random characters; at this
//     cost each guess of a stolen copy takes a phone's tenth of a second.
//   - A phone signed in keeps the key itself, in IndexedDB (forgotten at
//     sign-out). (Readable by the page, as it must be to be locked again by a
//     new pass; a page that could steal it could use it anyway.)
//   - An app's data: gzip, then locked with a fresh 12-byte nonce:
//     "e1:<vault id>:<nonce>:<locked>" (base64url). The vault's id names
//     which key locked it: data under another vault's (after a lost pass
//     started a new one) is gone, read as nothing.
//
// What the cloud must read stays as it is: Securities (the Worker fills its
// orders), the wallet (pay, relief), what's scheduled to notify, a Class
// timetable shared on purpose. eco.js refuses an open copy over a locked
// one, so an app that can't read its data never writes over it.
export const PASS_ROUNDS = 600_000;
export const PLAIN_APPS = new Set(['stock']);
const PREFIX = 'e1:';
const subtle = () => globalThis.crypto?.subtle;
const te = new TextEncoder();
const td = new TextDecoder();

// ---- base64url ----
export const b64 = bytes => {
  let s = '';
  const u = new Uint8Array(bytes);
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
export const unb64 = text => {
  const s = String(text).replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(s + '==='.slice((s.length + 3) % 4));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
};
const random = n => globalThis.crypto.getRandomValues(new Uint8Array(n));
const pipe = async (bytes, stream) => new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer());

export const isLocked = payload => typeof payload === 'string' && payload.startsWith(PREFIX);
export const vaultOf = payload => (isLocked(payload) ? payload.split(':')[1] || '' : '');
export const supported = () => Boolean(subtle() && typeof CompressionStream !== 'undefined');

// The key that locks the data key, from the pass (as typed: spaces and case don't matter).
export const cleanPass = pass => String(pass || '').replace(/[^0-9A-Za-z]/g, '').toUpperCase();
async function passKey(pass, salt, rounds = PASS_ROUNDS) {
  const base = await subtle().importKey('raw', te.encode(cleanPass(pass)), 'PBKDF2', false, ['deriveKey']);
  return subtle().deriveKey({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: rounds }, base, { name: 'AES-GCM', length: 256 }, false, ['wrapKey', 'unwrapKey']);
}
// A new data key and its vault, locked by the pass. → { key, vault }
export async function makeVault(pass, { rounds = PASS_ROUNDS } = {}) {
  const key = await subtle().generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  return { key, vault: { v: 1, id: b64(random(9)), ...(await lockKey(key, pass, rounds)) } };
}
// The data key locked by `pass`, a salt of its own each time. → { rounds, salt, iv, pass }
async function lockKey(key, pass, rounds = PASS_ROUNDS) {
  const salt = random(16);
  const iv = random(12);
  const kek = await passKey(pass, salt, rounds);
  return { rounds, salt: b64(salt), iv: b64(iv), pass: b64(await subtle().wrapKey('raw', key, kek, { name: 'AES-GCM', iv })) };
}
// The same vault, its key locked by a new pass (更換通行碼).
export const relock = async (key, vault, pass) => ({ ...vault, ...(await lockKey(key, pass, vault.rounds || PASS_ROUNDS)) });
// The vault opened with the pass: the data key, or null (a wrong pass, or a vault another pass locked).
export async function openVault(vault, pass) {
  if (!vault?.pass || !vault.salt || !vault.iv) return null;
  try {
    const kek = await passKey(pass, unb64(vault.salt), vault.rounds || PASS_ROUNDS);
    return await subtle().unwrapKey('raw', unb64(vault.pass), kek, { name: 'AES-GCM', iv: unb64(vault.iv) }, { name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  } catch {
    return null;
  }
}

// ---- An app's data ----
export async function seal(key, vaultId, payload) {
  const iv = random(12);
  const packed = await pipe(te.encode(payload), new CompressionStream('gzip'));
  return `${PREFIX}${vaultId}:${b64(iv)}:${b64(await subtle().encrypt({ name: 'AES-GCM', iv }, key, packed))}`;
}
// → the app's payload, or null when this key doesn't open it.
export async function unseal(key, payload) {
  const [, , iv, data] = payload.split(':');
  try {
    const packed = new Uint8Array(await subtle().decrypt({ name: 'AES-GCM', iv: unb64(iv) }, key, unb64(data)));
    return td.decode(await pipe(packed, new DecompressionStream('gzip')));
  } catch {
    return null;
  }
}

// ---- The key on this device (IndexedDB; in memory where there's none) ----
const DB = 'orbit-vault';
const mem = new Map();
function db() {
  if (!globalThis.indexedDB) return null;
  return new Promise(res => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => r.result.createObjectStore('keys');
    r.onsuccess = () => res(r.result);
    r.onerror = () => res(null);
  });
}
const tx = async (mode, fn) => {
  const d = await db();
  if (!d) return null;
  return new Promise(res => {
    const t = d.transaction('keys', mode);
    const req = fn(t.objectStore('keys'));
    t.oncomplete = () => res(req?.result ?? null);
    t.onerror = () => res(null);
  });
};
// The key of a vault, by the vault's id (an account's id moves with a new
// pass; its vault doesn't). → the key or null.
export async function heldKey(id) {
  if (!id) return null;
  if (mem.has(id)) return mem.get(id);
  const got = await tx('readonly', s => s.get(id)).catch(() => null);
  if (got) mem.set(id, got);
  return got || null;
}
export async function holdKey(id, key) {
  if (!id || !key) return;
  mem.set(id, key);
  await tx('readwrite', s => s.put(key, id)).catch(() => null);
}
// Signed out (wipeDevice): every key on this device forgotten.
export async function forgetKeys() {
  mem.clear();
  await tx('readwrite', s => s.clear()).catch(() => null);
}
