/**
 * Web UI assets embedded into the single-executable build.
 * `webAssets.generated.js` is produced by scripts/embed-web.js during
 * `npm run build:exe`; it does not exist in normal dev/npm builds, in which
 * case everything here returns null and the server falls back to disk.
 */
interface EmbeddedAsset {
  type: string;
  data: string; // base64
}

function loadEmbedded(): Record<string, EmbeddedAsset> | null {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require('./webAssets.generated') as Record<string, EmbeddedAsset>;
  } catch {
    return null;
  }
}

const embedded = loadEmbedded();

export function hasEmbeddedAssets(): boolean {
  return embedded !== null;
}

export function getEmbeddedAsset(pathname: string): { type: string; content: Buffer } | null {
  if (!embedded) return null;
  const key = pathname.replace(/^\//, '') || 'index.html';
  const hit = embedded[key];
  if (!hit) return null;
  return { type: hit.type, content: Buffer.from(hit.data, 'base64') };
}
