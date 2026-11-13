// ============================================================================
// ZK-SONG — storage selector
//
//   local     server/uploads/**        → Express, Docker, Render, Fly (volume)
//   supabase  Supabase Storage bucket  → Vercel, Netlify, Supabase Edge
//
// The API only ever stores and returns **relative storage keys**
// (`audio/<file>.wav`, `thumbnails/<file>.svg`). Express turns them into
// `/uploads/...` URLs, serverless rewrites them to the bucket's CDN URL, so the
// same database row renders correctly on every runtime.
// ============================================================================

import path from 'node:path';
import { getAppRoot } from '../paths.js';
import { createLocalStorage, FOLDERS } from './local.js';
import { createSupabaseStorage } from './supabase.js';

export { FOLDERS };

export function resolveStorageKind(env = process.env) {
  if (env.ZK_STORAGE) return env.ZK_STORAGE;
  const hasSupabase = Boolean(
    (env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL) &&
      (env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY)
  );
  if (hasSupabase) return 'supabase';
  return 'local';
}

export function createStorage(env = process.env) {
  const kind = resolveStorageKind(env);

  if (kind === 'supabase') {
    return createSupabaseStorage({
      url: env.SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL,
      serviceKey: env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SERVICE_KEY,
      bucket: env.SUPABASE_BUCKET || 'media',
    });
  }

  if (kind === 'local') {
    const root = env.UPLOADS_DIR || path.join(getAppRoot(), 'server', 'uploads');
    return createLocalStorage({ root });
  }

  throw new Error(
    `Unsupported ZK_STORAGE "${kind}". Use "local" or "supabase".`
  );
}

let singleton = null;

/** Memoised per container so the Supabase client and dir checks run once. */
export function getStorage() {
  if (!singleton) singleton = createStorage();
  return singleton;
}

export function __resetStorageForTests() {
  singleton = null;
}

export { createLocalStorage, createSupabaseStorage };
