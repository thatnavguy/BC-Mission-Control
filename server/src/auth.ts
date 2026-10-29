import fs from 'fs';
import { execFile } from 'child_process';
import { TOKEN_PATH, writeFileAtomic } from './store';
import { TokenData } from './types';

const SCOPE = 'https://api.businesscentral.dynamics.com/.default offline_access';
const BC_RESOURCE = 'https://api.businesscentral.dynamics.com';
const AUTH_TIMEOUT_MS = 30_000;

// AADSTS codes that mean the refresh token itself is dead (for every tenant).
// Other invalid_grant errors — MFA / Conditional Access / user not in tenant —
// only affect one tenant and must not wipe the shared token.
const DEAD_TOKEN_CODES = new Set([70000, 70008, 700082, 700084, 50132, 50173]);

// Well-known public client used by Azure PowerShell / BcContainerHelper.
// Multi-tenant, supports device code — same identity the PowerShell scripts use,
// so no custom app registration is required.
export const DEFAULT_CLIENT_ID = '1950a258-227b-4e31-a9cf-717495945fc2';

/** The configured client ID, falling back to the shared public client. */
export function effectiveClientId(configured: string): string {
  return configured.trim() || DEFAULT_CLIENT_ID;
}

export interface DeviceCodeInfo {
  userCode: string;
  verificationUri: string;
  message: string;
  expiresIn: number;
}

interface PendingFlow {
  deviceCode: string;
  interval: number;
  expiresAt: number;
  clientId: string;
  tenantId: string;
  done: boolean;
}

let pendingFlow: PendingFlow | null = null;

// In-memory access token cache: tenantId -> { token, expiresAt }
const accessTokens = new Map<string, { token: string; expiresAt: number }>();
// In-flight refreshes, so concurrent callers for one tenant share a request.
const inflightRefresh = new Map<string, Promise<string>>();
// Refresh tokens rotate on redemption: serialize redemptions so each one
// uses (and persists) the latest token instead of racing on the file.
let refreshChain: Promise<unknown> = Promise.resolve();

function serialized<T>(fn: () => Promise<T>): Promise<T> {
  const next = refreshChain.then(fn, fn);
  refreshChain = next.catch(() => undefined);
  return next;
}

// ── Token persistence (DPAPI-protected on Windows) ───────────────────────────

/** On-disk shape. `refreshToken` is the legacy plaintext field, still read for migration. */
interface StoredToken {
  savedAt?: string;
  refreshToken?: string;
  refreshTokenDpapi?: string;
}

const useDpapi = process.platform === 'win32';
let tokenCache: TokenData | undefined;

/** Run a DPAPI (CurrentUser) operation via Windows PowerShell; data goes over stdin, never argv. */
function dpapi(op: 'Protect' | 'Unprotect', input: string): Promise<string> {
  const script = op === 'Protect'
    ? "Add-Type -AssemblyName System.Security; $i=[Console]::In.ReadToEnd(); [Console]::Out.Write([Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect([Text.Encoding]::UTF8.GetBytes($i),$null,'CurrentUser')))"
    : "Add-Type -AssemblyName System.Security; $i=[Console]::In.ReadToEnd().Trim(); [Console]::Out.Write([Text.Encoding]::UTF8.GetString([Security.Cryptography.ProtectedData]::Unprotect([Convert]::FromBase64String($i),$null,'CurrentUser')))";
  return new Promise((resolve, reject) => {
    const child = execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script],
      { timeout: 30_000, windowsHide: true },
      (err, stdout, stderr) => err ? reject(new Error(String(stderr || err.message).trim())) : resolve(stdout.trim()));
    child.stdin?.end(input);
  });
}

async function readStoredToken(): Promise<TokenData> {
  if (!fs.existsSync(TOKEN_PATH)) return {};
  let stored: StoredToken;
  try {
    stored = JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return {};
  }
  if (stored.refreshTokenDpapi) {
    try {
      return { refreshToken: await dpapi('Unprotect', stored.refreshTokenDpapi), savedAt: stored.savedAt };
    } catch (err: any) {
      // Encrypted for another user/machine — treat as signed out.
      console.error(`Could not decrypt token.json: ${err.message}`);
      return {};
    }
  }
  const data: TokenData = { refreshToken: stored.refreshToken, savedAt: stored.savedAt };
  if (data.refreshToken && useDpapi) await saveTokenData(data); // migrate plaintext token
  return data;
}

let tokenLoading: Promise<TokenData> | undefined;

export async function loadTokenData(): Promise<TokenData> {
  if (tokenCache !== undefined) return tokenCache;
  tokenLoading ??= readStoredToken()
    .then(data => {
      if (tokenCache === undefined) tokenCache = data;
      return tokenCache;
    })
    .finally(() => { tokenLoading = undefined; });
  return tokenLoading;
}

async function saveTokenData(data: TokenData): Promise<void> {
  tokenCache = data;
  let stored: StoredToken = { savedAt: data.savedAt, refreshToken: data.refreshToken };
  if (data.refreshToken && useDpapi) {
    try {
      stored = { savedAt: data.savedAt, refreshTokenDpapi: await dpapi('Protect', data.refreshToken) };
    } catch (err: any) {
      console.error(`DPAPI unavailable, storing token unencrypted: ${err.message}`);
    }
  }
  if (tokenCache !== data) return; // superseded (e.g. sign-out) while encrypting
  writeFileAtomic(TOKEN_PATH, JSON.stringify(stored, null, 2) + '\n');
}

export async function getAuthStatus(tokenValidityDays: number): Promise<{
  signedIn: boolean;
  savedAt?: string;
  ageDays?: number;
  expired?: boolean;
}> {
  const data = await loadTokenData();
  if (!data.refreshToken) return { signedIn: false };
  const savedAt = data.savedAt;
  const ageDays = savedAt ? (Date.now() - new Date(savedAt).getTime()) / 86400000 : undefined;
  const expired = tokenValidityDays > 0 && ageDays !== undefined && ageDays > tokenValidityDays;
  return { signedIn: true, savedAt, ageDays, expired };
}

export function signOut(): void {
  accessTokens.clear();
  tokenCache = {};
  if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH);
}

async function postForm(url: string, form: Record<string, string>): Promise<any> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString(),
    signal: AbortSignal.timeout(AUTH_TIMEOUT_MS)
  });
  const json = await resp.json().catch(() => ({}));
  return { ok: resp.ok, status: resp.status, json };
}

export async function startDeviceFlow(clientId: string, tenantId: string): Promise<DeviceCodeInfo> {
  const authority = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0`;
  const resp = await postForm(`${authority}/devicecode`, { client_id: clientId, scope: SCOPE });
  if (!resp.ok) {
    throw new Error(`Device code request failed (${resp.status}): ${resp.json?.error_description || resp.json?.error || 'unknown error'}`);
  }
  const j = resp.json;
  pendingFlow = {
    deviceCode: j.device_code,
    interval: (j.interval ?? 5) * 1000,
    expiresAt: Date.now() + (j.expires_in ?? 900) * 1000,
    clientId,
    tenantId,
    done: false
  };
  pollDeviceFlow().catch(err => {
    console.error(`Device sign-in polling stopped: ${err.message}`);
    if (pendingFlow) pendingFlow.done = true;
  });
  return {
    userCode: j.user_code,
    verificationUri: j.verification_uri,
    message: j.message,
    expiresIn: j.expires_in ?? 900
  };
}

async function pollDeviceFlow(): Promise<void> {
  const flow = pendingFlow;
  if (!flow) return;
  const authority = `https://login.microsoftonline.com/${encodeURIComponent(flow.tenantId)}/oauth2/v2.0`;
  while (pendingFlow === flow && !flow.done && Date.now() < flow.expiresAt) {
    await new Promise(r => setTimeout(r, flow.interval));
    if (pendingFlow !== flow || flow.done) return;
    let resp: any;
    try {
      resp = await postForm(`${authority}/token`, {
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: flow.clientId,
        device_code: flow.deviceCode
      });
    } catch {
      continue; // transient network error — keep polling until expiry
    }
    if (resp.ok) {
      accessTokens.clear();
      await saveTokenData({ refreshToken: resp.json.refresh_token, savedAt: new Date().toISOString() });
      flow.done = true;
      return;
    }
    const err = resp.json?.error;
    if (err === 'authorization_pending') continue;
    if (err === 'slow_down') { flow.interval += 5000; continue; }
    flow.done = true;
    return; // authorization_declined, expired_token, etc.
  }
  if (pendingFlow === flow) flow.done = true;
}

export async function getDeviceFlowStatus(): Promise<{ pending: boolean; completed: boolean }> {
  if (!pendingFlow) return { pending: false, completed: false };
  if (pendingFlow.done) {
    const completed = !!(await loadTokenData()).refreshToken;
    return { pending: false, completed };
  }
  return { pending: true, completed: false };
}

export function cancelDeviceFlow(): void {
  if (pendingFlow) pendingFlow.done = true;
  pendingFlow = null;
}

function cachedAccessToken(tenantId: string): string | undefined {
  const cached = accessTokens.get(tenantId);
  return cached && cached.expiresAt > Date.now() + 60_000 ? cached.token : undefined;
}

/** Acquire (and cache) an access token for a tenant using the stored refresh token. */
export async function getAccessToken(clientId: string, tenantId: string): Promise<string> {
  const cached = cachedAccessToken(tenantId);
  if (cached) return cached;

  let pending = inflightRefresh.get(tenantId);
  if (!pending) {
    pending = serialized(() => redeemRefreshToken(clientId, tenantId))
      .finally(() => inflightRefresh.delete(tenantId));
    inflightRefresh.set(tenantId, pending);
  }
  return pending;
}

function aadErrorCodes(json: any): number[] {
  if (Array.isArray(json?.error_codes)) return json.error_codes.map(Number);
  const m = /AADSTS(\d+)/.exec(String(json?.error_description ?? ''));
  return m ? [Number(m[1])] : [];
}

async function redeemRefreshToken(clientId: string, tenantId: string): Promise<string> {
  const cached = cachedAccessToken(tenantId);
  if (cached) return cached;

  const data = await loadTokenData();
  if (!data.refreshToken) {
    throw new Error('Not signed in. Complete device sign-in on the Setup page first.');
  }
  const authority = `https://login.microsoftonline.com/${encodeURIComponent(tenantId)}/oauth2/v2.0`;
  const resp = await postForm(`${authority}/token`, {
    grant_type: 'refresh_token',
    client_id: clientId,
    refresh_token: data.refreshToken,
    scope: SCOPE
  });
  if (!resp.ok) {
    const desc = resp.json?.error_description || resp.json?.error || 'unknown error';
    if (resp.json?.error === 'invalid_grant' && aadErrorCodes(resp.json).some(c => DEAD_TOKEN_CODES.has(c))) {
      accessTokens.clear();
      await saveTokenData({}); // dead token — force re-sign-in
    }
    throw new Error(`Token refresh failed for tenant ${tenantId}: ${desc}`);
  }
  // Refresh tokens rotate — persist the new one.
  if (resp.json.refresh_token && resp.json.refresh_token !== data.refreshToken) {
    await saveTokenData({ refreshToken: resp.json.refresh_token, savedAt: data.savedAt ?? new Date().toISOString() });
  }
  accessTokens.set(tenantId, {
    token: resp.json.access_token,
    expiresAt: Date.now() + (resp.json.expires_in ?? 3600) * 1000
  });
  return resp.json.access_token;
}

export { BC_RESOURCE };
