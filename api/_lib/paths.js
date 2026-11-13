// ============================================================================
// ZK-SONG — path resolution that survives every bundler
//
// Modules need to know where the repository root is (SQLite file, uploads/,
// public/ assets). `import.meta.url` is the natural way to do that, but it is
// rewritten/undefined when Vercel bundles the function to CommonJS.
//
// So: prefer the working directory (stable on Vercel, Docker and systemd), and
// only fall back to import.meta.url when the cwd clearly is not the app root.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';

/** True when `dir` looks like a ZK-SONG checkout (or a deployed build of one). */
function looksLikeAppRoot(dir) {
  if (!dir) return false;
  try {
    return (
      fs.existsSync(path.join(dir, 'package.json')) &&
      (fs.existsSync(path.join(dir, 'server')) || fs.existsSync(path.join(dir, 'api')))
    );
  } catch {
    return false;
  }
}

/**
 * Repository/application root.
 * On Vercel the bundle runs from `/var/task` with the whole project present.
 */
export function getAppRoot() {
  const cwd = (() => {
    try {
      return process.cwd();
    } catch {
      return null;
    }
  })();
  if (looksLikeAppRoot(cwd)) return cwd;
  if (looksLikeAppRoot('/var/task')) return '/var/task';

  // Local ESM execution: api/_lib/paths.js → repository root
  try {
    const url = import.meta.url;
    if (url) {
      const here = path.dirname(new URL(url).pathname);
      const root = path.resolve(here, '..', '..');
      if (looksLikeAppRoot(root)) return root;
    }
  } catch {
    /* bundler rewrote import.meta — ignore */
  }

  return cwd || process.cwd();
}

/** Static asset roots (source checkout and built app). */
export function getStaticRoots() {
  const root = getAppRoot();
  return [path.join(root, 'public'), path.join(root, 'dist')];
}
