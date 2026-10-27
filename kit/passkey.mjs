// Passkeys in the browser: made and used through WebAuthn, checked by the
// Worker (Orbit-Core passkey.js, webauthn.js). One passkey serves every
// Orbit app and the admin page: its RP ID is the domain itself.
//
// Any browser that has WebAuthn (Safari and home-screen apps on iOS 16+,
// Chrome, Edge, Firefox, Samsung Internet) can use one: the phone's own,
// a computer's (Touch ID, Windows Hello), a password manager's, a security
// key, or a phone's over a QR code (the browser offers that itself). On a
// page that can't, passkeyHere() is false and only the pass shows.
//
// Safari lets a page ask for a passkey only during a tap: the challenge is
// fetched before (prefetch), so the tap goes straight to the browser.

import { DOMAIN } from './domain.mjs';

const host = () => globalThis.location?.hostname || '';
const local = () => host() === 'localhost';
export const rpId = () => (local() ? 'localhost' : DOMAIN);

export function passkeyHere() {
  const h = host();
  return typeof globalThis.PublicKeyCredential === 'function' && Boolean(globalThis.navigator?.credentials?.create) && globalThis.isSecureContext !== false && (local() || (Boolean(DOMAIN) && (h === DOMAIN || h.endsWith(`.${DOMAIN}`))));
}

const b64url = buf => {
  let s = '';
  for (const b of new Uint8Array(buf)) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};
const bytes = text => Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/') + '==='.slice((text.length + 3) % 4)), c => c.charCodeAt(0));

// The device this is, named as the Pass sheet shows it.
export function deviceName(nav = globalThis.navigator) {
  const ua = nav?.userAgent || '';
  if (/iPhone|iPod/.test(ua)) return 'iPhone';
  if (/iPad/.test(ua) || (/Macintosh/.test(ua) && nav?.maxTouchPoints > 1)) return 'iPad';
  if (/Android/.test(ua)) return 'Android';
  if (/CrOS/.test(ua)) return 'ChromeOS';
  if (/Windows/.test(ua)) return 'Windows';
  if (/Macintosh|Mac OS X/.test(ua)) return 'Mac';
  if (/Linux/.test(ua)) return 'Linux';
  return '';
}

// Who keeps a passkey, by the provider the Worker read from it.
export const PROVIDER_NAMES = {
  icloud: ['iCloud 鑰匙圈', 'iCloud Keychain'],
  google: ['Google 密碼管理工具', 'Google Password Manager'],
  'chrome-mac': ['Mac 上的 Chrome', 'Chrome on Mac'],
  windows: ['Windows Hello', 'Windows Hello'],
  samsung: ['Samsung Pass', 'Samsung Pass'],
  '1password': ['1Password', '1Password'],
  bitwarden: ['Bitwarden', 'Bitwarden'],
  dashlane: ['Dashlane', 'Dashlane'],
  nordpass: ['NordPass', 'NordPass'],
  keeper: ['Keeper', 'Keeper']
};
export function passkeyName(k, lang) {
  const en = lang === 'en';
  const p = PROVIDER_NAMES[k.via];
  if (p) return en ? p[1] : p[0];
  if (k.on) return en ? `Passkey on ${k.on}` : `${k.on} 上的通行密鑰`;
  return en ? 'Passkey' : '通行密鑰';
}

// A passkey made from the Worker's `passkey-add-begin` answer → what
// `passkey-add` takes.
export async function makePasskey(begin, { signal } = {}) {
  const cred = await navigator.credentials.create({
    signal,
    publicKey: {
      rp: { id: rpId(), name: 'Orbit' },
      user: { id: bytes(begin.user.id), name: begin.user.name, displayName: begin.user.displayName },
      challenge: bytes(begin.challenge),
      pubKeyCredParams: [-7, -8, -257].map(alg => ({ type: 'public-key', alg })),
      // Kept on the device or its password manager (so the browser lists it
      // at sign-in without a name typed), unlocked by Face ID or the like.
      authenticatorSelection: { residentKey: 'required', requireResidentKey: true, userVerification: 'required' },
      excludeCredentials: (begin.exclude || []).map(id => ({ type: 'public-key', id: bytes(id) })),
      attestation: 'none',
      timeout: 120_000
    }
  });
  const r = cred.response;
  return { id: b64url(cred.rawId), clientDataJSON: b64url(r.clientDataJSON), attestationObject: b64url(r.attestationObject), transports: r.getTransports?.() || [] };
}

// A passkey used with the Worker's `passkey-begin` challenge → what
// `passkey-login` takes. Any of ours the browser has (or a phone's, by QR).
// `conditional`: offered in the keyboard's suggestions instead of a sheet
// (it waits until one is picked, or `signal` stops it).
export async function usePasskey(challenge, { signal, conditional = false } = {}) {
  const cred = await navigator.credentials.get({
    signal,
    ...(conditional ? { mediation: 'conditional' } : {}),
    publicKey: { rpId: rpId(), challenge: bytes(challenge), userVerification: 'required', timeout: 120_000 }
  });
  const r = cred.response;
  return { id: b64url(cred.rawId), clientDataJSON: b64url(r.clientDataJSON), authenticatorData: b64url(r.authenticatorData), signature: b64url(r.signature), userHandle: r.userHandle ? b64url(r.userHandle) : '' };
}

// A passkey Orbit no longer takes (removed, or its account gone): the
// browser's password manager is told to forget it, where it can be.
export function forgetPasskey(id) {
  try {
    globalThis.PublicKeyCredential?.signalUnknownCredential?.({ rpId: rpId(), credentialId: id })?.catch?.(() => {});
  } catch {}
}

// The person closed the browser's sheet (or it timed out): nothing to say.
export const cancelled = error => error?.name === 'NotAllowedError' || error?.name === 'AbortError';
