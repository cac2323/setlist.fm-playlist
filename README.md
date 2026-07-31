# Setlist Playlist

Turn a [setlist.fm](https://www.setlist.fm) show into an **Apple Music** or **Spotify** playlist.

Workflow:

1. **Load setlist** — paste a setlist.fm URL, review songs, choose a destination
2. **Review and create** — fix matches, name the playlist, create it
3. **Done** — open the playlist or load another setlist

## Requirements

- Node.js 20+
- A [setlist.fm API](https://api.setlist.fm/) key
- Credentials for at least one destination:
  - Apple Music (MusicKit / developer token), and/or
  - Spotify (app Client ID + Secret)

## Setup

```bash
npm install
cp .env.example .env.local
```

Fill in `.env.local` (see [Environment variables](#environment-variables) below).

### Run locally

```bash
npm run dev
```

Open **[http://127.0.0.1:3000](http://127.0.0.1:3000)** — not `localhost`.

`npm run dev` binds to `127.0.0.1` on purpose. Spotify’s OAuth redirect URI must use the loopback IP; cookies are host-only, so `localhost` and `127.0.0.1` are different origins. If you open `localhost`, the app redirects you to `127.0.0.1` so auth still works.

### Useful scripts

```bash
npm run test      # vitest
npm run lint
npm run build
npm start         # production server after build
```

## Spotify Dashboard

### Local development

1. Create an app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard).
2. Add this **exact** Redirect URI:

   `http://127.0.0.1:3000/api/spotify/auth/callback`

3. Copy Client ID and Client Secret into `.env.local`.
4. Set `SPOTIFY_REDIRECT_URI` to the same callback URL.

Spotify rejects `http://localhost:...` redirect URIs. Use `127.0.0.1` only.

Development-mode Spotify apps may require the app owner to have **Premium** for some playlist APIs, and only allow users listed as app testers.

### Production

1. Deploy the app on an **HTTPS** host (for example Vercel).
2. In the Spotify Dashboard, add a production Redirect URI that matches your host:

   `https://your-domain.example/api/spotify/auth/callback`

3. Set production env vars (same names as `.env.example`), including:

   `SPOTIFY_REDIRECT_URI=https://your-domain.example/api/spotify/auth/callback`

   The value must match the Dashboard entry **exactly** (scheme, host, path, no trailing slash mismatch).
4. **Spotify stays invite-only for individuals.** Extended Quota Mode is limited to organizations, so public users cannot freely authorize. The live site sends people who click **Match with Spotify** to `/spotify-access`, where approved testers can connect.
5. To approve someone: Spotify Dashboard → **User Management** → add their Spotify account email, then tell them to use **Connect Spotify** on `/spotify-access`.

Auth cookies are `httpOnly`, `SameSite=Lax`, and `Secure` in production.

**Apple Music** is the public destination for arbitrary users.

## Apple Music

Provide either:

- `APPLE_MUSIC_DEVELOPER_TOKEN` — a pre-minted MusicKit developer JWT, **or**
- `APPLE_MUSIC_TEAM_ID`, `APPLE_MUSIC_KEY_ID`, and a private key via:
  - `APPLE_MUSIC_PRIVATE_KEY_PATH` (path to your `.p8` file), or
  - `APPLE_MUSIC_PRIVATE_KEY` (inline PEM or path)

Optional: `APPLE_MUSIC_STOREFRONT` (default `us`).

Playlist creation uses MusicKit in the browser (user must authorize Apple Music).

### Production domain allowlist

In [Apple Developer](https://developer.apple.com/account/resources/identifiers/list/musicKit) → Identifiers → your MusicKit identifier, allowlist the **production domain(s)** that serve this app (for example `your-domain.example`). Local `127.0.0.1` testing uses your existing MusicKit setup; production authorize will fail if the live domain is missing from the allowlist.

## Deploy notes

Typical Vercel (or similar) checklist:

1. Set every required env var from [`.env.example`](.env.example) in the host’s environment UI — do not commit secrets.
2. Point `SPOTIFY_REDIRECT_URI` at the HTTPS production callback and register that URI in Spotify.
3. Allowlist the production domain for MusicKit / Apple Music.
4. Confirm the site loads over HTTPS so `Secure` cookies and HSTS apply.
5. Security headers (CSP, `nosniff`, frame denial, HSTS in production, etc.) are set in `next.config.ts` for all routes.

## Environment variables

See [`.env.example`](.env.example) for the full template.

| Variable | Purpose |
| --- | --- |
| `SETLISTFM_API_KEY` | setlist.fm REST API key |
| `APPLE_MUSIC_DEVELOPER_TOKEN` | Optional pre-built MusicKit developer token |
| `APPLE_MUSIC_TEAM_ID` / `APPLE_MUSIC_KEY_ID` | Used to mint a developer token |
| `APPLE_MUSIC_PRIVATE_KEY_PATH` / `APPLE_MUSIC_PRIVATE_KEY` | `.p8` path or PEM for token minting |
| `APPLE_MUSIC_STOREFRONT` | Catalog storefront (default `us`) |
| `APPLE_MUSIC_USE_MOCKS` | `true` to skip live Apple Music catalog calls in tests/dev |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | Spotify app credentials |
| `SPOTIFY_REDIRECT_URI` | Local: `http://127.0.0.1:3000/api/spotify/auth/callback`. Production: `https://<host>/api/spotify/auth/callback` |
| `SPOTIFY_MARKET` | Market for client-credentials catalog search (default `US`) |
| `SPOTIFY_USE_MOCKS` | `true` to skip live Spotify catalog calls in tests/dev |

Never commit `.env.local` or private keys (`.p8` / `.pem` are gitignored).

## Notes

- Matching and playlist creation need a real destination connection (except when mocks are on).
- After Spotify authorize locally, keep using `127.0.0.1` so session cookies stay visible to the app.
- Public API routes are rate-limited per IP; catalog searches also retry upstream `429`s with backoff.
- **Match with Spotify** opens `/spotify-access` (explains invite-only access + Connect for approved testers). Apple Music remains the open public path.
