// ============================================================================
// ZK-SONG — data layer selector
//
// Two interchangeable stores back the identical API:
//
//   sqlite     file on disk        → Express (npm start), Docker, Render, Fly
//   postgres   DATABASE_URL        → Vercel Functions, Netlify Functions,
//                                    Supabase Edge Functions, Neon, RDS
//
// Both expose the promise-based surface the request handlers use:
//   db.get(sql, params) / db.all(sql, params) / db.run(sql, params)
//   db.insert(sql, params, { idPrefix })  → inserted row id
//   db.ensureSchema() / db.session(fn) / db.withLock(fn)
// ============================================================================

import bcrypt from 'bcryptjs';
import { getAppRoot } from '../paths.js';
import { translateSql, mapParams } from './translate.js';
import { createPostgresStore } from './postgres.js';

const ADMIN_EMAIL = String(process.env.ADMIN_EMAIL || 'admin@gmail.com')
  .trim()
  .toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const ADMIN_NAME = process.env.ADMIN_NAME || 'Platform Administrator';

export const adminAccount = { email: ADMIN_EMAIL, id: null };

/** @returns {'postgres'|'sqlite'} */
export function resolveDialect(env = process.env) {
  if (env.ZK_DB_DIALECT) return env.ZK_DB_DIALECT;
  if (env.DATABASE_URL || env.POSTGRES_URL) return 'postgres';
  return 'sqlite';
}

function databaseUrl(env = process.env) {
  return env.DATABASE_URL || env.POSTGRES_URL || '';
}

/* ------------------------------------------------------------------ sqlite -- */

const SQLITE_SCHEMA = `
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  avatar_url TEXT DEFAULT '',
  bio TEXT DEFAULT '',
  primary_genre TEXT DEFAULT 'Electronic',
  country TEXT DEFAULT 'United States',
  website TEXT DEFAULT '',
  rejected_songs_count INTEGER NOT NULL DEFAULT 0,
  reset_token TEXT DEFAULT NULL,
  reset_token_expires TEXT DEFAULT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS songs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  artist TEXT NOT NULL,
  featured_artist TEXT DEFAULT '',
  musician TEXT NOT NULL,
  composer TEXT NOT NULL,
  is_cover INTEGER NOT NULL DEFAULT 0,
  original_credit TEXT DEFAULT '',
  genre TEXT NOT NULL DEFAULT 'Electronic',
  release_year INTEGER DEFAULT 2026,
  bpm INTEGER DEFAULT 120,
  duration INTEGER NOT NULL DEFAULT 18,
  duration_formatted TEXT NOT NULL DEFAULT '0:18',
  description TEXT DEFAULT '',
  lyrics TEXT DEFAULT '',
  audio_url TEXT NOT NULL,
  audio_filename TEXT NOT NULL,
  audio_size INTEGER DEFAULT 0,
  audio_mime TEXT DEFAULT 'audio/mpeg',
  thumbnail_url TEXT NOT NULL,
  thumbnail_filename TEXT NOT NULL,
  video_url TEXT DEFAULT '',
  video_filename TEXT DEFAULT '',
  video_size INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending',
  plays_count INTEGER NOT NULL DEFAULT 0,
  downloads_count INTEGER NOT NULL DEFAULT 0,
  approved_at TEXT DEFAULT NULL,
  approved_by INTEGER DEFAULT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS api_keys (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  api_key TEXT UNIQUE NOT NULL,
  permissions TEXT NOT NULL DEFAULT 'read:songs,stream:audio,read:artists',
  status TEXT NOT NULL DEFAULT 'active',
  requests_count INTEGER NOT NULL DEFAULT 0,
  last_used_at TEXT DEFAULT NULL,
  created_by INTEGER DEFAULT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS notifications (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  type TEXT NOT NULL DEFAULT 'system',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  is_read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS activity_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  actor_id INTEGER DEFAULT NULL,
  actor_name TEXT DEFAULT 'System',
  action TEXT NOT NULL,
  target_type TEXT DEFAULT '',
  target_name TEXT DEFAULT '',
  details TEXT DEFAULT '',
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
`;

const DEFAULT_SETTINGS = {
  site_name: 'ZK-SONG',
  site_tagline: 'Next-Gen Music Publishing, Cloud Mastering & Global Streaming API',
  site_description:
    'The professional music-uploading & distribution ecosystem for artists, musicians, and composers. Upload studio tracks, earn the Artist of the Month crown, and stream globally to external music apps via the ZK-SONG REST API.',
  logo_url: '/uploads/branding/zk-logo.svg',
  primary_color: '#ecc257',
  secondary_color: '#d9a63a',
  accent_badge_text: 'STUDIO CLOUD v2.6',
  contact_email: 'support@zksong.io',
  footer_text:
    '© 2026 ZK-SONG Music Publishing & API Ecosystem. Built for Artists & Streaming Apps.',
  allow_registration: 'true',
  require_moderation: 'true',
  max_upload_mb: '100',
  platform_total_rejected: '2',
};

export { DEFAULT_SETTINGS };

async function createSqliteStore(opts = {}) {
  const fs = await import('node:fs');
  const path = await import('node:path');
  const { DatabaseSync } = await import('node:sqlite');

  const root = getAppRoot();
  const readOnlyFs = Boolean(
    process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY
  );
  if (!process.env.DATA_DIR && readOnlyFs) {
    throw new Error(
      'DATABASE_URL is not set. This host has a read-only filesystem, so the ' +
        'SQLite fallback cannot work. Set DATABASE_URL to a Postgres connection ' +
        'string (Supabase Session pooler, Neon, Vercel Postgres).'
    );
  }
  const dataDir = process.env.DATA_DIR || path.join(root, 'server', 'data');
  if (dataDir !== ':memory:') fs.mkdirSync(dataDir, { recursive: true });

  const file = dataDir === ':memory:' ? ':memory:' : path.join(dataDir, 'zksong.sqlite');
  const handle = new DatabaseSync(file);
  handle.exec('PRAGMA journal_mode = WAL;');
  handle.exec('PRAGMA foreign_keys = ON;');

  let ready = null;

  async function ensureSchema() {
    if (!ready) {
      ready = (async () => {
        handle.exec(SQLITE_SCHEMA);
        const insert = handle.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
        for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) insert.run(k, v);
        if (opts.bootstrap) await opts.bootstrap();
      })().catch((err) => {
        ready = null;
        throw err;
      });
    }
    return ready;
  }

  return {
    dialect: 'sqlite',
    ensureSchema,
    async run(sql, params = []) {
      return handle.prepare(sql).run(...params);
    },
    async get(sql, params = []) {
      return handle.prepare(sql).get(...params);
    },
    async all(sql, params = []) {
      return handle.prepare(sql).all(...params);
    },
    async insert(sql, params = []) {
      const res = handle.prepare(sql).run(...params);
      return Number(res.lastInsertRowid);
    },
    async session(fn) {
      return fn({ query: async (s, p) => ({ rows: handle.prepare(s).all(...p) }) });
    },
    async withLock(fn) {
      // A single-file SQLite database is already serialised per connection and
      // the Express process runs the bootstrap exactly once at boot.
      return fn();
    },
    async close() {
      handle.close();
    },
  };
}

async function createPgStore(opts = {}) {
  const { default: pg } = await import('pg');
  const url = databaseUrl();
  const isServerless = Boolean(
    process.env.VERCEL || process.env.NETLIFY || process.env.AWS_LAMBDA_FUNCTION_NAME
  );
  const pool = new pg.Pool({
    connectionString: url,
    ssl: /localhost|127\.0\.0\.1|sslmode=disable/.test(url)
      ? false
      : { rejectUnauthorized: false },
    // Serverless: one connection per instance. Every warm instance would
    // otherwise multiply the pool against Supabase's connection quota.
    max: Number(process.env.PGPOOL_MAX || (isServerless ? 1 : 3)),
    idleTimeoutMillis: 10_000,
    connectionTimeoutMillis: 12_000,
  });

  // Node gives a bare "connect ENETUNREACH" when a host resolves only to IPv6
  // and the platform has no IPv6 egress (Vercel, most serverless). The message
  // is useless to a human, so translate it into the actual fix.
  pool.on('error', (err) => {
    if (err && (err.code === 'ENETUNREACH' || err.code === 'EHOSTUNREACH')) {
      console.error(
        '[ZK-SONG] The database host resolves only to IPv6 and this runtime has ' +
          'no IPv6 egress. On Supabase Free, direct connections (db.<ref>.supabase.co) ' +
          'are IPv6-only. Use the Session pooler string instead: ' +
          'postgresql://postgres.<ref>:<password>@aws-N-<region>.pooler.supabase.com:5432/postgres'
      );
    }
  });

  const raws = createPostgresStore(pool, {
    acquire: () => pool.connect(),
    bootstrap: opts.bootstrap,
  });

  // Translate SQLite syntax and placeholders, then run on the pool.
  const q = (sql, params) => pool.query(translateSql(sql), mapParams(params));

  const store = {
    dialect: 'postgres',
    ensureSchema: raws.ensureSchema,
    async run(sql, params = []) {
      const res = await q(sql, params);
      return { changes: res.rowCount ?? 0, lastInsertRowid: res.rows[0]?.id ?? null };
    },
    async get(sql, params = []) {
      const res = await q(sql, params);
      return res.rows[0];
    },
    async all(sql, params = []) {
      const res = await q(sql, params);
      return res.rows;
    },
    /**
     * Postgres cannot report a generated key, so INSERTs that need the id get a
     * RETURNING clause appended (handled by the API helpers, not here).
     */
    async insert(sql, params = []) {
      const text = /returning\s/i.test(sql) ? translateSql(sql) : `${translateSql(sql)} returning id`;
      const res = await pool.query(text, mapParams(params));
      return res.rows[0]?.id ?? null;
    },
    session: (fn) => raws.session(fn),
    withLock: (fn) => raws.withLock(fn),
    async close() {
      await pool.end();
    },
    pool,
  };
  return store;
}

/* ------------------------------------------------------------- bootstrap -- */

/**
 * Guarantee the platform has exactly one administrator.
 * Runs under an advisory lock on Postgres so parallel cold starts cannot race
 * past the single-admin partial unique index.
 */
export async function bootstrapAdmin(store) {
  const body = async () => {
    const email = ADMIN_EMAIL;
    const existing = await store.get('SELECT id, email, role FROM users WHERE LOWER(email) = ?', [
      email,
    ]);
    if (existing) {
      await store.run("UPDATE users SET role = 'admin', status = 'active' WHERE id = ?", [
        existing.id,
      ]);
      adminAccount.id = existing.id;
      adminAccount.email = existing.email;
      return;
    }

    const userCount = await store.get('SELECT COUNT(*) as count FROM users');
    const existingAdmin = await store.get("SELECT id FROM users WHERE role = 'admin'");
    if (existingAdmin && Number(userCount?.count) > 0) {
      // A different account already owns the admin role: it never gains panel
      // access, because requireAdmin also checks the configured owner email.
      adminAccount.id = existingAdmin.id;
      return;
    }

    const hash = bcrypt.hashSync(ADMIN_PASSWORD, 10);
    const now = new Date().toISOString();
    const id = await store.insert(
      `INSERT INTO users (name, email, password_hash, role, status, avatar_url, bio, primary_genre, country, website, rejected_songs_count, created_at, updated_at)
       VALUES (?, ?, ?, 'admin', 'active', '', ?, 'All Genres', '', '', 0, ?, ?)`,
      [ADMIN_NAME, email, hash, 'Platform owner and Head of A&R curation.', now, now]
    );
    adminAccount.id = id;
    adminAccount.email = email;
  };

  if (store.dialect === 'postgres') return store.withLock(body);
  return body();
}

/* --------------------------------------------------------------- factory -- */

let singleton = null;

/**
 * Resolve (and memoise) the store for this process. Serverless runtimes reuse
 * the module instance between invocations, so the pool and schema flag are
 * created once per container.
 */
export async function getStore() {
  if (singleton) {
    await singleton.ensureSchema();
    return singleton;
  }

  const dialect = resolveDialect();
  const created =
    dialect === 'postgres'
      ? await createPgStore({ bootstrap: null })
      : await createSqliteStore();

  await created.ensureSchema();
  await bootstrapAdmin(created);

  singleton = created;
  return singleton;
}

/** Test helper: drop the memoised store (does not close it). */
export function __resetStoreForTests() {
  singleton = null;
}

export { createSqliteStore, createPgStore };
