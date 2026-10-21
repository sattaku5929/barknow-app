# Admin AAL2 API verification (pre-merge)

This checklist is **not** evidence of completed live-token testing. PR #146's automated checks use mocked Supabase Auth responses.

## Preconditions

- Test using an authorized admin account with a verified TOTP factor and a separate coach account.
- Do not paste access tokens, TOTP codes, recovery information, or QR secrets into PRs, CI logs, screenshots, or chat.
- Use a disposable browser session and browser developer tools locally. Do not save Authorization headers.
- Confirm the deployment being tested includes PR #146; a READY deployment from another branch is not sufficient.
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
- Explicit approval before merging PR #146 and separate approval before applying the DB migration from PR #140.

## Browser-local read-only smoke check

Run the following **only in the DevTools Console of the trusted PR #146 Vercel Preview** while signed in. It reads the active Supabase session from this origin's browser storage, calls only the same-origin read-only status endpoint, and prints only AAL and HTTP status. **Do not share the token, browser storage contents, screenshots of auth headers, or console stack traces containing credentials.** The snippet deliberately avoids logging any token.

```js
(async () => {
  const keys = Object.keys(localStorage).filter(k => /^sb-.*-auth-token$/.test(k));
  if (keys.length !== 1) { console.log("Session key count:", keys.length, "— stop and verify this is the correct Preview origin"); return; }
  const session = JSON.parse(localStorage.getItem(keys[0]) || "null");
  const accessToken = session?.access_token;
  if (!accessToken) { console.log("No active session — stop"); return; }
  const base64 = accessToken.split(".")[1]?.replace(/-/g, "+").replace(/_/g, "/");
  if (!base64) { console.log("Invalid session token format — stop"); return; }
  const claims = JSON.parse(atob(base64));
  const response = await fetch("/api/google-calendar/status", {
    method: "GET",
    headers: { Authorization: "Bearer " + accessToken },
    cache: "no-store",
  });
  console.log({ aal: claims.aal, httpStatus: response.status });
})();
```

Expected read-only results: admin before MFA `{aal:"aal1",httpStatus:401}`; admin after MFA `{aal:"aal2",httpStatus:200}`; coach AAL1 `200`; owner AAL1 `401`. Do not infer AAL1 coverage from an AAL2-only test. A failed request or unexpected AAL requires investigation before merge. Run with a separate browser profile for each role. Do not execute write endpoints in production.

**Important:** The console snippet reads the current browser-stored session; it does not bypass the MFA gate or manufacture a lower-AAL token. If the admin is already at AAL2, a fresh legitimate AAL1 login is required for the AAL1 negative test.
