// ============================================================================
// ZK-SONG — multipart/form-data parser (busboy, streaming)
//
// Two upload paths share this parser:
//   local storage → each file part is piped straight to disk (any size)
//   Supabase      → only small parts arrive here (logo/avatar); big audio goes
//                   browser → bucket via a signed URL and never touches us
// ============================================================================

export function parseMultipart(nodeRequest, storage, { limits = {} } = {}) {
  return new Promise((resolve, reject) => {
    let busboy;
    try {
      busboy = busboyFactory({
        headers: nodeRequest.headers,
        limits: {
          fileSize: limits.fileSize || 120 * 1024 * 1024,
          files: limits.files || 6,
          fields: limits.fields || 40,
          parts: 60,
        },
      });
    } catch (err) {
      reject(
        Object.assign(new Error('Expected a multipart/form-data upload request.'), { status: 400 })
      );
      return;
    }

    const fields = {};
    const files = {};
    const pending = [];
    let aborted = false;

    const fail = (err) => {
      if (aborted) return;
      aborted = true;
      reject(err);
    };

    busboy.on('field', (name, value) => {
      // Repeated keys collapse to arrays, like express's urlencoded parser.
      if (fields[name] === undefined) fields[name] = value;
      else if (Array.isArray(fields[name])) fields[name].push(value);
      else fields[name] = [fields[name], value];
    });

    busboy.on('file', (name, stream, info) => {
      const filename = String(info.filename || '');
      if (!filename) {
        stream.resume(); // empty file input
        return;
      }
      const ext = (filename.match(/\.[a-z0-9]+$/i)?.[0] || '.bin').toLowerCase();
      const mime = info.mimeType || 'application/octet-stream';

      // Reject bad types before a single byte reaches storage.
      const invalid = validateUpload(name, filename, mime);
      if (invalid) {
        stream.resume(); // drain so busboy can finish
        fail(Object.assign(new Error(invalid), { status: 400 }));
        return;
      }

      const folder = folderForField(name);
      const safeBase = basename(filename, ext);
      const storedName = `${safeBase}-${Date.now()}-${Math.random()
        .toString(16)
        .slice(2, 8)}${ext}`;
      const objectKey = `${folder}/${storedName}`;

      const entry = {
        field: name,
        filename: storedName,
        originalFilename: filename,
        mimetype: mime,
        size: 0,
        folder,
        key: objectKey,
        publicUrl: storage.publicUrl(objectKey),
      };

      files[name] = entry;

      // Local disk: stream at full speed. Supabase: buffer (small assets only).
      const write = storage.receiveFile({
        key: objectKey,
        stream,
        contentType: mime,
        filename,
      });

      stream.on('data', (chunk) => {
        entry.size += chunk.length;
      });

      const done = write
        .then((res) => {
          if (res && typeof res.size === 'number' && res.size > 0) entry.size = res.size;
          return entry;
        })
        .catch((err) => {
          fail(err);
          throw err;
        });

      pending.push(done);
    });

    busboy.on('partsLimit', () => fail(Object.assign(new Error('Too many form parts.'), { status: 400 })));
    busboy.on('filesLimit', () => fail(Object.assign(new Error('Too many files.'), { status: 400 })));
    busboy.on('error', (err) => fail(Object.assign(err, { status: 400 })));

    busboy.on('close', () => {
      if (aborted) return;
      Promise.all(pending)
        .then(() => resolve({ fields, files }))
        .catch((err) => fail(err));
    });

    nodeRequest.on('aborted', () => fail(Object.assign(new Error('Upload aborted.'), { status: 400 })));
    nodeRequest.pipe(busboy);
  });
}

/** Which storage folder a form field belongs to. */
export function folderForField(field) {
  switch (field) {
    case 'audio':
      return 'audio';
    case 'thumbnail':
      return 'thumbnails';
    case 'video':
      return 'videos';
    case 'avatar':
      return 'avatars';
    case 'logo':
      return 'branding';
    default:
      return 'audio';
  }
}

function basename(filename, ext) {
  const base = filename.slice(0, filename.length - ext.length);
  return (
    base
      .toLowerCase()
      .replace(/[^a-z0-9-_]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 32) || 'media'
  );
}

/** Extension / MIME validation per field, mirroring the Express multer filter. */
export function validateUpload(field, filename, mimetype) {
  const ext = (String(filename).match(/\.[a-z0-9]+$/i)?.[0] || '').toLowerCase();
  const audio = ['.mp3', '.wav', '.ogg', '.flac', '.m4a', '.aac', '.webm'];
  const image = ['.png', '.jpg', '.jpeg', '.webp', '.svg', '.gif'];
  const video = ['.mp4', '.webm', '.mov', '.ogg', '.mkv'];

  if (field === 'audio') {
    if (!audio.includes(ext) && !String(mimetype).startsWith('audio/')) {
      return 'Invalid audio file format. Allowed: MP3, WAV, OGG, FLAC, M4A, AAC.';
    }
  } else if (field === 'thumbnail' || field === 'avatar' || field === 'logo') {
    if (!image.includes(ext) && !String(mimetype).startsWith('image/')) {
      return 'Invalid image format. Allowed: PNG, JPG, WEBP, SVG, GIF.';
    }
  } else if (field === 'video') {
    if (!video.includes(ext) && !String(mimetype).startsWith('video/')) {
      return 'Invalid video format. Allowed: MP4, WEBM, MOV.';
    }
  }
  return null;
}

// busboy is CommonJS; the runtime entry points inject it so ESM/CJS interop is
// handled once, at the edge of the app.
let cachedBusboy = null;
export function setBusboy(mod) {
  cachedBusboy = mod;
}
function busboyFactory(opts) {
  if (!cachedBusboy) throw new Error('busboy was not registered (call setBusboy first)');
  return cachedBusboy(opts);
}
