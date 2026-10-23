import { useCallback, useEffect, useState } from 'react';
import {
  Badge, Button, Card, Checkbox, Input, makeStyles, MessageBar, MessageBarBody,
  Spinner, Table, TableBody, TableCell, TableHeader, TableHeaderCell,
  TableRow, Text, Title2, tokens
} from '@fluentui/react-components';
import { ArrowSync24Regular, Search24Regular } from '@fluentui/react-icons';
import { api } from '../api';
import { Settings } from '../types';

const useStyles = makeStyles({
  stack: { display: 'flex', flexDirection: 'column', gap: '20px' },
  card: { padding: '20px', overflowX: 'auto' },
  row: { display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' },
  tenantGroup: { marginTop: '8px' },
  envList: { display: 'flex', gap: '16px', flexWrap: 'wrap', marginLeft: '28px' },
  drift: { color: tokens.colorPaletteRedForeground1, fontWeight: 600 },
  same: { color: tokens.colorPaletteGreenForeground1 },
  latest: { fontWeight: 700 }
});

interface CompareCell {
  version: string | null;
  scope: string;
  isInstalled: boolean;
  isLatest: boolean;
}
interface CompareRow {
  appId: string;
  name: string;
  publisher: string;
  drift: boolean | null;
  cells: Record<string, CompareCell>;
}
interface CompareColumn {
  key: string;
  tenantName: string;
  environment: string;
  error?: string;
}
interface CompareResult {
  columns: CompareColumn[];
  rows: CompareRow[];
}

export default function ComparePage() {
  const styles = useStyles();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [targets, setTargets] = useState<Set<string> | null>(null); // null = not loaded yet
  const [result, setResult] = useState<CompareResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [appName, setAppName] = useState('');
  const [publisher, setPublisher] = useState('');
  const [driftOnly, setDriftOnly] = useState(false);

  useEffect(() => {
    api.get<Settings>('/api/settings').then(s => {
      setSettings(s);
      // Default: all enabled environments selected
      const all = new Set<string>();
      for (const t of s.tenants) {
        for (const [env, enabled] of Object.entries(t.environments)) {
          if (enabled) all.add(`${t.id}|${env}`);
        }
      }
      setTargets(all);
    }).catch(e => setError(e.message));
  }, []);

  const run = useCallback(async (n?: string, p?: string, sel?: Set<string>) => {
    setError('');
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (n) params.set('appName', n);
      if (p) params.set('publisher', p);
      if (sel) for (const t of sel) params.append('target', t);
      setResult(await api.get<CompareResult>(`/api/compare?${params}`));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const rows = result?.rows.filter(r => !driftOnly || r.drift === true) ?? [];

  return (
    <div className={styles.stack}>
      <Title2>Compare App Versions</Title2>
      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}

      <Card className={styles.card}>
        <Text weight="semibold">Environments to compare</Text>
        {settings?.tenants.map(tenant => {
          const envs = Object.entries(tenant.environments).filter(([, e]) => e);
          if (envs.length === 0) return null;
          const keys = envs.map(([env]) => `${tenant.id}|${env}`);
          const allChecked = targets !== null && keys.every(k => targets.has(k));
          return (
            <div key={tenant.id} className={styles.tenantGroup}>
              <Checkbox
                label={<Text weight="semibold">{tenant.name}</Text>}
                checked={allChecked}
                onChange={(_e, d) => {
                  const next = new Set(targets ?? []);
                  for (const k of keys) {
                    if (d.checked === true) next.add(k); else next.delete(k);
                  }
                  setTargets(next);
                }}
              />
              <div className={styles.envList}>
                {envs.map(([env]) => {
                  const key = `${tenant.id}|${env}`;
                  return (
                    <Checkbox
                      key={key}
                      label={env}
                      checked={targets?.has(key) ?? false}
                      onChange={(_e, d) => {
                        const next = new Set(targets ?? []);
                        if (d.checked === true) next.add(key); else next.delete(key);
                        setTargets(next);
                      }}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
        {settings && !settings.tenants.some(t => Object.values(t.environments).some(Boolean)) && (
          <Text block size={200} style={{ marginTop: '8px', color: tokens.colorNeutralForeground3 }}>
            No environments enabled. Configure them on the Setup page.
          </Text>
        )}
      </Card>

      <Card className={styles.card}>
        <div className={styles.row}>
          <Input
            contentBefore={<Search24Regular />}
            placeholder="App name contains..."
            value={appName}
            onChange={(_e, d) => setAppName(d.value)}
          />
          <Input
            placeholder="Publisher contains..."
            value={publisher}
            onChange={(_e, d) => setPublisher(d.value)}
          />
          <Checkbox
            label="Show drift only"
            checked={driftOnly}
            onChange={(_e, d) => setDriftOnly(d.checked === true)}
          />
          <Button
            appearance="primary"
            icon={loading ? <Spinner size="tiny" /> : <ArrowSync24Regular />}
            disabled={loading || !targets || targets.size < 1}
            onClick={() => run(appName, publisher, targets ?? undefined)}
          >
            Compare
          </Button>
        </div>
        <Text block size={200} style={{ marginTop: '8px', color: tokens.colorNeutralForeground3 }}>
          Compares installed app versions across the selected environments.
        </Text>
      </Card>

      {loading && <Spinner label="Querying environments..." />}

      {!result && !loading && (
        <Card className={styles.card}>
          <Text style={{ color: tokens.colorNeutralForeground3 }}>
            Select environments and click Compare.
          </Text>
        </Card>
      )}

      {result && !loading && (
        <Card className={styles.card}>
          {result.columns.some(c => c.error) && (
            <MessageBar intent="warning" style={{ marginBottom: '12px' }}>
              <MessageBarBody>
                {result.columns.filter(c => c.error).map(c => `${c.tenantName}/${c.environment}: ${c.error}`).join(' — ')}
              </MessageBarBody>
            </MessageBar>
          )}
          <Table size="small">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>App</TableHeaderCell>
                <TableHeaderCell>Publisher</TableHeaderCell>
                {result.columns.map(c => (
                  <TableHeaderCell key={c.key}>
                    {c.tenantName}
                    <Text block size={100}>{c.environment}</Text>
                  </TableHeaderCell>
                ))}
                <TableHeaderCell>Drift</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(row => (
                <TableRow key={row.appId}>
                  <TableCell>{row.name}</TableCell>
                  <TableCell>{row.publisher}</TableCell>
                  {result.columns.map(c => {
                    const cell = row.cells[c.key];
                    if (!cell || cell.scope === 'ERR') return <TableCell key={c.key}><Badge color="danger">ERR</Badge></TableCell>;
                    if (!cell.version) return <TableCell key={c.key}><Text style={{ color: tokens.colorNeutralForeground4 }}>—</Text></TableCell>;
                    return (
                      <TableCell key={c.key}>
                        <span className={cell.isLatest ? styles.latest : undefined}>
                          {cell.version}{cell.isLatest ? ' ▲' : ''}
                        </span>
                        <Text block size={100} style={{ color: tokens.colorNeutralForeground3 }}>
                          {cell.scope}
                        </Text>
                      </TableCell>
                    );
                  })}
                  <TableCell>
                    {row.drift === null
                      ? <Text style={{ color: tokens.colorNeutralForeground4 }}>—</Text>
                      : row.drift
                        ? <span className={styles.drift}>✗ Different</span>
                        : <span className={styles.same}>✓ Same</span>}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rows.length === 0 && (
            <Text style={{ color: tokens.colorNeutralForeground3 }}>No apps matched.</Text>
          )}
        </Card>
      )}
    </div>
  );
}
