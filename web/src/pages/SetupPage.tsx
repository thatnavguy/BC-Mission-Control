import { useCallback, useEffect, useState } from 'react';
import {
  Badge, Button, Card, Checkbox, Dialog, DialogActions, DialogBody,
  DialogContent, DialogSurface, DialogTitle, Field, Input, makeStyles,
  MessageBar, MessageBarBody, Spinner, Table, TableBody, TableCell,
  TableHeader, TableHeaderCell, TableRow, Text, Title2, Title3, tokens
} from '@fluentui/react-components';
import { Add24Regular, ArrowSync24Regular, Delete24Regular } from '@fluentui/react-icons';
import { api } from '../api';
import { fox, useSharedStyles } from '../theme';
import { AuthStatus, DeviceCodeInfo, EnvironmentInfo, Settings, TenantConfig } from '../types';

const useStyles = makeStyles({
  stack: { display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '960px' },
  row: { display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' },
  hero: {
    display: 'flex',
    gap: '24px',
    alignItems: 'center',
    background: `linear-gradient(105deg, ${fox.orangeSoft} 0%, #ffffff 55%)`,
    borderBottom: `1px solid ${fox.orangeBorder}`,
    padding: '20px',
    margin: '-20px -20px 16px',
    borderRadius: '10px 10px 0 0'
  },
  heroImg: {
    width: '168px',
    height: '106px',
    objectFit: 'cover',
    objectPosition: '62% 40%',
    borderRadius: '10px',
    border: `1px solid ${fox.orangeBorder}`,
    backgroundColor: '#ffffff',
    flexShrink: 0,
    '@media (max-width: 720px)': { display: 'none' }
  },
  codeBox: {
    fontFamily: tokens.fontFamilyMonospace, fontSize: '28px', letterSpacing: '4px',
    padding: '16px', textAlign: 'center', backgroundColor: '#f7f6f4',
    border: '1px solid #edebe8',
    borderRadius: '8px', margin: '12px 0'
  },
  tenantCard: {
    marginTop: '16px',
    backgroundColor: '#fafafa',
    border: '1px solid #edebe8',
    boxShadow: 'none'
  }
});

const emptyTenant = (): TenantConfig => ({ name: '', id: '', environments: {} });

export default function SetupPage() {
  const styles = useStyles();
  const shared = useSharedStyles();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [auth, setAuth] = useState<AuthStatus | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [device, setDevice] = useState<DeviceCodeInfo | null>(null);
  const [devicePending, setDevicePending] = useState(false);
  const [loadingEnvs, setLoadingEnvs] = useState<Record<string, boolean>>({});

  const refresh = useCallback(async () => {
    const [s, a] = await Promise.all([
      api.get<Settings>('/api/settings'),
      api.get<AuthStatus>('/api/auth/status')
    ]);
    setSettings(s);
    setAuth(a);
  }, []);

  useEffect(() => { refresh().catch(e => setError(e.message)); }, [refresh]);

  const save = async (next: Settings) => {
    setSettings(next);
    setError('');
    try {
      await api.put('/api/settings', next);
      setNotice('Settings saved');
      setTimeout(() => setNotice(''), 2500);
    } catch (e: any) {
      setError(e.message);
    }
  };

  const startSignIn = async () => {
    if (!settings) return;
    setError('');
    try {
      const info = await api.post<DeviceCodeInfo>('/api/auth/device/start', {
        tenantId: settings.tenants[0]?.id || 'organizations'
      });
      setDevice(info);
      setDevicePending(true);
    } catch (e: any) {
      setError(e.message);
    }
  };

  // Poll device flow while the dialog is open
  useEffect(() => {
    if (!device || !devicePending) return;
    const timer = setInterval(async () => {
      try {
        const st = await api.get<{ pending: boolean; completed: boolean }>('/api/auth/device/status');
        if (!st.pending) {
          clearInterval(timer);
          setDevicePending(false);
          if (st.completed) {
            setDevice(null);
            await refresh();
          } else {
            setError('Sign-in was cancelled or expired.');
            setDevice(null);
          }
        }
      } catch { /* keep polling */ }
    }, 2000);
    return () => clearInterval(timer);
  }, [device, devicePending, refresh]);

  const loadEnvironments = async (tenant: TenantConfig) => {
    setError('');
    setLoadingEnvs(prev => ({ ...prev, [tenant.id]: true }));
    try {
      const envs = await api.get<EnvironmentInfo[]>(`/api/tenants/${encodeURIComponent(tenant.id)}/environments`);
      if (!settings) return;
      const tenants = settings.tenants.map(t => {
        if (t.id !== tenant.id) return t;
        const environments: Record<string, boolean> = {};
        for (const e of envs) environments[e.name] = t.environments[e.name] ?? false;
        return { ...t, environments };
      });
      await save({ ...settings, tenants });
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoadingEnvs(prev => ({ ...prev, [tenant.id]: false }));
    }
  };

  if (!settings) return <Spinner label="Loading settings..." />;

  return (
    <div className={styles.stack}>
      <Title2>Setup</Title2>
      <Text size={300} className={shared.pageDesc}>
        One sign-in covers everything. Add tenants, then tick the environments you work with.
      </Text>
      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
      {notice && <MessageBar intent="success"><MessageBarBody>{notice}</MessageBarBody></MessageBar>}

      <Card className={shared.card}>
        <div className={styles.hero}>
          <div style={{ flex: 1 }}>
            <Title3>Authentication</Title3>
            <Text block size={200} style={{ marginTop: '6px', color: '#6b6a68' }}>
              One device code sign-in covers deployment, app management, compare, status
              and the API Explorer — no client secret anywhere.
            </Text>
          </div>
          <img src="/mascot.png" alt="The BC Mission Control fox at a data console" className={styles.heroImg} />
        </div>
        <Text block size={200} style={{ margin: '0 0 16px', color: '#6b6a68' }}>
          Leave Client ID blank to use the built-in shared Microsoft registration, or enter
          your own multi-tenant Entra ID app registration. The refresh token is stored locally
          on this machine and reused across all your tenants until it exceeds the validity window.
        </Text>
        <div className={styles.row}>
          <Field label="Client ID (optional)" style={{ minWidth: '340px', flexGrow: 1 }}>
            <Input
              value={settings.clientId}
              placeholder="Blank = shared Azure PowerShell registration"
              onChange={(_e, d) => setSettings({ ...settings, clientId: d.value })}
              onBlur={() => save(settings)}
            />
          </Field>
          <Field label="Token validity (days)">
            <Input
              type="number"
              style={{ width: '110px' }}
              value={String(settings.tokenValidityDays)}
              onChange={(_e, d) => setSettings({ ...settings, tokenValidityDays: Number(d.value) || 80 })}
              onBlur={() => save(settings)}
            />
          </Field>
        </div>
        <div className={styles.row} style={{ marginTop: '16px' }}>
          {auth?.signedIn && !auth.expired ? (
            <Badge appearance="filled" color="success" size="large">
              Signed in{auth.ageDays !== undefined ? ` — token ${Math.floor(auth.ageDays)} day(s) old` : ''}
            </Badge>
          ) : auth?.signedIn && auth.expired ? (
            <Badge appearance="filled" color="warning" size="large">Token expired — sign in again</Badge>
          ) : (
            <Badge appearance="filled" color="informative" size="large">Not signed in</Badge>
          )}
          <Button appearance="primary" onClick={startSignIn}>
            {auth?.signedIn ? 'Re-authenticate' : 'Sign in with device code'}
          </Button>
          {auth?.signedIn && (
            <Button onClick={async () => { await api.post('/api/auth/signout'); await refresh(); }}>
              Sign out
            </Button>
          )}
        </div>
      </Card>

      <Card className={shared.card}>
        <div className={styles.row} style={{ justifyContent: 'space-between' }}>
          <Title3>Tenants &amp; Environments</Title3>
          <Button icon={<Add24Regular />} onClick={() => save({ ...settings, tenants: [...settings.tenants, emptyTenant()] })}>
            Add tenant
          </Button>
        </div>
        {settings.tenants.length === 0 && (
          <Text block size={200} style={{ marginTop: '12px', color: tokens.colorNeutralForeground3 }}>
            No tenants configured yet. Add a tenant, then load its environments.
          </Text>
        )}
        {settings.tenants.map((tenant, idx) => (
          <Card key={idx} className={styles.tenantCard}>
            <div className={styles.row}>
              <Field label="Tenant name">
                <Input
                  value={tenant.name}
                  onChange={(_e, d) => {
                    const tenants = settings.tenants.map((t, i) => i === idx ? { ...t, name: d.value } : t);
                    setSettings({ ...settings, tenants });
                  }}
                  onBlur={() => save(settings)}
                />
              </Field>
              <Field label="Tenant ID" style={{ minWidth: '340px', flexGrow: 1 }}>
                <Input
                  value={tenant.id}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  onChange={(_e, d) => {
                    const tenants = settings.tenants.map((t, i) => i === idx ? { ...t, id: d.value } : t);
                    setSettings({ ...settings, tenants });
                  }}
                  onBlur={() => save(settings)}
                />
              </Field>
              <Button
                icon={loadingEnvs[tenant.id] ? <Spinner size="tiny" /> : <ArrowSync24Regular />}
                onClick={() => loadEnvironments(tenant)}
                disabled={!tenant.id || !auth?.signedIn}
              >
                Load environments
              </Button>
              <Button
                icon={<Delete24Regular />}
                onClick={() => save({ ...settings, tenants: settings.tenants.filter((_t, i) => i !== idx) })}
              />
            </div>
            {Object.keys(tenant.environments).length > 0 && (
              <Table size="small" style={{ marginTop: '12px' }}>
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell style={{ width: '60px' }}>Enabled</TableHeaderCell>
                    <TableHeaderCell>Environment</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(tenant.environments).map(([env, enabled]) => (
                    <TableRow key={env}>
                      <TableCell>
                        <Checkbox
                          checked={enabled}
                          onChange={(_e, d) => {
                            const tenants = settings.tenants.map((t, i) =>
                              i === idx ? { ...t, environments: { ...t.environments, [env]: d.checked === true } } : t
                            );
                            save({ ...settings, tenants });
                          }}
                        />
                      </TableCell>
                      <TableCell>{env}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </Card>
        ))}
      </Card>

      <Dialog open={!!device} onOpenChange={(_e, d) => { if (!d.open) { setDevice(null); api.post('/api/auth/device/cancel'); } }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Sign in to Microsoft Entra ID</DialogTitle>
            <DialogContent>
              <Text block>{device?.message || 'Open the verification page and enter the code.'}</Text>
              <div className={styles.codeBox}>{device?.userCode}</div>
              <Button as="a" href={device?.verificationUri} target="_blank" appearance="primary">
                Open {device?.verificationUri}
              </Button>
              <div style={{ marginTop: '12px' }}>
                <Spinner size="tiny" label=" Waiting for sign-in..." />
              </div>
            </DialogContent>
            <DialogActions>
              <Button onClick={() => { setDevice(null); api.post('/api/auth/device/cancel'); }}>Cancel</Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
