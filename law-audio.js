// ---- law-audio.js: GET /law-audio?drive=<id>, a 代表會's recording on Google Drive played inside Orbit Law ----
// Drive hands a shared recording to anyone, ranges and all, but calls an .m4a "audio/mpeg", and Safari (the
// iPhone) won't play an MP4 it was told is an MP3: the player gave up and sent the reader out to Drive. Here
// the same bytes, the Range asked for passed on, the type by the file's own name. Streamed, never stored or
// read; only Drive's file host; only audio; only our pages (a Referer, when the phone sends one, of ours).
import { isAllowedOrigin } from './http.js';

const DRIVE_ID = /^[\w-]{20,80}$/;
const TYPES = { m4a: 'audio/mp4', mp4: 'audio/mp4', aac: 'audio/aac', mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg' };

// The type a recording is by its file's name (Content-Disposition's filename), else what Drive said when it's audio.
export function audioType(disposition, said) {
  const d = String(disposition || '');
  // (Only the ending is read: a Chinese name comes through as Latin-1 bytes, which is fine for that.)
  const name = (/filename\*=UTF-8''([^;]+)/i.exec(d) || /filename="?([^";]+)"?/i.exec(d) || [])[1] || '';
  const ext = name.toLowerCase().split('.').pop().trim();
  if (TYPES[ext]) return TYPES[ext];
  return /^audio\//i.test(said || '') ? String(said).split(';')[0] : null;
}

// A Referer that isn't one of our pages: turned away (none at all is let in: some phones send none).
const ours = referer => {
  if (!referer) return true;
  try {
    return isAllowedOrigin(new URL(referer).origin);
  } catch {
    return false;
  }
};

export async function handleLawAudio(request, headers, fetcher = fetch) {
  const fail = (status, error) => new Response(JSON.stringify({ error }), { status, headers: { ...headers, 'Content-Type': 'application/json' } });
  if (!['GET', 'HEAD'].includes(request.method)) return fail(405, 'method');
  const id = new URL(request.url).searchParams.get('drive') || '';
  if (!DRIVE_ID.test(id)) return fail(400, 'drive');
  if (!ours(request.headers.get('Referer'))) return fail(403, 'origin');
  const range = request.headers.get('Range');
  // (confirm=t: a file past Drive's virus-scan size comes as the file, not the page that asks.)
  const r = await fetcher(`https://drive.usercontent.google.com/download?id=${encodeURIComponent(id)}&export=download&confirm=t`, {
    method: request.method,
    headers: range ? { Range: range } : {},
    redirect: 'follow'
  });
  if (r.status !== 200 && r.status !== 206) return fail(r.status === 416 ? 416 : 502, 'drive');
  const type = audioType(r.headers.get('Content-Disposition'), r.headers.get('Content-Type'));
  if (!type) {
    await r.body?.cancel();
    return fail(415, 'not audio');
  }
  const out = {
    ...headers,
    'Access-Control-Allow-Origin': '*',
    'Content-Type': type,
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'public, max-age=86400',
    'X-Content-Type-Options': 'nosniff'
  };
  for (const k of ['Content-Length', 'Content-Range', 'ETag', 'Last-Modified']) if (r.headers.get(k)) out[k] = r.headers.get(k);
  return new Response(request.method === 'HEAD' ? null : r.body, { status: r.status, headers: out });
}
