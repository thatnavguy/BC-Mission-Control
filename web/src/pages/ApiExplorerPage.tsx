import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Badge, Button, Card, Combobox, Dropdown, Field, Input, makeStyles, MessageBar,
  MessageBarBody, Option, OptionGroup, Radio, RadioGroup, Spinner, Table, TableBody, TableCell, TableHeader,
  TableHeaderCell, TableRow, Textarea, Title2, Title3, tokens, Text
} from '@fluentui/react-components';
import { Delete24Regular, Play24Regular } from '@fluentui/react-icons';
import { api } from '../api';
import { useSharedStyles } from '../theme';
import { ApiCallHistoryEntry, Settings } from '../types';
import TargetPicker, { TargetSelection } from '../components/TargetPicker';
import ApiQueryBuilder from '../components/ApiQueryBuilder';
import { buildQuery, emptyQuery, QueryOptions } from '../components/apiQuery';

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

interface ApiPreset {
  entity: string;
  label: string;
  group: string;
  companyRequired: boolean;
  parent?: { entity: string; label: string };
}

const apiPresets: ApiPreset[] = [
  { entity: 'companies', label: 'Companies', group: 'Company setup', companyRequired: false },
  { entity: 'companyInformation', label: 'Company information', group: 'Company setup', companyRequired: true },
  { entity: 'currencies', label: 'Currencies', group: 'Company setup', companyRequired: true },
  { entity: 'countriesRegions', label: 'Countries/regions', group: 'Company setup', companyRequired: true },
  { entity: 'accounts', label: 'Accounts', group: 'Finance', companyRequired: true },
  { entity: 'generalLedgerEntries', label: 'General ledger entries', group: 'Finance', companyRequired: true },
  { entity: 'journals', label: 'Journals', group: 'Finance', companyRequired: true },
  { entity: 'journalLines', label: 'Journal lines', group: 'Finance', companyRequired: true, parent: { entity: 'journals', label: 'Journal' } },
  { entity: 'dimensions', label: 'Dimensions', group: 'Finance', companyRequired: true },
  { entity: 'dimensionValues', label: 'Dimension values', group: 'Finance', companyRequired: true },
  { entity: 'customers', label: 'Customers', group: 'Sales', companyRequired: true },
  { entity: 'salesInvoices', label: 'Sales invoices', group: 'Sales', companyRequired: true },
  { entity: 'salesOrders', label: 'Sales orders', group: 'Sales', companyRequired: true },
  { entity: 'salesQuotes', label: 'Sales quotes', group: 'Sales', companyRequired: true },
  { entity: 'salesCreditMemos', label: 'Sales credit memos', group: 'Sales', companyRequired: true },
  { entity: 'salesShipments', label: 'Sales shipments', group: 'Sales', companyRequired: true },
  { entity: 'vendors', label: 'Vendors', group: 'Purchasing', companyRequired: true },
  { entity: 'purchaseOrders', label: 'Purchase orders', group: 'Purchasing', companyRequired: true },
  { entity: 'purchaseInvoices', label: 'Purchase invoices', group: 'Purchasing', companyRequired: true },
  { entity: 'purchaseCreditMemos', label: 'Purchase credit memos', group: 'Purchasing', companyRequired: true },
  { entity: 'purchaseReceipts', label: 'Purchase receipts', group: 'Purchasing', companyRequired: true },
  { entity: 'items', label: 'Items', group: 'Inventory', companyRequired: true },
  { entity: 'locations', label: 'Locations', group: 'Inventory', companyRequired: true },
  { entity: 'itemCategories', label: 'Item categories', group: 'Inventory', companyRequired: true },
  { entity: 'unitsOfMeasure', label: 'Units of measure', group: 'Inventory', companyRequired: true },
  { entity: 'itemLedgerEntries', label: 'Item ledger entries', group: 'Inventory', companyRequired: true },
  { entity: 'paymentTerms', label: 'Payment terms', group: 'Payment setup', companyRequired: true },
  { entity: 'paymentMethods', label: 'Payment methods', group: 'Payment setup', companyRequired: true },
  { entity: 'bankAccounts', label: 'Bank accounts', group: 'Payment setup', companyRequired: true },
  { entity: 'contacts', label: 'Contacts', group: 'People', companyRequired: true },
  { entity: 'employees', label: 'Employees', group: 'People', companyRequired: true }
];

const guidPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

interface Company {
  id: string;
  name: string;
}

function parseCompanies(body: string): { companies: Company[]; nextLink?: string } {
  const data: unknown = JSON.parse(body);
  if (!data || typeof data !== 'object' || !('value' in data) || !Array.isArray(data.value)) {
    throw new Error('The companies API returned an unexpected response.');
  }
  const companies = data.value.map((entry: unknown) => {
    if (!entry || typeof entry !== 'object' ||
        !('id' in entry) || typeof entry.id !== 'string' ||
        !/^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(entry.id) ||
        !('name' in entry) || typeof entry.name !== 'string') {
      throw new Error('The companies API returned an invalid company.');
    }
    return {
      id: entry.id,
      name: 'displayName' in entry && typeof entry.displayName === 'string' && entry.displayName
        ? entry.displayName : entry.name
    };
  });
  const nextLink = '@odata.nextLink' in data ? data['@odata.nextLink'] : undefined;
  if (nextLink !== undefined && typeof nextLink !== 'string') {
    throw new Error('The companies API returned an invalid next-page link.');
  }
  return { companies, nextLink };
}

export default function ApiExplorerPage() {
  const styles = useStyles();
  const shared = useSharedStyles();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [target, setTarget] = useState<TargetSelection | null>(null);
  const [method, setMethod] = useState('GET');
  const [path, setPath] = useState('');
  const [pathType, setPathType] = useState<'relative' | 'full'>('relative');
  const [fullUrl, setFullUrl] = useState('');
  const [company, setCompany] = useState('');
  const [apiType, setApiType] = useState<'microsoft' | 'custom'>('microsoft');
  const [presetId, setPresetId] = useState('companies');
  const [parentId, setParentId] = useState('');
  const [presetQuery, setPresetQuery] = useState<string | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState('');
  const [companiesLoading, setCompaniesLoading] = useState(false);
  const [companiesLoaded, setCompaniesLoaded] = useState(false);
  const companyRequest = useRef(0);
  const [body, setBody] = useState('');
  const [result, setResult] = useState<CallResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [history, setHistory] = useState<ApiCallHistoryEntry[]>([]);
  const [selected, setSelected] = useState<ApiCallHistoryEntry | null>(null);
  const [query, setQuery] = useState<{ key: string; value: QueryOptions } | null>(null);
  const preset = apiType === 'microsoft' ? apiPresets.find(p => p.entity === presetId) : undefined;
  const isFullUrl = apiType === 'custom' && pathType === 'full';
  let urlTarget: { tenantId: string; environment: string } | null = null;
  if (isFullUrl) {
    try {
      const url = new URL(fullUrl.trim());
      const parts = url.pathname.split('/');
      const tenantId = decodeURIComponent(parts[2] ?? '');
      const environment = decodeURIComponent(parts[3] ?? '');
      if (url.protocol === 'https:' && url.hostname === 'api.businesscentral.dynamics.com' &&
          !url.port && !url.username && !url.password && !url.hash &&
          parts[1] === 'v2.0' && environment && ['api', 'ODataV4'].includes(parts[4]) &&
          /^(?:[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}|[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,})$/i.test(tenantId)) {
        urlTarget = { tenantId, environment };
      }
    } catch { /* Incomplete URLs are explained by the field validation below. */ }
  }
  const requestPath = preset
    ? `api/v2.0/${preset.companyRequired ? `companies(${companyId || '{companyId}'})/` : ''}${preset.parent ? `${preset.parent.entity}(${parentId.trim() || '{journalId}'})/` : ''}${preset.entity}`
    : isFullUrl ? fullUrl : path;
  const selectedCompany = companies.find(c => c.id === companyId);
  const queryKey = JSON.stringify([apiType, pathType, requestPath, isFullUrl ? '' : target, company]);
  const queryOptions = query?.key === queryKey ? query.value : emptyQuery();
  const isGet = !!preset || method === 'GET';
  const prepared = isGet ? buildQuery(requestPath.trim(), queryOptions) : { path: requestPath.trim(), error: '' };
  const canSend = !prepared.error && (isFullUrl ? !!urlTarget : !!target?.environment && (!!preset || !/^https?:/i.test(path.trim()))) && !!requestPath.trim() &&
    (!preset?.companyRequired || !!selectedCompany) &&
    (!preset?.parent || guidPattern.test(parentId.trim()));
  const visiblePresets = apiPresets.filter(p =>
    `${p.label} ${p.entity} ${p.group}`.toLowerCase().includes((presetQuery ?? '').toLowerCase())
  );
  const visibleGroups = [...new Set(visiblePresets.map(p => p.group))];

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

  useEffect(() => () => { companyRequest.current++; }, []);

  const changeTarget = (next: TargetSelection | null) => {
    companyRequest.current++;
    setTarget(next);
    setCompanies([]);
    setCompanyId('');
    setParentId('');
    setCompany('');
    setCompaniesLoading(false);
    setCompaniesLoaded(false);
    setError('');
  };

  const loadCompanies = async () => {
    if (!target?.environment) return;
    const requestId = ++companyRequest.current;
    setCompaniesLoading(true);
    setCompaniesLoaded(false);
    setCompanyId('');
    setParentId('');
    setCompanies([]);
    setError('');
    try {
      const loaded: Company[] = [];
      const visited = new Set<string>();
      let nextPath: string | undefined = 'api/v2.0/companies';
      while (nextPath) {
        if (visited.has(nextPath)) throw new Error('The companies API repeated a next-page link.');
        visited.add(nextPath);
        const response = await api.post<CallResult>('/api/call', {
          tenantId: target.tenantId, environment: target.environment,
          method: 'GET', path: nextPath
        });
        if (requestId !== companyRequest.current) return;
        const page = parseCompanies(response.body);
        loaded.push(...page.companies);
        nextPath = page.nextLink;
      }
      setCompanies(loaded);
      setCompaniesLoaded(true);
    } catch (e: unknown) {
      if (requestId === companyRequest.current) {
        setError(`Could not load companies: ${e instanceof Error ? e.message : String(e)}`);
      }
    } finally {
      if (requestId === companyRequest.current) {
        setCompaniesLoading(false);
        loadHistory();
      }
    }
  };

  const execute = async () => {
    if (!canSend) return;
    setError('');
    setLoading(true);
    setResult(null);
    try {
      const resp = await fetch('/api/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenantId: isFullUrl ? undefined : target?.tenantId,
          environment: isFullUrl ? undefined : target?.environment,
          method: preset ? 'GET' : method,
          path: prepared.path,
          companyName: preset || isFullUrl ? undefined : company.trim() || undefined,
          body: preset ? undefined : body.trim() || undefined
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
        <Field label="API type">
          <RadioGroup
            layout="horizontal"
            value={apiType}
            onChange={(_e, d) => {
              if (d.value === 'microsoft' || d.value === 'custom') {
                setApiType(d.value);
                setPresetQuery(null);
              }
            }}
          >
            <Radio value="microsoft" label="Microsoft" />
            <Radio value="custom" label="Custom" />
          </RadioGroup>
        </Field>
        {apiType === 'microsoft' && <Field label="Microsoft API" hint="Search by name, endpoint or area. Availability depends on your BC version and permissions. Requests use GET.">
          <Combobox
            value={presetQuery ?? preset?.label ?? ''}
            selectedOptions={[presetId]}
            placeholder="Search APIs..."
            positioning={{ autoSize: 'width' }}
            listbox={{ style: { maxHeight: '320px' } }}
            onChange={e => setPresetQuery(e.target.value)}
            onBlur={() => setPresetQuery(null)}
            onOptionSelect={(_e, d) => {
              if (!d.optionValue) return;
              setPresetId(d.optionValue);
              setParentId('');
              setPresetQuery(null);
            }}
          >
            {visibleGroups.map(group => (
              <OptionGroup key={group} label={group}>
                {visiblePresets.filter(p => p.group === group).map(p => (
                  <Option key={p.entity} value={p.entity}>{p.label}</Option>
                ))}
              </OptionGroup>
            ))}
            {visiblePresets.length === 0 && <Option disabled>No matching APIs</Option>}
          </Combobox>
        </Field>}
        {apiType === 'custom' && (
          <Field label="Request type">
            <RadioGroup
              layout="horizontal"
              value={pathType}
              onChange={(_e, d) => {
                if (d.value === 'relative' || d.value === 'full') setPathType(d.value);
              }}
            >
              <Radio value="relative" label="Relative path" />
              <Radio value="full" label="Full URL" />
            </RadioGroup>
          </Field>
        )}
        <div className={styles.row}>
          {!isFullUrl && <TargetPicker settings={settings} value={target} onChange={changeTarget} />}
          {apiType === 'custom' && <Field label="Method">
            <Dropdown
              style={{ minWidth: '110px' }}
              value={method}
              selectedOptions={[method]}
              onOptionSelect={(_e, d) => setMethod(d.optionValue ?? 'GET')}
            >
              {['GET', 'POST', 'PATCH', 'DELETE'].map(m => <Option key={m} value={m}>{m}</Option>)}
            </Dropdown>
          </Field>}
        </div>
        {preset?.companyRequired && (
          <>
            <div className={styles.row}>
              <Field label="Company" required>
                <Dropdown
                  placeholder={companiesLoading ? 'Loading companies...' : 'Select company'}
                  value={selectedCompany?.name ?? ''}
                  selectedOptions={companyId ? [companyId] : []}
                  disabled={companiesLoading || companies.length === 0}
                  onOptionSelect={(_e, d) => {
                    setCompanyId(d.optionValue ?? '');
                    setParentId('');
                  }}
                >
                  {companies.map(c => <Option key={c.id} value={c.id}>{c.name}</Option>)}
                </Dropdown>
              </Field>
              <Button disabled={!target?.environment || companiesLoading} onClick={loadCompanies}>
                {companiesLoading ? 'Loading companies...' : 'Load companies'}
              </Button>
            </div>
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              Load companies, then choose which company's data to request.
            </Text>
            {companiesLoaded && companies.length === 0 && (
              <Text>No companies found in this environment.</Text>
            )}
            {preset?.parent && (
              <Field
                label={`${preset.parent.label} ID`}
                required
                hint="Copy the journal's id from a Journals response for this company."
                validationState={parentId.trim() && !guidPattern.test(parentId.trim()) ? 'error' : 'none'}
                validationMessage={parentId.trim() && !guidPattern.test(parentId.trim())
                  ? 'Enter a journal GUID, not its name or code.' : undefined}
              >
                <Input
                  value={parentId}
                  placeholder="00000000-0000-0000-0000-000000000000"
                  onChange={(_e, d) => setParentId(d.value)}
                />
              </Field>
            )}
          </>
        )}
        <Field
          label={apiType === 'microsoft' ? 'Request path' : isFullUrl ? 'Full URL' : 'Path'}
          hint={apiType === 'microsoft'
            ? 'Generated from your API and company selection. Use Custom to enter your own request.'
            : isFullUrl ? 'Include the tenant ID and environment. These are used for authentication and request history.'
            : 'Use a relative path such as api/v2.0/companies. For an https:// address, select Full URL.'}
          validationState={isFullUrl && fullUrl.trim() && !urlTarget ? 'error' : 'none'}
          validationMessage={isFullUrl && fullUrl.trim() && !urlTarget
            ? 'Use https://api.businesscentral.dynamics.com/v2.0/{tenantId}/{environment}/api/... or /ODataV4/...'
            : undefined}
          style={{ marginTop: '12px' }}
        >
          <Input
            placeholder={isFullUrl
              ? 'https://api.businesscentral.dynamics.com/v2.0/TENANT_ID/ENVIRONMENT/api/v2.0/companies'
              : 'api/v2.0/companies'}
            value={requestPath}
            readOnly={apiType === 'microsoft'}
            onChange={(_e, d) => isFullUrl ? setFullUrl(d.value) : setPath(d.value)}
            style={{ width: '100%', fontFamily: tokens.fontFamilyMonospace }}
          />
        </Field>
        {isFullUrl && urlTarget && (
          <Text size={200}>Tenant: {urlTarget.tenantId} | Environment: {urlTarget.environment}</Text>
        )}
        {isGet && (
          <>
            <ApiQueryBuilder
              key={queryKey}
              path={requestPath}
              value={queryOptions}
              onChange={value => setQuery({ key: queryKey, value })}
              canLoad={isFullUrl ? !!urlTarget : !!target?.environment && !!requestPath.trim()}
              error={prepared.error}
              requestPreview={prepared.path}
              load={async metadataPath => {
                try {
                  const response = await api.post<CallResult>('/api/call', {
                    tenantId: isFullUrl ? undefined : target?.tenantId,
                    environment: isFullUrl ? undefined : target?.environment,
                    method: 'GET', path: metadataPath
                  });
                  return response.body;
                } finally {
                  loadHistory();
                }
              }}
            />
          </>
        )}
        {apiType === 'custom' && !isFullUrl && (
          <details>
            <summary>{company.trim() ? `Additional options (company: ${company.trim()})` : 'Additional options'}</summary>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px', overflowWrap: 'anywhere' }}>
              <Field
                label="Company ID or name (optional)"
                hint="Adds ?company=. Use a GUID for APIs or a quoted name for OData. Leave blank if the path includes the company."
              >
                <Input
                  placeholder="Company GUID or 'CRONUS'"
                  value={company}
                  onChange={(_e, d) => setCompany(d.value)}
                  style={{ width: '100%', maxWidth: '420px' }}
                />
              </Field>
              <Text weight="semibold">API examples</Text>
              <Text size={200}>Replace COMPANY_ID with an actual id from <code>api/v2.0/companies</code>.</Text>
              <ul style={{ margin: 0, paddingLeft: '20px' }}>
                <li>Path: <code>api/v2.0/items</code> — Company: <code>COMPANY_ID</code></li>
                <li>Path: <code>api/v2.0/customers</code> — Company: <code>COMPANY_ID</code></li>
                <li>Path: <code>api/v2.0/companies(COMPANY_ID)/items</code> — Company: leave blank</li>
              </ul>
            </div>
          </details>
        )}
        {apiType === 'custom' && (method === 'POST' || method === 'PATCH') && (
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
            disabled={!canSend || loading || companiesLoading}
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
