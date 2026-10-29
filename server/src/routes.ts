import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import { loadSettings, saveSettings, UPLOADS_DIR } from './store';
import {
  cancelDeviceFlow, effectiveClientId, getAccessToken, getAuthStatus, getDeviceFlowStatus,
  signOut, startDeviceFlow
} from './auth';
import { getCompanies, getDeploymentStatus, getExtensions, getAvailableAppUpdates, getAvailableCountries, getActiveSessions, getEnvironmentOperations, getEnvironmentUpdates, getFeatures, getInstalledApps, getStorageQuotas, getTimezones, getUpdateWindow, getUsedStorage, invokeExtensionAction, invokeFeatureAction, killSession, listEnvironments, selectTargetVersion, setUpdateWindow } from './bcClient';
import { buildCompareMatrix } from './compare';
import { listRuns, getRun, onRunUpdate, startDeployRun, cancelRun, DeployRequest } from './deploy';
import { loadCallHistory, recordCall, clearCallHistory } from './callHistory';
import { startAppUpdateRun, startEnvironmentRun } from './ops';
import { parseAppManifest } from './appManifest';
import { StagedApp, TenantConfig, ContainerConfig } from './types';
import {
  getContainerCapabilities, listDockerContainers,
  startContainerDeployRun, startCreateContainerRun,
  ContainerDeployRequest, CreateContainerRequest
} from './container';

export const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 200 * 1024 * 1024 } });

function asyncWrap(fn: (req: any, res: any) => Promise<void>) {
  return (req: any, res: any, next: any) => fn(req, res).catch(next);
}

// ── Settings ─────────────────────────────────────────────────────────────

router.get('/settings', (_req, res) => {
  const s = loadSettings();
  res.json(s);
});

router.put('/settings', (req, res) => {
  const body = req.body ?? {};
  if (typeof body.clientId !== 'string') return res.status(400).json({ error: 'clientId must be a string' });
  const tenants: TenantConfig[] = Array.isArray(body.tenants) ? body.tenants : [];
  for (const t of tenants) {
    if (!t || typeof t.name !== 'string' || typeof t.id !== 'string' || typeof t.environments !== 'object') {
      return res.status(400).json({ error: 'Each tenant needs name, id and environments' });
    }
  }
  const containers: ContainerConfig[] = Array.isArray(body.containers) ? body.containers : [];
  for (const c of containers) {
    if (!c || typeof c.name !== 'string' || typeof c.containerName !== 'string') {
      return res.status(400).json({ error: 'Each container needs name and containerName' });
    }
  }
  saveSettings({
    clientId: body.clientId.trim(),
    tokenValidityDays: Number(body.tokenValidityDays) || 80,
    tenants,
    containers: containers.map(c => ({ name: c.name, containerName: c.containerName, enabled: c.enabled !== false })),
    containerDefaults: {
      licenseFile: String(body.containerDefaults?.licenseFile ?? ''),
      dns: String(body.containerDefaults?.dns ?? ''),
      country: String(body.containerDefaults?.country ?? 'nz'),
      memoryLimit: String(body.containerDefaults?.memoryLimit ?? '8G')
    }
  });
  res.json({ ok: true });
});

// ── Auth ─────────────────────────────────────────────────────────────────

router.get('/auth/status', (_req, res) => {
  const s = loadSettings();
  res.json(getAuthStatus(s.tokenValidityDays));
});

router.post('/auth/device/start', asyncWrap(async (req, res) => {
  const s = loadSettings();
  const tenantId = String(req.body?.tenantId || s.tenants[0]?.id || 'organizations');
  const info = await startDeviceFlow(effectiveClientId(s.clientId), tenantId);
  res.json(info);
}));

router.get('/auth/device/status', (_req, res) => {
  res.json(getDeviceFlowStatus());
});

router.post('/auth/device/cancel', (_req, res) => {
  cancelDeviceFlow();
  res.json({ ok: true });
});

router.post('/auth/signout', (_req, res) => {
  signOut();
  res.json({ ok: true });
});

// ── Environments ─────────────────────────────────────────────────────────

router.get('/tenants/:id/environments', asyncWrap(async (req, res) => {
  const s = loadSettings();
  const token = await getAccessToken(effectiveClientId(s.clientId), req.params.id);
  const envs = await listEnvironments(token);
  res.json(envs);
}));

router.get('/extensions', asyncWrap(async (req, res) => {
  const s = loadSettings();
  const tenantId = String(req.query.tenantId || '');
  const environment = String(req.query.environment || '');
  if (!tenantId || !environment) { res.status(400).json({ error: 'tenantId and environment are required' }); return; }
  const token = await getAccessToken(effectiveClientId(s.clientId), tenantId);
  const companies = await getCompanies(token, tenantId, environment);
  if (companies.length === 0) { res.status(404).json({ error: 'No companies in environment' }); return; }
  const extensions = await getExtensions(token, tenantId, environment, companies[0].id);
  res.json({ company: companies[0], extensions });
}));

router.get('/deployment-status', asyncWrap(async (req, res) => {
  const s = loadSettings();
  const tenantId = String(req.query.tenantId || '');
  const environment = String(req.query.environment || '');
  if (!tenantId || !environment) { res.status(400).json({ error: 'tenantId and environment are required' }); return; }
  const token = await getAccessToken(effectiveClientId(s.clientId), tenantId);
  const companies = await getCompanies(token, tenantId, environment);
  if (companies.length === 0) { res.status(404).json({ error: 'No companies in environment' }); return; }
  const rows = await getDeploymentStatus(token, tenantId, environment, companies[0].id, 20);
  res.json({ company: companies[0], rows });
}));

// ── Staged apps ──────────────────────────────────────────────────────────

function listStagedApps(): StagedApp[] {
  if (!fs.existsSync(UPLOADS_DIR)) return [];
  return fs.readdirSync(UPLOADS_DIR)
    .filter(f => f.toLowerCase().endsWith('.app'))
    .map(f => {
      const abs = path.join(UPLOADS_DIR, f);
      const stat = fs.statSync(abs);
      const staged: StagedApp = { fileName: f, size: stat.size, uploadedAt: stat.mtime.toISOString() };
      try {
        staged.manifest = parseAppManifest(fs.readFileSync(abs));
      } catch (err: any) {
        staged.manifestError = err.message;
      }
      return staged;
    })
    .sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt));
}

router.get('/apps', (_req, res) => {
  res.json(listStagedApps());
});

router.post('/apps/upload', upload.single('file'), (req, res) => {
  const file = (req as any).file as Express.Multer.File | undefined;
  if (!file) return res.status(400).json({ error: 'file is required' });
  const name = path.basename(file.originalname);
  if (!name.toLowerCase().endsWith('.app')) return res.status(400).json({ error: 'Only .app files are allowed' });
  fs.writeFileSync(path.join(UPLOADS_DIR, name), file.buffer);
  res.json({ ok: true });
});

router.delete('/apps/:fileName', (req, res) => {
  const name = path.basename(req.params.fileName);
  const abs = path.join(UPLOADS_DIR, name);
  if (!fs.existsSync(abs)) return res.status(404).json({ error: 'Not found' });
  fs.unlinkSync(abs);
  res.json({ ok: true });
});

router.post('/extensions/:action(install|unpublish)', asyncWrap(async (req, res) => {
  const s = loadSettings();
  const { tenantId, environment, packageId } = req.body ?? {};
  if (!tenantId || !environment || !packageId) {
    res.status(400).json({ error: 'tenantId, environment and packageId are required' });
    return;
  }
  const token = await getAccessToken(effectiveClientId(s.clientId), String(tenantId));
  const companies = await getCompanies(token, String(tenantId), String(environment));
  if (companies.length === 0) { res.status(404).json({ error: 'No companies in environment' }); return; }
  await invokeExtensionAction(token, String(tenantId), String(environment), companies[0].id, String(packageId), req.params.action as 'install' | 'unpublish');
  res.json({ ok: true });
}));

// ── Feature management ───────────────────────────────────────────────────

router.get('/features', asyncWrap(async (req, res) => {
  const s = loadSettings();
  const tenantId = String(req.query.tenantId || '');
  const environment = String(req.query.environment || '');
  if (!tenantId || !environment) { res.status(400).json({ error: 'tenantId and environment are required' }); return; }
  const token = await getAccessToken(effectiveClientId(s.clientId), tenantId);
  const companies = await getCompanies(token, tenantId, environment);
  if (companies.length === 0) { res.status(404).json({ error: 'No companies in environment' }); return; }
  const features = await getFeatures(token, tenantId, environment, companies[0].id);
  res.json({ company: companies[0], features });
}));

router.post('/features/:action(activate|deactivate)', asyncWrap(async (req, res) => {
  const s = loadSettings();
  const { tenantId, environment, featureId } = req.body ?? {};
  if (!tenantId || !environment || !featureId) {
    res.status(400).json({ error: 'tenantId, environment and featureId are required' });
    return;
  }
  const token = await getAccessToken(effectiveClientId(s.clientId), String(tenantId));
  const companies = await getCompanies(token, String(tenantId), String(environment));
  if (companies.length === 0) { res.status(404).json({ error: 'No companies in environment' }); return; }
  await invokeFeatureAction(token, String(tenantId), String(environment), companies[0].id, String(featureId), req.params.action as 'activate' | 'deactivate');
  res.json({ ok: true });
}));

// ── App updates ──────────────────────────────────────────────────────────

router.get('/app-updates', asyncWrap(async (req, res) => {
  const s = loadSettings();
  const tenantId = String(req.query.tenantId || '');
  const environment = String(req.query.environment || '');
  if (!tenantId || !environment) { res.status(400).json({ error: 'tenantId and environment are required' }); return; }
  const token = await getAccessToken(effectiveClientId(s.clientId), tenantId);
  res.json(await getAvailableAppUpdates(token, environment));
}));

router.post('/app-updates/run', asyncWrap(async (req, res) => {
  const body = req.body ?? {};
  const run = await startAppUpdateRun({
    tenantId: String(body.tenantId ?? ''),
    environment: String(body.environment ?? ''),
    apps: Array.isArray(body.apps) ? body.apps : [],
    useEnvironmentUpdateWindow: body.useEnvironmentUpdateWindow === true
  });
  res.status(201).json(run);
}));

/** All operations (app installs/updates/uninstalls, environment ops) for one environment. */
router.get('/operations', asyncWrap(async (req, res) => {
  const s = loadSettings();
  const tenantId = String(req.query.tenantId || '');
  const environment = String(req.query.environment || '');
  if (!tenantId || !environment) { res.status(400).json({ error: 'tenantId and environment are required' }); return; }
  const token = await getAccessToken(effectiveClientId(s.clientId), tenantId);
  const [operations, apps] = await Promise.all([
    getEnvironmentOperations(token, environment),
    getInstalledApps(token, environment).catch(() => [])
  ]);
  res.json({ operations, apps });
}));

// ── Storage usage ────────────────────────────────────────────────────────────

router.get('/storage', asyncWrap(async (req, res) => {
  const s = loadSettings();
  const tenantId = String(req.query.tenantId || s.tenants[0]?.id || '');
  if (!tenantId) { res.status(400).json({ error: 'tenantId is required' }); return; }
  const token = await getAccessToken(effectiveClientId(s.clientId), tenantId);
  const [usage, quotas] = await Promise.all([getUsedStorage(token), getStorageQuotas(token)]);
  res.json({ usage, quotas });
}));

// ── Session management ───────────────────────────────────────────────────────

router.get('/sessions', asyncWrap(async (req, res) => {
  const s = loadSettings();
  const tenantId = String(req.query.tenantId || '');
  const environment = String(req.query.environment || '');
  if (!tenantId || !environment) { res.status(400).json({ error: 'tenantId and environment are required' }); return; }
  const token = await getAccessToken(effectiveClientId(s.clientId), tenantId);
  res.json(await getActiveSessions(token, environment));
}));

router.delete('/sessions/:sessionId', asyncWrap(async (req, res) => {
  const s = loadSettings();
  const tenantId = String(req.query.tenantId || '');
  const environment = String(req.query.environment || '');
  const sessionId = Number(req.params.sessionId);
  if (!tenantId || !environment || !Number.isInteger(sessionId)) {
    res.status(400).json({ error: 'tenantId, environment and a numeric sessionId are required' });
    return;
  }
  const token = await getAccessToken(effectiveClientId(s.clientId), tenantId);
  await killSession(token, environment, sessionId);
  res.json({ ok: true });
}));

// ── Environment update management ────────────────────────────────────────────

/** Scheduled BC updates + update window + current version for one environment. */
router.get('/update-management', asyncWrap(async (req, res) => {
  const s = loadSettings();
  const tenantId = String(req.query.tenantId || '');
  const environment = String(req.query.environment || '');
  if (!tenantId || !environment) { res.status(400).json({ error: 'tenantId and environment are required' }); return; }
  const token = await getAccessToken(effectiveClientId(s.clientId), tenantId);
  const [updates, window, environments] = await Promise.all([
    getEnvironmentUpdates(token, environment),
    getUpdateWindow(token, environment).catch(() => null),
    listEnvironments(token).catch(() => [] as { name: string; version?: string }[])
  ]);
  const current = environments.find(e => e.name.toLowerCase() === environment.toLowerCase());
  res.json({ updates, window, currentVersion: current?.version ?? null });
}));

router.get('/timezones', asyncWrap(async (req, res) => {
  const s = loadSettings();
  const tenantId = String(req.query.tenantId || s.tenants[0]?.id || '');
  if (!tenantId) { res.status(400).json({ error: 'tenantId is required' }); return; }
  const token = await getAccessToken(effectiveClientId(s.clientId), tenantId);
  res.json(await getTimezones(token));
}));

router.put('/update-window', asyncWrap(async (req, res) => {
  const s = loadSettings();
  const { tenantId, environment, preferredStartTime, preferredEndTime, timeZoneId } = req.body ?? {};
  if (!tenantId || !environment || !preferredStartTime || !preferredEndTime || !timeZoneId) {
    res.status(400).json({ error: 'tenantId, environment, preferredStartTime, preferredEndTime and timeZoneId are required' });
    return;
  }
  const hhmm = /^([01]\d|2[0-3]):[0-5]\d$/;
  if (!hhmm.test(String(preferredStartTime)) || !hhmm.test(String(preferredEndTime))) {
    res.status(400).json({ error: 'Times must be in 24-hour HH:mm format' });
    return;
  }
  const token = await getAccessToken(effectiveClientId(s.clientId), String(tenantId));
  res.json(await setUpdateWindow(token, String(environment), {
    preferredStartTime: String(preferredStartTime),
    preferredEndTime: String(preferredEndTime),
    timeZoneId: String(timeZoneId)
  }));
}));

/** Select the target version (optionally with a date) for the next BC update. */
router.post('/updates/select', asyncWrap(async (req, res) => {
  const s = loadSettings();
  const { tenantId, environment, targetVersion } = req.body ?? {};
  if (!tenantId || !environment || !targetVersion) {
    res.status(400).json({ error: 'tenantId, environment and targetVersion are required' });
    return;
  }
  const selectedDateTime = req.body.selectedDateTime ? new Date(String(req.body.selectedDateTime)) : undefined;
  if (selectedDateTime && isNaN(selectedDateTime.getTime())) {
    res.status(400).json({ error: 'selectedDateTime is not a valid date/time' });
    return;
  }
  const token = await getAccessToken(effectiveClientId(s.clientId), String(tenantId));
  const result = await selectTargetVersion(token, String(environment), String(targetVersion), {
    selectedDateTime: selectedDateTime?.toISOString(),
    ignoreUpdateWindow: req.body.ignoreUpdateWindow === true
  });
  res.json(result);
}));

// ── Environment management ───────────────────────────────────────────────

router.get('/available-countries', asyncWrap(async (req, res) => {
  const s = loadSettings();
  const tenantId = String(req.query.tenantId || s.tenants[0]?.id || '');
  if (!tenantId) { res.status(400).json({ error: 'tenantId is required' }); return; }
  const token = await getAccessToken(effectiveClientId(s.clientId), tenantId);
  res.json(await getAvailableCountries(token, tenantId));
}));

router.post('/environments/:action(create|copy|delete)', asyncWrap(async (req, res) => {
  const body = req.body ?? {};
  const run = await startEnvironmentRun({
    tenantId: String(body.tenantId ?? ''),
    action: req.params.action as 'create' | 'copy' | 'delete',
    environment: String(body.environment ?? ''),
    sourceEnvironment: body.sourceEnvironment ? String(body.sourceEnvironment) : undefined,
    environmentType: body.environmentType === 'Production' ? 'Production' : 'Sandbox',
    countryCode: body.countryCode ? String(body.countryCode) : undefined,
    ringName: body.ringName ? String(body.ringName) : undefined
  });
  res.status(201).json(run);
}));

router.get('/compare', asyncWrap(async (req, res) => {
  const s = loadSettings();
  const targetParam = req.query.target;
  const targets = Array.isArray(targetParam) ? targetParam.map(String)
    : targetParam ? [String(targetParam)] : undefined;
  const result = await buildCompareMatrix(
    effectiveClientId(s.clientId),
    s.tenants,
    req.query.appName ? String(req.query.appName) : undefined,
    req.query.publisher ? String(req.query.publisher) : undefined,
    targets ? new Set(targets) : undefined
  );
  res.json(result);
}));

// ── Generic BC API call (API Explorer) ───────────────────────────────────

router.post('/call', asyncWrap(async (req, res) => {
  const s = loadSettings();
  const { tenantId, environment, method, path: apiPath, companyName, body } = req.body ?? {};
  if (!tenantId || !environment || !apiPath) {
    res.status(400).json({ error: 'tenantId, environment and path are required' });
    return;
  }
  const m = String(method || 'GET').toUpperCase();
  if (!['GET', 'POST', 'PATCH', 'DELETE'].includes(m)) {
    res.status(400).json({ error: 'method must be GET, POST, PATCH or DELETE' });
    return;
  }

  // Resolve and validate the URL before spending an auth round-trip
  let url: string;
  const p = String(apiPath).trim();
  if (/^https?:\/\//i.test(p)) {
    if (!p.toLowerCase().startsWith('https://api.businesscentral.dynamics.com/')) {
      res.status(400).json({ error: 'Only api.businesscentral.dynamics.com URLs are allowed' });
      return;
    }
    url = p;
  } else {
    const root = `https://api.businesscentral.dynamics.com/v2.0/${encodeURIComponent(String(tenantId))}/${encodeURIComponent(String(environment))}`;
    const rel = p.replace(/^\/+/, '');
    url = rel.startsWith('api/') ? `${root}/${rel}` : `${root}/api/v2.0/${rel}`;
  }
  if (companyName) {
    url += (url.includes('?') ? '&' : '?') + 'company=' + encodeURIComponent(String(companyName));
  }

  const token = await getAccessToken(effectiveClientId(s.clientId), String(tenantId));

  try {
    const resp = await fetch(url, {
      method: m,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
        ...(body !== undefined && body !== null && body !== '' ? { 'Content-Type': 'application/json' } : {})
      },
      body: m === 'GET' || m === 'DELETE' || body === undefined || body === null || body === ''
        ? undefined
        : typeof body === 'string' ? body : JSON.stringify(body)
    });
    const text = await resp.text();
    recordCall({
      tenantId: String(tenantId),
      environment: String(environment),
      method: m,
      path: p,
      url,
      status: resp.status,
      requestBody: body !== undefined && body !== null && body !== '' ? String(body) : undefined,
      responseBody: text
    });
    res.status(resp.status).json({
      status: resp.status,
      url,
      contentType: resp.headers.get('content-type'),
      body: text
    });
  } catch (err: any) {
    recordCall({
      tenantId: String(tenantId),
      environment: String(environment),
      method: m,
      path: p,
      url,
      error: err.message,
      requestBody: body !== undefined && body !== null && body !== '' ? String(body) : undefined
    });
    throw err;
  }
}));

router.get('/call/history', (_req, res) => {
  res.json(loadCallHistory());
});

router.delete('/call/history', (_req, res) => {
  clearCallHistory();
  res.json({ ok: true });
});

// ── Containers ─────────────────────────────────────────────────────────────

router.get('/containers/capabilities', asyncWrap(async (_req, res) => {
  res.json(await getContainerCapabilities());
}));

router.get('/containers', asyncWrap(async (_req, res) => {
  const s = loadSettings();
  const docker = await listDockerContainers();
  res.json({
    configured: s.containers,
    running: docker,
    capabilities: await getContainerCapabilities()
  });
}));

router.post('/containers/deploy', asyncWrap(async (req, res) => {
  const body = req.body as ContainerDeployRequest;
  const run = await startContainerDeployRun({
    containerNames: Array.isArray(body.containerNames) ? body.containerNames : [],
    appFiles: Array.isArray(body.appFiles) ? body.appFiles : [],
    syncMode: ['Add', 'Clean', 'Development'].includes(body.syncMode) ? body.syncMode : 'Development',
    deleteAfterDeploy: body.deleteAfterDeploy === true
  });
  res.status(201).json(run);
}));

router.post('/containers/create', asyncWrap(async (req, res) => {
  const body = req.body as CreateContainerRequest;
  const run = await startCreateContainerRun({
    containerName: String(body.containerName ?? ''),
    artifactType: body.artifactType === 'OnPrem' ? 'OnPrem' : 'Sandbox',
    country: String(body.country || 'nz'),
    select: (['Latest', 'LatestMinor', 'LatestMajor', 'NextMajor', 'NextMinor'] as const).includes(body.select) ? body.select : 'Latest',
    version: body.version ? String(body.version) : undefined,
    username: String(body.username || 'admin'),
    password: String(body.password ?? ''),
    acceptEula: body.acceptEula === true,
    memoryLimit: String(body.memoryLimit || '8G'),
    updateHosts: body.updateHosts !== false,
    includeTestToolkit: body.includeTestToolkit === true,
    includeTestLibrariesOnly: body.includeTestLibrariesOnly === true,
    includePerformanceToolkit: body.includePerformanceToolkit === true,
    assignPremiumPlan: body.assignPremiumPlan === true,
    licenseFile: body.licenseFile ? String(body.licenseFile) : undefined,
    dns: body.dns ? String(body.dns) : undefined
  });
  res.status(201).json(run);
}));

// ── Deploy runs ──────────────────────────────────────────────────────────

router.post('/deploy', asyncWrap(async (req, res) => {
  const body = req.body as DeployRequest;
  const run = await startDeployRun({
    appFiles: Array.isArray(body.appFiles) ? body.appFiles : [],
    targets: Array.isArray(body.targets) ? body.targets : [],
    schedule: body.schedule === 'UpdateWindow' ? 'UpdateWindow' : 'Immediate',
    schemaSync: body.schemaSync === 'Force' ? 'Force' : 'Add',
    acceptIsvEula: body.acceptIsvEula === true,
    delayMinutes: typeof body.delayMinutes === 'number' ? body.delayMinutes : 0,
    deleteAfterDeploy: body.deleteAfterDeploy === true
  });
  res.status(201).json(run);
}));

router.get('/runs', (_req, res) => {
  res.json(listRuns());
});

router.post('/runs/:id/cancel', (req, res) => {
  try {
    res.json(cancelRun(req.params.id));
  } catch (err: any) {
    res.status(400).json({ error: err.message });
  }
});

router.get('/runs/:id', (req, res) => {
  const run = getRun(req.params.id);
  if (!run) return res.status(404).json({ error: 'Run not found' });
  res.json(run);
});

// ── Server-sent events for live progress ─────────────────────────────────

router.get('/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no'
  });
  res.write('retry: 2000\n\n');
  const unsubscribe = onRunUpdate(run => {
    res.write(`data: ${JSON.stringify(run)}\n\n`);
  });
  const keepAlive = setInterval(() => res.write(': ping\n\n'), 25000);
  req.on('close', () => {
    unsubscribe();
    clearInterval(keepAlive);
  });
});
