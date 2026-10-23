import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Badge, Button, Card, Checkbox, Dialog, DialogActions, DialogBody,
  DialogContent, DialogSurface, DialogTitle, Dropdown, Field, makeStyles,
  MessageBar, MessageBarBody, Option, Spinner, Table, TableBody, TableCell,
  TableHeader, TableHeaderCell, TableRow, Text, Title2, Title3, tokens
} from '@fluentui/react-components';
import { ArrowUpload24Regular, Document24Regular, Play24Regular } from '@fluentui/react-icons';
import { api, subscribeRuns } from '../api';
import { ContainerCapabilities, DeployRun, Settings, StagedApp, TargetStatus } from '../types';

const useStyles = makeStyles({
  stack: { display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1100px' },
  card: { padding: '20px' },
  row: { display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' },
  dropZone: {
    border: `2px dashed ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusLarge,
    padding: '28px',
    textAlign: 'center',
    cursor: 'pointer',
    color: tokens.colorNeutralForeground3,
    marginTop: '12px'
  },
  dropZoneActive: {
    border: `2px dashed ${tokens.colorBrandStroke1}`,
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorNeutralForeground1
  },
  containerList: { display: 'flex', gap: '16px', flexWrap: 'wrap', marginTop: '8px' }
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

export default function ContainerDeployPage() {
  const styles = useStyles();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [caps, setCaps] = useState<ContainerCapabilities | null>(null);
  const [apps, setApps] = useState<StagedApp[]>([]);
  const [selectedApps, setSelectedApps] = useState<Set<string>>(new Set());
  const [selectedContainers, setSelectedContainers] = useState<Set<string>>(new Set());
  const [syncMode, setSyncMode] = useState<'Development' | 'Add' | 'Clean'>('Development');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [activeRun, setActiveRun] = useState<DeployRun | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    const [s, appList, capabilities, runs] = await Promise.all([
      api.get<Settings>('/api/settings'),
      api.get<StagedApp[]>('/api/apps'),
      api.get<ContainerCapabilities>('/api/containers/capabilities'),
      api.get<DeployRun[]>('/api/runs')
    ]);
    setSettings(s);
    setCaps(capabilities);
    setApps(appList);
    setActiveRun(prev => prev ?? runs.find(r => r.status === 'running' && r.kind === 'container') ?? null);
  }, []);

  useEffect(() => { refresh().catch(e => setError(e.message)); }, [refresh]);

  useEffect(() => {
    return subscribeRuns(run => {
      if (run.kind !== 'container') return;
      setActiveRun(prev => (prev && prev.id === run.id ? { ...run } : prev ?? (run.status === 'running' ? { ...run } : null)));
    });
  }, []);

  const uploadFiles = async (files: FileList | File[]) => {
    setError('');
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        if (!file.name.toLowerCase().endsWith('.app')) continue;
        await api.uploadApp(file);
      }
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setUploading(false);
    }
  };

  const deploy = async () => {
    setError('');
    try {
      const run = await api.post<DeployRun>('/api/containers/deploy', {
        appFiles: [...selectedApps],
        containerNames: [...selectedContainers],
        syncMode
      });
      setActiveRun(run);
      setConfirming(false);
    } catch (e: any) {
      setError(e.message);
      setConfirming(false);
    }
  };

  const containers = settings?.containers ?? [];
  const ready =
    selectedApps.size > 0 && selectedContainers.size > 0 &&
    !!caps?.bcContainerHelper && activeRun?.status !== 'running';

  return (
    <div className={styles.stack}>
      <Title2>Container PTE Deployment</Title2>
      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
      {caps && !caps.bcContainerHelper && (
        <MessageBar intent="warning">
          <MessageBarBody>
            {!caps.pwsh
              ? 'PowerShell 7 (pwsh) is not installed — container actions require it.'
              : 'BcContainerHelper is not installed. Run: Install-Module BcContainerHelper'}
          </MessageBarBody>
        </MessageBar>
      )}

      <Card className={styles.card}>
        <Title3>1. Upload apps</Title3>
        <div
          className={`${styles.dropZone} ${dragOver ? styles.dropZoneActive : ''}`}
          onClick={() => fileInput.current?.click()}
          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={e => { e.preventDefault(); setDragOver(false); uploadFiles(e.dataTransfer.files); }}
        >
          {uploading ? <Spinner size="small" /> : <ArrowUpload24Regular />}
          <div>Drop .app files here or click to browse (shared with cloud deployment)</div>
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
              </TableRow>
            </TableHeader>
            <TableBody>
              {apps.map(app => (
                <TableRow key={app.fileName}>
                  <TableCell>
                    <Checkbox
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
                  </TableCell>
                  <TableCell>{app.manifest?.publisher ?? '—'}</TableCell>
                  <TableCell>{app.manifest?.version ?? '—'}</TableCell>
                  <TableCell>{formatBytes(app.size)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className={styles.card}>
        <Title3>2. Select containers</Title3>
        {containers.length === 0 && (
          <Text block size={200} style={{ marginTop: '8px', color: tokens.colorNeutralForeground3 }}>
            No containers configured. Add them on the Containers page.
          </Text>
        )}
        <div className={styles.containerList}>
          {containers.filter(c => c.enabled).map(c => (
            <Checkbox
              key={c.containerName}
              label={`${c.name} (${c.containerName})`}
              checked={selectedContainers.has(c.containerName)}
              onChange={(_e, d) => {
                const next = new Set(selectedContainers);
                if (d.checked === true) next.add(c.containerName); else next.delete(c.containerName);
                setSelectedContainers(next);
              }}
            />
          ))}
        </div>
      </Card>

      <Card className={styles.card}>
        <Title3>3. Options &amp; deploy</Title3>
        <div className={styles.row} style={{ marginTop: '12px' }}>
          <Field label="Sync mode">
            <Dropdown
              value={syncMode}
              onOptionSelect={(_e, d) => setSyncMode(d.optionValue as typeof syncMode)}
              style={{ minWidth: '180px' }}
            >
              <Option value="Development">Development</Option>
              <Option value="Add">Add</Option>
              <Option value="Clean">Clean</Option>
            </Dropdown>
          </Field>
        </div>
        <div className={styles.row} style={{ marginTop: '20px' }}>
          <Button
            appearance="primary"
            size="large"
            icon={<Play24Regular />}
            disabled={!ready}
            onClick={() => setConfirming(true)}
          >
            Deploy {selectedApps.size > 0 && selectedContainers.size > 0
              ? `${selectedApps.size} app(s) to ${selectedContainers.size} container(s)`
              : ''}
          </Button>
        </div>
      </Card>

      {activeRun && activeRun.kind === 'container' && (
        <Card className={styles.card}>
          <div className={styles.row} style={{ justifyContent: 'space-between' }}>
            <Title3>Run {activeRun.status === 'running' ? 'in progress' : 'finished'}</Title3>
            {activeRun.status === 'running' && <Spinner size="tiny" />}
          </div>
          <Table size="small" style={{ marginTop: '12px' }}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell>App</TableHeaderCell>
                <TableHeaderCell>Container</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Detail</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {activeRun.results.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{r.appFile}</TableCell>
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
            <DialogTitle>Confirm container deployment</DialogTitle>
            <DialogContent>
              Deploy {selectedApps.size} app(s) to {selectedContainers.size} container(s)
              with sync mode {syncMode}? Apps are published, synced and installed/upgraded.
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
