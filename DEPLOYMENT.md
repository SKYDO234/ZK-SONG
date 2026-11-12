# Deploying ZK-SONG

ZK-SONG has two halves:

| Half | What it is | Where it can live |
| --- | --- | --- |
| **Frontend** | React + Vite static bundle (`dist/`) | Vercel, Netlify, Cloudflare Pages, any CDN |
| **Backend** | REST API, auth, uploads, streaming | Supabase Edge Functions + Storage, Docker (Render/Railway/Fly/Koyeb/VPS) |

> **Why can't Vercel/Netlify host the API?** They run stateless serverless functions
> with an ephemeral filesystem, read-only bundles and short request timeouts. This
> platform stores uploaded audio, covers and music videos on disk and streams them
> with HTTP Range requests. That needs a persistent volume (Docker host) or object
> storage (Supabase Storage). Both options are provided below — the frontend itself
> deploys to Vercel and Netlify perfectly.

There are exactly **three supported topologies**. Pick one.

---

## Option A — Everything on one Docker host (simplest)

One container serves both the API and the built SPA, with a mounted volume for media.

```bash
docker build -t zk-song .
docker run -d --name zk-song \
  -p 4000:4000 \
  -e ADMIN_EMAIL=admin@gmail.com \
  -e ADMIN_PASSWORD=admin123 \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  -v zk-song-data:/data \
  zk-song
```

Open `http://localhost:4000` — the API and the site are on the same origin, so
`VITE_API_BASE_URL` stays empty.

**Render** (one click, `render.yaml` is included): create a Blueprint from the repo,
set `ADMIN_EMAIL` / `ADMIN_PASSWORD`, and Render provisions the 5 GB disk at `/data`.

The same Dockerfile works unchanged on Railway, Fly.io (`fly launch`), Koyeb,
DigitalOcean App Platform and any VPS with Docker.

---

## Option B — Frontend on Vercel/Netlify + API on Supabase (fully serverless)

This is the zero-server path: Postgres for data, Storage for media, an Edge Function
for the API.

### 1. Database

Create a Supabase project, open **SQL Editor**, and run
[`supabase/schema.sql`](supabase/schema.sql). It creates every table, index, the
`media` storage bucket with public read, and enables RLS (the service-role key used
by the function bypasses it — the anon key can read nothing).

### 2. Deploy the API function

```bash
npm i -g supabase
supabase login
supabase link --project-ref <your-project-ref>

supabase secrets set \
  ADMIN_EMAIL=admin@gmail.com \
  ADMIN_PASSWORD=admin123 \
  APP_JWT_SECRET="$(openssl rand -hex 32)"

# --no-verify-jwt: ZK-SONG issues and validates its own session JWTs
supabase functions deploy api --no-verify-jwt
```

Your API is now at:

```
https://<project-ref>.supabase.co/functions/v1/api
```

Verify:

```bash
curl https://<project-ref>.supabase.co/functions/v1/api/health
# {"status":"ok","service":"zk-song-api","storage":"media"}
```

The administrator account is created automatically on the first request — never by
SQL — from `ADMIN_EMAIL` / `ADMIN_PASSWORD`. Change the password from
**Account Management** after the first login.

### 3. Frontend on Vercel

1. Import the repository at <https://vercel.com/new>.
2. Framework preset: **Vite** (auto-detected; `vercel.json` is included).
3. Add an environment variable:

   ```
   VITE_API_BASE_URL = https://<project-ref>.supabase.co/functions/v1/api
   ```

4. Deploy.

`vercel.json` already handles the SPA fallback (`/admin/songs/:id` → `index.html`)
and long-lived asset caching.

### 4. Frontend on Netlify

1. **Add new site → Import an existing project**, pick the repo.
2. Build command `npm run build`, publish directory `dist` (already in `netlify.toml`).
3. Site configuration → Environment variables:

   ```
   VITE_API_BASE_URL = https://<project-ref>.supabase.co/functions/v1/api
   ```

4. Deploy.

### How the frontend finds the API

`src/lib/apiBase.js` reads `VITE_API_BASE_URL` at build time and patches
`window.fetch` once, so every relative `/api/...` call and every media URL
(`/uploads/...`) automatically targets the remote origin. When the variable is empty
the app uses same-origin URLs — which is what the Docker/Vite-dev setups expect. No
component code changes between hosting models.

---

## Option C — Frontend on Vercel/Netlify + API on Docker

Same as Option B, but set `VITE_API_BASE_URL` to your container URL
(`https://zk-song.onrender.com`) and add the site origin to the API's `ALLOWED_ORIGIN`
so CORS is locked down:

```bash
ALLOWED_ORIGIN=https://your-site.vercel.app,https://your-site.netlify.app
```

---

## Environment variables

| Variable | Used by | Purpose |
| --- | --- | --- |
| `ADMIN_EMAIL` | API | The **only** account that can ever hold the admin role. Default `admin@gmail.com` |
| `ADMIN_PASSWORD` | API | Bootstrap password for that account. Default `admin123` — change in production |
| `ADMIN_NAME` | API | Display name for the administrator |
| `JWT_SECRET` / `APP_JWT_SECRET` | API | Session signing secret. **Set this in production** |
| `ALLOWED_ORIGIN` | Express API | Comma-separated CORS allow-list |
| `DATA_DIR` | Express API | Where the SQLite file lives (use `/data` on containers) |
| `VITE_API_BASE_URL` | Frontend build | Remote API origin for static hosts |

---

## First-run checklist

1. Log in as `admin@gmail.com` / `admin123`.
2. **Platform Settings** → set site name, logo, colours, contact email.
3. **Account Management** → change the administrator password.
4. **API Key Management** → generate a key for each external music client.
5. Share the **Register** link with artists; uploads arrive in **Songs Management**
   for approval.

## Notes

- The database starts **empty** — no demo artists, songs, keys or activity.
- `server/uploads/branding/zk-logo.svg` is the only bundled asset (the platform logo);
  `public/zk-logo.svg` is its static-host copy used before settings load.
- SQLite + local disk are the default. For multi-instance deployments on Supabase
  Postgres + Storage, use the edge function instead of the Express server.
- `GET /api/public/bootstrap` is the health endpoint used by every host config here.
