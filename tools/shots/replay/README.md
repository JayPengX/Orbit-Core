# Replays

A moment that's gone, shot again from the feed's own record of it: ESPN's
real scoreboard for that day, rewound by `rewind.mjs` to the minute (each
game's status, minute, goals and cards as they stood then). Run without
`--live` (`--fixtures`), so the rest is fetched live as the Worker would.

    node tools/shots/replay/rewind.mjs <espn-scoreboard.json> <out.json> <ISO time>

`mls-2026110[12].json`: 2026-11-01 22:12Z (11/2 06:12 in Taiwan), Atlanta 2-0
Toronto at 42', Vancouver 5-1 at 85', New England v Miami to come. With the
`sports-onematch` account (英超 followed, that one match) it's Jay's 首頁 of
that morning (his screenshot 17):

    node tools/shots.mjs sports start --fixtures --account onematch --before main -- --clock 2026-11-01T22:12:00Z \
      --fixture "usa.1/scoreboard?dates=20261101=tools/shots/replay/mls-20261101.json" \
      --fixture "usa.1/scoreboard?dates=20261102=tools/shots/replay/mls-20261102.json"
