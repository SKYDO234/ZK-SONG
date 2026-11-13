// Generates a deterministic gradient monogram avatar so the platform ships
// with no bundled demo imagery.
export function monogramAvatar(name = 'ZK', seed = '') {
  const text = String(name || 'ZK').trim() || 'ZK';
  const initials = encodeURIComponent(
    text
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase()
      .slice(0, 2) || 'ZK'
  );
  const palettes = [
    ['#8b5cf6', '#06b6d4'],
    ['#f97316', '#ec4899'],
    ['#10b981', '#06b6d4'],
    ['#6366f1', '#a855f7'],
    ['#0ea5e9', '#22d3ee'],
  ];
  const key = String(seed || text);
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) hash = (hash * 31 + key.charCodeAt(i)) % 997;
  const [c1, c2] = palettes[hash % palettes.length];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c1}"/><stop offset="1" stop-color="${c2}"/></linearGradient></defs><rect width="64" height="64" rx="14" fill="url(#g)"/><text x="32" y="41" text-anchor="middle" font-family="system-ui,sans-serif" font-size="24" font-weight="800" fill="#ffffff">${initials}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
