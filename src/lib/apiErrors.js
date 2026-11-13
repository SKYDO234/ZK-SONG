// ============================================================================
// ZK-SONG — what the user is told when the API cannot start
//
// The server answers a boot failure with a precise payload:
//   { error: "The API could not start.", code: "DB_AUTH_FAILED",
//     detail: "Postgres rejected the password…", database_target: {…} }
//
// Only `error` used to be displayed, which told the user nothing they could act
// on. This module turns the payload into a headline plus concrete steps while
// keeping credentials out of the page.
// ============================================================================

/** Friendly headline and remedy per failure code. */
const GUIDANCE = {
  DATABASE_URL_MISSING: {
    title: 'The database is not configured',
    steps: [
      'Set DATABASE_URL in your host’s environment variables.',
      'Use the Session pooler string from Supabase → Connect.',
      'Redeploy — variable changes need a new deployment.',
    ],
  },
  DB_AUTH_FAILED: {
    title: 'The database rejected the credentials',
    steps: [
      'Reset the database password in Supabase → Settings → Database.',
      'Paste the new password into DATABASE_URL in your host.',
      'Percent-encode any of @ : / ? # [ ] inside the password.',
    ],
  },
  DB_UNREACHABLE: {
    title: 'The database is unreachable',
    steps: [
      'On Supabase Free, the direct host is IPv6-only and will not work here.',
      'Use the Session pooler host (…pooler.supabase.com, port 5432).',
    ],
  },
  DB_HOST_NOT_FOUND: {
    title: 'The database hostname does not resolve',
    steps: ['Check DATABASE_URL for a typo in the host.', 'Redeploy after fixing it.'],
  },
  DB_CONNECTION_REFUSED: {
    title: 'Nothing is listening on that database port',
    steps: ['Use port 5432 (session mode), not 6543.', 'Confirm the project is not paused.'],
  },
  READ_ONLY_FILESYSTEM: {
    title: 'The server cannot write its files',
    steps: ['Set DATABASE_URL so Postgres is used instead of a local SQLite file.'],
  },
  API_BOOT_FAILED: {
    title: 'The server could not start',
    steps: ['Check the deployment logs, then redeploy.'],
  },
};

/**
 * Build a readable message from an API error payload.
 * @param {object} data response body
 * @param {string} fallback used when the body carries nothing useful
 */
export function describeApiFailure(data, fallback = 'Something went wrong.') {
  if (!data || typeof data !== 'object') return { title: fallback, steps: [], detail: '' };

  const code = data.code;
  const guidance = GUIDANCE[code];
  const detail = typeof data.detail === 'string' ? data.detail.trim() : '';
  const message = typeof data.error === 'string' ? data.error.trim() : '';

  // Connection target: shown to help debugging, with no secret in it.
  const target = data.database_target;
  const targetLine = target && !target.error
    ? `Target: ${target.username}@${target.host}:${target.port}/${target.database}` +
      ` · password ${target.password_length} chars` +
      (target.username_has_project_ref === false ? ' · USERNAME MISSING PROJECT REF' : '')
    : '';

  if (guidance) {
    return { title: guidance.title, steps: guidance.steps, detail, targetLine, code };
  }
  return { title: message || fallback, steps: [], detail, targetLine, code };
}
