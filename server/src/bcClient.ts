import { EnvironmentInfo } from './types';

const ADMIN_API = 'https://api.businesscentral.dynamics.com/admin/v2.29';
const API_V2 = 'https://api.businesscentral.dynamics.com/v2.0';

const DEFAULT_TIMEOUT_MS = 2 * 60 * 1000;
const UPLOAD_TIMEOUT_MS = 10 * 60 * 1000;
const MAX_RETRIES = 3;
const MAX_RETRY_DELAY_MS = 60 * 1000;
const TRANSIENT_STATUSES = new Set([502, 503, 504]);

/**
 * A bearer token, or a function returning one. Long-running loops pass a
 * provider so every request gets a fresh (cached) token instead of reusing
 * one that may expire mid-run.
 */
export type TokenSource = string | (() => Promise<string>);

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

export class BcApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function retryDelayMs(resp: Response | undefined, attempt: number): number {
  const header = resp?.headers.get('retry-after');
  if (header) {
    const seconds = Number(header);
    const ms = Number.isFinite(seconds) ? seconds * 1000 : new Date(header).getTime() - Date.now();
    if (Number.isFinite(ms) && ms >= 0) return Math.min(ms, MAX_RETRY_DELAY_MS);
  }
  return Math.min(2000 * 2 ** attempt, MAX_RETRY_DELAY_MS);
}

/**
 * Fetch with a timeout. Throttled requests (429) are retried for any method,
 * since BC rejects them before processing. Network errors and 502/503/504 are
 * only retried for GET, so non-idempotent operations are never sent twice.
 */
async function request(
  url: string,
  token: TokenSource,
  init: RequestInit = {},
  raw = false,
  timeoutMs = DEFAULT_TIMEOUT_MS
): Promise<any> {
  const method = (init.method ?? 'GET').toUpperCase();
  const idempotent = method === 'GET';
  for (let attempt = 0; ; attempt++) {
    const bearer = typeof token === 'string' ? token : await token();
    const headers: Record<string, string> = {
      Authorization: 'Bearer ' + bearer,
      ...(init.headers as Record<string, string> | undefined)
    };
    let resp: Response;
    try {
      resp = await fetch(url, { ...init, headers, signal: AbortSignal.timeout(timeoutMs) });
    } catch (err: any) {
      if (idempotent && attempt < MAX_RETRIES) {
        await sleep(retryDelayMs(undefined, attempt));
        continue;
      }
      if (err?.name === 'TimeoutError') {
        throw new Error(`${method} ${url} timed out after ${Math.round(timeoutMs / 1000)}s`);
      }
      throw err;
    }
    if (!resp.ok && attempt < MAX_RETRIES && (resp.status === 429 || (idempotent && TRANSIENT_STATUSES.has(resp.status)))) {
      await resp.body?.cancel().catch(() => undefined);
      await sleep(retryDelayMs(resp, attempt));
      continue;
    }
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
}

// ── Admin Center API ─────────────────────────────────────────────────────────

export async function listEnvironments(token: TokenSource): Promise<EnvironmentInfo[]> {
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
  token: TokenSource,
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

  return request(
    `${ADMIN_API}/applications/BusinessCentral/environments/${encodeURIComponent(environment)}/apps/pteInstall`,
    token,
    { method: 'POST', headers: { Accept: 'application/json' }, body: form },
    false,
    UPLOAD_TIMEOUT_MS
  );
}

// ── App updates (Admin Center API) ──────────────────────────────────────────

export interface AppUpdateRequirement {
  appId: string;
  name: string;
  publisher: string;
  version: string;
  type: string;
}

export interface AppUpdateInfo {
  appId: string;
  name: string;
  publisher: string;
  version: string;
  requirements: AppUpdateRequirement[];
}

/** Global (AppSource) apps installed on the environment that have a newer version available. */
export async function getAvailableAppUpdates(token: TokenSource, environment: string): Promise<AppUpdateInfo[]> {
  const resp = await request(
    `${ADMIN_API}/applications/BusinessCentral/environments/${encodeURIComponent(environment)}/apps/availableUpdates`,
    token
  );
  return (resp.value ?? []).map((u: any) => ({
    appId: u.appId,
    name: u.name,
    publisher: u.publisher,
    version: u.version,
    requirements: (u.requirements ?? []).map((r: any) => ({
      appId: r.appId,
      name: r.name,
      publisher: r.publisher,
      version: r.version,
      type: r.type
    }))
  }));
}

export interface AppOperation {
  id: string;
  type?: string;
  status?: string;
  sourceAppVersion?: string;
  targetAppVersion?: string;
  createdOn?: string;
  startedOn?: string;
  completedOn?: string;
  errorMessage?: string;
}

/** Trigger an update of a global app. Dependencies are installed/updated automatically. */
export async function updateApp(
  token: TokenSource,
  environment: string,
  appId: string,
  targetVersion: string,
  useEnvironmentUpdateWindow: boolean
): Promise<AppOperation> {
  return request(
    `${ADMIN_API}/applications/BusinessCentral/environments/${encodeURIComponent(environment)}/apps/${encodeURIComponent(appId)}/update`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        targetVersion,
        useEnvironmentUpdateWindow,
        installOrUpdateNeededDependencies: true
      })
    }
  );
}

export async function getAppOperation(
  token: TokenSource,
  environment: string,
  appId: string,
  operationId: string
): Promise<AppOperation | undefined> {
  const resp = await request(
    `${ADMIN_API}/applications/BusinessCentral/environments/${encodeURIComponent(environment)}/apps/${encodeURIComponent(appId)}/operations/${encodeURIComponent(operationId)}`,
    token
  );
  const op = Array.isArray(resp?.value) ? resp.value[0] : resp;
  return op?.id ? op : undefined;
}

// ── Session management (Admin Center API) ────────────────────────────────────

export interface SessionInfo {
  sessionId: number;
  userId: string;
  clientType: string;
  logOnDate: string;
  entryPointOperation?: string;
  entryPointObjectName?: string;
  currentObjectName?: string;
  currentObjectId?: number;
  currentObjectType?: string;
  currentOperationDuration?: number;
}

export async function getActiveSessions(token: TokenSource, environment: string): Promise<SessionInfo[]> {
  const resp = await request(
    `${ADMIN_API}/applications/BusinessCentral/environments/${encodeURIComponent(environment)}/sessions`,
    token
  );
  return (resp.value ?? []).map((s: any) => ({
    sessionId: Number(s.sessionId),
    userId: s.userId ?? '',
    clientType: s.clientType ?? '',
    logOnDate: s.logOnDate ?? '',
    entryPointOperation: s.entryPointOperation,
    entryPointObjectName: s.entryPointObjectName,
    currentObjectName: s.currentObjectName,
    currentObjectId: s.currentObjectId,
    currentObjectType: s.currentObjectType,
    currentOperationDuration: s.currentOperationDuration
  }));
}

/** Terminates an active session, disconnecting the user. */
export async function killSession(token: TokenSource, environment: string, sessionId: number): Promise<void> {
  await request(
    `${ADMIN_API}/applications/BusinessCentral/environments/${encodeURIComponent(environment)}/sessions/${sessionId}`,
    token,
    { method: 'DELETE' },
    true
  );
}

// ── Environment update management (Admin Center API) ─────────────────────────

export interface EnvironmentUpdateInfo {
  targetVersion: string;
  available: boolean;
  selected: boolean;
  targetVersionType?: string;
  updateStatus?: string;
  scheduleDetails?: {
    latestSelectableDateTime?: string;
    selectedDateTime?: string;
    ignoreUpdateWindow?: boolean;
    rolloutStatus?: string;
  };
  expectedAvailability?: { month: number; year: number };
}

export async function getEnvironmentUpdates(token: TokenSource, environment: string): Promise<EnvironmentUpdateInfo[]> {
  const resp = await request(
    `${ADMIN_API}/applications/BusinessCentral/environments/${encodeURIComponent(environment)}/updates`,
    token
  );
  return resp.value ?? [];
}

export interface UpdateWindow {
  preferredStartTime?: string;
  preferredEndTime?: string;
  timeZoneId?: string;
  preferredStartTimeUtc?: string;
  preferredEndTimeUtc?: string;
}

export async function getUpdateWindow(token: TokenSource, environment: string): Promise<UpdateWindow | null> {
  const resp = await request(
    `${ADMIN_API}/applications/BusinessCentral/environments/${encodeURIComponent(environment)}/settings/upgrade`,
    token
  );
  return resp && Object.keys(resp).length > 0 ? resp : null;
}

/** Set the update window with wall time + time zone (recommended over the UTC parameter set). */
export async function setUpdateWindow(
  token: TokenSource,
  environment: string,
  window: { preferredStartTime: string; preferredEndTime: string; timeZoneId: string }
): Promise<UpdateWindow> {
  return request(
    `${ADMIN_API}/applications/BusinessCentral/environments/${encodeURIComponent(environment)}/settings/upgrade`,
    token,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(window)
    }
  );
}

/** Select the target version (and optionally a date) for the next environment update. */
export async function selectTargetVersion(
  token: TokenSource,
  environment: string,
  targetVersion: string,
  schedule?: { selectedDateTime?: string; ignoreUpdateWindow?: boolean }
): Promise<unknown> {
  return request(
    `${ADMIN_API}/applications/BusinessCentral/environments/${encodeURIComponent(environment)}/updates/${encodeURIComponent(targetVersion)}`,
    token,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selected: true,
        ...(schedule?.selectedDateTime || schedule?.ignoreUpdateWindow !== undefined
          ? {
              scheduleDetails: {
                ...(schedule.selectedDateTime ? { selectedDateTime: schedule.selectedDateTime } : {}),
                ignoreUpdateWindow: schedule.ignoreUpdateWindow === true
              }
            }
          : {})
      })
    }
  );
}

export interface TimeZoneInfo {
  id: string;
  displayName: string;
  currentUtcOffset: string;
}

// The time zone list is static; cache it for a day.
let timezonesCache: { at: number; data: TimeZoneInfo[] } | null = null;

export async function getTimezones(token: TokenSource): Promise<TimeZoneInfo[]> {
  if (timezonesCache && Date.now() - timezonesCache.at < 24 * 60 * 60 * 1000) return timezonesCache.data;
  const resp = await request(`${ADMIN_API}/applications/settings/timezones`, token);
  const data: TimeZoneInfo[] = (resp.value ?? [])
    .map((t: any) => ({ id: t.id, displayName: t.displayName, currentUtcOffset: t.currentUtcOffset }))
    .filter((t: TimeZoneInfo) => !!t.id)
    .sort((a: TimeZoneInfo, b: TimeZoneInfo) => a.displayName.localeCompare(b.displayName));
  timezonesCache = { at: Date.now(), data };
  return data;
}

// ── Storage usage (Admin Center API) ─────────────────────────────────────────

export interface EnvironmentStorageUsage {
  environmentName: string;
  environmentType: string;
  /** Used database storage in KB; -1 when the service failed to measure it. */
  databaseStorageInKilobytes: number;
}

export async function getUsedStorage(token: TokenSource): Promise<EnvironmentStorageUsage[]> {
  const resp = await request(`${ADMIN_API}/environments/usedstorage`, token);
  return (resp.value ?? []).map((e: any) => ({
    environmentName: e.environmentName,
    environmentType: e.environmentType,
    databaseStorageInKilobytes: Number(e.databaseStorageInKilobytes ?? -1)
  }));
}

export interface StorageQuotas {
  productionEnvironments: number;
  sandboxEnvironments: number;
  storage: { default: number; userLicenses: number; additionalCapacity: number; total: number };
}

export async function getStorageQuotas(token: TokenSource): Promise<StorageQuotas> {
  const resp = await request(`${ADMIN_API}/environments/quotas`, token);
  return {
    productionEnvironments: Number(resp.environmentsCount?.production ?? 0),
    sandboxEnvironments: Number(resp.environmentsCount?.sandbox ?? 0),
    storage: {
      default: Number(resp.storageInKilobytes?.default ?? 0),
      userLicenses: Number(resp.storageInKilobytes?.userLicenses ?? 0),
      additionalCapacity: Number(resp.storageInKilobytes?.additionalCapacity ?? 0),
      total: Number(resp.storageInKilobytes?.total ?? 0)
    }
  };
}

// ── Environment lifecycle (Admin Center API) ─────────────────────────────────

export interface EnvironmentOperation {
  id: string;
  type?: string;
  status?: string;
  createdOn?: string;
  startedOn?: string;
  completedOn?: string;
  createdBy?: string;
  errorMessage?: string;
  environmentName?: string;
  environmentType?: string;
  parameters?: Record<string, unknown>;
}

/** All operations (app + environment) for one environment, newest first. */
export async function getEnvironmentOperations(token: TokenSource, environment: string): Promise<EnvironmentOperation[]> {
  const resp = await request(
    `${ADMIN_API}/applications/BusinessCentral/environments/${encodeURIComponent(environment)}/operations`,
    token
  );
  const ops: EnvironmentOperation[] = resp.value ?? [];
  return ops.sort((a, b) => (b.createdOn ?? '').localeCompare(a.createdOn ?? ''));
}

/** Installed apps (global + PTE) — used to resolve appIds in operations to names. */
export async function getInstalledApps(token: TokenSource, environment: string): Promise<{ appId: string; name: string; publisher: string; version: string }[]> {
  const resp = await request(
    `${ADMIN_API}/applications/BusinessCentral/environments/${encodeURIComponent(environment)}/apps`,
    token
  );
  return (resp.value ?? []).map((a: any) => ({
    // The API returns "id"; the docs say "appId" — accept both.
    appId: a.appId ?? a.id,
    name: a.name,
    publisher: a.publisher,
    version: a.version
  }));
}

export async function createEnvironment(
  token: TokenSource,
  name: string,
  environmentType: 'Production' | 'Sandbox',
  countryCode: string,
  ringName?: string
): Promise<EnvironmentOperation> {
  return request(
    `${ADMIN_API}/applications/BusinessCentral/environments/${encodeURIComponent(name)}`,
    token,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        environmentType,
        countryCode,
        ...(ringName ? { ringName } : {})
      })
    }
  );
}

export async function copyEnvironment(
  token: TokenSource,
  sourceEnvironment: string,
  newName: string,
  type: 'Production' | 'Sandbox' = 'Sandbox'
): Promise<EnvironmentOperation> {
  return request(
    `${ADMIN_API}/applications/BusinessCentral/environments/${encodeURIComponent(sourceEnvironment)}/copy`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ environmentName: newName, type })
    }
  );
}

/** Soft-deletes the environment (recoverable for 14 days). */
export async function deleteEnvironment(token: TokenSource, environment: string): Promise<EnvironmentOperation> {
  return request(
    `${ADMIN_API}/applications/BusinessCentral/environments/${encodeURIComponent(environment)}`,
    token,
    { method: 'DELETE' }
  );
}

/**
 * Look up a single environment operation. Returns undefined when the
 * environment cannot be queried yet (still provisioning) or is already gone
 * (deleted) — callers should keep polling in both cases.
 */
export async function getEnvironmentOperation(
  token: TokenSource,
  environment: string,
  operationId: string
): Promise<EnvironmentOperation | undefined> {
  try {
    const resp = await request(
      `${ADMIN_API}/applications/BusinessCentral/environments/${encodeURIComponent(environment)}/operations`,
      token
    );
    const ops: EnvironmentOperation[] = resp.value ?? [];
    return ops.find(o => o.id === operationId);
  } catch {
    return undefined;
  }
}

export interface AvailableCountry {
  countryCode: string;
  rings: { name: string; productionRing: boolean; friendlyName: string }[];
}

// The /applications endpoint takes ~30s to respond and its data changes
// rarely, so cache per tenant for a day.
const countriesCache = new Map<string, { at: number; data: AvailableCountry[] }>();
const COUNTRIES_TTL_MS = 24 * 60 * 60 * 1000;

/** Countries/regions (and rings) where new environments can be created. */
export async function getAvailableCountries(token: TokenSource, cacheKey?: string): Promise<AvailableCountry[]> {
  const key = cacheKey ?? 'default';
  const hit = countriesCache.get(key);
  if (hit && Date.now() - hit.at < COUNTRIES_TTL_MS) return hit.data;

  const resp = await request(`${ADMIN_API}/applications`, token);
  const families: any[] = resp.value ?? [];
  const family = families.find(a => a.applicationFamily === 'BusinessCentral') ?? families[0];
  // The API returns "countriesRingDetails" (capital R); docs show it lowercase.
  const details = family?.countriesRingDetails ?? family?.countriesringDetails ?? [];
  const list = Array.isArray(details) ? details : [details];
  const data = list
    .map((c: any) => ({
      countryCode: c.countryCode,
      rings: (c.rings ?? []).map((r: any) => ({
        name: r.name,
        productionRing: !!r.productionRing,
        friendlyName: r.friendlyName ?? r.name
      }))
    }))
    .filter((c: AvailableCountry) => !!c.countryCode)
    .sort((a: AvailableCountry, b: AvailableCountry) => a.countryCode.localeCompare(b.countryCode));
  countriesCache.set(key, { at: Date.now(), data });
  return data;
}

// ── Automation API (per environment) ─────────────────────────────────────────

function automationUrl(tenantId: string, environment: string): string {
  return `${API_V2}/${encodeURIComponent(tenantId)}/${encodeURIComponent(environment)}/api/microsoft/automation/v2.0`;
}

// Companies rarely change; every automation call needs one, so cache briefly.
const COMPANIES_TTL_MS = 5 * 60 * 1000;
const companiesCache = new Map<string, { at: number; data: { id: string; name: string }[] }>();

export async function getCompanies(token: TokenSource, tenantId: string, environment: string): Promise<{ id: string; name: string }[]> {
  const key = `${tenantId.toLowerCase()}|${environment.toLowerCase()}`;
  const hit = companiesCache.get(key);
  if (hit && Date.now() - hit.at < COMPANIES_TTL_MS) return hit.data;
  const resp = await request(`${automationUrl(tenantId, environment)}/companies`, token);
  const data = (resp.value ?? []).map((c: any) => ({ id: c.id, name: c.name }));
  if (data.length > 0) companiesCache.set(key, { at: Date.now(), data });
  else companiesCache.delete(key);
  return data;
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
  token: TokenSource,
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
    // The API returns scope values with a leading space (' Dev', ' PTE')
    publishedAs: String(e.publishedAs ?? '').trim()
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
  token: TokenSource,
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
  token: TokenSource,
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

// ── Notification recipients (Admin Center API, tenant level) ─────────────────

export interface NotificationRecipient {
  id: string;
  email: string;
  name: string;
}

export async function getNotificationRecipients(token: TokenSource): Promise<NotificationRecipient[]> {
  const resp = await request(`${ADMIN_API}/settings/notification/recipients`, token);
  return (resp.value ?? []).map((r: any) => ({ id: r.id, email: r.email ?? '', name: r.name ?? '' }));
}

export async function createNotificationRecipient(token: TokenSource, email: string, name: string): Promise<NotificationRecipient> {
  return request(
    `${ADMIN_API}/settings/notification/recipients`,
    token,
    {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name })
    }
  );
}

export async function deleteNotificationRecipient(token: TokenSource, id: string): Promise<void> {
  await request(
    `${ADMIN_API}/settings/notification/recipients/${encodeURIComponent(id)}`,
    token,
    { method: 'DELETE' },
    true
  );
}

// ── Feature management (Automation API) ──────────────────────────────────────

export interface FeatureInfo {
  id: string;
  /** 'Enabled for' value: 'None' or 'All Users' (not a boolean). */
  enabled: string;
  description: string;
  descriptionInEnglish?: string;
  learnMoreLink?: string;
  /** 'Automatically enabled from' wave text, e.g. '2026 Wave 2 (from October 2026 to March 2027)' — not an ISO date. */
  mandatoryBy?: string;
  mandatoryByVersion?: string;
  canTry?: boolean;
  isOneWay?: boolean;
  dataUpdateRequired?: boolean;
}

export async function getFeatures(
  token: TokenSource,
  tenantId: string,
  environment: string,
  companyId: string
): Promise<FeatureInfo[]> {
  const resp = await request(`${automationUrl(tenantId, environment)}/companies(${companyId})/features`, token);
  return (resp.value ?? []).map((f: any) => ({
    id: f.id,
    enabled: String(f.enabled ?? ''),
    description: f.description ?? f.id,
    descriptionInEnglish: f.descriptionInEnglish,
    learnMoreLink: f.learnMoreLink,
    mandatoryBy: f.mandatoryBy,
    mandatoryByVersion: f.mandatoryByVersion,
    canTry: f.canTry,
    isOneWay: f.isOneWay,
    dataUpdateRequired: f.dataUpdateRequired
  }));
}

/** Activate or deactivate a feature. Activation runs any data update as a background task. */
export async function invokeFeatureAction(
  token: TokenSource,
  tenantId: string,
  environment: string,
  companyId: string,
  featureId: string,
  action: 'activate' | 'deactivate'
): Promise<void> {
  const key = featureId.replace(/'/g, "''");
  await request(
    `${automationUrl(tenantId, environment)}/companies(${companyId})/features('${key}')/Microsoft.NAV.${action}`,
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(action === 'activate'
        ? { updateInBackground: true, startDateTime: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z') }
        : {})
    },
    true
  );
}

/**
 * Immediate PTE publish: extensionUpload PATCH + content PUT + NAV.upload,
 * then poll extensionDeploymentStatus until a terminal state.
 */
export async function publishPteImmediate(
  token: TokenSource,
  tenantId: string,
  environment: string,
  appBuffer: Buffer,
  app: { id: string; name: string; version: string },
  schemaSyncMode: 'Add' | 'Force',
  onProgress: (msg: string) => void,
  pollTimeoutMs = 15 * 60 * 1000
): Promise<{ status: 'succeeded' | 'failed' | 'unknown'; message: string }> {
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
  }, true, UPLOAD_TIMEOUT_MS);

  // Snapshot existing status rows so an older deployment of the same app
  // (e.g. a previous failed attempt) is not mistaken for this one.
  const rowKey = (r: DeploymentStatusRow) => `${r.name ?? ''}|${r.appVersion ?? ''}|${r.startedOn ?? ''}`;
  const before = new Set(
    (await getDeploymentStatus(token, tenantId, environment, companyId, 20).catch(() => [] as DeploymentStatusRow[])).map(rowKey)
  );
  const isThisApp = (r: DeploymentStatusRow) =>
    ((r.appId && r.appId.toLowerCase() === app.id.toLowerCase()) ||
      (r.name && r.name.toLowerCase() === app.name.toLowerCase())) &&
    (!r.appVersion || r.appVersion === app.version);

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
    const row = rows.find(r => isThisApp(r) && !before.has(rowKey(r)));
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
  return { status: 'unknown', message: 'Upload accepted, but status polling timed out. Check Deployment Status later.' };
}
