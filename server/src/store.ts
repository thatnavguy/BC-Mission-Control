import fs from 'fs';
import path from 'path';
import { Settings } from './types';
import { resolveDataDir } from './runtime';

export const DATA_DIR = resolveDataDir();
export const UPLOADS_DIR = path.join(DATA_DIR, 'uploads');
export const SETTINGS_PATH = path.join(DATA_DIR, 'settings.json');
export const TOKEN_PATH = path.join(DATA_DIR, 'token.json');

for (const dir of [DATA_DIR, UPLOADS_DIR]) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

const DEFAULT_SETTINGS: Settings = {
  clientId: '',
  tokenValidityDays: 80,
  port: 7654,
  tenants: [],
  containers: [],
  containerDefaults: { licenseFile: '', dns: '', country: 'nz', memoryLimit: '8G' }
};

/**
 * Write via a temp file + rename so a crash mid-write never leaves a
 * truncated file behind. Falls back to a direct write if the rename is
 * blocked (e.g. antivirus holding the target open on Windows).
 */
export function writeFileAtomic(filePath: string, content: string): void {
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, content, 'utf8');
  try {
    fs.renameSync(tmp, filePath);
  } catch {
    fs.writeFileSync(filePath, content, 'utf8');
    fs.rmSync(tmp, { force: true });
  }
}

export function loadSettings(): Settings {
  if (!fs.existsSync(SETTINGS_PATH)) return { ...DEFAULT_SETTINGS };
  const raw = fs.readFileSync(SETTINGS_PATH, 'utf8').replace(/^\uFEFF/, '');
  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch (err: any) {
    // Keep the broken file for manual recovery instead of refusing to start.
    const backup = `${SETTINGS_PATH}.corrupt-${Date.now()}`;
    try { fs.renameSync(SETTINGS_PATH, backup); } catch { /* best effort */ }
    console.error(`settings.json could not be parsed (${err.message}); moved to ${backup} and using defaults.`);
    return { ...DEFAULT_SETTINGS };
  }
  return {
    clientId: typeof parsed.clientId === 'string' ? parsed.clientId : '',
    tokenValidityDays: Number.isFinite(parsed.tokenValidityDays) ? parsed.tokenValidityDays : 80,
    port: Number.isInteger(parsed.port) && parsed.port >= 1 && parsed.port <= 65535 ? parsed.port : 7654,
    tenants: Array.isArray(parsed.tenants) ? parsed.tenants : [],
    containers: Array.isArray(parsed.containers) ? parsed.containers : [],
    containerDefaults: {
      licenseFile: parsed.containerDefaults?.licenseFile ?? '',
      dns: parsed.containerDefaults?.dns ?? '',
      country: parsed.containerDefaults?.country ?? 'nz',
      memoryLimit: parsed.containerDefaults?.memoryLimit ?? '8G'
    }
  };
}

export function saveSettings(settings: Settings): void {
  writeFileAtomic(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n');
}

/** Remove temp scripts/work files left behind if the server stopped mid-run. */
export function cleanupStaleRunFiles(): void {
  for (const f of fs.readdirSync(DATA_DIR)) {
    if (/^container-(deploy|create|units)-.*\.(ps1|json)$/i.test(f) || /\.\d+\.tmp$/.test(f)) {
      fs.rmSync(path.join(DATA_DIR, f), { force: true });
    }
  }
}
