# 🎵 ZK-SONG — Music Upload, Administration & External Streaming API Platform

A complete, production-ready music publishing platform with a **public catalogue**, **Artist Studio (User Panel)**, **Admin Command Center**, and a **secure REST API** for external Spotify-like music applications.

Built with **React 18 + Vite + Tailwind CSS** on the front end and **Node.js + Express + SQLite (`node:sqlite`)** on the back end, with real audio/video streaming over HTTP 206 range requests.

---

## ✨ Feature Overview

### Public / Starter Experience
- Premium animated landing page with dynamic branding (site name, logo, tagline, colours pulled from the database).
- Approved Songs catalogue with live search, genre filter, and Original vs. Cover filter.
- Global persistent audio player (seek, volume, speed, next/prev, queue auto-advance) + HD music-video modal player.
- **Artist of the Month** spotlight with auto-calculated leaderboard.
- Live **External REST API explorer** with an embedded Spotify-like client simulator.
- Dark / light theme toggle, fully responsive.

### Authentication
- Register, Login, Forgot Password → 2-step Reset (6-digit expiring code).
- JWT sessions (7-day), bcrypt password hashing, banned-account handling, role-based guards.
- One-click demo logins for Admin, Artist of the Month, another artist, and a banned account.

### User Panel (Artist Studio)
| Page | Capabilities |
| --- | --- |
| **Dashboard** | Total uploaded / approved / pending / rejected stats, Artist of the Month status + leaderboard rank, recent uploads, plays/downloads, approval rate, notification feed |
| **My Songs** | Status tracking (Approved / Pending / Rejected), search, status & type filters, pagination, inline audio preview, music-video playback, download, edit metadata modal, delete |
| **Upload Song** | Title, artist, featured artist, musician(s), composer(s), **Cover Song Yes/No** (+ original credit), genre, year, BPM, description, lyrics, audio file, cover image, optional music video — with client + server file validation, upload progress, and a **browser-side WAV + SVG artwork generator** for instant testing |
| **Account Management** | Profile editing, avatar upload, bio/genre/country/website, live statistics, password change |

### Admin Panel (Command Center)
| Page | Capabilities |
| --- | --- |
| **Dashboard** | Platform stats (songs, approvals, pending, rejected, users, banned, API keys, requests, plays, downloads), pending moderation queue, genre distribution, activity audit log, Artist of the Month card |
| **Songs Management** | Debounced search across title/artist/musician/composer/genre/uploader, filters (status, genre, cover, video), sorting, pagination, quick approve / reject / delete |
| **Song Details** | Full metadata, uploader profile + stats, audio player, video player, copy URLs, download audio/video/cover, approve, reject-with-reason, permanent delete |
| **Approved Songs** | Published library grid with playback, video modal, downloads, search/filter/sort, removal |
| **User Management** | Searchable directory, ban/unban, promote/demote admin, permanent delete (cascades songs + files), per-user moderation stats |
| **API Key Management** | Generate `zks_live_…` keys, reveal/copy, revoke/activate, delete, per-key request counters, live sandbox that fires real API requests |
| **Platform Settings** | Website name, tagline, description, logo upload or URL, brand colour pickers + curated palettes, contact email, footer, moderation toggle, registration toggle, max upload size |

### Moderation Semantics (important)
- **Approve** → status `approved`, timestamped, appears in *Approved Songs*, the public catalogue, the global player, and `/api/v1/songs`.
- **Reject** → song row is **deleted from SQLite**, and its audio/thumbnail/video files are **unlinked from disk**, the artist's `rejected_songs_count` is incremented, a notification is sent, and the action is audited. Rejection is irreversible — exactly as specified.
- Shared media is reference-counted before unlinking so deleting one song never breaks another.

### Artist of the Month
Calculated on every relevant request from the database — **no manual input**:
1. Count `approved` songs per uploader where `strftime('%Y-%m', approved_at) = current month`.
2. Rank artists by that count (ties broken by plays, then name).
3. Winner receives the gold crown badge on the landing page, user dashboard, admin dashboard, song cards, user lists, and in API payloads (`is_artist_of_the_month`, `artist_of_month_badge`).
4. New approvals immediately re-rank the leaderboard and notify the leading artist.

Current demo month: **November 2026**.

---

## 🚀 Getting Started

```bash
npm install
npm run dev        # Express API on :4000 + Vite dev server on :5173
```

Then open <http://localhost:5173>.

Production build:

```bash
npm run build      # Vite → dist/
npm start          # Express serves dist/ + /api on :4000
```

Optional environment variables (see `.env.example`): `PORT`, `JWT_SECRET`.

### Demo Accounts

| Role | Email | Password |
| --- | --- | --- |
| Admin | `admin@zksong.io` | `Admin@123` |
| Artist of the Month (Nov 2026) | `aria@zksong.io` | `Artist@123` |
| Artist | `kaelen@zksong.io` | `Artist@123` |
| Artist | `lyra@zksong.io` | `Artist@123` |
| Banned account | `zayn.suspended@zksong.io` | `Artist@123` |

### Demo API Keys

```
zks_live_spotify_demo_key_2026_9f8a7b6c5d4e      Spotify-Like Web Player (Production)
zks_live_pulsewave_mobile_88a1b2c3d4e5f607       PulseWave iOS & Android Music App
```

---

## 🔌 External REST API (v1)

Authenticate with **any** of these transports:

```bash
curl -H "X-API-Key: zks_live_spotify_demo_key_2026_9f8a7b6c5d4e" http://localhost:4000/api/v1/songs
curl -H "Authorization: Bearer zks_live_..."                       http://localhost:4000/api/v1/songs
curl "http://localhost:4000/api/v1/songs?api_key=zks_live_..."
```

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/v1/songs` | All approved songs. Query: `search`, `genre`, `artist`, `is_cover`, `sort` (`latest`/`popular`/`title`), `page`, `limit` |
| `GET` | `/api/v1/songs/:id` | Single approved song |
| `GET` | `/api/v1/artist-of-the-month` | Crown winner, leaderboard, and their approved releases |
| `GET` | `/api/v1/stream/:id` | Audio stream with HTTP 206 range support (`Range` header) |

Every song payload includes: `title`, `artist`, `featured_artist`, `musician`, `composer`, `is_cover_song`, `original_credit`, `genre`, `release_year`, `bpm`, `duration_seconds`, `description`, `lyrics`, `thumbnail_url`, `audio_url`, `stream_url`, `video_url`, `download_url`, play/download counts, approval timestamps, and Artist-of-the-Month flags.

Error contract:

```json
{ "status": "error", "code": "MISSING_API_KEY | INVALID_API_KEY | REVOKED_API_KEY | SONG_NOT_FOUND", "message": "…" }
```

---

## 🗂 Project Structure

```
server/
  db.js              # SQLite schema, seeds, Artist-of-the-Month calculation
  index.js           # Express app: auth, user, admin, public, /api/v1, streaming
  generateMedia.js   # FFmpeg-driven demo audio / cover art / video generator
  data/              # zksong.sqlite
  uploads/
    audio/ thumbnails/ videos/ avatars/ branding/
src/
  App.jsx            # Router + protected/public route guards
  main.jsx
  context/AppContext.jsx      # auth, theme, toasts, branding, global player
  components/        # DashboardLayout, Common UI kit, GlobalPlayer, Toast, badges, WAV/SVG synth
  pages/
    LandingPage.jsx
    AuthPages.jsx               # Login / Register / Forgot+Reset
    user/UserPanel.jsx          # Dashboard / My Songs / Upload / Account
    admin/AdminPanel.jsx        # Dashboard / Songs Management / Approved Songs
    admin/SongDetails.jsx
    admin/UserManagement.jsx
    admin/ApiKeyManagement.jsx
    admin/PlatformSettings.jsx
scripts/
  dom-smoke.cjs      # jsdom end-to-end smoke test across every route
```

---

## 🔒 Security & Reliability Notes

- Passwords hashed with bcrypt (10 rounds); hashes and reset tokens never leave the server (`enrichUser` strips them).
- Every admin route is double-guarded (`requireAuth` → role check); self-ban/self-delete/self-demote are blocked.
- Ban status is re-checked on every authenticated request, so bans take effect immediately.
- Upload validation: MIME **and** extension allow-lists, 120 MB cap, randomised filenames, path traversal blocked by `path.basename` on both read and write.
- Rejection/deletion removes database rows and physical files (reference-counted).
- API keys are 144-bit random, prefixed `zks_live_`, revocable, usage-counted, and never exposed to non-admin routes.
- Audio/video served with `Accept-Ranges`, `Content-Range`, and correct MIME types for smooth seeking.
- Loading skeletons, empty states, toast notifications, optimistic UI where safe, and human-readable error messages throughout.

## 🧪 Verification

```bash
npm run build            # production bundle compiles
npm run smoke:build      # bundle the client for jsdom
npm run smoke -- / /login /admin/dashboard /admin/songs /admin/users /user/dashboard
```

`scripts/dom-smoke.cjs` boots the real client bundle in jsdom against the running dev server, logs in with real credentials, and asserts that every panel page renders its data.
