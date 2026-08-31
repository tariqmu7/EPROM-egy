// Fully-offline avatar generator.
//
// Produces a `data:image/svg+xml` URI with the person's initials on a
// deterministic colored background. Replaces the old `ui-avatars.com` calls so
// no avatar request ever leaves the machine — the string is self-contained and
// renders anywhere an <img src> is used.

const BG_COLORS = [
  '#0D9488', '#2563EB', '#7C3AED', '#DB2777', '#DC2626',
  '#EA580C', '#CA8A04', '#16A34A', '#0891B2', '#4F46E5',
];

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function colorFor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) | 0;
  return BG_COLORS[Math.abs(hash) % BG_COLORS.length];
}

/** A self-contained data-URI SVG avatar built from the given name. */
export function localAvatar(name: string): string {
  const label = esc(initials(name || 'User'));
  const bg = colorFor(name || 'User');
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">` +
    `<rect width="128" height="128" fill="${bg}"/>` +
    `<text x="64" y="64" dy="0.35em" fill="#ffffff" font-family="Inter, system-ui, sans-serif" ` +
    `font-size="52" font-weight="600" text-anchor="middle">${label}</text>` +
    `</svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}
