// Orbit (every app in one home-screen app, kit/suite.mjs): its door, /app/,
// kept so the icon opens without a connection; each app's own pages are its
// own service worker's. The family's one service worker (kit/sw.js).
self.ORBIT_SW = { cache: 'orbit-door-v1', title: 'Orbit' };
importScripts('/Orbit-Core/kit/sw.js');
