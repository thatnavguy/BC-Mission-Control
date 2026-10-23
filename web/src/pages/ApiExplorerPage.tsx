import { useEffect, useState } from 'react';
import {
  Badge, Button, Card, Dropdown, Field, Input, makeStyles, MessageBar,
  MessageBarBody, Option, Spinner, Textarea, Title2, tokens, Text
} from '@fluentui/react-components';
import { Play24Regular } from '@fluentui/react-icons';
import { api } from '../api';
import { Settings } from '../types';
import TargetPicker, { TargetSelection } from '../components/TargetPicker';

const useStyles = makeStyles({
  stack: { display: 'flex', flexDirection: 'column', gap: '20px', maxWidth: '1200px' },
  card: { padding: '20px' },
  row: { display: 'flex', gap: '16px', alignItems: 'flex-end', flexWrap: 'wrap' },
  response: {
    fontFamily: 'monospace', fontSize: '12px', whiteSpace: 'pre-wrap',
    wordBreak: 'break-all', backgroundColor: tokens.colorNeutralBackground3,
    padding: '16px', borderRadius: tokens.borderRadiusMedium,
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
  const [settings, setSettings] = useState<Settings | null>(null);
  const [target, setTarget] = useState<TargetSelection | null>(null);
  const [method, setMethod] = useState('GET');
  const [path, setPath] = useState('');
  const [company, setCompany] = useState('');
  const [body, setBody] = useState('');
  const [result, setResult] = useState<CallResult | null>(null);
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
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const prettyBody = (() => {
    if (!result?.body) return '';
    try { return JSON.stringify(JSON.parse(result.body), null, 2); } catch { return result.body; }
  })();

  if (!settings) return <Spinner label="Loading..." />;

  return (
    <div className={styles.stack}>
      <Title2>API Explorer</Title2>
      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}

      <Card className={styles.card}>
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
        <Card className={styles.card}>
          <div className={styles.row}>
            <Badge
              appearance="filled"
              color={result.status < 300 ? 'success' : result.status < 500 ? 'warning' : 'danger'}
              size="large"
            >
              HTTP {result.status}
            </Badge>
            <Text size={200} style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{result.url}</Text>
          </div>
          <div className={styles.response}>{prettyBody || '(empty response)'}</div>
        </Card>
      )}
    </div>
  );
}
