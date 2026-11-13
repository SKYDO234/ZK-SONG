// ============================================================================
// ZK-SONG — Express backend (npm start / npm run dev / Docker / VPS)
//
// Since the API moved into api/_lib (so it can also run as a Vercel or Netlify
// function), this file is only the *host*: CORS, body delegation, static assets,
// SPA fallback and the HTTP listener. Every route lives in api/_lib/app.js, so
// the self-hosted server and the serverless deployments can never drift apart.
//
// Storage/database are chosen from the environment:
//   no DATABASE_URL  → SQLite in server/data + files in server/uploads  (default)
//   DATABASE_URL set → Postgres + Supabase Storage (same as serverless)
// ============================================================================

const express = require('express');
const path = require('path');
const fs = require('fs');
const { generateTrackMedia } = require('./generateMedia');

(async () => {
  // Branding assets (logo) live on local disk; skip on serverless storage.
  if (!process.env.SUPABASE_URL || process.env.ZK_STORAGE === 'local') {
    try {
      generateTrackMedia();
    } catch (err) {
      console.warn('[ZK-SONG] Could not prepare local media assets:', err.message);
    }
  }

  const { handleNodeRequest } = await import('../api/_lib/runtime.js');
  const { setBusboy } = await import('../api/_lib/multipart.js');
  setBusboy(require('busboy'));

  const app = express();
  const PORT = process.env.PORT || 4000;

  // CORS + bodies are handled inside the shared runtime, which keeps the
  // multipart parser in one place for all three deployment targets.
  app.disable('x-powered-by');

  // Everything (API, /uploads media, health) goes through the shared handler.
  app.use((req, res, next) => {
    handleNodeRequest(req, res, { prefix: '' })
      .then((result) => {
        if (!result.handled) next();
      })
      .catch(next);
  });

  // Built frontend (only present after `npm run build`)
  const distPath = path.join(__dirname, '..', 'dist');
  if (!fs.existsSync(distPath)) {
    console.warn(
      '[ZK-SONG] No dist/ build found — the API is running, but the website is not. ' +
        'Run `npm run build` and restart to serve the site from this server.'
    );
  } else {
    app.use(
      express.static(distPath, {
        index: false,
        maxAge: '1y',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('index.html')) res.setHeader('Cache-Control', 'no-cache');
        },
      })
    );
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/uploads')) return next();
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.use((req, res) => {
    res.status(404).json({ error: 'Not found', path: req.path });
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error('[ZK-SONG] Unhandled error:', err);
    if (res.headersSent) return res.end();
    res.status(500).json({ error: err.message || 'Internal server error' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    const mode =
      process.env.DATABASE_URL || process.env.POSTGRES_URL ? 'postgres + object storage' : 'sqlite + local disk';
    console.log(`🎵 ZK-SONG API & streaming server on http://0.0.0.0:${PORT}  (${mode})`);
    if (process.env.NODE_ENV === 'production' && !process.env.JWT_SECRET) {
      console.warn('[ZK-SONG] WARNING: JWT_SECRET is not set. Set it in production.');
    }
  });
})();
