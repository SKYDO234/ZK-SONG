// ============================================================================
// ZK-SONG — HTTP primitives shared by every runtime
// ============================================================================

export class HttpError extends Error {
  constructor(status, payload) {
    super(typeof payload === 'string' ? payload : payload?.error || 'Request failed');
    this.status = status;
    this.payload = typeof payload === 'string' ? { error: payload } : payload;
  }
}

export const badRequest = (msg) => new HttpError(400, { error: msg });
export const forbidden = (msg) => new HttpError(403, { error: msg });
export const notFound = (msg) => new HttpError(404, { error: msg });
export const conflict = (msg) => new HttpError(409, { error: msg });
export const unauthorized = (msg) => new HttpError(401, { error: msg });

/** JSON reply. */
export const json = (body, status = 200, headers = {}) => ({
  kind: 'json',
  status,
  headers,
  body,
});

/** Redirect (used to hand streaming/downloads to the storage CDN). */
export const redirect = (location, status = 302, headers = {}) => ({
  kind: 'redirect',
  status,
  headers: { ...headers, Location: location },
  body: '',
});

/** Binary/text passthrough. */
export const raw = (body, { status = 200, headers = {} } = {}) => ({
  kind: 'raw',
  status,
  headers,
  body,
});

/** Serve a file with Range support (local disk only). */
export const file = (absolutePath, { headers = {}, downloadName } = {}) => ({
  kind: 'file',
  status: 200,
  headers,
  path: absolutePath,
  downloadName,
});

export const noContent = () => raw('', { status: 204 });

/** Parse a URL into path + query object (repeated keys become arrays). */
export function parseUrl(url) {
  const u = new URL(url, 'http://localhost');
  const query = {};
  for (const [k, v] of u.searchParams.entries()) {
    if (query[k] === undefined) query[k] = v;
    else if (Array.isArray(query[k])) query[k].push(v);
    else query[k] = [query[k], v];
  }
  return { path: u.pathname.replace(/\/+$/, '') || '/', query };
}

/** Lower-case header lookup that tolerates plain objects and Headers. */
export function headerBag(headers) {
  const out = {};
  if (!headers) return out;
  if (typeof headers.forEach === 'function' && !Array.isArray(headers)) {
    headers.forEach((value, key) => {
      out[String(key).toLowerCase()] = value;
    });
    return out;
  }
  for (const [k, v] of Object.entries(headers)) {
    out[String(k).toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
  }
  return out;
}

/**
 * Minimal router: exact paths plus `:param` segments.
 * A trailing `*` captures the rest of the path as `params.rest`.
 */
export function createRouter() {
  const routes = [];

  const add = (method, pattern, ...handlers) => {
    const keys = [];
    const wildcard = pattern.endsWith('/*');
    const source = pattern
      .replace(/\/\*$/, '')
      .split('/')
      .map((seg) => {
        if (seg.startsWith(':')) {
          keys.push(seg.slice(1));
          return '([^/]+)';
        }
        return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('/');
    const regex = new RegExp(`^${source}${wildcard ? '(?:/(.*))?' : ''}/?$`);
    routes.push({ method, regex, keys, handlers, wildcard, pattern });
  };

  const router = {
    get: (p, ...h) => add('GET', p, ...h),
    post: (p, ...h) => add('POST', p, ...h),
    put: (p, ...h) => add('PUT', p, ...h),
    patch: (p, ...h) => add('PATCH', p, ...h),
    delete: (p, ...h) => add('DELETE', p, ...h),
    routes,
    resolve(method, path) {
      let pathMatched = false;
      for (const route of routes) {
        const match = route.regex.exec(path);
        if (!match) continue;
        pathMatched = true;
        if (route.method !== method && !(route.method === 'GET' && method === 'HEAD')) continue;
        const params = {};
        route.keys.forEach((key, i) => {
          params[key] = decodeURIComponent(match[i + 1] ?? '');
        });
        if (route.wildcard) params.rest = match[route.keys.length + 1] || '';
        return { route, params };
      }
      return { route: null, params: null, pathMatched };
    },
  };
  return router;
}

/** Constant-time-ish string comparison for secrets. */
export function safeEqual(a, b) {
  const A = String(a);
  const B = String(b);
  if (A.length !== B.length) return false;
  let diff = 0;
  for (let i = 0; i < A.length; i++) diff |= A.charCodeAt(i) ^ B.charCodeAt(i);
  return diff === 0;
}
