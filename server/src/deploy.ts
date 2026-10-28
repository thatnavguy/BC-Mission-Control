import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { UPLOADS_DIR, loadSettings } from './store';
import { effectiveClientId, getAccessToken } from './auth';
import { publishPteImmediate, schedulePteInstall } from './bcClient';
import { parseAppManifest, sortByDependencies } from './appManifest';
import {
  DeployRun, DeployTargetResult, ScheduleOption, SchemaSyncOption, StagedApp
} from './types';

const MAX_PARALLEL = 5;
const MAX_DELAY_MINUTES = 24 * 60;
const MAX_RUNS = 100;
const PTE_SCHEDULE_MAX_BYTES = 50 * 1000 * 1000;
const runs = new Map<string, DeployRun>();
const delayTimers = new Map<string, NodeJS.Timeout>();
const listeners = new Set<(run: DeployRun) => void>();

export function onRunUpdate(listener: (run: DeployRun) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function emit(run: DeployRun): void {
  for (const l of listeners) l(run);
}

/** Insert a run and prune the registry to MAX_RUNS (oldest finished runs first). */
function addRun(run: DeployRun): void {
  runs.set(run.id, run);
  if (runs.size <= MAX_RUNS) return;
  // Map iterates in insertion order, oldest first
  for (const [id, existing] of runs) {
    if (runs.size <= MAX_RUNS) break;
    if (existing.status === 'running' || existing.status === 'waiting') continue;
    runs.delete(id);
  }
}

/** Register a run (used by container orchestration too) and broadcast it. */
export function registerRun(run: DeployRun): void {
  addRun(run);
  emit(run);
}

/** Broadcast a run's current state after mutation. */
export function emitRun(run: DeployRun): void {
  emit(run);
}

export function listRuns(): DeployRun[] {
  return [...runs.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export function getRun(id: string): DeployRun | undefined {
  return runs.get(id);
}

function setResult(run: DeployRun, result: DeployTargetResult, patch: Partial<DeployTargetResult>, logLine?: string): void {
  Object.assign(result, patch, { updatedAt: new Date().toISOString() });
  if (logLine) run.log.push(`[${new Date().toISOString()}] ${result.tenantName}/${result.environment} ${result.appFile}: ${logLine}`);
  emit(run);
}

export interface DeployRequest {
  appFiles: string[];
  targets: { tenantId: string; environment: string }[];
  schedule: ScheduleOption;
  schemaSync: SchemaSyncOption;
  acceptIsvEula: boolean;
  /** Minutes to wait before the run starts executing (0 = start now). */
  delayMinutes?: number;
  /** Delete staged .app files that deployed successfully to all targets. */
  deleteAfterDeploy?: boolean;
}

export async function startDeployRun(req: DeployRequest): Promise<DeployRun> {
  const settings = loadSettings();
  const clientId = effectiveClientId(settings.clientId);

  // Validate apps
  const apps: (StagedApp & { absPath: string })[] = req.appFiles.map(fileName => {
    const absPath = path.join(UPLOADS_DIR, path.basename(fileName));
    if (!fs.existsSync(absPath)) throw new Error(`Staged app not found: ${fileName}`);
    return { fileName: path.basename(fileName), absPath, size: 0, uploadedAt: '' };
  });
  if (apps.length === 0) throw new Error('No apps selected');

  if (req.schedule === 'UpdateWindow') {
    if (!req.acceptIsvEula) {
      throw new Error("UpdateWindow deployment requires accepting the PTE's ISV EULA.");
    }
    for (const app of apps) {
      const size = fs.statSync(app.absPath).size;
      if (size > PTE_SCHEDULE_MAX_BYTES) {
        throw new Error(`'${app.fileName}' is ${(size / 1e6).toFixed(1)} MB — scheduled uploads are limited to 50 MB.`);
      }
    }
  }

  // Validate targets
  if (req.targets.length === 0) throw new Error('No target environments selected');
  for (const t of req.targets) {
    if (!settings.tenants.some(tenant => tenant.id === t.tenantId)) {
      throw new Error(`Unknown tenant: ${t.tenantId}`);
    }
  }

  const delayMinutes = Math.floor(req.delayMinutes ?? 0);
  if (delayMinutes < 0 || delayMinutes > MAX_DELAY_MINUTES) {
    throw new Error(`Delay must be between 0 and ${MAX_DELAY_MINUTES} minutes`);
  }

  const run: DeployRun = {
    id: randomUUID(),
    kind: 'cloud',
    startedAt: new Date().toISOString(),
    status: 'running',
    schedule: req.schedule,
    schemaSync: req.schemaSync,
    acceptIsvEula: req.acceptIsvEula,
    deleteAfterDeploy: req.deleteAfterDeploy === true,
    results: [],
    log: []
  };

  const tenantName = (id: string) => settings.tenants.find(t => t.id === id)?.name ?? id;
  for (const target of req.targets) {
    for (const app of apps) {
      run.results.push({
        tenantId: target.tenantId,
        tenantName: tenantName(target.tenantId),
        environment: target.environment,
        appFile: app.fileName,
        status: 'pending',
        message: '',
        updatedAt: run.startedAt
      });
    }
  }
  addRun(run);
  run.log.push(`[${run.startedAt}] Run started — schedule: ${req.schedule}, schemaSync: ${req.schemaSync}`);

  const execute = () => {
    run.log.push(`[${new Date().toISOString()}] Deployment starting`);
    executeRun(run, apps, req).catch(err => {
      run.log.push(`[${new Date().toISOString()}] Fatal: ${err.message}`);
      run.status = 'failed';
      run.finishedAt = new Date().toISOString();
      emit(run);
    });
  };

  if (delayMinutes > 0) {
    // Hold the run — nothing is sent to BC until the delay elapses.
    // The timer lives in this server process; a restart loses pending runs.
    run.status = 'waiting';
    run.delayMinutes = delayMinutes;
    run.scheduledStartAt = new Date(Date.now() + delayMinutes * 60000).toISOString();
    run.log.push(`[${run.startedAt}] Delayed start — deployment begins at ${run.scheduledStartAt}`);
    emit(run);
    const timer = setTimeout(() => {
      delayTimers.delete(run.id);
      if (run.status !== 'waiting') return;
      run.status = 'running';
      emit(run);
      execute();
    }, delayMinutes * 60000);
    delayTimers.set(run.id, timer);
    return run;
  }

  emit(run);

  // Fire and forget — progress flows through SSE
  execute();

  return run;
}

/** Cancel a run that is still waiting for its delayed start. */
export function cancelRun(id: string): DeployRun {
  const run = runs.get(id);
  if (!run) throw new Error('Run not found');
  if (run.status !== 'waiting') throw new Error('Only a run waiting for its delayed start can be canceled');
  const timer = delayTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    delayTimers.delete(id);
  }
  run.status = 'canceled';
  run.finishedAt = new Date().toISOString();
  for (const r of run.results) {
    if (r.status === 'pending') {
      Object.assign(r, { status: 'skipped' as const, message: 'Canceled before start', updatedAt: run.finishedAt });
    }
  }
  run.log.push(`[${run.finishedAt}] Run canceled by user before start`);
  emit(run);
  return run;
}

async function executeRun(
  run: DeployRun,
  apps: (StagedApp & { absPath: string })[],
  req: DeployRequest
): Promise<void> {
  // Sort apps by dependency order using staged manifests
  const staged = apps.map(a => {
    try {
      const manifest = parseAppManifest(fs.readFileSync(a.absPath));
      return { ...a, manifest };
    } catch {
      return a;
    }
  });
  const orderedApps = sortByDependencies(staged);

  // Acquire tokens sequentially per tenant (refresh tokens rotate)
  const tenantIds = [...new Set(req.targets.map(t => t.tenantId))];
  const settings = loadSettings();
  const tokens = new Map<string, string>();
  for (const tenantId of tenantIds) {
    try {
      tokens.set(tenantId, await getAccessToken(effectiveClientId(settings.clientId), tenantId));
      run.log.push(`[${new Date().toISOString()}] Auth OK for tenant ${tenantIds.length > 1 ? tenantId : ''}`.trim());
    } catch (err: any) {
      for (const r of run.results.filter(r => r.tenantId === tenantId)) {
        setResult(run, r, { status: 'failed', message: `Auth failed: ${err.message}` });
      }
    }
    emit(run);
  }

  // Build work units: one per (tenant, environment, app)
  interface WorkUnit {
    tenantId: string;
    environment: string;
    app: (typeof orderedApps)[number];
    results: DeployTargetResult[];
  }
  const units: WorkUnit[] = [];
  for (const target of req.targets) {
    if (!tokens.has(target.tenantId)) continue;
    for (const app of orderedApps) {
      const results = run.results.filter(
        r => r.tenantId === target.tenantId && r.environment === target.environment && r.appFile === app.fileName
      );
      units.push({ tenantId: target.tenantId, environment: target.environment, app, results });
    }
  }

  // Group units by environment: units within one environment run sequentially
  // (Immediate deploys share a single extensionUpload slot), environments run
  // in parallel up to MAX_PARALLEL.
  const groups = new Map<string, WorkUnit[]>();
  for (const unit of units) {
    const key = `${unit.tenantId}/${unit.environment}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(unit);
  }

  const groupQueue = [...groups.values()];
  async function worker(): Promise<void> {
    while (groupQueue.length > 0) {
      const group = groupQueue.shift();
      if (!group) return;
      for (const unit of group) {
        await executeUnit(run, unit.tenantId, unit.environment, unit.app, unit.results, tokens.get(unit.tenantId)!, req);
      }
    }
  }
  const workerCount = Math.min(MAX_PARALLEL, groups.size || 1);
  await Promise.all(Array.from({ length: workerCount }, worker));

  const failed = run.results.filter(r => r.status === 'failed').length;
  run.status = failed > 0 ? 'completed-with-errors' : 'completed';
  run.finishedAt = new Date().toISOString();
  run.log.push(`[${run.finishedAt}] Run finished — ${run.results.length - failed}/${run.results.length} target(s) OK`);

  if (req.deleteAfterDeploy) {
    for (const app of orderedApps) {
      const appFailed = run.results.some(r => r.appFile === app.fileName && r.status === 'failed');
      if (appFailed) continue;
      try {
        fs.unlinkSync(app.absPath);
        run.log.push(`[${new Date().toISOString()}] Deleted staged app ${app.fileName}`);
      } catch (err: any) {
        run.log.push(`[${new Date().toISOString()}] Could not delete staged app ${app.fileName}: ${err.message}`);
      }
    }
  }
  emit(run);
}

async function executeUnit(
  run: DeployRun,
  tenantId: string,
  environment: string,
  app: StagedApp & { absPath: string },
  results: DeployTargetResult[],
  token: string,
  req: DeployRequest
): Promise<void> {
  const report = (patch: Partial<DeployTargetResult>, logLine?: string) => {
    for (const r of results) setResult(run, r, patch, logLine);
  };
  try {
    const buffer = fs.readFileSync(app.absPath);
    if (req.schedule === 'UpdateWindow') {
      report({ status: 'running', message: 'Scheduling for update window...' });
      const operation = await schedulePteInstall(
        token,
        environment,
        buffer,
        app.fileName,
        req.schemaSync === 'Force' ? 'ForceSync' : 'Add',
        req.acceptIsvEula
      );
      const status = (operation.status ?? '').toLowerCase();
      if (status === 'scheduled') {
        report({ status: 'scheduled', message: `Scheduled (operation ${operation.id ?? 'unknown'})`, operationId: operation.id }, `scheduled, operation ${operation.id ?? 'unknown'}`);
      } else if (status === 'succeeded') {
        report({ status: 'succeeded', message: 'Installed', operationId: operation.id }, 'succeeded');
      } else if (status === 'running') {
        report({ status: 'running', message: `Install running (operation ${operation.id ?? 'unknown'})`, operationId: operation.id }, 'install running');
      } else {
        throw new Error(`Unexpected operation status '${operation.status ?? 'none'}'`);
      }
    } else {
      if (!app.manifest) throw new Error('Could not read app manifest (invalid .app file)');
      report({ status: 'running', message: 'Publishing...' });
      const outcome = await publishPteImmediate(
        token,
        tenantId,
        environment,
        buffer,
        { id: app.manifest.id, name: app.manifest.name, version: app.manifest.version },
        req.schemaSync,
        msg => report({ status: 'running', message: msg })
      );
      if (outcome.status === 'succeeded') report({ status: 'succeeded', message: outcome.message }, 'succeeded');
      else if (outcome.status === 'skipped') report({ status: 'skipped', message: outcome.message }, 'skipped');
      else report({ status: 'failed', message: outcome.message }, `failed — ${outcome.message}`);
    }
  } catch (err: any) {
    report({ status: 'failed', message: err.message }, `failed — ${err.message}`);
  }
}
