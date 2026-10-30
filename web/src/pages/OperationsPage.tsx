import { useCallback, useEffect, useState } from 'react';
import {
  Badge, Button, Card, Dropdown, Field, makeStyles, MessageBar,
  MessageBarBody, Option, Spinner, Table, TableBody, TableCell, TableHeader,
  TableHeaderCell, TableRow, Text, Title2, tokens
} from '@fluentui/react-components';
import { ArrowSync24Regular } from '@fluentui/react-icons';
import { api } from '../api';
import { getCached, setCached } from '../pageCache';
import EmptyState from '../components/EmptyState';
import { useSharedStyles } from '../theme';
import { EnvironmentOperation, OperationsResponse, Settings } from '../types';

const useStyles = makeStyles({
  stack: { display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1200px' },
  cardWide: {
    padding: '20px',
    overflowX: 'auto',
    backgroundColor: '#ffffff',
    border: '1px solid #e7e5e1',
    borderRadius: '10px',
    boxShadow: 'none'
  },
  row: { display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' },
  nowrap: { whiteSpace: 'nowrap' },
  version: { display: 'flex', flexDirection: 'column' },
  truncateApp: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '240px'
  },
  truncateBy: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '200px'
  },
  error: {
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    color: tokens.colorPaletteRedForeground1,
    fontSize: '12px',
    whiteSpace: 'normal',
    wordBreak: 'break-word',
    maxWidth: '320px'
  }
});

const APP_OP_TYPES = new Set(['environmentappinstall', 'environmentappupdate', 'environmentappuninstall', 'environmentapphotfix']);

type Period = '24h' | '7d' | '30d' | 'all';
const PERIOD_MS: Record<Period, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  'all': Number.POSITIVE_INFINITY
};
const PERIOD_LABELS: Record<Period, string> = {
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  'all': 'All time'
};

interface OperationsCache {
  resp: OperationsResponse;
  appsOnly: 'all' | 'apps';
  period: Period;
}

function friendlyType(type?: string): string {
  if (!type) return '—';
  const lower = type.toLowerCase();
  if (lower.startsWith('environmentapp')) return type.slice('EnvironmentApp'.length);
  return type;
}

function statusBadge(status?: string) {
  const s = (status ?? '').toLowerCase();
  if (s === 'succeeded') return <Badge appearance="filled" color="success">{status}</Badge>;
  if (s === 'failed') return <Badge appearance="filled" color="danger">{status}</Badge>;
  if (s === 'running' || s === 'queued') return <Badge appearance="filled" color="warning">{status}</Badge>;
  if (s === 'scheduled') return <Badge appearance="filled" color="informative">{status}</Badge>;
  return <Badge appearance="outline">{status ?? '—'}</Badge>;
}

function param(op: EnvironmentOperation, ...keys: string[]): string {
  const p = op.parameters ?? {};
  for (const k of keys) {
    const v = p[k];
    if (typeof v === 'string' && v) return v;
  }
  return '';
}

function fmtTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

export default function OperationsPage() {
  const styles = useStyles();
  const shared = useSharedStyles();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tenantId, setTenantId] = useState('');
  const [environment, setEnvironment] = useState('');
  const [data, setData] = useState<OperationsResponse | null>(null);
  const [appsOnly, setAppsOnly] = useState<'all' | 'apps'>('apps');
  const [period, setPeriod] = useState<Period>('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const restore = (tid: string, env: string) => {
    const hit = getCached<OperationsCache>(`operations:${tid}|${env}`);
    setData(hit?.resp ?? null);
    if (hit) {
      setAppsOnly(hit.appsOnly);
      setPeriod(hit.period);
    }
  };

  const cacheView = (tid: string, env: string, resp: OperationsResponse | null, ao: 'all' | 'apps', p: Period) => {
    if (resp) setCached(`operations:${tid}|${env}`, { resp, appsOnly: ao, period: p } satisfies OperationsCache);
  };

  useEffect(() => {
    api.get<Settings>('/api/settings').then(s => {
      setSettings(s);
      const first = s.tenants.find(t => Object.values(t.environments).some(Boolean));
      if (first) {
        setTenantId(first.id);
        const firstEnv = Object.entries(first.environments).find(([, e]) => e);
        if (firstEnv) {
          setEnvironment(firstEnv[0]);
          restore(first.id, firstEnv[0]);
        }
      }
    }).catch(e => setError(e.message));
  }, []);

  const refresh = useCallback(async () => {
    if (!tenantId || !environment) return;
    setError('');
    setLoading(true);
    try {
      const resp = await api.get<OperationsResponse>(`/api/operations?tenantId=${encodeURIComponent(tenantId)}&environment=${encodeURIComponent(environment)}`);
      setData(resp);
      cacheView(tenantId, environment, resp, appsOnly, period);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId, environment, appsOnly, period]);

  const tenant = settings?.tenants.find(t => t.id === tenantId);
  const envNames = tenant ? Object.entries(tenant.environments).filter(([, e]) => e).map(([n]) => n) : [];
  const appNames = new Map((data?.apps ?? []).map(a => [a.appId.toLowerCase(), a.name]));
  const cutoff = Date.now() - PERIOD_MS[period];
  const shown = (data?.operations ?? []).filter(op => {
    if (appsOnly === 'apps' && !APP_OP_TYPES.has((op.type ?? '').toLowerCase())) return false;
    const when = new Date(op.startedOn ?? op.createdOn ?? '').getTime();
    return isNaN(when) || when >= cutoff;
  });

  const appLabel = (op: EnvironmentOperation): string => {
    const name = param(op, 'name', 'appName');
    if (name) return name;
    const appId = param(op, 'appId');
    if (!appId) return '—';
    return appNames.get(appId.toLowerCase()) ?? `${appId.slice(0, 8)}…`;
  };

  const versionLabel = (op: EnvironmentOperation): { source: string; target: string } => {
    const target = param(op, 'targetAppVersion', 'targetVersion');
    const source = param(op, 'sourceAppVersion', 'sourceVersion');
    return { source, target };
  };

  return (
    <div className={styles.stack}>
      <Title2>App Operations</Title2>
      <Text size={300} className={shared.pageDesc}>
        Audit log of app installs, updates and uninstalls (and other operations) per environment.
      </Text>
      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}

      <Card className={styles.cardWide}>
        <div className={styles.row}>
          <Field label="Tenant">
            <Dropdown
              value={tenant?.name ?? ''}
              selectedOptions={tenantId ? [tenantId] : []}
              onOptionSelect={(_e, d) => {
                const id = String(d.optionValue ?? '');
                setTenantId(id);
                const t = settings?.tenants.find(x => x.id === id);
                const firstEnv = t ? Object.entries(t.environments).find(([, en]) => en) : undefined;
                const env = firstEnv ? firstEnv[0] : '';
                setEnvironment(env);
                restore(id, env);
              }}
            >
              {settings?.tenants.map(t => <Option key={t.id} value={t.id}>{t.name}</Option>)}
            </Dropdown>
          </Field>
          <Field label="Environment">
            <Dropdown
              value={environment}
              selectedOptions={environment ? [environment] : []}
              onOptionSelect={(_e, d) => {
                const env = String(d.optionValue ?? '');
                setEnvironment(env);
                restore(tenantId, env);
              }}
            >
              {envNames.map(n => <Option key={n} value={n}>{n}</Option>)}
            </Dropdown>
          </Field>
          <Field label="Show">
            <Dropdown
              value={appsOnly === 'apps' ? 'App operations' : 'All operations'}
              selectedOptions={[appsOnly]}
              onOptionSelect={(_e, d) => {
                const v = d.optionValue === 'all' ? 'all' : 'apps';
                setAppsOnly(v);
                cacheView(tenantId, environment, data, v, period);
              }}
            >
              <Option value="apps">App operations</Option>
              <Option value="all">All operations</Option>
            </Dropdown>
          </Field>
          <Field label="Period">
            <Dropdown
              value={PERIOD_LABELS[period]}
              selectedOptions={[period]}
              onOptionSelect={(_e, d) => {
                const v = (d.optionValue as Period) ?? 'all';
                setPeriod(v);
                cacheView(tenantId, environment, data, appsOnly, v);
              }}
            >
              {(Object.keys(PERIOD_LABELS) as Period[]).map(p => (
                <Option key={p} value={p}>{PERIOD_LABELS[p]}</Option>
              ))}
            </Dropdown>
          </Field>
          <Button
            appearance="primary"
            icon={loading ? <Spinner size="tiny" /> : <ArrowSync24Regular />}
            disabled={loading || !tenantId || !environment}
            onClick={refresh}
          >
            {data ? 'Refresh' : 'Load operations'}
          </Button>
        </div>
      </Card>

      {!data && !loading && (
        <Card className={styles.cardWide}>
          <EmptyState
            title="Nothing loaded yet"
            hint="Pick a tenant and environment, then click Load operations — nothing is fetched until you ask."
          />
        </Card>
      )}

      {loading && <Spinner label="Loading operations..." />}

      {data && !loading && (
        <Card className={styles.cardWide}>
          {shown.length === 0 ? (
            <EmptyState
              title="No matching operations"
              hint="Try widening the period, or switch to All operations."
            />
          ) : (
            <Table size="small">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Started</TableHeaderCell>
                  <TableHeaderCell style={{ width: '70px' }}>Type</TableHeaderCell>
                  <TableHeaderCell>App</TableHeaderCell>
                  <TableHeaderCell>Version</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>By</TableHeaderCell>
                  <TableHeaderCell>Error</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {shown.map(op => (
                  <TableRow key={op.id}>
                    <TableCell><span className={styles.nowrap}>{fmtTime(op.startedOn ?? op.createdOn)}</span></TableCell>
                    <TableCell><span className={styles.nowrap}>{friendlyType(op.type)}</span></TableCell>
                    <TableCell><span className={styles.truncateApp} title={appLabel(op)}>{appLabel(op)}</span></TableCell>
                    <TableCell>
                      {(() => {
                        const v = versionLabel(op);
                        if (v.source && v.target) {
                          return (
                            <span className={styles.version} title={`${v.source} → ${v.target}`}>
                              <span className={styles.nowrap}>{v.source}</span>
                              <span className={styles.nowrap}>→ {v.target}</span>
                            </span>
                          );
                        }
                        return <span className={styles.nowrap}>{v.target || '—'}</span>;
                      })()}
                    </TableCell>
                    <TableCell>{statusBadge(op.status)}</TableCell>
                    <TableCell><span className={styles.truncateBy} title={op.createdBy || ''}>{op.createdBy || '—'}</span></TableCell>
                    <TableCell>
                      {op.errorMessage
                        ? <span className={styles.error} title={op.errorMessage}>{op.errorMessage}</span>
                        : <Text style={{ color: tokens.colorNeutralForeground4 }}>—</Text>}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      )}
    </div>
  );
}
