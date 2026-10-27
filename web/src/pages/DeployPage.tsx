import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Badge, Button, Card, Checkbox, Dialog, DialogActions, DialogBody,
  DialogContent, DialogSurface, DialogTitle, Dropdown, Field, makeStyles,
  MessageBar, MessageBarBody, Option, SpinButton, Spinner, Table, TableBody, TableCell,
  TableHeader, TableHeaderCell, TableRow, Text, Title2, Title3, tokens
} from '@fluentui/react-components';
import {
  ArrowUpload24Regular, Delete24Regular, Document24Regular, Play24Regular
} from '@fluentui/react-icons';
import { api, subscribeRuns } from '../api';
import { useSharedStyles } from '../theme';
import { AuthStatus, DeployRun, Settings, StagedApp, TargetStatus } from '../types';

const useStyles = makeStyles({
  stack: { display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1100px' },
  row: { display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' },
  dropZone: {
    border: '1.5px dashed #d6d3cf',
    borderRadius: '10px',
    backgroundColor: '#fafafa',
    padding: '32px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '8px',
    cursor: 'pointer',
    color: tokens.colorNeutralForeground3,
    marginTop: '12px'
  },
  dropZoneActive: {
    border: `2px dashed ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorNeutralForeground1
  },
  tenantGroup: { marginTop: '8px' },
  envList: { display: 'flex', gap: '16px', flexWrap: 'wrap', marginLeft: '28px' }
});

function statusBadge(status: TargetStatus) {
  const map: Record<TargetStatus, { color: any; label: string }> = {
    pending: { color: 'informative', label: 'Pending' },
    running: { color: 'warning', label: 'Running' },
    succeeded: { color: 'success', label: 'Succeeded' },
    skipped: { color: 'subtle', label: 'Skipped' },
    scheduled: { color: 'brand', label: 'Scheduled' },
    failed: { color: 'danger', label: 'Failed' }
  };
  const { color, label } = map[status];
  return <Badge appearance="filled" color={color}>{label}</Badge>;
}

function formatBytes(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(n / 1e3))} KB`;
}

export default function DeployPage() {
  const styles = useStyles();
  const shared = useSharedStyles();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [apps, setApps] = useState<StagedApp[]>([]);
  const [selectedApps, setSelectedApps] = useState<Set<string>>(new Set());
  const [targets, setTargets] = useState<Set<string>>(new Set()); // `${tenantId}|${env}`
  const [schedule, setSchedule] = useState<'Immediate' | 'UpdateWindow'>('Immediate');
  const [schemaSync, setSchemaSync] = useState<'Add' | 'Force'>('Add');
  const [delay, setDelay] = useState(0);
  const [acceptEula, setAcceptEula] = useState(false);
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [activeRun, setActiveRun] = useState<DeployRun | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [s, a, appList, runs] = await Promise.all([
      api.get<Settings>('/api/settings'),
      api.get<AuthStatus>('/api/auth/status'),
      api.get<StagedApp[]>('/api/apps'),
      api.get<DeployRun[]>('/api/runs')
    ]);
    setSettings(s);
    setAuth(a);
    setApps(appList);
    setActiveRun(prev => prev ?? runs.find(r => r.status === 'running' || r.status === 'waiting') ?? null);
    return appList;
  }, []);

  useEffect(() => { refresh().catch(e => setError(e.message)); }, [refresh]);

  // Live updates for the active run
  useEffect(() => {
    return subscribeRuns(run => {
      setActiveRun(prev => (prev && prev.id === run.id ? { ...run } : prev ?? (run.status === 'running' || run.status === 'waiting' ? { ...run } : null)));
    });
  }, []);

  const uploadFiles = async (files: FileList | File[]) => {
    setError('');
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of Array.from(files)) {
        if (!file.name.toLowerCase().endsWith('.app')) {
          setError(`Skipped ${file.name} — only .app files are allowed`);
          continue;
        }
        await api.uploadApp(file);
        uploaded.push(file.name);
      }
      const appList = await refresh();
      const selectable = new Set((appList ?? []).filter(a => !a.manifestError).map(a => a.fileName));
      setSelectedApps(prev => new Set([...prev, ...uploaded.filter(f => selectable.has(f))]));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const enabledTargets = useMemo(() => {
    if (!settings) return [];
    return settings.tenants.flatMap(t =>
      Object.entries(t.environments)
        .filter(([, enabled]) => enabled)
        .map(([env]) => ({ tenantId: t.id, tenantName: t.name, environment: env }))
    );
  }, [settings]);

  const deploy = async () => {
    setError('');
    try {
      const run = await api.post<DeployRun>('/api/deploy', {
        appFiles: [...selectedApps],
        targets: [...targets].map(key => {
          const [tenantId, environment] = key.split('|');
          return { tenantId, environment };
        }),
        schedule,
        schemaSync,
        acceptIsvEula: acceptEula,
        delayMinutes: delay
      });
      setActiveRun(run);
      setConfirming(false);
    } catch (e: any) {
      setError(e.message);
      setConfirming(false);
    }
  };

  const cancelActiveRun = async () => {
    if (!activeRun) return;
    setError('');
    try {
      await api.post(`/api/runs/${activeRun.id}/cancel`);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const readyToDeploy =
    selectedApps.size > 0 && targets.size > 0 && !!auth?.signedIn && !auth?.expired &&
    (schedule === 'Immediate' || acceptEula) &&
    activeRun?.status !== 'running' && activeRun?.status !== 'waiting';

  return (
    <div className={styles.stack}>
      <Title2>PTE Deployment</Title2>
      <Text size={300} className={shared.pageDesc}>
        Stage .app files, pick target environments, deploy — with live per-target progress.
      </Text>
      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
      {auth && (!auth.signedIn || auth.expired) && (
        <MessageBar intent="warning">
          <MessageBarBody>You are not signed in. Go to Setup and sign in before deploying.</MessageBarBody>
        </MessageBar>
      )}

      <Card className={shared.card}>
        <Title3><span className={shared.stepNum}>1</span>Upload apps</Title3>
        <div
          className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ''}`}
          onClick={() => fileInput.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); uploadFiles(e.dataTransfer.files); }}
        >
          {uploading ? <Spinner size="small" /> : <ArrowUpload24Regular />}
          <div>Drop .app files here or click to browse</div>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept=".app"
          multiple
          style={{ display: 'none' }}
          onChange={e => { if (e.target.files) uploadFiles(e.target.files); e.target.value = ''; }}
        />
        {apps.length > 0 && (
          <Table size="small" style={{ marginTop: '12px' }}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell style={{ width: '44px' }} />
                <TableHeaderCell>App</TableHeaderCell>
                <TableHeaderCell>Publisher</TableHeaderCell>
                <TableHeaderCell>Version</TableHeaderCell>
                <TableHeaderCell>Size</TableHeaderCell>
                <TableHeaderCell style={{ width: '60px' }} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {apps.map(app => (
                <TableRow key={app.fileName}>
                  <TableCell>
                    <Checkbox
                      disabled={!!app.manifestError}
                      checked={selectedApps.has(app.fileName)}
                      onChange={(_e, d) => {
                        const next = new Set(selectedApps);
                        if (d.checked === true) next.add(app.fileName); else next.delete(app.fileName);
                        setSelectedApps(next);
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    <Document24Regular style={{ verticalAlign: 'middle', marginRight: 6 }} />
                    {app.manifest?.name ?? app.fileName}
                    {app.manifestError && (
                      <Text size={100} style={{ color: tokens.colorPaletteRedForeground1, display: 'block' }}>
                        {app.manifestError}
                      </Text>
                    )}
                  </TableCell>
                  <TableCell>{app.manifest?.publisher ?? '—'}</TableCell>
                  <TableCell>{app.manifest?.version ?? '—'}</TableCell>
                  <TableCell>{formatBytes(app.size)}</TableCell>
                  <TableCell>
                    <Button
                      icon={<Delete24Regular />}
                      appearance="subtle"
                      onClick={async () => {
                        await api.delete(`/api/apps/${encodeURIComponent(app.fileName)}`);
                        const next = new Set(selectedApps);
                        next.delete(app.fileName);
                        setSelectedApps(next);
                        await refresh();
                      }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className={shared.card}>
        <Title3><span className={shared.stepNum}>2</span>Select targets</Title3>
        {enabledTargets.length === 0 && (
          <Text block size={200} style={{ marginTop: '8px', color: tokens.colorNeutralForeground3 }}>
            No environments enabled. Configure tenants and environments on the Setup page.
          </Text>
        )}
        {settings?.tenants.map(tenant => {
          const envs = Object.entries(tenant.environments).filter(([, e]) => e);
          if (envs.length === 0) return null;
          const keys = envs.map(([env]) => `${tenant.id}|${env}`);
          const allChecked = keys.every(k => targets.has(k));
          return (
            <div key={tenant.id} className={styles.tenantGroup}>
              <Checkbox
                label={<Text weight="semibold">{tenant.name}</Text>}
                checked={allChecked}
                onChange={(_e, d) => {
                  const next = new Set(targets);
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
                      checked={targets.has(key)}
                      onChange={(_e, d) => {
                        const next = new Set(targets);
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
      </Card>

      <Card className={shared.card}>
        <Title3><span className={shared.stepNum}>3</span>Options &amp; deploy</Title3>
        <div className={styles.row} style={{ marginTop: '12px' }}>
          <Field label="Schedule">
            <Dropdown
              value={schedule === 'Immediate' ? 'Immediate' : 'Update window'}
              onOptionSelect={(_e, d) => setSchedule(d.optionValue as 'Immediate' | 'UpdateWindow')}
              style={{ minWidth: '200px' }}
            >
              <Option value="Immediate">Immediate</Option>
              <Option value="UpdateWindow">Update window</Option>
            </Dropdown>
          </Field>
          <Field label="Schema sync mode">
            <Dropdown
              value={schemaSync}
              onOptionSelect={(_e, d) => setSchemaSync(d.optionValue as 'Add' | 'Force')}
              style={{ minWidth: '160px' }}
            >
              <Option value="Add">Add</Option>
              <Option value="Force">Force</Option>
            </Dropdown>
          </Field>
          <Field label={delay > 0 ? `Start in ${delay} min` : 'Start delay (minutes)'}>
            <SpinButton
              value={delay}
              min={0}
              max={1440}
              onChange={(_e, d) => {
                const v = d.value ?? parseInt(d.displayValue ?? '', 10);
                setDelay(Number.isFinite(v) ? Math.max(0, Math.min(1440, v)) : 0);
              }}
              style={{ minWidth: '120px' }}
            />
          </Field>
          {schedule === 'UpdateWindow' && (
            <Checkbox
              label="I accept the ISV EULA for these PTEs"
              checked={acceptEula}
              onChange={(_e, d) => setAcceptEula(d.checked === true)}
            />
          )}
        </div>
        <div className={styles.row} style={{ marginTop: '20px' }}>
          <Button
            appearance="primary"
            size="large"
            icon={<Play24Regular />}
            disabled={!readyToDeploy}
            onClick={() => setConfirming(true)}
          >
            Deploy {selectedApps.size > 0 && targets.size > 0
              ? `${selectedApps.size} app(s) to ${targets.size} environment(s)`
              : ''}
          </Button>
        </div>
      </Card>

      {activeRun && (
        <Card className={shared.card}>
          <div className={styles.row} style={{ justifyContent: 'space-between' }}>
            <Title3>
              Run {activeRun.status === 'running' ? 'in progress' : activeRun.status === 'waiting' ? 'waiting to start' : 'finished'}
            </Title3>
            {activeRun.status === 'running' && <Spinner size="tiny" />}
            {activeRun.status === 'waiting' && (
              <div className={styles.row} style={{ alignItems: 'center', gap: '8px' }}>
                <Badge appearance="filled" color="informative">
                  Starts {activeRun.scheduledStartAt ? new Date(activeRun.scheduledStartAt).toLocaleTimeString() : 'soon'}
                </Badge>
                <Button appearance="secondary" onClick={cancelActiveRun}>Cancel</Button>
              </div>
            )}
            {activeRun.status !== 'running' && activeRun.status !== 'waiting' && statusSummaryBadge(activeRun)}
          </div>
          <Table size="small" style={{ marginTop: '12px' }}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>App</TableHeaderCell>
                <TableHeaderCell>Tenant</TableHeaderCell>
                <TableHeaderCell>Environment</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Detail</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeRun.results.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{r.appFile}</TableCell>
                  <TableCell>{r.tenantName}</TableCell>
                  <TableCell>{r.environment}</TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                  <TableCell>
                    <Text size={200} style={{ color: r.status === 'failed' ? tokens.colorPaletteRedForeground1 : undefined }}>
                      {r.message}
                    </Text>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      )}

      <Dialog open={confirming} onOpenChange={(_e, d) => setConfirming(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Confirm deployment</DialogTitle>
            <DialogContent>
              Deploy {selectedApps.size} app(s) to {targets.size} environment(s)
              {schedule === 'UpdateWindow' ? ' during the next update window' : ' immediately'}
              {' '}with schema sync mode {schemaSync}
              {delay > 0 ? ` — starting in ${delay} minutes` : ''}?
              {delay > 0 && (
                <div style={{ marginTop: '8px' }}>
                  The deployment runs on this PC — keep it awake and Mission Control running.
                  You can close this page and cancel any time before it starts.
                </div>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setConfirming(false)}>Cancel</Button>
              <Button appearance="primary" onClick={deploy}>Deploy</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}

function statusSummaryBadge(run: DeployRun) {
  if (run.status === 'canceled') return <Badge appearance="filled" color="subtle">Canceled</Badge>;
  const failed = run.results.filter(r => r.status === 'failed').length;
  if (run.status === 'failed' || failed === run.results.length) {
    return <Badge appearance="filled" color="danger">Failed</Badge>;
  }
  if (failed > 0) return <Badge appearance="filled" color="warning">Completed with {failed} error(s)</Badge>;
  return <Badge appearance="filled" color="success">Completed</Badge>;
}
