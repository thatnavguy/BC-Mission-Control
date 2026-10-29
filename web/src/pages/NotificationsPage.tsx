import { useCallback, useEffect, useState } from 'react';
import {
  Button, Card, Dialog, DialogActions, DialogBody, DialogContent,
  DialogSurface, DialogTitle, Dropdown, Field, Input, makeStyles, MessageBar,
  MessageBarBody, Option, Spinner, Table, TableBody, TableCell, TableHeader,
  TableHeaderCell, TableRow, Text, Title2
} from '@fluentui/react-components';
import { Add24Regular, ArrowSync24Regular, Delete24Regular } from '@fluentui/react-icons';
import { api } from '../api';
import { getCached, setCached } from '../pageCache';
import EmptyState from '../components/EmptyState';
import { useSharedStyles } from '../theme';
import { NotificationRecipient, Settings } from '../types';

const useStyles = makeStyles({
  stack: { display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '900px' },
  cardWide: {
    padding: '20px',
    overflowX: 'auto',
    backgroundColor: '#ffffff',
    border: '1px solid #e7e5e1',
    borderRadius: '10px',
    boxShadow: 'none'
  },
  row: { display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }
});

export default function NotificationsPage() {
  const styles = useStyles();
  const shared = useSharedStyles();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [tenantId, setTenantId] = useState('');
  const [recipients, setRecipients] = useState<NotificationRecipient[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [adding, setAdding] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<NotificationRecipient | null>(null);
  const [removing, setRemoving] = useState(false);

  const restore = (tid: string) => {
    setRecipients(getCached<NotificationRecipient[]>(`notifrecipients:${tid}`) ?? null);
  };

  useEffect(() => {
    api.get<Settings>('/api/settings').then(s => {
      setSettings(s);
      const first = s.tenants.find(t => Object.values(t.environments).some(Boolean));
      if (first) {
        setTenantId(first.id);
        restore(first.id);
      }
    }).catch(e => setError(e.message));
  }, []);

  const refresh = useCallback(async () => {
    if (!tenantId) return;
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const list = await api.get<NotificationRecipient[]>(`/api/notification-recipients?tenantId=${encodeURIComponent(tenantId)}`);
      setRecipients(list);
      setCached(`notifrecipients:${tenantId}`, list);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  const add = async () => {
    setError('');
    setNotice('');
    setAdding(true);
    try {
      await api.put('/api/notification-recipients', { tenantId, email: email.trim(), name: name.trim() });
      setNotice(`${name.trim()} added as a notification recipient.`);
      setName('');
      setEmail('');
      await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setAdding(false);
    }
  };

  const remove = async () => {
    if (!removeTarget) return;
    setError('');
    setRemoving(true);
    try {
      await api.delete(`/api/notification-recipients/${encodeURIComponent(removeTarget.id)}?tenantId=${encodeURIComponent(tenantId)}`);
      setNotice(`${removeTarget.name || removeTarget.email} removed.`);
      setRemoveTarget(null);
      await refresh();
    } catch (e: any) {
      setError(e.message);
      setRemoveTarget(null);
    } finally {
      setRemoving(false);
    }
  };

  const tenant = settings?.tenants.find(t => t.id === tenantId);
  const sorted = [...(recipients ?? [])].sort((a, b) => a.name.localeCompare(b.name));
  const emailValid = /^\S+@\S+\.\S+$/.test(email.trim());

  return (
    <div className={styles.stack}>
      <Title2>Notification Recipients</Title2>
      <Text size={300} className={shared.pageDesc}>
        Who gets email notifications about environment updates and events for a tenant.
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
                restore(id);
              }}
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
            {recipients ? 'Refresh' : 'Load recipients'}
          </Button>
        </div>
      </Card>

      {recipients && !loading && (
        <Card className={styles.cardWide}>
          <div className={styles.row}>
            <Field label="Name">
              <Input value={name} onChange={(_e, d) => setName(d.value)} placeholder="Jane Doe" />
            </Field>
            <Field label="Email">
              <Input value={email} onChange={(_e, d) => setEmail(d.value)} placeholder="jane@contoso.com" style={{ minWidth: '240px' }} />
            </Field>
            <Button
              icon={adding ? <Spinner size="tiny" /> : <Add24Regular />}
              disabled={adding || !name.trim() || !emailValid}
              onClick={add}
            >
              Add recipient
            </Button>
          </div>
        </Card>
      )}

      {!recipients && !loading && (
        <Card className={styles.cardWide}>
          <EmptyState
            title="Nothing loaded yet"
            hint="Pick a tenant, then click Load recipients — nothing is fetched until you ask."
          />
        </Card>
      )}

      {loading && <Spinner label="Loading recipients..." />}

      {recipients && !loading && (
        <Card className={styles.cardWide}>
          {sorted.length === 0 ? (
            <EmptyState title="No recipients" hint="Nobody gets notification emails for this tenant yet." />
          ) : (
            <Table size="small">
              <TableHeader>
                <TableRow>
                  <TableHeaderCell>Name</TableHeaderCell>
                  <TableHeaderCell>Email</TableHeaderCell>
                  <TableHeaderCell>Action</TableHeaderCell>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sorted.map(r => (
                  <TableRow key={r.id}>
                    <TableCell>{r.name || '—'}</TableCell>
                    <TableCell>{r.email}</TableCell>
                    <TableCell>
                      <Button
                        size="small"
                        icon={<Delete24Regular />}
                        onClick={() => setRemoveTarget(r)}
                      >
                        Remove
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </Card>
      )}

      <Dialog open={!!removeTarget} onOpenChange={(_e, d) => { if (!d.open) setRemoveTarget(null); }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>Remove recipient</DialogTitle>
            <DialogContent>
              Stop sending notification emails to <strong>{removeTarget?.name || removeTarget?.email}</strong>
              {removeTarget?.name ? ` (${removeTarget.email})` : ''} on <strong>{tenant?.name}</strong>?
            </DialogContent>
            <DialogActions>
              <Button appearance="secondary" onClick={() => setRemoveTarget(null)}>Cancel</Button>
              <Button appearance="primary" disabled={removing} onClick={remove}>
                {removing ? 'Removing...' : 'Remove'}
              </Button>
            </DialogActions>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  );
}
