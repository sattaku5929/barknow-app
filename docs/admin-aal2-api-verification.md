# Admin AAL2 API verification (pre-merge)

This checklist is **not** evidence of completed live-token testing. PR #144's automated checks use mocked Supabase Auth responses.

## Preconditions

- Test using an authorized admin account with a verified TOTP factor and a separate coach account.
- Do not paste access tokens, TOTP codes, recovery information, or QR secrets into PRs, CI logs, screenshots, or chat.
- Use a disposable browser session and browser developer tools locally. Do not save Authorization headers.
- Confirm the deployment being tested includes PR #144; a READY deployment from another branch is not sufficient.
- Do not apply the database migration from PR #140 during this test.

## Expected API authorization

| Caller | Token AAL | Google Calendar connect/status/sync | Admin cross-owner upload authorization |
| --- | --- | --- | --- |
| admin | aal1 | 401 | 403 when valid target and owner differ |
| admin | aal2 | Authorized (subject to normal resource/configuration checks) | Authorized (subject to normal resource/configuration checks) |
| coach | aal1 | Authorized (subject to normal resource/configuration checks) | Only for assigned owner/dog |
| owner | aal1 | 401 | Own dog only |
| missing/invalid bearer token | any | 401 | 401 |

Notes: upload-url validates dog existence and file metadata before checking admin privileges, so a 400/404/500 may indicate an unrelated prerequisite rather than successful authorization. Test using a valid, authorized fixture; do not use real customer media. Calendar sync can mutate external events: avoid triggering it against live calendars.

## Procedure

1. Confirm the Preview deployment SHA equals the PR head SHA.
2. Open a fresh session for admin and confirm `getAuthenticatorAssuranceLevel()` returns `aal1` before TOTP verification.
3. Test read-only `GET /api/google-calendar/status` with admin AAL1: expect 401.
4. Complete TOTP challenge, refresh the session, and confirm `aal2`; repeat status request: expect an authorized response (the `connected` field may be false).
5. Test the same read-only status endpoint as coach AAL1: expect authorized response; as owner AAL1: expect 401.
6. Test missing and invalid bearer tokens: expect 401.
7. For write endpoints (connect, sync, DELETE status, upload-url), use isolated test data and confirm both authorization and business-logic constraints. Do not connect/disconnect a production coach calendar as a test.
8. Verify no secrets were logged and the production admin can still complete MFA sign-in.
9. Record the tested deployment SHA, timestamp, AAL/role matrix outcomes, and any errors **without** recording tokens or codes.

## Release gate

- Focused CI and baseline CI green; no regressions.
- Real-token role/AAL matrix passed on the exact build proposed for release.
- Recovery procedure reviewed for the sole admin.
- Explicit approval before merging PR #144 and separate approval before applying the DB migration from PR #140.
