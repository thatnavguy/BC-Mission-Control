import { EnvironmentInfo } from './types';

const ADMIN_API = 'https://api.businesscentral.dynamics.com/admin/v2.29';
const API_V2 = 'https://api.businesscentral.dynamics.com/v2.0';

export class BcApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request(url: string, token: string, init: RequestInit = {}, raw = false): Promise<any> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    ...(init.headers as Record<string, string> | undefined)
  };
  const resp = await fetch(url, { ...init, headers });
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    let message = text;
    try {
      const j = JSON.parse(text);
      message = j?.error?.message || j?.message || text;
    } catch { /* keep raw text */ }
    throw new BcApiError(resp.status, `HTTP ${resp.status}: ${message}`.slice(0, 500));
  }
  if (raw || resp.status === 204) return resp;
  const text = await resp.text();
  return text ? JSON.parse(text) : {};
}

// ── Admin Center API ─────────────────────────────────────────────────────────

export async function listEnvironments(token: string): Promise<EnvironmentInfo[]> {
  const resp = await request(
    `${ADMIN_API}/applications/BusinessCentral/environments`,
    token
  );
  const value: any[] = resp.value ?? [];
  // The API includes soft-deleted environments (renamed with a numeric suffix);
  // the Admin Center UI hides them, so do the same.
  const hiddenStatuses = new Set(['softdeleted', 'softdeleting', 'removing']);
  return value
    .filter(e => !hiddenStatuses.has(String(e.status ?? '').toLowerCase()))
    .map(e => ({
      name: e.name,
      type: e.type,
      status: e.status,
      version: e.applicationVersion ?? e.version
    }));
}

/** Scheduled PTE install (update window) via Admin Center API. Max 50 MB per file. */
export async function schedulePteInstall(
  token: string,
  environment: string,
  appBuffer: Buffer,
  fileName: string,
  syncMode: 'Add' | 'ForceSync',
  acceptIsvEula: boolean
): Promise<{ id?: string; status?: string }> {
  const form = new FormData();
  form.set('extensionFile', new Blob([new Uint8Array(appBuffer)], { type: 'application/octet-stream' }), fileName);
  form.set('deploymentSchedule', 'UpdateWindow');
  form.set('syncMode', syncMode);
  form.set('acceptIsvEula', String(acceptIsvEula));

  const resp = await fetch(
    `${ADMIN_API}/applications/BusinessCentral/environments/${encodeURIComponent(environment)}/apps/pteInstall`,
    { method: 'POST', headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, body: form }
  );
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    let message = text;
    try {
      const j = JSON.parse(text);
      message = j?.error?.message || j?.message || text;
    } catch { /* keep raw */ }
    throw new BcApiError(resp.status, `HTTP ${resp.status}: ${message}`.slice(0, 500));
  }
  const text = await resp.text();
  return text ? JSON.parse(text) : {};
}

// ── Automation API (per environment) ─────────────────────────────────────────

function automationUrl(tenantId: string, environment: string): string {
  return `${API_V2}/${encodeURIComponent(tenantId)}/${encodeURIComponent(environment)}/api/microsoft/automation/v2.0`;
}

export async function getCompanies(token: string, tenantId: string, environment: string): Promise<{ id: string; name: string }[]> {
  const resp = await request(`${automationUrl(tenantId, environment)}/companies`, token);
  return (resp.value ?? []).map((c: any) => ({ id: c.id, name: c.name }));
}

export interface InstalledExtension {
  packageId: string;
  id: string;
  displayName: string;
  publisher: string;
  versionMajor: number;
  versionMinor: number;
  versionBuild: number;
  versionRevision: number;
  isInstalled: boolean;
  publishedAs: string;
}

export async function getExtensions(
  token: string,
  tenantId: string,
  environment: string,
  companyId: string
): Promise<InstalledExtension[]> {
  const resp = await request(`${automationUrl(tenantId, environment)}/companies(${companyId})/extensions`, token);
  return (resp.value ?? []).map((e: any) => ({
    packageId: e.packageId,
    id: e.id,
    displayName: e.displayName,
    publisher: e.publisher,
    versionMajor: e.versionMajor,
    versionMinor: e.versionMinor,
    versionBuild: e.versionBuild,
    versionRevision: e.versionRevision,
    isInstalled: !!e.isInstalled,
    publishedAs: e.publishedAs ?? ''
  }));
}

export interface DeploymentStatusRow {
  appId?: string;
  name?: string;
  publisher?: string;
  appVersion?: string;
  status?: string;
  startedOn?: string;
  completedOn?: string;
  errorMessage?: string;
  operationType?: string;
}

/** Run a bound action (Microsoft.NAV.install / .unpublish) on an extension. */
export async function invokeExtensionAction(
  token: string,
  tenantId: string,
  environment: string,
  companyId: string,
  packageId: string,
  action: 'install' | 'unpublish'
): Promise<void> {
  await request(
    `${automationUrl(tenantId, environment)}/companies(${companyId})/extensions(${packageId})/Microsoft.NAV.${action}`,
    token,
    { method: 'POST', headers: { 'Content-Type': 'application/json' } },
    true
  );
}

export async function getDeploymentStatus(
  token: string,
  tenantId: string,
  environment: string,
  companyId: string,
  top = 20
): Promise<DeploymentStatusRow[]> {
  const resp = await request(
    `${automationUrl(tenantId, environment)}/companies(${companyId})/extensionDeploymentStatus?$orderby=startedOn desc&$top=${top}`,
    token
  );
  return resp.value ?? [];
}

/**
 * Immediate PTE publish: extensionUpload PATCH + content PUT + NAV.upload,
 * then poll extensionDeploymentStatus until a terminal state.
 */
export async function publishPteImmediate(
  token: string,
  tenantId: string,
  environment: string,
  appBuffer: Buffer,
  app: { id: string; name: string; version: string },
  schemaSyncMode: 'Add' | 'Force',
  onProgress: (msg: string) => void,
  pollTimeoutMs = 15 * 60 * 1000
): Promise<{ status: 'succeeded' | 'skipped' | 'failed'; message: string }> {
  const base = automationUrl(tenantId, environment);
  const authJson = { 'Content-Type': 'application/json', 'If-Match': '*' };

  const companies = await getCompanies(token, tenantId, environment);
  if (companies.length === 0) throw new Error('No companies found in environment');
  const companyId = companies[0].id;

  onProgress('Preparing extension upload...');
  const uploadsResp = await request(`${base}/companies(${companyId})/extensionUpload`, token);
  const existing = (uploadsResp.value ?? [])[0];
  const body = JSON.stringify({
    schedule: 'Current version',
    SchemaSyncMode: schemaSyncMode === 'Force' ? 'Force Sync' : 'Add'
  });

  let upload: any;
  if (existing?.systemId) {
    upload = await request(
      `${base}/companies(${companyId})/extensionUpload(${existing.systemId})`,
      token,
      { method: 'PATCH', headers: authJson, body }
    );
  } else {
    upload = await request(
      `${base}/companies(${companyId})/extensionUpload`,
      token,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body }
    );
  }
  if (!upload?.systemId) throw new Error('Extension upload record was not created');

  onProgress('Uploading app content...');
  const contentUrl: string =
    upload['extensionContent@odata.mediaEditLink'] ??
    `${base}/companies(${companyId})/extensionUpload(${upload.systemId})/content`;
  await request(contentUrl, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/octet-stream', 'If-Match': '*' },
    body: new Uint8Array(appBuffer)
  }, true);

  onProgress('Publishing and installing...');
  await request(
    `${base}/companies(${companyId})/extensionUpload(${upload.systemId})/Microsoft.NAV.upload`,
    token,
    { method: 'POST', headers: { 'If-Match': '*' } },
    true
  );

  // Poll deployment status for this app
  const started = Date.now();
  let lastSeen = '';
  while (Date.now() - started < pollTimeoutMs) {
    await new Promise(r => setTimeout(r, 5000));
    const rows = await getDeploymentStatus(token, tenantId, environment, companyId, 20).catch(() => [] as DeploymentStatusRow[]);
    const row = rows.find(r =>
      (r.appId && r.appId.toLowerCase() === app.id.toLowerCase()) ||
      (r.name && r.name.toLowerCase() === app.name.toLowerCase())
    );
    if (!row) continue;
    const status = (row.status ?? '').toLowerCase();
    const detail = row.errorMessage || `${row.name ?? app.name} ${row.appVersion ?? ''}`.trim();
    if (status !== lastSeen) {
      lastSeen = status;
      onProgress(`Deployment status: ${row.status ?? 'unknown'}`);
    }
    if (status === 'completed') return { status: 'succeeded', message: detail };
    if (status === 'failed') return { status: 'failed', message: detail || 'Deployment failed' };
  }
  return { status: 'succeeded', message: 'Upload accepted; status polling timed out (check deployment status later)' };
}
