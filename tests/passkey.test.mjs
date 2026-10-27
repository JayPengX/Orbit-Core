// Passkeys: real keys made here (P-256, Ed25519, RSA) signing the way an
// authenticator does, against /eco on an in-memory store.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash, webcrypto } from 'node:crypto';
import { handleEcoRequest, passKey, WALLET_COLLECTION } from '../eco.js';
import { PASSKEY_COLLECTION, RP_ID } from '../passkey.js';
import { cborDecode, parseAuthData, derToRaw, b64url, unb64url } from '../webauthn.js';
import { planClean } from '../eco-admin.js';

const ORIGIN = 'https://orbit.jaypengx.com';

function setup() {
  const store = new Map();
  let clock = 1_800_000_000_000;
  let n = 0;
  let codeN = 0;
  const key = (c, id) => `${c}/${id}`;
  const deps = {
    json: (data, status) => ({ status, data }),
    errorJson: (code, status) => ({ status, data: { error: { code } } }),
    upstreamFailed: error => ({ status: 502, data: { error: { code: 'UPSTREAM_FAILED', message: error.message } } }),
    readJsonBody: req => Promise.resolve(req.body),
    INVALID_BODY: Symbol('bad'),
    rateLimitResponse: async () => null,
    fsGet: async (env, c, id) => {
      const d = store.get(key(c, id));
      return d ? { exists: true, ...d } : { exists: false, payload: '', updateTime: '' };
    },
    fsWrite: async (env, c, id, payload, pre) => {
      const had = store.get(key(c, id));
      if (pre?.exists === false && had) throw Object.assign(new Error('exists'), { precondition: true });
      if (pre?.updateTime && had?.updateTime !== pre.updateTime) throw Object.assign(new Error('stale'), { precondition: true });
      const d = { payload, updateTime: `u${++n}` };
      store.set(key(c, id), d);
      return { updateTime: d.updateTime };
    },
    fsDelete: async (env, c, id) => void store.delete(key(c, id)),
    fsList: async (env, c) => [...store.entries()].filter(([k]) => k.startsWith(`${c}/`)).map(([k, d]) => ({ id: k.slice(c.length + 1), payload: d.payload, updateTime: d.updateTime })),
    fsCollections: async () => [...new Set([...store.keys()].map(k => k.split('/')[0]))],
    fsBatch: async () => {},
    sha256Hex: async text => createHash('sha256').update(text).digest('hex'),
    generateCode: len => {
      codeN++;
      const a = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
      return Array.from({ length: len }, (_, i) => a[(codeN * 7 + i * 13) % 32]).join('');
    },
    now: () => (clock += 1000)
  };
  const env = { STORE: {}, ECO_TOKEN_SECRET: 'test-secret', ECO_OPEN_SIGNUP: 'on', ECO_ADMIN_TOKEN: 'o'.repeat(40) };
  const post = body => handleEcoRequest({ method: 'POST', url: 'https://w/eco', body }, env, {}, '1.1.1.1', deps);
  return { store, deps, env, post, advance: ms => (clock += ms) };
}

// ---- A software authenticator ----------------------------------------------------

function cbor(v) {
  const head = (major, len) => {
    if (len < 24) return [(major << 5) | len];
    if (len < 256) return [(major << 5) | 24, len];
    if (len < 65536) return [(major << 5) | 25, len >> 8, len & 255];
    return [(major << 5) | 26, (len >>> 24) & 255, (len >> 16) & 255, (len >> 8) & 255, len & 255];
  };
  if (typeof v === 'number') return Uint8Array.from(v >= 0 ? head(0, v) : head(1, -1 - v));
  if (typeof v === 'string') {
    const b = new TextEncoder().encode(v);
    return Uint8Array.from([...head(3, b.length), ...b]);
  }
  if (v instanceof Uint8Array) return Uint8Array.from([...head(2, v.length), ...v]);
  if (v instanceof Map) {
    const parts = [Uint8Array.from(head(5, v.size))];
    for (const [k, x] of v) parts.push(cbor(k), cbor(x));
    return concat(...parts);
  }
  throw new Error('cbor: ' + typeof v);
}
const concat = (...parts) => {
  const out = new Uint8Array(parts.reduce((a, p) => a + p.length, 0));
  let at = 0;
  for (const p of parts) out.set(p, (at += p.length) - p.length);
  return out;
};
const sha = bytes => new Uint8Array(createHash('sha256').update(bytes).digest());
// DER from raw r||s (what a real authenticator sends for ES256).
function rawToDer(raw) {
  const int = b => {
    let i = 0;
    while (i < b.length - 1 && b[i] === 0) i++;
    b = b.slice(i);
    if (b[0] & 0x80) b = concat(Uint8Array.of(0), b);
    return concat(Uint8Array.of(2, b.length), b);
  };
  const body = concat(int(raw.slice(0, 32)), int(raw.slice(32)));
  return concat(Uint8Array.of(0x30, body.length), body);
}

async function authenticator({ alg = -7, rpId = RP_ID, flags = 0x05 | 0x08 | 0x10, aaguid = 'fbfc3007-154e-4ecc-8c0b-6e020557d7bd', counter = 0 } = {}) {
  const spec = { [-7]: { name: 'ECDSA', namedCurve: 'P-256' }, [-8]: { name: 'Ed25519' }, [-257]: { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: Uint8Array.of(1, 0, 1), hash: 'SHA-256' } }[alg];
  const pair = await webcrypto.subtle.generateKey(spec, true, ['sign', 'verify']);
  const jwk = await webcrypto.subtle.exportKey('jwk', pair.publicKey);
  const cose =
    alg === -7
      ? new Map([[1, 2], [3, -7], [-1, 1], [-2, unb64url(jwk.x)], [-3, unb64url(jwk.y)]])
      : alg === -8
        ? new Map([[1, 1], [3, -8], [-1, 6], [-2, unb64url(jwk.x)]])
        : new Map([[1, 3], [3, -257], [-1, unb64url(jwk.n)], [-2, unb64url(jwk.e)]]);
  const credId = webcrypto.getRandomValues(new Uint8Array(20));
  const id = b64url(credId);
  let count = counter;
  const guid = Uint8Array.from(aaguid.replace(/-/g, '').match(/../g).map(h => parseInt(h, 16)));
  const data = (type, challenge, origin) => new TextEncoder().encode(JSON.stringify({ type, challenge, origin, crossOrigin: false }));
  return {
    id,
    create(challenge, { origin = ORIGIN, rp = rpId, f = flags | 0x40 } = {}) {
      const authData = concat(sha(new TextEncoder().encode(rp)), Uint8Array.of(f), Uint8Array.of(0, 0, 0, count), guid, Uint8Array.of(0, credId.length), credId, cbor(cose));
      return { id, clientDataJSON: b64url(data('webauthn.create', challenge, origin)), attestationObject: b64url(cbor(new Map([['fmt', 'none'], ['attStmt', new Map()], ['authData', authData]]))) };
    },
    async get(challenge, { origin = ORIGIN, rp = rpId, f = flags, step = counter ? 1 : 0 } = {}) {
      count += step;
      const authData = concat(sha(new TextEncoder().encode(rp)), Uint8Array.of(f), Uint8Array.of((count >>> 24) & 255, (count >> 16) & 255, (count >> 8) & 255, count & 255));
      const client = data('webauthn.get', challenge, origin);
      const signed = concat(authData, sha(client));
      const algo = alg === -7 ? { name: 'ECDSA', hash: 'SHA-256' } : alg === -8 ? { name: 'Ed25519' } : { name: 'RSASSA-PKCS1-v1_5' };
      let sig = new Uint8Array(await webcrypto.subtle.sign(algo, pair.privateKey, signed));
      if (alg === -7) sig = rawToDer(sig);
      return { id, clientDataJSON: b64url(client), authenticatorData: b64url(authData), signature: b64url(sig), userHandle: '' };
    }
  };
}

async function signedIn(t) {
  const made = await t.post({ op: 'create', app: 'stock' });
  assert.equal(made.status, 200);
  return made.data;
}
async function addKey(t, acct, a, extra = {}) {
  const begin = await t.post({ op: 'passkey-add-begin', qt: acct.token });
  assert.equal(begin.status, 200);
  return t.post({ op: 'passkey-add', qt: acct.token, challenge: begin.data.challenge, credential: a.create(begin.data.challenge, extra), device: 'iPhone' });
}
async function login(t, a, extra = {}) {
  const begin = await t.post({ op: 'passkey-begin' });
  return t.post({ op: 'passkey-login', app: 'match', challenge: begin.data.challenge, credential: await a.get(begin.data.challenge, extra) });
}

// ---- The tests ------------------------------------------------------------------

test('CBOR and DER: what authenticators send reads back', () => {
  const m = cborDecode(cbor(new Map([['a', 1], [-2, Uint8Array.of(1, 2)], [3, -257]])))[0];
  assert.equal(m.get('a'), 1);
  assert.deepEqual([...m.get(-2)], [1, 2]);
  assert.equal(m.get(3), -257);
  const raw = Uint8Array.from({ length: 64 }, (_, i) => (i === 0 || i === 32 ? 0x80 : i));
  assert.deepEqual([...derToRaw(rawToDer(raw))], [...raw]);
  assert.throws(() => cborDecode(Uint8Array.of(0x5a, 0, 0, 1)), /cbor/);
  assert.throws(() => parseAuthData(new Uint8Array(10)), /authdata/);
});

for (const alg of [-7, -8, -257])
  test(`a passkey (${alg}) made on a signed-in Pass signs in on a new device`, async () => {
    const t = setup();
    const acct = await signedIn(t);
    const a = await authenticator({ alg });
    const added = await addKey(t, acct, a);
    assert.equal(added.status, 200, JSON.stringify(added.data));
    assert.equal(added.data.wallet.passkeys.length, 1);
    const [k] = added.data.wallet.passkeys;
    assert.deepEqual({ via: k.via, on: k.on, sync: k.sync }, { via: 'icloud', on: 'iPhone', sync: true });
    // The apps never see a key.
    assert.equal(JSON.stringify(added.data.wallet).includes('jwk'), false);
    const res = await login(t, a);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.ok(res.data.token && res.data.refresh);
    assert.equal(res.data.passcode, undefined);
    assert.ok(res.data.wallet.passkeys[0].used > 0);
    // The pass still signs in too.
    assert.equal((await t.post({ op: 'login', passcode: acct.passcode, app: 'vocab' })).status, 200);
  });

test('several passkeys per Pass, each removed on its own', async () => {
  const t = setup();
  const acct = await signedIn(t);
  const phone = await authenticator();
  const pc = await authenticator({ aaguid: '08987058-cadc-4b81-b6e1-30de50dcbe96', flags: 0x05 });
  await addKey(t, acct, phone);
  const two = await addKey(t, acct, pc);
  assert.deepEqual(two.data.wallet.passkeys.map(k => k.via), ['icloud', 'windows']);
  assert.equal(two.data.wallet.passkeys[1].sync, false);
  // The same key twice: refused.
  const again = await addKey(t, acct, pc);
  assert.equal(again.data.error.code, 'ECO_PASSKEY_TAKEN');
  const gone = await t.post({ op: 'passkey-remove', qt: acct.token, id: phone.id });
  assert.deepEqual(gone.data.wallet.passkeys.map(k => k.id), [pc.id]);
  assert.equal((await login(t, phone)).data.error.code, 'ECO_PASSKEY_UNKNOWN');
  assert.equal((await login(t, pc)).status, 200);
});

test('a forged or misplaced passkey never signs in', async () => {
  const t = setup();
  const acct = await signedIn(t);
  const a = await authenticator();
  await addKey(t, acct, a);
  // Another site's page, another RP, no Face ID, no touch.
  for (const extra of [{ origin: 'https://longshot.jaypengx.com' }, { origin: 'https://evil.example' }, { rp: 'evil.example' }, { f: 0x01 }, { f: 0x04 }]) assert.equal((await login(t, a, extra)).data.error.code, 'ECO_PASSKEY_INVALID', JSON.stringify(extra));
  // A key of the same id but not the one kept.
  const other = await authenticator();
  const begin = await t.post({ op: 'passkey-begin' });
  const forged = { ...(await other.get(begin.data.challenge)), id: a.id };
  assert.equal((await t.post({ op: 'passkey-login', app: 'stock', challenge: begin.data.challenge, credential: forged })).data.error.code, 'ECO_PASSKEY_INVALID');
  // A challenge of our own but not the one signed; one run out; a handoff's.
  const b2 = await t.post({ op: 'passkey-begin' });
  assert.equal((await t.post({ op: 'passkey-login', app: 'stock', challenge: b2.data.challenge, credential: await a.get(begin.data.challenge) })).data.error.code, 'ECO_PASSKEY_INVALID');
  const late = await t.post({ op: 'passkey-begin' });
  t.advance(6 * 60_000);
  assert.equal((await t.post({ op: 'passkey-login', app: 'stock', challenge: late.data.challenge, credential: await a.get(late.data.challenge) })).data.error.code, 'ECO_PASSKEY_EXPIRED');
  const hand = await t.post({ op: 'handoff', qt: (await t.post({ op: 'login', passcode: acct.passcode, app: 'stock' })).data.token });
  assert.equal((await t.post({ op: 'passkey-login', app: 'stock', challenge: hand.data.handoff, credential: await a.get(hand.data.handoff) })).data.error.code, 'ECO_PASSKEY_EXPIRED');
  // …and a passkey challenge is no handoff.
  assert.equal((await t.post({ op: 'redeem', handoff: begin.data.challenge, app: 'stock' })).data.error.code, 'ECO_HANDOFF_EXPIRED');
});

test('a counting key that counts back is refused (a cloned key)', async () => {
  const t = setup();
  const acct = await signedIn(t);
  const a = await authenticator({ counter: 5, flags: 0x05 });
  await addKey(t, acct, a);
  assert.equal((await login(t, a)).status, 200);
  assert.equal((await login(t, a, { step: 0 })).data.error.code, 'ECO_PASSKEY_INVALID');
  assert.equal((await login(t, a, { step: -3 })).data.error.code, 'ECO_PASSKEY_INVALID');
});

test('adding needs a live session of that account, made for it', async () => {
  const t = setup();
  const one = await signedIn(t);
  const two = await signedIn(t);
  const a = await authenticator();
  const begin = await t.post({ op: 'passkey-add-begin', qt: one.token });
  // One account's challenge, sent with the other's session.
  assert.equal((await t.post({ op: 'passkey-add', qt: two.token, challenge: begin.data.challenge, credential: a.create(begin.data.challenge) })).data.error.code, 'ECO_PASSKEY_EXPIRED');
  assert.equal((await t.post({ op: 'passkey-add-begin', qt: 'nope' })).status, 401);
  // Signed out everywhere after the challenge: refused.
  await t.post({ op: 'signout-all', qt: one.token });
  assert.equal((await t.post({ op: 'passkey-add', qt: one.token, challenge: begin.data.challenge, credential: a.create(begin.data.challenge) })).status, 401);
  // No user verification: refused.
  const fresh = (await t.post({ op: 'login', passcode: one.passcode, app: 'stock' })).data;
  const b2 = await t.post({ op: 'passkey-add-begin', qt: fresh.token });
  assert.equal((await t.post({ op: 'passkey-add', qt: fresh.token, challenge: b2.data.challenge, credential: a.create(b2.data.challenge, { f: 0x41 }) })).data.error.code, 'ECO_PASSKEY_INVALID');
});

test('passkeys follow the account: a new pass, a merge, a deleted account', async () => {
  const t = setup();
  const acct = await signedIn(t);
  const a = await authenticator();
  await addKey(t, acct, a);
  // A new pass: the passkey signs in to it.
  const rotated = await t.post({ op: 'rotate', qt: acct.token });
  assert.equal(rotated.status, 200);
  const signed = await login(t, a);
  assert.equal(signed.status, 200);
  assert.equal(signed.data.wallet.passkeys.length, 1);
  // Merged into another pass: it signs in there.
  const target = await signedIn(t);
  const merged = await t.post({ op: 'merge', qt: target.token, sources: [{ passcode: rotated.data.passcode }] });
  assert.equal(merged.status, 200, JSON.stringify(merged.data));
  const there = await login(t, a);
  assert.equal(there.status, 200);
  assert.equal(there.data.refresh.length > 0, true);
  const targetId = await passKey(t.env, target.passcode);
  assert.equal(JSON.parse([...t.store.entries()].find(([k]) => k.startsWith(`${PASSKEY_COLLECTION}/`))[1].payload).d, targetId);
  // Deleted: its finder goes too.
  await handleEcoRequest({ method: 'DELETE', url: `https://w/eco?qt=${encodeURIComponent(there.data.token)}`, body: null }, t.env, {}, '1.1.1.1', t.deps);
  assert.equal([...t.store.keys()].some(k => k.startsWith(`${PASSKEY_COLLECTION}/`)), false);
  assert.equal((await login(t, a)).data.error.code, 'ECO_PASSKEY_UNKNOWN');
});

test('the admin clean-up drops a finder whose key is gone, keeps the rest', async () => {
  const t = setup();
  const acct = await signedIn(t);
  const a = await authenticator();
  await addKey(t, acct, a);
  const id = await passKey(t.env, acct.passcode);
  t.store.set(`${PASSKEY_COLLECTION}/stray`, { payload: JSON.stringify({ d: id, id: 'nope' }), updateTime: 'x' });
  const plan = await planClean(t.env, t.deps);
  assert.deepEqual(plan.deletes.filter(([c]) => c === PASSKEY_COLLECTION), [[PASSKEY_COLLECTION, 'stray']]);
  assert.ok(t.store.has(`${WALLET_COLLECTION}/${id}`));
});

test('the pass: new ones are found by a peppered, slow id; old ones by their SHA-256', async () => {
  const t = setup();
  const acct = await signedIn(t);
  const sha = createHash('sha256').update(acct.passcode).digest('hex');
  const id = await passKey(t.env, acct.passcode);
  assert.notEqual(id, sha);
  assert.ok(t.store.has(`${WALLET_COLLECTION}/${id}`));
  assert.equal(t.store.has(`${WALLET_COLLECTION}/${sha}`), false);
  // Another secret, another id: the database alone finds nothing.
  assert.notEqual(await passKey({ ECO_TOKEN_SECRET: 'other' }, acct.passcode), id);
  // An account from before: still signs in by its old id.
  const old = 'ABCDEFGHJK';
  const oldId = createHash('sha256').update(old).digest('hex');
  t.store.set(`${WALLET_COLLECTION}/${oldId}`, t.store.get(`${WALLET_COLLECTION}/${id}`));
  const res = await t.post({ op: 'login', passcode: old, app: 'stock' });
  assert.equal(res.status, 200);
  assert.equal(JSON.parse(atob(res.data.refresh.split('.')[0].replace(/-/g, '+').replace(/_/g, '/'))).d, oldId);
  assert.equal((await t.post({ op: 'login', passcode: 'ZZZZZZZZZZ', app: 'stock' })).status, 404);
});
