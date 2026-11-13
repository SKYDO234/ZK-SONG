# Deploying ZK-SONG

ZK-SONG is **one codebase with three deployment shapes**. Same routes, same
database schema, same storage rules — only the host changes.

| Shape | Frontend | API | Database | Media | Best for |
| --- | --- | --- | --- | --- | --- |
| **A. VPS / Docker** | served by the Node server (or nginx) | Node process | SQLite file | local disk | **your 2-core / 4 GB VPS**, Render, Railway, Fly.io |
| **B. Vercel** | Vercel CDN | Vercel Function | Postgres | Supabase Storage | zero-ops, free tier |
| **C. Netlify** | Netlify CDN | Netlify Function | Postgres | Supabase Storage | zero-ops, free tier |
| **D. Hybrid** | Vercel/Netlify | your VPS (shape A) | SQLite (on the VPS) | local disk (on the VPS) | CDN frontend, one server to babysit |

Nothing is configured by hand: the API reads its environment and picks the
right drivers.

```
DATABASE_URL set?     → Postgres        : SQLite file
SUPABASE_URL + key?   → Supabase Storage : server/uploads/
otherwise             → shape A (self-hosted)
```

The API lives in **`api/`** and is shared by every shape:

```
api/_lib/app.js            all routes (the only copy)
api/_lib/db/               sqlite + postgres drivers, SQL translation
api/_lib/storage/          local disk + Supabase drivers
api/_lib/runtime.js        Node req/res adapter (used by all three hosts)
api/index.js               Vercel entry point
netlify/functions/api.mjs  Netlify entry point
server/index.js            Express host (static files + SPA + listener)
```

---

# Shape A — your VPS (recommended for 2 cores / 4 GB / 10 GB)

This is the simplest, cheapest, fastest option and it needs **no** Postgres and
**no** Supabase. One Node process serves the API, the website and the audio.

## A0. What the server will run

| Piece | Footprint |
| --- | --- |
| Node 22 process | ~80–150 MB RAM idle, ~250 MB while streaming/uploading |
| nginx | ~10 MB |
| SQLite database | a few MB per thousand songs |
| Audio + covers | your 10 GB disk (plan ~10–15 MB per track + cover) |

2 cores / 4 GB is comfortable: the API is I/O-bound, and uploads are streamed to
disk rather than buffered in memory.

## A1. One-command bootstrap

Copy the repo to the server first, then run the script from the repo:

```bash
sudo DOMAIN=your-domain.com bash deploy/vps-setup.sh
```

It installs Node 22, nginx, ffmpeg, a firewall and certbot; creates the `zksong`
system user; writes `/etc/zksong.env` (with a generated `JWT_SECRET`),
`/etc/systemd/system/zksong.service` and an nginx reverse proxy; then prints the
remaining commands. Re-running it is safe.

Then:

```bash
cd /opt/zksong
sudo -u zksong npm ci
sudo -u zksong npm run build          # creates dist/ (the website)
sudo nano /etc/zksong.env             # set ADMIN_PASSWORD, then never share it
sudo systemctl restart zksong
sudo systemctl status zksong
```

Verify:

```bash
curl localhost:4000/api/health
# {"status":"ok","service":"ZK-SONG API","storage":"local","db":"sqlite"}
curl localhost:4000/api/public/bootstrap
```

Open `http://<your-ip>/` and log in as `admin@gmail.com`.

## A2. HTTPS

Point your domain's **A record** at the server IP, then:

```bash
sudo certbot --nginx -d your-domain.com
```

certbot edits the nginx site in place and installs a renewal timer. Set
`ALLOWED_ORIGIN=https://your-domain.com` in `/etc/zksong.env` and restart.

## A3. Where the data lives (this matters for backups)

| What | Path | Why |
| --- | --- | --- |
| SQLite database | `/var/lib/zksong/zksong.sqlite` | `DATA_DIR` — outside the git checkout, survives deploys |
| Uploaded audio | `/opt/zksong/server/uploads/audio` | `UPLOADS_DIR` |
| Covers / videos / avatars | `.../uploads/thumbnails`, `videos`, `avatars` | |
| Branding logo | `.../uploads/branding` | |

Both are writable by the service (`ReadWritePaths` in the unit) and excluded from
git.

**Backup (database + media in one archive):**

```bash
sudo -u zksong tar czf /var/backups/zksong-$(date +%F).tar.gz \
  /var/lib/zksong /opt/zksong/server/uploads
```

Restore = stop the service, unpack, start. Add a cron entry:

```bash
sudo crontab -u zksong -e
# daily at 03:15
15 3 * * * tar czf /var/backups/zksong-$(date +\%F).tar.gz /var/lib/zksong /opt/zksong/server/uploads
```

Copy `/var/backups` off the box (rsync/object storage) — a backup on the same
disk does not survive a disk failure.

**Disk guard:** the platform enforces `MAX_UPLOAD_MB` (default 120) per file.
With 10 GB, keep an eye on usage; `df -h /opt` and `du -sh /opt/zksong/server/uploads/*`.

## A4. Updating the site

```bash
cd /opt/zksong
sudo -u zksong git pull
sudo -u zksong npm ci
sudo -u zksong npm run build
sudo systemctl restart zksong
```

There are no database migrations to run: the schema is created on boot and new
columns are added idempotently.

## A5. Using Docker instead (optional)

If you prefer containers, one image serves API + website:

```bash
docker build -t zk-song .
docker run -d --name zk-song -p 4000:4000 \
  -e ADMIN_EMAIL=admin@gmail.com \
  -e ADMIN_PASSWORD='change-me' \
  -e JWT_SECRET="$(openssl rand -hex 32)" \
  -v zk-song-data:/data \
  zk-song
```

The image has a healthcheck on `/api/health`, runs as the non-root `node` user,
and keeps the database at `/data` plus media under `/app/server/uploads`
(mount a volume there too if you want media to survive a rebuild, or set
`UPLOADS_DIR=/data/uploads`).

## A6. Tuning for 2 cores / 4 GB

Already applied by the setup script (nginx `client_max_body_size 130m`,
`proxy_request_buffering off`, 300 s timeouts). Optional extras:

- `NODE_OPTIONS=--max-old-space-size=1024` in `/etc/zksong.env` if you ever see
  memory pressure (the API does not buffer uploads, so it should not).
- Keep SQLite on the local volume (never on NFS).
- `ffmpeg` is installed for future transcoding; it is not on the request path.

---

# Shape B — Vercel (functions + Supabase)

## B1. Why a database and a bucket are required

Vercel functions are stateless with an ephemeral filesystem, and **request and
response bodies are capped at 4.5 MB** (not configurable). ZK-SONG accepts 120 MB
masters, so:

- **metadata** (users, songs, counters) → Postgres
- **bytes** (audio, covers, videos) → Supabase Storage, uploaded **directly from
  the browser** with a signed URL, never through the function
- **streaming** → `302` redirect to the storage CDN, which supports `Range`/206

The API reports which mode it is in via `/api/uploads/config`, and the frontend
switches upload transport automatically.

## B2. Create the database

In Supabase → **SQL Editor**, run `supabase/schema.sql`. It creates the tables,
indexes, the single-admin index and the public `media` bucket.

## B2b. Use the pooler string, not the direct host ⚠️

On the Supabase **Free** plan the direct host (`db.<ref>.supabase.co`) is
**IPv6-only**. Vercel Functions have no IPv6 egress, so that string fails with
`ENETUNREACH` on every request.

Copy the string from Supabase → **Connect → Session pooler** instead:

```
postgresql://postgres.<project-ref>:<password>@aws-N-<region>.pooler.supabase.com:5432/postgres
```

- The username is `postgres.<project-ref>`, not `postgres`.
- Port **5432** = session mode. Use it: `withLock` runs `pg_advisory_xact_lock`
  inside an explicit transaction, and advisory locks do not survive transaction
  mode on port 6543.
- `aws-N` is a pooler cluster index, **not** the region name. A region can have
  several, so copy the host from the dialog — it cannot be derived.

If the API cannot start it answers `503` with a JSON body naming the cause
(`DB_UNREACHABLE`, `DB_AUTH_FAILED`, `DATABASE_URL_MISSING`, …) rather than
letting the platform return an HTML error page.

## B3. Deploy

```bash
vercel                      # link the project
vercel env add DATABASE_URL production
vercel env add SUPABASE_URL production
vercel env add SUPABASE_SERVICE_ROLE_KEY production
vercel env add JWT_SECRET production
vercel env add ADMIN_EMAIL production
vercel env add ADMIN_PASSWORD production
vercel --prod
```

`vercel.json` is already wired:

- `/api/*` → `api/index.js`
- `/uploads/*` → `api/index.js` (redirects to the CDN)
- everything else → the SPA

First request creates the schema, the admin account and the bucket policy
(idempotent, protected by a Postgres advisory lock so parallel cold starts cannot
race).

## B4. Verify

```bash
curl https://your-app.vercel.app/api/health
# {"status":"ok",...,"storage":"supabase","db":"postgres"}
```

Upload a track: the browser should talk to `*.supabase.co` directly (visible in
DevTools → Network) and the API should only receive a few KB.

---

# Shape C — Netlify (functions + Supabase)

Same requirements as shape B. `netlify.toml` routes `/api/*` and `/uploads/*` to
`netlify/functions/api.mjs` with esbuild bundling.

```bash
netlify init
netlify env:set DATABASE_URL "postgres://..."
netlify env:set SUPABASE_URL "https://<ref>.supabase.co"
netlify env:set SUPABASE_SERVICE_ROLE_KEY "..."
netlify env:set JWT_SECRET "..."
netlify env:set ADMIN_EMAIL "admin@gmail.com"
netlify env:set ADMIN_PASSWORD "..."
netlify deploy --build --prod
```

Netlify buffers request bodies at 6 MB (20 MB streamed); direct-to-storage
uploads keep you far below that.

---

# Shape D — CDN frontend + VPS API

Put the website on Vercel/Netlify and keep the API on your VPS (shape A):

1. Build the frontend with the API URL baked in:

   ```bash
   VITE_API_BASE_URL=https://api.your-domain.com npm run build
   ```

   On Vercel/Netlify set that as an environment variable instead.

2. On the VPS allow the CORS origin:

   ```bash
   ALLOWED_ORIGIN=https://your-site.vercel.app
   ```

3. Make sure `UPLOADS_DIR` media is publicly reachable — the VPS serves
   `/uploads/...` itself, which is what the API returns.

This shape keeps **all** data on your own box while the website is served from a
global CDN.

---

# Environment variables

| Variable | Required | Used by | Meaning |
| --- | --- | --- | --- |
| `PORT` | no | A | HTTP port (default 4000) |
| `NODE_ENV` | no | A | `production` enables warnings/log hygiene |
| `ADMIN_EMAIL` | **yes** | all | the one account allowed into the admin panel |
| `ADMIN_PASSWORD` | **yes** | all | bootstrapped on first run only |
| `ADMIN_NAME` | no | all | display name for the owner |
| `JWT_SECRET` | **yes** | all | session signing key — long and random |
| `ALLOWED_ORIGIN` | no | all | comma-separated CORS allowlist |
| `DATA_DIR` | no | A | SQLite location (default `server/data`) |
| `UPLOADS_DIR` | no | A | media root (default `server/uploads`) |
| `MAX_UPLOAD_MB` | no | all | per-file limit (default 120) |
| `DATABASE_URL` | B/C | B/C | Postgres string — **use the Session pooler** (see B2b) |
| `SUPABASE_URL` | B/C | B/C | project URL |
| `SUPABASE_SERVICE_ROLE_KEY` | B/C | B/C | Storage writes/deletes |
| `SUPABASE_BUCKET` | no | B/C | defaults to `media` |
| `VITE_API_BASE_URL` | D | build | API origin for a separately-hosted frontend |

# First-run checklist

1. `GET /api/health` returns `status: ok` and the expected `db`/`storage`.
2. Log in as `admin@gmail.com` with the password you configured.
3. `/api/auth/me` shows `"is_platform_owner": true`.
4. Platform Settings → save a change, confirm it persists after a reload.
5. Upload a track as an artist → it appears in **pending**.
6. Approve it → it appears on the landing page **and** in `/api/v1/songs`.
7. Create an API key and call `/api/v1/songs` with `X-API-Key`.
8. Reject a different track → its files disappear from `uploads/` (or the bucket).
9. Restart the service and confirm the data is still there.

# Verification commands

```bash
npm test              # 46 API checks on SQLite + 46 on Postgres + 28 serverless checks
npm run smoke         # 9 UI routes rendered with jsdom (needs the dev server)
npm run smoke:ui      # 7 interaction flows, provisions and cleans up its own data
```

`npm run test:api:pg` runs the whole API suite against an in-process Postgres
(PGlite) — the same SQL the Vercel/Netlify deployments execute.
