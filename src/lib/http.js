// ============================================================================
// ZK-SONG — response reading that cannot produce a fake error
//
// `await res.json()` throws a SyntaxError when the body is not JSON. Platforms
// answer a crashed function with their own HTML/text page, so the user ends up
// staring at `Unexpected token 'A', "A server e"... is not valid JSON` — an
// error about parsing, which says nothing about what actually broke.
//
// `readJson` always resolves. On a non-JSON body it returns a payload carrying a
// human explanation and the HTTP status, so callers that do
// `if (!res.ok) throw new Error(data.error)` surface something true.
// ============================================================================

/** Bodies below this size are read as text so we can quote them in the message. */
const PREVIEW_LIMIT = 180;

function preview(text) {
  const clean = String(text || '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!clean) return '';
  return clean.length > PREVIEW_LIMIT ? `${clean.slice(0, PREVIEW_LIMIT)}…` : clean;
}

/**
 * Human explanation for a response that was not JSON.
 * Vercel/Netlify crash pages always name themselves, so they are detectable.
 */
function explain(res, text) {
  const status = res.status;
  const body = preview(text);

  if (/FUNCTION_INVOCATION_FAILED|A server error has occurred/i.test(body)) {
    return {
      error:
        'The API crashed before it could reply. Its server logs will show the cause; ' +
        'a common reason is the database being unreachable.',
      code: 'API_CRASHED',
      status,
    };
  }
  if (/ENOTFOUND|ENETUNREACH|no such host/i.test(body)) {
    return { error: 'The API host could not be reached.', code: 'API_UNREACHABLE', status };
  }
  if (status === 404) {
    return {
      error: 'The API endpoint was not found. The frontend and API may be deployed separately.',
      code: 'API_ROUTE_NOT_FOUND',
      status,
    };
  }
  if (status === 502 || status === 503 || status === 504) {
    return { error: `The API is unavailable (HTTP ${status}).`, code: 'API_UNAVAILABLE', status };
  }
  return {
    error: body ? `Unexpected response (HTTP ${status}): ${body}` : `Unexpected response (HTTP ${status}).`,
    code: 'NON_JSON_RESPONSE',
    status,
  };
}

/**
 * Parse a fetch Response as JSON, never throwing on a bad body.
 * @returns {Promise<object>} parsed JSON, or `{error, code, status}`.
 */
export async function readJson(res, fallback = {}) {
  const status = res?.status ?? 0;
  let text = '';
  try {
    text = await res.text();
  } catch {
    return { ...fallback, error: 'The response could not be read.', code: 'READ_FAILED', status };
  }

  if (!text.trim()) {
    if (status >= 400) return { ...fallback, ...explain(res, ''), status };
    return fallback;
  }

  try {
    const parsed = JSON.parse(text);
    if (parsed && typeof parsed === 'object') return parsed;
    return { data: parsed };
  } catch {
    return { ...fallback, ...explain(res, text), status };
  }
}

/** Fetch + readJson in one call. Network failures also resolve. */
export async function fetchJson(url, options) {
  let res;
  try {
    res = await fetch(url, options);
  } catch (err) {
    return {
      ok: false,
      data: {
        error:
          'The server could not be reached. Check your connection, then try again.',
        code: 'NETWORK_ERROR',
      },
      status: 0,
    };
  }
  const data = await readJson(res, {});
  return { ok: res.ok, status: res.status, data };
}
