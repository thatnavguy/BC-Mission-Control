import { useEffect, useId, useRef, useState } from 'react';
import {
  Button, Combobox, Dropdown, Field, Input, makeStyles, MessageBar, MessageBarBody,
  Option, Radio, RadioGroup, Tag, TagGroup, Text, Textarea, tokens
} from '@fluentui/react-components';
import { Add24Regular, ArrowReset24Regular, Delete24Regular } from '@fluentui/react-icons';
import {
  allowedOperators, ApiField, emptyQuery, FieldType, guidedExpression, metadataTarget,
  parseMetadata, QueryOptions, ruleError
} from './apiQuery';

const useStyles = makeStyles({
  section: { display: 'flex', flexDirection: 'column', gap: '12px', borderTop: `1px solid ${tokens.colorNeutralStroke2}`, paddingTop: '20px', marginTop: '8px' },
  row: { display: 'flex', gap: '12px', alignItems: 'flex-end', flexWrap: 'wrap' },
  header: { display: 'flex', gap: '16px', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' },
  actions: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' },
  heading: { display: 'flex', flexDirection: 'column', gap: '4px' },
  resultRow: { display: 'flex', gap: '12px', alignItems: 'flex-start', flexWrap: 'wrap' },
  compactField: { flexBasis: '180px', flexGrow: 0, minWidth: 0 },
  disclosure: {
    borderTop: `1px solid ${tokens.colorNeutralStroke2}`, paddingTop: '12px',
    '& > summary': {
      cursor: 'pointer', paddingTop: '4px', paddingBottom: '4px', borderRadius: tokens.borderRadiusMedium,
      overflowWrap: 'anywhere',
      ':hover': { color: tokens.colorBrandForeground1 },
      ':focus-visible': { outline: `2px solid ${tokens.colorStrokeFocus2}`, outlineOffset: '2px' }
    }
  },
  field: { flexGrow: 1, flexBasis: '180px', minWidth: 0 },
  control: { minWidth: 0, width: '100%' },
  preview: { fontFamily: tokens.fontFamilyMonospace, overflowWrap: 'anywhere', whiteSpace: 'pre-wrap', margin: 0 },
  options: { display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '12px' }
});

function fieldLabel(name: string) {
  const words = name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/([A-Z])([A-Z][a-z])/g, '$1 $2').replace(/_/g, ' ')
    .split(' ').map(word => /^[A-Z0-9]+$/.test(word) ? word : word.toLowerCase()).join(' ');
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function FieldSelector({ label, name, fields, onChange }: {
  label: string; name: string; fields: ApiField[]; onChange: (name: string) => void;
}) {
  const styles = useStyles();
  const [search, setSearch] = useState<string | null>(null);
  const known = fields.some(f => f.name === name);
  const visible = fields.filter(f => `${fieldLabel(f.name)} ${f.name}`.toLowerCase().includes((search ?? '').toLowerCase()));
  return (
    <Field label={label} className={styles.field}>
      <Combobox freeform value={search ?? (known ? fieldLabel(name) : name)}
        selectedOptions={name ? [name] : []} placeholder={fields.length ? 'Choose a field' : 'Enter an API field name'}
        className={styles.control} positioning={{ autoSize: 'width' }} listbox={{ style: { maxHeight: '240px' } }}
        onChange={e => { setSearch(e.target.value); onChange(e.target.value); }}
        onBlur={() => setSearch(null)}
        onOptionSelect={(_e, d) => { if (d.optionValue) { onChange(d.optionValue); setSearch(null); } }}>
        {visible.map(f => <Option key={f.name} value={f.name} text={fieldLabel(f.name)}>
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <Text>{fieldLabel(f.name)}</Text><Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>{f.name}</Text>
          </div>
        </Option>)}
        {!visible.length && <Option disabled>{fields.length ? 'No matching fields. You can enter an API name.' : 'Load fields to see suggestions'}</Option>}
      </Combobox>
    </Field>
  );
}

const types: { value: FieldType; label: string }[] = [
  { value: 'text', label: 'Text' }, { value: 'number', label: 'Number' },
  { value: 'date', label: 'Date' }, { value: 'datetime', label: 'Date and time' },
  { value: 'boolean', label: 'Yes / No' }, { value: 'guid', label: 'GUID' }
];

interface Props {
  value: QueryOptions;
  onChange: (value: QueryOptions) => void;
  path: string;
  canLoad: boolean;
  load: (path: string) => Promise<string>;
  error: string;
  requestPreview: string;
}

export default function ApiQueryBuilder({ value, onChange, path, canLoad, load, error, requestPreview }: Props) {
  const styles = useStyles();
  const [fields, setFields] = useState<ApiField[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const alive = useRef(true);
  const validationId = useId();
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const change = (patch: Partial<QueryOptions>) => onChange({ ...value, ...patch });
  const active = value.rules.length > 0 || value.expression || value.select || value.orderBy || value.top;
  const selectedFields = value.select.split(',').map(f => f.trim()).filter(Boolean);
  const resultSummary = [
    value.top ? `limit ${value.top}` : '',
    selectedFields.length ? `${selectedFields.length} field${selectedFields.length === 1 ? '' : 's'}` : '',
    value.orderBy ? 'Sorted' : ''
  ].filter(Boolean).join(' · ');
  const loadFields = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const target = metadataTarget(path);
      const loaded = parseMetadata(await load(target.path), target.entity);
      if (alive.current) setFields(loaded);
    } catch (e: unknown) {
      if (alive.current) setLoadError(`Could not load fields: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      if (alive.current) setLoading(false);
    }
  };
  const fieldInput = (label: string, name: string, update: (name: string) => void) =>
    <FieldSelector label={label} name={name} fields={fields} onChange={update} />;
  return (
    <section className={styles.section} aria-label="Refine results">
      <div className={styles.header}>
        <div className={styles.heading}>
          <Text as="h3" size={400} weight="semibold" style={{ margin: 0 }}>Refine results</Text>
          {fields.length > 0 && <Text size={300}>{fields.length} fields available.</Text>}
        </div>
        <div className={styles.actions}>
          <Button disabled={!canLoad || loading} onClick={loadFields}>{loading ? 'Loading fields...' : 'Load fields'}</Button>
          <Button appearance="secondary" icon={<ArrowReset24Regular />} disabled={!active}
            onClick={() => onChange(emptyQuery())}>Clear all options</Button>
        </div>
      </div>
      {!fields.length && <Text size={200}>Load fields for suggestions and automatic data types, or enter an API field name manually.</Text>}
      {loadError && <MessageBar intent="error"><MessageBarBody>{loadError}</MessageBarBody></MessageBar>}
      <Field label="Filter method">
        <RadioGroup layout="horizontal" value={value.mode} onChange={(_e, d) => {
          if (d.value === 'expression') change({ mode: 'expression', expression: value.expression || guidedExpression(value.rules) });
          else if (d.value === 'guided') change({ mode: 'guided' });
        }}>
          <Radio value="guided" label="Filter builder" />
          <Radio value="expression" label="Advanced filter" />
        </RadioGroup>
      </Field>
      {value.mode === 'guided' ? (
        <>
          {!value.rules.length && <Text size={200}>No filters. Add a condition to narrow the results.</Text>}
          {value.rules.length > 1 && <Text size={200}>All conditions must match. Use Advanced filter for OR or grouped conditions.</Text>}
          {value.rules.map((rule, index) => {
            const update = (patch: Partial<typeof rule>) => change({ rules: value.rules.map(r => r.id === rule.id ? { ...r, ...patch } : r) });
            const validation = ruleError(rule);
            return (
              <div key={rule.id} role="group" aria-label={`Filter ${index + 1}`}
                aria-describedby={validation ? `${validationId}-${rule.id}` : undefined}>
                <div className={styles.row}>
                  {fieldInput(`Field ${index + 1}`, rule.field, name => {
                    const type = fields.find(f => f.name === name)?.type ?? rule.type;
                    update({ field: name, type, operator: allowedOperators(type).some(o => o.value === rule.operator) ? rule.operator : 'eq',
                      value: type === rule.type ? rule.value : '' });
                  })}
                  {!fields.some(f => f.name === rule.field && f.type === rule.type) && <Field label="Type" style={{ flexBasis: '140px' }}>
                    <Dropdown className={styles.control} value={types.find(t => t.value === rule.type)?.label} selectedOptions={[rule.type]}
                      onOptionSelect={(_e, d) => {
                        const type = types.find(t => t.value === d.optionValue)?.value;
                        if (type) update({ type, operator: 'eq', value: '' });
                      }}>
                      {types.map(t => <Option key={t.value} value={t.value}>{t.label}</Option>)}
                    </Dropdown>
                  </Field>}
                  <Field label="Condition" style={{ flexBasis: '180px' }}>
                    <Dropdown className={styles.control} selectedOptions={[rule.operator]}
                      value={allowedOperators(rule.type).find(o => o.value === rule.operator)?.label}
                      onOptionSelect={(_e, d) => { if (d.optionValue) update({ operator: d.optionValue }); }}>
                      {allowedOperators(rule.type).map(o => <Option key={o.value} value={o.value}>{o.label}</Option>)}
                    </Dropdown>
                  </Field>
                  {!['null', 'notnull'].includes(rule.operator) && <Field label="Value" className={styles.field}>
                    {rule.type === 'boolean' ? (
                      <Dropdown className={styles.control} value={rule.value === 'true' ? 'Yes' : rule.value === 'false' ? 'No' : ''}
                        placeholder="Choose Yes or No" selectedOptions={rule.value ? [rule.value] : []}
                        onOptionSelect={(_e, d) => update({ value: d.optionValue ?? '' })}>
                        <Option value="true">Yes</Option><Option value="false">No</Option>
                      </Dropdown>
                    ) : <Input className={styles.control} value={rule.value}
                      type={rule.type === 'date' ? 'date' : rule.type === 'number' ? 'number' : 'text'}
                      step={rule.type === 'number' ? 'any' : undefined}
                      placeholder={rule.type === 'datetime' ? '2026-01-31T12:00:00Z' : rule.type === 'number' ? '1000.50' : rule.type === 'text' ? 'Enter text without quotes' : 'Enter a GUID'}
                      onChange={(_e, d) => update({ value: d.value })} />}
                  </Field>}
                  <Button appearance="subtle" icon={<Delete24Regular />} aria-label={`Remove filter ${index + 1}`}
                    onClick={() => change({ rules: value.rules.filter(r => r.id !== rule.id) })} />
                </div>
                {validation && <Text id={`${validationId}-${rule.id}`} role="status" block size={200}
                  style={{ color: tokens.colorPaletteRedForeground1, marginTop: '4px' }}>{validation}</Text>}
              </div>
            );
          })}
          <Button style={{ alignSelf: 'flex-start' }} icon={<Add24Regular />}
            onClick={() => change({ rules: [...value.rules, { id: Math.max(0, ...value.rules.map(r => r.id)) + 1, field: '', type: 'text', operator: 'eq', value: '' }] })}>Add condition</Button>
        </>
      ) : (
        <Field label="Advanced filter" hint="Write an OData filter expression without $filter=. Each method keeps its own conditions; later edits are not converted when you switch.">
          <Textarea rows={2} value={value.expression} placeholder="status eq 'Open' and totalAmountExcludingTax gt 1000"
            onChange={(_e, d) => change({ expression: d.value })} />
        </Field>
      )}
      <details className={styles.disclosure}>
        <summary>Result options{resultSummary ? ` · ${resultSummary}` : ''}</summary>
        <div className={styles.options}>
          <div className={styles.resultRow}>
            {fieldInput('Sort by', value.orderBy, orderBy => change({ orderBy }))}
            <Field label="Direction" className={styles.compactField}>
              <Dropdown className={styles.control} value={value.descending ? 'Descending' : 'Ascending'}
                selectedOptions={[value.descending ? 'desc' : 'asc']}
                onOptionSelect={(_e, d) => change({ descending: d.optionValue === 'desc' })}>
                <Option value="asc">Ascending</Option><Option value="desc">Descending</Option>
              </Dropdown>
            </Field>
            <Field label="Record limit" hint="Blank uses the API default." className={styles.compactField}>
              <Input className={styles.control} value={value.top} inputMode="numeric" placeholder="For example, 100" onChange={(_e, d) => change({ top: d.value })} />
            </Field>
          </div>
          <Field label="Fields to return" hint={fields.length ? 'Choose fields below. Leave empty to return all fields.' : 'Use API names separated by commas. Leave blank for all fields.'}>
            {fields.length ? <Dropdown multiselect placeholder="Choose fields" value="Choose fields"
              positioning={{ autoSize: 'width' }} listbox={{ style: { maxHeight: '240px' } }}
              selectedOptions={selectedFields}
              onOptionSelect={(_e, d) => change({ select: d.selectedOptions.join(',') })}>
              {fields.map(f => <Option key={f.name} value={f.name} text={fieldLabel(f.name)}>{fieldLabel(f.name)}</Option>)}
            </Dropdown> : <Input value={value.select} placeholder="number,displayName" onChange={(_e, d) => change({ select: d.value })} />}
          </Field>
          {fields.length > 0 && selectedFields.length > 0 && (
            <TagGroup aria-label="Fields to return" style={{ flexWrap: 'wrap', gap: '8px' }}
              onDismiss={(_e, d) => change({ select: selectedFields.filter(name => name !== d.value).join(',') })}>
              {selectedFields.map(name => <Tag key={name} value={name} dismissible title={name}
                dismissIcon={{ 'aria-label': `Remove ${fieldLabel(name)}` }}>{fieldLabel(name)}</Tag>)}
            </TagGroup>
          )}
        </div>
      </details>
      <details className={styles.disclosure}>
        <summary>View request details</summary>
        <div className={styles.options}>
          {(value.mode === 'expression' ? value.expression.trim() : value.rules.length > 0) && (
            <div><Text size={200} weight="semibold">Filter expression</Text><pre className={styles.preview}>{value.mode === 'expression' ? value.expression : guidedExpression(value.rules)}</pre></div>
          )}
          <Field label="Request preview" hint="Changing the endpoint or target clears these options.">
            <Textarea readOnly resize="vertical" rows={3} value={requestPreview} style={{ fontFamily: tokens.fontFamilyMonospace }} />
          </Field>
        </div>
      </details>
      {error && <MessageBar intent="error"><MessageBarBody>{error}</MessageBarBody></MessageBar>}
    </section>
  );
}
