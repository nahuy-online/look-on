# NextAuth + YouTube OAuth Setup

This guide walks you through configuring **real Google OAuth** for the
"Continue with YouTube" button in PureTuber VPN. Once configured, the app
fetches your real **liked videos**, **playlists**, **subscriptions**, and
**subscription-feed recommendations** via the YouTube Data API v3.

If you skip this setup, the app still works — the "Continue with YouTube"
button will fail with a NextAuth error, but the simulated email login and
all other features continue to function.

---

## 1. Create a Google Cloud project

1. Go to <https://console.cloud.google.com/>.
2. Click the project picker (top bar) → **New Project**.
3. Name it (e.g. `PureTuber VPN`) and click **Create**.
4. Make sure the new project is selected in the top bar.

## 2. Enable the YouTube Data API v3

1. Open the sidebar → **APIs & Services → Library**.
2. Search for **YouTube Data API v3**.
3. Click it → **Enable**.

Without this step, every YouTube API call from the server will return
`403 accessNotConfigured`.

## 3. Configure the OAuth consent screen

1. **APIs & Services → OAuth consent screen**.
2. User type: **External** → **Create**. (Internal only works for Google Workspace orgs.)
3. Fill in:
   - App name: `PureTuber VPN`
   - User support email: your email
   - Developer contact information: your email
4. Click **Save and Continue** through Scopes and Test users.
   - The `youtube.readonly` scope is a **sensitive** scope — Google requires
     verification for public apps, but you can use the app in **Testing**
     mode with up to 100 test users (add your Google account as a test user).
5. To publish later, you'll need to submit the app for verification. For
   personal / dev use, **Testing** mode is sufficient.

## 4. Create OAuth 2.0 Client ID (Web application)

1. **APIs & Services → Credentials → Create Credentials → OAuth client ID**.
2. Application type: **Web application**.
3. Name: `PureTuber VPN (web)`.
4. **Authorised redirect URIs** — add both:
   - `http://localhost:3000/api/auth/callback/google` (dev)
   - `https://your-production-domain/api/auth/callback/google` (prod, when ready)
5. Click **Create**.
6. Copy the **Client ID** and **Client Secret** — you'll paste them into `.env`.

## 5. Generate `NEXTAUTH_SECRET`

NextAuth needs a random string (≥ 32 chars) to sign session JWTs.

```bash
openssl rand -base64 32
```

Copy the output.

## 6. Fill in `.env`

Copy `.env.example` to `.env` and replace the placeholders:

```bash
cp .env.example .env
```

```dotenv
GOOGLE_CLIENT_ID=<paste from step 4>
GOOGLE_CLIENT_SECRET=<paste from step 4>
NEXTAUTH_URL=http://localhost:3000
NEXTAUTH_SECRET=<paste from step 5>
```

> Restart the dev server after editing `.env` — env vars are loaded at boot:
>
> ```bash
> bun run dev
> ```

## 7. Sign in

1. Open <http://localhost:3000>.
2. Click **Sign in** (top-right).
3. Click **Continue with YouTube**.
4. Google's consent screen appears — review the scopes:
   - `openid`, `email`, `profile` — your identity
   - `https://www.googleapis.com/auth/youtube.readonly` — read-only access to
     your YouTube library
5. Approve. You'll be redirected back to PureTuber VPN and your Google avatar
   will appear in the header.

## 8. What data the app fetches (and what it does NOT)

The app uses the OAuth access token **server-side only** (the token never
reaches the browser). These endpoints are called on demand:

| Endpoint                                | Used for                                | When                                |
| --------------------------------------- | --------------------------------------- | ----------------------------------- |
| `GET /playlistItems?playlistId=LL`      | Your liked videos                       | `/api/youtube/library`              |
| `GET /playlists?mine=true`              | Your playlists                          | `/api/youtube/library`              |
| `GET /subscriptions?mine=true`          | Your subscribed channels                | future personalisation features     |
| `GET /activities?mine=true`             | Recent uploads from subscriptions       | `/api/youtube/recommendations`      |
| `GET /channels?mine=true`               | Your channel avatar / subscriber count  | future profile display              |
| `GET /videos?id=...`                    | Enrich items with duration + view count | both library + recommendations      |

**Read-only.** The `youtube.readonly` scope does **not** allow the app to:

- Like / unlike videos on your behalf
- Subscribe / unsubscribe to channels
- Create / edit / delete playlists
- Upload videos
- Post comments
- Modify your account in any way

The access token is stored in the NextAuth JWT (signed with
`NEXTAUTH_SECRET`), refreshed automatically when it expires (using the
stored refresh token — Google only issues one on first consent, which is why
we set `prompt: "consent"` on the initial sign-in).

## 9. Privacy notes

- The OAuth token never leaves the server. The browser only sees the session
  cookie.
- PureTuber VPN does **not** persist your YouTube data to its own database —
  every library / recommendations fetch is a live call to the YouTube API.
  Clearing your cookies (sign-out) revokes access immediately.
- You can revoke the app's access at any time from
  <https://myaccount.google.com/permissions>.
- All YouTube Data API calls are subject to Google's daily quota
  (default 10,000 units/day per project). A typical library sync uses
  ~3-5 units; recommendations use ~2 units.

## 10. Troubleshooting

| Symptom                                                                   | Likely cause                                                                                       |
| ------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `Error: redirect_uri_mismatch` on Google consent screen                  | The redirect URI in Google Cloud Console doesn't match `NEXTAUTH_URL/api/auth/callback/google`.    |
| `Error: access_not_configured` from /api/youtube/*                       | YouTube Data API v3 is not enabled in your GCP project (step 2).                                   |
| `Error: invalid_client`                                                  | `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` typo or copied with extra whitespace.                  |
| Redirects back to `/` but no avatar appears                              | `NEXTAUTH_SECRET` is missing or changed since the JWT was issued — clear cookies and sign in again. |
| `401 Unauthorized` from `/api/youtube/*` even when signed in             | The access token expired and the refresh failed — sign out and sign back in.                       |
| `429 Quota exceeded`                                                      | You hit the daily YouTube Data API quota — wait 24h or request a quota extension from GCP.         |
| Works in dev, fails in prod                                              | `NEXTAUTH_URL` not set to the production URL, or the prod redirect URI not added in GCP.           |

## 11. Production deployment checklist

- [ ] Set all 4 env vars (`GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
      `NEXTAUTH_URL`, `NEXTAUTH_SECRET`) in your hosting provider's env
      settings.
- [ ] `NEXTAUTH_URL` must be the **public** HTTPS URL (no trailing slash).
- [ ] Add `https://your-domain/api/auth/callback/google` to the authorised
      redirect URIs in GCP.
- [ ] If the OAuth consent screen is in Testing mode, add each user's Google
      account as a test user — or move it to Production (requires Google's
      verification for sensitive scopes).
- [ ] Rotate `NEXTAUTH_SECRET` periodically. Note: rotating it invalidates
      all existing sessions — users will need to sign in again.
