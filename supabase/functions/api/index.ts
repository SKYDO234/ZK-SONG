// ============================================================================
// ZK-SONG — Supabase Edge Function (Deno) entry point
//
// ZK-SONG no longer keeps a fork of the API per runtime: the single
// implementation lives in api/_lib and runs on Express, Vercel and Netlify.
//
// The supported Supabase topology is:
//   • Supabase = Postgres database + Storage bucket
//   • API      = Vercel Function (api/index.js) or Netlify Function
//               (netlify/functions/api.mjs), pointed at that same project
//
// See DEPLOYMENT.md ("Shape B" / "Shape C"). If you specifically need the API to
// execute *inside* Supabase, deploy the Netlify function file with the Deno
// adapter of your choice — but do not maintain a second copy of the routes here,
// because it would drift from api/_lib/app.js.
// ============================================================================

Deno.serve(() =>
  new Response(
    JSON.stringify({
      status: 'error',
      code: 'USE_VERCEL_OR_NETLIFY_FUNCTION',
      message:
        'The ZK-SONG API now ships as api/index.js (Vercel) and netlify/functions/api.mjs. Supabase provides the Postgres database and the Storage bucket; see DEPLOYMENT.md.',
    }),
    { status: 410, headers: { 'Content-Type': 'application/json' } }
  )
);
