// Copies the shared kit (quadra.mjs, quadra.css) into every app checked out
// next to this repo. The apps never edit their copies: change the kit here,
// run `node kit/sync.mjs`, commit each app.
import { copyFile, access } from 'node:fs/promises';

const root = new URL('../../', import.meta.url).pathname;
const kit = new URL('./', import.meta.url).pathname;
const TARGETS = [
  ['Quadra-Securities/public/lib/quadra.mjs', 'Quadra-Securities/public/quadra.css'],
  ['Quadra-Sportsbook/public/lib/quadra.mjs', 'Quadra-Sportsbook/public/quadra.css'],
  ['Quadra-Fixtures/public/lib/quadra.mjs', 'Quadra-Fixtures/public/quadra.css'],
  ['Quadra-Rewards/public/lib/quadra.mjs', 'Quadra-Rewards/public/quadra.css'],
  ['Orbit-Class/src/quadra.mjs', 'Orbit-Class/css/quadra.css']
];
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
  console.log('synced', app);
}
