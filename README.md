# Wan Tone app

## Getting Started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Google Calendar integration

1. Run `supabase/migrations/018_google_calendar_and_coach_profiles.sql` after migration 017.
2. Enable the Google Calendar API in Google Cloud.
3. Create an OAuth 2.0 Client with application type **Web application**.
   While the OAuth consent screen is in Testing, add every coach Google account as a test user.
4. Add this production redirect URI exactly:

```text
https://barknow-app.vercel.app/api/google-calendar/callback
```

5. Add these Vercel environment variables to Production and Preview, then redeploy.

```text
GOOGLE_CLIENT_ID
GOOGLE_CLIENT_SECRET
GOOGLE_OAUTH_REDIRECT_URI=https://barknow-app.vercel.app/api/google-calendar/callback
GOOGLE_TOKEN_ENCRYPTION_KEY
SUPABASE_SERVICE_ROLE_KEY
NEXT_PUBLIC_APP_URL=https://barknow-app.vercel.app
```

Do not add quotes, spaces, or a trailing `/**` to either URL. The redirect URI registered in Google Cloud and the Vercel value must be exactly the same. The coach profile screen now reports missing environment variables and redirect URI mismatches before OAuth starts.

Generate `GOOGLE_TOKEN_ENCRYPTION_KEY` once and keep it unchanged:

```bash
openssl rand -base64 32
```

Never expose `GOOGLE_CLIENT_SECRET`, `GOOGLE_TOKEN_ENCRYPTION_KEY`, or `SUPABASE_SERVICE_ROLE_KEY` through a `NEXT_PUBLIC_` variable. Refresh tokens are encrypted with AES-256-GCM before storage and are only accessed from server routes using the service-role client.

The app database is authoritative. Booking uses the database lock and unique constraint, while Google Calendar synchronization runs after the response through a durable sync queue. Google busy intervals are checked when showing availability and immediately before booking.

If Google returns `redirect_uri_mismatch`, check **Google Cloud → APIs & Services → Credentials → OAuth 2.0 Client → Authorized redirect URIs**. If the consent screen is still in Testing, register every coach account under **OAuth consent screen → Test users**.
