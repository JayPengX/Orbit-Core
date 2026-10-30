# Demo accounts

What a person keeps in their own Orbit account for one app (follows, a
watchlist, a timetable), as the app saved it, for `tools/shots.mjs <app>
--account <name>`. Named `<app>-<name>.txt`.

Make one by using the app, never by writing it by hand:

    node tools/preview.mjs <app> --live --keep-account tools/shots/accounts/<app>-<name>.txt --click … --click …

Money's `demo` is its sample books (`Orbit-Money/tools/sample-books.mjs`, run
each time so the dates sit around today).
