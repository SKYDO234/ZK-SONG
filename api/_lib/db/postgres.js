// ============================================================================
// ZK-SONG — Postgres store driver
//
// One driver speaks to any Postgres server: Supabase, Neon, Vercel Postgres,
// RDS, or a local `postgres` container. The query methods are intentionally
// async so `pglite` (an in-process Postgres used by the test suite) can
// implement the exact same surface.
// ============================================================================

const DEFAULT_SETTINGS = [
  ['site_name', 'ZK-SONG'],
  [
    'site_tagline',
    'Next-Gen Music Publishing, Cloud Mastering & Global Streaming API',
  ],
  [
    'site_description',
    'The professional music-uploading & distribution ecosystem for artists, musicians, and composers. Upload studio tracks, earn the Artist of the Month crown, and stream globally to external music apps via the ZK-SONG REST API.',
  ],
  ['logo_url', '/uploads/branding/zk-logo.svg'],
  ['primary_color', '#8b5cf6'],
  ['secondary_color', '#06b6d4'],
  ['accent_badge_text', 'STUDIO CLOUD v2.6'],
  ['contact_email', 'support@zksong.io'],
  [
    'footer_text',
    '© 2026 ZK-SONG Music Publishing & API Ecosystem. Built for Artists & Streaming Apps.',
  ],
  ['allow_registration', 'true'],
  ['require_moderation', 'true'],
  ['max_upload_mb', '100'],
  ['platform_total_rejected', '2'],
];

// Mirrors server/db.js (SQLite) column for column, as Postgres types.
// `gen_random_uuid()` is core since Postgres 13, so no extension is required.
const SCHEMA_SQL = `
create table if not exists schema_meta (
  key   text primary key,
  value text not null
);

create table if not exists settings (
  key   text primary key,
  value text not null
);

create table if not exists users (
  id                   uuid primary key default gen_random_uuid(),
  name                 text not null,
  email                text not null unique,
  password_hash        text not null,
  role                 text not null default 'user' check (role in ('user', 'admin')),
  status               text not null default 'active' check (status in ('active', 'banned')),
  avatar_url           text default '',
  bio                  text default '',
  primary_genre        text default 'Electronic',
  country              text default '',
  website              text default '',
  rejected_songs_count integer not null default 0,
  reset_token          text,
  reset_token_expires  timestamptz,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create unique index if not exists users_email_lower_idx on users (lower(email));
-- Exactly one administrator may exist at any time.
create unique index if not exists users_single_admin_idx on users (role) where role = 'admin';

create table if not exists songs (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references users (id) on delete cascade,
  title              text not null,
  artist             text not null,
  featured_artist    text default '',
  musician           text not null,
  composer           text not null,
  is_cover           boolean not null default false,
  original_credit    text default '',
  genre              text not null default 'Electronic',
  release_year       integer default extract(year from now())::int,
  bpm                integer default 120,
  duration           integer not null default 0,
  duration_formatted text not null default '0:00',
  description        text default '',
  lyrics             text default '',
  audio_url          text not null,
  audio_filename     text not null,
  audio_size         bigint default 0,
  audio_mime         text default 'audio/mpeg',
  thumbnail_url      text not null,
  thumbnail_filename text not null,
  video_url          text default '',
  video_filename     text default '',
  video_size         bigint default 0,
  status             text not null default 'pending' check (status in ('approved', 'pending')),
  plays_count        integer not null default 0,
  downloads_count    integer not null default 0,
  approved_at        timestamptz,
  approved_by        uuid references users (id) on delete set null,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create index if not exists songs_status_idx on songs (status);
create index if not exists songs_user_idx on songs (user_id);
create index if not exists songs_approved_at_idx on songs (approved_at desc);
create index if not exists songs_title_lower_idx on songs (lower(title));

create table if not exists api_keys (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  key_prefix     text not null,
  api_key        text not null unique,
  permissions    text not null default 'read:songs,stream:audio,read:artists',
  status         text not null default 'active' check (status in ('active', 'revoked')),
  requests_count integer not null default 0,
  last_used_at   timestamptz,
  created_by     uuid references users (id) on delete set null,
  created_at     timestamptz not null default now()
);

create index if not exists api_keys_key_idx on api_keys (api_key);

create table if not exists notifications (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references users (id) on delete cascade,
  type       text not null default 'system',
  title      text not null,
  message    text not null,
  is_read    boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_idx on notifications (user_id, created_at desc);

create table if not exists activity_logs (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid references users (id) on delete set null,
  actor_name  text default 'System',
  action      text not null,
  target_type text default '',
  target_name text default '',
  details     text default '',
  created_at  timestamptz not null default now()
);

create index if not exists activity_logs_created_idx on activity_logs (created_at desc);
`;

/**
 * @param {object} client A `pg.Pool`/`pg.Client` compatible object.
 * @param {{ bootstrap?: () => Promise<void>, acquire?: () => Promise<{ query: Function, release: Function }> }} [opts]
 */
export function createPostgresStore(client, opts = {}) {
  let schemaReady = null;

  async function run(sql, params = []) {
    // Multi-statement scripts (DDL) and parameterless queries go through the
    // simple query protocol, which Postgres allows for statements like
    // `create extension` and `begin`/`commit`.
    if (!params || params.length === 0) {
      if (typeof client.query === 'function') return client.query(sql);
    }
    return client.query(sql, params);
  }

  async function ensureSchema() {
    if (!schemaReady) {
      schemaReady = (async () => {
        await run(SCHEMA_SQL);
        for (const [k, v] of DEFAULT_SETTINGS) {
          await run('insert into settings (key, value) values ($1, $2) on conflict (key) do nothing', [
            k,
            v,
          ]);
        }
        if (opts.bootstrap) await opts.bootstrap();
      })().catch((err) => {
        schemaReady = null;
        throw err;
      });
    }
    return schemaReady;
  }

  return {
    dialect: 'postgres',
    run,
    ensureSchema,
    async get(sql, params = []) {
      const res = await run(sql, params);
      return res.rows[0];
    },
    async all(sql, params = []) {
      const res = await run(sql, params);
      return res.rows;
    },
    /** Execute on one dedicated session (needed for transactions). */
    async session(fn) {
      if (typeof opts.acquire !== 'function') return fn({ query: run });
      const conn = await opts.acquire();
      try {
        return await fn({ query: (sql, params) => conn.query(sql, params) });
      } finally {
        conn.release();
      }
    },
    /**
     * Serialise a critical section across concurrent cold starts (Vercel may run
     * many instances at once). The advisory lock is released on commit/rollback.
     */
    async withLock(fn, key = 918273645) {
      return this.session(async (conn) => {
        await conn.query('begin');
        try {
          await conn.query('select pg_advisory_xact_lock($1)', [key]);
          const value = await fn();
          await conn.query('commit');
          return value;
        } catch (err) {
          try {
            await conn.query('rollback');
          } catch {
            /* session already gone */
          }
          throw err;
        }
      });
    },
    async close() {
      if (typeof client.end === 'function') await client.end();
    },
  };
}
