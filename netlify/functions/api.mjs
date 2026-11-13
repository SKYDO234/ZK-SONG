// ============================================================================
// ZK-SONG — Netlify Function entry point
//
// netlify.toml redirects /api/* here (and /uploads/* too, so stored media keeps
// resolving). Same code, same database, same storage as the Express backend.
//
// Environment variables (Netlify → Site configuration → Environment):
//   DATABASE_URL, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY,
//   JWT_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
// ============================================================================

import { handleNodeRequest } from '../../api/_lib/runtime.js';

export async function handler(event, context) {
  try {
    const { statusCode, headers, body } = await serve(event);
    return { statusCode, headers, body, isBase64Encoded: false };
  } catch (err) {
    console.error('[ZK-SONG] Netlify function error:', err);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: err.message || 'Server error' }),
    };
  }
}

/**
 * Bridge Netlify's event object onto the Node req/res shape the shared runtime
 * expects. Netlify has already buffered the body, so we replay it as a stream.
 */
async function serve(event) {
  const { Readable } = await import('node:stream');

  const rawPath = event.rawUrl
    ? new URL(event.rawUrl).pathname + (new URL(event.rawUrl).search || '')
    : event.path;

  const req = new Readable({ read() {} });
  const bodyBuffer = event.body
    ? event.isBase64Encoded
      ? Buffer.from(event.body, 'base64')
      : Buffer.from(event.body)
    : Buffer.alloc(0);
  req.push(bodyBuffer);
  req.push(null);

  req.method = event.httpMethod;
  req.url = rawPath;
  req.headers = Object.fromEntries(
    Object.entries(event.headers || {}).map(([k, v]) => [k.toLowerCase(), v])
  );

  const chunks = [];
  const res = createCaptureResponse(chunks);

  const result = await handleNodeRequest(req, res, { prefix: '' });

  if (!result.handled) {
    return {
      statusCode: 404,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Not found', code: 'API_ROUTE_NOT_FOUND' }),
    };
  }

  const buffer = Buffer.concat(chunks);
  const headers = { ...res.headers };
  // Binary media (covers, audio read from disk) must go back base64 encoded.
  const isBinary =
    /^(image|audio|video|application\/(octet-stream|pdf|zip))/i.test(headers['Content-Type'] || '');

  return {
    statusCode: res.statusCode,
    headers,
    body: isBinary ? buffer.toString('base64') : buffer.toString('utf8'),
    isBase64Encoded: isBinary,
  };
}

/** Minimal ServerResponse stand-in that collects headers + body. */
function createCaptureResponse(chunks) {
  return {
    statusCode: 200,
    headers: {},
    setHeader(name, value) {
      this.headers[name] = Array.isArray(value) ? value.join(', ') : String(value);
    },
    getHeader(name) {
      return this.headers[name];
    },
    removeHeader(name) {
      delete this.headers[name];
    },
    writeHead(status, headers = {}) {
      this.statusCode = status;
      for (const [k, v] of Object.entries(headers)) this.setHeader(k, v);
    },
    write(chunk) {
      if (chunk) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)));
      return true;
    },
    end(chunk) {
      if (chunk) this.write(chunk);
      this.finished = true;
    },
    on() {
      return this;
    },
    once() {
      return this;
    },
    emit() {
      return true;
    },
  };
}
