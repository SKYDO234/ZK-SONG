// ============================================================================
// ZK-SONG — upload transport
//
// Two transports, chosen automatically from what the API reports:
//
//   1. multipart  (Express / Docker / VPS)
//        browser ──file──► /api/user/songs        (streamed to local disk)
//
//   2. direct     (Vercel / Netlify serverless)
//        browser ──metadata──► /api/uploads/sign   → signed URL
//        browser ──file──────► Supabase Storage    (bypasses the 4.5 MB cap)
//        browser ──keys──────► /api/user/songs
//
// Both end up as the same database row, so the UI and API v1 are unchanged.
// ============================================================================

import { withApiBase } from './apiBase';
import { readJson } from './http';

/**
 * Ask the API how uploads should be performed.
 * Cached for the session; failures fall back to multipart (always available).
 */
let capabilityPromise = null;

export function getUploadCapability(force = false) {
  if (!capabilityPromise || force) {
    capabilityPromise = fetch(withApiBase('/api/uploads/config'))
      .then(async (res) => (res.ok ? readJson(res, null) : null))
      .then((json) =>
        json && typeof json === 'object'
          ? { direct: Boolean(json.direct_upload), maxMb: json.max_upload_mb || 120 }
          : { direct: false, maxMb: 120 }
      )
      .catch(() => ({ direct: false, maxMb: 120 }));
  }
  return capabilityPromise;
}

/** Reset the cached capability (after a redeploy / settings change). */
export function resetUploadCapability() {
  capabilityPromise = null;
}

/**
 * PUT a file straight into object storage using a signed URL.
 * Reports progress via onProgress(0..100).
 */
export function putSignedFile(uploadUrl, file, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('x-upsert', 'true');
    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (evt) => {
        if (evt.lengthComputable) onProgress(Math.round((evt.loaded / evt.total) * 100));
      };
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve({ ok: true });
      else reject(new Error(`Storage upload failed (${xhr.status}). Please try again.`));
    };
    xhr.onerror = () => reject(new Error('Network error while uploading to storage.'));
    xhr.send(file);
  });
}

/**
 * Upload one file and return its storage key.
 * @param {FormData-aware} authFetch app fetch wrapper (adds the JWT)
 */
export async function uploadAsset({ authFetch, file, field, onProgress }) {
  const capability = await getUploadCapability();

  if (!capability.direct) {
    return { direct: false, capability };
  }

  // 1. Ask for a signed upload URL.
  const signRes = await authFetch('/api/uploads/sign', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ field, filename: file.name, size: file.size }),
  });
  const signJson = await readJson(signRes, {});
  if (!signRes.ok) {
    throw new Error(signJson.error || 'Could not prepare the upload.');
  }

  // 2. Send the bytes straight to storage — never through the API function.
  await putSignedFile(signJson.upload.url, file, onProgress);

  return {
    direct: true,
    capability,
    key: signJson.upload.key,
    publicUrl: signJson.upload.public_url,
  };
}

/** Build multipart body the classic way (local/Docker/VPS deployments). */
export function buildMultipart(fields, files = {}) {
  const fd = new FormData();
  Object.entries(fields).forEach(([k, v]) => {
    if (v !== undefined && v !== null) fd.append(k, String(v));
  });
  Object.entries(files).forEach(([k, v]) => {
    if (v) fd.append(k, v);
  });
  return fd;
}
