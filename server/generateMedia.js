const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const UPLOADS_DIR = path.join(__dirname, 'uploads');
const DIRS = ['audio', 'thumbnails', 'videos', 'avatars', 'branding'];

for (const d of DIRS) {
  fs.mkdirSync(path.join(UPLOADS_DIR, d), { recursive: true });
}

function getFfmpegPath() {
  try {
    const out = execFileSync('python3', ['-c', 'import imageio_ffmpeg; print(imageio_ffmpeg.get_ffmpeg_exe())'], {
      encoding: 'utf8',
    }).trim();
    if (out && fs.existsSync(out)) return out;
  } catch (e) {
    // fallback
  }
  return null;
}

// Generate a stereo WAV buffer with rich musical synth chords, melody, bass, and kick/hihat
function generateBrandingLogo() {
  const logoSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="200" height="200">
    <defs>
      <linearGradient id="zkGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#8b5cf6" />
        <stop offset="50%" stop-color="#ec4899" />
        <stop offset="100%" stop-color="#06b6d4" />
      </linearGradient>
      <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="6" result="blur" />
        <feComposite in="SourceGraphic" in2="blur" operator="over" />
      </filter>
    </defs>
    <rect width="200" height="200" rx="44" fill="#09090b" />
    <rect x="6" y="6" width="188" height="188" rx="40" fill="none" stroke="url(#zkGrad)" stroke-width="6" />
    <g filter="url(#glow)" fill="url(#zkGrad)">
      <rect x="42" y="75" width="14" height="50" rx="7" />
      <rect x="68" y="48" width="14" height="104" rx="7" />
      <rect x="94" y="32" width="14" height="136" rx="7" />
      <rect x="120" y="56" width="14" height="88" rx="7" />
      <rect x="146" y="80" width="14" height="40" rx="7" />
    </g>
  </svg>`;
  fs.writeFileSync(path.join(UPLOADS_DIR, 'branding', 'zk-logo.svg'), logoSvg, 'utf8');
}

function generateTrackMedia() {
  // Only first-party branding assets are created on boot.
  // No demo artists, tracks, covers or music videos are seeded — the catalogue
  // is populated exclusively through real uploads from the platform.
  generateBrandingLogo();
}

if (require.main === module) {
  console.log('Generating studio media assets for ZK-SONG...');
  generateTrackMedia();
  console.log('Done generating media assets!');
}

module.exports = {
  generateTrackMedia,
  generateBrandingLogo,
  getFfmpegPath,
};
