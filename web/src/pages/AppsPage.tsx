import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge, Button, Card, Dialog, DialogActions, DialogBody, DialogContent,
  DialogSurface, DialogTitle, Dropdown, Input, makeStyles, Menu, MenuButton,
  MenuItem, MenuList, MenuPopover, MenuTrigger, MessageBar,
  MessageBarBody, Option, Spinner, Table, TableBody, TableCell, TableHeader,
  TableHeaderCell, TableRow, Text, Title2, tokens
} from '@fluentui/react-components';
import {
  ArrowDownload24Regular, ArrowSync24Regular, Delete24Regular, Search24Regular
} from '@fluentui/react-icons';
import { api, subscribeRuns } from '../api';
import EmptyState from '../components/EmptyState';
import { useSharedStyles } from '../theme';
import { AuthStatus, DeployRun, Settings } from '../types';
import TargetPicker, { TargetSelection } from '../components/TargetPicker';

const useStyles = makeStyles({
  stack: { display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1200px' },
  row: { display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }
});

interface Extension {
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

function version(e: Extension): string {
  return `${e.versionMajor}.${e.versionMinor}.${e.versionBuild}.${e.versionRevision}`;
}

function compareVersions(a: Extension, b: Extension): number {
  return (
    a.versionMajor - b.versionMajor || a.versionMinor - b.versionMinor ||
    a.versionBuild - b.versionBuild || a.versionRevision - b.versionRevision
  );
}

function scopeBadge(scope: string) {
  const s = (scope || 'PTE').trim() || 'PTE';
  if (s === 'Global') return <Badge appearance="outline" color="brand">AppSource</Badge>;
  if (s === 'Dev') return <Badge appearance="outline" color="danger">Dev</Badge>;
  return <Badge appearance="outline" color="success">PTE</Badge>;
}

const SCOPE_LABELS: Record<string, string> = { all: 'All scopes', Global: 'AppSource', PTE: 'PTE', Dev: 'Dev' };

function scopeOf(e: Extension): string {
  return (e.publishedAs || 'PTE').trim() || 'PTE';
}

/** Mirrors pickBulkTargets on the server — used only for the confirm-dialog count. */
function bulkTargets(list: Extension[], action: 'install-all' | 'unpublish-old', scope: string): Extension[] {
  const byId = new Map<string, Extension[]>();
  for (const e of list) {
    const key = e.id.toLowerCase();
    if (!byId.has(key)) byId.set(key, []);
    byId.get(key)!.push(e);
  }
  const items: Extension[] = [];
  for (const versions of byId.values()) {
    const sorted = [...versions].sort(compareVersions);
    const latest = sorted[sorted.length - 1];
    if (!latest) continue;
    if (action === 'install-all') {
      if (!latest.isInstalled && (scope === 'all' || scopeOf(latest).toLowerCase() === scope.toLowerCase())) items.push(latest);
    } else {
      for (const v of sorted) {
        if (v.packageId === latest.packageId || v.isInstalled) continue;
        if (scopeOf(v) === 'Global') continue;
        if (scope !== 'all' && scopeOf(v).toLowerCase() !== scope.toLowerCase()) continue;
        items.push(v);
      }
    }
  }
  return items;
}

function resultBadge(status: string) {
  switch (status) {
    case 'running': return <Badge appearance="filled" color="warning">Running</Badge>;
    case 'succeeded': return <Badge appearance="filled" color="success">Succeeded</Badge>;
    case 'failed': return <Badge appearance="filled" color="danger">Failed</Badge>;
    default: return <Badge appearance="outline">{status}</Badge>;
  }
}

export default function AppsPage() {
  const styles = useStyles();
  const shared = useSharedStyles();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [target, setTarget] = useState<TargetSelection | null>(null);
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState('');
  const [filter, setFilter] = useState('');
  const [scopeSel, setScopeSel] = useState('all');
  const [bulkConfirm, setBulkConfirm] = useState<'install-all' | 'unpublish-old' | null>(null);
  const [activeRun, setActiveRun] = useState<DeployRun | null>(null);

  // Track live progress of bulk extension runs
  useEffect(() => subscribeRuns(run => {
    if (run.kind !== 'ext-bulk') return;
    setActiveRun(prev => {
      if (prev && prev.id !== run.id && prev.status === 'running') return prev;
      return run;
    });
  }), []);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    Promise.all([
      api.get<Settings>('/api/settings'),
      api.get<AuthStatus>('/api/auth/status')
    ]).then(([s, a]) => {
      setSettings(s);
      setAuth(a);
      const first = s.tenants.find(t => Object.values(t.environments).some(Boolean));
      if (first) {
        setTarget({
          tenantId: first.id,
          tenantName: first.name,
          environment: Object.entries(first.environments).find(([, e]) => e)![0]
        });
      }
    }).catch(e => setError(e.message));
  }, []);

  const load = useCallback(async () => {
    if (!target) return;
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const resp = await api.get<{ extensions: Extension[] }>(
        `/api/extensions?tenantId=${encodeURIComponent(target.tenantId)}&environment=${encodeURIComponent(target.environment)}`
      );
      setExtensions(resp.extensions);
    } catch (e: any) {
      setError(e.message);
      setExtensions([]);
    } finally {
      setLoading(false);
    }
  }, [target]);

  const act = async (ext: Extension, action: 'install' | 'unpublish', label: string) => {
    if (!target) return;
    setError('');
    setNotice('');
    setBusyKey(ext.packageId);
    try {
      await api.post(`/api/extensions/${action}`, {
        tenantId: target.tenantId,
        environment: target.environment,
        packageId: ext.packageId
      });
      setNotice(`${label} submitted for "${ext.displayName}" ${version(ext)}. Check Deployment Status for progress.`);
      await load();
    } catch (e: any) {
      setError(`${label} failed for "${ext.displayName}": ${e.message}`);
    } finally {
      setBusyKey('');
    }
  };

  const startBulk = async () => {
    if (!target || !bulkConfirm) return;
    setError('');
    try {
      const run = await api.post<DeployRun>('/api/extensions/bulk', {
        tenantId: target.tenantId,
        environment: target.environment,
        action: bulkConfirm,
        scope: scopeSel
      });
      setActiveRun(run);
      setBulkConfirm(null);
    } catch (e: any) {
      setError(e.message);
      setBulkConfirm(null);
    }
  };

  const bulkCount = bulkConfirm ? bulkTargets(extensions, bulkConfirm, scopeSel).length : 0;
  const runFinished = activeRun && activeRun.status !== 'running';

  // Group by app id to find AppSource updates: installed + a newer published version exists
  const updatable = useMemo(() => {
    const byId = new Map<string, Extension[]>();
    for (const e of extensions) {
      const key = e.id.toLowerCase();
      if (!byId.has(key)) byId.set(key, []);
      byId.get(key)!.push(e);
    }
    const result: { installed: Extension; update: Extension }[] = [];
    for (const versions of byId.values()) {
      const installed = versions.filter(v => v.isInstalled).sort(compareVersions).pop();
      if (!installed) continue;
      const newer = versions
        .filter(v => !v.isInstalled && (v.publishedAs || 'PTE') === 'Global' && compareVersions(v, installed) > 0)
        .sort(compareVersions)
        .pop();
      if (newer) result.push({ installed, update: newer });
    }
    return result.sort((a, b) => a.installed.displayName.localeCompare(b.installed.displayName));
  }, [extensions]);

  const filtered = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const list = extensions.filter(e =>
      (!f || e.displayName?.toLowerCase().includes(f) || e.publisher?.toLowerCase().includes(f)) &&
      (scopeSel === 'all' || scopeOf(e) === scopeSel));
    return [...list].sort((a, b) =>
      a.displayName.localeCompare(b.displayName) || compareVersions(b, a));
  }, [extensions, filter, scopeSel]);

  if (!settings) return <Spinner label="Loading..." />;

  return (
    <div className={styles.stack}>
      <Title2>Apps</Title2>
      <Text size={300} className={shared.pageDesc}>
        Extensions in one environment — reinstall PTEs, unpublish old versions, apply AppSource updates.
      </Text>
      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
      {notice && <MessageBar intent="success"><MessageBarBody>{notice}</MessageBarBody></MessageBar>}

      <Card className={shared.card}>
        <div className={styles.row}>
          <TargetPicker settings={settings} value={target} onChange={setTarget} />
          <Button
            icon={loading ? <Spinner size="tiny" /> : <ArrowSync24Regular />}
            onClick={load}
            disabled={!target || loading || !auth?.signedIn}
          >
            Refresh
          </Button>
          <Input
            contentBefore={<Search24Regular />}
            placeholder="Filter by name or publisher"
            value={filter}
            onChange={(_e, d) => setFilter(d.value)}
            style={{ minWidth: '260px' }}
          />
          <Dropdown
            value={SCOPE_LABELS[scopeSel]}
            selectedOptions={[scopeSel]}
            onOptionSelect={(_e, d) => setScopeSel(String(d.optionValue ?? 'all'))}
            style={{ minWidth: '150px' }}
          >
            <Option value="all">All scopes</Option>
            <Option value="Global">AppSource</Option>
            <Option value="PTE">PTE</Option>
            <Option value="Dev">Dev</Option>
          </Dropdown>
          <Menu>
            <MenuTrigger disableButtonEnhancement>
              <MenuButton
                appearance="secondary"
                disabled={loading || extensions.length === 0 || activeRun?.status === 'running'}
              >
                Bulk actions
              </MenuButton>
            </MenuTrigger>
            <MenuPopover>
              <MenuList>
                <MenuItem icon={<ArrowDownload24Regular />} onClick={() => setBulkConfirm('install-all')}>
                  Install all
                </MenuItem>
                <MenuItem icon={<Delete24Regular />} onClick={() => setBulkConfirm('unpublish-old')}>
                  Unpublish old versions
                </MenuItem>
              </MenuList>
            </MenuPopover>
          </Menu>
        </div>
      </Card>

      {updatable.length > 0 && (
        <Card className={shared.card}>
          <Title2 as="h3" style={{ fontSize: tokens.fontSizeBase500 }}>AppSource updates available</Title2>
          <Table size="small" style={{ marginTop: '8px' }}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>App</TableHeaderCell>
                <TableHeaderCell>Installed</TableHeaderCell>
                <TableHeaderCell>Available</TableHeaderCell>
                <TableHeaderCell style={{ width: '130px' }} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {updatable.map(u => (
                <TableRow key={u.update.packageId}>
                  <TableCell>{u.installed.displayName}</TableCell>
                  <TableCell>{version(u.installed)}</TableCell>
                  <TableCell>
                    <Text weight="semibold">{version(u.update)}</Text>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="small"
                      appearance="primary"
                      icon={busyKey === u.update.packageId ? <Spinner size="tiny" /> : <ArrowDownload24Regular />}
                      disabled={!!busyKey}
                      onClick={() => act(u.update, 'install', 'Update')}
                    >
                      Update
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Card className={shared.card}>
        {loading ? (
          <Spinner label="Loading extensions..." />
        ) : (
          <Table size="small">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>App</TableHeaderCell>
                <TableHeaderCell>Publisher</TableHeaderCell>
                <TableHeaderCell>Version</TableHeaderCell>
                <TableHeaderCell>Scope</TableHeaderCell>
                <TableHeaderCell>State</TableHeaderCell>
                <TableHeaderCell style={{ width: '200px' }}>Actions</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(ext => (
                <TableRow key={ext.packageId}>
                  <TableCell>{ext.displayName}</TableCell>
                  <TableCell>{ext.publisher}</TableCell>
                  <TableCell>{version(ext)}</TableCell>
                  <TableCell>{scopeBadge(ext.publishedAs)}</TableCell>
                  <TableCell>
                    {ext.isInstalled
                      ? <Badge appearance="filled" color="success">Installed</Badge>
                      : <Badge appearance="filled" color="subtle">Not installed</Badge>}
                  </TableCell>
                  <TableCell>
                    {!ext.isInstalled && (
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Button
                          size="small"
                          icon={busyKey === ext.packageId ? <Spinner size="tiny" /> : <ArrowDownload24Regular />}
                          disabled={!!busyKey}
                          onClick={() => act(ext, 'install', 'Install')}
                        >
                          Install
                        </Button>
                        {(ext.publishedAs || 'PTE') !== 'Global' && (
                          <Button
                            size="small"
                            icon={<Delete24Regular />}
                            disabled={!!busyKey}
                            onClick={() => act(ext, 'unpublish', 'Unpublish')}
                          >
                            Unpublish
                          </Button>
                        )}
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {!loading && filtered.length === 0 && (
          <EmptyState
            title="No extensions found"
            hint="Try a different filter, or hit Refresh to load this environment."
          />
        )}
      </Card>

      {activeRun && (
        <Card className={shared.card}>
          <Text weight="semibold">
            Bulk run — {activeRun.status === 'running' ? 'in progress' : activeRun.status}
          </Text>
          <Table size="small" style={{ marginTop: '8px' }}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Extension</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Detail</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeRun.results.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{r.appFile}</TableCell>
                  <TableCell>{resultBadge(r.status)}</TableCell>
                  <TableCell>{r.message}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {runFinished && (
            <div style={{ marginTop: '12px', display: 'flex', gap: '12px', alignItems: 'center' }}>
              <Button icon={<ArrowSync24Regular />} onClick={load}>Refresh list</Button>
              <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                Installs and unpublishes finish in the background — see Deployment Status for outcomes.
              </Text>
            </div>
          )}
        </Card>
      )}

      <Dialog open={!!bulkConfirm} onOpenChange={(_e, d) => { if (!d.open) setBulkConfirm(null); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>
              {bulkConfirm === 'install-all' ? 'Install all' : 'Unpublish old versions'}
            </DialogTitle>
            <DialogContent>
              {bulkConfirm === 'install-all' ? (
                <>
                  Install the latest published version of <strong>{bulkCount} app(s)</strong> on{' '}
                  <strong>{target?.environment}</strong> (scope: {SCOPE_LABELS[scopeSel]})?
                  They are submitted one at a time; Business Central resolves dependencies.
                </>
              ) : (
                <>
                  Unpublish <strong>{bulkCount} old version(s)</strong> on{' '}
                  <strong>{target?.environment}</strong> (scope: {SCOPE_LABELS[scopeSel]})?
                  The latest version of each app and anything currently installed is kept.
                </>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setBulkConfirm(null)}>Cancel</Button>
              <Button appearance="primary" disabled={bulkCount === 0} onClick={startBulk}>
                {bulkConfirm === 'install-all' ? `Install ${bulkCount} app(s)` : `Unpublish ${bulkCount} version(s)`}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
