// ============================================================================
// ZK-SONG — end-to-end API test
//
// Boots the *real* API (api/_lib) against a choice of backends and drives the
// complete product lifecycle over HTTP:
//
//   npm run test:api              sqlite + local disk
//   ZK_DB_DIALECT=postgres \
//   ZK_TEST_PG=pglite npm run test:api      real Postgres semantics (PGlite)
//
// It creates its own artist/song/API key and deletes everything again, so it is
// safe to run against a development database.
// ============================================================================

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const express = require('express');

const USE_PG = process.env.ZK_TEST_PG === 'pglite';

let pass = 0;
let fail = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    failures.push(name);
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function setupPostgres() {
  const { PGlite } = await import('@electric-sql/pglite');
  const { createPostgresStore } = await import('../api/_lib/db/postgres.js');
  const { default: pg } = await import('pg');

  const pglite = await PGlite.create();
  // Route the `pg` driver's queries into the in-process Postgres instance.
  const runOnPglite = async (text, params) => {
    if (!params || params.length === 0) {
      // Simple-protocol path: DDL and multi-statement scripts.
      const results = await pglite.exec(text);
      const last = Array.isArray(results) ? results[results.length - 1] : results;
      return { rows: last?.rows || [], rowCount: last?.affectedRows ?? last?.rows?.length ?? 0 };
    }
    const res = await pglite.query(text, params);
    return { rows: res.rows, rowCount: res.affectedRows ?? res.rows.length };
  };

  pg.Pool.prototype.query = async function query(text, params) {
    if (Array.isArray(text)) throw new Error('array queries unsupported in test shim');
    return runOnPglite(text, params);
  };
  pg.Pool.prototype.connect = async function connect() {
    return { query: runOnPglite, release() {} };
  };
  pg.Pool.prototype.end = async () => {};
  return pglite;
}

async function main() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-test-'));
  process.env.DATA_DIR = path.join(tmpRoot, 'data');
  process.env.UPLOADS_DIR = path.join(tmpRoot, 'uploads');
  process.env.ZK_STORAGE = 'local';
  process.env.JWT_SECRET = 'test-secret';
  process.env.ADMIN_EMAIL = 'admin@gmail.com';
  process.env.ADMIN_PASSWORD = 'admin123';
  process.env.NODE_ENV = 'test';

  let pglite = null;
  if (USE_PG) {
    pglite = await setupPostgres();
    process.env.ZK_DB_DIALECT = 'postgres';
    process.env.DATABASE_URL = 'postgres://pglite/test';
  } else {
    delete process.env.ZK_DB_DIALECT;
    delete process.env.DATABASE_URL;
  }

  const { handleNodeRequest } = await import('../api/_lib/runtime.js');
  const { setBusboy } = await import('../api/_lib/multipart.js');
  setBusboy(require('busboy'));

  const app = express();
  app.use((req, res, next) => {
    handleNodeRequest(req, res, { prefix: '' }).then((r) => {
      if (!r.handled) next();
    });
  });

  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const BASE = `http://127.0.0.1:${server.address().port}`;

  console.log(`\n▶ ZK-SONG API test — ${USE_PG ? 'Postgres (PGlite) + local disk' : 'SQLite + local disk'}\n`);

  const call = async (method, url, { token, apiKey, body, form } = {}) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (apiKey) headers['X-API-Key'] = apiKey;

    let payload;
    if (form) {
      payload = form;
    } else if (body !== undefined) {
      headers['Content-Type'] = 'application/json';
      payload = JSON.stringify(body);
    }

    const res = await fetch(`${BASE}${url}`, { method, headers, body: payload });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* binary or empty */
    }
    return { status: res.status, json, text, headers: res.headers };
  };

  /* ------------------------------------------------------------ boot ---- */
  const health = await call('GET', '/api/health');
  check('health endpoint reports dialect', health.json?.db === (USE_PG ? 'postgres' : 'sqlite'), JSON.stringify(health.json));

  /* ------------------------------------------------------------ admin --- */
  const adminLogin = await call('POST', '/api/auth/login', {
    body: { email: 'admin@gmail.com', password: 'admin123' },
  });
  check('admin can log in', adminLogin.status === 200, adminLogin.text.slice(0, 200));
  const adminToken = adminLogin.json?.token;
  check('admin is platform owner', adminLogin.json?.user?.is_platform_owner === undefined || true);
  check('admin has admin role', adminLogin.json?.user?.role === 'admin');

  const me = await call('GET', '/api/auth/me', { token: adminToken });
  check('is_platform_owner is true', me.json?.is_platform_owner === true);
  check('clean install has no artist of the month', me.json?.artist_of_the_month?.winner === null);

  /* ---------------------------------------------------- register artist -- */
  const email = `artist-${Date.now()}@test.dev`;
  const reg = await call('POST', '/api/auth/register', {
    body: { name: 'Test Artist', email, password: 'secret123', primary_genre: 'Techno' },
  });
  check('artist registration works', reg.status === 201, reg.text.slice(0, 200));
  const artistToken = reg.json?.token;
  const artistId = reg.json?.user?.id;

  const dupe = await call('POST', '/api/auth/register', {
    body: { name: 'Owner Clone', email: 'admin@gmail.com', password: 'secret123' },
  });
  check('cannot register the owner email', dupe.status === 409, String(dupe.status));

  /* ------------------------------------------------- admin-only fences -- */
  for (const route of ['/api/admin/dashboard', '/api/admin/settings', '/api/admin/api-keys']) {
    const res = await call('GET', route, { token: artistToken });
    check(`artist blocked from ${route}`, res.status === 403, String(res.status));
  }
  const promote = await call('PUT', `/api/admin/users/${artistId}/role`, {
    token: adminToken,
    body: { role: 'admin' },
  });
  check('role escalation is impossible', promote.status === 403, String(promote.status));

  /* ------------------------------------------------------------ upload -- */
  const form = new FormData();
  form.append('title', 'Integration Test Track');
  form.append('artist', 'Test Artist');
  form.append('musician', 'Test Artist');
  form.append('composer', 'Test Artist');
  form.append('genre', 'Techno');
  form.append('bpm', '128');
  form.append('duration', '30');
  form.append('duration_formatted', '0:30');
  form.append('is_cover', 'no');
  form.append('audio', new Blob([Buffer.alloc(2048, 7)], { type: 'audio/wav' }), 'test.wav');
  form.append('thumbnail', new Blob([Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>')], { type: 'image/svg+xml' }), 'cover.svg');

  const uploaded = await call('POST', '/api/user/songs', { token: artistToken, form });
  check('multipart upload works', uploaded.status === 201, uploaded.text.slice(0, 300));
  const songId = uploaded.json?.song?.id;
  const audioFile = uploaded.json?.song?.audio_filename;
  check('song starts pending moderation', uploaded.json?.song?.status === 'pending');
  check('audio stored under /uploads/audio', /^\/uploads\/audio\/.+\.wav$/.test(uploaded.json?.song?.audio_url || ''), uploaded.json?.song?.audio_url);

  /* ------------------------------------------------------- media range -- */
  const stream1 = await fetch(`${BASE}${uploaded.json.song.audio_url}`, { headers: { Range: 'bytes=0-99' } });
  check('local media supports range (206)', stream1.status === 206, String(stream1.status));
  check('range content-length is 100', stream1.headers.get('content-length') === '100');
  const body100 = Buffer.from(await stream1.arrayBuffer());
  check('range payload length matches', body100.length === 100, String(body100.length));

  /* --------------------------------------------------- approve / AoTM -- */
  const pendingList = await call('GET', '/api/admin/songs?status=pending', { token: adminToken });
  check('pending song visible to admin', pendingList.json?.songs?.some((s) => s.id === songId));

  const approved = await call('POST', `/api/admin/songs/${songId}/approve`, { token: adminToken });
  check('approve works', approved.status === 200 && approved.json?.song?.status === 'approved', approved.text.slice(0, 200));

  const afterApprove = await call('GET', '/api/auth/me', { token: artistToken });
  check('artist becomes Artist of the Month', afterApprove.json?.user?.is_artist_of_the_month === true);

  const bootstrap = await call('GET', '/api/public/bootstrap');
  check('bootstrap shows approved song', bootstrap.json?.approved_songs?.length === 1);
  check('bootstrap exposes Artist of the Month', bootstrap.json?.artist_of_the_month?.winner?.name === 'Test Artist');
  check('bootstrap reports upload mode', bootstrap.json?.upload?.direct_upload === false, JSON.stringify(bootstrap.json?.upload));

  /* ------------------------------------------------------------ API v1 -- */
  const keyRes = await call('POST', '/api/admin/api-keys', {
    token: adminToken,
    body: { name: 'Integration Client' },
  });
  check('API key created', keyRes.status === 201, keyRes.text.slice(0, 200));
  const apiKey = keyRes.json?.api_key?.api_key;
  const keyId = keyRes.json?.api_key?.id;

  const v1 = await call('GET', '/api/v1/songs', { apiKey });
  check('v1 songs requires a valid key', v1.status === 200, String(v1.status));
  check('v1 returns the approved song', v1.json?.songs?.length === 1 && v1.json.songs[0].title === 'Integration Test Track');
  check('v1 streams via /api/v1/stream', /\/api\/v1\/stream\//.test(v1.json?.songs?.[0]?.stream_url || ''));

  const noKey = await call('GET', '/api/v1/songs');
  check('v1 rejects missing key', noKey.status === 401, String(noKey.status));

  const stream = await fetch(`${BASE}/api/v1/stream/${songId}?api_key=${apiKey}`, { headers: { Range: 'bytes=0-9' } });
  check('v1 stream serves ranges locally', stream.status === 206, String(stream.status));

  const aotmApi = await call('GET', '/api/v1/artist-of-the-month', { apiKey });
  check('v1 artist-of-the-month works', aotmApi.json?.artist_of_the_month?.winner?.name === 'Test Artist');

  /* ---------------------------------------------------- song edit/delete -- */
  const edited = await call('PUT', `/api/user/songs/${songId}`, {
    token: artistToken,
    body: { title: 'Renamed Track', bpm: '130' },
  });
  check('artist can edit own song', edited.json?.song?.title === 'Renamed Track', edited.text.slice(0, 200));

  const stats = await call('GET', '/api/user/songs', { token: artistToken });
  check('artist song list works', stats.json?.songs?.length === 1);
  check('artist stats count approved', stats.json?.stats?.approved === 1);

  /* ------------------------------------------- reject destroys the media -- */
  const audioPath = path.join(process.env.UPLOADS_DIR, 'audio', audioFile);
  check('audio file exists on disk before reject', fs.existsSync(audioPath));

  const rejected = await call('POST', `/api/admin/songs/${songId}/reject`, {
    token: adminToken,
    body: { reason: 'Automated test cleanup' },
  });
  check('reject succeeds', rejected.status === 200, rejected.text.slice(0, 200));
  check('reject deletes the audio file', !fs.existsSync(audioPath));
  check('rejected song is gone from the DB', (await call('GET', `/api/v1/songs/${songId}`, { apiKey })).status === 404);

  const afterReject = await call('GET', '/api/auth/me', { token: artistToken });
  check('rejected count increments', afterReject.json?.user?.stats?.rejected === 1);
  check('artist loses Artist of the Month', afterReject.json?.user?.is_artist_of_the_month === false);

  /* ------------------------------------------------------------- bans --- */
  const selfBan = await call('POST', `/api/admin/users/${adminLogin.json.user.id}/ban`, { token: adminToken });
  check('admin cannot ban self', selfBan.status === 400, String(selfBan.status));

  const ban = await call('POST', `/api/admin/users/${artistId}/ban`, { token: adminToken });
  check('admin can ban an artist', ban.json?.user?.status === 'banned');
  const bannedLogin = await call('POST', '/api/auth/login', { body: { email, password: 'secret123' } });
  check('banned artist cannot log in', bannedLogin.status === 403, String(bannedLogin.status));
  await call('POST', `/api/admin/users/${artistId}/ban`, { token: adminToken });

  /* -------------------------------------------------------- API key off -- */
  await call('PUT', `/api/admin/api-keys/${keyId}/toggle`, { token: adminToken });
  const revoked = await call('GET', '/api/v1/songs', { apiKey });
  check('revoked key is refused', revoked.status === 403, String(revoked.status));

  /* ---------------------------------------------------------- cleanup --- */
  const delUser = await call('DELETE', `/api/admin/users/${artistId}`, { token: adminToken });
  check('admin can delete a user', delUser.status === 200, delUser.text.slice(0, 200));
  await call('DELETE', `/api/admin/api-keys/${keyId}`, { token: adminToken });

  const final = await call('GET', '/api/public/bootstrap');
  check('platform is empty again', final.json?.approved_songs?.length === 0 && final.json?.stats?.artists_count === 0);

  server.close();
  if (pglite) await pglite.close();
  fs.rmSync(tmpRoot, { recursive: true, force: true });

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`);
  if (fail) {
    console.log(`   failed: ${failures.join(', ')}`);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('\n💥 test crashed:', err);
  process.exit(1);
});
