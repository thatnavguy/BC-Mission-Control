import AdmZip from 'adm-zip';
import { AppManifest } from './types';

/** Extract app identity from a .app package (NavxManifest.xml inside the zip). */
export function parseAppManifest(buffer: Buffer): AppManifest {
  const zip = new AdmZip(buffer);
  const entry = zip.getEntry('NavxManifest.xml');
  if (!entry) throw new Error('NavxManifest.xml not found — not a valid .app package');
  const xml = entry.getData().toString('utf8').replace(/^\uFEFF/, '');

  const attr = (tag: string, name: string): string => {
    const re = new RegExp(`<${tag}[^>]*\\b${name}="([^"]*)"`, 'i');
    const m = xml.match(re);
    return m ? m[1] : '';
  };

  const id = attr('App', 'Id');
  const name = attr('App', 'Name');
  const publisher = attr('App', 'Publisher');
  const version = attr('App', 'Version');
  if (!id || !name) throw new Error('NavxManifest.xml is missing App Id/Name');

  const dependencies: { id: string; name: string }[] = [];
  const depRe = /<Dependency\b[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = depRe.exec(xml)) !== null) {
    const tag = m[0];
    const get = (n: string) => {
      const mm = tag.match(new RegExp(`\\b${n}="([^"]*)"`, 'i'));
      return mm ? mm[1] : '';
    };
    dependencies.push({ id: get('Id'), name: get('Name') });
  }

  return { id, name, publisher, version, dependencies };
}

/** Order apps so dependencies are deployed before dependents (simple topological sort). */
export function sortByDependencies<T extends { manifest?: AppManifest; fileName: string }>(apps: T[]): T[] {
  const byId = new Map(apps.filter(a => a.manifest).map(a => [a.manifest!.id.toLowerCase(), a]));
  const visited = new Set<string>();
  const result: T[] = [];

  const visit = (app: T, chain: Set<string>) => {
    const key = (app.manifest?.id ?? app.fileName).toLowerCase();
    if (visited.has(key) || chain.has(key)) return;
    chain.add(key);
    for (const dep of app.manifest?.dependencies ?? []) {
      const depApp = byId.get(dep.id.toLowerCase());
      if (depApp && depApp !== app) visit(depApp, chain);
    }
    chain.delete(key);
    visited.add(key);
    result.push(app);
  };

  for (const app of apps) visit(app, new Set());
  return result;
}
