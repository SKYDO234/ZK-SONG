// ============================================================================
// ZK-SONG — Vercel Function entry point
//
// Every /api/* request (see the rewrite in vercel.json) lands here. The function
// boots a Postgres pool + Supabase Storage client once per container and then
// serves the shared API from ../api/_lib.
//
// Requirements (Vercel → Project → Settings → Environment Variables):
//   DATABASE_URL              postgres://…  (Supabase, Neon, Vercel Postgres)
//   SUPABASE_URL              https://<ref>.supabase.co
//   SUPABASE_SERVICE_ROLE_KEY service_role key (Storage writes)
//   JWT_SECRET                long random string
//   ADMIN_EMAIL / ADMIN_PASSWORD
// ============================================================================

import { handleNodeRequest } from '../api/_lib/runtime.js';

export default async function handler(req, res) {
  // Vercel rewrites preserve the original /api/... path, so no prefix stripping.
  const result = await handleNodeRequest(req, res, { prefix: '' });
  if (!result.handled) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Not found', code: 'API_ROUTE_NOT_FOUND' }));
  }
}

export const config = {
  // Streams responses, so redirects/range requests are not buffered by the
  // 4.5 MB response limit.
  api: { bodyParser: false },
};
