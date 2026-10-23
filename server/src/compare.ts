import { getAccessToken } from './auth';
import { getCompanies, getExtensions, InstalledExtension } from './bcClient';
import { TenantConfig } from './types';

export interface CompareCell {
  version: string | null;
  scope: string;
  isInstalled: boolean;
  isLatest: boolean;
}

export interface CompareRow {
  appId: string;
  name: string;
  publisher: string;
  drift: boolean | null; // null = not installed anywhere comparable
  cells: Record<string, CompareCell>; // key = `${tenantId}|${environment}`
}

export interface CompareColumn {
  key: string;
  tenantName: string;
  environment: string;
  error?: string;
}

export interface CompareResult {
  columns: CompareColumn[];
  rows: CompareRow[];
}

function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(n => parseInt(n, 10) || 0);
  const pb = b.split('.').map(n => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

export function versionString(e: InstalledExtension): string {
  return `${e.versionMajor}.${e.versionMinor}.${e.versionBuild}.${e.versionRevision}`;
}

/** Build the app-version matrix across selected (or all enabled) tenant/environment combos. */
export async function buildCompareMatrix(
  clientId: string,
  tenants: TenantConfig[],
  nameFilter?: string,
  publisherFilter?: string,
  onlyTargets?: Set<string> // keys: `${tenantId}|${environment}`
): Promise<CompareResult> {
  const targets: { tenant: TenantConfig; environment: string; key: string }[] = [];
  for (const tenant of tenants) {
    for (const [env, enabled] of Object.entries(tenant.environments)) {
      if (!enabled) continue;
      const key = `${tenant.id}|${env}`;
      if (onlyTargets && onlyTargets.size > 0 && !onlyTargets.has(key)) continue;
      targets.push({ tenant, environment: env, key });
    }
  }

  const columns: CompareColumn[] = targets.map(t => ({
    key: t.key, tenantName: t.tenant.name, environment: t.environment
  }));

  // Fetch extensions per environment (bounded parallelism across all targets)
  const appsByKey = new Map<string, InstalledExtension[]>();
  const queue = [...targets];
  const workers = Array.from({ length: Math.min(5, queue.length || 1) }, async () => {
    while (queue.length > 0) {
      const t = queue.shift();
      if (!t) return;
      try {
        const token = await getAccessToken(clientId, t.tenant.id);
        const companies = await getCompanies(token, t.tenant.id, t.environment);
        if (companies.length === 0) throw new Error('No companies in environment');
        appsByKey.set(t.key, await getExtensions(token, t.tenant.id, t.environment, companies[0].id));
      } catch (err: any) {
        const col = columns.find(c => c.key === t.key);
        if (col) col.error = err.message;
      }
    }
  });
  await Promise.all(workers);

  // Collect unique apps passing the filters
  const seen = new Map<string, { name: string; publisher: string }>();
  const nameLc = nameFilter?.toLowerCase();
  const pubLc = publisherFilter?.toLowerCase();
  for (const apps of appsByKey.values()) {
    for (const app of apps) {
      if (nameLc && !app.displayName?.toLowerCase().includes(nameLc)) continue;
      if (pubLc && !app.publisher?.toLowerCase().includes(pubLc)) continue;
      if (!seen.has(app.id)) seen.set(app.id, { name: app.displayName, publisher: app.publisher });
    }
  }

  const comparableCols = columns.filter(c => !c.error);
  const rows: CompareRow[] = [...seen.entries()]
    .sort((a, b) => a[1].name.localeCompare(b[1].name))
    .map(([appId, meta]) => {
      const cells: Record<string, CompareCell> = {};
      const installedVersions: string[] = [];

      for (const col of columns) {
        const apps = appsByKey.get(col.key);
        if (col.error || !apps) {
          cells[col.key] = { version: null, scope: 'ERR', isInstalled: false, isLatest: false };
          continue;
        }
        const candidates = apps.filter(a => a.id.toLowerCase() === appId.toLowerCase());
        const installed = candidates.filter(a => a.isInstalled).sort((a, b) => compareVersions(versionString(a), versionString(b))).pop();
        const uninstalled = candidates.filter(a => !a.isInstalled).sort((a, b) => compareVersions(versionString(a), versionString(b))).pop();
        if (installed) {
          const version = versionString(installed);
          installedVersions.push(version);
          cells[col.key] = { version, scope: installed.publishedAs || 'PTE', isInstalled: true, isLatest: false };
        } else if (uninstalled) {
          cells[col.key] = { version: versionString(uninstalled), scope: `Uninstalled/${uninstalled.publishedAs || 'PTE'}`, isInstalled: false, isLatest: false };
        } else {
          cells[col.key] = { version: null, scope: '', isInstalled: false, isLatest: false };
        }
      }

      const unique = [...new Set(installedVersions)];
      const drift = installedVersions.length === 0
        ? null
        : unique.length > 1 || installedVersions.length < comparableCols.length;

      if (unique.length > 1) {
        const maxVer = unique.sort(compareVersions).pop()!;
        for (const col of columns) {
          if (cells[col.key]?.version === maxVer && cells[col.key]?.isInstalled) {
            cells[col.key].isLatest = true;
          }
        }
      }

      return { appId, name: meta.name, publisher: meta.publisher, drift, cells };
    });

  return { columns, rows };
}
