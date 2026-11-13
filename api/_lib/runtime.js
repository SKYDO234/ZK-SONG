// ============================================================================
// ZK-SONG — runtime adapters
//
// A function that takes a *Node* (req, res) pair and serves the shared API.
// Express, Vercel Functions and Netlify Functions all expose a Node request and
// response, so one adapter drives all three; only the initialisation differs.
// ============================================================================

import { getStore } from './db/index.js';
import { getStorage } from './storage/index.js';
import { createApi, mimeFor } from './app.js';
import { parseMultipart } from './multipart.js';
import { HttpError, headerBag, parseUrl } from './http.js';
import fs from 'node:fs';
import { pipeline } from 'node:stream/promises';

const BODY_LIMIT = 32 * 1024 * 1024; // JSON metadata only; files never come this way

let ready = null;
/** Last boot failure, kept so /api/health can explain it on demand. */
let lastBootFailure = null;

export function getLastBootFailure() {
  return lastBootFailure;
}

/** Boot the API once per process (pool + schema + admin). */
export async function getApi() {
  if (!ready) {
    ready = (async () => {
      lastBootFailure = null;
      const db = await getStore();
      const storage = getStorage();
      return createApi({ db, storage });
    })().catch((err) => {
      ready = null;
      throw err;
    });
  }
  return ready;
}

/** Vercel/Netlify sometimes pre-parse the body; reuse it when present. */
async function readJsonBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (Buffer.isBuffer(req.body)) {
      return req.body.length ? JSON.parse(req.body.toString('utf8')) : {};
    }
    if (typeof req.body === 'string') {
      return req.body ? JSON.parse(req.body) : {};
    }
    return req.body;
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > BODY_LIMIT) throw new HttpError(413, { error: 'Request body too large.' });
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  const text = Buffer.concat(chunks).toString('utf8').trim();
  return text ? JSON.parse(text) : {};
}

function sendJson(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Length', Buffer.byteLength(payload));
  res.setHeader('X-Powered-By', 'ZK-SONG-Engine/2.6');
  for (const [k, v] of Object.entries(headers)) res.setHeader(k, v);
  res.end(payload);
}

function setCors(req, res, env = process.env) {
  const allowed = String(env.ALLOWED_ORIGIN || '').trim();
  const origin = req.headers.origin;
  if (allowed) {
    const list = allowed.split(',').map((o) => o.trim());
    if (origin && list.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
  } else if (origin) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Authorization, Content-Type, X-API-Key, Range, If-Range'
  );
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, Accept-Ranges, Content-Length');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

/** Range-aware file response, used when media lives on local disk. */
function sendFile(req, res, descriptor) {
  const { path: filePath, headers = {}, downloadName } = descriptor;
  if (!fs.existsSync(filePath)) {
    return sendJson(res, 404, { error: 'Media file not found' });
  }

  const size = fs.statSync(filePath).size;
  const type = headers['Content-Type'] || mimeFor(filePath);
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Content-Type', type);
  for (const [k, v] of Object.entries(headers)) {
    if (k !== 'Content-Type') res.setHeader(k, v);
  }
  if (downloadName) {
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${downloadName.replace(/["\\]/g, '')}"`
    );
  }

  const range = req.headers.range;
  if (!range) {
    res.statusCode = 200;
    res.setHeader('Content-Length', size);
    if (req.method === 'HEAD') return res.end();
    return pipeline(fs.createReadStream(filePath), res).catch(() => {});
  }

  const match = /bytes=(\d*)-(\d*)/.exec(range);
  if (!match) {
    res.statusCode = 416;
    res.setHeader('Content-Range', `bytes */${size}`);
    return res.end();
  }
  let start = match[1] ? parseInt(match[1], 10) : 0;
  let end = match[2] ? parseInt(match[2], 10) : size - 1;
  if (match[1] === '' && match[2]) {
    // suffix range: last N bytes
    start = Math.max(0, size - parseInt(match[2], 10));
    end = size - 1;
  }
  if (Number.isNaN(start) || Number.isNaN(end) || start >= size || end >= size || start > end) {
    res.statusCode = 416;
    res.setHeader('Content-Range', `bytes */${size}`);
    return res.end();
  }

  res.statusCode = 206;
  res.setHeader('Content-Range', `bytes ${start}-${end}/${size}`);
  res.setHeader('Content-Length', end - start + 1);
  if (req.method === 'HEAD') return res.end();
  return pipeline(fs.createReadStream(filePath, { start, end }), res).catch(() => {});
}

/**
 * Describe the connection target WITHOUT its password.
 *
 * `28P01` (password authentication failed) is ambiguous in two ways worth
 * telling apart: a genuinely wrong password, and Supabase's pooler rejecting an
 * unknown tenant because the username lacks the project ref. Echoing the parsed
 * host/port/user makes the difference visible in the response.
 */
export function dbTargetSummary(env = process.env) {
  const raw = env.DATABASE_URL || env.POSTGRES_URL || '';
  if (!raw) return null;
  try {
    const u = new URL(raw);
    const username = decodeURIComponent(u.username || '');
    return {
      host: u.hostname,
      port: u.port || '5432',
      database: (u.pathname || '/postgres').slice(1) || 'postgres',
      username,
      pooled: /\.pooler\.supabase\.com$/i.test(u.hostname),
      username_has_project_ref: /^postgres\.[a-z0-9]{16,}$/i.test(username),
      password_length: u.password ? decodeURIComponent(u.password).length : 0,
    };
  } catch {
    return { error: 'DATABASE_URL is not a valid URL.' };
  }
}

/**
 * Full deployment diagnosis as JSON. Always answers 200 with a report — the
 * point is to explain a broken deployment, so it must not depend on the thing
 * that is broken.
 */
export async function buildDiagnostics(env = process.env) {
  const config = diagnoseConfig(env);
  const target = dbTargetSummary(env);
  const report = {
    ok: config.ok && !lastBootFailure,
    time: new Date().toISOString(),
    platform: {
      vercel: Boolean(env.VERCEL),
      netlify: Boolean(env.NETLIFY),
      lambda: Boolean(env.AWS_LAMBDA_FUNCTION_NAME),
    },
    variables: {
      DATABASE_URL: Boolean(env.DATABASE_URL || env.POSTGRES_URL),
      SUPABASE_URL: Boolean(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL),
      SUPABASE_SERVICE_ROLE_KEY: Boolean(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY),
      JWT_SECRET: Boolean(env.JWT_SECRET || env.APP_JWT_SECRET),
      ADMIN_PASSWORD: Boolean(env.ADMIN_PASSWORD),
      SUPABASE_BUCKET: env.SUPABASE_BUCKET || 'media',
    },
    ...(target ? { database_target: target } : {}),
    missing: config.missing,
    warnings: config.warnings,
    boot_failure: lastBootFailure,
    credential_recovery: globalThis.__zksongCredentialRecovery || null,
  };

  // Live check, bounded so a hanging host cannot stall the report.
  if (env.DATABASE_URL || env.POSTGRES_URL) {
    try {
      const db = await Promise.race([
        getStore(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 8000)),
      ]);
      report.database = { reachable: true, dialect: db.dialect };
      const row = await db.get('select count(*) as c from users');
      report.database.users = Number(row?.c ?? 0);
    } catch (err) {
      report.database = {
        reachable: false,
        reason: err?.reason || err?.code || 'unknown',
        message: String(err?.message || err).slice(0, 300),
      };
    }
  }

  return report;
}

/**
 * Check every variable the API needs, without leaking any value.
 *
 * Reporting one missing key at a time turns a five-minute fix into five
 * redeploy cycles, so collect all of them up front.
 */
export function diagnoseConfig(env = process.env) {
  const isServerless = Boolean(env.VERCEL || env.NETLIFY || env.AWS_LAMBDA_FUNCTION_NAME);
  const missing = [];
  const warnings = [];

  const hasDb = Boolean(env.DATABASE_URL || env.POSTGRES_URL);
  if (!hasDb) {
    missing.push({
      key: isServerless ? 'DATABASE_URL' : 'DATABASE_URL (optional locally)',
      why: isServerless
        ? 'Required on this host: the bundle directory is read-only, so the SQLite fallback cannot run.'
        : 'Optional locally — without it the app uses SQLite in DATA_DIR.',
    });
  }

  const hasStorageUrl = Boolean(env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL);
  const hasStorageKey = Boolean(env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY);
  if (hasStorageUrl !== hasStorageKey) {
    missing.push({
      key: hasStorageUrl ? 'SUPABASE_SERVICE_ROLE_KEY' : 'SUPABASE_URL',
      why: 'Uploads need both Supabase variables. With only one set, media cannot be stored.',
    });
  } else if (!hasStorageUrl && isServerless) {
    missing.push({
      key: 'SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
      why: 'Without object storage, uploads would be written to a read-only filesystem.',
    });
  }

  if (!env.JWT_SECRET && !env.APP_JWT_SECRET) {
    const line = {
      key: 'JWT_SECRET',
      why: 'Falls back to the development default, so anyone reading the repository could forge an admin session.',
    };
    if (isServerless) missing.push(line);
    else warnings.push(line);
  }

  if (isServerless && !env.ADMIN_PASSWORD) {
    warnings.push({
      key: 'ADMIN_PASSWORD',
      why: 'Falls back to "admin123". Set it before the first boot, or the admin account is created with that password.',
    });
  }

  return { ok: missing.length === 0, missing, warnings, serverless: isServerless };
}

/**
 * Turn a boot exception into an actionable JSON payload.
 *
 * The distinct failures look identical to a browser (a platform error page), so
 * name the cause and the fix here, where the real error object still exists.
 */
function describeBootFailure(err) {
  const code = err?.code || '';
  const message = String(err?.message || '').toLowerCase();
  const base = { error: 'The API could not start.', code: 'API_BOOT_FAILED' };

  if (code === 'ENETUNREACH' || code === 'EHOSTUNREACH' || code === 'EAI_AGAIN') {
    return {
      ...base,
      code: 'DB_UNREACHABLE',
      detail:
        'The database host is not reachable from this runtime. On Supabase Free the ' +
        'direct host (db.<ref>.supabase.co) is IPv6-only and serverless platforms ' +
        'have no IPv6 egress. Use the Session pooler connection string ' +
        '(aws-N-<region>.pooler.supabase.com:5432) as DATABASE_URL.',
    };
  }
  if (code === 'ENOTFOUND') {
    return {
      ...base,
      code: 'DB_HOST_NOT_FOUND',
      detail: 'The database hostname in DATABASE_URL does not resolve. Check the host for typos.',
    };
  }
  if (code === '28P01' || message.includes('password authentication failed')) {
    const t = dbTargetSummary();
    // Supavisor answers an unknown tenant with the same error as a bad password,
    // so a username without the project ref is the more likely of the two.
    const usernameLooksWrong =
      t && t.pooled && t.username_has_project_ref === false;
    return {
      ...base,
      code: 'DB_AUTH_FAILED',
      detail: usernameLooksWrong
        ? `The username "${t.username}" has no project ref. Pooled connections must use ` +
          '"postgres.<project-ref>". Copy the string from Supabase → Connect → Session pooler.'
        : 'Postgres rejected the password for this user. Reset it in Supabase → ' +
          'Project Settings → Database → Reset database password, then paste the new value ' +
          'into DATABASE_URL (percent-encode any of @ : / ? # [ ] in it).',
      ...(t ? { database_target: t } : {}),
    };
  }
  // node-postgres raises this from its own connectionTimeoutMillis when the TCP
  // handshake never completes — an unreachable address, not a slow query.
  // The wording differs by layer: pg-pool says "timeout exceeded when trying to
  // connect", the pg client says "Connection terminated due to connection
  // timeout". Both mean the TCP handshake never completed.
  if (
    code === 'ETIMEDOUT' ||
    message.includes('timeout exceeded when trying to connect') ||
    message.includes('connection timeout') ||
    (message.includes('connection terminated') && message.includes('time'))
  ) {
    const t = dbTargetSummary();
    const directHost = t && /^db\.[a-z0-9]+\.supabase\.co$/i.test(t.host);
    if (directHost) {
      return {
        ...base,
        code: 'DB_TIMEOUT_IPV6',
        detail:
          `The host ${t.host} is the direct Supabase endpoint, which on the Free plan ` +
          'resolves only to IPv6. This runtime has no IPv6 route, so the connection is ' +
          'accepted by DNS and then hangs. Replace DATABASE_URL with the Session pooler ' +
          'string from Supabase → Connect (…pooler.supabase.com, port 5432).',
      };
    }
    return {
      ...base,
      code: 'DB_TIMEOUT',
      detail:
        `No answer from ${t ? `${t.host}:${t.port}` : 'the database host'} within 8 seconds. ` +
        'Either the pooler host does not belong to this project (the aws-N index differs ' +
        'per project), or the port is wrong. Copy the string verbatim from ' +
        'Supabase → Connect → Session pooler.',
    };
  }
  if (code === 'ECONNREFUSED') {
    return {
      ...base,
      code: 'DB_CONNECTION_REFUSED',
      detail: 'Nothing is listening on that host/port. Check the port: 5432 = session mode, 6543 = transaction mode.',
    };
  }
  if (message.includes('database_url is not set')) {
    return { ...base, code: 'DATABASE_URL_MISSING', detail: err.message };
  }
  if (code === 'EACCES' || code === 'EROFS') {
    return {
      ...base,
      code: 'READ_ONLY_FILESYSTEM',
      detail:
        'The API tried to write to a read-only directory. Set DATABASE_URL so Postgres ' +
        'is used instead of the local SQLite file.',
    };
  }
  return { ...base, detail: err?.message || 'Unknown error.' };
}

/**
 * Serve one API request.
 * @returns {Promise<{handled: boolean, status?: number}>}
 *   `handled: false` means no API route matched (the caller may serve the SPA).
 */
export async function handleNodeRequest(req, res, { prefix = '', env = process.env } = {}) {
  const originalUrl = req.url || '/';
  const url = prefix && originalUrl.startsWith(prefix)
    ? originalUrl.slice(prefix.length) || '/'
    : originalUrl;

  const { path, query } = parseUrl(url);
  const method = (req.method || 'GET').toUpperCase();
  const headers = headerBag(req.headers);
  const origin = `${headers['x-forwarded-proto'] || 'http'}://${
    headers['x-forwarded-host'] || headers.host || 'localhost'
  }`;

  setCors(req, res, env);
  if (method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return { handled: true, status: 204 };
  }

  let api;
  try {
    api = await getApi();
  } catch (err) {
    // Booting the API (connect Postgres, run schema, seed admin) always happens
    // outside the route handler below. Without this wrapper the rejection
    // escapes the function entirely and the platform answers with its own HTML
    // error page — which the browser then fails to JSON.parse, hiding the real
    // cause behind "Unexpected token 'A'". Answer with JSON instead.
    const reason = describeBootFailure(err);
    lastBootFailure = reason;
    const config = diagnoseConfig(env);
    console.error('[ZK-SONG] API boot failed:', err);
    if (!res.headersSent) {
      const target = dbTargetSummary(env);
      sendJson(res, 503, {
        ...reason,
        ...(target ? { database_target: target } : {}),
        ...(config.missing.length ? { missing: config.missing } : {}),
      });
    }
    return { handled: true, status: 503 };
  }

  const { route, params, pathMatched } = api.resolve(method, path);
  if (!route) {
    return { handled: false, pathMatched };
  }

  let body = {};
  let files = {};

  try {
    const contentType = String(headers['content-type'] || '');
    const isMultipart = contentType.startsWith('multipart/form-data');

    if (isMultipart) {
      const { getStorage } = await import('./storage/index.js');
      const parsed = await parseMultipart(req, getStorage(), {
        limits: { fileSize: Number(env.MAX_UPLOAD_MB || 120) * 1024 * 1024 },
      });
      body = parsed.fields;
      files = parsed.files;
      for (const [field, info] of Object.entries(files)) {
        const { validateUpload } = await import('./multipart.js');
        const invalid = validateUpload(field, info.originalFilename, info.mimetype);
        if (invalid) throw new HttpError(400, { error: invalid });
      }
    } else if (['POST', 'PUT', 'PATCH'].includes(method)) {
      body = await readJsonBody(req);
    }

    const context = {
      method,
      path,
      query,
      params,
      headers,
      body: body || {},
      files,
      origin,
      env,
    };

    let result;
    for (const handler of route.handlers) {
      result = await handler(context);
    }

    switch (result?.kind) {
      case 'json':
        sendJson(res, result.status, result.body, result.headers);
        return { handled: true, status: result.status };

      case 'redirect':
        res.statusCode = result.status;
        for (const [k, v] of Object.entries(result.headers || {})) res.setHeader(k, v);
        res.setHeader('Content-Length', '0');
        res.end();
        return { handled: true, status: result.status };

      case 'file':
        sendFile(req, res, result);
        return { handled: true, status: res.statusCode || 200 };

      case 'raw':
      default: {
        res.statusCode = result?.status || 200;
        for (const [k, v] of Object.entries(result?.headers || {})) res.setHeader(k, v);
        res.end(result?.body ?? '');
        return { handled: true, status: res.statusCode };
      }
    }
  } catch (err) {
    const status = err instanceof HttpError ? err.status : err.status || 500;
    const payload =
      err instanceof HttpError
        ? err.payload
        : { error: err.message || 'Unexpected server error.' };
    if (status >= 500) console.error('[ZK-SONG] API error:', err);
    if (!res.headersSent) sendJson(res, status, payload);
    else res.end();
    return { handled: true, status };
  }
}
