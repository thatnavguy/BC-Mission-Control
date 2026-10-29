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
  port: 4321,
  tenants: [],
  containers: [],
  containerDefaults: { licenseFile: '', dns: '', country: 'nz', memoryLimit: '8G' }
};

export function loadSettings(): Settings {
  if (!fs.existsSync(SETTINGS_PATH)) return { ...DEFAULT_SETTINGS };
  const raw = fs.readFileSync(SETTINGS_PATH, 'utf8').replace(/^\uFEFF/, '');
  const parsed = JSON.parse(raw);
  return {
    clientId: typeof parsed.clientId === 'string' ? parsed.clientId : '',
    tokenValidityDays: Number.isFinite(parsed.tokenValidityDays) ? parsed.tokenValidityDays : 80,
    port: Number.isInteger(parsed.port) && parsed.port >= 1 && parsed.port <= 65535 ? parsed.port : 4321,
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
  fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n', 'utf8');
}
