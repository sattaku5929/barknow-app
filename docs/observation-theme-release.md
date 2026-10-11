# Profile observation themes and home Quick Log

Profile themes allow multiple selections without a three-theme limit. New owners choose themes after saving the dog profile; existing owners can change them from the home Quick Log. Each tap auto-saves the selection. The home group contains exactly the selected themes, with today's event count, while other themes remain available separately. No event is created merely by selecting or viewing a theme.

## Validation

- Production build and TypeScript passed.
- Home event create/edit/save, selected-theme rendering, all ten selections, deselection/reselection, reload, failure/offline guards and onboarding transition passed using the real TSX handlers.
- Original observation-theme table, trigger and RLS policies were executed in PGlite. The migration preserved original rows; all ten selections succeeded, duplicate/invalid values remained rejected, other owners remained isolated and assigned coaches remained read-only.
- Existing insight, observation soft-delete and report UI suites passed.
- Whole-repository ESLint has 50 pre-existing errors; normalized comparison against main `9e72c37` found zero introduced errors. New test harnesses and the event hub pass targeted ESLint.
- Docker is unavailable in the environment, so a full Supabase `db reset` was not run. SQL verification used PGlite with the original target schema/policies. Mobile browser visual verification was not performed.

## Production database postflight

Only the sort-order check changed from positions 1–3 to positive positions. Canonical theme keys, unique constraints, foreign keys, columns, RLS policies and the timestamp trigger are unchanged.

Before and after counts and full-row MD5 fingerprints matched:

| Relation | Rows | Fingerprint |
| --- | ---: | --- |
| wt_dog_observation_themes | 5 | 9ad1d4806ae219d5c05e53ade0883719 |
| wt_observation_entries | 24 | fecf943cbcc48a2c2081aeb28ffa449d |
| wt_observation_events | 17 | 607eb0d7ed70fe36be335bd12999fd6e |
| wt_daily_checks | 7 | ce8d739b03854ef63be6a8ba5ecec9f2 |

The CLI-created migration was aligned to the actual production apply timestamp `20261011063755` returned by Supabase. No existing migration history was rewritten.
