# 🎵 ZK-SONG — Music Upload, Administration & External Streaming API Platform

A complete music publishing platform: **public catalogue**, **Artist Studio (User Panel)**,
**Admin Command Center**, and a **secure REST API** for external music applications.

React 18 + Vite + Tailwind on the front end; Node + Express + SQLite (`node:sqlite`) by
default, with a **Supabase Edge Function** backend included for fully serverless hosting.
Real audio/video streaming over HTTP 206 range requests.

---

## 🔑 Access model — one administrator

The platform is owned by **exactly one** account, configured by environment variables:

```
ADMIN_EMAIL=admin@gmail.com
ADMIN_PASSWORD=admin123
```

That account is created automatically on first boot, and it is the **only** account that
can reach the Admin Panel. The rule is enforced in five independent places:

1. `POST /api/auth/register` always creates `role = 'user'`.
2. `requireAdmin` checks both `role === 'admin'` **and** the email equals `ADMIN_EMAIL`,
   so even a database-level `role` change grants nothing.
3. `PUT /api/admin/users/:id/role` is disabled — admin cannot be granted or revoked in-app.
4. The admin account cannot be banned, demoted or deleted (`403` / `400`).
5. Registration refuses the owner's email address (`409`).

The database starts completely **empty** — no demo artists, songs, API keys, notifications
or activity. Every artist, track and key is real.

---

## ✨ Features

### Public / Starter
Animated landing page with dynamic branding, approved-song catalogue with search and
genre/cover filters, persistent global audio player (seek, speed, volume, queue auto-advance),
HD music-video modal, Artist of the Month spotlight and leaderboard, live REST API explorer,
dark/light theme, fully responsive.

### Authentication
Register, Login, Forgot Password → 2-step reset with a 30-minute expiring code.
JWT sessions (7 days), PBKDF2/bcrypt password hashing, banned-account handling,
role guards, and auth-aware redirects.

### User Panel (Artist Studio)
| Page | Capabilities |
| --- | --- |
| **Dashboard** | Uploaded / approved / pending / rejected stats, Artist of the Month status and rank, recent uploads, plays, downloads, approval rate, notifications |
| **My Songs** | Status tracking, search, status & type filters, pagination, inline preview, music video, download, edit metadata, delete |
| **Upload Song** | Title, artist, featured artist, musician(s), composer(s), **Cover Song Yes/No** (+ original credit), genre, year, BPM, description, lyrics, audio file, cover image, optional music video — with client + server validation, upload progress, and a browser WAV/SVG generator for testing |
| **Account Management** | Profile, avatar upload, bio/genre/country/website, live stats, password change |

### Admin Panel (Command Center)
| Page | Capabilities |
| --- | --- |
| **Dashboard** | Platform stats, pending moderation queue, genre distribution, audit log, Artist of the Month |
| **Songs Management** | Debounced search across title/artist/musician/composer/genre, filters (status, genre, cover, video), sorting, pagination, quick approve/reject/delete |
| **Song Details** | Full metadata, uploader profile + stats, audio player, video player, copy URLs, download audio/video/cover, approve, reject-with-reason, permanent delete |
| **Approved Songs** | Published library grid with playback, video, downloads, search/filter/sort, removal |
| **User Management** | Searchable directory, ban/unban, permanent delete (cascades songs + files), per-user moderation stats. Administrator is protected |
| **API Key Management** | Generate `zks_live_…` keys, reveal/copy, revoke/activate, delete, request counters, live request playground |
| **Platform Settings** | Website name, tagline, description, logo upload or URL, brand colours + palettes, contact email, footer, moderation & registration toggles, max upload size |

### Moderation semantics
- **Approve** → `approved`, timestamped, appears in Approved Songs, the public catalogue,
  the player and `/api/v1/songs`.
- **Reject** → deleted from the database **and** its audio/thumbnail/video erased from
  storage, the artist's `rejected_songs_count` incremented, a notification sent, and the
  action audited. Irreversible, by design.

### Artist of the Month
Recalculated from the database on every request: approved songs per artist in the current
calendar month, ranked by count → plays → lifetime approvals. The gold crown badge appears
on the landing page, both dashboards, song cards, user lists and API payloads
(`is_artist_of_the_month`, `artist_of_month_badge`).

---

## 🚀 Run locally

```bash
npm install
npm run dev        # Express API :4000 + Vite :5173
```

Open <http://localhost:5173> and sign in with your admin credentials.

Production single-image (API + built SPA):

```bash
npm run build
npm start          # http://localhost:4000
```

---

## 🔌 External REST API (v1)

Create a key in **Admin → API Key Management**, then:

```bash
curl -H "X-API-Key: zks_live_…" http://localhost:4000/api/v1/songs
curl -H "Authorization: Bearer zks_live_…" http://localhost:4000/api/v1/songs
curl "http://localhost:4000/api/v1/songs?api_key=zks_live_…"
```

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/v1/songs` | Approved songs. Query: `search`, `genre`, `artist`, `is_cover`, `sort`, `page`, `limit` |
| `GET` | `/api/v1/songs/:id` | Single approved song |
| `GET` | `/api/v1/artist-of-the-month` | Crown winner, leaderboard, their releases |
| `GET` | `/api/v1/stream/:id` | Audio stream, HTTP 206 range support |

Each song includes `title`, `artist`, `featured_artist`, `musician`, `composer`,
`is_cover_song`, `original_credit`, `genre`, `release_year`, `bpm`, `duration_seconds`,
`description`, `lyrics`, `thumbnail_url`, `audio_url`, `stream_url`, `video_url`,
`download_url`, play/download counts, approval timestamps and Artist-of-the-Month flags.

Errors: `{ "status": "error", "code": "MISSING_API_KEY | INVALID_API_KEY | REVOKED_API_KEY | SONG_NOT_FOUND", "message": "…" }`

---

## ☁️ Deployment

**Vercel / Netlify can host the frontend.** The API needs persistent storage for uploads,
so it runs on Supabase Edge Functions + Storage or on a Docker host with a volume.

See **[DEPLOYMENT.md](DEPLOYMENT.md)** for the three supported topologies, exact commands
and the environment-variable reference. In short:

| Topology | Frontend | API + storage |
| --- | --- | --- |
| **A** | served by the API | one Docker container + volume (`render.yaml` included) |
| **B** | Vercel or Netlify | Supabase Edge Function + Postgres + Storage ([`supabase/schema.sql`](supabase/schema.sql)) |
| **C** | Vercel or Netlify | Docker host, with `ALLOWED_ORIGIN` locked down |

Static hosts point at the API with one build-time variable:

```
VITE_API_BASE_URL=https://<project-ref>.supabase.co/functions/v1/api
```

---

## 🗂 Project structure

```
server/
  db.js                  # SQLite schema, single-admin bootstrap, Artist of the Month
  index.js               # Express: auth, user, admin, public, /api/v1, range streaming
  generateMedia.js       # Branding asset generation (no demo content)
  uploads/  data/
supabase/
  schema.sql             # Postgres schema, indexes, RLS, storage bucket
  functions/api/index.ts # Full serverless API (same routes, PBKDF2 + JWT, Storage uploads)
src/
  App.jsx                # Router with protected / admin-only / public-only guards
  lib/apiBase.js         # VITE_API_BASE_URL resolution for static hosting
  context/AppContext.jsx # auth, theme, toasts, branding, global player
  components/            # DashboardLayout, UI kit, GlobalPlayer, badges, media synth
  pages/
    LandingPage.jsx  AuthPages.jsx
    user/UserPanel.jsx
    admin/AdminPanel.jsx  SongDetails.jsx  UserManagement.jsx
    admin/ApiKeyManagement.jsx  PlatformSettings.jsx
scripts/
  dom-smoke.cjs          # renders every route in jsdom against the live server
  ui-interactions.cjs    # clicks through filters, modals and the API playground
```

---

## 🔒 Security notes

- Passwords hashed with bcrypt (Express) or PBKDF2-SHA256 ×120k (Supabase); hashes and
  reset tokens are stripped from every response.
- Admin routes double-guard role **and** owner identity; self-ban/self-delete are blocked.
- Ban status is re-checked on every authenticated request.
- Uploads validate MIME **and** extension, cap at 120 MB, randomise filenames and strip
  paths (no traversal).
- Rejection/deletion removes database rows and stored media.
- API keys are 144-bit random, prefixed `zks_live_`, revocable and usage-counted.
- Password reset codes are never returned by the API — they are logged server-side only.
- `JWT_SECRET` is required in production; `ALLOWED_ORIGIN` narrows CORS when set.

## 🧪 Verification

```bash
npm run build            # production bundle
npm run smoke:build      # bundle the client for jsdom
npm run smoke -- / /login /admin/dashboard /admin/songs /admin/users /user/dashboard
npm run smoke:ui         # interaction suite (self-provisions and cleans up fixtures)
```
