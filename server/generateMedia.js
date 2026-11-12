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
function createMusicalWavBuffer({ durationSec = 18, bpm = 120, rootFreq = 220, chordType = 'minor', style = 'synthwave' }) {
  const sampleRate = 44100;
  const numSamples = sampleRate * durationSec;
  const numChannels = 2;
  const bytesPerSample = 2;
  const dataSize = numSamples * numChannels * bytesPerSample;
  const buffer = Buffer.alloc(44 + dataSize);

  // WAV Header
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16); // PCM
  buffer.writeUInt16LE(1, 20);  // AudioFormat 1
  buffer.writeUInt16LE(numChannels, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * numChannels * bytesPerSample, 28);
  buffer.writeUInt16LE(numChannels * bytesPerSample, 32);
  buffer.writeUInt16LE(16, 34); // BitsPerSample
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);

  const progressions = {
    minor: [
      [0, 3, 7, 10],
      [-4, 0, 3, 7],
      [-2, 2, 5, 9],
      [-5, -1, 2, 7],
    ],
    major: [
      [0, 4, 7, 11],
      [-3, 0, 4, 7],
      [-7, -3, 0, 4],
      [-5, -1, 2, 5],
    ],
    cyber: [
      [0, 3, 7, 12],
      [2, 5, 9, 14],
      [-2, 1, 5, 10],
      [-4, 0, 3, 8],
    ],
    lofi: [
      [0, 3, 7, 10, 14],
      [-5, -2, 2, 5, 9],
      [-4, 0, 3, 7, 11],
      [-2, 1, 5, 8, 12],
    ],
  };

  const prog = progressions[chordType] || progressions.minor;
  const beatDur = 60 / bpm;
  const barDur = beatDur * 4;

  const semiToFreq = (base, semi) => base * Math.pow(2, semi / 12);

  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const barIndex = Math.floor(t / barDur) % prog.length;
    const chord = prog[barIndex];

    const beatPos = (t % beatDur) / beatDur;
    const sixteenthIndex = Math.floor((t % barDur) / (beatDur / 4));
    const sixteenthPos = (t % (beatDur / 4)) / (beatDur / 4);

    let padL = 0;
    let padR = 0;
    for (let c = 0; c < chord.length; c++) {
      const f = semiToFreq(rootFreq, chord[c]);
      const detune = 1 + (c - 1.5) * 0.0025;
      padL += Math.sin(2 * Math.PI * f * t) * 0.14;
      padR += Math.sin(2 * Math.PI * f * detune * t + 0.4) * 0.14;
    }

    const arpNoteSemi = chord[sixteenthIndex % chord.length] + (sixteenthIndex % 2 === 0 ? 12 : 0);
    const arpFreq = semiToFreq(rootFreq, arpNoteSemi);
    const arpEnv = Math.exp(-sixteenthPos * (style === 'lofi' ? 4.0 : 6.5));
    const arpWave =
      (Math.sin(2 * Math.PI * arpFreq * t) + 0.35 * Math.sin(2 * Math.PI * arpFreq * 2 * t)) * arpEnv * 0.22;

    const bassFreq = semiToFreq(rootFreq / 2, chord[0]);
    const bassEnv = 0.65 + 0.35 * Math.cos(Math.PI * beatPos);
    const bassWave = Math.tanh(Math.sin(2 * Math.PI * bassFreq * t) * 1.8) * bassEnv * 0.28;

    const beatInBar = Math.floor((t % barDur) / beatDur);
    let drum = 0;
    if (beatPos < 0.25) {
      const kickPitch = 52 + 110 * Math.exp(-beatPos * 28);
      const kickEnv = Math.exp(-beatPos * 14);
      drum += Math.sin(2 * Math.PI * kickPitch * beatPos * beatDur) * kickEnv * 0.38;
    }
    if ((beatInBar === 1 || beatInBar === 3) && beatPos < 0.2) {
      const snareEnv = Math.exp(-beatPos * 22);
      const noise = (Math.sin(i * 12.9898) * 43758.5453) % 1;
      drum += noise * snareEnv * 0.22;
    }

    let masterEnv = 1.0;
    if (t < 0.8) masterEnv = t / 0.8;
    else if (t > durationSec - 1.2) masterEnv = Math.max(0, (durationSec - t) / 1.2);

    const pan = Math.sin(2 * Math.PI * 0.5 * t) * 0.3;
    const left = Math.max(-0.98, Math.min(0.98, (padL + arpWave * (0.7 + pan) + bassWave + drum) * masterEnv));
    const right = Math.max(-0.98, Math.min(0.98, (padR + arpWave * (0.7 - pan) + bassWave + drum) * masterEnv));

    const offset = 44 + i * 4;
    buffer.writeInt16LE(Math.floor(left * 32767), offset);
    buffer.writeInt16LE(Math.floor(right * 32767), offset + 2);
  }

  return buffer;
}

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

function generateAvatars() {
  const avatars = [
    { file: 'avatar-admin.svg', initials: 'ZK', c1: '#8b5cf6', c2: '#ec4899' },
    { file: 'avatar-aria.svg', initials: 'AV', c1: '#06b6d4', c2: '#8b5cf6' },
    { file: 'avatar-kael.svg', initials: 'KR', c1: '#f59e0b', c2: '#ef4444' },
    { file: 'avatar-lyra.svg', initials: 'LC', c1: '#10b981', c2: '#06b6d4' },
    { file: 'avatar-zayn.svg', initials: 'ZM', c1: '#ec4899', c2: '#6366f1' },
  ];
  for (const a of avatars) {
    const p = path.join(UPLOADS_DIR, 'avatars', a.file);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 160 160" width="160" height="160">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${a.c1}" />
          <stop offset="100%" stop-color="${a.c2}" />
        </linearGradient>
      </defs>
      <rect width="160" height="160" rx="80" fill="url(#g)" />
      <circle cx="80" cy="80" r="72" fill="none" stroke="rgba(255,255,255,0.25)" stroke-width="3" />
      <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#ffffff" font-family="system-ui, sans-serif" font-weight="800" font-size="54">${a.initials}</text>
    </svg>`;
    fs.writeFileSync(p, svg, 'utf8');
  }
}

function generateCoverThumbnail(filename, { title, artist, genre, c1, c2, c3, isCover }) {
  const svgPath = path.join(UPLOADS_DIR, 'thumbnails', filename);
  const shortTitle = title.length > 24 ? title.slice(0, 22) + '…' : title;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c1}" />
        <stop offset="55%" stop-color="${c2}" />
        <stop offset="100%" stop-color="${c3}" />
      </linearGradient>
      <radialGradient id="flare" cx="75%" cy="25%" r="55%">
        <stop offset="0%" stop-color="rgba(255,255,255,0.35)" />
        <stop offset="100%" stop-color="rgba(0,0,0,0)" />
      </radialGradient>
    </defs>
    <rect width="600" height="600" fill="url(#bg)" />
    <rect width="600" height="600" fill="url(#flare)" />
    <circle cx="300" cy="245" r="145" fill="rgba(9,9,11,0.62)" stroke="rgba(255,255,255,0.28)" stroke-width="4" />
    <circle cx="300" cy="245" r="108" fill="none" stroke="rgba(255,255,255,0.14)" stroke-width="2" stroke-dasharray="12 8" />
    <circle cx="300" cy="245" r="70" fill="none" stroke="rgba(255,255,255,0.2)" stroke-width="2" />
    <circle cx="300" cy="245" r="28" fill="${c1}" stroke="#ffffff" stroke-width="4" />
    <rect x="40" y="40" width="160" height="38" rx="19" fill="rgba(9,9,11,0.72)" />
    <text x="120" y="64" text-anchor="middle" fill="#ffffff" font-family="system-ui, sans-serif" font-size="14" font-weight="700" letter-spacing="1">${genre.toUpperCase()}</text>
    ${isCover ? `<rect x="415" y="40" width="145" height="38" rx="19" fill="#f59e0b" /><text x="487" y="64" text-anchor="middle" fill="#09090b" font-family="system-ui, sans-serif" font-size="13" font-weight="800" letter-spacing="1">COVER TRACK</text>` : ''}
    <rect x="34" y="424" width="532" height="140" rx="24" fill="rgba(9,9,11,0.78)" stroke="rgba(255,255,255,0.14)" stroke-width="1.5" />
    <text x="64" y="482" fill="#ffffff" font-family="system-ui, sans-serif" font-size="30" font-weight="800">${shortTitle.replace(/&/g, '&amp;')}</text>
    <text x="64" y="525" fill="rgba(255,255,255,0.78)" font-family="system-ui, sans-serif" font-size="19" font-weight="600">${artist.replace(/&/g, '&amp;')} • ZK-SONG MASTER</text>
  </svg>`;

  fs.writeFileSync(svgPath, svg, 'utf8');
}

function generateTrackMedia() {
  generateBrandingLogo();
  generateAvatars();

  const ffmpeg = getFfmpegPath();

  const tracks = [
    {
      audioFile: 'neon-odyssey.mp3',
      thumbFile: 'neon-odyssey.svg',
      videoFile: 'neon-odyssey.mp4',
      title: 'Neon Odyssey',
      artist: 'Aria Vance',
      genre: 'Synthwave',
      durationSec: 20,
      bpm: 124,
      rootFreq: 220,
      chordType: 'cyber',
      style: 'synthwave',
      c1: '#7c3aed',
      c2: '#db2777',
      c3: '#0f172a',
      isCover: false,
      hasVideo: true,
    },
    {
      audioFile: 'cybernetic-horizon.mp3',
      thumbFile: 'cybernetic-horizon.svg',
      videoFile: 'cybernetic-horizon.mp4',
      title: 'Cybernetic Horizon',
      artist: 'Aria Vance',
      genre: 'Electronic',
      durationSec: 18,
      bpm: 128,
      rootFreq: 246.94,
      chordType: 'minor',
      style: 'synthwave',
      c1: '#06b6d4',
      c2: '#3b82f6',
      c3: '#1e1b4b',
      isCover: false,
      hasVideo: true,
    },
    {
      audioFile: 'starlight-echoes-cover.mp3',
      thumbFile: 'starlight-echoes-cover.svg',
      videoFile: '',
      title: 'Starlight Echoes (Cover)',
      artist: 'Aria Vance',
      genre: 'Dream Pop',
      durationSec: 16,
      bpm: 110,
      rootFreq: 261.63,
      chordType: 'major',
      style: 'lofi',
      c1: '#ec4899',
      c2: '#8b5cf6',
      c3: '#09090b',
      isCover: true,
      hasVideo: false,
    },
    {
      audioFile: 'velvet-midnight.mp3',
      thumbFile: 'velvet-midnight.svg',
      videoFile: '',
      title: 'Velvet Midnight',
      artist: 'Aria Vance',
      genre: 'Chillwave',
      durationSec: 19,
      bpm: 105,
      rootFreq: 196.0,
      chordType: 'lofi',
      style: 'lofi',
      c1: '#4f46e5',
      c2: '#0ea5e9',
      c3: '#09090b',
      isCover: false,
      hasVideo: false,
    },
    {
      audioFile: 'solar-flare-protocol.mp3',
      thumbFile: 'solar-flare-protocol.svg',
      videoFile: 'solar-flare-protocol.mp4',
      title: 'Solar Flare Protocol',
      artist: 'Kaelen Rivera',
      genre: 'Progressive House',
      durationSec: 21,
      bpm: 126,
      rootFreq: 233.08,
      chordType: 'minor',
      style: 'synthwave',
      c1: '#f59e0b',
      c2: '#ef4444',
      c3: '#18181b',
      isCover: false,
      hasVideo: true,
    },
    {
      audioFile: 'tokyo-rain-drift.mp3',
      thumbFile: 'tokyo-rain-drift.svg',
      videoFile: '',
      title: 'Tokyo Rain Drift',
      artist: 'Kaelen Rivera',
      genre: 'Lo-Fi Beats',
      durationSec: 17,
      bpm: 92,
      rootFreq: 207.65,
      chordType: 'lofi',
      style: 'lofi',
      c1: '#10b981',
      c2: '#059669',
      c3: '#042f2e',
      isCover: false,
      hasVideo: false,
    },
    {
      audioFile: 'quantum-bloom.mp3',
      thumbFile: 'quantum-bloom.svg',
      videoFile: '',
      title: 'Quantum Bloom',
      artist: 'Lyra Chen',
      genre: 'Ambient Bass',
      durationSec: 18,
      bpm: 118,
      rootFreq: 277.18,
      chordType: 'major',
      style: 'synthwave',
      c1: '#14b8a6',
      c2: '#6366f1',
      c3: '#0f172a',
      isCover: false,
      hasVideo: false,
    },
    {
      audioFile: 'blinding-pulse-cover.mp3',
      thumbFile: 'blinding-pulse-cover.svg',
      videoFile: 'blinding-pulse-cover.mp4',
      title: 'Blinding Pulse (Synth Cover)',
      artist: 'Kaelen Rivera',
      genre: 'Retrowave',
      durationSec: 18,
      bpm: 132,
      rootFreq: 293.66,
      chordType: 'cyber',
      style: 'synthwave',
      c1: '#e11d48',
      c2: '#7c3aed',
      c3: '#09090b',
      isCover: true,
      hasVideo: true,
    },
    {
      audioFile: 'ethereal-cathedral.mp3',
      thumbFile: 'ethereal-cathedral.svg',
      videoFile: '',
      title: 'Ethereal Cathedral',
      artist: 'Lyra Chen',
      genre: 'Cinematic',
      durationSec: 20,
      bpm: 100,
      rootFreq: 174.61,
      chordType: 'minor',
      style: 'lofi',
      c1: '#8b5cf6',
      c2: '#06b6d4',
      c3: '#020617',
      isCover: false,
      hasVideo: false,
    },
  ];

  for (const t of tracks) {
    generateCoverThumbnail(t.thumbFile, t);

    const audioPath = path.join(UPLOADS_DIR, 'audio', t.audioFile);
    const tempWavPath = path.join(UPLOADS_DIR, 'audio', t.audioFile + '.tmp.wav');
    if (!fs.existsSync(audioPath)) {
      const wavBuf = createMusicalWavBuffer({
        durationSec: t.durationSec,
        bpm: t.bpm,
        rootFreq: t.rootFreq,
        chordType: t.chordType,
        style: t.style,
      });
      if (ffmpeg) {
        fs.writeFileSync(tempWavPath, wavBuf);
        try {
          execFileSync(ffmpeg, [
            '-y',
            '-i',
            tempWavPath,
            '-codec:a',
            'libmp3lame',
            '-b:a',
            '160k',
            audioPath,
          ], { stdio: 'ignore' });
          fs.unlinkSync(tempWavPath);
        } catch (err) {
          fs.renameSync(tempWavPath, audioPath);
        }
      } else {
        fs.writeFileSync(audioPath, wavBuf);
      }
    }

    if (t.hasVideo && t.videoFile && ffmpeg) {
      const videoPath = path.join(UPLOADS_DIR, 'videos', t.videoFile);
      if (!fs.existsSync(videoPath) && fs.existsSync(audioPath)) {
        try {
          execFileSync(
            ffmpeg,
            [
              '-y',
              '-i',
              audioPath,
              '-filter_complex',
              `[0:a]showwaves=s=640x360:mode=cline:rate=24:colors=${t.c1}|${t.c2}:scale=sqrt,format=yuv420p[v]`,
              '-map',
              '[v]',
              '-map',
              '0:a',
              '-t',
              '8',
              '-c:v',
              'libx264',
              '-crf',
              '28',
              '-preset',
              'fast',
              '-pix_fmt',
              'yuv420p',
              '-c:a',
              'aac',
              '-b:a',
              '128k',
              '-shortest',
              videoPath,
            ],
            { stdio: 'ignore' }
          );
        } catch (err) {
          console.error('Video generation fallback for', t.videoFile, err.message);
        }
      }
    }
  }
}

if (require.main === module) {
  console.log('Generating studio media assets for ZK-SONG...');
  generateTrackMedia();
  console.log('Done generating media assets!');
}

module.exports = {
  generateTrackMedia,
  createMusicalWavBuffer,
  generateCoverThumbnail,
  getFfmpegPath,
};
