import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { DATA_DIR } from './store';
import { ApiCallHistoryEntry } from './types';

const HISTORY_PATH = path.join(DATA_DIR, 'callHistory.json');
const MAX_ENTRIES = 30;
const MAX_BODY_CHARS = 8000;

function truncate(value: string | undefined): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return value.length > MAX_BODY_CHARS ? value.slice(0, MAX_BODY_CHARS) + '\n… (truncated)' : value;
}

export function loadCallHistory(): ApiCallHistoryEntry[] {
  if (!fs.existsSync(HISTORY_PATH)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(HISTORY_PATH, 'utf8').replace(/^\uFEFF/, ''));
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function recordCall(entry: Omit<ApiCallHistoryEntry, 'id' | 'timestamp'>): void {
  const history = loadCallHistory();
  history.unshift({
    ...entry,
    requestBody: truncate(entry.requestBody),
    responseBody: truncate(entry.responseBody),
    id: randomUUID(),
    timestamp: new Date().toISOString()
  });
  if (history.length > MAX_ENTRIES) history.length = MAX_ENTRIES;
  fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2) + '\n', 'utf8');
}

export function clearCallHistory(): void {
  fs.writeFileSync(HISTORY_PATH, '[]\n', 'utf8');
}
