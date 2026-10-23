import { useCallback, useEffect, useState } from 'react';
import {
  Badge, Button, Card, Checkbox, Field, Input, makeStyles, MessageBar,
  MessageBarBody, Option, Dropdown, Spinner, Table, TableBody, TableCell,
  TableHeader, TableHeaderCell, TableRow, Text, Title2, Title3, tokens
} from '@fluentui/react-components';
import {
  Add24Regular, ArrowSync24Regular, Delete24Regular, Play24Regular
} from '@fluentui/react-icons';
import { api, subscribeRuns } from '../api';
import EmptyState from '../components/EmptyState';
import { useSharedStyles } from '../theme';
import { ContainersResponse, DeployRun, Settings } from '../types';
import RunLog from '../components/RunLog';

const useStyles = makeStyles({
  stack: { display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1100px' },
  row: { display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
    gap: '16px',
    marginTop: '12px'
  }
});

export default function ContainersPage() {
  const styles = useStyles();
  const shared = useSharedStyles();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [data, setData] = useState<ContainersResponse | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState<DeployRun | null>(null);

  // Create form state
  const [form, setForm] = useState({
    containerName: '',
    artifactType: 'Sandbox',
    country: 'nz',
    select: 'Latest',
    version: '',
    username: 'admin',
    password: '',
    acceptEula: false,
    memoryLimit: '8G',
    updateHosts: true,
    includeTestToolkit: false,
    includeTestLibrariesOnly: false,
    includePerformanceToolkit: false,
    assignPremiumPlan: false,
    licenseFile: '',
    dns: ''
  });

  const refresh = useCallback(async () => {
    const [s, c] = await Promise.all([
      api.get<Settings>('/api/settings'),
      api.get<ContainersResponse>('/api/containers')
    ]);
    setSettings(s);
    setData(c);
    // Pre-fill the create form from saved defaults (only before the user edits)
    setForm(prev => {
      if (prev.containerName || prev.licenseFile || prev.dns) return prev;
      return {
        ...prev,
        licenseFile: s.containerDefaults?.licenseFile ?? '',
        dns: s.containerDefaults?.dns ?? '',
        country: s.containerDefaults?.country || 'nz',
        memoryLimit: s.containerDefaults?.memoryLimit || '8G'
      };
    });
  }, []);

  useEffect(() => { refresh().catch(e => setError(e.message)); }, [refresh]);

  // Track live container-create runs
  useEffect(() => {
    return subscribeRuns(run => {
      if (run.kind !== 'container-create') return;
      setCreating(prev => (prev && prev.id === run.id ? { ...run } : run.status === 'running' ? { ...run } : prev));
      if (run.status !== 'running') refresh().catch(() => undefined);
    });
  }, [refresh]);

  const saveContainers = async (containers: Settings['containers']) => {
    if (!settings) return;
    setError('');
    try {
      await api.put('/api/settings', { ...settings, containers });
      await refresh();
      setNotice('Saved');
      setTimeout(() => setNotice(''), 2000);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const saveDefaults = async (defaults: Settings['containerDefaults']) => {
    if (!settings) return;
    const next = { ...settings, containerDefaults: defaults };
    setSettings(next);
    setError('');
    try {
      await api.put('/api/settings', next);
      setNotice('Defaults saved');
      setTimeout(() => setNotice(''), 2000);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const createContainer = async () => {
    setError('');
    try {
      const run = await api.post<DeployRun>('/api/containers/create', {
        ...form,
        version: form.version || undefined,
        licenseFile: form.licenseFile || undefined,
        dns: form.dns || undefined
      });
      setCreating(run);
    } catch (e: any) {
      setError(e.message);
    }
  };

  if (!settings || !data) return <Spinner label="Loading containers..." />;

  const dockerByName = new Map(data.running.map(d => [d.name, d]));

  return (
    <div className={styles.stack}>
      <Title2>Containers</Title2>
      <Text size={300} className={shared.pageDesc}>
        Map friendly names to Docker containers, save defaults once, create new ones here.
      </Text>
      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
      {notice && <MessageBar intent="success"><MessageBarBody>{notice}</MessageBarBody></MessageBar>}
      {!data.capabilities.docker && (
        <MessageBar intent="warning">
          <MessageBarBody>Docker is not running or not installed — live container status is unavailable.</MessageBarBody>
        </MessageBar>
      )}
      {!data.capabilities.bcContainerHelper && (
        <MessageBar intent="warning">
          <MessageBarBody>
            {!data.capabilities.pwsh
              ? 'PowerShell 7 (pwsh) is not installed — container actions require it.'
              : 'BcContainerHelper module is not installed. Run: Install-Module BcContainerHelper'}
          </MessageBarBody>
        </MessageBar>
      )}

      <Card className={shared.card}>
        <div className={styles.row} style={{ justifyContent: 'space-between' }}>
          <Title3>Configured containers</Title3>
          <div className={styles.row}>
            <Button icon={<ArrowSync24Regular />} onClick={() => refresh()}>Refresh</Button>
            <Button
              icon={<Add24Regular />}
              onClick={() => saveContainers([...settings.containers, { name: '', containerName: '', enabled: true }])}
            >
              Add
            </Button>
          </div>
        </div>
        {settings.containers.length === 0 && (
          <EmptyState
            title="No containers configured"
            hint="Add one to map a friendly name to a Docker container on this machine."
          />
        )}
        {settings.containers.length > 0 && (
          <Table size="small" style={{ marginTop: '12px' }}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell style={{ width: '60px' }}>Enabled</TableHeaderCell>
                <TableHeaderCell>Name</TableHeaderCell>
                <TableHeaderCell>Container name</TableHeaderCell>
                <TableHeaderCell>Docker status</TableHeaderCell>
                <TableHeaderCell style={{ width: '60px' }} />
              </TableRow>
            </TableHeader>
            <TableBody>
              {settings.containers.map((c, idx) => {
                const docker = dockerByName.get(c.containerName);
                return (
                  <TableRow key={idx}>
                    <TableCell>
                      <Checkbox
                        checked={c.enabled}
                        onChange={(_e, d) => {
                          const next = settings.containers.map((x, i) =>
                            i === idx ? { ...x, enabled: d.checked === true } : x);
                          saveContainers(next);
                        }}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        size="small"
                        value={c.name}
                        placeholder="Friendly name"
                        onChange={(_e, d) => {
                          const next = settings.containers.map((x, i) => i === idx ? { ...x, name: d.value } : x);
                          setSettings({ ...settings, containers: next });
                        }}
                        onBlur={() => saveContainers(settings.containers)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        size="small"
                        value={c.containerName}
                        placeholder="e.g. bc28"
                        onChange={(_e, d) => {
                          const next = settings.containers.map((x, i) => i === idx ? { ...x, containerName: d.value } : x);
                          setSettings({ ...settings, containers: next });
                        }}
                        onBlur={() => saveContainers(settings.containers)}
                      />
                    </TableCell>
                    <TableCell>
                      {docker
                        ? <Badge appearance="filled" color={docker.running ? 'success' : 'subtle'}>{docker.status}</Badge>
                        : <Text size={200} style={{ color: tokens.colorNeutralForeground4 }}>not found</Text>}
                    </TableCell>
                    <TableCell>
                      <Button
                        icon={<Delete24Regular />}
                        appearance="subtle"
                        onClick={() => saveContainers(settings.containers.filter((_x, i) => i !== idx))}
                      />
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Card>

      <Card className={shared.card}>
        <Title3>Container defaults</Title3>
        <Text block size={200} style={{ margin: '4px 0 12px', color: tokens.colorNeutralForeground3 }}>
          Saved once and pre-filled in the create form below.
        </Text>
        <div className={styles.row}>
          <Field label="License file" style={{ minWidth: '320px', flexGrow: 1 }}>
            <Input
              value={settings.containerDefaults?.licenseFile ?? ''}
              placeholder="C:\path\license.flf"
              onChange={(_e, d) => setSettings({
                ...settings,
                containerDefaults: { ...settings.containerDefaults, licenseFile: d.value }
              })}
              onBlur={() => saveDefaults(settings.containerDefaults)}
            />
          </Field>
          <Field label="DNS">
            <Input
              value={settings.containerDefaults?.dns ?? ''}
              placeholder="e.g. 8.8.8.8"
              onChange={(_e, d) => setSettings({
                ...settings,
                containerDefaults: { ...settings.containerDefaults, dns: d.value }
              })}
              onBlur={() => saveDefaults(settings.containerDefaults)}
            />
          </Field>
          <Field label="Country">
            <Input
              value={settings.containerDefaults?.country ?? 'nz'}
              style={{ width: '90px' }}
              onChange={(_e, d) => setSettings({
                ...settings,
                containerDefaults: { ...settings.containerDefaults, country: d.value }
              })}
              onBlur={() => saveDefaults(settings.containerDefaults)}
            />
          </Field>
          <Field label="Memory limit">
            <Input
              value={settings.containerDefaults?.memoryLimit ?? '8G'}
              style={{ width: '90px' }}
              onChange={(_e, d) => setSettings({
                ...settings,
                containerDefaults: { ...settings.containerDefaults, memoryLimit: d.value }
              })}
              onBlur={() => saveDefaults(settings.containerDefaults)}
            />
          </Field>
        </div>
      </Card>

      <Card className={shared.card}>
        <Title3>Create new container</Title3>
        <div className={styles.grid}>
          <Field label="Container name" required>
            <Input value={form.containerName} onChange={(_e, d) => setForm({ ...form, containerName: d.value })} placeholder="bc28" />
          </Field>
          <Field label="Type">
            <Dropdown value={form.artifactType} onOptionSelect={(_e, d) => setForm({ ...form, artifactType: d.optionValue ?? 'Sandbox' })}>
              <Option value="Sandbox">Sandbox</Option>
              <Option value="OnPrem">OnPrem</Option>
            </Dropdown>
          </Field>
          <Field label="Country">
            <Input value={form.country} onChange={(_e, d) => setForm({ ...form, country: d.value })} placeholder="nz" />
          </Field>
          <Field label="Version select">
            <Dropdown value={form.select} onOptionSelect={(_e, d) => setForm({ ...form, select: d.optionValue ?? 'Latest' })}>
              {['Latest', 'LatestMinor', 'LatestMajor', 'NextMajor', 'NextMinor'].map(s => <Option key={s} value={s}>{s}</Option>)}
            </Dropdown>
          </Field>
          <Field label="Specific version (optional)">
            <Input value={form.version} onChange={(_e, d) => setForm({ ...form, version: d.value })} placeholder="e.g. 26.0" />
          </Field>
          <Field label="Memory limit">
            <Input value={form.memoryLimit} onChange={(_e, d) => setForm({ ...form, memoryLimit: d.value })} />
          </Field>
          <Field label="Username" required>
            <Input value={form.username} onChange={(_e, d) => setForm({ ...form, username: d.value })} />
          </Field>
          <Field label="Password" required>
            <Input type="password" value={form.password} onChange={(_e, d) => setForm({ ...form, password: d.value })} />
          </Field>
          <Field label="License file (optional)">
            <Input value={form.licenseFile} onChange={(_e, d) => setForm({ ...form, licenseFile: d.value })} placeholder="C:\path\license.flf" />
          </Field>
          <Field label="DNS (optional)">
            <Input value={form.dns} onChange={(_e, d) => setForm({ ...form, dns: d.value })} placeholder="e.g. 8.8.8.8" />
          </Field>
        </div>
        <div className={styles.row} style={{ marginTop: '16px' }}>
          <Checkbox label="I accept the BC EULA" checked={form.acceptEula} onChange={(_e, d) => setForm({ ...form, acceptEula: d.checked === true })} />
          <Checkbox label="Update hosts file" checked={form.updateHosts} onChange={(_e, d) => setForm({ ...form, updateHosts: d.checked === true })} />
          <Checkbox label="Test toolkit" checked={form.includeTestToolkit} onChange={(_e, d) => setForm({ ...form, includeTestToolkit: d.checked === true })} />
          <Checkbox label="Test libraries only" checked={form.includeTestLibrariesOnly} onChange={(_e, d) => setForm({ ...form, includeTestLibrariesOnly: d.checked === true })} />
          <Checkbox label="Performance toolkit" checked={form.includePerformanceToolkit} onChange={(_e, d) => setForm({ ...form, includePerformanceToolkit: d.checked === true })} />
          <Checkbox label="Assign premium plan" checked={form.assignPremiumPlan} onChange={(_e, d) => setForm({ ...form, assignPremiumPlan: d.checked === true })} />
        </div>
        <div className={styles.row} style={{ marginTop: '16px' }}>
          <Button
            appearance="primary"
            icon={creating?.status === 'running' ? <Spinner size="tiny" /> : <Play24Regular />}
            disabled={!form.containerName || !form.password || !form.acceptEula || creating?.status === 'running' || !data.capabilities.bcContainerHelper}
            onClick={createContainer}
          >
            {creating?.status === 'running' ? 'Creating...' : 'Create container'}
          </Button>
          <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
            Creating a container takes several minutes. Output streams below.
          </Text>
        </div>
        {creating && <RunLog lines={creating.log} />}
      </Card>
    </div>
  );
}
