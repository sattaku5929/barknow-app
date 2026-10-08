# Owner home: care periods and calendar

- Daily goals count today only; weekly goals run Monday–Sunday; monthly goals remain a separate section. Existing goals/completions are not rewritten.
- Calendar defaults to a compact week, with a complete Monday–Sunday month grid available. Dates use date keys, not browser-dependent midnight arithmetic.
- `wt_calendar_events` stores owner plans only. Travel may span multiple days. Time, place and notes are optional. Editing/deleting requires the same owner and their dog through RLS.
- Existing active observation entries, legacy daily records and care completions populate the selected date automatically; archived observation entries are excluded. Reads paginate instead of truncating at a server row limit.
- Birthday is read from the dog profile. It is not automatically inserted as an observation. Feb 29 birthdays appear on Feb 29 in leap years.
- The quick-win picker prefills the existing win record form for nosework, visitor success and birthday celebrations. The user still confirms the record; a scheduled event never creates a false completion.
- Daily checks and wins support the selected past date; the current observation event flow is offered only for today. Future dates offer schedules only.
- Offline schedule writes are disabled. A failed save retains input, and retry uses the same UUID. Navigation cancels stale read results; changing dog remounts the calendar.

## Verification

`npm run test:calendar`: date boundaries, schedule validation, isolated PGlite migration/RLS/constraints/deletion, and actual React server rendering.

`npm run test:insights`, `npm run test:observations`, `npm run build` and scoped ESLint are release checks. Browser automation is a separate check and must not be represented as completed when browser downloads are unavailable.

Migration `20261007152657_owner_calendar_events` is additive and does not update existing records or policies. Preflight/postflight compare counts and full-row MD5 fingerprints for dogs, goals, completions and observation entries. Production preflight: dogs 4, goals 9, completions 29, observations 19. Existing data must remain unchanged immediately after applying the migration.

If frontend rollback is needed, restore the previous frontend deployment; retain the new calendar table so any subsequently saved schedules remain recoverable.

## Home care editing and compact layout

Each period has its own Edit button opening a native modal dialog on home. Create from a preset or custom title, adjust that period's target (integer 1–31) with a stepper or numeric input, and archive an item with confirmation. Existing completion history remains intact. Changing a target recalculates completion using the existing goal ID; it does not create or discard completions.

All active goals remain visible. 1–3 items use cards (one item uses a horizontal row), 4–8 use short horizontal tiles, and 9+ use a dense two-column list. Larger screens use three columns for tiles/lists. Names wrap in full; there is no hidden overflow or “show more” gate. Home displays the icon, name, and compact state: daily “完了”, weekly/monthly “達成”, or partial count such as 1/3. Each pending tile adds one completion per tap.

Home edit writes reuse `wt_care_goals`; no schema, RLS or migration changes. UPDATE is scoped by owner, dog, ID and active state and requires a returned row before publishing state/cache. Errors retain the editor input. Archive uses `active=false`, never DELETE. Create retries reuse the same UUID. Offline edits are disabled, closing with unsaved input requires confirmation, and the native dialog traps focus; focus returns to the period's Edit button.

`npm run test:care` checks real Supabase client request construction/errors, existing-schema edits and RLS/history in PGlite, adaptive rendering for 1–40 items, and editor controls. These checks do not substitute for visual testing in a browser.
