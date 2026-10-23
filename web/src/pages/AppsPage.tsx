import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Badge, Button, Card, Input, makeStyles, MessageBar, MessageBarBody,
  Spinner, Table, TableBody, TableCell, TableHeader, TableHeaderCell,
  TableRow, Text, Title2, tokens
} from '@fluentui/react-components';
import {
  ArrowDownload24Regular, ArrowSync24Regular, Delete24Regular, Search24Regular
} from '@fluentui/react-icons';
import { api } from '../api';
import { AuthStatus, Settings } from '../types';
import TargetPicker, { TargetSelection } from '../components/TargetPicker';

const useStyles = makeStyles({
  stack: { display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1200px' },
  card: { padding: '20px' },
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
  const s = scope || 'PTE';
  if (s === 'Global') return <Badge appearance="outline" color="brand">AppSource</Badge>;
  if (s === 'Dev') return <Badge appearance="outline" color="warning">Dev</Badge>;
  return <Badge appearance="outline" color="success">PTE</Badge>;
}

export default function AppsPage() {
  const styles = useStyles();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [target, setTarget] = useState<TargetSelection | null>(null);
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading] = useState(false);
  const [busyKey, setBusyKey] = useState('');
  const [filter, setFilter] = useState('');
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
    const list = f
      ? extensions.filter(e =>
          e.displayName?.toLowerCase().includes(f) || e.publisher?.toLowerCase().includes(f))
      : extensions;
    return [...list].sort((a, b) =>
      a.displayName.localeCompare(b.displayName) || compareVersions(b, a));
  }, [extensions, filter]);

  if (!settings) return <Spinner label="Loading..." />;

  return (
    <div className={styles.stack}>
      <Title2>Apps</Title2>
      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
      {notice && <MessageBar intent="success"><MessageBarBody>{notice}</MessageBarBody></MessageBar>}

      <Card className={styles.card}>
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
        </div>
      </Card>

      {updatable.length > 0 && (
        <Card className={styles.card}>
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

      <Card className={styles.card}>
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
          <Text style={{ color: tokens.colorNeutralForeground3 }}>No extensions found.</Text>
        )}
      </Card>
    </div>
  );
}
