// ============================================================================
// ZK-SONG — serverless-path test
//
// Exercises what only exists when media lives in object storage:
//   • GET /api/uploads/config reports direct uploads
//   • POST /api/uploads/sign issues a scoped, single-purpose signed URL
//   • POST /api/user/songs accepts storage keys instead of bytes
//   • /api/v1/stream/:id redirects to the CDN instead of piping audio
//   • /api/public/bootstrap returns CDN URLs for covers/audio
//
// Storage is a fake in-memory bucket (same interface as Supabase Storage), so
// this runs offline while still exercising the real API code paths.
// ============================================================================

const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const os = require('node:os');
const express = require('express');

let pass = 0;
let fail = 0;

function check(name, condition, detail) {
  if (condition) {
    pass++;
    console.log(`  ✓ ${name}`);
  } else {
    fail++;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function main() {
  const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'zk-srvless-'));
  process.env.DATA_DIR = path.join(tmpRoot, 'data');
  process.env.UPLOADS_DIR = path.join(tmpRoot, 'uploads');
  process.env.JWT_SECRET = 'test-secret';
  process.env.ADMIN_EMAIL = 'admin@gmail.com';
  process.env.ADMIN_PASSWORD = 'admin123';
  process.env.ZK_DB_DIALECT = 'sqlite';

  const { setBusboy } = await import('../api/_lib/multipart.js');
  setBusboy(require('busboy'));

  // Fresh modules so the storage singleton picks up the fake driver.
  const objects = new Map();
  const signedFor = [];
  let storageKind = 'supabase';

  const fakeStorage = {
    kind: 'supabase',
    supportsSignedUploads: true,
    folders: ['audio', 'thumbnails', 'videos', 'avatars', 'branding'],
    bucket: 'media',
    publicUrl(key) {
      return `https://cdn.example.test/storage/v1/object/public/media/${key}`;
    },
    async exists(key) {
      return objects.has(key);
    },
    async createSignedUpload(key) {
      const token = `tok_${Math.random().toString(36).slice(2)}`;
      signedFor.push({ key, token });
      return {
        uploadUrl: `https://cdn.example.test/storage/v1/object/upload/sign/media/${key}?token=${token}`,
        token,
        path: key,
        publicUrl: this.publicUrl(key),
      };
    },
    async receiveFile({ key, stream }) {
      let size = 0;
      for await (const chunk of stream) size += chunk.length;
      objects.set(key, size);
      return { size };
    },
    async remove(key) {
      return objects.delete(key);
    },
    async stat(key) {
      return objects.has(key) ? { size: objects.get(key) } : null;
    },
  };

  const { createApi } = await import('../api/_lib/app.js');
  const { getStore } = await import('../api/_lib/db/index.js');
  const db = await getStore();
  const api = createApi({ db, storage: fakeStorage });

  // Minimal host: same routing as the real runtime, but no singleton storage.
  const app = express();
  app.use((req, res) => {
    const url = req.url;
    const [rawPath, qs] = url.split('?');
    const pathOnly = rawPath.split('/').filter(Boolean);
    const query = Object.fromEntries(new URLSearchParams(qs || ''));
    const { route, params } = api.resolve(req.method.toUpperCase(), `/${pathOnly.join('/')}`);

    if (!route) {
      res.statusCode = 404;
      return res.end(JSON.stringify({ error: 'no route' }));
    }

    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', async () => {
      let body = {};
      const text = Buffer.concat(chunks).toString('utf8');
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = {};
        }
      }
      const headers = Object.fromEntries(
        Object.entries(req.headers).map(([k, v]) => [k.toLowerCase(), String(v)])
      );
      try {
        let result;
        for (const handler of route.handlers) {
          result = await handler({
            method: req.method,
            path: `/${pathOnly.join('/')}`,
            query,
            params,
            headers,
            body,
            files: {},
            origin: 'https://zksong.test',
            env: process.env,
          });
        }
        const headersOut = { 'Content-Type': 'application/json', ...(result.headers || {}) };
        res.writeHead(result.status || 200, headersOut);
        res.end(result.kind === 'json' ? JSON.stringify(result.body) : result.body || '');
      } catch (err) {
        res.writeHead(err.status || 500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify(err.payload || { error: err.message }));
      }
    });
  });

  const server = http.createServer(app);
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const BASE = `http://127.0.0.1:${server.address().port}`;

  const call = async (method, url, { token, apiKey, body } = {}) => {
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    if (apiKey) headers['X-API-Key'] = apiKey;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    const res = await fetch(`${BASE}${url}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* redirect bodies are empty */
    }
    return { status: res.status, json, location: res.headers.get('location') };
  };

  console.log('\n▶ ZK-SONG serverless path — object storage + CDN redirects\n');

  /* ------------------------------------------------------------ config -- */
  const config = await call('GET', '/api/uploads/config');
  check('config reports direct uploads', config.json?.direct_upload === true);
  check('bootstrap reports storage mode', (await call('GET', '/api/public/bootstrap')).json?.upload?.storage === 'supabase');

  /* ------------------------------------------------------------- login -- */
  const login = await call('POST', '/api/auth/login', {
    body: { email: 'admin@gmail.com', password: 'admin123' },
  });
  const adminToken = login.json?.token;

  const reg = await call('POST', '/api/auth/register', {
    body: { name: 'Cloud Artist', email: `cloud-${Date.now()}@test.dev`, password: 'secret123' },
  });
  const artistToken = reg.json?.token;

  /* -------------------------------------------------------------- sign -- */
  const unauth = await call('POST', '/api/uploads/sign', { body: { field: 'audio', filename: 'x.wav' } });
  check('signing requires authentication', unauth.status === 401, String(unauth.status));

  const sign = await call('POST', '/api/uploads/sign', {
    token: artistToken,
    body: { field: 'audio', filename: 'My Track (final).wav', size: 5_000_000 },
  });
  check('signed upload URL issued', sign.status === 200 && !!sign.json?.upload?.url, JSON.stringify(sign.json));
  check('signed URL is scoped to the audio folder', /audio\//.test(sign.json?.upload?.key || ''));
  check('signed URL carries a token', !!sign.json?.upload?.token);
  check('filename is sanitised', !/[() ]/.test(sign.json?.upload?.key || ''), sign.json?.upload?.key);
  check('key is not reusable across requests', (signedFor.length === 1));

  const badKind = await call('POST', '/api/uploads/sign', {
    token: artistToken,
    body: { field: 'executable', filename: 'x.exe' },
  });
  check('unknown upload kinds are rejected', badKind.status === 400, String(badKind.status));

  const badType = await call('POST', '/api/uploads/sign', {
    token: artistToken,
    body: { field: 'audio', filename: 'malware.exe' },
  });
  check('non-audio files cannot claim the audio folder', badType.status === 400, String(badType.status));

  const tooBig = await call('POST', '/api/uploads/sign', {
    token: artistToken,
    body: { field: 'audio', filename: 'huge.wav', size: 500 * 1024 * 1024 },
  });
  check('oversized uploads are refused up front', tooBig.status === 400, String(tooBig.status));

  const logoByArtist = await call('POST', '/api/uploads/sign', {
    token: artistToken,
    body: { field: 'logo', filename: 'logo.svg' },
  });
  check('only the owner may sign branding uploads', logoByArtist.status === 403, String(logoByArtist.status));

  /* --------------------------------------------------- direct metadata -- */
  const thumbSign = await call('POST', '/api/uploads/sign', {
    token: artistToken,
    body: { field: 'thumbnail', filename: 'cover.svg' },
  });

  const audioKey = sign.json.upload.key;
  const thumbKey = thumbSign.json.upload.key;
  objects.set(audioKey, 5_000_000); // pretend the browser PUT the file
  objects.set(thumbKey, 2048);

  const created = await call('POST', '/api/user/songs', {
    token: artistToken,
    body: {
      title: 'Cloud Native Track',
      artist: 'Cloud Artist',
      musician: 'Cloud Artist',
      composer: 'Cloud Artist',
      genre: 'Ambient',
      duration: '180',
      duration_formatted: '3:00',
      audio_key: audioKey,
      thumbnail_key: thumbKey,
    },
  });
  check('metadata-only upload creates the song', created.status === 201, JSON.stringify(created.json));
  check('audio size was read back from storage', created.json?.song?.audio_size === 5_000_000, String(created.json?.song?.audio_size));
  check('stored reference is canonical (/uploads/audio/…)', /^\/uploads\/audio\//.test(created.json?.song?.audio_storage_path || ''), created.json?.song?.audio_storage_path);
  check('audio_url is CDN-ready for the UI', /^https:\/\/cdn\.example\.test\//.test(created.json?.song?.audio_url || ''), created.json?.song?.audio_url);
  check('cover is served from the CDN', /^https:\/\/cdn\.example\.test\//.test(created.json?.song?.full_thumbnail_url || ''), created.json?.song?.full_thumbnail_url);

  // A failed metadata submission must not leave orphaned objects in the bucket.
  const orphanSign = await call('POST', '/api/uploads/sign', {
    token: artistToken,
    body: { field: 'audio', filename: 'orphan.wav' },
  });
  const orphanKey = orphanSign.json.upload.key;
  objects.set(orphanKey, 999);
  const failed = await call('POST', '/api/user/songs', {
    token: artistToken,
    body: { audio_key: orphanKey }, // missing required title/artist/etc.
  });
  check('invalid submission is rejected', failed.status === 400, String(failed.status));
  check('rejected submission rolls back the uploaded object', !objects.has(orphanKey));

  const noKeyUpload = await call('POST', '/api/user/songs', {
    token: artistToken,
    body: { title: 'Missing Audio', artist: 'x', musician: 'x', composer: 'x' },
  });
  check('upload without audio is rejected', noKeyUpload.status === 400, String(noKeyUpload.status));

  /* --------------------------------------------------- approve + stream -- */
  const songId = created.json.song.id;
  await call('POST', `/api/admin/songs/${songId}/approve`, { token: adminToken });

  const keyRes = await call('POST', '/api/admin/api-keys', {
    token: adminToken,
    body: { name: 'Cloud Client' },
  });
  const apiKey = keyRes.json.api_key.api_key;

  const stream = await call('GET', `/api/v1/stream/${songId}?api_key=${apiKey}`);
  check('stream redirects (302) instead of proxying audio', stream.status === 302, String(stream.status));
  check('stream redirects to the CDN object', /^https:\/\/cdn\.example\.test\/.*audio\//.test(stream.location || ''), stream.location);
  check('redirect is not cached (play counts stay accurate)', stream.location?.includes('object/public'));

  const v1 = await call('GET', '/api/v1/songs', { apiKey });
  check('v1 audio_url points at the CDN', /^https:\/\/cdn\.example\.test\//.test(v1.json?.songs?.[0]?.audio_url || ''), v1.json?.songs?.[0]?.audio_url);
  check('v1 audio_path keeps the canonical reference', /^\/uploads\/audio\//.test(v1.json?.songs?.[0]?.audio_path || ''), v1.json?.songs?.[0]?.audio_path);
  check('v1 audio_url is absolute', /^https:\/\//.test(v1.json?.songs?.[0]?.audio_url || ''), v1.json?.songs?.[0]?.audio_url);

  /* -------------------------------------------------- delete from bucket -- */
  const before = objects.size;
  const rejected = await call('POST', `/api/admin/songs/${songId}/reject`, { token: adminToken });
  check('reject succeeds in cloud mode', rejected.status === 200, JSON.stringify(rejected.json).slice(0, 120));
  check('reject deletes the audio object', !objects.has(audioKey));
  check('reject deletes the cover object', !objects.has(thumbKey));
  check('bucket is clean again', objects.size === before - 2, `${objects.size} vs ${before - 2}`);

  /* -------------------------------------------------------------- done -- */
  server.close();
  fs.rmSync(tmpRoot, { recursive: true, force: true });

  console.log(`\n${fail === 0 ? '✅' : '❌'} ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('💥 crashed:', err);
  process.exit(1);
});
