# Demo accounts

What a person keeps in their own Orbit account for one app (follows, a
watchlist, a timetable), as the app saved it, for `tools/shots.mjs <app>
--account <name>`. Named `<app>-<name>.txt`.

Make one by using the app, never by writing it by hand:

    node tools/preview.mjs <app> --live --keep-account tools/shots/accounts/<app>-<name>.txt --click … --click …

Money's `demo` is its sample books (`Orbit-Money/tools/sample-books.mjs`, run
each time so the dates sit around today).

Class's `week` is a week of seven periods a day (國文, 英文, 數學… with their
teachers and rooms), typed into the app's own store (`classFocusData`) and
kept as the app synced it; shoot it with `-- --clock 2026-11-04T10:30` for a
class in progress.

An account in one language is `<app>-<name>.<lang>.txt`, picked before the
plain one (Jay 11-14: an English shot shows English content). Class's
`week.zh` and `week.en` are the same week, its subjects, teachers and rooms
in each language, typed into `classFocusData` with `--store` and kept with
`--keep-account`.
