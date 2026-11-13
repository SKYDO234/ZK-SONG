// ============================================================================
// ZK-SONG — SQLite → Postgres dialect shim
//
// The Express backend (server/index.js) was written against node:sqlite. To run
// the *same* route code on Postgres we translate at the driver boundary instead
// of forking every query, so there is exactly one implementation of the API.
//
// What is translated:
//   ?                     → $1, $2, …          (placeholders)
//   LIKE ?                → ILIKE $n            (SQLite LIKE is case-insensitive)
//   strftime('%Y-%m', x)  → to_char(x, 'YYYY-MM')
//   COLLATE NOCASE        → dropped (Postgres default collation)
//   is_cover = 1 / 0      → is_cover = true / false
//   video_url != ''       → video_url is distinct from ''
//   is_read = 0 / 1       → is_read = false / true
//   lastInsertRowid       → RETURNING id (see insert helpers)
// ============================================================================

/**
 * Rewrite strftime('%Y-%m', <expr>) where <expr> may itself contain nested
 * calls (e.g. COALESCE(a, b)) — a plain regex stops at the first ')'.
 */
function rewriteStrftime(sql) {
  const marker = /strftime\(\s*'%Y-%m'\s*,/gi;
  let out = '';
  let cursor = 0;
  let match;
  while ((match = marker.exec(sql)) !== null) {
    const start = match.index;
    if (start < cursor) continue;
    let i = marker.lastIndex;
    let depth = 1; // we are inside strftime(
    let quote = '';
    for (; i < sql.length; i++) {
      const ch = sql[i];
      if (quote) {
        if (ch === quote) quote = '';
        continue;
      }
      if (ch === "'" || ch === '"') quote = ch;
      else if (ch === '(') depth++;
      else if (ch === ')') {
        depth--;
        if (depth === 0) break;
      }
    }
    const inner = sql.slice(marker.lastIndex, i).trim();
    out += sql.slice(cursor, start) + `to_char(${inner}, 'YYYY-MM')`;
    cursor = i + 1;
    marker.lastIndex = cursor;
  }
  return out + sql.slice(cursor);
}

export function translateSql(sql) {
  let out = rewriteStrftime(String(sql));

  // Case-insensitive LIKE, matching SQLite semantics.
  out = out.replace(/\bLIKE\b/g, 'ILIKE');

  // Node's sqlite module reports autoincrement ids via this pseudo column.
  out = out.replace(/\bCOLLATE\s+NOCASE\b/gi, '');
  out = out.replace(/\bCOLLATE\s+BINARY\b/gi, '');

  // Boolean-ish integer literals.
  out = out.replace(/\b(is_cover|is_read)\s*=\s*1\b/g, '$1 = true');
  out = out.replace(/\b(is_cover|is_read)\s*=\s*0\b/g, '$1 = false');
  out = out.replace(/\(\s*is_cover\s*=\s*true\s*\)/g, '(is_cover = true)');

  // Empty-string checks on optional text columns are NULL-safe in SQLite-ese.
  out = out.replace(/(\w+(?:\.\w+)?)\s*!=\s*''/g, '$1 is not null and $1 <> \'\'');
  out = out.replace(/(\w+(?:\.\w+)?)\s*=\s*''/g, "coalesce($1, '') = ''");

  // Positional placeholders.
  let i = 0;
  out = out.replace(/\?/g, () => `$${++i}`);

  return out;
}

/** Convert a JS value into something `pg` accepts, matching SQLite storage. */
export function toParam(value) {
  if (value === undefined) return null;
  if (typeof value === 'boolean') return value;
  return value;
}

export function mapParams(params = []) {
  return params.map(toParam);
}

