// ============================================================================
// ZK-SONG — storage driver: local disk
//
// Used by the Express backend, Docker and any host with a persistent volume.
// Files land in server/uploads/<folder>/ exactly where they always have, so
// existing /uploads/<folder>/<filename> links keep resolving.
// ============================================================================

import fs from 'node:fs';
import path from 'node:path';

const FOLDERS = ['audio', 'thumbnails', 'videos', 'avatars', 'branding'];

export function createLocalStorage({ root }) {
  for (const folder of FOLDERS) {
    fs.mkdirSync(path.join(root, folder), { recursive: true });
  }

  const resolve = (key) => {
    const [folder, ...rest] = String(key).split('/');
    if (!FOLDERS.includes(folder)) throw new Error(`Invalid media folder: ${folder}`);
    const file = path.basename(rest.join('/'));
    return path.join(root, folder, file);
  };

  return {
    kind: 'local',
    supportsSignedUploads: false,
    folders: FOLDERS,

    publicUrl(key) {
      return `/uploads/${String(key).split('/').map(encodeURIComponent).join('/')}`;
    },

    exists(key) {
      return fs.existsSync(resolve(key));
    },

    /** Stream an incoming multipart part to disk. */
    async receiveFile({ key, stream }) {
      const target = resolve(key);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      let size = 0;
      await new Promise((resolve_, reject) => {
        const out = fs.createWriteStream(target);
        stream.on('data', (chunk) => {
          size += chunk.length;
        });
        stream.on('error', reject);
        out.on('error', reject);
        out.on('finish', resolve_);
        stream.pipe(out);
      });
      return { size };
    },

    async remove(key) {
      const target = resolve(key);
      if (fs.existsSync(target)) fs.unlinkSync(target);
      return true;
    },

    async stat(key) {
      const target = resolve(key);
      if (!fs.existsSync(target)) return null;
      const s = fs.statSync(target);
      return { size: s.size };
    },

    async createSignedUpload() {
      throw new Error('Signed uploads require object storage (Supabase).');
    },

    /** Local absolute path, used for Range requests and res.download(). */
    absolutePath(key) {
      return resolve(key);
    },
  };
}

export { FOLDERS };
