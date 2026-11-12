const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const { db, getSettingsMap, getArtistOfTheMonth, ADMIN_EMAIL } = require('./db');

const app = express();
const PORT = process.env.PORT || 4000;
const JWT_SECRET = process.env.JWT_SECRET || 'zk-song-dev-only-change-me';
if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
  console.warn('[ZK-SONG] WARNING: JWT_SECRET is not set. Set it in production.');
}
const UPLOADS_ROOT = path.join(__dirname, 'uploads');

const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || '';
app.use(
  cors(
    ALLOWED_ORIGIN
      ? {
          origin: ALLOWED_ORIGIN.split(',').map((o) => o.trim()),
          credentials: true,
        }
      : { origin: true, credentials: true }
  )
);
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ extended: true, limit: '25mb' }));

// Security headers
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Powered-By', 'ZK-SONG-Engine/2.6');
  next();
});

// Helper for MIME types
function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();
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
  return map[ext] || 'application/octet-stream';
}

// Stream file with HTTP Range (206 Partial Content) support for smooth audio/video scrubbing
function streamMediaFile(req, res, filePath) {
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Media file not found' });
  }
  const stat = fs.statSync(filePath);
  const fileSize = stat.size;
  const mimeType = getMimeType(filePath);
  const range = req.headers.range;

  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=3600');

  if (range) {
    const parts = range.replace(/bytes=/, '').split('-');
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

    if (isNaN(start) || isNaN(end) || start >= fileSize || end >= fileSize) {
      res.writeHead(416, { 'Content-Range': `bytes */${fileSize}` });
      return res.end();
    }

    const chunksize = end - start + 1;
    const file = fs.createReadStream(filePath, { start, end });
    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Content-Length': chunksize,
      'Content-Type': mimeType,
    });
    file.pipe(res);
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Content-Type': mimeType,
    });
    fs.createReadStream(filePath).pipe(res);
  }
}

// Serve /uploads with Range support for audio/video and proper MIME for SVG/images
app.get('/uploads/:folder/:filename', (req, res) => {
  const allowedFolders = ['audio', 'thumbnails', 'videos', 'avatars', 'branding'];
  const { folder, filename } = req.params;
  if (!allowedFolders.includes(folder)) {
    return res.status(403).json({ error: 'Invalid media folder' });
  }
  const safeFile = path.basename(filename);
  const fullPath = path.join(UPLOADS_ROOT, folder, safeFile);
  return streamMediaFile(req, res, fullPath);
});

// Configure Multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    let sub = 'audio';
    if (file.fieldname === 'thumbnail') sub = 'thumbnails';
    else if (file.fieldname === 'video') sub = 'videos';
    else if (file.fieldname === 'avatar') sub = 'avatars';
    else if (file.fieldname === 'logo') sub = 'branding';
    const dest = path.join(UPLOADS_ROOT, sub);
    fs.mkdirSync(dest, { recursive: true });
    cb(null, dest);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.bin';
    const base = path
      .basename(file.originalname, path.extname(file.originalname))
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .slice(0, 32);
    const unique = `${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
    cb(null, `${base || 'media'}-${unique}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 120 * 1024 * 1024 }, // 120MB max
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.fieldname === 'audio') {
      const allowed = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.webm'];
      if (!allowed.includes(ext) && !file.mimetype.startsWith('audio/')) {
        return cb(new Error('Invalid audio file format. Allowed: MP3, WAV, OGG, FLAC, M4A, AAC.'));
      }
    } else if (file.fieldname === 'thumbnail' || file.fieldname === 'avatar' || file.fieldname === 'logo') {
      const allowed = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'];
      if (!allowed.includes(ext) && !file.mimetype.startsWith('image/')) {
        return cb(new Error('Invalid image format. Allowed: PNG, JPG, WEBP, SVG, GIF.'));
      }
    } else if (file.fieldname === 'video') {
      const allowed = ['.mp4', '.webm', '.mov', '.ogg', '.mkv'];
      if (!allowed.includes(ext) && !file.mimetype.startsWith('video/')) {
        return cb(new Error('Invalid video format. Allowed: MP4, WEBM, MOV.'));
      }
    }
    cb(null, true);
  },
});

// Helper to safely remove physical files of a deleted/rejected song if no other song references them
function deleteSongPhysicalFiles(song) {
  if (!song) return;
  const checkAndDelete = (folder, filename, colName) => {
    if (!filename) return;
    const count = db
      .prepare(`SELECT COUNT(*) as c FROM songs WHERE ${colName} = ? AND id != ?`)
      .get(filename, song.id).c;
    if (count === 0) {
      const filePath = path.join(UPLOADS_ROOT, folder, path.basename(filename));
      if (fs.existsSync(filePath)) {
        try {
          fs.unlinkSync(filePath);
        } catch (err) {
          console.error(`Failed to delete file ${filePath}:`, err.message);
        }
      }
    }
  };
  checkAndDelete('audio', song.audio_filename, 'audio_filename');
  checkAndDelete('thumbnails', song.thumbnail_filename, 'thumbnail_filename');
  if (song.video_filename) {
    checkAndDelete('videos', song.video_filename, 'video_filename');
  }
}

// Helper to enrich song objects with uploader info and Artist of the Month badge
function enrichSongs(songs, req = null) {
  const aotm = getArtistOfTheMonth();
  const winnerUserId = aotm.winner ? aotm.winner.user_id : null;
  const baseUrl = req ? `${req.protocol}://${req.get('host')}` : '';

  const userMap = {};
  const users = db
    .prepare('SELECT id, name, email, avatar_url, bio, primary_genre, country, status FROM users')
    .all();
  for (const u of users) {
    userMap[u.id] = u;
  }

  return songs.map((s) => {
    const uploader = userMap[s.user_id] || {
      id: s.user_id,
      name: s.artist,
      email: '',
      avatar_url: '/uploads/avatars/avatar-aria.svg',
    };
    const isAotm = winnerUserId !== null && Number(s.user_id) === Number(winnerUserId);
    return {
      ...s,
      is_cover: Boolean(s.is_cover),
      cover_song_label: s.is_cover ? 'Yes' : 'No',
      has_video: Boolean(s.video_url),
      full_audio_url: baseUrl ? `${baseUrl}${s.audio_url}` : s.audio_url,
      full_thumbnail_url: baseUrl ? `${baseUrl}${s.thumbnail_url}` : s.thumbnail_url,
      full_video_url: s.video_url ? (baseUrl ? `${baseUrl}${s.video_url}` : s.video_url) : null,
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

// Helper to enrich user object with stats & Artist of the Month badge
function enrichUser(user) {
  if (!user) return null;
  const aotm = getArtistOfTheMonth();
  const isAotm = aotm.winner && Number(aotm.winner.user_id) === Number(user.id);

  const counts = db
    .prepare(
      `SELECT
        COUNT(*) as active_count,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
        COALESCE(SUM(plays_count), 0) as total_plays,
        COALESCE(SUM(downloads_count), 0) as total_downloads
      FROM songs WHERE user_id = ?`
    )
    .get(user.id);

  const approved = Number(counts.approved_count || 0);
  const pending = Number(counts.pending_count || 0);
  const rejected = Number(user.rejected_songs_count || 0);
  const uploaded = approved + pending + rejected;

  const monthlyApproved = db
    .prepare(
      `SELECT COUNT(*) as c FROM songs
       WHERE user_id = ? AND status = 'approved'
       AND strftime('%Y-%m', COALESCE(approved_at, created_at)) = ?`
    )
    .get(user.id, aotm.year_month).c;

  const { password_hash, reset_token, reset_token_expires, ...safeUser } = user;
  return {
    ...safeUser,
    is_artist_of_the_month: Boolean(isAotm),
    artist_of_month_badge: isAotm
      ? {
          title: 'Artist of the Month',
          month: aotm.month_label,
          monthly_approved_count: aotm.winner.monthly_approved_count,
        }
      : null,
    stats: {
      uploaded,
      active_songs: approved + pending,
      approved,
      pending,
      rejected,
      monthly_approved: monthlyApproved,
      total_plays: Number(counts.total_plays || 0),
      total_downloads: Number(counts.total_downloads || 0),
    },
  };
}

// The single, immutable platform owner: configured via ADMIN_EMAIL (default admin@gmail.com).
// Only this account may hold the admin role, and it can never be banned, demoted or deleted.
const PLATFORM_OWNER_EMAIL = String(ADMIN_EMAIL || '').trim().toLowerCase();

function isPlatformOwner(user) {
  return Boolean(user) && String(user.email || '').trim().toLowerCase() === PLATFORM_OWNER_EMAIL;
}

// Auth Middleware
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please log in.' });
  }
  const token = authHeader.slice(7);
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id);
    if (!user) {
      return res.status(401).json({ error: 'Account no longer exists.' });
    }
    if (user.status === 'banned') {
      return res.status(403).json({
        error: 'Your account has been banned by an administrator. Contact platform support.',
      });
    }
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired session token. Please log in again.' });
  }
}

function requireAdmin(req, res, next) {
  requireAuth(req, res, () => {
    if (req.user.role !== 'admin' || !isPlatformOwner(req.user)) {
      return res.status(403).json({ error: 'Administrator privileges required.' });
    }
    next();
  });
}

// External REST API Key Authentication Middleware
function requireApiKey(req, res, next) {
  let rawKey =
    req.headers['x-api-key'] ||
    req.query.api_key ||
    (req.headers.authorization && req.headers.authorization.startsWith('Bearer ')
      ? req.headers.authorization.slice(7)
      : null);

  if (!rawKey) {
    return res.status(401).json({
      status: 'error',
      code: 'MISSING_API_KEY',
      message:
        'API key required. Pass your key via the "X-API-Key" header, "Authorization: Bearer <api_key>" header, or "?api_key=" query parameter.',
    });
  }

  const keyRow = db.prepare('SELECT * FROM api_keys WHERE api_key = ?').get(String(rawKey).trim());
  if (!keyRow) {
    return res.status(401).json({
      status: 'error',
      code: 'INVALID_API_KEY',
      message: 'The provided API key is invalid or does not exist.',
    });
  }

  if (keyRow.status !== 'active') {
    return res.status(403).json({
      status: 'error',
      code: 'REVOKED_API_KEY',
      message: 'This API key has been revoked by an administrator.',
    });
  }

  db.prepare(
    'UPDATE api_keys SET requests_count = requests_count + 1, last_used_at = ? WHERE id = ?'
  ).run(new Date().toISOString(), keyRow.id);

  req.apiKey = keyRow;
  next();
}

// ============================================================================
// 1. PUBLIC & BOOTSTRAP ROUTES
// ============================================================================
app.get('/api/public/bootstrap', (req, res) => {
  const settings = getSettingsMap();
  const aotm = getArtistOfTheMonth();

  const approvedSongsRaw = db
    .prepare(
      `SELECT * FROM songs WHERE status = 'approved' ORDER BY COALESCE(approved_at, created_at) DESC`
    )
    .all();
  const approvedSongs = enrichSongs(approvedSongsRaw, req);

  if (aotm.winner) {
    aotm.winner.approved_songs = enrichSongs(aotm.winner.approved_songs || [], req);
  }

  const totalArtists = db
    .prepare("SELECT COUNT(*) as c FROM users WHERE role = 'user' AND status = 'active'")
    .get().c;
  const totalPlays = db
    .prepare("SELECT COALESCE(SUM(plays_count), 0) as c FROM songs WHERE status = 'approved'")
    .get().c;
  const activeApiKeys = db
    .prepare("SELECT COUNT(*) as c FROM api_keys WHERE status = 'active'")
    .get().c;

  // Provide the first active demo API key so the public interactive Spotify-like API explorer works out of the box
  const demoKeyRow = db
    .prepare("SELECT api_key, name FROM api_keys WHERE status = 'active' ORDER BY id ASC LIMIT 1")
    .get();

  res.json({
    settings,
    artist_of_the_month: aotm,
    approved_songs: approvedSongs,
    demo_api_key: demoKeyRow ? demoKeyRow.api_key : null,
    stats: {
      approved_songs_count: approvedSongs.length,
      artists_count: totalArtists,
      total_plays: totalPlays,
      active_api_integrations: activeApiKeys,
    },
  });
});

app.post('/api/public/songs/:id/play', (req, res) => {
  const songId = Number(req.params.id);
  db.prepare('UPDATE songs SET plays_count = plays_count + 1 WHERE id = ?').run(songId);
  const updated = db.prepare('SELECT id, plays_count FROM songs WHERE id = ?').get(songId);
  res.json({ success: true, song: updated });
});

app.get('/api/public/songs/:id/download', (req, res) => {
  const songId = Number(req.params.id);
  const type = req.query.type || 'audio'; // 'audio' | 'video' | 'thumbnail'
  const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(songId);
  if (!song) {
    return res.status(404).json({ error: 'Song not found' });
  }

  db.prepare('UPDATE songs SET downloads_count = downloads_count + 1 WHERE id = ?').run(songId);

  let filePath;
  let downloadName;
  const cleanTitle = song.title.replace(/[^a-zA-Z0-9-_ ]/g, '').trim() || 'zk-song';

  if (type === 'video' && song.video_filename) {
    filePath = path.join(UPLOADS_ROOT, 'videos', path.basename(song.video_filename));
    downloadName = `${cleanTitle} - ${song.artist}${path.extname(song.video_filename)}`;
  } else if (type === 'thumbnail' && song.thumbnail_filename) {
    filePath = path.join(UPLOADS_ROOT, 'thumbnails', path.basename(song.thumbnail_filename));
    downloadName = `${cleanTitle} - Cover${path.extname(song.thumbnail_filename)}`;
  } else {
    filePath = path.join(UPLOADS_ROOT, 'audio', path.basename(song.audio_filename));
    downloadName = `${cleanTitle} - ${song.artist}${path.extname(song.audio_filename)}`;
  }

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Requested media file not found on storage' });
  }

  res.download(filePath, downloadName);
});

// ============================================================================
// 2. AUTHENTICATION ROUTES (Login, Register, Forgot Password, Reset Password)
// ============================================================================
app.post('/api/auth/register', (req, res) => {
  const settings = getSettingsMap();
  if (settings.allow_registration === 'false') {
    return res.status(403).json({
      error: 'New user registrations are currently disabled by the platform administrator.',
    });
  }

  const { name, email, password, primary_genre, bio, country } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'Name, email, and password are required.' });
  }
  if (String(password).length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  if (normalizedEmail === PLATFORM_OWNER_EMAIL) {
    return res.status(409).json({ error: 'An account with this email address already exists.' });
  }
  const existing = db.prepare('SELECT id FROM users WHERE LOWER(email) = ?').get(normalizedEmail);
  if (existing) {
    return res.status(409).json({ error: 'An account with this email address already exists.' });
  }

  const passwordHash = bcrypt.hashSync(String(password), 10);
  const avatarChoices = [
    '/uploads/avatars/avatar-aria.svg',
    '/uploads/avatars/avatar-kael.svg',
    '/uploads/avatars/avatar-lyra.svg',
  ];
  const avatarUrl = avatarChoices[Math.floor(Math.random() * avatarChoices.length)];
  const now = new Date().toISOString();

  const result = db
    .prepare(
      `INSERT INTO users (name, email, password_hash, role, status, avatar_url, bio, primary_genre, country, created_at, updated_at)
       VALUES (?, ?, ?, 'user', 'active', ?, ?, ?, ?, ?, ?)`
    )
    .run(
      String(name).trim(),
      normalizedEmail,
      passwordHash,
      avatarUrl,
      bio ? String(bio).trim() : 'Independent recording artist & composer on ZK-SONG.',
      primary_genre || 'Electronic',
      country || 'United States',
      now,
      now
    );

  const userId = Number(result.lastInsertRowid);

  db.prepare(
    `INSERT INTO notifications (user_id, type, title, message, created_at)
     VALUES (?, 'system', 'Welcome to ZK-SONG Studio!', 'Your artist account is ready. Head over to Upload Song to submit your first track and compete for Artist of the Month!', ?)`
  ).run(userId, now);

  db.prepare(
    `INSERT INTO activity_logs (actor_id, actor_name, action, target_type, target_name, details, created_at)
     VALUES (?, ?, 'USER_REGISTERED', 'user', ?, 'New artist account registered.', ?)`
  ).run(userId, String(name).trim(), normalizedEmail, now);

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);
  const token = jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, {
    expiresIn: '7d',
  });

  res.status(201).json({
    token,
    user: enrichUser(user),
    message: 'Account created successfully!',
  });
});

app.post('/api/auth/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Please enter both email and password.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(normalizedEmail);
  if (!user) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const valid = bcrypt.compareSync(String(password), user.password_hash);
  if (!valid) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  if (user.status === 'banned') {
    return res.status(403).json({
      error:
        'Your account has been suspended by an administrator for violating platform guidelines.',
    });
  }

  const token = jwt.sign({ id: user.id, role: user.role, email: user.email }, JWT_SECRET, {
    expiresIn: '7d',
  });

  res.json({
    token,
    user: enrichUser(user),
    message: `Welcome back, ${user.name}!`,
  });
});

app.post('/api/auth/forgot-password', (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Please provide your registered email address.' });
  }
  const normalizedEmail = String(email).trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(normalizedEmail);
  if (!user) {
    return res.status(404).json({ error: 'No account found with that email address.' });
  }

  const resetCode = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  db.prepare('UPDATE users SET reset_token = ?, reset_token_expires = ? WHERE id = ?').run(
    resetCode,
    expires,
    user.id
  );

  console.log(`[ZK-SONG] Password reset code for ${normalizedEmail}: ${resetCode} (expires in 30 minutes)`);

  res.json({
    success: true,
    email: normalizedEmail,
    expires_in_minutes: 30,
    message: `A 6-digit verification code has been generated for ${normalizedEmail}. It expires in 30 minutes.`,
  });
});

app.post('/api/auth/reset-password', (req, res) => {
  const { email, reset_code, new_password } = req.body;
  if (!email || !reset_code || !new_password) {
    return res.status(400).json({ error: 'Email, verification code, and new password are required.' });
  }
  if (String(new_password).length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const user = db.prepare('SELECT * FROM users WHERE LOWER(email) = ?').get(normalizedEmail);
  if (!user || !user.reset_token || user.reset_token !== String(reset_code).trim()) {
    return res.status(400).json({ error: 'Invalid verification code.' });
  }

  if (user.reset_token_expires && new Date(user.reset_token_expires) < new Date()) {
    return res.status(400).json({ error: 'Verification code has expired. Please request a new one.' });
  }

  const newHash = bcrypt.hashSync(String(new_password), 10);
  db.prepare(
    'UPDATE users SET password_hash = ?, reset_token = NULL, reset_token_expires = NULL, updated_at = ? WHERE id = ?'
  ).run(newHash, new Date().toISOString(), user.id);

  res.json({
    success: true,
    message: 'Password updated successfully! You can now sign in with your new password.',
  });
});

app.get('/api/auth/me', requireAuth, (req, res) => {
  const unreadNotifs = db
    .prepare('SELECT COUNT(*) as c FROM notifications WHERE user_id = ? AND is_read = 0')
    .get(req.user.id).c;
  res.json({
    user: enrichUser(req.user),
    unread_notifications: unreadNotifs,
    artist_of_the_month: getArtistOfTheMonth(),
    is_platform_owner: isPlatformOwner(req.user),
  });
});

// ============================================================================
// 3. USER PANEL ROUTES (Dashboard, My Songs, Upload Song, Account Management)
// ============================================================================
app.get('/api/user/dashboard', requireAuth, (req, res) => {
  const enrichedUser = enrichUser(req.user);
  const aotm = getArtistOfTheMonth();

  const mySongsRaw = db
    .prepare('SELECT * FROM songs WHERE user_id = ? ORDER BY created_at DESC')
    .all(req.user.id);
  const mySongs = enrichSongs(mySongsRaw, req);

  const notifications = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 12')
    .all(req.user.id);

  res.json({
    user: enrichedUser,
    stats: enrichedUser.stats,
    recent_songs: mySongs.slice(0, 6),
    all_songs_count: mySongs.length,
    notifications,
    artist_of_the_month: aotm,
  });
});

app.get('/api/user/songs', requireAuth, (req, res) => {
  const {
    search = '',
    status = 'all',
    is_cover = 'all',
    genre = 'all',
    page = 1,
    limit = 10,
  } = req.query;

  let where = ['user_id = ?'];
  let params = [req.user.id];

  if (status && status !== 'all') {
    where.push('status = ?');
    params.push(status);
  }
  if (is_cover === 'yes' || is_cover === 'true' || is_cover === '1') {
    where.push('is_cover = 1');
  } else if (is_cover === 'no' || is_cover === 'false' || is_cover === '0') {
    where.push('is_cover = 0');
  }
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
  const total = db.prepare(`SELECT COUNT(*) as c FROM songs ${whereSql}`).get(...params).c;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(50, parseInt(limit, 10) || 10));
  const offset = (pageNum - 1) * limitNum;

  const rows = db
    .prepare(`SELECT * FROM songs ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limitNum, offset);

  const enrichedUser = enrichUser(req.user);

  res.json({
    songs: enrichSongs(rows, req),
    stats: enrichedUser.stats,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      total_pages: Math.max(1, Math.ceil(total / limitNum)),
    },
  });
});

app.post(
  '/api/user/songs',
  requireAuth,
  upload.fields([
    { name: 'audio', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
    { name: 'video', maxCount: 1 },
  ]),
  (req, res) => {
    try {
      const {
        title,
        artist,
        featured_artist = '',
        musician,
        composer,
        is_cover = 'no',
        original_credit = '',
        genre = 'Electronic',
        release_year = 2026,
        bpm = 120,
        duration = 18,
        duration_formatted = '0:18',
        description = '',
        lyrics = '',
      } = req.body;

      if (!title || !String(title).trim()) {
        return res.status(400).json({ error: 'Song Title is required.' });
      }
      if (!artist || !String(artist).trim()) {
        return res.status(400).json({ error: 'Artist name is required.' });
      }
      if (!musician || !String(musician).trim()) {
        return res.status(400).json({ error: 'Musician details are required.' });
      }
      if (!composer || !String(composer).trim()) {
        return res.status(400).json({ error: 'Composer details are required.' });
      }

      const audioFile = req.files && req.files.audio ? req.files.audio[0] : null;
      const thumbFile = req.files && req.files.thumbnail ? req.files.thumbnail[0] : null;
      const videoFile = req.files && req.files.video ? req.files.video[0] : null;

      if (!audioFile) {
        return res.status(400).json({ error: 'Please select or generate an Audio File to upload.' });
      }
      if (!thumbFile) {
        return res
          .status(400)
          .json({ error: 'Please select or generate a Thumbnail / Cover Image to upload.' });
      }

      const isCoverFlag =
        String(is_cover).toLowerCase() === 'yes' ||
        String(is_cover).toLowerCase() === 'true' ||
        String(is_cover) === '1'
          ? 1
          : 0;

      const settings = getSettingsMap();
      const autoApprove = settings.require_moderation === 'false' || req.user.role === 'admin';
      const initialStatus = autoApprove ? 'approved' : 'pending';
      const now = new Date().toISOString();

      const durSec = Math.max(1, parseInt(duration, 10) || 18);
      const mins = Math.floor(durSec / 60);
      const secs = String(durSec % 60).padStart(2, '0');
      const formattedDur = duration_formatted || `${mins}:${secs}`;

      const result = db
        .prepare(
          `INSERT INTO songs (
            user_id, title, artist, featured_artist, musician, composer,
            is_cover, original_credit, genre, release_year, bpm, duration, duration_formatted,
            description, lyrics, audio_url, audio_filename, audio_size, audio_mime,
            thumbnail_url, thumbnail_filename, video_url, video_filename, video_size,
            status, approved_at, approved_by, created_at, updated_at
          ) VALUES (
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?,
            ?, ?, ?, ?, ?
          )`
        )
        .run(
          req.user.id,
          String(title).trim(),
          String(artist).trim(),
          String(featured_artist).trim(),
          String(musician).trim(),
          String(composer).trim(),
          isCoverFlag,
          isCoverFlag ? String(original_credit).trim() : '',
          String(genre).trim() || 'Electronic',
          parseInt(release_year, 10) || 2026,
          parseInt(bpm, 10) || 120,
          durSec,
          formattedDur,
          String(description).trim(),
          String(lyrics).trim(),
          `/uploads/audio/${audioFile.filename}`,
          audioFile.filename,
          audioFile.size || 0,
          audioFile.mimetype || 'audio/mpeg',
          `/uploads/thumbnails/${thumbFile.filename}`,
          thumbFile.filename,
          videoFile ? `/uploads/videos/${videoFile.filename}` : '',
          videoFile ? videoFile.filename : '',
          videoFile ? videoFile.size || 0 : 0,
          initialStatus,
          autoApprove ? now : null,
          autoApprove ? req.user.id : null,
          now,
          now
        );

      const newSongId = Number(result.lastInsertRowid);
      const createdSong = db.prepare('SELECT * FROM songs WHERE id = ?').get(newSongId);

      db.prepare(
        `INSERT INTO notifications (user_id, type, title, message, created_at)
         VALUES (?, 'song_uploaded', ?, ?, ?)`
      ).run(
        req.user.id,
        `Uploaded: ${createdSong.title}`,
        initialStatus === 'approved'
          ? `Your track "${createdSong.title}" has been published directly to the Approved Songs library!`
          : `Your track "${createdSong.title}" has been uploaded and is currently Pending A&R Admin approval.`,
        now
      );

      db.prepare(
        `INSERT INTO activity_logs (actor_id, actor_name, action, target_type, target_name, details, created_at)
         VALUES (?, ?, 'UPLOADED_SONG', 'song', ?, ?, ?)`
      ).run(
        req.user.id,
        req.user.name,
        createdSong.title,
        `Uploaded ${createdSong.genre} track (${isCoverFlag ? 'Cover Song: Yes' : 'Original Track'})${videoFile ? ' with Music Video' : ''}.`,
        now
      );

      res.status(201).json({
        song: enrichSongs([createdSong], req)[0],
        message:
          initialStatus === 'approved'
            ? 'Song uploaded and automatically approved!'
            : 'Song uploaded successfully and submitted for Admin approval!',
      });
    } catch (err) {
      console.error('Upload error:', err);
      res.status(500).json({ error: err.message || 'Failed to upload song.' });
    }
  }
);

app.put('/api/user/songs/:id', requireAuth, (req, res) => {
  const songId = Number(req.params.id);
  const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(songId);
  if (!song) {
    return res.status(404).json({ error: 'Song not found.' });
  }
  if (song.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'You do not have permission to edit this song.' });
  }

  const {
    title = song.title,
    artist = song.artist,
    featured_artist = song.featured_artist,
    musician = song.musician,
    composer = song.composer,
    is_cover = song.is_cover,
    original_credit = song.original_credit,
    genre = song.genre,
    release_year = song.release_year,
    bpm = song.bpm,
    description = song.description,
    lyrics = song.lyrics,
  } = req.body;

  const isCoverFlag =
    is_cover === true ||
    is_cover === 1 ||
    String(is_cover).toLowerCase() === 'yes' ||
    String(is_cover).toLowerCase() === 'true' ||
    String(is_cover) === '1'
      ? 1
      : 0;

  db.prepare(
    `UPDATE songs SET
      title = ?, artist = ?, featured_artist = ?, musician = ?, composer = ?,
      is_cover = ?, original_credit = ?, genre = ?, release_year = ?, bpm = ?,
      description = ?, lyrics = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    String(title).trim(),
    String(artist).trim(),
    String(featured_artist).trim(),
    String(musician).trim(),
    String(composer).trim(),
    isCoverFlag,
    isCoverFlag ? String(original_credit).trim() : '',
    String(genre).trim(),
    parseInt(release_year, 10) || 2026,
    parseInt(bpm, 10) || 120,
    String(description).trim(),
    String(lyrics).trim(),
    new Date().toISOString(),
    songId
  );

  const updated = db.prepare('SELECT * FROM songs WHERE id = ?').get(songId);
  res.json({
    song: enrichSongs([updated], req)[0],
    message: 'Song details updated successfully.',
  });
});

app.delete('/api/user/songs/:id', requireAuth, (req, res) => {
  const songId = Number(req.params.id);
  const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(songId);
  if (!song) {
    return res.status(404).json({ error: 'Song not found.' });
  }
  if (song.user_id !== req.user.id && req.user.role !== 'admin') {
    return res.status(403).json({ error: 'You can only delete your own songs.' });
  }

  deleteSongPhysicalFiles(song);
  db.prepare('DELETE FROM songs WHERE id = ?').run(songId);

  res.json({
    success: true,
    deleted_id: songId,
    message: `"${song.title}" has been deleted.`,
  });
});

app.put('/api/user/account', requireAuth, upload.single('avatar'), (req, res) => {
  const { name, email, bio, primary_genre, country, website } = req.body;

  if (!name || !String(name).trim()) {
    return res.status(400).json({ error: 'Display / Artist Name cannot be empty.' });
  }
  if (!email || !String(email).trim()) {
    return res.status(400).json({ error: 'Email cannot be empty.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const conflict = db
    .prepare('SELECT id FROM users WHERE LOWER(email) = ? AND id != ?')
    .get(normalizedEmail, req.user.id);
  if (conflict) {
    return res.status(409).json({ error: 'That email address is already in use by another account.' });
  }

  const avatarUrl = req.file ? `/uploads/avatars/${req.file.filename}` : req.user.avatar_url;
  const now = new Date().toISOString();

  db.prepare(
    `UPDATE users SET
      name = ?, email = ?, avatar_url = ?, bio = ?, primary_genre = ?, country = ?, website = ?, updated_at = ?
     WHERE id = ?`
  ).run(
    String(name).trim(),
    normalizedEmail,
    avatarUrl,
    bio !== undefined ? String(bio).trim() : req.user.bio,
    primary_genre || req.user.primary_genre,
    country || req.user.country,
    website !== undefined ? String(website).trim() : req.user.website,
    now,
    req.user.id
  );

  const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  res.json({
    user: enrichUser(updatedUser),
    message: 'Account profile updated successfully!',
  });
});

app.put('/api/user/password', requireAuth, (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Both current password and new password are required.' });
  }
  if (String(new_password).length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters.' });
  }

  const valid = bcrypt.compareSync(String(current_password), req.user.password_hash);
  if (!valid) {
    return res.status(400).json({ error: 'Current password is incorrect.' });
  }

  const hash = bcrypt.hashSync(String(new_password), 10);
  db.prepare('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?').run(
    hash,
    new Date().toISOString(),
    req.user.id
  );

  res.json({
    success: true,
    message: 'Your password has been changed successfully.',
  });
});

app.get('/api/user/notifications', requireAuth, (req, res) => {
  const list = db
    .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 30')
    .all(req.user.id);
  res.json({ notifications: list });
});

app.post('/api/user/notifications/read', requireAuth, (req, res) => {
  db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(req.user.id);
  res.json({ success: true });
});

// ============================================================================
// 4. ADMIN PANEL ROUTES
//    (Dashboard, Songs Management, Song Details, Approve/Reject, Approved Songs,
//     User Management, API Key Management, Platform Settings)
// ============================================================================
app.get('/api/admin/dashboard', requireAdmin, (req, res) => {
  const songCounts = db
    .prepare(
      `SELECT
        COUNT(*) as active_songs,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_songs,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_songs,
        SUM(CASE WHEN is_cover = 1 THEN 1 ELSE 0 END) as cover_songs,
        SUM(CASE WHEN video_url != '' THEN 1 ELSE 0 END) as video_songs,
        COALESCE(SUM(plays_count), 0) as total_plays,
        COALESCE(SUM(downloads_count), 0) as total_downloads
      FROM songs`
    )
    .get();

  const rejectedSum = db
    .prepare('SELECT COALESCE(SUM(rejected_songs_count), 0) as c FROM users')
    .get().c;

  const userCounts = db
    .prepare(
      `SELECT
        COUNT(*) as total_users,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_users,
        SUM(CASE WHEN status = 'banned' THEN 1 ELSE 0 END) as banned_users,
        SUM(CASE WHEN role = 'admin' THEN 1 ELSE 0 END) as admin_users
      FROM users`
    )
    .get();

  const apiCounts = db
    .prepare(
      `SELECT
        COUNT(*) as total_keys,
        SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_keys,
        COALESCE(SUM(requests_count), 0) as total_requests
      FROM api_keys`
    )
    .get();

  const genreBreakdown = db
    .prepare(
      `SELECT genre, COUNT(*) as count,
        SUM(CASE WHEN status = 'approved' THEN 1 ELSE 0 END) as approved_count
       FROM songs GROUP BY genre ORDER BY count DESC`
    )
    .all();

  const pendingSongsRaw = db
    .prepare("SELECT * FROM songs WHERE status = 'pending' ORDER BY created_at DESC LIMIT 8")
    .all();

  const recentLogs = db
    .prepare('SELECT * FROM activity_logs ORDER BY created_at DESC LIMIT 12')
    .all();

  const aotm = getArtistOfTheMonth();
  if (aotm.winner) {
    aotm.winner.approved_songs = enrichSongs(aotm.winner.approved_songs || [], req);
  }

  const activeSongs = Number(songCounts.active_songs || 0);
  const approvedSongs = Number(songCounts.approved_songs || 0);
  const pendingSongs = Number(songCounts.pending_songs || 0);
  const rejectedSongs = Number(rejectedSum || 0);

  res.json({
    stats: {
      total_songs: activeSongs,
      total_lifetime_uploaded: activeSongs + rejectedSongs,
      approved_songs: approvedSongs,
      pending_songs: pendingSongs,
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
    pending_songs: enrichSongs(pendingSongsRaw, req),
    recent_activity: recentLogs,
    artist_of_the_month: aotm,
  });
});

app.get('/api/admin/songs', requireAdmin, (req, res) => {
  const {
    search = '',
    status = 'all',
    is_cover = 'all',
    has_video = 'all',
    genre = 'all',
    sort = 'newest',
    page = 1,
    limit = 12,
  } = req.query;

  let where = ['1=1'];
  let params = [];

  if (status && status !== 'all') {
    where.push('s.status = ?');
    params.push(status);
  }
  if (is_cover === 'yes' || is_cover === 'true' || is_cover === '1') {
    where.push('s.is_cover = 1');
  } else if (is_cover === 'no' || is_cover === 'false' || is_cover === '0') {
    where.push('s.is_cover = 0');
  }
  if (has_video === 'yes' || has_video === 'true') {
    where.push("s.video_url != ''");
  } else if (has_video === 'no' || has_video === 'false') {
    where.push("s.video_url = ''");
  }
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
  const total = db
    .prepare(
      `SELECT COUNT(*) as c FROM songs s LEFT JOIN users u ON u.id = s.user_id ${whereSql}`
    )
    .get(...params).c;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 12));
  const offset = (pageNum - 1) * limitNum;

  const rows = db
    .prepare(
      `SELECT s.* FROM songs s LEFT JOIN users u ON u.id = s.user_id ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`
    )
    .all(...params, limitNum, offset);

  const genres = db
    .prepare('SELECT DISTINCT genre FROM songs ORDER BY genre ASC')
    .all()
    .map((r) => r.genre);

  res.json({
    songs: enrichSongs(rows, req),
    genres,
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      total_pages: Math.max(1, Math.ceil(total / limitNum)),
    },
  });
});

app.get('/api/admin/songs/:id', requireAdmin, (req, res) => {
  const songId = Number(req.params.id);
  const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(songId);
  if (!song) {
    return res.status(404).json({ error: 'Song not found (it may have been rejected and permanently removed).' });
  }

  const enrichedSong = enrichSongs([song], req)[0];
  const uploaderRaw = db.prepare('SELECT * FROM users WHERE id = ?').get(song.user_id);
  const uploader = enrichUser(uploaderRaw);

  let approvedByAdmin = null;
  if (song.approved_by) {
    approvedByAdmin = db
      .prepare('SELECT id, name, email FROM users WHERE id = ?')
      .get(song.approved_by);
  }

  res.json({
    song: enrichedSong,
    uploader,
    approved_by_admin: approvedByAdmin,
    artist_of_the_month: getArtistOfTheMonth(),
  });
});

// APPROVE SONG -> Marks approved, adds to Approved Songs & External API, and recalculates Artist of the Month!
app.post('/api/admin/songs/:id/approve', requireAdmin, (req, res) => {
  const songId = Number(req.params.id);
  const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(songId);
  if (!song) {
    return res.status(404).json({ error: 'Song not found.' });
  }

  const now = new Date().toISOString();
  db.prepare(
    "UPDATE songs SET status = 'approved', approved_at = ?, approved_by = ?, updated_at = ? WHERE id = ?"
  ).run(now, req.user.id, now, songId);

  db.prepare(
    `INSERT INTO notifications (user_id, type, title, message, created_at)
     VALUES (?, 'song_approved', ?, ?, ?)`
  ).run(
    song.user_id,
    `✅ Song Approved: ${song.title}`,
    `Your track "${song.title}" has been approved by ${req.user.name} and is now live in the Approved Songs library and external streaming API!`,
    now
  );

  db.prepare(
    `INSERT INTO activity_logs (actor_id, actor_name, action, target_type, target_name, details, created_at)
     VALUES (?, ?, 'APPROVED_SONG', 'song', ?, ?, ?)`
  ).run(
    req.user.id,
    req.user.name,
    song.title,
    `Approved song "${song.title}" by ${song.artist}.`,
    now
  );

  const aotm = getArtistOfTheMonth();
  if (aotm.winner && Number(aotm.winner.user_id) === Number(song.user_id)) {
    db.prepare(
      `INSERT INTO notifications (user_id, type, title, message, created_at)
       VALUES (?, 'artist_of_month', ?, ?, ?)`
    ).run(
      song.user_id,
      `👑 You are leading Artist of the Month (${aotm.month_label})!`,
      `With ${aotm.winner.monthly_approved_count} approved songs in ${aotm.month_label}, you hold the #1 Artist of the Month badge across the platform!`,
      now
    );
  }

  const updatedSong = db.prepare('SELECT * FROM songs WHERE id = ?').get(songId);
  res.json({
    success: true,
    song: enrichSongs([updatedSong], req)[0],
    artist_of_the_month: aotm,
    message: `"${song.title}" has been approved and added to Approved Songs!`,
  });
});

// REJECT SONG -> Permanently removes the rejected song from the platform & disk storage!
app.post('/api/admin/songs/:id/reject', requireAdmin, (req, res) => {
  const songId = Number(req.params.id);
  const { reason = 'Did not meet studio quality or copyright verification standards.' } = req.body || {};

  const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(songId);
  if (!song) {
    return res.status(404).json({ error: 'Song not found.' });
  }

  const now = new Date().toISOString();

  // 1. Delete physical audio, thumbnail, and video files from disk if not shared
  deleteSongPhysicalFiles(song);

  // 2. Increment uploader's rejected_songs_count so their User Dashboard accurately tracks rejected count
  db.prepare(
    'UPDATE users SET rejected_songs_count = rejected_songs_count + 1, updated_at = ? WHERE id = ?'
  ).run(now, song.user_id);

  // 3. Notify the user
  db.prepare(
    `INSERT INTO notifications (user_id, type, title, message, created_at)
     VALUES (?, 'song_rejected', ?, ?, ?)`
  ).run(
    song.user_id,
    `❌ Song Rejected & Removed: ${song.title}`,
    `Your song "${song.title}" was rejected during moderation and permanently removed from the platform. Reason: ${reason}`,
    now
  );

  // 4. Record activity log
  db.prepare(
    `INSERT INTO activity_logs (actor_id, actor_name, action, target_type, target_name, details, created_at)
     VALUES (?, ?, 'REJECTED_AND_REMOVED_SONG', 'song', ?, ?, ?)`
  ).run(
    req.user.id,
    req.user.name,
    song.title,
    `Rejected and permanently removed "${song.title}" by ${song.artist}. Reason: ${reason}`,
    now
  );

  // 5. Permanently delete song from database
  db.prepare('DELETE FROM songs WHERE id = ?').run(songId);

  const aotm = getArtistOfTheMonth();

  res.json({
    success: true,
    removed_song_id: songId,
    removed_title: song.title,
    artist_of_the_month: aotm,
    message: `"${song.title}" was rejected and permanently removed from the platform.`,
  });
});

// Admin direct delete song (e.g. from Approved Songs library)
app.delete('/api/admin/songs/:id', requireAdmin, (req, res) => {
  const songId = Number(req.params.id);
  const song = db.prepare('SELECT * FROM songs WHERE id = ?').get(songId);
  if (!song) {
    return res.status(404).json({ error: 'Song not found.' });
  }

  deleteSongPhysicalFiles(song);
  db.prepare('DELETE FROM songs WHERE id = ?').run(songId);

  db.prepare(
    `INSERT INTO activity_logs (actor_id, actor_name, action, target_type, target_name, details, created_at)
     VALUES (?, ?, 'DELETED_SONG', 'song', ?, ?, ?)`
  ).run(
    req.user.id,
    req.user.name,
    song.title,
    `Permanently deleted song "${song.title}" by ${song.artist}.`,
    new Date().toISOString()
  );

  res.json({
    success: true,
    deleted_id: songId,
    artist_of_the_month: getArtistOfTheMonth(),
    message: `"${song.title}" has been permanently deleted from the platform.`,
  });
});

// ============================================================================
// 5. ADMIN USER MANAGEMENT ROUTES (List, Ban/Unban, Role Change, Delete)
// ============================================================================
app.get('/api/admin/users', requireAdmin, (req, res) => {
  const { search = '', status = 'all', role = 'all', page = 1, limit = 15 } = req.query;

  let where = ['1=1'];
  let params = [];

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
  const total = db.prepare(`SELECT COUNT(*) as c FROM users ${whereSql}`).get(...params).c;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 15));
  const offset = (pageNum - 1) * limitNum;

  const rows = db
    .prepare(`SELECT * FROM users ${whereSql} ORDER BY created_at DESC LIMIT ? OFFSET ?`)
    .all(...params, limitNum, offset);

  const enriched = rows.map((u) => enrichUser(u));

  res.json({
    users: enriched,
    artist_of_the_month: getArtistOfTheMonth(),
    pagination: {
      total,
      page: pageNum,
      limit: limitNum,
      total_pages: Math.max(1, Math.ceil(total / limitNum)),
    },
  });
});

app.post('/api/admin/users/:id/ban', requireAdmin, (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.user.id) {
    return res.status(400).json({ error: 'You cannot ban your own administrator account.' });
  }

  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
  if (!target) {
    return res.status(404).json({ error: 'User not found.' });
  }
  if (target.role === 'admin' || isPlatformOwner(target)) {
    return res.status(403).json({ error: 'The platform administrator account cannot be banned.' });
  }

  const newStatus = target.status === 'banned' ? 'active' : 'banned';
  const now = new Date().toISOString();

  db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?').run(
    newStatus,
    now,
    targetId
  );

  db.prepare(
    `INSERT INTO activity_logs (actor_id, actor_name, action, target_type, target_name, details, created_at)
     VALUES (?, ?, ?, 'user', ?, ?, ?)`
  ).run(
    req.user.id,
    req.user.name,
    newStatus === 'banned' ? 'BANNED_USER' : 'UNBANNED_USER',
    target.name,
    `${newStatus === 'banned' ? 'Banned' : 'Restored'} user account (${target.email}).`,
    now
  );

  const updated = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
  res.json({
    user: enrichUser(updated),
    artist_of_the_month: getArtistOfTheMonth(),
    message:
      newStatus === 'banned'
        ? `User "${target.name}" has been banned.`
        : `User "${target.name}" has been unbanned and restored to active status.`,
  });
});

app.put('/api/admin/users/:id/role', requireAdmin, (req, res) => {
  // ZK-SONG runs a single-administrator model: only the platform owner may hold
  // the admin role, so role escalation from the panel is not permitted.
  return res.status(403).json({
    error:
      'Administrator access is reserved for the platform owner account and cannot be granted or revoked from the panel.',
  });
});

app.delete('/api/admin/users/:id', requireAdmin, (req, res) => {
  const targetId = Number(req.params.id);
  if (targetId === req.user.id) {
    return res.status(400).json({ error: 'You cannot delete your own administrator account.' });
  }

  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(targetId);
  if (!target) {
    return res.status(404).json({ error: 'User not found.' });
  }
  if (target.role === 'admin' || isPlatformOwner(target)) {
    return res.status(403).json({ error: 'The platform administrator account cannot be deleted.' });
  }

  // Clean up physical files for all songs belonging to this user
  const userSongs = db.prepare('SELECT * FROM songs WHERE user_id = ?').all(targetId);
  for (const s of userSongs) {
    deleteSongPhysicalFiles(s);
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(targetId);

  db.prepare(
    `INSERT INTO activity_logs (actor_id, actor_name, action, target_type, target_name, details, created_at)
     VALUES (?, ?, 'DELETED_USER', 'user', ?, ?, ?)`
  ).run(
    req.user.id,
    req.user.name,
    target.name,
    `Permanently deleted user ${target.name} (${target.email}) and ${userSongs.length} associated tracks.`,
    new Date().toISOString()
  );

  res.json({
    success: true,
    deleted_id: targetId,
    artist_of_the_month: getArtistOfTheMonth(),
    message: `User "${target.name}" and their uploaded tracks have been permanently deleted.`,
  });
});

// ============================================================================
// 6. ADMIN API KEY MANAGEMENT ROUTES
// ============================================================================
app.get('/api/admin/api-keys', requireAdmin, (req, res) => {
  const keys = db.prepare('SELECT * FROM api_keys ORDER BY created_at DESC').all();
  res.json({ api_keys: keys });
});

app.post('/api/admin/api-keys', requireAdmin, (req, res) => {
  const { name, permissions = 'read:songs,stream:audio,read:artists' } = req.body;
  if (!name || !String(name).trim()) {
    return res
      .status(400)
      .json({ error: 'Please provide an application or client name for the API key.' });
  }

  const randomHex = crypto.randomBytes(18).toString('hex');
  const fullKey = `zks_live_${randomHex}`;
  const prefix = `${fullKey.slice(0, 13)}...${fullKey.slice(-4)}`;
  const now = new Date().toISOString();

  const result = db
    .prepare(
      `INSERT INTO api_keys (name, key_prefix, api_key, permissions, status, requests_count, created_by, created_at)
       VALUES (?, ?, ?, ?, 'active', 0, ?, ?)`
    )
    .run(String(name).trim(), prefix, fullKey, String(permissions).trim(), req.user.id, now);

  const created = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(Number(result.lastInsertRowid));

  db.prepare(
    `INSERT INTO activity_logs (actor_id, actor_name, action, target_type, target_name, details, created_at)
     VALUES (?, ?, 'CREATED_API_KEY', 'api_key', ?, ?, ?)`
  ).run(
    req.user.id,
    req.user.name,
    created.name,
    `Generated new API key (${prefix}) for external application integration.`,
    now
  );

  res.status(201).json({
    api_key: created,
    message: `Secure API Key generated for "${created.name}"!`,
  });
});

app.put('/api/admin/api-keys/:id/toggle', requireAdmin, (req, res) => {
  const keyId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(keyId);
  if (!existing) {
    return res.status(404).json({ error: 'API Key not found.' });
  }

  const newStatus = existing.status === 'active' ? 'revoked' : 'active';
  db.prepare('UPDATE api_keys SET status = ? WHERE id = ?').run(newStatus, keyId);
  const updated = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(keyId);

  res.json({
    api_key: updated,
    message: `API Key "${updated.name}" is now ${newStatus.toUpperCase()}.`,
  });
});

app.delete('/api/admin/api-keys/:id', requireAdmin, (req, res) => {
  const keyId = Number(req.params.id);
  const existing = db.prepare('SELECT * FROM api_keys WHERE id = ?').get(keyId);
  if (!existing) {
    return res.status(404).json({ error: 'API Key not found.' });
  }

  db.prepare('DELETE FROM api_keys WHERE id = ?').run(keyId);
  res.json({
    success: true,
    deleted_id: keyId,
    message: `API Key "${existing.name}" has been permanently deleted.`,
  });
});

// ============================================================================
// 7. ADMIN PLATFORM SETTINGS ROUTES
// ============================================================================
app.get('/api/admin/settings', requireAdmin, (req, res) => {
  res.json({ settings: getSettingsMap() });
});

app.put('/api/admin/settings', requireAdmin, upload.single('logo'), (req, res) => {
  const allowedKeys = [
    'site_name',
    'site_tagline',
    'site_description',
    'logo_url',
    'primary_color',
    'secondary_color',
    'accent_badge_text',
    'contact_email',
    'footer_text',
    'allow_registration',
    'require_moderation',
    'max_upload_mb',
  ];

  const upsert = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );

  for (const key of allowedKeys) {
    if (req.body[key] !== undefined) {
      upsert.run(key, String(req.body[key]));
    }
  }

  if (req.file) {
    const newLogoUrl = `/uploads/branding/${req.file.filename}`;
    upsert.run('logo_url', newLogoUrl);
  }

  const updatedSettings = getSettingsMap();

  db.prepare(
    `INSERT INTO activity_logs (actor_id, actor_name, action, target_type, target_name, details, created_at)
     VALUES (?, ?, 'UPDATED_SETTINGS', 'settings', ?, 'Updated website branding and platform configuration.', ?)`
  ).run(req.user.id, req.user.name, updatedSettings.site_name, new Date().toISOString());

  res.json({
    settings: updatedSettings,
    message: 'Platform settings and branding updated successfully!',
  });
});

// ============================================================================
// 8. EXTERNAL REST API (/api/v1/...) FOR SPOTIFY-LIKE EXTERNAL MUSIC APPS
// ============================================================================
function formatExternalSong(s, req) {
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const keyParam = req.apiKey ? `?api_key=${encodeURIComponent(req.apiKey.api_key)}` : '';
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
    thumbnail_url: `${baseUrl}${s.thumbnail_url}`,
    thumbnail_path: s.thumbnail_url,
    audio_url: `${baseUrl}${s.audio_url}`,
    audio_path: s.audio_url,
    stream_url: `${baseUrl}/api/v1/stream/${s.id}${keyParam}`,
    video_url: s.video_url ? `${baseUrl}${s.video_url}` : null,
    video_path: s.video_url || null,
    download_url: `${baseUrl}/api/public/songs/${s.id}/download`,
    plays_count: s.plays_count,
    downloads_count: s.downloads_count,
    approved_at: s.approved_at,
    created_at: s.created_at,
    is_artist_of_the_month: s.is_artist_of_the_month,
    artist_of_month_badge: s.artist_of_month_badge,
    uploader: s.uploader,
  };
}

app.get('/api/v1/songs', requireApiKey, (req, res) => {
  const {
    search = '',
    genre = '',
    artist = '',
    is_cover = '',
    sort = 'latest',
    page = 1,
    limit = 50,
  } = req.query;

  let where = ["status = 'approved'"];
  let params = [];

  if (genre && genre !== 'all') {
    where.push('LOWER(genre) = LOWER(?)');
    params.push(String(genre).trim());
  }
  if (artist) {
    where.push('LOWER(artist) LIKE LOWER(?)');
    params.push(`%${String(artist).trim()}%`);
  }
  if (is_cover === 'true' || is_cover === 'yes' || is_cover === '1') {
    where.push('is_cover = 1');
  } else if (is_cover === 'false' || is_cover === 'no' || is_cover === '0') {
    where.push('is_cover = 0');
  }
  if (search && String(search).trim()) {
    const q = `%${String(search).trim()}%`;
    where.push('(title LIKE ? OR artist LIKE ? OR musician LIKE ? OR composer LIKE ? OR genre LIKE ?)');
    params.push(q, q, q, q, q);
  }

  let orderSql = 'COALESCE(approved_at, created_at) DESC';
  if (sort === 'popular' || sort === 'plays') orderSql = 'plays_count DESC';
  else if (sort === 'title') orderSql = 'title COLLATE NOCASE ASC';

  const whereSql = `WHERE ${where.join(' AND ')}`;
  const total = db.prepare(`SELECT COUNT(*) as c FROM songs ${whereSql}`).get(...params).c;

  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit, 10) || 50));
  const offset = (pageNum - 1) * limitNum;

  const rows = db
    .prepare(`SELECT * FROM songs ${whereSql} ORDER BY ${orderSql} LIMIT ? OFFSET ?`)
    .all(...params, limitNum, offset);

  const enriched = enrichSongs(rows, req).map((s) => formatExternalSong(s, req));
  const aotm = getArtistOfTheMonth();
  const settings = getSettingsMap();

  res.json({
    status: 'success',
    platform: {
      name: settings.site_name,
      tagline: settings.site_tagline,
      api_version: 'v1.0',
      authenticated_client: req.apiKey.name,
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
    total_approved_songs: total,
    pagination: {
      page: pageNum,
      limit: limitNum,
      total_pages: Math.max(1, Math.ceil(total / limitNum)),
    },
    songs: enriched,
  });
});

app.get('/api/v1/songs/:id', requireApiKey, (req, res) => {
  const songId = Number(req.params.id);
  const song = db
    .prepare("SELECT * FROM songs WHERE id = ? AND status = 'approved'")
    .get(songId);
  if (!song) {
    return res.status(404).json({
      status: 'error',
      code: 'SONG_NOT_FOUND',
      message: 'Approved song with the specified ID was not found.',
    });
  }

  const formatted = formatExternalSong(enrichSongs([song], req)[0], req);
  res.json({
    status: 'success',
    song: formatted,
  });
});

app.get('/api/v1/artist-of-the-month', requireApiKey, (req, res) => {
  const aotm = getArtistOfTheMonth();
  if (aotm.winner) {
    aotm.winner.approved_songs = enrichSongs(aotm.winner.approved_songs || [], req).map((s) =>
      formatExternalSong(s, req)
    );
  }
  res.json({
    status: 'success',
    artist_of_the_month: aotm,
  });
});

app.get('/api/v1/stream/:id', requireApiKey, (req, res) => {
  const songId = Number(req.params.id);
  const song = db
    .prepare("SELECT * FROM songs WHERE id = ? AND status = 'approved'")
    .get(songId);
  if (!song) {
    return res.status(404).json({
      status: 'error',
      code: 'SONG_NOT_FOUND',
      message: 'Approved song not found.',
    });
  }

  db.prepare('UPDATE songs SET plays_count = plays_count + 1 WHERE id = ?').run(songId);
  const fullPath = path.join(UPLOADS_ROOT, 'audio', path.basename(song.audio_filename));
  return streamMediaFile(req, res, fullPath);
});

// Error handler for multer and general API errors
app.use((err, req, res, next) => {
  if (err) {
    return res.status(400).json({ error: err.message || 'Request error' });
  }
  next();
});

// Serve built frontend in production
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
    res.sendFile(path.join(distPath, 'index.html'));
  });
}

app.listen(PORT, '0.0.0.0', () => {
  console.log(`🎵 ZK-SONG Backend API & Streaming Server listening on http://0.0.0.0:${PORT}`);
});
