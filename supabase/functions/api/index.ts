// ============================================================================
// ZK-SONG — Supabase Edge Function API
//
// A complete, serverless implementation of the ZK-SONG backend: authentication,
// artist studio, admin moderation, media storage and the external /api/v1 API.
// Mirrors the routes of the bundled Express server (server/index.js) so the same
// React frontend works against either backend.
//
// Deploy:  supabase functions deploy api --no-verify-jwt
// Secrets: supabase secrets set ADMIN_EMAIL=admin@gmail.com ADMIN_PASSWORD=admin123 \
//                                 APP_JWT_SECRET=<long-random-string>
// SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY are injected automatically.
// ============================================================================

import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const JWT_SECRET = Deno.env.get('APP_JWT_SECRET') || 'zk-song-change-me-in-production';
const ADMIN_EMAIL = (Deno.env.get('ADMIN_EMAIL') || 'admin@gmail.com').trim().toLowerCase();
const ADMIN_PASSWORD = Deno.env.get('ADMIN_PASSWORD') || 'admin123';
const ADMIN_NAME = Deno.env.get('ADMIN_NAME') || 'Platform Administrator';
const BUCKET = 'media';
const JWT_TTL_SECONDS = 60 * 60 * 24 * 7;

const db = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const CORS = {
  'Access-Control-Allow-Origin': Deno.env.get('ALLOWED_ORIGIN') || '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-api-key, content-type, range',
  'Access-Control-Expose-Headers': 'content-range, content-length, accept-ranges',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS, 'content-type': 'application/json; charset=utf-8' },
  });

const err = (message: string, status = 400) => json({ error: message }, status);

// ---------------------------------------------------------------------------
// Password hashing (PBKDF2-SHA256, Web Crypto — no external dependencies)
// ---------------------------------------------------------------------------
const enc = new TextEncoder();
const b64 = (buf: ArrayBuffer | Uint8Array) =>
  btoa(String.fromCharCode(...new Uint8Array(buf as ArrayBuffer)));

async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 120_000 },
    key,
    256,
  );
  return `pbkdf2$120000$${b64(salt)}$${b64(bits)}`;
}

async function verifyPassword(password: string, stored: string) {
  const [scheme, iter, saltB64, hashB64] = String(stored || '').split('$');
  if (scheme !== 'pbkdf2') return false;
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: Number(iter) },
    key,
    256,
  );
  const expected = Uint8Array.from(atob(hashB64), (c) => c.charCodeAt(0));
  const actual = new Uint8Array(bits);
  if (expected.length !== actual.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i += 1) diff |= expected[i] ^ actual[i];
  return diff === 0;
}

// ---------------------------------------------------------------------------
// JWT (HS256) — sign / verify
// ---------------------------------------------------------------------------
const jwtKey = await crypto.subtle.importKey(
  'raw',
  enc.encode(JWT_SECRET),
  { name: 'HMAC', hash: 'SHA-256' },
  false,
  ['sign', 'verify'],
);

const b64url = (input: string | Uint8Array) =>
  btoa(typeof input === 'string' ? input : String.fromCharCode(...input))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

const b64urlDecode = (input: string) =>
  atob(input.replace(/-/g, '+').replace(/_/g, '/'));

async function signToken(payload: Record<string, unknown>) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(
    JSON.stringify({ ...payload, iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + JWT_TTL_SECONDS }),
  );
  const data = `${header}.${body}`;
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', jwtKey, enc.encode(data)));
  return `${data}.${b64url(sig)}`;
}

async function verifyToken(token: string): Promise<Record<string, any> | null> {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const data = `${parts[0]}.${parts[1]}`;
  const sig = Uint8Array.from(b64urlDecode(parts[2]), (c) => c.charCodeAt(0));
  const ok = await crypto.subtle.verify('HMAC', jwtKey, sig, enc.encode(data));
  if (!ok) return null;
  const payload = JSON.parse(b64urlDecode(parts[1]));
  if (payload.exp && payload.exp < Math.floor(Date.now() / 1000)) return null;
  return payload;
}

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------
const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const absolute = (url: string | null) =>
  !url ? url : /^https?:\/\//i.test(url) ? url : `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${url}`;

const slug = (name: string) =>
  (name || 'file')
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(-64) || 'file';

const monthKey = (d = new Date()) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
function monthLabel(ym: string) {
  const [y, m] = ym.split('-');
  return `${MONTHS[Math.max(0, Math.min(11, Number(m) - 1))]} ${y}`;
}

async function getSettings(): Promise<Record<string, string>> {
  const { data } = await db.from('settings').select('key,value');
  const map: Record<string, string> = {};
  for (const row of data || []) map[row.key] = row.value;
  return map;
}

async function setSettings(patch: Record<string, string>) {
  const rows = Object.entries(patch)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([key, value]) => ({ key, value: String(value) }));
  if (rows.length) await db.from('settings').upsert(rows, { onConflict: 'key' });
}

// ---------------------------------------------------------------------------
// Bootstrap the single administrator (idempotent, runs on first request)
// ---------------------------------------------------------------------------
let bootstrapped = false;
async function ensureAdmin() {
  if (bootstrapped) return;
  bootstrapped = true;
  const { data: owner } = await db.from('users').select('id').eq('role', 'admin').maybeSingle();
  if (owner) return;
  const { data: existing } = await db.from('users').select('id').ilike('email', ADMIN_EMAIL).maybeSingle();
  if (existing) {
    await db.from('users').update({ role: 'admin', status: 'active' }).eq('id', existing.id);
    return;
  }
  await db.from('users').insert({
    name: ADMIN_NAME,
    email: ADMIN_EMAIL,
    password_hash: await hashPassword(ADMIN_PASSWORD),
    role: 'admin',
    status: 'active',
    bio: 'Platform owner and Head of A&R curation.',
    primary_genre: 'All Genres',
  });
}

// ---------------------------------------------------------------------------
// Enrichment helpers (mirror server/index.js)
// ---------------------------------------------------------------------------
async function artistOfTheMonth(ym = monthKey()) {
  const { data: users } = await db.from('users').select('*').eq('status', 'active');
  const { data: songs } = await db.from('songs').select('*').eq('status', 'approved');
  const monthSongs = (songs || []).filter(
    (s) => monthKey(new Date(s.approved_at || s.created_at)) === ym,
  );

  const byUser = new Map<string, any>();
  for (const s of songs || []) {
    const entry = byUser.get(s.user_id) || { total: 0, plays: 0 };
    entry.total += 1;
    entry.plays += s.plays_count || 0;
    byUser.set(s.user_id, entry);
  }

  const ranking = (users || [])
    .map((u) => {
      const mine = monthSongs.filter((s) => s.user_id === u.id);
      const agg = byUser.get(u.id) || { total: 0, plays: 0 };
      return {
        user_id: u.id,
        name: u.name,
        email: u.email,
        avatar_url: u.avatar_url || '',
        bio: u.bio || '',
        primary_genre: u.primary_genre || '',
        country: u.country || '',
        website: u.website || '',
        monthly_approved_count: mine.length,
        total_approved_count: agg.total,
        monthly_plays: mine.reduce((a, s) => a + (s.plays_count || 0), 0),
        monthly_downloads: mine.reduce((a, s) => a + (s.downloads_count || 0), 0),
        last_approved_at: mine.sort((a, b) =>
          String(b.approved_at || b.created_at).localeCompare(String(a.approved_at || a.created_at)))[0]?.approved_at || null,
        _mine: mine,
      };
    })
    .filter((u) => u.total_approved_count > 0)
    .sort(
      (a, b) =>
        b.monthly_approved_count - a.monthly_approved_count ||
        b.monthly_plays - a.monthly_plays ||
        b.total_approved_count - a.total_approved_count ||
        String(a.name).localeCompare(String(b.name)),
    );

  const winner = ranking[0] || null;
  return {
    year_month: ym,
    month_label: monthLabel(ym),
    calculation_mode: winner && winner.monthly_approved_count > 0 ? 'monthly' : 'all_time_fallback',
    badge_label: 'Artist of the Month',
    winner: winner
      ? {
          ...winner,
          is_artist_of_the_month: true,
          badge: {
            title: 'Artist of the Month',
            month: monthLabel(ym),
            monthly_approved_count: winner.monthly_approved_count,
            total_approved_count: winner.total_approved_count,
          },
          approved_songs: winner._mine,
        }
      : null,
    leaderboard: ranking.map((u, i) => ({
      ...u,
      rank: i + 1,
      is_artist_of_the_month: i === 0,
    })),
  };
}

function songOut(s: any, aotmUserIds: Set<string>, origin: string) {
  const isAotm = aotmUserIds.has(s.user_id);
  return {
    ...s,
    is_cover: Boolean(s.is_cover),
    cover_song_label: s.is_cover ? 'Yes' : 'No',
    has_video: Boolean(s.video_url),
    audio_url: absolute(s.audio_url),
    thumbnail_url: absolute(s.thumbnail_url),
    video_url: s.video_url ? absolute(s.video_url) : '',
    full_audio_url: absolute(s.audio_url),
    full_thumbnail_url: absolute(s.thumbnail_url),
    full_video_url: s.video_url ? absolute(s.video_url) : null,
    is_artist_of_the_month: isAotm,
    artist_of_month_badge: isAotm
      ? { title: 'Artist of the Month', month: monthLabel(monthKey()), monthly_approved_count: 0 }
      : null,
  };
}

async function presentSongs(rows: any[], origin: string) {
  if (!rows?.length) return [];
  const aotm = await artistOfTheMonth();
  const ids = new Set<string>(aotm.winner ? [aotm.winner.user_id] : []);
  const { data: users } = await db.from('users').select('id,name,email,avatar_url,bio,primary_genre,country,status');
  const userMap = new Map((users || []).map((u) => [u.id, u]));
  return rows.map((s) => {
    const out = songOut(s, ids, origin);
    const uploader = userMap.get(s.user_id);
    return {
      ...out,
      uploader: uploader
        ? {
            id: uploader.id,
            name: uploader.name,
            email: uploader.email,
            avatar_url: uploader.avatar_url || '',
            primary_genre: uploader.primary_genre,
            country: uploader.country,
            is_artist_of_the_month: ids.has(uploader.id),
          }
        : { id: s.user_id, name: s.artist, email: '', avatar_url: '' },
    };
  });
}

async function presentUser(u: any) {
  if (!u) return null;
  const aotm = await artistOfTheMonth();
  const isAotm = aotm.winner?.user_id === u.id;
  const { data: mine } = await db
    .from('songs')
    .select('status,plays_count,downloads_count,approved_at,created_at')
    .eq('user_id', u.id);

  const approved = (mine || []).filter((s) => s.status === 'approved');
  const pending = (mine || []).filter((s) => s.status === 'pending');
  const monthly = approved.filter((s) => monthKey(new Date(s.approved_at || s.created_at)) === aotm.year_month);

  const { password_hash: _p, reset_token: _r, reset_token_expires: _e, ...safe } = u;
  return {
    ...safe,
    is_artist_of_the_month: Boolean(isAotm),
    artist_of_month_badge: isAotm
      ? { title: 'Artist of the Month', month: aotm.month_label, monthly_approved_count: aotm.winner.monthly_approved_count }
      : null,
    stats: {
      uploaded: approved.length + pending.length + (u.rejected_songs_count || 0),
      active_songs: approved.length + pending.length,
      approved: approved.length,
      pending: pending.length,
      rejected: u.rejected_songs_count || 0,
      monthly_approved: monthly.length,
      total_plays: approved.reduce((a, s) => a + (s.plays_count || 0), 0),
      total_downloads: approved.reduce((a, s) => a + (s.downloads_count || 0), 0),
    },
  };
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------
async function currentUser(req: Request) {
  const header = req.headers.get('authorization') || '';
  if (!header.startsWith('Bearer ')) return null;
  const payload = await verifyToken(header.slice(7));
  if (!payload?.sub) return null;
  const { data } = await db.from('users').select('*').eq('id', payload.sub).maybeSingle();
  if (!data || data.status === 'banned') return null;
  return data;
}

const isOwner = (u: any) => String(u?.email || '').toLowerCase() === ADMIN_EMAIL;

async function requireUser(req: Request) {
  const user = await currentUser(req);
  if (!user) throw json({ error: 'Authentication required. Please log in.' }, 401);
  return user;
}

async function requireAdmin(req: Request) {
  const user = await requireUser(req);
  if (user.role !== 'admin' || !isOwner(user)) {
    throw json({ error: 'Administrator privileges required.' }, 403);
  }
  return user;
}

async function requireApiKey(req: Request) {
  const url = new URL(req.url);
  const header = req.headers.get('authorization') || '';
  const key =
    req.headers.get('x-api-key') ||
    url.searchParams.get('api_key') ||
    (header.startsWith('Bearer ') ? header.slice(7) : '');

  if (!key) throw json({ status: 'error', code: 'MISSING_API_KEY', message: 'API key required.' }, 401);
  const { data } = await db.from('api_keys').select('*').eq('api_key', key.trim()).maybeSingle();
  if (!data) throw json({ status: 'error', code: 'INVALID_API_KEY', message: 'The provided API key is invalid or does not exist.' }, 401);
  if (data.status !== 'active') throw json({ status: 'error', code: 'REVOKED_API_KEY', message: 'This API key has been revoked by an administrator.' }, 403);
  await db.from('api_keys').update({ requests_count: (data.requests_count || 0) + 1, last_used_at: new Date().toISOString() }).eq('id', data.id);
  return data;
}

async function logActivity(actor: any, action: string, targetType: string, targetName: string, details: string) {
  await db.from('activity_logs').insert({
    actor_id: actor?.id ?? null,
    actor_name: actor?.name ?? 'System',
    action,
    target_type: targetType,
    target_name: targetName,
    details,
  });
}

async function notify(userId: string, type: string, title: string, message: string) {
  await db.from('notifications').insert({ user_id: userId, type, title, message });
}

async function deleteStorage(path: string | null) {
  if (!path) return;
  const key = path.split(`/${BUCKET}/`).pop() || path;
  await db.storage.from(BUCKET).remove([key]).catch(() => {});
}

// ---------------------------------------------------------------------------
// Upload helper
// ---------------------------------------------------------------------------
async function uploadFile(file: File, folder: string) {
  const ext = (file.name.split('.').pop() || 'bin').toLowerCase();
  const key = `${folder}/${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${slug(file.name)}`;
  const buf = new Uint8Array(await file.arrayBuffer());
  const { error } = await db.storage.from(BUCKET).upload(key, buf, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  });
  if (error) throw err(`Upload failed: ${error.message}`, 500);
  return { key, url: absolute(key)!, size: buf.byteLength, mime: file.type, name: key.split('/').pop()! };
}

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------
function externalSong(s: any, origin: string, apiKey?: string) {
  const keyParam = apiKey ? `?api_key=${encodeURIComponent(apiKey)}` : '';
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
    thumbnail_url: absolute(s.thumbnail_url),
    audio_url: absolute(s.audio_url),
    stream_url: `${origin}/api/v1/stream/${s.id}${keyParam}`,
    video_url: s.video_url ? absolute(s.video_url) : null,
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

// ===========================================================================
// Router
// ===========================================================================
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  await ensureAdmin();

  const url = new URL(req.url);
  const path = url.pathname.replace(/^\/functions\/v1\/api/, '').replace(/\/+$/, '') || '/';
  const origin = `${url.protocol}//${url.host}`;
  const method = req.method;
  const seg = path.split('/').filter(Boolean);
  const q = url.searchParams;

  try {
    // ---------------------------------------------------------------- public
    if (path === '/' || path === '/health') {
      return json({ status: 'ok', service: 'zk-song-api', storage: BUCKET });
    }

    if (path === '/api/public/bootstrap' && method === 'GET') {
      const settings = await getSettings();
      const aotm = await artistOfTheMonth();
      const { data: songs } = await db.from('songs').select('*').eq('status', 'approved').order('approved_at', { ascending: false });
      const presented = await presentSongs(songs || [], origin);
      if (aotm.winner) {
        aotm.winner.approved_songs = await presentSongs(aotm.winner.approved_songs || [], origin);
      }
      const { count: artists } = await db.from('users').select('*', { count: 'exact', head: true }).eq('role', 'user').eq('status', 'active');
      const { count: keys } = await db.from('api_keys').select('*', { count: 'exact', head: true }).eq('status', 'active');
      return json({
        settings,
        artist_of_the_month: aotm,
        approved_songs: presented,
        stats: {
          approved_songs_count: presented.length,
          artists_count: artists || 0,
          total_plays: presented.reduce((a, s) => a + (s.plays_count || 0), 0),
          active_api_integrations: keys || 0,
        },
      });
    }

    if (path.match(/^\/api\/public\/songs\/[^/]+\/play$/) && method === 'POST') {
      const id = seg[3];
      const { data } = await db.from('songs').select('plays_count').eq('id', id).maybeSingle();
      if (!data) return err('Song not found', 404);
      await db.from('songs').update({ plays_count: (data.plays_count || 0) + 1 }).eq('id', id);
      return json({ success: true, song: { id, plays_count: (data.plays_count || 0) + 1 } });
    }

    if (path.match(/^\/api\/public\/songs\/[^/]+\/download$/) && method === 'GET') {
      const id = seg[3];
      const type = q.get('type') || 'audio';
      const { data: song } = await db.from('songs').select('*').eq('id', id).maybeSingle();
      if (!song) return err('Song not found', 404);
      await db.from('songs').update({ downloads_count: (song.downloads_count || 0) + 1 }).eq('id', id);
      const target = type === 'video' ? song.video_url : type === 'thumbnail' ? song.thumbnail_url : song.audio_url;
      if (!target) return err('Requested media not found', 404);
      return Response.redirect(absolute(target)!, 302);
    }

    // ------------------------------------------------------------------ auth
    if (path === '/api/auth/register' && method === 'POST') {
      const settings = await getSettings();
      if (settings.allow_registration === 'false') {
        return err('New user registrations are currently disabled by the platform administrator.', 403);
      }
      const body = await req.json();
      const email = String(body.email || '').trim().toLowerCase();
      if (!body.name || !email || !body.password) return err('Name, email, and password are required.');
      if (String(body.password).length < 6) return err('Password must be at least 6 characters long.');
      const { data: existing } = await db.from('users').select('id').ilike('email', email).maybeSingle();
      if (existing) return err('An account with this email address already exists.', 409);

      const { data: created, error } = await db.from('users').insert({
        name: String(body.name).trim(),
        email,
        password_hash: await hashPassword(String(body.password)),
        role: 'user',
        avatar_url: String(body.avatar_url || ''),
        bio: String(body.bio || ''),
        primary_genre: body.primary_genre || 'Electronic',
        country: body.country || '',
      }).select().single();
      if (error) return err(error.message, 500);

      const token = await signToken({ sub: created.id, role: created.role, email: created.email });
      await notify(created.id, 'welcome', 'Welcome to ZK-SONG 🎧', 'Upload your first track to enter the Artist of the Month race.');
      return json({ token, user: await presentUser(created), message: `Welcome, ${created.name}!` }, 201);
    }

    if (path === '/api/auth/login' && method === 'POST') {
      const body = await req.json();
      if (!body.email || !body.password) return err('Please enter both email and password.');
      const email = String(body.email).trim().toLowerCase();
      const { data: user } = await db.from('users').select('*').ilike('email', email).maybeSingle();
      if (!user || !(await verifyPassword(String(body.password), user.password_hash))) {
        return err('Invalid email or password.', 401);
      }
      if (user.status === 'banned') {
        return err('Your account has been suspended by an administrator for violating platform guidelines.', 403);
      }
      const token = await signToken({ sub: user.id, role: user.role, email: user.email });
      return json({ token, user: await presentUser(user), message: `Welcome back, ${user.name}!` });
    }

    if (path === '/api/auth/forgot-password' && method === 'POST') {
      const body = await req.json();
      const email = String(body.email || '').trim().toLowerCase();
      if (!email) return err('Please provide your registered email address.');
      const { data: user } = await db.from('users').select('id').ilike('email', email).maybeSingle();
      if (!user) return err('No account found with that email address.', 404);
      const code = String(Math.floor(100000 + Math.random() * 900000));
      await db.from('users').update({
        reset_token: code,
        reset_token_expires: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      }).eq('id', user.id);
      console.log(`[ZK-SONG] Password reset code for ${email}: ${code}`);
      return json({
        success: true,
        email,
        expires_in_minutes: 30,
        message: `A 6-digit verification code has been generated for ${email}. It expires in 30 minutes.`,
      });
    }

    if (path === '/api/auth/reset-password' && method === 'POST') {
      const body = await req.json();
      if (!body.email || !body.reset_code || !body.new_password) {
        return err('Email, verification code, and new password are required.');
      }
      if (String(body.new_password).length < 6) return err('New password must be at least 6 characters.');
      const { data: user } = await db.from('users')
        .select('*').ilike('email', String(body.email).trim().toLowerCase()).maybeSingle();
      if (!user || !user.reset_token || user.reset_token !== String(body.reset_code).trim()) {
        return err('Invalid verification code.');
      }
      if (user.reset_token_expires && new Date(user.reset_token_expires) < new Date()) {
        return err('Verification code has expired. Please request a new one.');
      }
      await db.from('users').update({
        password_hash: await hashPassword(String(body.new_password)),
        reset_token: null,
        reset_token_expires: null,
        updated_at: new Date().toISOString(),
      }).eq('id', user.id);
      return json({ success: true, message: 'Password updated successfully! You can now sign in with your new password.' });
    }

    if (path === '/api/auth/me' && method === 'GET') {
      const user = await requireUser(req);
      const { count } = await db.from('notifications').select('*', { count: 'exact', head: true }).eq('user_id', user.id).eq('is_read', false);
      return json({
        user: await presentUser(user),
        unread_notifications: count || 0,
        artist_of_the_month: await artistOfTheMonth(),
        is_platform_owner: isOwner(user),
      });
    }

    // ------------------------------------------------------------------ user
    if (path === '/api/user/dashboard' && method === 'GET') {
      const user = await requireUser(req);
      const { data: songs } = await db.from('songs').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
      const presented = await presentSongs(songs || [], origin);
      const { data: notifications } = await db.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(12);
      return json({
        user: await presentUser(user),
        stats: (await presentUser(user))!.stats,
        recent_songs: presented.slice(0, 6),
        all_songs_count: presented.length,
        notifications: notifications || [],
        artist_of_the_month: await artistOfTheMonth(),
      });
    }

    if (path === '/api/user/songs' && method === 'GET') {
      const user = await requireUser(req);
      const search = (q.get('search') || '').trim();
      const status = q.get('status') || 'all';
      const isCover = q.get('is_cover') || 'all';
      const genre = q.get('genre') || 'all';
      const page = Math.max(1, parseInt(q.get('page') || '1', 10));
      const limit = Math.max(1, Math.min(50, parseInt(q.get('limit') || '10', 10)));

      let query = db.from('songs').select('*', { count: 'exact' }).eq('user_id', user.id);
      if (status !== 'all') query = query.eq('status', status);
      if (isCover === 'yes') query = query.eq('is_cover', true);
      if (isCover === 'no') query = query.eq('is_cover', false);
      if (genre !== 'all') query = query.ilike('genre', genre);
      if (search) {
        query = query.or(
          ['title', 'artist', 'musician', 'composer', 'genre'].map((c) => `${c}.ilike.%${search}%`).join(','),
        );
      }
      const from = (page - 1) * limit;
      const { data, count } = await query.order('created_at', { ascending: false }).range(from, from + limit - 1);
      return json({
        songs: await presentSongs(data || [], origin),
        stats: (await presentUser(user))!.stats,
        pagination: { total: count || 0, page, limit, total_pages: Math.max(1, Math.ceil((count || 0) / limit)) },
      });
    }

    if (path === '/api/user/songs' && method === 'POST') {
      const user = await requireUser(req);
      const form = await req.formData();
      const field = (k: string, fallback = '') => String(form.get(k) ?? fallback).trim();

      const title = field('title');
      const artist = field('artist');
      const musician = field('musician');
      const composer = field('composer');
      if (!title) return err('Song Title is required.');
      if (!artist) return err('Artist name is required.');
      if (!musician) return err('Musician details are required.');
      if (!composer) return err('Composer details are required.');

      const audio = form.get('audio');
      const thumb = form.get('thumbnail');
      const video = form.get('video');
      if (!(audio instanceof File) || !audio.size) return err('Please select or generate an Audio File to upload.');
      if (!(thumb instanceof File) || !thumb.size) return err('Please select or generate a Thumbnail / Cover Image to upload.');

      const settings = await getSettings();
      const autoApprove = settings.require_moderation === 'false' || user.role === 'admin';
      const now = new Date().toISOString();
      const isCover = ['yes', 'true', '1'].includes(field('is_cover', 'no').toLowerCase());

      const [audioUp, thumbUp, videoUp] = await Promise.all([
        uploadFile(audio, 'audio'),
        uploadFile(thumb, 'thumbnails'),
        video instanceof File && video.size ? uploadFile(video, 'videos') : Promise.resolve(null),
      ]);

      const durationSec = Math.max(1, parseInt(field('duration', '0'), 10) || 0);
      const { data: created, error } = await db.from('songs').insert({
        user_id: user.id,
        title,
        artist,
        featured_artist: field('featured_artist'),
        musician,
        composer,
        is_cover: isCover,
        original_credit: isCover ? field('original_credit') : '',
        genre: field('genre', 'Electronic') || 'Electronic',
        release_year: parseInt(field('release_year', String(new Date().getFullYear())), 10),
        bpm: parseInt(field('bpm', '120'), 10) || 120,
        duration: durationSec,
        duration_formatted: field('duration_formatted', '0:00'),
        description: field('description'),
        lyrics: field('lyrics'),
        audio_url: audioUp.key,
        audio_filename: audioUp.name,
        audio_size: audioUp.size,
        audio_mime: audioUp.mime || 'audio/mpeg',
        thumbnail_url: thumbUp.key,
        thumbnail_filename: thumbUp.name,
        video_url: videoUp?.key || '',
        video_filename: videoUp?.name || '',
        video_size: videoUp?.size || 0,
        status: autoApprove ? 'approved' : 'pending',
        approved_at: autoApprove ? now : null,
        approved_by: autoApprove ? user.id : null,
      }).select().single();

      if (error) return err(error.message, 500);
      await notify(
        user.id,
        'song_uploaded',
        `Uploaded: ${created.title}`,
        autoApprove
          ? `Your track "${created.title}" has been published directly to the Approved Songs library!`
          : `Your track "${created.title}" has been uploaded and is currently Pending A&R Admin approval.`,
      );
      await logActivity(user, 'UPLOADED_SONG', 'song', created.title,
        `Uploaded ${created.genre} track (${isCover ? 'Cover Song: Yes' : 'Original Track'})${videoUp ? ' with Music Video' : ''}.`);

      return json({
        song: (await presentSongs([created], origin))[0],
        message: autoApprove
          ? 'Song uploaded and automatically approved!'
          : 'Song uploaded successfully and submitted for Admin approval!',
      }, 201);
    }

    if (path.match(/^\/api\/user\/songs\/[^/]+$/) && method === 'PUT') {
      const user = await requireUser(req);
      const id = seg[3];
      const { data: song } = await db.from('songs').select('*').eq('id', id).maybeSingle();
      if (!song) return err('Song not found.', 404);
      if (song.user_id !== user.id && user.role !== 'admin') return err('You do not have permission to edit this song.', 403);
      const body = await req.json();
      const isCover = body.is_cover === true || ['yes', 'true', '1'].includes(String(body.is_cover).toLowerCase());
      const { data: updated, error } = await db.from('songs').update({
        title: String(body.title ?? song.title).trim(),
        artist: String(body.artist ?? song.artist).trim(),
        featured_artist: String(body.featured_artist ?? song.featured_artist ?? '').trim(),
        musician: String(body.musician ?? song.musician).trim(),
        composer: String(body.composer ?? song.composer).trim(),
        is_cover: isCover,
        original_credit: isCover ? String(body.original_credit ?? song.original_credit ?? '').trim() : '',
        genre: String(body.genre ?? song.genre),
        release_year: parseInt(body.release_year ?? song.release_year, 10) || song.release_year,
        bpm: parseInt(body.bpm ?? song.bpm, 10) || song.bpm,
        description: String(body.description ?? song.description ?? ''),
        lyrics: String(body.lyrics ?? song.lyrics ?? ''),
        updated_at: new Date().toISOString(),
      }).eq('id', id).select().single();
      if (error) return err(error.message, 500);
      return json({ song: (await presentSongs([updated], origin))[0], message: 'Song details updated successfully.' });
    }

    if (path.match(/^\/api\/user\/songs\/[^/]+$/) && method === 'DELETE') {
      const user = await requireUser(req);
      const id = seg[3];
      const { data: song } = await db.from('songs').select('*').eq('id', id).maybeSingle();
      if (!song) return err('Song not found.', 404);
      if (song.user_id !== user.id && user.role !== 'admin') return err('You can only delete your own songs.', 403);
      await Promise.all([deleteStorage(song.audio_url), deleteStorage(song.thumbnail_url), deleteStorage(song.video_url)]);
      await db.from('songs').delete().eq('id', id);
      return json({ success: true, deleted_id: id, message: `"${song.title}" has been deleted.` });
    }

    if (path === '/api/user/account' && method === 'PUT') {
      const user = await requireUser(req);
      const form = await req.formData();
      const name = String(form.get('name') || '').trim();
      const email = String(form.get('email') || '').trim().toLowerCase();
      if (!name) return err('Display / Artist Name cannot be empty.');
      if (!email) return err('Email cannot be empty.');
      const { data: conflict } = await db.from('users').select('id').ilike('email', email).neq('id', user.id).maybeSingle();
      if (conflict) return err('That email address is already in use by another account.', 409);

      const avatar = form.get('avatar');
      const avatarUrl = avatar instanceof File && avatar.size ? (await uploadFile(avatar, 'avatars')).key : user.avatar_url;
      if (avatarUrl !== user.avatar_url) await deleteStorage(user.avatar_url);

      const { data: updated, error } = await db.from('users').update({
        name,
        email,
        avatar_url: avatarUrl,
        bio: String(form.get('bio') ?? user.bio ?? ''),
        primary_genre: String(form.get('primary_genre') || user.primary_genre),
        country: String(form.get('country') ?? user.country ?? ''),
        website: String(form.get('website') ?? user.website ?? ''),
        updated_at: new Date().toISOString(),
      }).eq('id', user.id).select().single();
      if (error) return err(error.message, 500);
      return json({ user: await presentUser(updated), message: 'Account profile updated successfully!' });
    }

    if (path === '/api/user/password' && method === 'PUT') {
      const user = await requireUser(req);
      const body = await req.json();
      if (!body.current_password || !body.new_password) return err('Both current password and new password are required.');
      if (String(body.new_password).length < 6) return err('New password must be at least 6 characters.');
      if (!(await verifyPassword(String(body.current_password), user.password_hash))) {
        return err('Current password is incorrect.');
      }
      await db.from('users').update({
        password_hash: await hashPassword(String(body.new_password)),
        updated_at: new Date().toISOString(),
      }).eq('id', user.id);
      return json({ success: true, message: 'Your password has been changed successfully.' });
    }

    if (path === '/api/user/notifications' && method === 'GET') {
      const user = await requireUser(req);
      const { data } = await db.from('notifications').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(30);
      return json({ notifications: data || [] });
    }

    if (path === '/api/user/notifications/read' && method === 'POST') {
      const user = await requireUser(req);
      await db.from('notifications').update({ is_read: true }).eq('user_id', user.id);
      return json({ success: true });
    }

    // ----------------------------------------------------------------- admin
    if (path === '/api/admin/dashboard' && method === 'GET') {
      await requireAdmin(req);
      const { data: songs } = await db.from('songs').select('*');
      const { data: users } = await db.from('users').select('*');
      const { data: keys } = await db.from('api_keys').select('*');
      const { data: logs } = await db.from('activity_logs').select('*').order('created_at', { ascending: false }).limit(12);
      const { data: pending } = await db.from('songs').select('*').eq('status', 'pending').order('created_at', { ascending: false }).limit(8);

      const approved = (songs || []).filter((s) => s.status === 'approved');
      const genreMap = new Map<string, { genre: string; count: number; approved_count: number }>();
      for (const s of songs || []) {
        const entry = genreMap.get(s.genre) || { genre: s.genre, count: 0, approved_count: 0 };
        entry.count += 1;
        if (s.status === 'approved') entry.approved_count += 1;
        genreMap.set(s.genre, entry);
      }

      return json({
        stats: {
          total_songs: (songs || []).length,
          total_lifetime_uploaded: (songs || []).length + (users || []).reduce((a, u) => a + (u.rejected_songs_count || 0), 0),
          approved_songs: approved.length,
          pending_songs: (songs || []).length - approved.length,
          rejected_songs: (users || []).reduce((a, u) => a + (u.rejected_songs_count || 0), 0),
          cover_songs: (songs || []).filter((s) => s.is_cover).length,
          video_songs: (songs || []).filter((s) => s.video_url).length,
          total_plays: approved.reduce((a, s) => a + (s.plays_count || 0), 0),
          total_downloads: approved.reduce((a, s) => a + (s.downloads_count || 0), 0),
          total_users: (users || []).length,
          active_users: (users || []).filter((u) => u.status === 'active').length,
          banned_users: (users || []).filter((u) => u.status === 'banned').length,
          admin_users: (users || []).filter((u) => u.role === 'admin').length,
          total_api_keys: (keys || []).length,
          active_api_keys: (keys || []).filter((k) => k.status === 'active').length,
          total_api_requests: (keys || []).reduce((a, k) => a + (k.requests_count || 0), 0),
        },
        genre_breakdown: [...genreMap.values()].sort((a, b) => b.count - a.count),
        pending_songs: await presentSongs(pending || [], origin),
        recent_activity: logs || [],
        artist_of_the_month: await artistOfTheMonth(),
      });
    }

    if (path === '/api/admin/songs' && method === 'GET') {
      await requireAdmin(req);
      const search = (q.get('search') || '').trim();
      const status = q.get('status') || 'all';
      const genre = q.get('genre') || 'all';
      const isCover = q.get('is_cover') || 'all';
      const hasVideo = q.get('has_video') || 'all';
      const sort = q.get('sort') || 'newest';
      const page = Math.max(1, parseInt(q.get('page') || '1', 10));
      const limit = Math.max(1, Math.min(100, parseInt(q.get('limit') || '12', 10)));

      let query = db.from('songs').select('*', { count: 'exact' });
      if (status !== 'all') query = query.eq('status', status);
      if (genre !== 'all') query = query.ilike('genre', genre);
      if (isCover === 'yes') query = query.eq('is_cover', true);
      if (isCover === 'no') query = query.eq('is_cover', false);
      if (hasVideo === 'yes') query = query.neq('video_url', '');
      if (hasVideo === 'no') query = query.eq('video_url', '');
      if (search) {
        query = query.or(['title', 'artist', 'musician', 'composer', 'genre'].map((c) => `${c}.ilike.%${search}%`).join(','));
      }
      const order = sort === 'oldest'
        ? { column: 'created_at', ascending: true }
        : sort === 'plays'
          ? { column: 'plays_count', ascending: false }
          : sort === 'title'
            ? { column: 'title', ascending: true }
            : { column: 'created_at', ascending: false };

      const from = (page - 1) * limit;
      const { data, count } = await query.order(order.column, { ascending: order.ascending }).range(from, from + limit - 1);
      const { data: genreRows } = await db.from('songs').select('genre');
      return json({
        songs: await presentSongs(data || [], origin),
        genres: [...new Set((genreRows || []).map((g) => g.genre))].sort(),
        pagination: { total: count || 0, page, limit, total_pages: Math.max(1, Math.ceil((count || 0) / limit)) },
      });
    }

    if (path.match(/^\/api\/admin\/songs\/[^/]+$/) && method === 'GET') {
      await requireAdmin(req);
      const { data: song } = await db.from('songs').select('*').eq('id', seg[3]).maybeSingle();
      if (!song) return err('Song not found (it may have been rejected and permanently removed).', 404);
      const { data: uploader } = await db.from('users').select('*').eq('id', song.user_id).maybeSingle();
      const approvedBy = song.approved_by
        ? (await db.from('users').select('id,name,email').eq('id', song.approved_by).maybeSingle()).data
        : null;
      return json({
        song: (await presentSongs([song], origin))[0],
        uploader: await presentUser(uploader),
        approved_by_admin: approvedBy,
        artist_of_the_month: await artistOfTheMonth(),
      });
    }

    if (path.match(/^\/api\/admin\/songs\/[^/]+\/approve$/) && method === 'POST') {
      const admin = await requireAdmin(req);
      const id = seg[3];
      const { data: song } = await db.from('songs').select('*').eq('id', id).maybeSingle();
      if (!song) return err('Song not found.', 404);
      const now = new Date().toISOString();
      const { data: updated } = await db.from('songs')
        .update({ status: 'approved', approved_at: now, approved_by: admin.id, updated_at: now })
        .eq('id', id).select().single();
      await notify(song.user_id, 'song_approved', `✅ Song Approved: ${song.title}`,
        `Your track "${song.title}" has been approved by ${admin.name} and is now live in the Approved Songs library and external streaming API!`);
      await logActivity(admin, 'APPROVED_SONG', 'song', song.title, `Approved song "${song.title}" by ${song.artist}.`);
      return json({
        success: true,
        song: (await presentSongs([updated], origin))[0],
        artist_of_the_month: await artistOfTheMonth(),
        message: `"${song.title}" has been approved and added to Approved Songs!`,
      });
    }

    if (path.match(/^\/api\/admin\/songs\/[^/]+\/reject$/) && method === 'POST') {
      const admin = await requireAdmin(req);
      const id = seg[3];
      const body = await req.json().catch(() => ({}));
      const reason = body.reason || 'Did not meet studio quality or copyright verification standards.';
      const { data: song } = await db.from('songs').select('*').eq('id', id).maybeSingle();
      if (!song) return err('Song not found.', 404);

      await Promise.all([deleteStorage(song.audio_url), deleteStorage(song.thumbnail_url), deleteStorage(song.video_url)]);
      const { data: uploader } = await db.from('users').select('rejected_songs_count').eq('id', song.user_id).maybeSingle();
      await db.from('users').update({
        rejected_songs_count: (uploader?.rejected_songs_count || 0) + 1,
        updated_at: new Date().toISOString(),
      }).eq('id', song.user_id);
      await notify(song.user_id, 'song_rejected', `❌ Song Rejected & Removed: ${song.title}`,
        `Your song "${song.title}" was rejected during moderation and permanently removed from the platform. Reason: ${reason}`);
      await logActivity(admin, 'REJECTED_AND_REMOVED_SONG', 'song', song.title, `Rejected and permanently removed "${song.title}" by ${song.artist}. Reason: ${reason}`);
      await db.from('songs').delete().eq('id', id);

      return json({
        success: true,
        removed_song_id: id,
        removed_title: song.title,
        artist_of_the_month: await artistOfTheMonth(),
        message: `"${song.title}" was rejected and permanently removed from the platform.`,
      });
    }

    if (path.match(/^\/api\/admin\/songs\/[^/]+$/) && method === 'DELETE') {
      const admin = await requireAdmin(req);
      const id = seg[3];
      const { data: song } = await db.from('songs').select('*').eq('id', id).maybeSingle();
      if (!song) return err('Song not found.', 404);
      await Promise.all([deleteStorage(song.audio_url), deleteStorage(song.thumbnail_url), deleteStorage(song.video_url)]);
      await db.from('songs').delete().eq('id', id);
      await logActivity(admin, 'DELETED_SONG', 'song', song.title, `Permanently deleted song "${song.title}" by ${song.artist}.`);
      return json({
        success: true,
        deleted_id: id,
        artist_of_the_month: await artistOfTheMonth(),
        message: `"${song.title}" has been permanently deleted from the platform.`,
      });
    }

    if (path === '/api/admin/users' && method === 'GET') {
      await requireAdmin(req);
      const search = (q.get('search') || '').trim();
      const status = q.get('status') || 'all';
      const role = q.get('role') || 'all';
      const page = Math.max(1, parseInt(q.get('page') || '1', 10));
      const limit = Math.max(1, Math.min(100, parseInt(q.get('limit') || '15', 10)));

      let query = db.from('users').select('*', { count: 'exact' });
      if (status !== 'all') query = query.eq('status', status);
      if (role !== 'all') query = query.eq('role', role);
      if (search) {
        query = query.or(['name', 'email', 'primary_genre', 'country'].map((c) => `${c}.ilike.%${search}%`).join(','));
      }
      const from = (page - 1) * limit;
      const { data, count } = await query.order('created_at', { ascending: false }).range(from, from + limit - 1);
      const users = await Promise.all((data || []).map((u) => presentUser(u)));
      return json({
        users,
        artist_of_the_month: await artistOfTheMonth(),
        pagination: { total: count || 0, page, limit, total_pages: Math.max(1, Math.ceil((count || 0) / limit)) },
      });
    }

    if (path.match(/^\/api\/admin\/users\/[^/]+\/ban$/) && method === 'POST') {
      const admin = await requireAdmin(req);
      const id = seg[3];
      if (id === admin.id) return err('You cannot ban your own administrator account.');
      const { data: target } = await db.from('users').select('*').eq('id', id).maybeSingle();
      if (!target) return err('User not found.', 404);
      if (target.role === 'admin' || isOwner(target)) return err('The platform administrator account cannot be banned.', 403);

      const next = target.status === 'banned' ? 'active' : 'banned';
      const { data: updated } = await db.from('users').update({ status: next, updated_at: new Date().toISOString() }).eq('id', id).select().single();
      await logActivity(admin, next === 'banned' ? 'BANNED_USER' : 'UNBANNED_USER', 'user', target.name,
        `${next === 'banned' ? 'Banned' : 'Restored'} user account (${target.email}).`);
      return json({
        user: await presentUser(updated),
        artist_of_the_month: await artistOfTheMonth(),
        message: next === 'banned' ? `User "${target.name}" has been banned.` : `User "${target.name}" has been unbanned and restored to active status.`,
      });
    }

    if (path.match(/^\/api\/admin\/users\/[^/]+\/role$/) && method === 'PUT') {
      await requireAdmin(req);
      return err('Administrator access is reserved for the platform owner account and cannot be granted or revoked from the panel.', 403);
    }

    if (path.match(/^\/api\/admin\/users\/[^/]+$/) && method === 'DELETE') {
      const admin = await requireAdmin(req);
      const id = seg[3];
      if (id === admin.id) return err('You cannot delete your own administrator account.');
      const { data: target } = await db.from('users').select('*').eq('id', id).maybeSingle();
      if (!target) return err('User not found.', 404);
      if (target.role === 'admin' || isOwner(target)) return err('The platform administrator account cannot be deleted.', 403);

      const { data: songs } = await db.from('songs').select('audio_url,thumbnail_url,video_url').eq('user_id', id);
      for (const s of songs || []) {
        await Promise.all([deleteStorage(s.audio_url), deleteStorage(s.thumbnail_url), deleteStorage(s.video_url)]);
      }
      await deleteStorage(target.avatar_url);
      await db.from('users').delete().eq('id', id);
      await logActivity(admin, 'DELETED_USER', 'user', target.name,
        `Permanently deleted user ${target.name} (${target.email}) and ${(songs || []).length} associated tracks.`);
      return json({
        success: true,
        deleted_id: id,
        artist_of_the_month: await artistOfTheMonth(),
        message: `User "${target.name}" and their uploaded tracks have been permanently deleted.`,
      });
    }

    if (path === '/api/admin/api-keys' && method === 'GET') {
      await requireAdmin(req);
      const { data } = await db.from('api_keys').select('*').order('created_at', { ascending: false });
      return json({ api_keys: data || [] });
    }

    if (path === '/api/admin/api-keys' && method === 'POST') {
      const admin = await requireAdmin(req);
      const body = await req.json();
      if (!body.name?.trim()) return err('Please provide an application or client name for the API key.');
      const random = [...crypto.getRandomValues(new Uint8Array(18))].map((b) => b.toString(16).padStart(2, '0')).join('');
      const apiKey = `zks_live_${random}`;
      const { data: created, error } = await db.from('api_keys').insert({
        name: String(body.name).trim(),
        key_prefix: `${apiKey.slice(0, 13)}...${apiKey.slice(-4)}`,
        api_key: apiKey,
        permissions: body.permissions || 'read:songs,stream:audio,read:artists',
        created_by: admin.id,
      }).select().single();
      if (error) return err(error.message, 500);
      await logActivity(admin, 'CREATED_API_KEY', 'api_key', created.name, `Generated new API key (${created.key_prefix}) for external application integration.`);
      return json({ api_key: created, message: `Secure API Key generated for "${created.name}"!` }, 201);
    }

    if (path.match(/^\/api\/admin\/api-keys\/[^/]+\/toggle$/) && method === 'PUT') {
      await requireAdmin(req);
      const { data: existing } = await db.from('api_keys').select('*').eq('id', seg[3]).maybeSingle();
      if (!existing) return err('API Key not found.', 404);
      const next = existing.status === 'active' ? 'revoked' : 'active';
      const { data: updated } = await db.from('api_keys').update({ status: next }).eq('id', existing.id).select().single();
      return json({ api_key: updated, message: `API Key "${updated.name}" is now ${next.toUpperCase()}.` });
    }

    if (path.match(/^\/api\/admin\/api-keys\/[^/]+$/) && method === 'DELETE') {
      await requireAdmin(req);
      const { data: existing } = await db.from('api_keys').select('*').eq('id', seg[3]).maybeSingle();
      if (!existing) return err('API Key not found.', 404);
      await db.from('api_keys').delete().eq('id', existing.id);
      return json({ success: true, deleted_id: existing.id, message: `API Key "${existing.name}" has been permanently deleted.` });
    }

    if (path === '/api/admin/settings' && method === 'GET') {
      await requireAdmin(req);
      return json({ settings: await getSettings() });
    }

    if (path === '/api/admin/settings' && method === 'PUT') {
      const admin = await requireAdmin(req);
      const contentType = req.headers.get('content-type') || '';
      let patch: Record<string, string> = {};
      let logo: File | null = null;

      if (contentType.includes('multipart/form-data')) {
        const form = await req.formData();
        for (const [k, v] of form.entries()) {
          if (typeof v === 'string') patch[k] = v;
        }
        const file = form.get('logo');
        if (file instanceof File && file.size) logo = file;
      } else {
        patch = await req.json();
      }

      if (logo) {
        const uploaded = await uploadFile(logo, 'branding');
        patch.logo_url = uploaded.key;
      }
      const allowed = ['site_name','site_tagline','site_description','logo_url','primary_color','secondary_color','accent_badge_text','contact_email','footer_text','allow_registration','require_moderation','max_upload_mb'];
      const filtered: Record<string, string> = {};
      for (const key of allowed) if (patch[key] !== undefined) filtered[key] = patch[key];
      await setSettings(filtered);

      const settings = await getSettings();
      await logActivity(admin, 'UPDATED_SETTINGS', 'settings', settings.site_name, 'Updated website branding and platform configuration.');
      return json({ settings, message: 'Platform settings and branding updated successfully!' });
    }

    // ------------------------------------------------------------- external v1
    if (path === '/api/v1/songs' && method === 'GET') {
      const apiKey = await requireApiKey(req);
      const search = (q.get('search') || '').trim();
      const genre = q.get('genre') || '';
      const artist = q.get('artist') || '';
      const isCover = q.get('is_cover') || '';
      const sort = q.get('sort') || 'latest';
      const page = Math.max(1, parseInt(q.get('page') || '1', 10));
      const limit = Math.max(1, Math.min(100, parseInt(q.get('limit') || '50', 10)));

      let query = db.from('songs').select('*', { count: 'exact' }).eq('status', 'approved');
      if (genre && genre !== 'all') query = query.ilike('genre', genre);
      if (artist) query = query.ilike('artist', `%${artist}%`);
      if (['true', 'yes', '1'].includes(isCover)) query = query.eq('is_cover', true);
      if (['false', 'no', '0'].includes(isCover)) query = query.eq('is_cover', false);
      if (search) query = query.or(['title', 'artist', 'musician', 'composer', 'genre'].map((c) => `${c}.ilike.%${search}%`).join(','));

      const order = sort === 'popular' || sort === 'plays'
        ? { column: 'plays_count', ascending: false }
        : sort === 'title'
          ? { column: 'title', ascending: true }
          : { column: 'approved_at', ascending: false };

      const from = (page - 1) * limit;
      const { data, count } = await query.order(order.column, { ascending: order.ascending }).range(from, from + limit - 1);
      const songs = (await presentSongs(data || [], origin)).map((s) => externalSong(s, origin, apiKey.api_key));
      const aotm = await artistOfTheMonth();
      const settings = await getSettings();

      return json({
        status: 'success',
        platform: { name: settings.site_name, tagline: settings.site_tagline, api_version: 'v1.0', authenticated_client: apiKey.name },
        artist_of_the_month: aotm.winner
          ? {
              user_id: aotm.winner.user_id,
              artist_name: aotm.winner.name,
              month: aotm.month_label,
              monthly_approved_songs: aotm.winner.monthly_approved_count,
              badge: 'Artist of the Month',
            }
          : null,
        count: songs.length,
        total_approved_songs: count || 0,
        pagination: { page, limit, total_pages: Math.max(1, Math.ceil((count || 0) / limit)) },
        songs,
      });
    }

    if (path.match(/^\/api\/v1\/songs\/[^/]+$/) && method === 'GET') {
      const apiKey = await requireApiKey(req);
      const { data: song } = await db.from('songs').select('*').eq('id', seg[3]).eq('status', 'approved').maybeSingle();
      if (!song) return json({ status: 'error', code: 'SONG_NOT_FOUND', message: 'Approved song with the specified ID was not found.' }, 404);
      const [presented] = await presentSongs([song], origin);
      return json({ status: 'success', song: externalSong(presented, origin, apiKey.api_key) });
    }

    if (path === '/api/v1/artist-of-the-month' && method === 'GET') {
      const apiKey = await requireApiKey(req);
      const aotm = await artistOfTheMonth();
      if (aotm.winner) {
        aotm.winner.approved_songs = (await presentSongs(aotm.winner.approved_songs || [], origin)).map((s) =>
          externalSong(s, origin, apiKey.api_key)
        );
      }
      return json({ status: 'success', artist_of_the_month: aotm });
    }

    if (path.match(/^\/api\/v1\/stream\/[^/]+$/) && method === 'GET') {
      await requireApiKey(req);
      const { data: song } = await db.from('songs').select('*').eq('id', seg[3]).eq('status', 'approved').maybeSingle();
      if (!song) return json({ status: 'error', code: 'SONG_NOT_FOUND', message: 'Approved song not found.' }, 404);
      await db.from('songs').update({ plays_count: (song.plays_count || 0) + 1 }).eq('id', song.id);

      const range = req.headers.get('range');
      const upstream = await fetch(absolute(song.audio_url)!, { headers: range ? { range } : {} });
      const headers = new Headers(CORS);
      headers.set('content-type', song.audio_mime || 'audio/mpeg');
      headers.set('accept-ranges', 'bytes');
      headers.set('cache-control', 'public, max-age=3600');
      for (const h of ['content-length', 'content-range']) {
        const v = upstream.headers.get(h);
        if (v) headers.set(h, v);
      }
      return new Response(upstream.body, { status: upstream.status, headers });
    }

    return err(`Route not found: ${method} ${path}`, 404);
  } catch (e) {
    if (e instanceof Response) return e;
    console.error('[ZK-SONG] Unhandled error', e);
    return err((e as Error)?.message || 'Internal server error', 500);
  }
});
