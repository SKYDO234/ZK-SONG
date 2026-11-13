// Client-side studio media synthesizer for instant testing or creative generation on Upload Song page

export function synthesizeBrowserWavFile({
  title = 'Studio Track',
  durationSec = 14,
  bpm = 122,
  rootFreq = 220,
}) {
  const sampleRate = 44100;
  const numSamples = sampleRate * durationSec;
  const numChannels = 2;
  const bytesPerSample = 2;
  const dataSize = numSamples * numChannels * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeStr = (offset, str) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * bytesPerSample, true);
  view.setUint16(32, numChannels * bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);

  const chords = [
    [0, 3, 7, 10],
    [-4, 0, 3, 7],
    [-2, 2, 5, 9],
    [-5, -1, 2, 7],
  ];
  const beatDur = 60 / bpm;
  const barDur = beatDur * 4;
  const semi = (base, s) => base * Math.pow(2, s / 12);

  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate;
    const barIdx = Math.floor(t / barDur) % chords.length;
    const chord = chords[barIdx];
    const beatPos = (t % beatDur) / beatDur;
    const stepIdx = Math.floor((t % barDur) / (beatDur / 4));
    const stepPos = (t % (beatDur / 4)) / (beatDur / 4);

    let padL = 0;
    let padR = 0;
    for (let c = 0; c < chord.length; c++) {
      const f = semi(rootFreq, chord[c]);
      padL += Math.sin(2 * Math.PI * f * t) * 0.14;
      padR += Math.sin(2 * Math.PI * f * 1.002 * t + 0.3) * 0.14;
    }

    const arpFreq = semi(rootFreq, chord[stepIdx % chord.length] + (stepIdx % 2 === 0 ? 12 : 0));
    const arp = Math.sin(2 * Math.PI * arpFreq * t) * Math.exp(-stepPos * 5.5) * 0.24;

    const bassFreq = semi(rootFreq / 2, chord[0]);
    const bass = Math.tanh(Math.sin(2 * Math.PI * bassFreq * t) * 1.6) * 0.26;

    let kick = 0;
    if (beatPos < 0.22) {
      const kp = 50 + 100 * Math.exp(-beatPos * 26);
      kick = Math.sin(2 * Math.PI * kp * beatPos * beatDur) * Math.exp(-beatPos * 14) * 0.35;
    }

    let env = 1;
    if (t < 0.5) env = t / 0.5;
    else if (t > durationSec - 0.8) env = Math.max(0, (durationSec - t) / 0.8);

    const L = Math.max(-0.98, Math.min(0.98, (padL + arp + bass + kick) * env));
    const R = Math.max(-0.98, Math.min(0.98, (padR + arp + bass + kick) * env));

    view.setInt16(offset, Math.floor(L * 32767), true);
    view.setInt16(offset + 2, Math.floor(R * 32767), true);
    offset += 4;
  }

  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'studio-track';

  return new File([buffer], `${slug}.wav`, { type: 'audio/wav' });
}

export function generateBrowserCoverFile({
  title = 'Untitled Track',
  artist = 'Independent Artist',
  genre = 'Electronic',
  isCover = false,
}) {
  const palettes = [
    ['#7c3aed', '#ec4899', '#09090b'],
    ['#06b6d4', '#3b82f6', '#0f172a'],
    ['#f59e0b', '#ef4444', '#18181b'],
    ['#10b981', '#06b6d4', '#042f2e'],
  ];
  const [c1, c2, c3] = palettes[Math.floor(Math.random() * palettes.length)];
  const safeTitle = (title || 'Untitled Track').slice(0, 24).replace(/&/g, '&amp;');
  const safeArtist = (artist || 'Artist').slice(0, 28).replace(/&/g, '&amp;');
  const safeGenre = (genre || 'Electronic').toUpperCase().replace(/&/g, '&amp;');

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 600" width="600" height="600">
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${c1}" />
        <stop offset="55%" stop-color="${c2}" />
        <stop offset="100%" stop-color="${c3}" />
      </linearGradient>
    </defs>
    <rect width="600" height="600" fill="url(#bg)" />
    <circle cx="300" cy="245" r="145" fill="rgba(9,9,11,0.62)" stroke="rgba(255,255,255,0.28)" stroke-width="4" />
    <circle cx="300" cy="245" r="100" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="2" stroke-dasharray="10 8" />
    <circle cx="300" cy="245" r="28" fill="${c1}" stroke="#ffffff" stroke-width="4" />
    <rect x="40" y="40" width="160" height="38" rx="19" fill="rgba(9,9,11,0.72)" />
    <text x="120" y="64" text-anchor="middle" fill="#ffffff" font-family="system-ui, sans-serif" font-size="14" font-weight="700">${safeGenre}</text>
    ${isCover ? `<rect x="415" y="40" width="145" height="38" rx="19" fill="#f59e0b" /><text x="487" y="64" text-anchor="middle" fill="#09090b" font-family="system-ui, sans-serif" font-size="13" font-weight="800">COVER SONG</text>` : ''}
    <rect x="34" y="424" width="532" height="140" rx="24" fill="rgba(9,9,11,0.78)" />
    <text x="64" y="482" fill="#ffffff" font-family="system-ui, sans-serif" font-size="30" font-weight="800">${safeTitle}</text>
    <text x="64" y="525" fill="rgba(255,255,255,0.8)" font-family="system-ui, sans-serif" font-size="19" font-weight="600">${safeArtist} • ZK-SONG STUDIO</text>
  </svg>`;

  const slug =
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'cover-art';

  return new File([svg], `${slug}-cover.svg`, { type: 'image/svg+xml' });
}
