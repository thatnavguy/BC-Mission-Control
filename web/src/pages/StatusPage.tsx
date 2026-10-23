import { useCallback, useEffect, useState } from 'react';
import {
  Badge, Button, Card, makeStyles, MessageBar, MessageBarBody, Spinner,
  Table, TableBody, TableCell, TableHeader, TableHeaderCell, TableRow,
  Text, Title2, tokens
} from '@fluentui/react-components';
import { ArrowSync24Regular } from '@fluentui/react-icons';
import { api } from '../api';
import EmptyState from '../components/EmptyState';
import { useSharedStyles } from '../theme';
import { Settings } from '../types';
import TargetPicker, { TargetSelection } from '../components/TargetPicker';

const useStyles = makeStyles({
  stack: { display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1200px' },
  row: { display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' }
});

interface StatusRow {
  appId?: string;
  name?: string;
  publisher?: string;
  appVersion?: string;
  status?: string;
  startedOn?: string;
  completedOn?: string;
  errorMessage?: string;
  operationType?: string;
}

function statusBadge(status?: string) {
  const s = (status ?? '').toLowerCase();
  if (s === 'completed' || s === 'succeeded') return <Badge appearance="filled" color="success">{status}</Badge>;
  if (s === 'failed') return <Badge appearance="filled" color="danger">{status}</Badge>;
  if (s === 'inprogress' || s === 'running') return <Badge appearance="filled" color="warning">{status}</Badge>;
  return <Badge appearance="filled" color="informative">{status || 'Unknown'}</Badge>;
}

export default function StatusPage() {
  const styles = useStyles();
  const shared = useSharedStyles();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [target, setTarget] = useState<TargetSelection | null>(null);
  const [rows, setRows] = useState<StatusRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get<Settings>('/api/settings').then(s => {
      setSettings(s);
      const first = s.tenants.find(t => Object.values(t.environments).some(Boolean));
      if (first) {
        setTarget({
          tenantId: first.id,
          tenantName: first.name,
          environment: Object.entries(first.environments).find(([, e]) => e)![0]
        });
      }
    }).catch(e => setError(e.message));
  }, []);

  const load = useCallback(async () => {
    if (!target) return;
    setError('');
    setLoading(true);
    try {
      const resp = await api.get<{ rows: StatusRow[] }>(
        `/api/deployment-status?tenantId=${encodeURIComponent(target.tenantId)}&environment=${encodeURIComponent(target.environment)}`
      );
      setRows(resp.rows);
    } catch (e: any) {
      setError(e.message);
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [target]);

  if (!settings) return <Spinner label="Loading..." />;

  return (
    <div className={styles.stack}>
      <Title2>Extension Deployment Status</Title2>
      <Text size={300} className={shared.pageDesc}>
        Latest extension operations per environment, including error messages.
      </Text>
      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}

      <Card className={shared.card}>
        <div className={styles.row}>
          <TargetPicker settings={settings} value={target} onChange={setTarget} />
          <Button
            icon={loading ? <Spinner size="tiny" /> : <ArrowSync24Regular />}
            onClick={load}
            disabled={!target || loading}
          >
            Refresh
          </Button>
        </div>
      </Card>

      <Card className={shared.card}>
        {loading ? (
          <Spinner label="Loading status..." />
        ) : (
          <Table size="small">
            <TableHeader>
              <TableRow>
                <TableHeaderCell>App</TableHeaderCell>
                <TableHeaderCell>Version</TableHeaderCell>
                <TableHeaderCell>Operation</TableHeaderCell>
                <TableHeaderCell>Status</TableHeaderCell>
                <TableHeaderCell>Started</TableHeaderCell>
                <TableHeaderCell>Completed</TableHeaderCell>
                <TableHeaderCell>Error</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r, i) => (
                <TableRow key={i}>
                  <TableCell>{r.name ?? '—'}</TableCell>
                  <TableCell>{r.appVersion ?? '—'}</TableCell>
                  <TableCell>{r.operationType ?? '—'}</TableCell>
                  <TableCell>{statusBadge(r.status)}</TableCell>
                  <TableCell>{r.startedOn ? new Date(r.startedOn).toLocaleString() : '—'}</TableCell>
                  <TableCell>{r.completedOn ? new Date(r.completedOn).toLocaleString() : '—'}</TableCell>
                  <TableCell>
                    <Text size={200} style={{ color: r.errorMessage ? tokens.colorPaletteRedForeground1 : undefined }}>
                      {r.errorMessage || ''}
                    </Text>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {!loading && rows.length === 0 && (
          <EmptyState
            title="No deployment operations found"
            hint="Pick an environment and hit Refresh — operations only load when you ask."
          />
        )}
      </Card>
    </div>
  );
}
