// Copies the shared kit (quadra.mjs, quadra.css, and logos.mjs for the apps
// that show teams) into every app checked out next to this repo. The apps never edit their copies: change the kit here,
// run `node kit/sync.mjs`, commit each app.
import { copyFile, access } from 'node:fs/promises';

const root = new URL('../../', import.meta.url).pathname;
const kit = new URL('./', import.meta.url).pathname;
const TARGETS = [
  ['Quadra-Securities/public/lib/quadra.mjs', 'Quadra-Securities/public/quadra.css'],
  ['Quadra-Play/public/lib/quadra.mjs', 'Quadra-Play/public/quadra.css'],
  ['Quadra-Fixtures/public/lib/quadra.mjs', 'Quadra-Fixtures/public/quadra.css'],
  ['Quadra-Rewards/public/lib/quadra.mjs', 'Quadra-Rewards/public/quadra.css'],
  ['Orbit-Class/src/quadra.mjs', 'Orbit-Class/css/quadra.css']
];
// The apps that show teams, leagues and drivers: the logos too, and the
// sports and leagues catalogue (leagues.mjs, copied as catalog.mjs).
const LOGOS = { 'Quadra-Play': 'Quadra-Play/public/lib/logos.mjs', 'Quadra-Fixtures': 'Quadra-Fixtures/public/lib/logos.mjs' };
const CATALOG = { 'Quadra-Play': 'Quadra-Play/public/lib/catalog.mjs', 'Quadra-Fixtures': 'Quadra-Fixtures/public/lib/catalog.mjs' };
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
  if (LOGOS[app]) await copyFile(`${kit}logos.mjs`, `${root}${LOGOS[app]}`).catch(e => console.log('skip', LOGOS[app], e.code));
  if (CATALOG[app]) await copyFile(`${kit}leagues.mjs`, `${root}${CATALOG[app]}`).catch(e => console.log('skip', CATALOG[app], e.code));
  console.log('synced', app);
}
