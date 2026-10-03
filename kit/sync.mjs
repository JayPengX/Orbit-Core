// Copies the shared kit (quadra.mjs, quadra.css, boot.js, sw-images.js, and logos.mjs, names.mjs and
// leagues.mjs for the apps that show teams) into every app checked out next to this repo. The apps never edit their copies: change the kit here,
// run `node kit/sync.mjs`, commit each app.
import { copyFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const kit = fileURLToPath(new URL('./', import.meta.url));
const TARGETS = [
  ['Quadra-Securities/public/lib/quadra.mjs', 'Quadra-Securities/public/quadra.css'],
  ['Quadra-Play/public/lib/quadra.mjs', 'Quadra-Play/public/quadra.css'],
  ['Quadra-Fixtures/public/lib/quadra.mjs', 'Quadra-Fixtures/public/quadra.css'],
  ['Quadra-Hub/public/lib/quadra.mjs', 'Quadra-Hub/public/quadra.css'],
  ['Orbit-Class/src/quadra.mjs', 'Orbit-Class/css/quadra.css'],
  ['Orbit-Weather/public/lib/quadra.mjs', 'Orbit-Weather/public/quadra.css'],
  ['Orbit-Transit/public/lib/quadra.mjs', 'Orbit-Transit/public/quadra.css']
];
// The apps that show teams, leagues and drivers: the logos too, and the
// sports and leagues catalogue (leagues.mjs, copied as catalog.mjs).
const LOGOS = { 'Quadra-Play': 'Quadra-Play/public/lib/logos.mjs', 'Quadra-Fixtures': 'Quadra-Fixtures/public/lib/logos.mjs' };
const CATALOG = { 'Quadra-Play': 'Quadra-Play/public/lib/catalog.mjs', 'Quadra-Fixtures': 'Quadra-Fixtures/public/lib/catalog.mjs' };
// The loading screen and first update check (boot.js), for the apps that open
// with one.
const BOOT = { 'Quadra-Securities': 'Quadra-Securities/public/boot.js', 'Quadra-Play': 'Quadra-Play/public/boot.js', 'Quadra-Fixtures': 'Quadra-Fixtures/public/boot.js', 'Quadra-Hub': 'Quadra-Hub/public/boot.js', 'Orbit-Weather': 'Orbit-Weather/public/boot.js', 'Orbit-Transit': 'Orbit-Transit/public/boot.js' };
// Pictures from other sites kept on the device (sw-images.js, imported by
// the app's service worker), for the apps that show logos and photos.
const IMAGES = { 'Quadra-Securities': 'Quadra-Securities/public/sw-images.js', 'Quadra-Play': 'Quadra-Play/public/sw-images.js', 'Quadra-Fixtures': 'Quadra-Fixtures/public/sw-images.js', 'Quadra-Hub': 'Quadra-Hub/public/sw-images.js' };
// People's studio headshots (photos.mjs), for Fixtures and Play's players.
const PHOTOS = { 'Quadra-Fixtures': 'Quadra-Fixtures/public/lib/photos.mjs', 'Quadra-Play': 'Quadra-Play/public/lib/photos.mjs' };
// Teams in Chinese (names.mjs), for the same two.
const NAMES = { 'Quadra-Play': 'Quadra-Play/public/lib/names.mjs', 'Quadra-Fixtures': 'Quadra-Fixtures/public/lib/names.mjs' };
for (const [js, css] of TARGETS) {
  const app = js.split('/')[0];
  try {
    await access(`${root}${app}`);
  } catch {
    console.log('skip', app, '(not checked out)');
    continue;
  }
  await copyFile(`${kit}quadra.mjs`, `${root}${js}`).catch(e => console.log('skip', js, e.code));
  await copyFile(`${kit}quadra.css`, `${root}${css}`).catch(e => console.log('skip', css, e.code));
  if (PHOTOS[app]) await copyFile(`${kit}photos.mjs`, `${root}${PHOTOS[app]}`).catch(e => console.log('skip', PHOTOS[app], e.code));
  if (IMAGES[app]) await copyFile(`${kit}sw-images.js`, `${root}${IMAGES[app]}`).catch(e => console.log('skip', IMAGES[app], e.code));
  if (BOOT[app]) await copyFile(`${kit}boot.js`, `${root}${BOOT[app]}`).catch(e => console.log('skip', BOOT[app], e.code));
  if (LOGOS[app]) await copyFile(`${kit}logos.mjs`, `${root}${LOGOS[app]}`).catch(e => console.log('skip', LOGOS[app], e.code));
  if (NAMES[app]) await copyFile(`${kit}names.mjs`, `${root}${NAMES[app]}`).catch(e => console.log('skip', NAMES[app], e.code));
  if (CATALOG[app]) await copyFile(`${kit}leagues.mjs`, `${root}${CATALOG[app]}`).catch(e => console.log('skip', CATALOG[app], e.code));
  console.log('synced', app);
}
