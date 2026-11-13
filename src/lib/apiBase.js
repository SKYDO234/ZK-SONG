// Central API base resolution.
//
// When the frontend is deployed to a static host (Vercel, Netlify, Cloudflare
// Pages) the backend lives elsewhere. Set VITE_API_BASE_URL at build time to
// point at it, e.g. https://zk-api.onrender.com
//
// When it is empty the app uses same-origin relative URLs, which is what the
// bundled Express server (`npm start`) and the Vite dev proxy expect.

export const API_BASE = String(import.meta.env.VITE_API_BASE_URL || '')
  .trim()
  .replace(/\/+$/, '');

export const IS_REMOTE_API = API_BASE.length > 0;

/** Prefix a /api or /uploads path with the configured API origin. */
export function withApiBase(url) {
  if (typeof url !== 'string' || !IS_REMOTE_API) return url;
  if (/^(https?:|data:|blob:)/i.test(url)) return url;
  if (!url.startsWith('/')) return url;
  return `${API_BASE}${url}`;
}

/** Resolve a stored media path (thumbnail/audio/video/avatar/logo) for <img>, <audio>, fetch, download. */
export function mediaUrl(path) {
  return withApiBase(path || '');
}

let installed = false;

/**
 * Patch window.fetch once so every existing relative `/api/...` call in the app
 * transparently targets the configured API origin.
 */
export function installApiBase() {
  if (installed || !IS_REMOTE_API || typeof window === 'undefined') return;
  installed = true;

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    if (typeof input === 'string') return nativeFetch(withApiBase(input), init);
    if (input instanceof Request) {
      const next = withApiBase(input.url);
      return nativeFetch(next === input.url ? input : new Request(next, input));
    }
    return nativeFetch(input, init);
  };
}
