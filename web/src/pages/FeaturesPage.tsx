import { useCallback, useEffect, useState } from 'react';
import {
  Badge, Button, Card, Dialog, DialogActions, DialogBody, DialogContent,
  DialogSurface, DialogTitle, Dropdown, Field, Link, makeStyles, MessageBar,
  MessageBarBody, Option, Spinner, Table, TableBody, TableCell, TableHeader,
  TableHeaderCell, TableRow, Text, Title2, tokens
} from '@fluentui/react-components';
import { ArrowSync24Regular, Open16Regular } from '@fluentui/react-icons';
import { api } from '../api';
import { getCached, setCached } from '../pageCache';
import EmptyState from '../components/EmptyState';
import { useSharedStyles } from '../theme';
import { FeatureInfo, Settings } from '../types';

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
  featureId: {
    display: 'block',
    marginTop: '2px',
    fontSize: tokens.fontSizeBase100,
    color: tokens.colorNeutralForeground3
  },
  desc: { display: 'block', maxWidth: '480px' }
});

function isEnabled(f: FeatureInfo): boolean {
  return f.enabled.toLowerCase() === 'all users';
}

interface PendingAction {
  feature: FeatureInfo;
  action: 'activate' | 'deactivate';
}

export default function FeaturesPage() {
  const styles = useStyles();
  const shared = useSharedStyles();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tenantId, setTenantId] = useState('');
  const [environment, setEnvironment] = useState('');
  const [features, setFeatures] = useState<FeatureInfo[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [acting, setActing] = useState(false);

  const restore = (tid: string, env: string) => {
    setFeatures(getCached<FeatureInfo[]>(`features:${tid}|${env}`) ?? null);
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
      const resp = await api.get<{ features: FeatureInfo[] }>(`/api/features?tenantId=${encodeURIComponent(tenantId)}&environment=${encodeURIComponent(environment)}`);
      setFeatures(resp.features);
      setCached(`features:${tenantId}|${environment}`, resp.features);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId, environment]);

  const runAction = async () => {
    if (!pending) return;
    setError('');
    setActing(true);
    try {
      await api.post(`/api/features/${pending.action}`, {
        tenantId, environment, featureId: pending.feature.id
      });
      setNotice(pending.action === 'activate'
        ? `"${pending.feature.description}" is being enabled. Data updates run in the background — refresh in a moment to see the new state.`
        : `"${pending.feature.description}" is being disabled. Refresh in a moment to see the new state.`);
      setPending(null);
      await refresh();
    } catch (e: any) {
      setError(e.message);
      setPending(null);
    } finally {
      setActing(false);
    }
  };

  const tenant = settings?.tenants.find(t => t.id === tenantId);
  const envNames = tenant ? Object.entries(tenant.environments).filter(([, e]) => e).map(([n]) => n) : [];
  const sorted = [...(features ?? [])].sort((a, b) => a.description.localeCompare(b.description));

  return (
    <div className={styles.stack}>
      <Title2>Features</Title2>
      <Text size={300} className={shared.pageDesc}>
        Feature Management for an environment — see which features are on and enable or disable them.
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
            {features ? 'Refresh' : 'Load features'}
          </Button>
        </div>
      </Card>

      {!features && !loading && (
        <Card className={styles.cardWide}>
          <EmptyState
            title="Nothing loaded yet"
            hint="Pick a tenant and environment, then click Load features — nothing is fetched until you ask."
          />
        </Card>
      )}

      {loading && <Spinner label="Loading features..." />}

      {features && !loading && (
        <Card className={styles.cardWide}>
          {sorted.length === 0 ? (
            <EmptyState title="No features" hint="This environment did not return any manageable features." />
          ) : (
            <Table size="small">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Feature</TableHeaderCell>
                  <TableHeaderCell>Enabled for</TableHeaderCell>
                  <TableHeaderCell>Automatically enabled from</TableHeaderCell>
                  <TableHeaderCell>Version</TableHeaderCell>
                  <TableHeaderCell>Learn more</TableHeaderCell>
                  <TableHeaderCell>Action</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map(f => {
                  const on = isEnabled(f);
                  return (
                    <TableRow key={f.id}>
                      <TableCell>
                        <span className={styles.desc}>
                          {f.description}
                          <span className={styles.featureId}>{f.id}</span>
                        </span>
                      </TableCell>
                      <TableCell>
                        {on
                          ? <Badge appearance="filled" color="success">{f.enabled}</Badge>
                          : <Badge appearance="outline" color="subtle">{f.enabled || 'None'}</Badge>}
                        {f.dataUpdateRequired && !on && (
                          <Badge appearance="outline" color="informative" style={{ marginLeft: '6px' }}>Data update</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {f.mandatoryBy || <Text style={{ color: tokens.colorNeutralForeground4 }}>—</Text>}
                      </TableCell>
                      <TableCell>
                        {f.mandatoryByVersion || <Text style={{ color: tokens.colorNeutralForeground4 }}>—</Text>}
                      </TableCell>
                      <TableCell>
                        <span className={styles.nowrap}>
                          {f.learnMoreLink
                            ? <Link href={f.learnMoreLink} target="_blank">Docs <Open16Regular /></Link>
                            : <Text style={{ color: tokens.colorNeutralForeground4 }}>—</Text>}
                        </span>
                      </TableCell>
                      <TableCell>
                        {on
                          ? (f.isOneWay
                              ? <Text size={200} style={{ color: tokens.colorNeutralForeground4 }}>Cannot be disabled</Text>
                              : <Button size="small" onClick={() => setPending({ feature: f, action: 'deactivate' })}>Disable</Button>)
                          : <Button size="small" appearance="primary" onClick={() => setPending({ feature: f, action: 'activate' })}>Enable</Button>}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      <Dialog open={!!pending} onOpenChange={(_e, d) => { if (!d.open) setPending(null); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>
              {pending?.action === 'activate' ? 'Enable' : 'Disable'} {pending?.feature.description}
            </DialogTitle>
            <DialogContent>
              {pending?.action === 'activate' ? (
                <>
                  Turn this feature on for all companies in <strong>{environment}</strong>?
                  {pending.feature.dataUpdateRequired && (
                    <> It requires a data update, which will run as a background task.</>
                  )}
                  {pending.feature.isOneWay && (
                    <> <strong>Note:</strong> this feature cannot be disabled once enabled.</>
                  )}
                </>
              ) : (
                <>Turn this feature off in <strong>{environment}</strong>?</>
              )}
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setPending(null)}>Cancel</Button>
              <Button appearance="primary" disabled={acting} onClick={runAction}>
                {acting ? 'Working...' : pending?.action === 'activate' ? 'Enable feature' : 'Disable feature'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
