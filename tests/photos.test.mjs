import test from 'node:test';
import assert from 'node:assert/strict';

test("an NBA player's photo is NBA.com's (this season's team) when the nightly list has them, by name in any spelling", async () => {
  globalThis.fetch = async url => (String(url).endsWith('sports/nba/photos.json') ? new Response(JSON.stringify({ players: [['LeBron James', 2544], ['Nikola Jokić', 203999]] }), { status: 200 }) : new Response('', { status: 404 }));
  const { ownPhoto } = await import('../kit/photos.mjs');
  assert.equal(ownPhoto('LeBron James', 'nba'), null, 'the list is read once, in the background');
  await new Promise(r => setTimeout(r, 20));
  assert.equal(ownPhoto('LeBron James', 'nba'), 'https://cdn.nba.com/headshots/nba/latest/260x190/2544.png');
  assert.equal(ownPhoto('Nikola Jokic', 'nba'), 'https://cdn.nba.com/headshots/nba/latest/260x190/203999.png');
  assert.equal(ownPhoto('Someone Else', 'nba'), null);
  assert.equal(ownPhoto('LeBron James', 'mlb'), null, 'only leagues with their own photos');
});

test("a Premier League player's photo is the league's own, on its older path when the list says so", async () => {
  globalThis.fetch = async url => (String(url).endsWith('sports/epl/photos.json') ? new Response(JSON.stringify({ players: [['Erling Haaland', 223094], ['Joe Gomez', 171287, 'o']] }), { status: 200 }) : new Response('', { status: 404 }));
  const { ownPhoto } = await import('../kit/photos.mjs');
  ownPhoto('Erling Haaland', 'epl');
  await new Promise(r => setTimeout(r, 20));
  assert.equal(ownPhoto('Erling Haaland', 'epl'), 'https://resources.premierleague.com/premierleague25/photos/players/110x140/223094.png');
  assert.equal(ownPhoto('Joe Gomez', 'epl'), 'https://resources.premierleague.com/premierleague/photos/players/250x250/p171287.png');
});

test("a lookup TheSportsDB refused (its limit) isn't kept as 'no photo': asked again, the face comes", async () => {
  const { findPhoto, knownPhoto, TSDB_PACE } = await import('../kit/photos.mjs');
  Object.assign(TSDB_PACE, { gap: 0, pause: 0 });
  let limited = true;
  globalThis.fetch = async url => {
    const u = String(url);
    if (u.includes('site.web.api.espn.com')) return new Response(JSON.stringify({ items: [] }), { status: 200 });
    if (u.includes('thesportsdb.com')) return limited ? new Response('', { status: 429 }) : new Response(JSON.stringify({ player: [{ strPlayer: 'Kevin Ciubotaru', strSport: 'Soccer', strCutout: 'https://r2.thesportsdb.com/images/media/player/cutout/k.png' }] }), { status: 200 });
    return new Response('', { status: 404 });
  };
  assert.equal(await findPhoto('Kevin Ciubotaru', 'scotland'), '');
  assert.equal(knownPhoto('Kevin Ciubotaru', 'soccer'), undefined, 'nothing kept for a failed lookup');
  limited = false;
  assert.equal(await findPhoto('Kevin Ciubotaru', 'scotland'), 'https://r2.thesportsdb.com/images/media/player/cutout/k.png');
  assert.equal(knownPhoto('Kevin Ciubotaru', 'soccer'), 'https://r2.thesportsdb.com/images/media/player/cutout/k.png');
});

test("a footballer's face is FotMob's from the league's nightly list, by name in any spelling; a failed read is read again", async () => {
  let up = false;
  globalThis.fetch = async url => {
    if (!String(url).endsWith('sports/bundesliga/faces.json')) return new Response('', { status: 404 });
    return up ? new Response(JSON.stringify({ players: [['Frederik Rønnow', 191414], ['Evan NDicka', 659413]] }), { status: 200 }) : new Response('', { status: 503 });
  };
  const { facePhoto, faceFor } = await import('../kit/photos.mjs');
  assert.equal(await faceFor('Frederik Ronnow', 'bundesliga'), null, 'the list could not be read');
  up = true;
  const now = Date.now;
  Date.now = () => now() + 10 * 60_000; // past the kit's wait after a failed read
  assert.equal(await faceFor('Frederik Ronnow', 'bundesliga'), 'https://images.fotmob.com/image_resources/playerimages/191414.png');
  assert.equal(facePhoto('Evan Ndicka', 'bundesliga'), 'https://images.fotmob.com/image_resources/playerimages/659413.png');
  assert.equal(facePhoto('Someone Else', 'bundesliga'), null);
  assert.equal(await faceFor('LeBron James', 'nba'), null, 'football only');
  Date.now = now;
});
