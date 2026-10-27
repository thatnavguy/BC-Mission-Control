import { useCallback, useEffect, useState } from 'react';
import {
  Badge, Button, Card, Dialog, DialogActions, DialogBody, DialogContent,
  DialogSurface, DialogTitle, Dropdown, Field, makeStyles, MessageBar,
  MessageBarBody, Option, Spinner, Table, TableBody, TableCell, TableHeader,
  TableHeaderCell, TableRow, Text, Title2, tokens
} from '@fluentui/react-components';
import { ArrowSync24Regular, PlugDisconnected24Regular } from '@fluentui/react-icons';
import { api } from '../api';
import { getCached, setCached } from '../pageCache';
import EmptyState from '../components/EmptyState';
import { useSharedStyles } from '../theme';
import { SessionInfo, Settings } from '../types';

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
  truncate: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    maxWidth: '260px'
  }
});

function fmtTime(iso?: string): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '—' : d.toLocaleString();
}

/** currentOperationDuration is in milliseconds. */
function fmtDuration(ms?: number): string {
  if (ms === undefined || ms === null) return '—';
  const s = Math.floor(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

function clientBadge(clientType: string) {
  const c = clientType.toLowerCase();
  if (c.includes('web')) return <Badge appearance="filled" color="informative">{clientType}</Badge>;
  if (c.includes('webservice') || c.includes('odata') || c.includes('api')) return <Badge appearance="filled" color="brand">{clientType}</Badge>;
  if (c.includes('background') || c.includes('task') || c.includes('jobqueue')) return <Badge appearance="outline" color="subtle">{clientType}</Badge>;
  return <Badge appearance="outline">{clientType || '—'}</Badge>;
}

export default function SessionsPage() {
  const styles = useStyles();
  const shared = useSharedStyles();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tenantId, setTenantId] = useState('');
  const [environment, setEnvironment] = useState('');
  const [sessions, setSessions] = useState<SessionInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [killTarget, setKillTarget] = useState<SessionInfo | null>(null);
  const [killing, setKilling] = useState(false);

  const restore = (tid: string, env: string) => {
    setSessions(getCached<SessionInfo[]>(`sessions:${tid}|${env}`) ?? null);
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
    setNotice('');
    setLoading(true);
    try {
      const list = await api.get<SessionInfo[]>(`/api/sessions?tenantId=${encodeURIComponent(tenantId)}&environment=${encodeURIComponent(environment)}`);
      setSessions(list);
      setCached(`sessions:${tenantId}|${environment}`, list);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId, environment]);

  const kill = async () => {
    if (!killTarget) return;
    setError('');
    setKilling(true);
    try {
      await api.delete(`/api/sessions/${killTarget.sessionId}?tenantId=${encodeURIComponent(tenantId)}&environment=${encodeURIComponent(environment)}`);
      setNotice(`Session ${killTarget.sessionId} (${killTarget.userId}) ended.`);
      setKillTarget(null);
      await refresh();
    } catch (e: any) {
      setError(e.message);
      setKillTarget(null);
    } finally {
      setKilling(false);
    }
  };

  const tenant = settings?.tenants.find(t => t.id === tenantId);
  const envNames = tenant ? Object.entries(tenant.environments).filter(([, e]) => e).map(([n]) => n) : [];
  const sorted = [...(sessions ?? [])].sort((a, b) => a.logOnDate.localeCompare(b.logOnDate));

  return (
    <div className={styles.stack}>
      <Title2>Sessions</Title2>
      <Text size={300} className={shared.pageDesc}>
        Active user and service sessions on an environment — and a way to end one.
      </Text>
      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
      {notice && <MessageBar intent="success"><MessageBarBody>{notice}</MessageBarBody></MessageBar>}

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
          <Button
            appearance="primary"
            icon={loading ? <Spinner size="tiny" /> : <ArrowSync24Regular />}
            disabled={loading || !tenantId || !environment}
            onClick={refresh}
          >
            {sessions ? 'Refresh' : 'Load sessions'}
          </Button>
        </div>
      </Card>

      {!sessions && !loading && (
        <Card className={styles.cardWide}>
          <EmptyState
            title="Nothing loaded yet"
            hint="Pick a tenant and environment, then click Load sessions — nothing is fetched until you ask."
          />
        </Card>
      )}

      {loading && <Spinner label="Loading sessions..." />}

      {sessions && !loading && (
        <Card className={styles.cardWide}>
          {sorted.length === 0 ? (
            <EmptyState title="No active sessions" hint="Nobody is connected to this environment right now." />
          ) : (
            <Table size="small">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>ID</TableHeaderCell>
                  <TableHeaderCell>User</TableHeaderCell>
                  <TableHeaderCell>Client</TableHeaderCell>
                  <TableHeaderCell>Signed in</TableHeaderCell>
                  <TableHeaderCell>Currently in</TableHeaderCell>
                  <TableHeaderCell>Operation running</TableHeaderCell>
                  <TableHeaderCell>Action</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map(s => (
                  <TableRow key={s.sessionId}>
                    <TableCell>{s.sessionId}</TableCell>
                    <TableCell><span className={styles.truncate} title={s.userId}>{s.userId || '—'}</span></TableCell>
                    <TableCell>{clientBadge(s.clientType)}</TableCell>
                    <TableCell><span className={styles.nowrap}>{fmtTime(s.logOnDate)}</span></TableCell>
                    <TableCell>
                      {s.currentObjectName
                        ? <span className={styles.truncate} title={`${s.currentObjectType ?? ''} ${s.currentObjectId ?? ''} ${s.currentObjectName}`}>{s.currentObjectName}</span>
                        : <Text style={{ color: tokens.colorNeutralForeground4 }}>—</Text>}
                    </TableCell>
                    <TableCell>{fmtDuration(s.currentOperationDuration)}</TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        icon={<PlugDisconnected24Regular />}
                        onClick={() => setKillTarget(s)}
                      >
                        End
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      <Dialog open={!!killTarget} onOpenChange={(_e, d) => { if (!d.open) setKillTarget(null); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>End session {killTarget?.sessionId}</DialogTitle>
            <DialogContent>
              Disconnect <strong>{killTarget?.userId || 'this user'}</strong> from{' '}
              <strong>{environment}</strong>? Their current work in that session is lost.
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setKillTarget(null)}>Cancel</Button>
              <Button appearance="primary" disabled={killing} onClick={kill}>
                {killing ? 'Ending...' : 'End session'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
