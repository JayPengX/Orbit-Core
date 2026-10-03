// The kit is no longer copied into the apps: every app loads it from
// Shared-Proxy's GitHub Pages (kit/loader.html), so a change to the kit is
// one push here. `node kit/apps.mjs` points apps at it (and refreshes their
// loader snippet); `node kit/link.mjs` links them for local tests.
console.error('kit/sync.mjs is retired: the apps load the kit from Pages. See kit/apps.mjs and kit/link.mjs.');
process.exit(1);
