import { randomUUID } from 'crypto';
import { loadSettings } from './store';
import { effectiveClientId, getAccessToken } from './auth';
import {
  copyEnvironment, createEnvironment, deleteEnvironment,
  getAppOperation, getEnvironmentOperation, listEnvironments, updateApp
} from './bcClient';
import { emitRun, registerRun } from './deploy';
import { DeployRun, DeployTargetResult, EnvironmentInfo } from './types';

const APP_UPDATE_POLL_MS = 15 * 1000;
const APP_UPDATE_TIMEOUT_MS = 30 * 60 * 1000;
const ENV_OP_POLL_MS = 20 * 1000;
const ENV_OP_TIMEOUT_MS = 60 * 60 * 1000;

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

function logLine(run: DeployRun, msg: string): void {
  run.log.push(`[${new Date().toISOString()}] ${msg}`);
  emitRun(run);
}

function setResult(run: DeployRun, result: DeployTargetResult, patch: Partial<DeployTargetResult>, line?: string): void {
  Object.assign(result, patch, { updatedAt: new Date().toISOString() });
  if (line) run.log.push(`[${new Date().toISOString()}] ${result.tenantName}/${result.environment} ${result.appFile}: ${line}`);
  emitRun(run);
}

function finishRun(run: DeployRun): void {
  const failed = run.results.filter(r => r.status === 'failed').length;
  run.status = failed > 0 ? 'completed-with-errors' : 'completed';
  run.finishedAt = new Date().toISOString();
  run.log.push(`[${run.finishedAt}] Run finished — ${run.results.length - failed}/${run.results.length} target(s) OK`);
  emitRun(run);
}

function failFatally(run: DeployRun, err: any): void {
  run.log.push(`[${new Date().toISOString()}] Fatal: ${err.message}`);
  run.status = 'failed';
  run.finishedAt = new Date().toISOString();
  emitRun(run);
}

// ── App updates ──────────────────────────────────────────────────────────────

export interface AppUpdateRequest {
  tenantId: string;
  environment: string;
  apps: { appId: string; name: string; targetVersion: string }[];
  useEnvironmentUpdateWindow: boolean;
}

export async function startAppUpdateRun(req: AppUpdateRequest): Promise<DeployRun> {
  const settings = loadSettings();
  const tenant = settings.tenants.find(t => t.id === req.tenantId);
  if (!tenant) throw new Error(`Unknown tenant: ${req.tenantId}`);
  if (!req.environment) throw new Error('Environment is required');
  const apps = (req.apps ?? []).filter(a => a.appId && a.targetVersion);
  if (apps.length === 0) throw new Error('No apps selected');

  const run: DeployRun = {
    id: randomUUID(),
    kind: 'app-update',
    startedAt: new Date().toISOString(),
    status: 'running',
    results: apps.map(a => ({
      tenantId: tenant.id,
      tenantName: tenant.name,
      environment: req.environment,
      appFile: `${a.name} → ${a.targetVersion}`,
      status: 'pending',
      message: '',
      updatedAt: new Date().toISOString()
    })),
    log: []
  };
  registerRun(run);
  logLine(run, `App update run started — ${apps.length} app(s) on ${tenant.name}/${req.environment}, ${req.useEnvironmentUpdateWindow ? 'update window' : 'immediate'}`);

  executeAppUpdates(run, req, apps).catch(err => failFatally(run, err));
  return run;
}

async function executeAppUpdates(
  run: DeployRun,
  req: AppUpdateRequest,
  apps: { appId: string; name: string; targetVersion: string }[]
): Promise<void> {
  const settings = loadSettings();
  let token: string;
  try {
    token = await getAccessToken(effectiveClientId(settings.clientId), req.tenantId);
  } catch (err: any) {
    for (const r of run.results) setResult(run, r, { status: 'failed', message: `Auth failed: ${err.message}` });
    finishRun(run);
    return;
  }

  for (let i = 0; i < apps.length; i++) {
    const app = apps[i];
    const result = run.results[i];
    try {
      setResult(run, result, { status: 'running', message: 'Requesting update...' });
      const op = await updateApp(token, req.environment, app.appId, app.targetVersion, req.useEnvironmentUpdateWindow);
      const status = (op.status ?? '').toLowerCase();

      if (status === 'scheduled') {
        setResult(run, result, { status: 'scheduled', message: 'Scheduled in update window', operationId: op.id }, `scheduled, operation ${op.id ?? 'unknown'}`);
        continue;
      }
      if (status === 'succeeded') {
        setResult(run, result, { status: 'succeeded', message: 'Updated', operationId: op.id }, 'succeeded');
        continue;
      }
      if (status === 'failed' || status === 'canceled' || status === 'skipped') {
        throw new Error(op.errorMessage || `Update ${op.status}`);
      }

      setResult(run, result, { status: 'running', message: 'Update running...', operationId: op.id });

      const started = Date.now();
      let done = false;
      while (Date.now() - started < APP_UPDATE_TIMEOUT_MS) {
        await sleep(APP_UPDATE_POLL_MS);
        const current = await getAppOperation(token, req.environment, app.appId, op.id).catch(() => undefined);
        const s = (current?.status ?? '').toLowerCase();
        if (s === 'succeeded') {
          setResult(run, result, { status: 'succeeded', message: 'Updated' }, 'succeeded');
          done = true;
          break;
        }
        if (s === 'failed' || s === 'canceled' || s === 'skipped') {
          setResult(run, result, { status: 'failed', message: current?.errorMessage || `Update ${s}` }, `failed — ${current?.errorMessage || s}`);
          done = true;
          break;
        }
        if (s === 'scheduled') {
          setResult(run, result, { status: 'scheduled', message: 'Scheduled in update window' }, 'scheduled');
          done = true;
          break;
        }
      }
      if (!done) {
        setResult(run, result, { status: 'succeeded', message: 'Update accepted; status polling timed out — check Deployment Status later' }, 'polling timed out');
      }
    } catch (err: any) {
      setResult(run, result, { status: 'failed', message: err.message }, `failed — ${err.message}`);
    }
  }
  finishRun(run);
}

// ── Environment lifecycle ────────────────────────────────────────────────────

export interface EnvironmentManageRequest {
  tenantId: string;
  action: 'create' | 'copy' | 'delete';
  environment: string;          // new name for create/copy; deleted env for delete
  sourceEnvironment?: string;   // copy source
  environmentType?: 'Production' | 'Sandbox';
  countryCode?: string;
  ringName?: string;
}

export async function startEnvironmentRun(req: EnvironmentManageRequest): Promise<DeployRun> {
  const settings = loadSettings();
  const tenant = settings.tenants.find(t => t.id === req.tenantId);
  if (!tenant) throw new Error(`Unknown tenant: ${req.tenantId}`);
  if (!req.environment || !/^[a-zA-Z][a-zA-Z0-9_-]{0,29}$/.test(req.environment)) {
    throw new Error('Environment name must start with a letter and use only letters, numbers, dashes and underscores (max 30 chars)');
  }
  if (req.action === 'copy' && !req.sourceEnvironment) throw new Error('Source environment is required for copy');
  if (req.action === 'create' && !req.countryCode) throw new Error('Country code is required for create');

  const label = req.action === 'create'
    ? `Create ${req.environmentType ?? 'Sandbox'}`
    : req.action === 'copy'
      ? `Copy from ${req.sourceEnvironment}`
      : 'Delete environment';

  const run: DeployRun = {
    id: randomUUID(),
    kind: 'environment',
    startedAt: new Date().toISOString(),
    status: 'running',
    results: [{
      tenantId: tenant.id,
      tenantName: tenant.name,
      environment: req.environment,
      appFile: label,
      status: 'pending',
      message: '',
      updatedAt: new Date().toISOString()
    }],
    log: []
  };
  registerRun(run);
  logLine(run, `${label}: '${req.environment}' on tenant ${tenant.name}`);

  executeEnvironmentOp(run, req).catch(err => failFatally(run, err));
  return run;
}

async function executeEnvironmentOp(run: DeployRun, req: EnvironmentManageRequest): Promise<void> {
  const result = run.results[0];
  const succeed = (message: string) => {
    setResult(run, result, { status: 'succeeded', message }, 'succeeded');
    finishRun(run);
  };
  try {
    const settings = loadSettings();
    const token = await getAccessToken(effectiveClientId(settings.clientId), req.tenantId);
    setResult(run, result, { status: 'running', message: 'Submitting request...' });

    let opId: string | undefined;
    if (req.action === 'create') {
      const op = await createEnvironment(token, req.environment, req.environmentType ?? 'Sandbox', req.countryCode!, req.ringName);
      opId = op.id;
    } else if (req.action === 'copy') {
      const op = await copyEnvironment(token, req.sourceEnvironment!, req.environment, req.environmentType ?? 'Sandbox');
      opId = op.id;
    } else {
      const op = await deleteEnvironment(token, req.environment);
      opId = op.id;
    }

    setResult(run, result, {
      status: 'running',
      message: req.action === 'delete' ? 'Deletion in progress...' : 'Provisioning — this can take a while...',
      operationId: opId
    }, `operation ${opId ?? 'unknown'} accepted`);

    const started = Date.now();
    while (Date.now() - started < ENV_OP_TIMEOUT_MS) {
      await sleep(ENV_OP_POLL_MS);

      if (opId) {
        const op = await getEnvironmentOperation(token, req.environment, opId);
        const s = (op?.status ?? '').toLowerCase();
        if (s === 'succeeded') {
          succeed(req.action === 'delete' ? 'Deleted (soft delete — recoverable for 14 days)' : 'Environment is ready');
          return;
        }
        if (s === 'failed' || s === 'canceled') {
          setResult(run, result, { status: 'failed', message: op?.errorMessage || `Operation ${s}` }, `failed — ${op?.errorMessage || s}`);
          finishRun(run);
          return;
        }
      }

      // Cross-check the environment list: create/copy is done once the env is
      // Active; delete is done once it drops out of the (filtered) list.
      const envs: EnvironmentInfo[] = await listEnvironments(token).catch(() => [] as EnvironmentInfo[]);
      const env = envs.find(e => e.name.toLowerCase() === req.environment.toLowerCase());
      if (req.action === 'delete' && !env) {
        succeed('Deleted (soft delete — recoverable for 14 days)');
        return;
      }
      if (req.action !== 'delete' && env && (env.status ?? '').toLowerCase() === 'active') {
        succeed('Environment is ready');
        return;
      }
    }

    setResult(run, result, { status: 'scheduled', message: 'Operation accepted; still in progress — check the Admin Center' }, 'polling timed out');
  } catch (err: any) {
    setResult(run, result, { status: 'failed', message: err.message }, `failed — ${err.message}`);
  }
  finishRun(run);
}
