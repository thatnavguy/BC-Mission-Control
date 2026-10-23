import fs from 'fs';
import { TOKEN_PATH } from './store';
import { TokenData } from './types';

const SCOPE = 'https://api.businesscentral.dynamics.com/.default offline_access';
const BC_RESOURCE = 'https://api.businesscentral.dynamics.com';

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

export function loadTokenData(): TokenData {
  if (!fs.existsSync(TOKEN_PATH)) return {};
  try {
    return JSON.parse(fs.readFileSync(TOKEN_PATH, 'utf8').replace(/^\uFEFF/, ''));
  } catch {
    return {};
  }
}

function saveTokenData(data: TokenData): void {
  fs.writeFileSync(TOKEN_PATH, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

export function getAuthStatus(tokenValidityDays: number): {
  signedIn: boolean;
  savedAt?: string;
  ageDays?: number;
  expired?: boolean;
} {
  const data = loadTokenData();
  if (!data.refreshToken) return { signedIn: false };
  const savedAt = data.savedAt;
  const ageDays = savedAt ? (Date.now() - new Date(savedAt).getTime()) / 86400000 : undefined;
  const expired = tokenValidityDays > 0 && ageDays !== undefined && ageDays > tokenValidityDays;
  return { signedIn: true, savedAt, ageDays, expired };
}

export function signOut(): void {
  accessTokens.clear();
  if (fs.existsSync(TOKEN_PATH)) fs.unlinkSync(TOKEN_PATH);
}

async function postForm(url: string, form: Record<string, string>): Promise<any> {
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(form).toString()
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
  pollDeviceFlow(); // fire and forget
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
    const resp = await postForm(`${authority}/token`, {
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
      client_id: flow.clientId,
      device_code: flow.deviceCode
    });
    if (resp.ok) {
      flow.done = true;
      saveTokenData({ refreshToken: resp.json.refresh_token, savedAt: new Date().toISOString() });
      accessTokens.clear();
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

export function getDeviceFlowStatus(): { pending: boolean; completed: boolean } {
  if (!pendingFlow) return { pending: false, completed: false };
  if (pendingFlow.done) {
    const completed = !!loadTokenData().refreshToken;
    return { pending: false, completed };
  }
  return { pending: true, completed: false };
}

export function cancelDeviceFlow(): void {
  if (pendingFlow) pendingFlow.done = true;
  pendingFlow = null;
}

/** Acquire (and cache) an access token for a tenant using the stored refresh token. */
export async function getAccessToken(clientId: string, tenantId: string): Promise<string> {
  const cached = accessTokens.get(tenantId);
  if (cached && cached.expiresAt > Date.now() + 60_000) return cached.token;

  const data = loadTokenData();
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
    if (resp.json?.error === 'invalid_grant') {
      saveTokenData({}); // dead token — force re-sign-in
    }
    throw new Error(`Token refresh failed for tenant ${tenantId}: ${desc}`);
  }
  // Refresh tokens rotate — persist the new one.
  if (resp.json.refresh_token && resp.json.refresh_token !== data.refreshToken) {
    saveTokenData({ refreshToken: resp.json.refresh_token, savedAt: data.savedAt ?? new Date().toISOString() });
  }
  accessTokens.set(tenantId, {
    token: resp.json.access_token,
    expiresAt: Date.now() + (resp.json.expires_in ?? 3600) * 1000
  });
  return resp.json.access_token;
}

export { BC_RESOURCE };
