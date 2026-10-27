import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Badge, Button, Card, Dialog, DialogActions, DialogBody, DialogContent,
  DialogSurface, DialogTitle, Dropdown, Field, Input, makeStyles, MessageBar,
  MessageBarBody, Option, Spinner, Table, TableBody, TableCell, TableHeader,
  TableHeaderCell, TableRow, Text, Title2, tokens
} from '@fluentui/react-components';
import { Add24Regular, ArrowSync24Regular, Copy24Regular, Delete24Regular } from '@fluentui/react-icons';
import { api, subscribeRuns } from '../api';
import EmptyState from '../components/EmptyState';
import { useSharedStyles } from '../theme';
import { AvailableCountry, DeployRun, EnvironmentInfo, Settings } from '../types';

const useStyles = makeStyles({
  stack: { display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1100px' },
  cardWide: {
    padding: '20px',
    overflowX: 'auto',
    backgroundColor: '#ffffff',
    border: '1px solid #e7e5e1',
    borderRadius: '10px',
    boxShadow: 'none'
  },
  row: { display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' },
  form: { display: 'flex', flexDirection: 'column', gap: '12px' },
  log: {
    fontFamily: tokens.fontFamilyMonospace, fontSize: '12px', whiteSpace: 'pre-wrap',
    backgroundColor: '#f7f6f4', border: '1px solid #edebe8', padding: '12px',
    borderRadius: '8px', maxHeight: '240px', overflowY: 'auto', marginTop: '12px'
  }
});

const NAME_PATTERN = /^[a-zA-Z][a-zA-Z0-9_-]{0,29}$/;

function statusBadge(status?: string) {
  const s = (status ?? '').toLowerCase();
  if (s === 'active') return <Badge appearance="filled" color="success">{status}</Badge>;
  if (s === 'preparing' || s === 'upgrading' || s === 'notready') return <Badge appearance="filled" color="warning">{status}</Badge>;
  if (s.includes('failed')) return <Badge appearance="filled" color="danger">{status}</Badge>;
  return <Badge appearance="outline">{status ?? '—'}</Badge>;
}

export default function EnvironmentsPage() {
  const styles = useStyles();
  const shared = useSharedStyles();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tenantId, setTenantId] = useState('');
  const [environments, setEnvironments] = useState<EnvironmentInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [runs, setRuns] = useState<DeployRun[]>([]);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newType, setNewType] = useState<'Production' | 'Sandbox'>('Sandbox');
  const [countries, setCountries] = useState<AvailableCountry[] | null>(null);
  const [countryCode, setCountryCode] = useState('');

  // Copy dialog
  const [copySource, setCopySource] = useState<EnvironmentInfo | null>(null);
  const [copyName, setCopyName] = useState('');

  // Delete dialog
  const [deleteTarget, setDeleteTarget] = useState<EnvironmentInfo | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState('');

  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.get<Settings>('/api/settings').then(s => {
      setSettings(s);
      const first = s.tenants[0];
      if (first) setTenantId(first.id);
    }).catch(e => setError(e.message));
  }, []);

  const refresh = useCallback(async (tid?: string) => {
    const id = tid ?? tenantId;
    if (!id) return;
    setError('');
    setLoading(true);
    try {
      setEnvironments(await api.get<EnvironmentInfo[]>(`/api/tenants/${encodeURIComponent(id)}/environments`));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  // Live environment runs; refresh the list when one finishes
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;
  useEffect(() => subscribeRuns(run => {
    if (run.kind !== 'environment') return;
    setRuns(prev => {
      const i = prev.findIndex(r => r.id === run.id);
      const next = i === -1 ? [run, ...prev] : prev.map(r => (r.id === run.id ? run : r));
      return next.slice(0, 10);
    });
    if (run.status !== 'running') refreshRef.current().catch(() => undefined);
  }), []);

  const loadCountries = async () => {
    if (countries && countries.length > 0) return;
    try {
      const list = await api.get<AvailableCountry[]>(`/api/available-countries?tenantId=${encodeURIComponent(tenantId)}`);
      setCountries(list);
      if (list.length > 0 && !countryCode) setCountryCode(list[0].countryCode);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const submit = async (action: 'create' | 'copy' | 'delete') => {
    setError('');
    setSubmitting(true);
    try {
      const body =
        action === 'create'
          ? { tenantId, environment: newName.trim(), environmentType: newType, countryCode }
          : action === 'copy'
            ? { tenantId, environment: copyName.trim(), sourceEnvironment: copySource?.name }
            : { tenantId, environment: deleteTarget?.name };
      const run = await api.post<DeployRun>(`/api/environments/${action}`, body);
      setRuns(prev => [run, ...prev].slice(0, 10));
      setCreateOpen(false);
      setCopySource(null);
      setDeleteTarget(null);
      setNewName('');
      setCopyName('');
      setDeleteConfirm('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const tenant = settings?.tenants.find(t => t.id === tenantId);
  const anyRunning = runs.some(r => r.status === 'running');

  return (
    <div className={styles.stack}>
      <Title2>Environments</Title2>
      <Text size={300} className={shared.pageDesc}>
        Create, copy and delete environments on your cloud tenants.
      </Text>
      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}

      <Card className={styles.cardWide}>
        <div className={styles.row}>
          <Field label="Tenant">
            <Dropdown
              value={tenant?.name ?? ''}
              selectedOptions={tenantId ? [tenantId] : []}
              onOptionSelect={(_e, d) => {
                setTenantId(String(d.optionValue ?? ''));
                setEnvironments(null);
                setCountries(null);
              }}
            >
              {settings?.tenants.map(t => <Option key={t.id} value={t.id}>{t.name}</Option>)}
            </Dropdown>
          </Field>
          <Button
            appearance="primary"
            icon={loading ? <Spinner size="tiny" /> : <ArrowSync24Regular />}
            disabled={loading || !tenantId}
            onClick={() => refresh()}
          >
            {environments ? 'Refresh' : 'Load environments'}
          </Button>
          <Button
            icon={<Add24Regular />}
            disabled={!tenantId || anyRunning}
            onClick={() => { setCreateOpen(true); loadCountries(); }}
          >
            New environment
          </Button>
        </div>
      </Card>

      {runs.length > 0 && (
        <Card className={styles.cardWide}>
          <Text weight="semibold">Environment operations</Text>
          <Table size="small" style={{ marginTop: '8px' }}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>Operation</TableHeaderCell>
                <TableHeaderCell>Environment</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Detail</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {runs.flatMap(run => run.results.map((r, i) => (
                <TableRow key={`${run.id}-${i}`}>
                  <TableCell>{r.appFile}</TableCell>
                  <TableCell>{r.environment}</TableCell>
                  <TableCell>
                    {r.status === 'running'
                      ? <Badge appearance="filled" color="warning">Running</Badge>
                      : r.status === 'succeeded'
                        ? <Badge appearance="filled" color="success">Succeeded</Badge>
                        : r.status === 'failed'
                          ? <Badge appearance="filled" color="danger">Failed</Badge>
                          : <Badge appearance="outline">{r.status}</Badge>}
                  </TableCell>
                  <TableCell>{r.message}</TableCell>
                </TableRow>
              )))}
            </TableBody>
          </Table>
          {runs[0]?.log.length > 0 && <div className={styles.log}>{runs[0].log.join('\n')}</div>}
        </Card>
      )}

      {!environments && !loading && (
        <Card className={styles.cardWide}>
          <EmptyState
            title="Nothing loaded yet"
            hint="Pick a tenant and click Load environments — nothing is fetched until you ask."
          />
        </Card>
      )}

      {loading && <Spinner label="Loading environments..." />}

      {environments && !loading && (
        <Card className={styles.cardWide}>
          {environments.length === 0 ? (
            <EmptyState title="No environments" hint="This tenant has no active environments." />
          ) : (
            <Table size="small">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Name</TableHeaderCell>
                  <TableHeaderCell>Type</TableHeaderCell>
                  <TableHeaderCell>Status</TableHeaderCell>
                  <TableHeaderCell>Version</TableHeaderCell>
                  <TableHeaderCell>Actions</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {environments.map(env => (
                  <TableRow key={env.name}>
                    <TableCell><Text weight="semibold">{env.name}</Text></TableCell>
                    <TableCell>
                      <Badge appearance="outline" color={env.type === 'Production' ? 'important' : 'informative'}>
                        {env.type ?? '—'}
                      </Badge>
                    </TableCell>
                    <TableCell>{statusBadge(env.status)}</TableCell>
                    <TableCell>{env.version ?? '—'}</TableCell>
                    <TableCell>
                      <div style={{ display: 'flex', gap: '8px' }}>
                        <Button
                          size="small"
                          icon={<Copy24Regular />}
                          disabled={anyRunning || (env.status ?? '').toLowerCase() !== 'active'}
                          onClick={() => { setCopySource(env); setCopyName(''); }}
                        >
                          Copy
                        </Button>
                        <Button
                          size="small"
                          icon={<Delete24Regular />}
                          disabled={anyRunning || (env.status ?? '').toLowerCase() !== 'active'}
                          onClick={() => { setDeleteTarget(env); setDeleteConfirm(''); }}
                        >
                          Delete
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      <Dialog open={createOpen} onOpenChange={(_e, d) => setCreateOpen(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>New environment</DialogTitle>
            <DialogContent>
              <div className={styles.form}>
                <Field label="Name" hint="Letters, numbers, dashes, underscores. Max 30 characters.">
                  <Input value={newName} onChange={(_e, d) => setNewName(d.value)} placeholder="e.g. UAT" />
                </Field>
                <Field label="Type">
                  <Dropdown
                    value={newType}
                    selectedOptions={[newType]}
                    onOptionSelect={(_e, d) => setNewType(d.optionValue === 'Production' ? 'Production' : 'Sandbox')}
                  >
                    <Option value="Sandbox">Sandbox</Option>
                    <Option value="Production">Production</Option>
                  </Dropdown>
                </Field>
                <Field label="Country/Region">
                  <Dropdown
                    value={countryCode}
                    selectedOptions={countryCode ? [countryCode] : []}
                    onOptionSelect={(_e, d) => setCountryCode(String(d.optionValue ?? ''))}
                  >
                    {(countries ?? []).map(c => (
                      <Option key={c.countryCode} value={c.countryCode}>{c.countryCode}</Option>
                    ))}
                  </Dropdown>
                </Field>
                {countries === null && (
                  <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Loading countries...</Text>
                )}
                {countries !== null && countries.length === 0 && (
                  <MessageBar intent="warning">
                    <MessageBarBody>No countries returned. Check that you are signed in on the Setup page.</MessageBarBody>
                  </MessageBar>
                )}
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  The environment is created with sample data on the latest version. Provisioning takes a few minutes.
                </Text>
              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setCreateOpen(false)}>Cancel</Button>
              <Button
                appearance="primary"
                disabled={submitting || !NAME_PATTERN.test(newName.trim()) || !countryCode}
                onClick={() => submit('create')}
              >
                {submitting ? 'Starting...' : 'Create'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={!!copySource} onOpenChange={(_e, d) => { if (!d.open) setCopySource(null); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Copy {copySource?.name}</DialogTitle>
            <DialogContent>
              <div className={styles.form}>
                <Field label="New environment name" hint="A sandbox copy with all data from the source environment.">
                  <Input value={copyName} onChange={(_e, d) => setCopyName(d.value)} placeholder={`${copySource?.name}-copy`} />
                </Field>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  Copying can take 15 minutes or more depending on database size.
                </Text>
              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setCopySource(null)}>Cancel</Button>
              <Button
                appearance="primary"
                disabled={submitting || !NAME_PATTERN.test(copyName.trim())}
                onClick={() => submit('copy')}
              >
                {submitting ? 'Starting...' : 'Start copy'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={!!deleteTarget} onOpenChange={(_e, d) => { if (!d.open) setDeleteTarget(null); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Delete {deleteTarget?.name}</DialogTitle>
            <DialogContent>
              <div className={styles.form}>
                <MessageBar intent="warning">
                  <MessageBarBody>
                    The environment is soft-deleted and recoverable for 14 days, then permanently removed.
                  </MessageBarBody>
                </MessageBar>
                <Field label={`Type "${deleteTarget?.name}" to confirm`}>
                  <Input value={deleteConfirm} onChange={(_e, d) => setDeleteConfirm(d.value)} />
                </Field>
              </div>
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setDeleteTarget(null)}>Cancel</Button>
              <Button
                appearance="primary"
                disabled={submitting || deleteConfirm !== deleteTarget?.name}
                onClick={() => submit('delete')}
              >
                {submitting ? 'Deleting...' : 'Delete environment'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
