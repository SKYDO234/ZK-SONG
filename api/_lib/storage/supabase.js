// ============================================================================
// ZK-SONG — storage driver: Supabase Storage
//
// Why this exists: Vercel caps request AND response bodies at 4.5 MB and Netlify
// at 6 MB, while ZK-SONG accepts 120 MB audio masters. Proxying those bytes
// through a function is impossible, so the browser uploads **straight to the
// bucket** with a short-lived signed upload URL, and playback/streaming is
// served by the storage CDN (which supports HTTP Range natively).
//
// Everything below is plain REST — no SDK, ~2 dependencies fewer.
//   POST /storage/v1/object/upload/sign/<bucket>/<path>   → { url, token }
//   PUT  <storage>/v1/object/upload/sign/<bucket>/<path>?token=...  (from browser)
//   GET  <storage>/v1/object/<bucket>/<path>              (via CDN/public URL)
// ============================================================================

const ALLOWED_FOLDERS = ['audio', 'thumbnails', 'videos', 'avatars', 'branding'];

export function createSupabaseStorage({
  url,
  serviceKey,
  bucket = process.env.SUPABASE_BUCKET || 'media',
  fetchImpl = fetch,
}) {
  const base = String(url || '').replace(/\/+$/, '');
  const storageBase = `${base}/storage/v1`;
  const key = String(serviceKey || '');

  const authHeaders = {
    apikey: key,
    Authorization: `Bearer ${key}`,
  };

  const cleanKey = (objectKey) => String(objectKey).replace(/^\/+/, '');

  async function api(pathname, init = {}) {
    const res = await fetchImpl(`${storageBase}${pathname}`, {
      ...init,
      headers: { ...authHeaders, ...(init.headers || {}) },
    });
    const text = await res.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text };
    }
    if (!res.ok) {
      const message =
        body?.message || body?.error || `Supabase Storage request failed (${res.status})`;
      const error = new Error(message);
      error.status = res.status;
      error.body = body;
      throw error;
    }
    return body;
  }

  return {
    kind: 'supabase',
    supportsSignedUploads: true,
    folders: ALLOWED_FOLDERS,
    bucket,

    /** Permanent, cacheable CDN URL for a stored object. */
    publicUrl(objectKey) {
      return `${storageBase}/object/public/${bucket}/${cleanKey(objectKey)}`;
    },

    async exists(objectKey) {
      const res = await fetchImpl(this.publicUrl(objectKey), { method: 'HEAD', headers: authHeaders });
      return res.ok;
    },

    /**
     * Mint a signed upload URL the browser can PUT to directly.
     * Returns { uploadUrl, token, path, publicUrl }.
     */
    async createSignedUpload(objectKey, { upsert = false } = {}) {
      await this.ensureBucket();
      const objectPath = cleanKey(objectKey);
      const body = await api(`/object/upload/sign/${bucket}/${objectPath}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-upsert': upsert ? 'true' : 'false',
        },
        body: JSON.stringify({}),
      });

      const relative = body?.url || '';
      if (!relative) throw new Error('Supabase did not return an upload URL.');
      // The API returns "/object/upload/sign/<bucket>/<path>?token=..." which is
      // relative to the storage mount point.
      const uploadUrl = relative.startsWith('http')
        ? relative
        : `${storageBase}${relative.startsWith('/') ? '' : '/'}${relative}`;

      return {
        uploadUrl,
        token: body?.token || '',
        path: objectPath,
        publicUrl: this.publicUrl(objectPath),
      };
    },

    async receiveFile({ key: objectKey, stream, contentType }) {
      await this.ensureBucket();
      const objectPath = cleanKey(objectKey);
      // Buffer in memory only for small server-side writes (logo/branding).
      const chunks = [];
      let size = 0;
      for await (const chunk of stream) {
        size += chunk.length;
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const res = await fetchImpl(`${storageBase}/object/${bucket}/${objectPath}`, {
        method: 'POST',
        headers: {
          ...authHeaders,
          'Content-Type': contentType || 'application/octet-stream',
          'x-upsert': 'true',
          'cache-control': 'max-age=31536000',
        },
        body: buffer,
      });
      if (!res.ok) {
        throw new Error(`Supabase upload failed (${res.status}): ${await res.text()}`);
      }
      return { size };
    },

    async remove(objectKey) {
      const objectPath = cleanKey(objectKey);
      try {
        await api(`/object/${bucket}/${objectPath}`, { method: 'DELETE' });
        return true;
      } catch (err) {
        if (err.status === 404) return false;
        throw err;
      }
    },

    async stat(objectKey) {
      const res = await fetchImpl(this.publicUrl(objectKey), { method: 'HEAD' });
      if (!res.ok) return null;
      return { size: Number(res.headers.get('content-length') || 0) };
    },

    /**
     * Make sure the bucket exists and is publicly readable.
     * Runs once per container; safe to call before every upload.
     */
    async ensureBucket() {
      if (!this._bucketReady) {
        this._bucketReady = (async () => {
          const body = {
            public: true,
            allowedMimeTypes: null,
            fileSizeLimit: String(Number(process.env.MAX_UPLOAD_MB || 120) * 1024 * 1024),
          };
          try {
            // Does it already exist?
            await api(`/bucket/${bucket}`, { method: 'GET' });
            await api(`/bucket/${bucket}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            });
          } catch (err) {
            if (err.status !== 404 && err.status !== 400) throw err;
            // Create it (first deploy).
            await api('/bucket', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: bucket, name: bucket, ...body }),
            });
          }
        })().catch((err) => {
          this._bucketReady = null;
          console.warn('[ZK-SONG] Could not prepare the storage bucket:', err.message);
        });
      }
      return this._bucketReady;
    },

    /** @deprecated kept for callers from the earlier API */
    async ensurePublicReadPolicy() {
      return this.ensureBucket();
    },
  };
}

/** Signed-URL helper for private reads (kept for parity with Supabase docs). */
export async function createSignedDownloadUrl({ url, serviceKey, bucket = 'media', objectKey, expiresIn = 3600 }) {
  const storageBase = `${String(url).replace(/\/+$/, '')}/storage/v1`;
  const res = await fetch(`${storageBase}/object/sign/${bucket}/${objectKey}`, {
    method: 'POST',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ expiresIn }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body?.message || 'Could not sign download URL');
  return `${storageBase}${body.signedURL}`;
}
