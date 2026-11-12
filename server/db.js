const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const { generateTrackMedia } = require('./generateMedia');

// DATA_DIR lets a mounted volume (Render/Railway/Fly) hold the SQLite file.
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'zksong.sqlite');
const db = new DatabaseSync(DB_PATH);

// Enable WAL and Foreign Keys
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Holds the single administrator identity resolved at bootstrap
const adminAccount = { email: (process.env.ADMIN_EMAIL || 'admin@gmail.com').trim().toLowerCase(), id: null };

function initDatabase() {
  generateTrackMedia();

  db.exec(`
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
  `);

  // Seed default settings if empty
  const defaultSettings = {
    site_name: 'ZK-SONG',
    site_tagline: 'Next-Gen Music Publishing, Cloud Mastering & Global Streaming API',
    site_description:
      'The professional music-uploading & distribution ecosystem for artists, musicians, and composers. Upload studio tracks, earn the Artist of the Month crown, and stream globally to external music apps via the ZK-SONG REST API.',
    logo_url: '/uploads/branding/zk-logo.svg',
    primary_color: '#8b5cf6',
    secondary_color: '#06b6d4',
    accent_badge_text: 'STUDIO CLOUD v2.6',
    contact_email: 'support@zksong.io',
    footer_text: '© 2026 ZK-SONG Music Publishing & API Ecosystem. Built for Artists & Streaming Apps.',
    allow_registration: 'true',
    require_moderation: 'true',
    max_upload_mb: '100',
    platform_total_rejected: '2',
  };

  const insertSetting = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
  for (const [k, v] of Object.entries(defaultSettings)) {
    insertSetting.run(k, v);
  }

  // ---------------------------------------------------------------------------
  // Bootstrap the single platform administrator.
  // No demo artists, songs, keys, notifications or activity are seeded — the
  // platform starts empty and is entirely driven by the admin credentials below.
  // ---------------------------------------------------------------------------
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    const email = (process.env.ADMIN_EMAIL || 'admin@gmail.com').trim().toLowerCase();
    const password = process.env.ADMIN_PASSWORD || 'admin123';
    const adminName = process.env.ADMIN_NAME || 'Platform Administrator';

    const nameClash = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(email);
    if (nameClash) {
      db.prepare('UPDATE users SET role = ?, status = ? WHERE id = ?').run('admin', 'active', nameClash.id);
    } else {
      db.prepare(`
        INSERT INTO users (name, email, password_hash, role, status, avatar_url, bio, primary_genre, country, website, rejected_songs_count, created_at)
        VALUES (?, ?, ?, 'admin', 'active', '', ?, 'All Genres', '', '', 0, ?)
      `).run(
        adminName,
        email,
        bcrypt.hashSync(password, 10),
        'Platform owner and Head of A&R curation.',
        new Date().toISOString()
      );
    }
    adminAccount.email = email;
  } else {
    // Self-healing: guarantee exactly one administrator exists.
    const admins = db.prepare("SELECT id, email FROM users WHERE role = 'admin' ORDER BY id ASC").all();
    if (admins.length === 0) {
      const first = db.prepare('SELECT id FROM users ORDER BY id ASC').get();
      if (first) {
        db.prepare("UPDATE users SET role = 'admin', status = 'active' WHERE id = ?").run(first.id);
        adminAccount.email = email;
        adminAccount.id = first.id;
      }
    } else {
      adminAccount.email = admins[0].email;
      adminAccount.id = admins[0].id;
      db.prepare("UPDATE users SET status = 'active' WHERE id = ?").run(admins[0].id);
    }
  }
}

function getSettingsMap() {
  const rows = db.prepare('SELECT key, value FROM settings').all();
  const map = {};
  for (const r of rows) {
    map[r.key] = r.value;
  }
  return map;
}

/**
 * Automatically calculates Artist of the Month based on the highest number of approved songs
 * in the target month (defaults to current UTC month YYYY-MM, e.g., 2026-11).
 * If no songs have been approved in the current month yet, falls back to all-time approved count.
 */
function getArtistOfTheMonth(targetYearMonth = null) {
  const now = new Date();
  const ym = targetYearMonth || now.toISOString().slice(0, 7); // e.g. '2026-11'

  const [yearStr, monthStr] = ym.split('-');
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const monthIndex = Math.max(0, Math.min(11, parseInt(monthStr, 10) - 1));
  const monthLabel = `${monthNames[monthIndex]} ${yearStr}`;

  // Rank users by approved songs in this month
  let leaderboard = db.prepare(`
    SELECT
      u.id as user_id,
      u.name,
      u.email,
      u.avatar_url,
      u.bio,
      u.primary_genre,
      u.country,
      u.website,
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
    LIMIT 10
  `).all(ym);

  let calculationMode = 'monthly';

  // Fallback if a brand-new month has 0 approvals yet
  if (leaderboard.length === 0) {
    calculationMode = 'all_time_fallback';
    leaderboard = db.prepare(`
      SELECT
        u.id as user_id,
        u.name,
        u.email,
        u.avatar_url,
        u.bio,
        u.primary_genre,
        u.country,
        u.website,
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
      LIMIT 10
    `).all();
  }

  const winner = leaderboard.length > 0 ? leaderboard[0] : null;
  let winnerSongs = [];

  if (winner) {
    winnerSongs = db.prepare(`
      SELECT *
      FROM songs
      WHERE user_id = ? AND status = 'approved'
      ORDER BY COALESCE(approved_at, created_at) DESC
    `).all(winner.user_id);
  }

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

initDatabase();

module.exports = {
  db,
  getSettingsMap,
  getArtistOfTheMonth,
  adminAccount,
  ADMIN_EMAIL: adminAccount.email,
};
