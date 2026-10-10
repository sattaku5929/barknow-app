# Home recorded-day count

The home summary counts distinct dates across all active Daily Check/Event observations and existing legacy daily records for the selected dog. Observation timestamps are converted to Asia/Tokyo; explicit legacy recorded_on dates are preserved. Same-day entries across both sources count once. Care completions and scheduled plans are excluded.

The previous summary counted only legacy records in the last seven days. The new summary reads through normal RLS with dog filters, deleted_at IS NULL, stable pagination, and no artificial date limit. It refreshes when home mounts, Daily Check/Event save counters change, the legacy-record array changes, and the app regains focus/visibility. Stale requests cannot overwrite a new dog or newer request; read failures display an unknown value instead of zero. Reopening home after edits/deletion reads the authoritative database again. Schema, RLS and save/delete paths are unchanged.

Verification: `node tests/recordedDays.test.cjs`, `node tests/calendarUI.test.cjs`, scoped ESLint and build.
