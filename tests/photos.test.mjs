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
