import { DeployRun } from './types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const resp = await fetch(url, init);
  const text = await resp.text();
  let body: any = null;
  try { body = text ? JSON.parse(text) : null; } catch { body = text; }
  if (!resp.ok) {
    throw new Error((body && body.error) || `HTTP ${resp.status}`);
  }
  return body as T;
}

export const api = {
  get: <T>(url: string) => request<T>(url),
  put: <T>(url: string, body: unknown) =>
    request<T>(url, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  post: <T>(url: string, body?: unknown) =>
    request<T>(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body ?? {}) }),
  delete: <T>(url: string) => request<T>(url, { method: 'DELETE' }),
  uploadApp: (file: File) => {
    const form = new FormData();
    form.set('file', file);
    return request<{ ok: boolean }>('/api/apps/upload', { method: 'POST', body: form });
  }
};

/** Subscribe to live run updates via SSE. Returns an unsubscribe function. */
export function subscribeRuns(onUpdate: (run: DeployRun) => void): () => void {
  const source = new EventSource('/api/events');
  source.onmessage = ev => {
    try { onUpdate(JSON.parse(ev.data)); } catch { /* ignore malformed event */ }
  };
  return () => source.close();
}
