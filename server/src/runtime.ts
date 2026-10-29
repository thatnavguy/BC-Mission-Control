import fs from 'fs';
import path from 'path';

/** True when running inside a Node single-executable application (SEA). */
export function isSea(): boolean {
  try {
    // node:sea only reports true inside a packaged exe; safe to require in plain Node 20+.
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const sea = require('node:sea');
    return typeof sea.isSea === 'function' && sea.isSea();
  } catch {
    return false;
  }
}

/**
 * Persistent state location.
 * - exe mode: `%APPDATA%\BCMissionControl` (per-user, always writable), unless
 *   a `data` folder exists next to the exe — that opts into portable mode.
 * - from source: `server/data` as before.
 */
export function resolveDataDir(): string {
  if (isSea()) {
    const portable = path.join(path.dirname(process.execPath), 'data');
    if (fs.existsSync(portable)) return portable;
    const appData = process.env.APPDATA;
    if (appData) return path.join(appData, 'BCMissionControl');
    return portable; // last-resort fallback when %APPDATA% is unset
  }
  return path.resolve(__dirname, '..', 'data');
}
