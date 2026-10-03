// For working on the apps here: links each app checked out next to this repo
// to this kit (<app>/.kit -> ../Shared-Proxy/kit), so its tests import the
// kit the way the deployed page does (`#kit/quadra.mjs`, package.json
// "imports"). The apps' own `npm test` makes the link too when it's missing;
// their CI checks this repo out instead.
//   node kit/link.mjs
import { symlink, lstat, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
for (const app of await readdir(root)) {
  if (!/^(Quadra|Orbit)-/.test(app)) continue;
  const link = join(root, app, '.kit');
  try {
    await lstat(link);
    console.log('linked', app);
  } catch {
    await symlink('../Shared-Proxy/kit', link);
    console.log('linked', app, '(new)');
  }
}
