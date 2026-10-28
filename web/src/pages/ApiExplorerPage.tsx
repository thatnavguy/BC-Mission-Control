import { useCallback, useEffect, useState } from 'react';
import {
  Badge, Button, Card, Dropdown, Field, Input, makeStyles, MessageBar,
  MessageBarBody, Option, Spinner, Table, TableBody, TableCell, TableHeader,
  TableHeaderCell, TableRow, Textarea, Title2, Title3, tokens, Text
} from '@fluentui/react-components';
import { Delete24Regular, Play24Regular } from '@fluentui/react-icons';
import { api } from '../api';
import { useSharedStyles } from '../theme';
import { ApiCallHistoryEntry, Settings } from '../types';
import TargetPicker, { TargetSelection } from '../components/TargetPicker';

const useStyles = makeStyles({
  stack: { display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1200px' },
  row: { display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' },
  response: {
    fontFamily: tokens.fontFamilyMonospace, fontSize: '12px', whiteSpace: 'pre-wrap',
    wordBreak: 'break-all', backgroundColor: '#f7f6f4',
    border: '1px solid #edebe8',
    padding: '16px', borderRadius: '8px',
    maxHeight: '520px', overflowY: 'auto', marginTop: '12px'
  }
});

interface CallResult {
  status: number;
  url: string;
  contentType: string | null;
  body: string;
}

export default function ApiExplorerPage() {
  const styles = useStyles();
  const shared = useSharedStyles();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [target, setTarget] = useState<TargetSelection | null>(null);
  const [method, setMethod] = useState('GET');
  const [path, setPath] = useState('');
  const [company, setCompany] = useState('');
  const [body, setBody] = useState('');
  const [result, setResult] = useState<CallResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<ApiCallHistoryEntry[]>([]);
  const [selected, setSelected] = useState<ApiCallHistoryEntry | null>(null);

  const loadHistory = useCallback(async () => {
    try { setHistory(await api.get<ApiCallHistoryEntry[]>('/api/call/history')); } catch { /* non-fatal */ }
  }, []);

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
    loadHistory();
  }, [loadHistory]);

  const execute = async () => {
    if (!target || !path.trim()) return;
    setError('');
    setLoading(true);
    setResult(null);
    try {
      const resp = await fetch('/api/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: target.tenantId,
          environment: target.environment,
          method,
          path: path.trim(),
          companyName: company.trim() || undefined,
          body: body.trim() || undefined
        })
      });
      const json = await resp.json();
      if (!resp.ok && !json.url) throw new Error(json.error || `HTTP ${resp.status}`);
      setResult(json);
      setSelected(null);
      loadHistory();
    } catch (e: any) {
      setError(e.message);
      loadHistory();
    } finally {
      setLoading(false);
    }
  };

  const prettyBody = pretty(result?.body);

  if (!settings) return <Spinner label="Loading..." />;

  return (
    <div className={styles.stack}>
      <Title2>API Explorer</Title2>
      <Text size={300} className={shared.pageDesc}>
        Call any BC API endpoint as your signed-in user — standard v2.0, custom APIs, automation API.
      </Text>
      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}

      <Card className={shared.card}>
        <div className={styles.row}>
          <TargetPicker settings={settings} value={target} onChange={setTarget} />
          <Field label="Method">
            <Dropdown
              style={{ minWidth: '110px' }}
              value={method}
              onOptionSelect={(_e, d) => setMethod(d.optionValue ?? 'GET')}
            >
              {['GET', 'POST', 'PATCH', 'DELETE'].map(m => <Option key={m} value={m}>{m}</Option>)}
            </Dropdown>
          </Field>
          <Field label="Company name (optional)">
            <Input
              placeholder="e.g. CRONUS International Ltd."
              value={company}
              onChange={(_e, d) => setCompany(d.value)}
              style={{ minWidth: '220px' }}
            />
          </Field>
        </div>
        <Field label="Path (relative like 'items', full 'api/v2.0/items', or a custom API path)" style={{ marginTop: '12px' }}>
          <Input
            placeholder="api/v2.0/items or api/automation/v2.0/companies"
            value={path}
            onChange={(_e, d) => setPath(d.value)}
            style={{ width: '100%' }}
          />
        </Field>
        {(method === 'POST' || method === 'PATCH') && (
          <Field label="Request body (JSON)" style={{ marginTop: '12px' }}>
            <Textarea
              rows={6}
              value={body}
              onChange={(_e, d) => setBody(d.value)}
              style={{ width: '100%', fontFamily: 'monospace' }}
            />
          </Field>
        )}
        <div className={styles.row} style={{ marginTop: '16px' }}>
          <Button
            appearance="primary"
            icon={loading ? <Spinner size="tiny" /> : <Play24Regular />}
            disabled={!target || !path.trim() || loading}
            onClick={execute}
          >
            Send request
          </Button>
        </div>
        <Text block size={200} style={{ marginTop: '8px', color: tokens.colorNeutralForeground3 }}>
          Calls run as your signed-in account (device sign-in from Setup — no client secret needed).
          Relative paths hit the standard v2.0 API; paths starting with api/ hang off the service root.
        </Text>
      </Card>

      {result && (
        <Card className={shared.card}>
          <div className={styles.row}>
            <Badge
              appearance="filled"
              color={result.status < 300 ? 'success' : result.status < 500 ? 'warning' : 'danger'}
              size="large"
            >
              HTTP {result.status}
            </Badge>
            <Text size={200} style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{result.url}</Text>
            <Button
              onClick={() => downloadResponse(responseFilename(), result)}
            >
              Download JSON
            </Button>
          </div>
          <div className={styles.response}>{prettyBody || '(empty response)'}</div>
        </Card>
      )}

      {history.length > 0 && (
        <Card className={shared.card}>
          <div className={styles.row} style={{ justifyContent: 'space-between' }}>
            <Title3>History (last {history.length} call{history.length === 1 ? '' : 's'})</Title3>
            <Button
              icon={<Delete24Regular />}
              appearance="subtle"
              onClick={async () => {
                await api.delete('/api/call/history');
                setHistory([]);
                setSelected(null);
              }}
            >
              Clear
            </Button>
          </div>
          <Table size="small" style={{ marginTop: '12px', tableLayout: 'fixed', width: '100%' }}>
            <TableHeader>
              <TableRow>
                <TableHeaderCell style={{ width: '180px' }}>Time</TableHeaderCell>
                <TableHeaderCell style={{ width: '80px' }}>Method</TableHeaderCell>
                <TableHeaderCell>Path</TableHeaderCell>
                <TableHeaderCell style={{ width: '140px' }}>Environment</TableHeaderCell>
                <TableHeaderCell style={{ width: '100px' }}>Status</TableHeaderCell>
              </TableRow>
            </TableHeader>
            <TableBody>
              {history.map(h => (
                <TableRow
                  key={h.id}
                  onClick={() => setSelected(selected?.id === h.id ? null : h)}
                  style={{ cursor: 'pointer', backgroundColor: selected?.id === h.id ? tokens.colorNeutralBackground1Selected : undefined }}
                >
                  <TableCell>{new Date(h.timestamp).toLocaleString()}</TableCell>
                  <TableCell><Text style={{ fontFamily: 'monospace' }}>{h.method}</Text></TableCell>
                  <TableCell>
                    <Text style={{ fontFamily: 'monospace', wordBreak: 'break-all' }} title={h.path}>{h.path}</Text>
                  </TableCell>
                  <TableCell>{h.environment}</TableCell>
                  <TableCell>{historyStatusBadge(h)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {selected && (
            <div style={{ marginTop: '12px' }}>
              <Text block size={200} style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{selected.url}</Text>
              {selected.error && (
                <MessageBar intent="error" style={{ marginTop: '8px' }}>
                  <MessageBarBody>{selected.error}</MessageBarBody>
                </MessageBar>
              )}
              {selected.requestBody && (
                <>
                  <Text block weight="semibold" size={200} style={{ marginTop: '8px' }}>Request body</Text>
                  <div className={styles.response}>{pretty(selected.requestBody)}</div>
                </>
              )}
              <div className={styles.row} style={{ justifyContent: 'space-between', marginTop: '8px' }}>
                <Text weight="semibold" size={200}>Response</Text>
                <Button
                  onClick={() => downloadResponse(responseFilename(selected.timestamp), {
                    status: selected.status,
                    url: selected.url,
                    body: selected.responseBody,
                    error: selected.error
                  })}
                >
                  Download JSON
                </Button>
              </div>
              <div className={styles.response}>{pretty(selected.responseBody) || '(empty response)'}</div>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function pretty(body?: string): string {
  if (!body) return '';
  try { return JSON.stringify(JSON.parse(body), null, 2); } catch { return body; }
}

function downloadResponse(filename: string, response: {
  status?: number;
  url: string;
  contentType?: string | null;
  body?: string;
  error?: string;
}) {
  let body: unknown = response.body ?? '';
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { /* Keep non-JSON responses as strings. */ }
  }
  const content = JSON.stringify({
    status: response.status,
    url: response.url,
    contentType: response.contentType,
    error: response.error,
    body
  }, null, 2);
  const url = URL.createObjectURL(new Blob([content], { type: 'application/json;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function responseFilename(timestamp = new Date().toISOString()) {
  return `api-response-${timestamp.replace(/[:.]/g, '-')}.json`;
}

function historyStatusBadge(h: ApiCallHistoryEntry) {
  if (h.status === undefined) return <Badge appearance="filled" color="danger">Error</Badge>;
  const color = h.status < 300 ? 'success' : h.status < 500 ? 'warning' : 'danger';
  return <Badge appearance="filled" color={color as any}>HTTP {h.status}</Badge>;
}
