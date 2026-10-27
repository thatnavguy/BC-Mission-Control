import { useCallback, useEffect, useState } from 'react';
import {
  Badge, Button, Card, Checkbox, Dialog, DialogActions, DialogBody,
  DialogContent, DialogSurface, DialogTitle, Dropdown, Field, makeStyles,
  MessageBar, MessageBarBody, Option, Spinner, Table, TableBody, TableCell,
  TableHeader, TableHeaderCell, TableRow, Text, Title2, tokens
} from '@fluentui/react-components';
import { ArrowSync24Regular, ArrowUp24Regular, CalendarClock24Regular } from '@fluentui/react-icons';
import { api, subscribeRuns } from '../api';
import EmptyState from '../components/EmptyState';
import { useSharedStyles } from '../theme';
import { AppUpdateInfo, DeployRun, Settings } from '../types';

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
  version: { fontWeight: 700 },
  log: {
    fontFamily: tokens.fontFamilyMonospace, fontSize: '12px', whiteSpace: 'pre-wrap',
    backgroundColor: '#f7f6f4', border: '1px solid #edebe8', padding: '12px',
    borderRadius: '8px', maxHeight: '240px', overflowY: 'auto', marginTop: '12px'
  }
});

function resultBadge(status: string) {
  switch (status) {
    case 'running': return <Badge appearance="filled" color="warning">Running</Badge>;
    case 'succeeded': return <Badge appearance="filled" color="success">Succeeded</Badge>;
    case 'scheduled': return <Badge appearance="filled" color="informative">Scheduled</Badge>;
    case 'failed': return <Badge appearance="filled" color="danger">Failed</Badge>;
    case 'skipped': return <Badge appearance="outline" color="subtle">Skipped</Badge>;
    default: return <Badge appearance="outline">Pending</Badge>;
  }
}

export default function UpdatesPage() {
  const styles = useStyles();
  const shared = useSharedStyles();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tenantId, setTenantId] = useState('');
  const [environment, setEnvironment] = useState('');
  const [updates, setUpdates] = useState<AppUpdateInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirming, setConfirming] = useState(false);
  const [useWindow, setUseWindow] = useState(false);
  const [activeRun, setActiveRun] = useState<DeployRun | null>(null);

  useEffect(() => {
    api.get<Settings>('/api/settings').then(s => {
      setSettings(s);
      const first = s.tenants.find(t => Object.values(t.environments).some(Boolean));
      if (first) {
        setTenantId(first.id);
        const firstEnv = Object.entries(first.environments).find(([, e]) => e);
        if (firstEnv) setEnvironment(firstEnv[0]);
      }
    }).catch(e => setError(e.message));
  }, []);

  // Track live progress of app-update runs
  useEffect(() => subscribeRuns(run => {
    if (run.kind !== 'app-update') return;
    setActiveRun(prev => {
      if (prev && prev.id !== run.id && prev.status === 'running') return prev;
      return run;
    });
  }), []);

  const tenant = settings?.tenants.find(t => t.id === tenantId);
  const envNames = tenant ? Object.entries(tenant.environments).filter(([, e]) => e).map(([n]) => n) : [];

  const check = useCallback(async () => {
    setError('');
    setLoading(true);
    setUpdates(null);
    try {
      const list = await api.get<AppUpdateInfo[]>(`/api/app-updates?tenantId=${encodeURIComponent(tenantId)}&environment=${encodeURIComponent(environment)}`);
      setUpdates(list);
      setSelected(new Set(list.map(u => u.appId)));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId, environment]);

  const startRun = async (inWindow: boolean) => {
    if (!updates) return;
    setError('');
    try {
      const apps = updates
        .filter(u => selected.has(u.appId))
        .map(u => ({ appId: u.appId, name: u.name, targetVersion: u.version }));
      const run = await api.post<DeployRun>('/api/app-updates/run', {
        tenantId,
        environment,
        apps,
        useEnvironmentUpdateWindow: inWindow
      });
      setActiveRun(run);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const runFinished = activeRun && activeRun.status !== 'running';

  return (
    <div className={styles.stack}>
      <Title2>App Updates</Title2>
      <Text size={300} className={shared.pageDesc}>
        Available AppSource app updates per environment — apply now or in the update window.
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
                setEnvironment(firstEnv ? firstEnv[0] : '');
                setUpdates(null);
              }}
            >
              {settings?.tenants.map(t => <Option key={t.id} value={t.id}>{t.name}</Option>)}
            </Dropdown>
          </Field>
          <Field label="Environment">
            <Dropdown
              value={environment}
              selectedOptions={environment ? [environment] : []}
              onOptionSelect={(_e, d) => { setEnvironment(String(d.optionValue ?? '')); setUpdates(null); }}
            >
              {envNames.map(n => <Option key={n} value={n}>{n}</Option>)}
            </Dropdown>
          </Field>
          <Button
            appearance="primary"
            icon={loading ? <Spinner size="tiny" /> : <ArrowSync24Regular />}
            disabled={loading || !tenantId || !environment}
            onClick={check}
          >
            Check for updates
          </Button>
        </div>
      </Card>

      {!updates && !loading && (
        <Card className={styles.cardWide}>
          <EmptyState
            title="Nothing checked yet"
            hint="Pick a tenant and environment, then click Check for updates — nothing is fetched until you ask."
          />
        </Card>
      )}

      {loading && <Spinner label="Checking for available updates..." />}

      {updates && !loading && (
        <Card className={styles.cardWide}>
          {updates.length === 0 ? (
            <EmptyState title="All up to date" hint="No AppSource app updates are available for this environment." />
          ) : (
            <>
              <div className={styles.row} style={{ marginBottom: '12px' }}>
                <Button
                  appearance="primary"
                  icon={<ArrowUp24Regular />}
                  disabled={selected.size === 0 || activeRun?.status === 'running'}
                  onClick={() => { setUseWindow(false); setConfirming(true); }}
                >
                  Update {selected.size > 0 ? `${selected.size} ` : ''}now
                </Button>
                <Button
                  icon={<CalendarClock24Regular />}
                  disabled={selected.size === 0 || activeRun?.status === 'running'}
                  onClick={() => { setUseWindow(true); setConfirming(true); }}
                >
                  Schedule in update window
                </Button>
              </div>
              <Table size="small">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell style={{ width: '36px' }}>
                      <Checkbox
                        checked={selected.size === updates.length}
                        onChange={(_e, d) => setSelected(d.checked === true ? new Set(updates.map(u => u.appId)) : new Set())}
                      />
                    </TableHeaderCell>
                    <TableHeaderCell>App</TableHeaderCell>
                    <TableHeaderCell>Publisher</TableHeaderCell>
                    <TableHeaderCell>Available version</TableHeaderCell>
                    <TableHeaderCell>Also required</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {updates.map(u => (
                    <TableRow key={u.appId}>
                      <TableCell>
                        <Checkbox
                          checked={selected.has(u.appId)}
                          onChange={(_e, d) => {
                            const next = new Set(selected);
                            if (d.checked === true) next.add(u.appId); else next.delete(u.appId);
                            setSelected(next);
                          }}
                        />
                      </TableCell>
                      <TableCell>{u.name}</TableCell>
                      <TableCell>{u.publisher}</TableCell>
                      <TableCell><span className={styles.version}>{u.version}</span></TableCell>
                      <TableCell>
                        {u.requirements.length === 0
                          ? <Text style={{ color: tokens.colorNeutralForeground4 }}>—</Text>
                          : u.requirements.map(r => `${r.name} ${r.version} (${r.type.toLowerCase()})`).join(', ')}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <Text block size={200} style={{ marginTop: '8px', color: tokens.colorNeutralForeground3 }}>
                Dependencies are installed or updated automatically with each app update.
              </Text>
            </>
          )}
        </Card>
      )}

      {activeRun && (
        <Card className={styles.cardWide}>
          <Text weight="semibold">
            Update run — {activeRun.status === 'running' ? 'in progress' : activeRun.status}
          </Text>
          <Table size="small" style={{ marginTop: '8px' }}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>App</TableHeaderCell>
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
          {activeRun.log.length > 0 && <div className={styles.log}>{activeRun.log.join('\n')}</div>}
          {runFinished && (
            <Button style={{ marginTop: '12px' }} icon={<ArrowSync24Regular />} onClick={check}>
              Re-check updates
            </Button>
          )}
        </Card>
      )}

      <Dialog open={confirming} onOpenChange={(_e, d) => setConfirming(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{useWindow ? 'Schedule app updates' : 'Update apps now'}</DialogTitle>
            <DialogContent>
              {useWindow
                ? `Update ${selected.size} app(s) on ${environment} during the environment's update window?`
                : `Update ${selected.size} app(s) on ${environment} immediately? Users may be disconnected while updates are installed.`}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setConfirming(false)}>Cancel</Button>
              <Button
                appearance="primary"
                onClick={() => { setConfirming(false); startRun(useWindow); }}
              >
                {useWindow ? 'Schedule' : 'Update now'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
