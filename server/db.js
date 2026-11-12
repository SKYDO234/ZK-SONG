const fs = require('fs');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');
const { generateTrackMedia } = require('./generateMedia');

const DATA_DIR = path.join(__dirname, 'data');
fs.mkdirSync(DATA_DIR, { recursive: true });

const DB_PATH = path.join(DATA_DIR, 'zksong.sqlite');
const db = new DatabaseSync(DB_PATH);

// Enable WAL and Foreign Keys
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

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

  // Seed users if empty
  const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
  if (userCount === 0) {
    const adminPass = bcrypt.hashSync('Admin@123', 10);
    const artistPass = bcrypt.hashSync('Artist@123', 10);

    const insertUser = db.prepare(`
      INSERT INTO users (name, email, password_hash, role, status, avatar_url, bio, primary_genre, country, website, rejected_songs_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertUser.run(
      'ZK Master Admin',
      'admin@zksong.io',
      adminPass,
      'admin',
      'active',
      '/uploads/avatars/avatar-admin.svg',
      'Platform Administrator & Head of A&R Curation at ZK-SONG.',
      'All Genres',
      'United States',
      'https://zksong.io',
      0,
      '2026-10-01T08:00:00.000Z'
    );

    insertUser.run(
      'Aria Vance',
      'aria@zksong.io',
      artistPass,
      'user',
      'active',
      '/uploads/avatars/avatar-aria.svg',
      'Synthwave & Electronic producer crafting neon-drenched analog soundscapes, modular arpeggios, and cinematic vocals.',
      'Synthwave',
      'United States',
      'https://ariavance.music',
      1,
      '2026-10-12T10:30:00.000Z'
    );

    insertUser.run(
      'Kaelen Rivera',
      'kaelen@zksong.io',
      artistPass,
      'user',
      'active',
      '/uploads/avatars/avatar-kael.svg',
      'Progressive house & retrowave multi-instrumentalist blending live electric guitars with deep club grooves.',
      'Progressive House',
      'Canada',
      'https://kaelenrivera.io',
      1,
      '2026-10-15T14:20:00.000Z'
    );

    insertUser.run(
      'Lyra Chen',
      'lyra@zksong.io',
      artistPass,
      'user',
      'active',
      '/uploads/avatars/avatar-lyra.svg',
      'Cinematic composer, classical pianist, and ambient bass sound designer from Singapore.',
      'Cinematic',
      'Singapore',
      'https://lyrachen.audio',
      0,
      '2026-10-20T09:15:00.000Z'
    );

    insertUser.run(
      'Zayn Mercer',
      'zayn.suspended@zksong.io',
      artistPass,
      'user',
      'banned',
      '/uploads/avatars/avatar-zayn.svg',
      'Experimental bootleg remixer (Account suspended for uncredited stems).',
      'Trap',
      'United Kingdom',
      '',
      2,
      '2026-10-22T11:45:00.000Z'
    );

    // Get inserted user IDs
    const aria = db.prepare('SELECT id FROM users WHERE email = ?').get('aria@zksong.io');
    const kaelen = db.prepare('SELECT id FROM users WHERE email = ?').get('kaelen@zksong.io');
    const lyra = db.prepare('SELECT id FROM users WHERE email = ?').get('lyra@zksong.io');
    const admin = db.prepare('SELECT id FROM users WHERE email = ?').get('admin@zksong.io');

    const getFileSize = (sub, file) => {
      if (!file) return 0;
      const p = path.join(__dirname, 'uploads', sub, file);
      return fs.existsSync(p) ? fs.statSync(p).size : 0;
    };

    const insertSong = db.prepare(`
      INSERT INTO songs (
        user_id, title, artist, featured_artist, musician, composer,
        is_cover, original_credit, genre, release_year, bpm, duration, duration_formatted,
        description, lyrics, audio_url, audio_filename, audio_size, audio_mime,
        thumbnail_url, thumbnail_filename, video_url, video_filename, video_size,
        status, plays_count, downloads_count, approved_at, approved_by, created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?, ?
      )
    `);

    // 1. Aria Vance - Approved #1 (Nov 2026) with Video
    insertSong.run(
      aria.id,
      'Neon Odyssey',
      'Aria Vance',
      'Nova Pulse',
      'Aria Vance (Prophet-6, Moog Sub 37), Marcus Bell (Live Drums)',
      'Aria Vance & Viktor K.',
      0,
      '',
      'Synthwave',
      2026,
      124,
      20,
      '0:20',
      'Flagship analog synthwave anthem recorded with vintage Prophet-6 polysynths and gated reverb percussion.',
      '[Verse 1]\nCruising through the violet grid at midnight\nChrome reflections dancing in the rain\n[Chorus]\nWe are riding the Neon Odyssey\nBeyond the horizon of sound and light',
      '/uploads/audio/neon-odyssey.mp3',
      'neon-odyssey.mp3',
      getFileSize('audio', 'neon-odyssey.mp3'),
      'audio/mpeg',
      '/uploads/thumbnails/neon-odyssey.svg',
      'neon-odyssey.svg',
      '/uploads/videos/neon-odyssey.mp4',
      'neon-odyssey.mp4',
      getFileSize('videos', 'neon-odyssey.mp4'),
      'approved',
      1840,
      312,
      '2026-11-03T14:20:00.000Z',
      admin.id,
      '2026-11-02T19:00:00.000Z'
    );

    // 2. Aria Vance - Approved #2 (Nov 2026) with Video
    insertSong.run(
      aria.id,
      'Cybernetic Horizon',
      'Aria Vance',
      '',
      'Aria Vance (Modular Eurorack, Roland Juno-106)',
      'Aria Vance',
      0,
      '',
      'Electronic',
      2026,
      128,
      18,
      '0:18',
      'High-energy melodic electronic driver built around a 16-step Buchla & Eurorack sequence.',
      '[Instrumental Intro]\n[Drop]\nDigital skylines awakening in stereo\nPulse locked at 128 BPM',
      '/uploads/audio/cybernetic-horizon.mp3',
      'cybernetic-horizon.mp3',
      getFileSize('audio', 'cybernetic-horizon.mp3'),
      'audio/mpeg',
      '/uploads/thumbnails/cybernetic-horizon.svg',
      'cybernetic-horizon.svg',
      '/uploads/videos/cybernetic-horizon.mp4',
      'cybernetic-horizon.mp4',
      getFileSize('videos', 'cybernetic-horizon.mp4'),
      'approved',
      1420,
      245,
      '2026-11-06T18:45:00.000Z',
      admin.id,
      '2026-11-05T11:30:00.000Z'
    );

    // 3. Aria Vance - Approved #3 (Nov 2026) - Cover Song = YES
    insertSong.run(
      aria.id,
      'Starlight Echoes (Cover)',
      'Aria Vance',
      'Elena Rostova (Cello)',
      'Aria Vance (Grand Piano, Vocals), Elena Rostova (Electric Cello)',
      'Original by The Midnight Pulse • Arranged by Aria Vance',
      1,
      'Original song "Starlight Echoes" by The Midnight Pulse (Licensed under Mechanical Cover License #MC-9921)',
      'Dream Pop',
      2026,
      110,
      16,
      '0:16',
      'An intimate dream-pop and electric cello reimagining of the classic synth ballad Starlight Echoes.',
      '[Verse]\nStarlight echoes across the quiet bay\nEvery frequency calling out your name',
      '/uploads/audio/starlight-echoes-cover.mp3',
      'starlight-echoes-cover.mp3',
      getFileSize('audio', 'starlight-echoes-cover.mp3'),
      'audio/mpeg',
      '/uploads/thumbnails/starlight-echoes-cover.svg',
      'starlight-echoes-cover.svg',
      '',
      '',
      0,
      'approved',
      980,
      164,
      '2026-11-09T11:10:00.000Z',
      admin.id,
      '2026-11-08T15:00:00.000Z'
    );

    // 4. Aria Vance - Pending Song
    insertSong.run(
      aria.id,
      'Velvet Midnight',
      'Aria Vance',
      '',
      'Aria Vance (Rhodes MkII, Analog Tape Delay)',
      'Aria Vance',
      0,
      '',
      'Chillwave',
      2026,
      105,
      19,
      '0:19',
      'Late-night chillwave composition featuring warm Fender Rhodes chords and tape saturation.',
      '[Verse]\nUnderneath the velvet midnight sky\nTime slows down in analog warmth',
      '/uploads/audio/velvet-midnight.mp3',
      'velvet-midnight.mp3',
      getFileSize('audio', 'velvet-midnight.mp3'),
      'audio/mpeg',
      '/uploads/thumbnails/velvet-midnight.svg',
      'velvet-midnight.svg',
      '',
      '',
      0,
      'pending',
      0,
      0,
      null,
      null,
      '2026-11-11T20:15:00.000Z'
    );

    // 5. Kaelen Rivera - Approved #1 (Nov 2026) with Video
    insertSong.run(
      kaelen.id,
      'Solar Flare Protocol',
      'Kaelen Rivera',
      '',
      'Kaelen Rivera (Lead Synth, Custom Stratocaster), Devon Miles (Bass)',
      'Kaelen Rivera',
      0,
      '',
      'Progressive House',
      2026,
      126,
      21,
      '0:21',
      'Mainstage progressive house Odyssey combining soaring guitar harmonics with sub-shaking basslines.',
      '[Build]\nSolar winds rising on the radar\nEngage the protocol now',
      '/uploads/audio/solar-flare-protocol.mp3',
      'solar-flare-protocol.mp3',
      getFileSize('audio', 'solar-flare-protocol.mp3'),
      'audio/mpeg',
      '/uploads/thumbnails/solar-flare-protocol.svg',
      'solar-flare-protocol.svg',
      '/uploads/videos/solar-flare-protocol.mp4',
      'solar-flare-protocol.mp4',
      getFileSize('videos', 'solar-flare-protocol.mp4'),
      'approved',
      1310,
      219,
      '2026-11-05T09:30:00.000Z',
      admin.id,
      '2026-11-04T12:00:00.000Z'
    );

    // 6. Kaelen Rivera - Approved #2 (Nov 2026)
    insertSong.run(
      kaelen.id,
      'Tokyo Rain Drift',
      'Kaelen Rivera',
      'Sora Takahashi (Saxophone)',
      'Kaelen Rivera (SP-404, Acoustic Guitar), Sora Takahashi (Tenor Sax)',
      'Kaelen Rivera & Sora Takahashi',
      0,
      '',
      'Lo-Fi Beats',
      2026,
      92,
      17,
      '0:17',
      'Dusty vinyl lo-fi hip-hop groove recorded during a rainy evening session in Shibuya.',
      '[Instrumental Lo-Fi Study Session]',
      '/uploads/audio/tokyo-rain-drift.mp3',
      'tokyo-rain-drift.mp3',
      getFileSize('audio', 'tokyo-rain-drift.mp3'),
      'audio/mpeg',
      '/uploads/thumbnails/tokyo-rain-drift.svg',
      'tokyo-rain-drift.svg',
      '',
      '',
      0,
      'approved',
      890,
      142,
      '2026-11-08T16:15:00.000Z',
      admin.id,
      '2026-11-07T10:00:00.000Z'
    );

    // 7. Kaelen Rivera - Pending Song (with Video & Cover = YES)
    insertSong.run(
      kaelen.id,
      'Blinding Pulse (Synth Cover)',
      'Kaelen Rivera',
      '',
      'Kaelen Rivera (Oberheim OB-X8, Drumtraks)',
      'Max Martin / Abel Tesfaye (Original) • Kaelen Rivera (Synth Arrangement)',
      1,
      '80s Analog Hardware Cover Tribute',
      'Retrowave',
      2026,
      132,
      18,
      '0:18',
      'Full hardware retrowave cover played live on an Oberheim OB-X8 with synchronized oscilloscope music video.',
      '[Chorus]\nBlinded by the neon pulse tonight\nRunning through the overdrive',
      '/uploads/audio/blinding-pulse-cover.mp3',
      'blinding-pulse-cover.mp3',
      getFileSize('audio', 'blinding-pulse-cover.mp3'),
      'audio/mpeg',
      '/uploads/thumbnails/blinding-pulse-cover.svg',
      'blinding-pulse-cover.svg',
      '/uploads/videos/blinding-pulse-cover.mp4',
      'blinding-pulse-cover.mp4',
      getFileSize('videos', 'blinding-pulse-cover.mp4'),
      'pending',
      0,
      0,
      null,
      null,
      '2026-11-12T06:30:00.000Z'
    );

    // 8. Lyra Chen - Approved #1 (Nov 2026)
    insertSong.run(
      lyra.id,
      'Quantum Bloom',
      'Lyra Chen',
      '',
      'Lyra Chen (Steinway Model D, Granular Harp, Sub Synth)',
      'Lyra Chen',
      0,
      '',
      'Ambient Bass',
      2026,
      118,
      18,
      '0:18',
      'Organic acoustic piano droplets colliding with deep binaural sub-bass harmonics.',
      '[Ambient Vocal Texture]\nBlooming in quantum symmetry',
      '/uploads/audio/quantum-bloom.mp3',
      'quantum-bloom.mp3',
      getFileSize('audio', 'quantum-bloom.mp3'),
      'audio/mpeg',
      '/uploads/thumbnails/quantum-bloom.svg',
      'quantum-bloom.svg',
      '',
      '',
      0,
      'approved',
      1120,
      198,
      '2026-11-10T12:00:00.000Z',
      admin.id,
      '2026-11-09T18:00:00.000Z'
    );

    // 9. Lyra Chen - Pending Song
    insertSong.run(
      lyra.id,
      'Ethereal Cathedral',
      'Lyra Chen',
      'Singapore Chamber Strings',
      'Lyra Chen (Pipe Organ, Piano), 12-Piece String Ensemble',
      'Lyra Chen',
      0,
      '',
      'Cinematic',
      2026,
      100,
      20,
      '0:20',
      'Sweeping orchestral and pipe organ piece scored for sci-fi trailers and immersive listening.',
      '[Orchestral Crescendo]',
      '/uploads/audio/ethereal-cathedral.mp3',
      'ethereal-cathedral.mp3',
      getFileSize('audio', 'ethereal-cathedral.mp3'),
      'audio/mpeg',
      '/uploads/thumbnails/ethereal-cathedral.svg',
      'ethereal-cathedral.svg',
      '',
      '',
      0,
      'pending',
      0,
      0,
      null,
      null,
      '2026-11-12T08:45:00.000Z'
    );

    // Seed API keys
    const insertApiKey = db.prepare(`
      INSERT INTO api_keys (name, key_prefix, api_key, permissions, status, requests_count, last_used_at, created_by, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    insertApiKey.run(
      'Spotify-Like Web Player (Production)',
      'zks_live_spot...5d4e',
      'zks_live_spotify_demo_key_2026_9f8a7b6c5d4e',
      'read:songs,stream:audio,read:artists',
      'active',
      148,
      '2026-11-12T10:15:00.000Z',
      admin.id,
      '2026-11-01T09:00:00.000Z'
    );

    insertApiKey.run(
      'PulseWave iOS & Android Music App',
      'zks_live_puls...f607',
      'zks_live_pulsewave_mobile_88a1b2c3d4e5f607',
      'read:songs,stream:audio,read:artists',
      'active',
      64,
      '2026-11-11T22:40:00.000Z',
      admin.id,
      '2026-11-04T14:30:00.000Z'
    );

    // Seed notifications
    const insertNotif = db.prepare(`
      INSERT INTO notifications (user_id, type, title, message, is_read, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);

    insertNotif.run(
      aria.id,
      'artist_of_month',
      '👑 Crowned Artist of the Month (November 2026)!',
      'Congratulations Aria Vance! With 3 approved tracks this month, you hold the #1 Artist of the Month badge across ZK-SONG and partner streaming apps.',
      0,
      '2026-11-09T11:12:00.000Z'
    );
    insertNotif.run(
      aria.id,
      'song_approved',
      'Track Approved: Starlight Echoes (Cover)',
      'Your song "Starlight Echoes (Cover)" passed studio moderation and is now live in the Approved Songs catalog & External REST API.',
      0,
      '2026-11-09T11:10:00.000Z'
    );
    insertNotif.run(
      aria.id,
      'song_rejected',
      'Track Removed on Moderation: Static Demo (Unmastered)',
      'Your earlier demo upload "Static Demo (Unmastered)" was rejected due to clipping above 0dBFS and permanently removed from platform storage.',
      1,
      '2026-11-04T16:00:00.000Z'
    );

    // Seed activity logs
    const insertLog = db.prepare(`
      INSERT INTO activity_logs (actor_id, actor_name, action, target_type, target_name, details, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    insertLog.run(
      admin.id,
      'ZK Master Admin',
      'APPROVED_SONG',
      'song',
      'Quantum Bloom',
      'Approved track by Lyra Chen and published to REST API.',
      '2026-11-10T12:00:00.000Z'
    );
    insertLog.run(
      admin.id,
      'ZK Master Admin',
      'APPROVED_SONG',
      'song',
      'Starlight Echoes (Cover)',
      'Approved cover song by Aria Vance. Aria Vance reached 3 approved songs in Nov 2026.',
      '2026-11-09T11:10:00.000Z'
    );
    insertLog.run(
      aria.id,
      'Aria Vance',
      'UPLOADED_SONG',
      'song',
      'Velvet Midnight',
      'Uploaded new Chillwave track (Pending moderation).',
      '2026-11-11T20:15:00.000Z'
    );
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
};
