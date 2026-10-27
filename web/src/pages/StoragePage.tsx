import { useCallback, useEffect, useState } from 'react';
import {
  Badge, Button, Card, Dropdown, Field, makeStyles, MessageBar,
  MessageBarBody, Option, ProgressBar, Spinner, Table, TableBody, TableCell,
  TableHeader, TableHeaderCell, TableRow, Text, Title2, tokens
} from '@fluentui/react-components';
import { ArrowSync24Regular } from '@fluentui/react-icons';
import { api } from '../api';
import EmptyState from '../components/EmptyState';
import { useSharedStyles } from '../theme';
import { Settings, StorageResponse } from '../types';

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
  quotaNumbers: { display: 'flex', gap: '32px', flexWrap: 'wrap', marginTop: '12px' },
  quotaItem: { display: 'flex', flexDirection: 'column', gap: '2px' },
  big: { fontSize: '24px', fontWeight: 700, lineHeight: '28px' },
  bar: { minWidth: '160px' }
});

function formatKb(kb: number): string {
  if (kb < 0) return '—';
  const gb = kb / 1024 / 1024;
  if (gb >= 1) return `${gb.toFixed(2)} GB`;
  const mb = kb / 1024;
  if (mb >= 1) return `${mb.toFixed(1)} MB`;
  return `${kb} KB`;
}

function barColor(pct: number): 'brand' | 'warning' | 'error' {
  if (pct >= 90) return 'error';
  if (pct >= 75) return 'warning';
  return 'brand';
}

export default function StoragePage() {
  const styles = useStyles();
  const shared = useSharedStyles();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tenantId, setTenantId] = useState('');
  const [data, setData] = useState<StorageResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Settings>('/api/settings').then(s => {
      setSettings(s);
      if (s.tenants[0]) setTenantId(s.tenants[0].id);
    }).catch(e => setError(e.message));
  }, []);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setError('');
    setLoading(true);
    try {
      setData(await api.get<StorageResponse>(`/api/storage?tenantId=${encodeURIComponent(tenantId)}`));
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  const tenant = settings?.tenants.find(t => t.id === tenantId);
  const quotaKb = data?.quotas.storage.total ?? 0;
  const usedKb = data?.usage
    .filter(u => u.databaseStorageInKilobytes > 0)
    .reduce((sum, u) => sum + u.databaseStorageInKilobytes, 0) ?? 0;
  const pct = quotaKb > 0 ? (usedKb / quotaKb) * 100 : 0;
  const sorted = [...(data?.usage ?? [])].sort(
    (a, b) => b.databaseStorageInKilobytes - a.databaseStorageInKilobytes
  );

  return (
    <div className={styles.stack}>
      <Title2>Storage Usage</Title2>
      <Text size={300} className={shared.pageDesc}>
        Database storage per environment against the tenant quota.
      </Text>
      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}

      <Card className={styles.cardWide}>
        <div className={styles.row}>
          <Field label="Tenant">
            <Dropdown
              value={tenant?.name ?? ''}
              selectedOptions={tenantId ? [tenantId] : []}
              onOptionSelect={(_e, d) => { setTenantId(String(d.optionValue ?? '')); setData(null); }}
            >
              {settings?.tenants.map(t => <Option key={t.id} value={t.id}>{t.name}</Option>)}
            </Dropdown>
          </Field>
          <Button
            appearance="primary"
            icon={loading ? <Spinner size="tiny" /> : <ArrowSync24Regular />}
            disabled={loading || !tenantId}
            onClick={refresh}
          >
            {data ? 'Refresh' : 'Load storage usage'}
          </Button>
        </div>
      </Card>

      {!data && !loading && (
        <Card className={styles.cardWide}>
          <EmptyState
            title="Nothing loaded yet"
            hint="Pick a tenant and click Load storage usage — nothing is fetched until you ask."
          />
        </Card>
      )}

      {loading && <Spinner label="Loading storage usage..." />}

      {data && !loading && (
        <>
          <Card className={styles.cardWide}>
            <Text weight="semibold">Tenant quota</Text>
            <div className={styles.quotaNumbers}>
              <div className={styles.quotaItem}>
                <span className={styles.big}>{formatKb(usedKb)}</span>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Used</Text>
              </div>
              <div className={styles.quotaItem}>
                <span className={styles.big}>{formatKb(quotaKb)}</span>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  Allowed ({formatKb(data.quotas.storage.default)} base + {formatKb(data.quotas.storage.userLicenses)} licenses + {formatKb(data.quotas.storage.additionalCapacity)} add-on)
                </Text>
              </div>
              <div className={styles.quotaItem}>
                <span className={styles.big} style={{ color: pct >= 90 ? tokens.colorPaletteRedForeground1 : undefined }}>
                  {pct.toFixed(1)}%
                </span>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>of quota</Text>
              </div>
              <div className={styles.quotaItem}>
                <span className={styles.big}>
                  {data.usage.filter(u => u.environmentType === 'Production').length}/{data.quotas.productionEnvironments}
                </span>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Production environments</Text>
              </div>
              <div className={styles.quotaItem}>
                <span className={styles.big}>
                  {data.usage.filter(u => u.environmentType === 'Sandbox').length}/{data.quotas.sandboxEnvironments}
                </span>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>Sandbox environments</Text>
              </div>
            </div>
            <ProgressBar
              style={{ marginTop: '16px' }}
              value={quotaKb > 0 ? Math.min(1, usedKb / quotaKb) : 0}
              max={1}
              color={barColor(pct)}
            />
          </Card>

          <Card className={styles.cardWide}>
            {sorted.length === 0 ? (
              <EmptyState title="No environments" hint="This tenant has no environments using storage." />
            ) : (
              <Table size="small">
                <TableHeader>
                  <TableRow>
                    <TableHeaderCell>Environment</TableHeaderCell>
                    <TableHeaderCell>Type</TableHeaderCell>
                    <TableHeaderCell>Database used</TableHeaderCell>
                    <TableHeaderCell>Share of quota</TableHeaderCell>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sorted.map(u => {
                    const kb = u.databaseStorageInKilobytes;
                    const share = quotaKb > 0 && kb > 0 ? (kb / quotaKb) * 100 : 0;
                    return (
                      <TableRow key={u.environmentName}>
                        <TableCell><Text weight="semibold">{u.environmentName}</Text></TableCell>
                        <TableCell>
                          <Badge appearance="outline" color={u.environmentType === 'Production' ? 'important' : 'informative'}>
                            {u.environmentType || '—'}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {kb < 0
                            ? <Badge appearance="outline" color="warning">Unknown</Badge>
                            : formatKb(kb)}
                        </TableCell>
                        <TableCell>
                          {kb < 0 || quotaKb === 0 ? (
                            <Text style={{ color: tokens.colorNeutralForeground4 }}>—</Text>
                          ) : (
                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                              <ProgressBar className={styles.bar} value={Math.min(1, kb / quotaKb)} max={1} color={barColor(share)} />
                              <Text size={200}>{share.toFixed(1)}%</Text>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
