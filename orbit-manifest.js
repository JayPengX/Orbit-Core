// /orbit-manifest?o=<tag>: the web app manifest of one Orbit set up by its
// person (kit/orbit-mine.mjs): its name, its icon and the address its icon
// opens, all read from the tag itself (nothing stored). Orbit's page links it
// while setting up, so Add to Home Screen (and Chrome's install) take that
// Orbit's name and icon. The plain Orbit's manifest is a file of the site.
import { orbitManifest } from './kit/orbit-mine.mjs';

export function handleOrbitManifest(request, headers) {
  const tag = new URL(request.url).searchParams.get('o') || '';
  const m = orbitManifest(tag);
  if (!m) return new Response(JSON.stringify({ error: 'NOT_AN_ORBIT' }), { status: 404, headers: { ...headers, 'Content-Type': 'application/json' } });
  // (A tag is its manifest for good: kept a day at the edge and on the phone.)
  return new Response(JSON.stringify(m), { headers: { ...headers, 'Content-Type': 'application/manifest+json; charset=utf-8', 'Cache-Control': 'public, max-age=86400' } });
}
