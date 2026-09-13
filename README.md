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

## Cloudflare R2 media chat

1. Run `supabase/migrations/021_r2_media_chat.sql` after migration 020.
2. Add the following server-only environment variables to Vercel Production and Preview, then redeploy:

```text
R2_ENDPOINT=https://<ACCOUNT_ID>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID
R2_SECRET_ACCESS_KEY
R2_BUCKET_NAME
R2_PUBLIC_URL=https://<PUBLIC_BUCKET_OR_CUSTOM_DOMAIN>
```

3. Configure the R2 bucket CORS policy so the browser can upload directly from Wan Tone:

```json
[
  {
    "AllowedOrigins": ["https://barknow-app.vercel.app"],
    "AllowedMethods": ["PUT"],
    "AllowedHeaders": ["Content-Type"],
    "ExposeHeaders": ["ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Add the Vercel Preview origin while testing a Preview deployment. Never prefix R2 credentials with `NEXT_PUBLIC_`. The API issues five-minute upload URLs, while the browser uploads the file directly to R2.

`.env.local` is only used by local development. Vercel Production must have all five `R2_*` values in **Project Settings → Environment Variables → Production**, followed by a redeploy. The upload API returns the names of missing variables without exposing their values. If an existing login predates an environment-key change, the client refreshes its Supabase session once before asking the user to sign in again.
