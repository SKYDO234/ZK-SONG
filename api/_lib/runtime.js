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

/** Boot the API once per process (pool + schema + admin). */
export async function getApi() {
  if (!ready) {
    ready = (async () => {
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

  const api = await getApi();
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
