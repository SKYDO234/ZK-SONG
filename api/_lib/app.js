// ============================================================================
// ZK-SONG — the API, platform neutral
//
// This module contains every route of the platform exactly once. It knows
// nothing about Express, Vercel or Netlify: it takes a normalised request and
// returns a normalised response descriptor. Runtime adapters (server/index.js,
// api/index.js, netlify/functions/api.mjs) only translate protocols.
//
// Data + media come from the pluggable stores in ./db and ./storage, so the
// same code runs against SQLite+disk locally and Postgres+Supabase in the cloud.
// ============================================================================

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import {
  HttpError,
  badRequest,
  conflict,
  createRouter,
  file,
  forbidden,
  headerBag,
  json,
  notFound,
  parseUrl,
  raw,
  redirect,
  unauthorized,
} from './http.js';
import { parseMultipart, validateUpload } from './multipart.js';
import { getStaticRoots } from './paths.js';
import { diagnoseConfig } from './runtime.js';

const DEFAULT_MAX_UPLOAD_MB = 120;

export function createApi({ db, storage, env = process.env }) {
  const JWT_SECRET = env.JWT_SECRET || env.APP_JWT_SECRET || 'zk-song-dev-only-change-me';
  const OWNER_EMAIL = String(env.ADMIN_EMAIL || 'admin@gmail.com').trim().toLowerCase();
  const MAX_UPLOAD_MB = Number(env.MAX_UPLOAD_MB || DEFAULT_MAX_UPLOAD_MB);
  const isPg = db.dialect === 'postgres';

  /** Booleans are 1/0 in SQLite and true/false in Postgres. */
  const bool = (v) => (isPg ? Boolean(v) : v ? 1 : 0);

  /* ------------------------------------------------------------- helpers -- */

  const isPlatformOwner = (user) =>
    Boolean(user) && String(user.email || '').trim().toLowerCase() === OWNER_EMAIL;

  const iso = () => new Date().toISOString();

  /** Canonical storage key (`audio/x.wav`) from any URL/path we may have stored. */
  function storageKey(value) {
    const s = String(value || '');
    if (!s) return '';
    const uploads = s.match(/\/uploads\/([^/?#]+)\/([^/?#]+)/);
    if (uploads) return `${uploads[1]}/${decodeURIComponent(uploads[2])}`;
    const supa = s.match(/\/object\/public\/[^/]+\/(.+?)(?:\?|$)/);
    if (supa) return decodeURIComponent(supa[1]);
    return s.replace(/^\/+/, '');
  }

  /** Public URL for a stored media path, resolved per storage backend. */
  function mediaUrl(value, origin = '') {
    const path = String(value || '');
    if (!path) return '';
    if (/^(https?:|data:|blob:)/i.test(path)) return path;
    if (storage.kind === 'supabase') return storage.publicUrl(storageKey(path));
    return origin ? `${origin}${path}` : path;
  }

  /** Keep a canonical path in the DB but expose CDN URLs when needed. */
  function exposeSong(song, origin) {
    if (storage.kind === 'local') return song;
    return {
      ...song,
      audio_url: mediaUrl(song.audio_url, origin),
      thumbnail_url: mediaUrl(song.thumbnail_url, origin),
      video_url: song.video_url ? mediaUrl(song.video_url, origin) : '',
    };
  }

  function exposeSettings(settings) {
    const out = { ...settings };
    if (out.logo_url && storage.kind !== 'local') {
      // The bundled default logo ships with the static site.
      out.logo_url = /zk-logo\.svg$/.test(out.logo_url)
        ? '/zk-logo.svg'
        : mediaUrl(out.logo_url);
    }
    return out;
  }

  async function getSettingsMap() {
    const rows = await db.all('SELECT key, value FROM settings');
    const map = {};
    for (const row of rows) map[row.key] = row.value;
    return map;
  }

  async function logActivity({ actor, action, targetType = '', targetName = '', details = '' }) {
    await db.run(
      `INSERT INTO activity_logs (actor_id, actor_name, action, target_type, target_name, details, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [actor?.id ?? null, actor?.name || 'System', action, targetType, targetName, details, iso()]
    );
  }

  async function notify({ userId, type = 'system', title, message }) {
    await db.run(
      `INSERT INTO notifications (user_id, type, title, message, created_at) VALUES (?, ?, ?, ?, ?)`,
      [userId, type, title, message, iso()]
    );
  }

  /* ------------------------------------------------------ auth middleware -- */

  async function authUser(c) {
    const header = c.headers.authorization || '';
    if (!header.startsWith('Bearer ')) {
      throw unauthorized('Authentication required. Please log in.');
    }
    let payload;
    try {
      payload = jwt.verify(header.slice(7), JWT_SECRET);
    } catch {
      throw unauthorized('Invalid or expired session token. Please log in again.');
    }
    const user = await db.get('SELECT * FROM users WHERE id = ?', [payload.id]);
    if (!user) throw unauthorized('Account no longer exists.');
    if (user.status === 'banned') {
      throw forbidden(
        'Your account has been banned by an administrator. Contact platform support.'
      );
    }
    return user;
  }

  async function adminUser(c) {
    const user = await authUser(c);
    if (user.role !== 'admin' || !isPlatformOwner(user)) {
      throw forbidden('Administrator privileges required.');
    }
    return user;
  }

  async function requireApiKey(c) {
    const raw_key =
      c.headers['x-api-key'] ||
      c.query.api_key ||
      (c.headers.authorization?.startsWith('Bearer ') ? c.headers.authorization.slice(7) : null);

    if (!raw_key) {
      throw new HttpError(401, {
        status: 'error',
        code: 'MISSING_API_KEY',
        message:
          'API key required. Pass your key via the "X-API-Key" header, "Authorization: Bearer <api_key>" header, or "?api_key=" query parameter.',
      });
    }

    const row = await db.get('SELECT * FROM api_keys WHERE api_key = ?', [String(raw_key).trim()]);
    if (!row) {
      throw new HttpError(401, {
        status: 'error',
        code: 'INVALID_API_KEY',
        message: 'The provided API key is invalid or does not exist.',
      });
    }
    if (row.status !== 'active') {
      throw new HttpError(403, {
        status: 'error',
        code: 'REVOKED_API_KEY',
        message: 'This API key has been revoked by an administrator.',
      });
    }
    await db.run('UPDATE api_keys SET requests_count = requests_count + 1, last_used_at = ? WHERE id = ?', [
      iso(),
      row.id,
    ]);
    return row;
  }

  function signToken(user) {
    return jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, {
      expiresIn: '7d',
    });
  }

  /* --------------------------------------------------------- enrichment -- */

  async function getArtistOfTheMonth(targetYearMonth = null) {
    const now = new Date();
    const ym = targetYearMonth || now.toISOString().slice(0, 7);
    const [yearStr, monthStr] = ym.split('-');
    const monthNames = [
      'January', 'February', 'March', 'April', 'May', 'June',
      'July', 'August', 'September', 'October', 'November', 'December',
    ];
    const monthIndex = Math.max(0, Math.min(11, parseInt(monthStr, 10) - 1));
    const monthLabel = `${monthNames[monthIndex]} ${yearStr}`;

    const monthlySql = `
      SELECT
        u.id as user_id, u.name, u.email, u.avatar_url, u.bio, u.primary_genre, u.country, u.website,
        COUNT(s.id) as monthly_approved_count,
        (SELECT COUNT(*) FROM songs s2 WHERE s2.user_id = u.id AND s2.status = 'approved') as total_approved_count,
        COALESCE(SUM(s.plays_count), 0) as monthly_plays,
        COALESCE(SUM(s.downloads_count), 0) as monthly_downloads,
        MAX(COALESCE(s.approved_at, s.created_at)) as last_approved_at
      FROM users u
      JOIN songs s ON s.user_id = u.id
      WHERE s.status = 'approved'
        AND u.status = 'active'
        AND strftime('%Y-%m', COALESCE(s.approved_at, s.created_at)) = ?
      GROUP BY u.id
      ORDER BY monthly_approved_count DESC, monthly_plays DESC, total_approved_count DESC, u.id ASC
      LIMIT 10`;

    const allTimeSql = `
      SELECT
        u.id as user_id, u.name, u.email, u.avatar_url, u.bio, u.primary_genre, u.country, u.website,
        COUNT(s.id) as monthly_approved_count,
        COUNT(s.id) as total_approved_count,
        COALESCE(SUM(s.plays_count), 0) as monthly_plays,
        COALESCE(SUM(s.downloads_count), 0) as monthly_downloads,
        MAX(COALESCE(s.approved_at, s.created_at)) as last_approved_at
      FROM users u
      JOIN songs s ON s.user_id = u.id
      WHERE s.status = 'approved'
        AND u.status = 'active'
      GROUP BY u.id
      ORDER BY total_approved_count DESC, monthly_plays DESC, u.id ASC
      LIMIT 10`;

    let leaderboard = await db.all(monthlySql, [ym]);
    let calculationMode = 'monthly';
    if (leaderboard.length === 0) {
      calculationMode = 'all_time_fallback';
      leaderboard = await db.all(allTimeSql);
    }

    const winner = leaderboard.length > 0 ? leaderboard[0] : null;
    const winnerSongs = winner
      ? await db.all(
          `SELECT * FROM songs WHERE user_id = ? AND status = 'approved'
           ORDER BY COALESCE(approved_at, created_at) DESC`,
          [winner.user_id]
        )
      : [];

    return {
      year_month: ym,
      month_label: monthLabel,
      calculation_mode: calculationMode,
      badge_label: 'Artist of the Month',
      winner: winner
        ? {
            ...winner,
            is_artist_of_the_month: true,
            badge: {
              title: 'Artist of the Month',
              month: monthLabel,
              monthly_approved_count: winner.monthly_approved_count,
              total_approved_count: winner.total_approved_count,
            },
            approved_songs: winnerSongs,
          }
        : null,
      leaderboard: leaderboard.map((entry, idx) => ({
        ...entry,
        rank: idx + 1,
        is_artist_of_the_month: idx === 0,
      })),
    };
  }

  async function enrichSongs(songs, origin = '') {
    if (!songs || songs.length === 0) return [];
    const aotm = await getArtistOfTheMonth();
    const winnerId = aotm.winner ? aotm.winner.user_id : null;
    const users = await db.all(
      'SELECT id, name, email, avatar_url, bio, primary_genre, country, status FROM users'
    );
    const userMap = Object.fromEntries(users.map((u) => [String(u.id), u]));

    return songs.map((s) => {
      const uploader = userMap[String(s.user_id)] || {
        id: s.user_id,
        name: s.artist,
        email: '',
        avatar_url: '',
      };
      // Compare as strings so integer (SQLite) and uuid (Postgres) ids both work.
      const isAotm = winnerId !== null && String(s.user_id) === String(winnerId);
      const exposed = exposeSong(s, origin);
      return {
        ...exposed,
        // Canonical, storage-agnostic references — what API v1 clients and the
        // delete paths should rely on. `audio_url`/`thumbnail_url` above may be
        // rewritten to a CDN URL depending on the deployment.
        audio_storage_path: s.audio_url,
        thumbnail_storage_path: s.thumbnail_url,
        video_storage_path: s.video_url || null,
        is_cover: Boolean(s.is_cover),
        cover_song_label: s.is_cover ? 'Yes' : 'No',
        has_video: Boolean(s.video_url),
        full_audio_url: mediaUrl(s.audio_url, origin),
        full_thumbnail_url: mediaUrl(s.thumbnail_url, origin),
        full_video_url: s.video_url ? mediaUrl(s.video_url, origin) : null,
        is_artist_of_the_month: isAotm,
        artist_of_month_badge: isAotm
          ? {
              title: 'Artist of the Month',
              month: aotm.month_label,
              monthly_approved_count: aotm.winner.monthly_approved_count,
            }
          : null,
        uploader: {
          id: uploader.id,
          name: uploader.name,
          email: uploader.email,
          avatar_url: uploader.avatar_url,
          primary_genre: uploader.primary_genre,
          country: uploader.country,
          is_artist_of_the_month: isAotm,
        },
      };
    });
  }

  async function enrichUser(user) {
    if (!user) return null;
    const aotm = await getArtistOfTheMonth();
    const isAotm = aotm.winner && String(aotm.winner.user_id) === String(user.id);

    const counts =
      (await db.get(
        `SELECT
          COUNT(*) as active_count,
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
          COALESCE(SUM(plays_count), 0) as total_plays,
          COALESCE(SUM(downloads_count), 0) as total_downloads
        FROM songs WHERE user_id = ?`,
        [user.id]
      )) || {};

    const approved = Number(counts.approved_count || 0);
    const pending = Number(counts.pending_count || 0);
    const rejected = Number(user.rejected_songs_count || 0);

    const monthly = await db.get(
      `SELECT COUNT(*) as c FROM songs
       WHERE user_id = ? AND status = 'approved'
       AND strftime('%Y-%m', COALESCE(approved_at, created_at)) = ?`,
      [user.id, aotm.year_month]
    );

    const { password_hash, reset_token, reset_token_expires, ...safeUser } = user;
    return {
      ...safeUser,
      avatar_url: mediaUrl(safeUser.avatar_url),
      is_artist_of_the_month: Boolean(isAotm),
      artist_of_month_badge: isAotm
        ? {
            title: 'Artist of the Month',
            month: aotm.month_label,
            monthly_approved_count: aotm.winner.monthly_approved_count,
          }
        : null,
      stats: {
        uploaded: approved + pending + rejected,
        active_songs: approved + pending,
        approved,
        pending,
        rejected,
        monthly_approved: Number(monthly?.c || 0),
        total_plays: Number(counts.total_plays || 0),
        total_downloads: Number(counts.total_downloads || 0),
      },
    };
  }

  /* -------------------------------------------------- media file removal -- */

  async function deleteSongMedia(song) {
    if (!song) return;
    const checks = [
      ['audio_filename', song.audio_url],
      ['thumbnail_filename', song.thumbnail_url],
      ['video_filename', song.video_url],
    ];
    for (const [column, url] of checks) {
      const filename = song[column];
      if (!filename) continue;
      const shared = await db.get(
        `SELECT COUNT(*) as c FROM songs WHERE ${column} = ? AND id != ?`,
        [filename, song.id]
      );
      if (Number(shared.c) > 0) continue;
      const key = storageKey(url || filename);
      try {
        await storage.remove(key);
      } catch (err) {
        console.warn('[ZK-SONG] Could not delete media object', key, err.message);
      }
    }
  }

  /* ------------------------------------------------------------- router -- */

  const router = createRouter();

  // NOTE: deliberately no GET / route — the Express host serves the built SPA at
  // the root, and claiming that path here would shadow the website.
  router.get('/api/health', async () => {
    // Configuration problems are reported here rather than only on failure, so
    // one request after a deploy shows everything that still needs setting.
    const config = diagnoseConfig(env);
    return json({
      status: 'ok',
      service: 'ZK-SONG API',
      time: iso(),
      storage: storage.kind,
      db: db.dialect,
      ...(config.missing.length || config.warnings.length
        ? { config_warnings: [...config.missing, ...config.warnings] }
        : {}),
    });
  });

  /* --------------------------------------------------- public & bootstrap */

  router.get('/api/public/bootstrap', async (c) => {
    const settings = await getSettingsMap();
    const aotm = await getArtistOfTheMonth();
    const approvedRaw = await db.all(
      `SELECT * FROM songs WHERE status = 'approved' ORDER BY COALESCE(approved_at, created_at) DESC`
    );
    const approvedSongs = await enrichSongs(approvedRaw, c.origin);

    if (aotm.winner) {
      aotm.winner.approved_songs = await enrichSongs(aotm.winner.approved_songs || [], c.origin);
    }

    const totalArtists = await db.get(
      "SELECT COUNT(*) as c FROM users WHERE role = 'user' AND status = 'active'"
    );
    const totalPlays = await db.get(
      "SELECT COALESCE(SUM(plays_count), 0) as c FROM songs WHERE status = 'approved'"
    );
    const activeKeys = await db.get("SELECT COUNT(*) as c FROM api_keys WHERE status = 'active'");

    const newestKey = await db.get(
      "SELECT api_key FROM api_keys WHERE status = 'active' ORDER BY created_at DESC LIMIT 1"
    );

    return json({
      settings: exposeSettings(settings),
      artist_of_the_month: aotm,
      approved_songs: approvedSongs,
      demo_api_key: newestKey ? newestKey.api_key : null,
      upload: {
        max_upload_mb: MAX_UPLOAD_MB,
        direct_upload: storage.supportsSignedUploads,
        storage: storage.kind,
      },
      stats: {
        approved_songs_count: approvedSongs.length,
        artists_count: Number(totalArtists.c || 0),
        total_plays: Number(totalPlays.c || 0),
        active_api_integrations: Number(activeKeys.c || 0),
      },
    });
  });

  router.post('/api/public/songs/:id/play', async (c) => {
    await db.run('UPDATE songs SET plays_count = plays_count + 1 WHERE id = ?', [c.params.id]);
    const updated = await db.get('SELECT id, plays_count FROM songs WHERE id = ?', [c.params.id]);
    return json({ success: true, song: updated });
  });

  router.get('/api/public/songs/:id/download', async (c) => {
    const song = await db.get('SELECT * FROM songs WHERE id = ?', [c.params.id]);
    if (!song) throw notFound('Song not found.');

    await db.run('UPDATE songs SET downloads_count = downloads_count + 1 WHERE id = ?', [song.id]);

    const type = c.query.type || 'audio';
    const clean = String(song.title).replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'zk-song';
    const pick =
      type === 'video' && song.video_url
        ? { url: song.video_url, name: `${clean} - ${song.artist}${ext(song.video_url)}` }
        : type === 'thumbnail' && song.thumbnail_url
          ? { url: song.thumbnail_url, name: `${clean} - Cover${ext(song.thumbnail_url)}` }
          : { url: song.audio_url, name: `${clean} - ${song.artist}${ext(song.audio_url)}` };

    if (storage.kind === 'local') {
      const absolute = storage.absolutePath(storageKey(pick.url));
      if (!storage.exists(storageKey(pick.url))) throw notFound('Requested media file not found on storage');
      return file(absolute, {
        headers: { 'Content-Type': mimeFor(pick.url) },
        downloadName: pick.name,
      });
    }
    return redirect(mediaUrl(pick.url, c.origin));
  });

  /* --------------------------------------------------------------- auth -- */

  router.post('/api/auth/register', async (c) => {
    const settings = await getSettingsMap();
    if (settings.allow_registration === 'false') {
      throw forbidden(
        'New user registrations are currently disabled by the platform administrator.'
      );
    }
    const { name, email, password, primary_genre, bio, country } = c.body || {};
    if (!name || !email || !password) throw badRequest('Name, email, and password are required.');
    if (String(password).length < 6) throw badRequest('Password must be at least 6 characters long.');

    const normalizedEmail = String(email).trim().toLowerCase();
    if (normalizedEmail === OWNER_EMAIL) {
      throw conflict('An account with this email address already exists.');
    }
    const existing = await db.get('SELECT id FROM users WHERE LOWER(email) = ?', [normalizedEmail]);
    if (existing) throw conflict('An account with this email address already exists.');

    const now = iso();
    const userId = await db.insert(
      `INSERT INTO users (name, email, password_hash, role, status, avatar_url, bio, primary_genre, country, created_at, updated_at)
       VALUES (?, ?, ?, 'user', 'active', '', ?, ?, ?, ?, ?)`,
      [
        String(name).trim(),
        normalizedEmail,
        bcrypt.hashSync(String(password), 10),
        bio ? String(bio).trim() : 'Independent recording artist & composer on ZK-SONG.',
        primary_genre || 'Electronic',
        country || 'United States',
        now,
        now,
      ]
    );

    await notify({
      userId,
      title: 'Welcome to ZK-SONG Studio!',
      message:
        'Your artist account is ready. Head over to Upload Song to submit your first track and compete for Artist of the Month!',
    });
    await logActivity({
      actor: { id: userId, name: String(name).trim() },
      action: 'USER_REGISTERED',
      targetType: 'user',
      targetName: normalizedEmail,
      details: 'New artist account registered.',
    });

    const user = await db.get('SELECT * FROM users WHERE id = ?', [userId]);
    return json(
      {
        token: signToken(user),
        user: await enrichUser(user),
        message: 'Account created successfully!',
      },
      201
    );
  });

  router.post('/api/auth/login', async (c) => {
    const { email, password } = c.body || {};
    if (!email || !password) throw badRequest('Please enter both email and password.');

    const user = await db.get('SELECT * FROM users WHERE LOWER(email) = ?', [
      String(email).trim().toLowerCase(),
    ]);
    if (!user) throw unauthorized('Invalid email or password.');
    if (!bcrypt.compareSync(String(password), user.password_hash)) {
      throw unauthorized('Invalid email or password.');
    }
    if (user.status === 'banned') {
      throw forbidden(
        'Your account has been suspended by an administrator for violating platform guidelines.'
      );
    }

    return json({
      token: signToken(user),
      user: await enrichUser(user),
      message: `Welcome back, ${user.name}!`,
    });
  });

  router.post('/api/auth/forgot-password', async (c) => {
    const { email } = c.body || {};
    if (!email) throw badRequest('Please provide your registered email address.');
    const normalizedEmail = String(email).trim().toLowerCase();
    const user = await db.get('SELECT * FROM users WHERE LOWER(email) = ?', [normalizedEmail]);
    if (!user) throw notFound('No account found with that email address.');

    const resetCode = String(Math.floor(100000 + Math.random() * 900000));
    const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();
    await db.run('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?', [
      resetCode,
      expires,
      user.id,
    ]);

    console.log(`[ZK-SONG] Password reset code for ${normalizedEmail}: ${resetCode} (30 min)`);

    // In production this code belongs in your mail provider; the admin can read
    // it from the server logs meanwhile.
    return json({
      success: true,
      email: normalizedEmail,
      expires_in_minutes: 30,
      message: `A 6-digit verification code has been generated for ${normalizedEmail}. It expires in 30 minutes.`,
    });
  });

  router.post('/api/auth/reset-password', async (c) => {
    const { email, reset_code, new_password } = c.body || {};
    if (!email || !reset_code || !new_password) {
      throw badRequest('Email, verification code, and new password are required.');
    }
    if (String(new_password).length < 6) throw badRequest('New password must be at least 6 characters.');

    const user = await db.get('SELECT * FROM users WHERE LOWER(email) = ?', [
      String(email).trim().toLowerCase(),
    ]);
    if (!user || !user.reset_token || user.reset_token !== String(reset_code).trim()) {
      throw badRequest('Invalid verification code.');
    }
    if (user.reset_token_expires && new Date(user.reset_token_expires) < new Date()) {
      throw badRequest('Verification code has expired. Please request a new one.');
    }

    await db.run(
      'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL, updated_at = ? WHERE id = ?',
      [bcrypt.hashSync(String(new_password), 10), iso(), user.id]
    );
    return json({
      success: true,
      message: 'Password updated successfully! You can now sign in with your new password.',
    });
  });

  router.get('/api/auth/me', async (c) => {
    const user = await authUser(c);
    const unread = await db.get(
      'SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = ?',
      [user.id, bool(false)]
    );
    return json({
      user: await enrichUser(user),
      unread_notifications: Number(unread.c || 0),
      artist_of_the_month: await getArtistOfTheMonth(),
      is_platform_owner: isPlatformOwner(user),
    });
  });

  /* ---------------------------------------------------------- user panel -- */

  router.get('/api/user/dashboard', async (c) => {
    const user = await authUser(c);
    const enriched = await enrichUser(user);
    const mySongs = await enrichSongs(
      await db.all('SELECT * FROM songs WHERE user_id = ? ORDER BY created_at DESC', [user.id]),
      c.origin
    );
    const notifications = await db.all(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 12',
      [user.id]
    );

    return json({
      user: enriched,
      stats: enriched.stats,
      recent_songs: mySongs.slice(0, 6),
      all_songs_count: mySongs.length,
      notifications,
      artist_of_the_month: await getArtistOfTheMonth(),
    });
  });

  router.get('/api/user/songs', async (c) => {
    const user = await authUser(c);
    const { search = '', status = 'all', is_cover = 'all', genre = 'all', page = 1, limit = 10 } = c.query;

    const where = ['user_id = ?'];
    const params = [user.id];

    if (status && status !== 'all') {
      where.push('status = ?');
      params.push(status);
    }
    if (['yes', 'true', '1'].includes(is_cover)) where.push('is_cover = 1');
    else if (['no', 'false', '0'].includes(is_cover)) where.push('is_cover = 0');
    if (genre && genre !== 'all') {
      where.push('LOWER(genre) = LOWER(?)');
      params.push(genre);
    }
    if (search && String(search).trim()) {
      const q = `%${String(search).trim()}%`;
      where.push('(title LIKE ? OR artist LIKE ? OR musician LIKE ? OR composer LIKE ? OR genre LIKE ?)');
      params.push(q, q, q, q, q);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = await db.get(`SELECT COUNT(*) as c FROM songs ${whereSql}`, params);
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(50, parseInt(limit, 10) || 10));

    const rows = await db.all(
      `SELECT * FROM songs ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limitNum, (pageNum - 1) * limitNum]
    );
    const enrichedUser = await enrichUser(user);

    return json({
      songs: await enrichSongs(rows, c.origin),
      stats: enrichedUser.stats,
      pagination: {
        total: Number(total.c || 0),
        page: pageNum,
        limit: limitNum,
        total_pages: Math.max(1, Math.ceil(Number(total.c || 0) / limitNum)),
      },
    });
  });

  /**
   * Write a pair: run `fn`, and if it throws, delete the media objects that were
   * just stored. Prevents orphaned audio when validation fails after upload
   * (e.g. a missing title on the classic multipart path).
   */
  async function withMediaRollback(keys, fn) {
    try {
      return await fn();
    } catch (err) {
      for (const key of keys.filter(Boolean)) {
        try {
          await storage.remove(storageKey(key));
        } catch {
          /* nothing else we can do */
        }
      }
      throw err;
    }
  }

  router.post('/api/user/songs', async (c) => {
    const user = await authUser(c);
    const f = c.body || {};
    const uploads = c.files || {};

    // Files either arrived through the classic multipart upload (local/Docker) or
    // were PUT straight into object storage by the browser (serverless).
    const audioFile = uploads.audio;
    const thumbFile = uploads.thumbnail;
    const videoFile = uploads.video;

    const audioKey = audioFile?.key || c.body?.audio_key;
    const thumbKey = thumbFile?.key || c.body?.thumbnail_key;
    const videoKey = videoFile?.key || c.body?.video_key;

    return withMediaRollback([audioKey, thumbKey, videoKey], async () => {
      if (!f.title || !String(f.title).trim()) throw badRequest('Song Title is required.');
      if (!f.artist || !String(f.artist).trim()) throw badRequest('Artist name is required.');
      if (!f.musician || !String(f.musician).trim()) throw badRequest('Musician details are required.');
      if (!f.composer || !String(f.composer).trim()) throw badRequest('Composer details are required.');
      if (!audioKey) throw badRequest('Please select or generate an Audio File to upload.');
      if (!thumbKey) throw badRequest('Please select or generate a Thumbnail / Cover Image to upload.');

      const isCover = ['yes', 'true', '1'].includes(String(f.is_cover).toLowerCase()) ? 1 : 0;
      const settings = await getSettingsMap();
      const autoApprove = settings.require_moderation === 'false' || user.role === 'admin';
      const now = iso();

      const durSec = Math.max(1, parseInt(f.duration, 10) || 18);
      const formatted =
        f.duration_formatted || `${Math.floor(durSec / 60)}:${String(durSec % 60).padStart(2, '0')}`;

      const sizeOf = async (file, key) => {
        if (file?.size) return file.size;
        const stat = await storage.stat(key).catch(() => null);
        return stat?.size || 0;
      };

      const songId = await db.insert(
        `INSERT INTO songs (
          user_id, title, artist, featured_artist, musician, composer,
          is_cover, original_credit, genre, release_year, bpm, duration, duration_formatted,
          description, lyrics, audio_url, audio_filename, audio_size, audio_mime,
          thumbnail_url, thumbnail_filename, video_url, video_filename, video_size,
          status, approved_at, approved_by, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user.id,
          String(f.title).trim(),
          String(f.artist).trim(),
          String(f.featured_artist || '').trim(),
          String(f.musician).trim(),
          String(f.composer).trim(),
          bool(isCover),
          isCover ? String(f.original_credit || '').trim() : '',
          String(f.genre || '').trim() || 'Electronic',
          parseInt(f.release_year, 10) || new Date().getFullYear(),
          parseInt(f.bpm, 10) || 120,
          durSec,
          formatted,
          String(f.description || '').trim(),
          String(f.lyrics || '').trim(),
          canonicalUrl(audioKey),
          filenameOf(audioKey),
          await sizeOf(audioFile, audioKey),
          audioFile?.mimetype || f.audio_mime || 'audio/mpeg',
          canonicalUrl(thumbKey),
          filenameOf(thumbKey),
          videoKey ? canonicalUrl(videoKey) : '',
          videoKey ? filenameOf(videoKey) : '',
          videoKey ? await sizeOf(videoFile, videoKey) : 0,
          autoApprove ? 'approved' : 'pending',
          autoApprove ? now : null,
          autoApprove ? user.id : null,
          now,
          now,
        ]
      );

      const song = await db.get('SELECT * FROM songs WHERE id = ?', [songId]);

      await notify({
        userId: user.id,
        type: 'song_uploaded',
        title: `Uploaded: ${song.title}`,
        message:
          song.status === 'approved'
            ? `Your track "${song.title}" has been published directly to the Approved Songs library!`
            : `Your track "${song.title}" has been uploaded and is currently Pending A&R Admin approval.`,
      });
      await logActivity({
        actor: user,
        action: 'UPLOADED_SONG',
        targetType: 'song',
        targetName: song.title,
        details: `Uploaded ${song.genre} track (${isCover ? 'Cover Song: Yes' : 'Original Track'})${
          videoKey ? ' with Music Video' : ''
        }.`,
      });

      return json(
        {
          song: (await enrichSongs([song], c.origin))[0],
          message:
            song.status === 'approved'
              ? 'Song uploaded and automatically approved!'
              : 'Song uploaded successfully and submitted for Admin approval!',
        },
        201
      );
    });
  });

  router.put('/api/user/songs/:id', async (c) => {
    const user = await authUser(c);
    const song = await db.get('SELECT * FROM songs WHERE id = ?', [c.params.id]);
    if (!song) throw notFound('Song not found.');
    if (String(song.user_id) !== String(user.id) && user.role !== 'admin') {
      throw forbidden('You do not have permission to edit this song.');
    }

    const f = c.body || {};
    const isCover =
      f.is_cover === true ||
      f.is_cover === 1 ||
      ['yes', 'true', '1'].includes(String(f.is_cover).toLowerCase())
        ? 1
        : 0;

    await db.run(
      `UPDATE songs SET
        title = ?, artist = ?, featured_artist = ?, musician = ?, composer = ?,
        is_cover = ?, original_credit = ?, genre = ?, release_year = ?, bpm = ?,
        description = ?, lyrics = ?, updated_at = ?
       WHERE id = ?`,
      [
        String(f.title ?? song.title).trim(),
        String(f.artist ?? song.artist).trim(),
        String(f.featured_artist ?? song.featured_artist).trim(),
        String(f.musician ?? song.musician).trim(),
        String(f.composer ?? song.composer).trim(),
        bool(isCover),
        isCover ? String(f.original_credit ?? song.original_credit).trim() : '',
        String(f.genre ?? song.genre).trim(),
        parseInt(f.release_year, 10) || song.release_year,
        parseInt(f.bpm, 10) || song.bpm,
        String(f.description ?? song.description).trim(),
        String(f.lyrics ?? song.lyrics).trim(),
        iso(),
        song.id,
      ]
    );

    const updated = await db.get('SELECT * FROM songs WHERE id = ?', [song.id]);
    return json({
      song: (await enrichSongs([updated], c.origin))[0],
      message: 'Song details updated successfully.',
    });
  });

  router.delete('/api/user/songs/:id', async (c) => {
    const user = await authUser(c);
    const song = await db.get('SELECT * FROM songs WHERE id = ?', [c.params.id]);
    if (!song) throw notFound('Song not found.');
    if (String(song.user_id) !== String(user.id) && user.role !== 'admin') {
      throw forbidden('You can only delete your own songs.');
    }

    await deleteSongMedia(song);
    await db.run('DELETE FROM songs WHERE id = ?', [song.id]);
    return json({
      success: true,
      deleted_id: song.id,
      message: `"${song.title}" has been deleted.`,
    });
  });

  router.put('/api/user/account', async (c) => {
    const user = await authUser(c);
    const f = c.body || {};
    if (!f.name || !String(f.name).trim()) throw badRequest('Display / Artist Name cannot be empty.');
    if (!f.email || !String(f.email).trim()) throw badRequest('Email cannot be empty.');

    const normalizedEmail = String(f.email).trim().toLowerCase();
    const clash = await db.get('SELECT id FROM users WHERE LOWER(email) = ? AND id != ?', [
      normalizedEmail,
      user.id,
    ]);
    if (clash) throw conflict('That email address is already in use by another account.');
    if (normalizedEmail === OWNER_EMAIL && !isPlatformOwner(user)) {
      throw conflict('That email address is reserved for the platform owner.');
    }

    const avatarUrl = c.files?.avatar
      ? canonicalUrl(c.files.avatar.key)
      : c.body?.avatar_key
        ? canonicalUrl(c.body.avatar_key)
        : user.avatar_url;

    await db.run(
      `UPDATE users SET name = ?, email = ?, avatar_url = ?, bio = ?, primary_genre = ?,
        country = ?, website = ?, updated_at = ? WHERE id = ?`,
      [
        String(f.name).trim(),
        normalizedEmail,
        avatarUrl,
        f.bio !== undefined ? String(f.bio).trim() : user.bio,
        f.primary_genre || user.primary_genre,
        f.country || user.country,
        f.website !== undefined ? String(f.website).trim() : user.website,
        iso(),
        user.id,
      ]
    );

    const updated = await db.get('SELECT * FROM users WHERE id = ?', [user.id]);
    return json({
      user: await enrichUser(updated),
      message: 'Account profile updated successfully!',
    });
  });

  router.put('/api/user/password', async (c) => {
    const user = await authUser(c);
    const { current_password, new_password } = c.body || {};
    if (!current_password || !new_password) {
      throw badRequest('Both current password and new password are required.');
    }
    if (String(new_password).length < 6) throw badRequest('New password must be at least 6 characters.');
    if (!bcrypt.compareSync(String(current_password), user.password_hash)) {
      throw badRequest('Current password is incorrect.');
    }
    await db.run('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [
      bcrypt.hashSync(String(new_password), 10),
      iso(),
      user.id,
    ]);
    return json({ success: true, message: 'Your password has been changed successfully.' });
  });

  router.get('/api/user/notifications', async (c) => {
    const user = await authUser(c);
    const list = await db.all(
      'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30',
      [user.id]
    );
    return json({ notifications: list });
  });

  router.post('/api/user/notifications/read', async (c) => {
    const user = await authUser(c);
    await db.run('UPDATE notifications SET is_read = ? WHERE user_id = ?', [bool(true), user.id]);
    return json({ success: true });
  });

  /* --------------------------------------------------------- admin panel -- */

  router.get('/api/admin/dashboard', async (c) => {
    await adminUser(c);

    const songCounts =
      (await db.get(
        `SELECT
          COUNT(*) as active_songs,
          SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_songs,
          SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_songs,
          SUM(CASE WHEN is_cover = 1 THEN 1 ELSE 0 END) as cover_songs,
          SUM(CASE WHEN video_url != '' THEN 1 ELSE 0 END) as video_songs,
          COALESCE(SUM(plays_count), 0) as total_plays,
          COALESCE(SUM(downloads_count), 0) as total_downloads
        FROM songs`
      )) || {};

    const rejected = await db.get('SELECT COALESCE(SUM(rejected_songs_count), 0) as c FROM users');

    const userCounts =
      (await db.get(
        `SELECT
          COUNT(*) as total_users,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_users,
          SUM(CASE WHEN status = 'banned' THEN 1 ELSE 0 END) as banned_users,
          SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admin_users
        FROM users`
      )) || {};

    const apiCounts =
      (await db.get(
        `SELECT
          COUNT(*) as total_keys,
          SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_keys,
          COALESCE(SUM(requests_count), 0) as total_requests
        FROM api_keys`
      )) || {};

    const genreBreakdown = await db.all(
      `SELECT genre, COUNT(*) as count,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count
       FROM songs GROUP BY genre ORDER BY count DESC`
    );

    const pending = await db.all(
      "SELECT * FROM songs WHERE status = 'pending' ORDER BY created_at DESC LIMIT 8"
    );
    const recentLogs = await db.all('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 12');

    const aotm = await getArtistOfTheMonth();
    if (aotm.winner) {
      aotm.winner.approved_songs = await enrichSongs(aotm.winner.approved_songs || [], c.origin);
    }

    const activeSongs = Number(songCounts.active_songs || 0);
    const rejectedSongs = Number(rejected?.c || 0);

    return json({
      stats: {
        total_songs: activeSongs,
        total_lifetime_uploaded: activeSongs + rejectedSongs,
        approved_songs: Number(songCounts.approved_songs || 0),
        pending_songs: Number(songCounts.pending_songs || 0),
        rejected_songs: rejectedSongs,
        cover_songs: Number(songCounts.cover_songs || 0),
        video_songs: Number(songCounts.video_songs || 0),
        total_plays: Number(songCounts.total_plays || 0),
        total_downloads: Number(songCounts.total_downloads || 0),
        total_users: Number(userCounts.total_users || 0),
        active_users: Number(userCounts.active_users || 0),
        banned_users: Number(userCounts.banned_users || 0),
        admin_users: Number(userCounts.admin_users || 0),
        total_api_keys: Number(apiCounts.total_keys || 0),
        active_api_keys: Number(apiCounts.active_keys || 0),
        total_api_requests: Number(apiCounts.total_requests || 0),
      },
      genre_breakdown: genreBreakdown,
      pending_songs: await enrichSongs(pending, c.origin),
      recent_activity: recentLogs,
      artist_of_the_month: aotm,
    });
  });

  router.get('/api/admin/songs', async (c) => {
    await adminUser(c);
    const {
      search = '', status = 'all', is_cover = 'all', has_video = 'all',
      genre = 'all', sort = 'newest', page = 1, limit = 12,
    } = c.query;

    const where = ['1=1'];
    const params = [];

    if (status && status !== 'all') {
      where.push('s.status = ?');
      params.push(status);
    }
    if (['yes', 'true', '1'].includes(is_cover)) where.push('s.is_cover = 1');
    else if (['no', 'false', '0'].includes(is_cover)) where.push('s.is_cover = 0');
    if (['yes', 'true'].includes(has_video)) where.push("s.video_url != ''");
    else if (['no', 'false'].includes(has_video)) where.push("s.video_url = ''");
    if (genre && genre !== 'all') {
      where.push('LOWER(s.genre) = LOWER(?)');
      params.push(genre);
    }
    if (search && String(search).trim()) {
      const q = `%${String(search).trim()}%`;
      where.push(
        '(s.title LIKE ? OR s.artist LIKE ? OR s.musician LIKE ? OR s.composer LIKE ? OR s.genre LIKE ? OR u.name LIKE ? OR u.email LIKE ?)'
      );
      params.push(q, q, q, q, q, q, q);
    }

    let orderSql = 's.created_at DESC';
    if (sort === 'oldest') orderSql = 's.created_at ASC';
    else if (sort === 'plays') orderSql = 's.plays_count DESC';
    else if (sort === 'title') orderSql = 's.title COLLATE NOCASE ASC';
    else if (sort === 'approved_newest') orderSql = 'COALESCE(s.approved_at, s.created_at) DESC';

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = await db.get(
      `SELECT COUNT(*) as c FROM songs s LEFT JOIN users u ON u.id = s.user_id ${whereSql}`,
      params
    );
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 12));

    const rows = await db.all(
      `SELECT s.* FROM songs s LEFT JOIN users u ON u.id = s.user_id ${whereSql}
       ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
      [...params, limitNum, (pageNum - 1) * limitNum]
    );
    const genres = (await db.all('SELECT DISTINCT genre FROM songs ORDER BY genre ASC')).map(
      (r) => r.genre
    );

    return json({
      songs: await enrichSongs(rows, c.origin),
      genres,
      pagination: {
        total: Number(total.c || 0),
        page: pageNum,
        limit: limitNum,
        total_pages: Math.max(1, Math.ceil(Number(total.c || 0) / limitNum)),
      },
    });
  });

  router.get('/api/admin/songs/:id', async (c) => {
    await adminUser(c);
    const song = await db.get('SELECT * FROM songs WHERE id = ?', [c.params.id]);
    if (!song) {
      throw notFound('Song not found (it may have been rejected and permanently removed).');
    }
    const uploader = await db.get('SELECT * FROM users WHERE id = ?', [song.user_id]);
    const approvedBy = song.approved_by
      ? await db.get('SELECT id, name, email FROM users WHERE id = ?', [song.approved_by])
      : null;

    return json({
      song: (await enrichSongs([song], c.origin))[0],
      uploader: await enrichUser(uploader),
      approved_by_admin: approvedBy,
      artist_of_the_month: await getArtistOfTheMonth(),
    });
  });

  router.post('/api/admin/songs/:id/approve', async (c) => {
    const admin = await adminUser(c);
    const song = await db.get('SELECT * FROM songs WHERE id = ?', [c.params.id]);
    if (!song) throw notFound('Song not found.');

    const now = iso();
    await db.run(
      "UPDATE songs SET status = 'approved', approved_at = ?, approved_by = ?, updated_at = ? WHERE id = ?",
      [now, admin.id, now, song.id]
    );
    await notify({
      userId: song.user_id,
      type: 'song_approved',
      title: `✅ Song Approved: ${song.title}`,
      message: `Your track "${song.title}" has been approved by ${admin.name} and is now live in the Approved Songs library and external streaming API!`,
    });
    await logActivity({
      actor: admin,
      action: 'APPROVED_SONG',
      targetType: 'song',
      targetName: song.title,
      details: `Approved song "${song.title}" by ${song.artist}.`,
    });

    const aotm = await getArtistOfTheMonth();
    if (aotm.winner && String(aotm.winner.user_id) === String(song.user_id)) {
      await notify({
        userId: song.user_id,
        type: 'artist_of_month',
        title: `👑 You are leading Artist of the Month (${aotm.month_label})!`,
        message: `With ${aotm.winner.monthly_approved_count} approved songs in ${aotm.month_label}, you hold the #1 Artist of the Month badge across the platform!`,
      });
    }

    const updated = await db.get('SELECT * FROM songs WHERE id = ?', [song.id]);
    return json({
      success: true,
      song: (await enrichSongs([updated], c.origin))[0],
      artist_of_the_month: aotm,
      message: `"${song.title}" has been approved and added to Approved Songs!`,
    });
  });

  router.post('/api/admin/songs/:id/reject', async (c) => {
    const admin = await adminUser(c);
    const reason =
      c.body?.reason || 'Did not meet studio quality or copyright verification standards.';
    const song = await db.get('SELECT * FROM songs WHERE id = ?', [c.params.id]);
    if (!song) throw notFound('Song not found.');

    const now = iso();
    // Rejection is permanent: the row and every stored file are destroyed.
    await deleteSongMedia(song);
    await db.run(
      'UPDATE users SET rejected_songs_count = rejected_songs_count + 1, updated_at = ? WHERE id = ?',
      [now, song.user_id]
    );
    await notify({
      userId: song.user_id,
      type: 'song_rejected',
      title: `❌ Song Rejected & Removed: ${song.title}`,
      message: `Your song "${song.title}" was rejected during moderation and permanently removed from the platform. Reason: ${reason}`,
    });
    await logActivity({
      actor: admin,
      action: 'REJECTED_AND_REMOVED_SONG',
      targetType: 'song',
      targetName: song.title,
      details: `Rejected and permanently removed "${song.title}" by ${song.artist}. Reason: ${reason}`,
    });
    await db.run('DELETE FROM songs WHERE id = ?', [song.id]);

    return json({
      success: true,
      removed_song_id: song.id,
      removed_title: song.title,
      artist_of_the_month: await getArtistOfTheMonth(),
      message: `"${song.title}" was rejected and permanently removed from the platform.`,
    });
  });

  router.delete('/api/admin/songs/:id', async (c) => {
    const admin = await adminUser(c);
    const song = await db.get('SELECT * FROM songs WHERE id = ?', [c.params.id]);
    if (!song) throw notFound('Song not found.');

    await deleteSongMedia(song);
    await db.run('DELETE FROM songs WHERE id = ?', [song.id]);
    await logActivity({
      actor: admin,
      action: 'DELETED_SONG',
      targetType: 'song',
      targetName: song.title,
      details: `Permanently deleted song "${song.title}" by ${song.artist}.`,
    });

    return json({
      success: true,
      deleted_id: song.id,
      artist_of_the_month: await getArtistOfTheMonth(),
      message: `"${song.title}" has been permanently deleted from the platform.`,
    });
  });

  router.get('/api/admin/users', async (c) => {
    await adminUser(c);
    const { search = '', status = 'all', role = 'all', page = 1, limit = 15 } = c.query;
    const where = ['1=1'];
    const params = [];

    if (status && status !== 'all') {
      where.push('status = ?');
      params.push(status);
    }
    if (role && role !== 'all') {
      where.push('role = ?');
      params.push(role);
    }
    if (search && String(search).trim()) {
      const q = `%${String(search).trim()}%`;
      where.push('(name LIKE ? OR email LIKE ? OR primary_genre LIKE ? OR country LIKE ?)');
      params.push(q, q, q, q);
    }

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = await db.get(`SELECT COUNT(*) as c FROM users ${whereSql}`, params);
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 15));
    const rows = await db.all(
      `SELECT * FROM users ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
      [...params, limitNum, (pageNum - 1) * limitNum]
    );

    const users = [];
    for (const row of rows) users.push(await enrichUser(row));

    return json({
      users,
      artist_of_the_month: await getArtistOfTheMonth(),
      pagination: {
        total: Number(total.c || 0),
        page: pageNum,
        limit: limitNum,
        total_pages: Math.max(1, Math.ceil(Number(total.c || 0) / limitNum)),
      },
    });
  });

  router.post('/api/admin/users/:id/ban', async (c) => {
    const admin = await adminUser(c);
    if (String(c.params.id) === String(admin.id)) {
      throw badRequest('You cannot ban your own administrator account.');
    }
    const target = await db.get('SELECT * FROM users WHERE id = ?', [c.params.id]);
    if (!target) throw notFound('User not found.');
    if (target.role === 'admin' || isPlatformOwner(target)) {
      throw forbidden('The platform administrator account cannot be banned.');
    }

    const status = target.status === 'banned' ? 'active' : 'banned';
    await db.run('UPDATE users SET status = ?, updated_at = ? WHERE id = ?', [status, iso(), target.id]);
    await logActivity({
      actor: admin,
      action: status === 'banned' ? 'BANNED_USER' : 'UNBANNED_USER',
      targetType: 'user',
      targetName: target.name,
      details: `${status === 'banned' ? 'Banned' : 'Restored'} user account (${target.email}).`,
    });

    const updated = await db.get('SELECT * FROM users WHERE id = ?', [target.id]);
    return json({
      user: await enrichUser(updated),
      artist_of_the_month: await getArtistOfTheMonth(),
      message:
        status === 'banned'
          ? `User "${target.name}" has been banned.`
          : `User "${target.name}" has been unbanned and restored to active status.`,
    });
  });

  router.put('/api/admin/users/:id/role', async (c) => {
    // Single-administrator model: only the platform owner holds the admin role.
    await adminUser(c);
    throw forbidden(
      'Administrator access is reserved for the platform owner account and cannot be granted or revoked from the panel.'
    );
  });

  router.delete('/api/admin/users/:id', async (c) => {
    const admin = await adminUser(c);
    if (String(c.params.id) === String(admin.id)) {
      throw badRequest('You cannot delete your own administrator account.');
    }
    const target = await db.get('SELECT * FROM users WHERE id = ?', [c.params.id]);
    if (!target) throw notFound('User not found.');
    if (target.role === 'admin' || isPlatformOwner(target)) {
      throw forbidden('The platform administrator account cannot be deleted.');
    }

    const songs = await db.all('SELECT * FROM songs WHERE user_id = ?', [target.id]);
    for (const song of songs) await deleteSongMedia(song);
    await db.run('DELETE FROM users WHERE id = ?', [target.id]);
    await logActivity({
      actor: admin,
      action: 'DELETED_USER',
      targetType: 'user',
      targetName: target.name,
      details: `Permanently deleted user ${target.name} (${target.email}) and ${songs.length} associated tracks.`,
    });

    return json({
      success: true,
      deleted_id: target.id,
      artist_of_the_month: await getArtistOfTheMonth(),
      message: `User "${target.name}" and their uploaded tracks have been permanently deleted.`,
    });
  });

  /* ------------------------------------------------------------ API keys -- */

  router.get('/api/admin/api-keys', async (c) => {
    await adminUser(c);
    return json({ api_keys: await db.all('SELECT * FROM api_keys ORDER BY created_at DESC') });
  });

  router.post('/api/admin/api-keys', async (c) => {
    const admin = await adminUser(c);
    const { name, permissions = 'read:songs,stream:audio,read:artists' } = c.body || {};
    if (!name || !String(name).trim()) {
      throw badRequest('Please provide an application or client name for the API key.');
    }

    const fullKey = `zks_live_${crypto.randomBytes(18).toString('hex')}`;
    const prefix = `${fullKey.slice(0, 13)}...${fullKey.slice(-4)}`;
    const now = iso();

    const id = await db.insert(
      `INSERT INTO api_keys (name, key_prefix, api_key, permissions, status, requests_count, created_by, created_at)
       VALUES (?, ?, ?, ?, 'active', 0, ?, ?)`,
      [String(name).trim(), prefix, fullKey, String(permissions).trim(), admin.id, now]
    );

    const created = await db.get('SELECT * FROM api_keys WHERE id = ?', [id]);
    await logActivity({
      actor: admin,
      action: 'CREATED_API_KEY',
      targetType: 'api_key',
      targetName: created.name,
      details: `Generated new API key (${prefix}) for external application integration.`,
    });

    return json(
      { api_key: created, message: `Secure API Key generated for "${created.name}"!` },
      201
    );
  });

  router.put('/api/admin/api-keys/:id/toggle', async (c) => {
    await adminUser(c);
    const existing = await db.get('SELECT * FROM api_keys WHERE id = ?', [c.params.id]);
    if (!existing) throw notFound('API Key not found.');

    const status = existing.status === 'active' ? 'revoked' : 'active';
    await db.run('UPDATE api_keys SET status = ? WHERE id = ?', [status, existing.id]);
    const updated = await db.get('SELECT * FROM api_keys WHERE id = ?', [existing.id]);
    return json({
      api_key: updated,
      message: `API Key "${updated.name}" is now ${status.toUpperCase()}.`,
    });
  });

  router.delete('/api/admin/api-keys/:id', async (c) => {
    await adminUser(c);
    const existing = await db.get('SELECT * FROM api_keys WHERE id = ?', [c.params.id]);
    if (!existing) throw notFound('API Key not found.');
    await db.run('DELETE FROM api_keys WHERE id = ?', [existing.id]);
    return json({
      success: true,
      deleted_id: existing.id,
      message: `API Key "${existing.name}" has been permanently deleted.`,
    });
  });

  /* ------------------------------------------------------------ settings -- */

  router.get('/api/admin/settings', async (c) => {
    await adminUser(c);
    return json({ settings: await getSettingsMap() });
  });

  router.put('/api/admin/settings', async (c) => {
    const admin = await adminUser(c);
    const allowed = [
      'site_name', 'site_tagline', 'site_description', 'logo_url', 'primary_color',
      'secondary_color', 'accent_badge_text', 'contact_email', 'footer_text',
      'allow_registration', 'require_moderation', 'max_upload_mb',
    ];
    const upsert = 'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value';

    for (const key of allowed) {
      if (c.body && c.body[key] !== undefined && c.body[key] !== null) {
        await db.run(upsert, [key, String(c.body[key])]);
      }
    }
    if (c.files?.logo) {
      await db.run(upsert, ['logo_url', canonicalUrl(c.files.logo.key)]);
    } else if (c.body?.logo_key) {
      await db.run(upsert, ['logo_url', canonicalUrl(c.body.logo_key)]);
    }

    const settings = await getSettingsMap();
    await logActivity({
      actor: admin,
      action: 'UPDATED_SETTINGS',
      targetType: 'settings',
      targetName: settings.site_name,
      details: 'Updated website branding and platform configuration.',
    });

    return json({
      settings,
      message: 'Platform settings and branding updated successfully!',
    });
  });

  /* ------------------------------------------------------- external API -- */

  function formatExternalSong(s, origin) {
    const keyParam = s.__apiKey ? `?api_key=${encodeURIComponent(s.__apiKey)}` : '';
    return {
      id: s.id,
      title: s.title,
      artist: s.artist,
      featured_artist: s.featured_artist || null,
      musician: s.musician,
      composer: s.composer,
      is_cover_song: Boolean(s.is_cover),
      cover_song: s.is_cover ? 'Yes' : 'No',
      original_credit: s.original_credit || null,
      genre: s.genre,
      release_year: s.release_year,
      bpm: s.bpm,
      duration_seconds: s.duration,
      duration_formatted: s.duration_formatted,
      description: s.description,
      lyrics: s.lyrics,
      thumbnail_url: s.full_thumbnail_url,
      thumbnail_path: s.thumbnail_storage_path || s.thumbnail_url,
      audio_url: s.full_audio_url,
      audio_path: s.audio_storage_path || s.audio_url,
      stream_url: `${origin}/api/v1/stream/${s.id}${keyParam}`,
      video_url: s.full_video_url,
      video_path: s.video_storage_path || null,
      download_url: `${origin}/api/public/songs/${s.id}/download`,
      plays_count: s.plays_count,
      downloads_count: s.downloads_count,
      approved_at: s.approved_at,
      created_at: s.created_at,
      is_artist_of_the_month: s.is_artist_of_the_month,
      artist_of_month_badge: s.artist_of_month_badge,
      uploader: s.uploader,
    };
  }

  router.get('/api/v1/songs', async (c) => {
    const apiKey = await requireApiKey(c);
    const {
      search = '', genre = '', artist = '', is_cover = '', sort = 'latest', page = 1, limit = 50,
    } = c.query;

    const where = ["status = 'approved'"];
    const params = [];

    if (genre && genre !== 'all') {
      where.push('LOWER(genre) = LOWER(?)');
      params.push(String(genre).trim());
    }
    if (artist) {
      where.push('LOWER(artist) LIKE LOWER(?)');
      params.push(`%${String(artist).trim()}%`);
    }
    if (['true', 'yes', '1'].includes(is_cover)) where.push('is_cover = 1');
    else if (['false', 'no', '0'].includes(is_cover)) where.push('is_cover = 0');
    if (search && String(search).trim()) {
      const q = `%${String(search).trim()}%`;
      where.push('(title LIKE ? OR artist LIKE ? OR musician LIKE ? OR composer LIKE ? OR genre LIKE ?)');
      params.push(q, q, q, q, q);
    }

    let orderSql = 'COALESCE(approved_at, created_at) DESC';
    if (sort === 'popular' || sort === 'plays') orderSql = 'plays_count DESC';
    else if (sort === 'title') orderSql = 'title COLLATE NOCASE ASC';

    const whereSql = `WHERE ${where.join(' AND ')}`;
    const total = await db.get(`SELECT COUNT(*) as c FROM songs ${whereSql}`, params);
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));

    const rows = await db.all(
      `SELECT * FROM songs ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`,
      [...params, limitNum, (pageNum - 1) * limitNum]
    );

    const enriched = (await enrichSongs(rows, c.origin)).map((s) => ({ ...s, __apiKey: apiKey.api_key }));
    const aotm = await getArtistOfTheMonth();
    const settings = await getSettingsMap();

    return json({
      status: 'success',
      platform: {
        name: settings.site_name,
        tagline: settings.site_tagline,
        api_version: 'v1.0',
        authenticated_client: apiKey.name,
      },
      artist_of_the_month: aotm.winner
        ? {
            user_id: aotm.winner.user_id,
            artist_name: aotm.winner.name,
            month: aotm.month_label,
            monthly_approved_songs: aotm.winner.monthly_approved_count,
            badge: 'Artist of the Month',
          }
        : null,
      count: enriched.length,
      total_approved_songs: Number(total.c || 0),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total_pages: Math.max(1, Math.ceil(Number(total.c || 0) / limitNum)),
      },
      songs: enriched.map((s) => formatExternalSong(s, c.origin)),
    });
  });

  router.get('/api/v1/songs/:id', async (c) => {
    const apiKey = await requireApiKey(c);
    const song = await db.get("SELECT * FROM songs WHERE id = ? AND status = 'approved'", [
      c.params.id,
    ]);
    if (!song) {
      throw new HttpError(404, {
        status: 'error',
        code: 'SONG_NOT_FOUND',
        message: 'Approved song with the specified ID was not found.',
      });
    }
    const enriched = { ...(await enrichSongs([song], c.origin))[0], __apiKey: apiKey.api_key };
    return json({ status: 'success', song: formatExternalSong(enriched, c.origin) });
  });

  router.get('/api/v1/artist-of-the-month', async (c) => {
    const apiKey = await requireApiKey(c);
    const aotm = await getArtistOfTheMonth();
    if (aotm.winner) {
      const songs = (await enrichSongs(aotm.winner.approved_songs || [], c.origin)).map((s) => ({
        ...s,
        __apiKey: apiKey.api_key,
      }));
      aotm.winner.approved_songs = songs.map((s) => formatExternalSong(s, c.origin));
    }
    return json({ status: 'success', artist_of_the_month: aotm });
  });

  router.get('/api/v1/stream/:id', async (c) => {
    await requireApiKey(c);
    const song = await db.get("SELECT * FROM songs WHERE id = ? AND status = 'approved'", [
      c.params.id,
    ]);
    if (!song) {
      throw new HttpError(404, {
        status: 'error',
        code: 'SONG_NOT_FOUND',
        message: 'Approved song not found.',
      });
    }

    await db.run('UPDATE songs SET plays_count = plays_count + 1 WHERE id = ?', [song.id]);

    if (storage.kind === 'local') {
      const key = storageKey(song.audio_url);
      if (!storage.exists(key)) throw notFound('Media file not found');
      return file(storage.absolutePath(key), { headers: { 'Content-Type': mimeFor(song.audio_url) } });
    }
    // Hand playback to the bucket CDN: it supports Range/206 natively and does
    // not count against the function's 4.5 MB response budget.
    return redirect(mediaUrl(song.audio_url, c.origin), 302, {
      'Cache-Control': 'no-store',
    });
  });

  /* ------------------------------------------------- direct-to-storage -- */

  /**
   * Serverless cannot receive >4.5 MB requests, so the browser asks for a signed
   * URL, PUTs the file straight into the bucket, then posts only metadata.
   */
  router.post('/api/uploads/sign', async (c) => {
    const user = await authUser(c);
    if (!storage.supportsSignedUploads) {
      throw badRequest(
        'Direct uploads are disabled on this deployment. Send the file to /api/user/songs as multipart/form-data instead.'
      );
    }

    const { kind, filename, size, field } = c.body || {};
    const target = field || kind;
    const map = { audio: 'audio', thumbnail: 'thumbnails', video: 'videos', avatar: 'avatars', logo: 'branding' };
    const folder = map[target];
    if (!folder) throw badRequest('Unknown upload kind. Use audio, thumbnail, video, avatar or logo.');
    if (!filename) throw badRequest('A filename is required.');
    if (target === 'logo' && !isPlatformOwner(user)) {
      throw forbidden('Only the platform owner may change branding.');
    }

    const invalid = validateUpload(target, filename, '');
    if (invalid) throw badRequest(invalid);

    const ext = String(filename).match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase() || '.bin';
    const base =
      String(filename)
        .slice(0, String(filename).length - ext.length)
        .toLowerCase()
        .replace(/[^a-z0-9-_]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 32)
        .replace(/-+$/g, '') || 'media';
    const objectKey = `${folder}/${base}-${Date.now()}-${crypto.randomBytes(3).toString('hex')}${ext}`;

    if (size && Number(size) > MAX_UPLOAD_MB * 1024 * 1024) {
      throw badRequest(`File is larger than the ${MAX_UPLOAD_MB} MB limit.`);
    }

    const signed = await storage.createSignedUpload(objectKey);
    return json({
      status: 'success',
      upload: {
        url: signed.uploadUrl,
        token: signed.token,
        key: objectKey,
        path: signed.path,
        public_url: signed.publicUrl,
        field: target,
      },
    });
  });

  /** Public media passthrough (local deployments); redirects to the CDN otherwise. */
  router.get('/uploads/:folder/:filename', async (c) => {
    if (storage.kind !== 'local') {
      return redirect(storage.publicUrl(`${c.params.folder}/${c.params.filename}`), 302);
    }
    const key = `${c.params.folder}/${c.params.filename}`;
    if (!storage.exists(key)) {
      // The bundled branding artwork also ships in public/. This keeps the logo
      // working when UPLOADS_DIR points outside the checkout (VPS/Docker layout).
      const bundled = bundledAsset(key);
      if (bundled) {
        return file(bundled, {
          headers: { 'Content-Type': mimeFor(key), 'Cache-Control': 'public, max-age=86400' },
        });
      }
      throw notFound('Media file not found');
    }
    return file(storage.absolutePath(key), {
      headers: { 'Content-Type': mimeFor(c.params.filename), 'Cache-Control': 'public, max-age=3600' },
    });
  });

  router.get('/api/uploads/config', async () => json({
    max_upload_mb: MAX_UPLOAD_MB,
    direct_upload: storage.supportsSignedUploads,
    storage: storage.kind,
  }));

  return router;
}

/* ---------------------------------------------------------------- utils -- */

/** Where first-party static assets may live (source checkout and built app). */
function siteRoots() {
  return getStaticRoots();
}

/** First-shipped asset for a media key, if one exists (e.g. branding/zk-logo.svg). */
function bundledAsset(key) {
  for (const root of siteRoots()) {
    const candidate = path.join(root, 'uploads', key);
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function ext(value) {
  const m = String(value || '').match(/\.[a-z0-9]+$/i);
  return m ? m[0] : '';
}

function filenameOf(key) {
  return String(key || '').split('/').pop();
}

/** Every stored media reference has one canonical form in the database. */
function canonicalUrl(key) {
  const k = String(key || '').replace(/^\/+/, '');
  return k ? `/uploads/${k}` : '';
}

export function mimeFor(value) {
  const e = ext(value).toLowerCase();
  const map = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4',
    '.aac': 'audio/aac',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mov': 'video/quicktime',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.webp': 'image/webp',
    '.gif': 'image/gif',
  };
  return map[e] || 'application/octet-stream';
}
