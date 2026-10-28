import { spawn, execFile } from 'child_process';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { DATA_DIR, UPLOADS_DIR, loadSettings } from './store';
import { registerRun, emitRun } from './deploy';
import { parseAppManifest, sortByDependencies } from './appManifest';
import { ContainerSyncMode, DeployRun, DeployTargetResult } from './types';

const RESULT_MARKER = '__BCAC_RESULT__';

// ── Capability detection ─────────────────────────────────────────────────────

let pwshAvailable: boolean | null = null;
let helperAvailable: boolean | null = null;
let dockerAvailable: boolean | null = null;

function probe(command: string, args: string[], timeoutMs = 8000): Promise<boolean> {
  return new Promise(resolve => {
    execFile(command, args, { timeout: timeoutMs }, err => resolve(!err));
  });
}

export async function getContainerCapabilities(): Promise<{
  pwsh: boolean;
  bcContainerHelper: boolean;
  docker: boolean;
}> {
  if (pwshAvailable === null) pwshAvailable = await probe('pwsh', ['-NoProfile', '-Command', '$PSVersionTable.PSVersion']);
  if (helperAvailable === null) {
    helperAvailable = pwshAvailable && await probe('pwsh', ['-NoProfile', '-Command',
      'if (Get-Module -ListAvailable BcContainerHelper) { exit 0 } else { exit 1 }'], 20000);
  }
  if (!dockerAvailable) dockerAvailable = await probe('docker', ['version', '--format', '{{.Server.Version}}']);
  return { pwsh: pwshAvailable, bcContainerHelper: helperAvailable, docker: dockerAvailable };
}

export interface DockerContainer {
  name: string;
  image: string;
  status: string;
  running: boolean;
}

export async function listDockerContainers(): Promise<DockerContainer[]> {
  if (!(await getContainerCapabilities()).docker) return [];
  return new Promise(resolve => {
    execFile('docker', ['ps', '-a', '--format', '{{json .}}'], { timeout: 10000 }, (err, stdout) => {
      if (err) return resolve([]);
      const rows: DockerContainer[] = [];
      for (const line of stdout.split(/\r?\n/)) {
        if (!line.trim()) continue;
        try {
          const j = JSON.parse(line);
          rows.push({
            name: j.Names,
            image: j.Image,
            status: j.Status,
            running: String(j.State).toLowerCase() === 'running'
          });
        } catch { /* skip malformed line */ }
      }
      resolve(rows);
    });
  });
}

// ── Shared pwsh script runner ────────────────────────────────────────────────

function runPwshScript(
  scriptPath: string,
  args: string[],
  onLine: (line: string) => void,
  onExit: (code: number | null) => void
): void {
  const child = spawn('pwsh', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', scriptPath, ...args], {
    cwd: DATA_DIR,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let buffer = '';
  const handle = (chunk: Buffer) => {
    buffer += chunk.toString();
    let idx: number;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).replace(/\r$/, '');
      buffer = buffer.slice(idx + 1);
      onLine(line);
    }
  };
  child.stdout.on('data', handle);
  child.stderr.on('data', handle);
  child.on('close', code => {
    if (buffer.trim()) onLine(buffer);
    onExit(code);
  });
  child.on('error', () => onExit(-1));
}

function logLine(run: DeployRun, line: string): void {
  run.log.push(`[${new Date().toISOString()}] ${line}`);
  emitRun(run);
}

// ── Container app deployment ─────────────────────────────────────────────────

export interface ContainerDeployRequest {
  containerNames: string[];
  appFiles: string[];
  syncMode: ContainerSyncMode;
  /** Delete staged .app files that deployed successfully to all containers. */
  deleteAfterDeploy?: boolean;
}

export async function startContainerDeployRun(req: ContainerDeployRequest): Promise<DeployRun> {
  const caps = await getContainerCapabilities();
  if (!caps.pwsh) throw new Error('PowerShell 7 (pwsh) is not available on this machine.');
  if (!caps.bcContainerHelper) throw new Error('BcContainerHelper module is not installed. Run: Install-Module BcContainerHelper');

  const settings = loadSettings();
  const containers = settings.containers.filter(c => req.containerNames.includes(c.containerName));
  if (containers.length === 0) throw new Error('No containers selected');
  if (req.appFiles.length === 0) throw new Error('No apps selected');

  // Resolve + dependency-sort apps
  const staged = req.appFiles.map(fileName => {
    const absPath = path.join(UPLOADS_DIR, path.basename(fileName));
    if (!fs.existsSync(absPath)) throw new Error(`Staged app not found: ${fileName}`);
    let manifest;
    try { manifest = parseAppManifest(fs.readFileSync(absPath)); } catch { /* optional */ }
    return { fileName: path.basename(fileName), absPath, manifest };
  });
  const orderedApps = sortByDependencies(staged);

  const run: DeployRun = {
    id: randomUUID(),
    kind: 'container',
    startedAt: new Date().toISOString(),
    status: 'running',
    schedule: 'Immediate',
    schemaSync: 'Add',
    acceptIsvEula: false,
    deleteAfterDeploy: req.deleteAfterDeploy === true,
    results: [],
    log: []
  };

  for (const c of containers) {
    for (const app of orderedApps) {
      run.results.push({
        tenantId: '',
        tenantName: c.name,
        environment: c.containerName,
        appFile: app.fileName,
        status: 'pending',
        message: '',
        updatedAt: run.startedAt
      });
    }
  }
  registerRun(run);
  logLine(run, `Container deploy started — ${containers.length} container(s), ${orderedApps.length} app(s), syncMode ${req.syncMode}`);

  // Build the work unit file the PS script consumes
  const units = containers.flatMap(c =>
    orderedApps.map(app => ({ container: c.containerName, appPath: app.absPath, appFile: app.fileName, syncMode: req.syncMode }))
  );
  const unitsPath = path.join(DATA_DIR, `container-units-${run.id}.json`);
  fs.writeFileSync(unitsPath, JSON.stringify(units), 'utf8');

  const scriptPath = path.join(DATA_DIR, `container-deploy-${run.id}.ps1`);
  fs.writeFileSync(scriptPath, `
$ErrorActionPreference = 'Continue'
Import-Module BcContainerHelper -ErrorAction Stop
$units = Get-Content -LiteralPath $args[0] -Raw | ConvertFrom-Json
foreach ($u in $units) {
  $payload = @{ appFile = $u.appFile; container = $u.container; status = 'succeeded'; message = '' }
  try {
    Publish-BcContainerApp -containerName $u.container -appFile $u.appPath -sync -install -upgrade -syncMode $u.syncMode -skipVerification
  }
  catch {
    $payload.status = 'failed'
    $payload.message = $_.ToString()
  }
  Write-Host ("${RESULT_MARKER}" + ($payload | ConvertTo-Json -Compress))
}
`, 'utf8');

  const findResult = (appFile: string, container: string) =>
    run.results.find(r => r.appFile === appFile && r.environment === container);

  runPwshScript(scriptPath, [unitsPath], line => {
    if (line.startsWith(RESULT_MARKER)) {
      try {
        const payload = JSON.parse(line.slice(RESULT_MARKER.length));
        const r = findResult(payload.appFile, payload.container);
        if (r) {
          r.status = payload.status === 'succeeded' ? 'succeeded' : 'failed';
          r.message = payload.message ?? '';
          r.updatedAt = new Date().toISOString();
          emitRun(run);
        }
      } catch { /* ignore malformed marker */ }
      return;
    }
    logLine(run, line);
  }, code => {
    for (const r of run.results) {
      if (r.status === 'pending') {
        r.status = 'failed';
        r.message = `Script exited (code ${code}) before completing`;
        r.updatedAt = new Date().toISOString();
      }
    }
    const failed = run.results.filter(r => r.status === 'failed').length;
    run.status = failed > 0 ? 'completed-with-errors' : 'completed';
    run.finishedAt = new Date().toISOString();
    logLine(run, `Run finished — ${run.results.length - failed}/${run.results.length} succeeded (exit code ${code})`);
    if (req.deleteAfterDeploy) {
      for (const app of orderedApps) {
        const appFailed = run.results.some(r => r.appFile === app.fileName && r.status === 'failed');
        if (appFailed) continue;
        try {
          fs.unlinkSync(app.absPath);
          logLine(run, `Deleted staged app ${app.fileName}`);
        } catch (err: any) {
          logLine(run, `Could not delete staged app ${app.fileName}: ${err.message}`);
        }
      }
    }
    fs.unlink(unitsPath, () => undefined);
    fs.unlink(scriptPath, () => undefined);
  });

  return run;
}

// ── Container creation ───────────────────────────────────────────────────────

export interface CreateContainerRequest {
  containerName: string;
  artifactType: 'Sandbox' | 'OnPrem';
  country: string;
  select: 'Latest' | 'LatestMinor' | 'LatestMajor' | 'NextMajor' | 'NextMinor';
  version?: string;
  username: string;
  password: string;
  acceptEula: boolean;
  memoryLimit: string;
  updateHosts: boolean;
  includeTestToolkit: boolean;
  includeTestLibrariesOnly: boolean;
  includePerformanceToolkit: boolean;
  assignPremiumPlan: boolean;
  licenseFile?: string;
  dns?: string;
}

export async function startCreateContainerRun(req: CreateContainerRequest): Promise<DeployRun> {
  const caps = await getContainerCapabilities();
  if (!caps.pwsh) throw new Error('PowerShell 7 (pwsh) is not available on this machine.');
  if (!caps.bcContainerHelper) throw new Error('BcContainerHelper module is not installed. Run: Install-Module BcContainerHelper');
  if (!req.containerName.trim()) throw new Error('Container name is required');
  if (!req.password) throw new Error('Password is required');
  if (!req.acceptEula) throw new Error('You must accept the BC EULA to create a container');

  const run: DeployRun = {
    id: randomUUID(),
    kind: 'container-create',
    startedAt: new Date().toISOString(),
    status: 'running',
    schedule: 'Immediate',
    schemaSync: 'Add',
    acceptIsvEula: false,
    results: [{
      tenantId: '',
      tenantName: req.containerName,
      environment: req.containerName,
      appFile: '',
      status: 'running',
      message: 'Creating container...',
      updatedAt: new Date().toISOString()
    }],
    log: []
  };
  registerRun(run);
  logLine(run, `Creating container '${req.containerName}' (${req.artifactType}, ${req.country}, ${req.select})`);

  const scriptPath = path.join(DATA_DIR, `container-create-${run.id}.ps1`);
  const esc = (v: string) => `'${v.replace(/'/g, "''")}'`;
  const bool = (v: boolean) => v ? '$true' : '$false';
  fs.writeFileSync(scriptPath, `
$ErrorActionPreference = 'Stop'
Import-Module BcContainerHelper -ErrorAction Stop
$artifactUrl = Get-BcArtifactUrl -type ${esc(req.artifactType)} -country ${esc(req.country)} -select ${esc(req.select)}${req.version ? ` -version ${esc(req.version)}` : ''}
if (-not $artifactUrl) { throw 'Could not resolve artifact URL.' }
Write-Host "Artifact: $artifactUrl"
$secure = ConvertTo-SecureString -String ${esc(req.password)} -AsPlainText -Force
$cred = New-Object System.Management.Automation.PSCredential (${esc(req.username || 'admin')}, $secure)
$params = @{
  containerName = ${esc(req.containerName)}
  artifactUrl = $artifactUrl
  auth = 'UserPassword'
  credential = $cred
  accept_eula = $true
  accept_outdated = $true
  memoryLimit = ${esc(req.memoryLimit || '8G')}
  updateHosts = ${bool(req.updateHosts)}
  includeTestToolkit = ${bool(req.includeTestToolkit)}
  includeTestLibrariesOnly = ${bool(req.includeTestLibrariesOnly)}
  includePerformanceToolkit = ${bool(req.includePerformanceToolkit)}
  assignPremiumPlan = ${bool(req.assignPremiumPlan)}
}
${req.licenseFile ? `$params['licenseFile'] = ${esc(req.licenseFile)}` : ''}
${req.dns ? `$params['dns'] = ${esc(req.dns)}` : ''}
New-BcContainer @params
Write-Host '${RESULT_MARKER}{"status":"succeeded"}'
`, 'utf8');

  runPwshScript(scriptPath, [], line => {
    if (line.startsWith(RESULT_MARKER)) {
      const r = run.results[0];
      r.status = line.includes('succeeded') ? 'succeeded' : 'failed';
      r.message = r.status === 'succeeded' ? 'Container created' : 'Creation failed';
      r.updatedAt = new Date().toISOString();
      emitRun(run);
      return;
    }
    logLine(run, line);
  }, code => {
    const r = run.results[0];
    if (r.status === 'running' || r.status === 'pending') {
      r.status = code === 0 ? 'succeeded' : 'failed';
      r.message = code === 0 ? 'Container created' : `Creation failed (exit code ${code})`;
      r.updatedAt = new Date().toISOString();
    }
    run.status = r.status === 'succeeded' ? 'completed' : 'failed';
    run.finishedAt = new Date().toISOString();
    logLine(run, `Container creation finished (exit code ${code})`);
    fs.unlink(scriptPath, () => undefined);
  });

  return run;
}
