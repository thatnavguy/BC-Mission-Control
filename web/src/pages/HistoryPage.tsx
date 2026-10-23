import { useCallback, useEffect, useState } from 'react';
import {
  Accordion, AccordionHeader, AccordionItem, AccordionPanel, Badge,
  Card, makeStyles, MessageBar, MessageBarBody, Spinner, Table, TableBody,
  TableCell, TableHeader, TableHeaderCell, TableRow, Text, Title2, tokens
} from '@fluentui/react-components';
import { api, subscribeRuns } from '../api';
import EmptyState from '../components/EmptyState';
import { useSharedStyles } from '../theme';
import { DeployRun } from '../types';

const useStyles = makeStyles({
  stack: { display: 'flex', flexDirection: 'column', gap: '16px', maxWidth: '1100px' },
  log: {
    fontFamily: tokens.fontFamilyMonospace, fontSize: '12px', whiteSpace: 'pre-wrap',
    backgroundColor: '#f7f6f4', border: '1px solid #edebe8', padding: '12px',
    borderRadius: '8px', maxHeight: '300px', overflowY: 'auto', marginTop: '12px'
  }
});

function runBadge(run: DeployRun) {
  switch (run.status) {
    case 'running': return <Badge appearance="filled" color="warning">Running</Badge>;
    case 'completed': return <Badge appearance="filled" color="success">Completed</Badge>;
    case 'completed-with-errors': return <Badge appearance="filled" color="warning">Completed with errors</Badge>;
    case 'failed': return <Badge appearance="filled" color="danger">Failed</Badge>;
  }
}

function kindBadge(kind: DeployRun['kind']) {
  if (kind === 'container') return <Badge appearance="outline" color="informative">Container</Badge>;
  if (kind === 'container-create') return <Badge appearance="outline" color="informative">Create</Badge>;
  return <Badge appearance="outline" color="brand">Cloud</Badge>;
}

export default function HistoryPage() {
  const styles = useStyles();
  const shared = useSharedStyles();
  const [runs, setRuns] = useState<DeployRun[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const list = await api.get<DeployRun[]>('/api/runs');
    setRuns(list);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh().catch(e => { setError(e.message); setLoading(false); });
    // Keep history live while any run is active
    return subscribeRuns(() => { refresh().catch(() => undefined); });
  }, [refresh]);

  if (loading) return <Spinner label="Loading history..." />;

  return (
    <div className={styles.stack}>
      <Title2>Deployment History</Title2>
      <Text size={300} className={shared.pageDesc}>
        Every run — cloud deploy, container deploy, container create — with results and full logs.
      </Text>
      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
      {runs.length === 0 && (
        <EmptyState
          title="No deployments yet"
          hint="Runs you start from PTE Deployment — cloud or container — are filed here with their full logs."
        />
      )}
      <Accordion collapsible>
        {runs.map(run => (
          <AccordionItem key={run.id} value={run.id}>
            <AccordionHeader>
              <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
                {runBadge(run)}
                {kindBadge(run.kind)}
                <Text>{new Date(run.startedAt).toLocaleString()}</Text>
                <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
                  {run.kind === 'cloud' ? `${run.schedule} · ${run.schemaSync} · ` : ''}{run.results.length} target(s)
                </Text>
              </div>
            </AccordionHeader>
            <AccordionPanel>
              <Card className={shared.card}>
                <Table size="small">
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
                    {run.results.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell>{r.appFile}</TableCell>
                        <TableCell>{r.tenantName}</TableCell>
                        <TableCell>{r.environment}</TableCell>
                        <TableCell>{r.status}</TableCell>
                        <TableCell>{r.message}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
                {run.log.length > 0 && <div className={styles.log}>{run.log.join('\n')}</div>}
              </Card>
            </AccordionPanel>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
