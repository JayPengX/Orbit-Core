// ---- webauthn.js ----
// Passkeys (WebAuthn level 3): what a browser sends when a passkey is made
// or used, checked here with WebCrypto only. Attestation is 'none' (nobody's
// hardware is vouched for, only the key itself is kept), so a registration
// is the key read out of `attestationObject`, and a sign-in is that key's
// signature over the authenticator's data and the hash of the client's data.
//
//   ES256  (-7)    P-256 ECDSA, what iCloud Keychain, Google Password
//                  Manager, Windows Hello and most security keys make
//   EdDSA  (-8)    Ed25519, some security keys
//   RS256  (-257)  RSA PKCS#1 v1.5, older Windows Hello
//
// Everything a browser sends is base64url. A check that fails throws an
// Error whose `code` says which (the Worker answers ECO_PASSKEY_INVALID).

const enc = new TextEncoder();
export const ALGS = [-7, -8, -257];

export function b64url(bytes) {
  let s = '';
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function unb64url(text) {
  if (typeof text !== 'string' || !/^[A-Za-z0-9_-]*$/.test(text)) throw fail('base64');
  const s = atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4));
  return Uint8Array.from(s, c => c.charCodeAt(0));
}
const fail = code => Object.assign(new Error(`passkey: ${code}`), { code });
const sha256 = async bytes => new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

// ---- CBOR (RFC 8949): only what attestation objects and COSE keys use ----------

export function cborDecode(bytes, at = 0, depth = 0) {
  if (depth > 8) throw fail('cbor');
  const need = n => {
    if (at + n > bytes.length) throw fail('cbor');
  };
  need(1);
  const head = bytes[at++];
  const major = head >> 5;
  const info = head & 31;
  let len;
  if (info < 24) len = info;
  else if (info <= 27) {
    const n = 1 << (info - 24);
    need(n);
    len = 0;
    for (let i = 0; i < n; i++) len = len * 256 + bytes[at++];
  } else throw fail('cbor');
  switch (major) {
    case 0:
      return [len, at];
    case 1:
      return [-1 - len, at];
    case 2:
      need(len);
      return [bytes.slice(at, at + len), at + len];
    case 3:
      need(len);
      return [new TextDecoder().decode(bytes.slice(at, at + len)), at + len];
    case 4: {
      const out = [];
      for (let i = 0; i < len; i++) {
        const [v, next] = cborDecode(bytes, at, depth + 1);
        out.push(v);
        at = next;
      }
      return [out, at];
    }
    case 5: {
      const out = new Map();
      for (let i = 0; i < len; i++) {
        const [k, a] = cborDecode(bytes, at, depth + 1);
        const [v, b] = cborDecode(bytes, a, depth + 1);
        out.set(k, v);
        at = b;
      }
      return [out, at];
    }
    case 7:
      if (info === 20) return [false, at];
      if (info === 21) return [true, at];
      if (info === 22) return [null, at];
      throw fail('cbor');
    default:
      // (Tags never appear in these.)
      throw fail('cbor');
  }
}

// ---- Authenticator data -----------------------------------------------------------

export function parseAuthData(bytes) {
  if (bytes.length < 37) throw fail('authdata');
  const f = bytes[32];
  const out = {
    rpIdHash: bytes.slice(0, 32),
    up: Boolean(f & 0x01),
    uv: Boolean(f & 0x04),
    // Backup eligible / backed up: a passkey synced by its provider (iCloud
    // Keychain, Google Password Manager), not one bound to a single chip.
    be: Boolean(f & 0x08),
    bs: Boolean(f & 0x10),
    signCount: ((bytes[33] << 24) >>> 0) + (bytes[34] << 16) + (bytes[35] << 8) + bytes[36]
  };
  if (f & 0x40) {
    if (bytes.length < 55) throw fail('authdata');
    out.aaguid = [...bytes.slice(37, 53)].map(b => b.toString(16).padStart(2, '0')).join('').replace(/^(.{8})(.{4})(.{4})(.{4})/, '$1-$2-$3-$4-');
    const idLen = (bytes[53] << 8) + bytes[54];
    if (idLen < 1 || idLen > 1023 || 55 + idLen > bytes.length) throw fail('authdata');
    out.credentialId = bytes.slice(55, 55 + idLen);
    const [key, end] = cborDecode(bytes, 55 + idLen);
    if (!(key instanceof Map)) throw fail('cose');
    out.coseKey = key;
    out.rest = bytes.length - end;
  }
  return out;
}

// A COSE key as a JWK WebCrypto imports (what's kept for the passkey).
export function coseToJwk(key) {
  const kty = key.get(1);
  const alg = key.get(3);
  const bytes = k => {
    const v = key.get(k);
    if (!(v instanceof Uint8Array)) throw fail('cose');
    return v;
  };
  if (kty === 2 && alg === -7 && key.get(-1) === 1) {
    const [x, y] = [bytes(-2), bytes(-3)];
    if (x.length !== 32 || y.length !== 32) throw fail('cose');
    return { alg, jwk: { kty: 'EC', crv: 'P-256', x: b64url(x), y: b64url(y) } };
  }
  if (kty === 1 && alg === -8 && key.get(-1) === 6) {
    const x = bytes(-2);
    if (x.length !== 32) throw fail('cose');
    return { alg, jwk: { kty: 'OKP', crv: 'Ed25519', x: b64url(x) } };
  }
  if (kty === 3 && alg === -257) {
    const [n, e] = [bytes(-1), bytes(-2)];
    if (n.length < 256 || n.length > 512) throw fail('cose');
    return { alg, jwk: { kty: 'RSA', n: b64url(n), e: b64url(e) } };
  }
  throw fail('alg');
}

const IMPORT = {
  [-7]: [{ name: 'ECDSA', namedCurve: 'P-256' }, { name: 'ECDSA', hash: 'SHA-256' }],
  [-8]: [{ name: 'Ed25519' }, { name: 'Ed25519' }],
  [-257]: [{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, { name: 'RSASSA-PKCS1-v1_5' }]
};

// ECDSA's DER signature (SEQUENCE { r, s }) as the 64 raw bytes WebCrypto checks.
export function derToRaw(der) {
  const bad = () => fail('signature');
  if (der[0] !== 0x30 || der.length < 8) throw bad();
  let at = der[1] & 0x80 ? 2 + (der[1] & 0x7f) : 2;
  const int = () => {
    if (der[at] !== 0x02) throw bad();
    const len = der[at + 1];
    let v = der.slice(at + 2, at + 2 + len);
    at += 2 + len;
    while (v.length > 32 && v[0] === 0) v = v.slice(1);
    if (v.length > 32 || !v.length) throw bad();
    const out = new Uint8Array(32);
    out.set(v, 32 - v.length);
    return out;
  };
  const r = int();
  const s = int();
  const out = new Uint8Array(64);
  out.set(r);
  out.set(s, 32);
  return out;
}

// ---- The client's data --------------------------------------------------------------

// `origins(origin)`: the RP ID this Worker takes for that page, else null. → { rpId, hash }
async function clientData(text, type, challenge, origins) {
  const bytes = unb64url(text);
  if (bytes.length > 4096) throw fail('client');
  let c;
  try {
    c = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw fail('client');
  }
  if (c?.type !== type) throw fail('type');
  if (typeof c.challenge !== 'string' || c.challenge !== challenge) throw fail('challenge');
  // (In a frame on another site: never one of ours.)
  if (c.crossOrigin === true) throw fail('origin');
  const rpId = typeof c.origin === 'string' ? origins(c.origin) : null;
  if (!rpId) throw fail('origin');
  return { rpId, hash: await sha256(bytes) };
}

// A passkey made: { id, alg, jwk, signCount, be, bs, aaguid }.
// `challenge`: the one handed out (the string in clientData). `uv`: user
// verification (Face ID, a PIN) required.
export async function verifyRegistration({ id, clientDataJSON, attestationObject }, { challenge, origins, uv = true }) {
  const { rpId } = await clientData(clientDataJSON, 'webauthn.create', challenge, origins);
  const att = unb64url(attestationObject);
  if (att.length > 16_384) throw fail('attestation');
  const [obj] = cborDecode(att);
  if (!(obj instanceof Map) || !(obj.get('authData') instanceof Uint8Array)) throw fail('attestation');
  const a = parseAuthData(obj.get('authData'));
  if (!same(a.rpIdHash, await sha256(enc.encode(rpId)))) throw fail('rp');
  if (!a.up) throw fail('presence');
  if (uv && !a.uv) throw fail('verification');
  if (!a.credentialId) throw fail('authdata');
  const credId = b64url(a.credentialId);
  if (id !== undefined && id !== credId) throw fail('id');
  const { alg, jwk } = coseToJwk(a.coseKey);
  // (The key must import: a malformed point is refused now, not at sign-in.)
  await crypto.subtle.importKey('jwk', jwk, IMPORT[alg][0], false, ['verify']);
  return { id: credId, alg, jwk, signCount: a.signCount, be: a.be, bs: a.bs, aaguid: a.aaguid, rpId };
}

// A passkey used: the signature checked with the key kept for it.
// → { signCount, uv, bs }
export async function verifyAssertion({ clientDataJSON, authenticatorData, signature }, { challenge, origins, key, uv = true }) {
  const { rpId, hash } = await clientData(clientDataJSON, 'webauthn.get', challenge, origins);
  const data = unb64url(authenticatorData);
  if (data.length > 4096) throw fail('authdata');
  const a = parseAuthData(data);
  if (!same(a.rpIdHash, await sha256(enc.encode(rpId)))) throw fail('rp');
  if (!a.up) throw fail('presence');
  if (uv && !a.uv) throw fail('verification');
  const [importAs, verifyAs] = IMPORT[key.alg] || [];
  if (!importAs) throw fail('alg');
  const pub = await crypto.subtle.importKey('jwk', key.jwk, importAs, false, ['verify']);
  let sig = unb64url(signature);
  if (key.alg === -7) sig = derToRaw(sig);
  const signed = new Uint8Array(data.length + hash.length);
  signed.set(data);
  signed.set(hash, data.length);
  if (!(await crypto.subtle.verify(verifyAs, pub, sig, signed))) throw fail('signature');
  return { signCount: a.signCount, uv: a.uv, bs: a.bs };
}

// Which provider made a passkey, by its AAGUID (the ones people here use;
// any other is named by the device it was made on).
export const PROVIDERS = {
  'fbfc3007-154e-4ecc-8c0b-6e020557d7bd': 'icloud',
  'dd4ec289-e01d-41c9-bb89-70fa845d4bf2': 'icloud',
  'ea9b8d66-4d01-1d21-3ce4-b6b48cb575d4': 'google',
  'adce0002-35bc-c60a-648b-0b25f1f05503': 'chrome-mac',
  '08987058-cadc-4b81-b6e1-30de50dcbe96': 'windows',
  '9ddd1817-af5a-4672-a2b9-3e3dd95000a9': 'windows',
  '6028b017-b1d4-4c02-b4b3-afcdafc96bb2': 'windows',
  '53414d53-554e-4700-0000-000000000000': 'samsung',
  'bada5566-a7aa-401f-bd96-45619a55120d': '1password',
  'd548826e-79b4-db40-a3d8-11116f7e8349': 'bitwarden',
  '531126d6-e717-415c-9320-3d9aa6981239': 'dashlane',
  'b84e4048-15dc-4dd0-8640-f4f60813c8af': 'nordpass',
  '0ea242b4-43c4-4a1b-8b17-dd6d0b6baec6': 'keeper'
};
