export type FieldType = 'text' | 'number' | 'date' | 'datetime' | 'boolean' | 'guid';
export interface ApiField { name: string; type: FieldType }
export interface FilterRule { id: number; field: string; type: FieldType; operator: string; value: string }
export interface QueryOptions {
  mode: 'guided' | 'expression';
  rules: FilterRule[];
  expression: string;
  select: string;
  orderBy: string;
  descending: boolean;
  top: string;
}

export function emptyQuery(): QueryOptions {
  return { mode: 'guided', rules: [], expression: '', select: '', orderBy: '', descending: false, top: '' };
}

export const operators = [
  { value: 'eq', label: 'equals' }, { value: 'ne', label: 'does not equal' },
  { value: 'gt', label: 'is greater than' }, { value: 'ge', label: 'is at least' },
  { value: 'lt', label: 'is less than' }, { value: 'le', label: 'is at most' },
  { value: 'contains', label: 'contains' }, { value: 'startswith', label: 'starts with' },
  { value: 'endswith', label: 'ends with' },
  { value: 'null', label: 'is empty (null)' }, { value: 'notnull', label: 'is not empty (null)' }
];

export function allowedOperators(type: FieldType) {
  return operators.filter(o => !['contains', 'startswith', 'endswith'].includes(o.value) || type === 'text')
    .filter(o => !['gt', 'ge', 'lt', 'le'].includes(o.value) || !['boolean', 'guid'].includes(type));
}

const fieldPattern = /^[A-Za-z_]\w*(\/[A-Za-z_]\w*)*$/;
const guidPattern = /^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;
const validDate = (value: string) => /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(Date.parse(value)) && new Date(value).toISOString().slice(0, 10) === value;

export function ruleError(rule: FilterRule): string {
  if (!fieldPattern.test(rule.field.trim())) return 'Enter an API field name, such as displayName.';
  if (!allowedOperators(rule.type).some(o => o.value === rule.operator)) return 'Choose an operator for this field type.';
  if (['null', 'notnull'].includes(rule.operator)) return '';
  if (!rule.value.trim() && rule.type !== 'text') return 'Enter a value.';
  if (rule.type === 'number' && !/^-?\d+(\.\d+)?$/.test(rule.value.trim())) return 'Enter a number, such as 1000.50.';
  if (rule.type === 'guid' && !guidPattern.test(rule.value.trim())) return 'Enter a GUID.';
  if (rule.type === 'boolean' && !['true', 'false'].includes(rule.value)) return 'Choose Yes or No.';
  if (rule.type === 'date' && !validDate(rule.value)) {
    return 'Enter a valid date.';
  }
  if (rule.type === 'datetime' && (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})$/.test(rule.value) ||
      !validDate(rule.value.slice(0, 10)) || !Number.isFinite(Date.parse(rule.value)))) return 'Enter a valid date and time with a time zone, such as 2026-01-31T12:00:00Z.';
  return '';
}

export function guidedExpression(rules: FilterRule[]): string {
  return rules.map(rule => {
    const field = rule.field.trim();
    if (rule.operator === 'null') return `${field} eq null`;
    if (rule.operator === 'notnull') return `${field} ne null`;
    const value = rule.type === 'text' ? `'${rule.value.replace(/'/g, "''")}'` : rule.value.trim();
    return ['contains', 'startswith', 'endswith'].includes(rule.operator)
      ? `${rule.operator}(${field},${value})` : `${field} ${rule.operator} ${value}`;
  }).join(' and ');
}

export function buildQuery(path: string, options: QueryOptions): { path: string; error: string; filter: string } {
  const filter = options.mode === 'expression' ? options.expression.trim() : guidedExpression(options.rules);
  const invalidRule = options.mode === 'guided' ? options.rules.map(ruleError).find(Boolean) : undefined;
  if (invalidRule) return { path, error: 'Complete or remove invalid filters before sending.', filter };
  if (options.top && (!/^\d+$/.test(options.top) || !Number.isSafeInteger(Number(options.top)) || Number(options.top) < 1)) {
    return { path, error: 'Record limit must be a whole number greater than zero.', filter };
  }
  if (options.orderBy.trim() && !fieldPattern.test(options.orderBy.trim())) {
    return { path, error: 'Choose a sort field or enter its API name.', filter };
  }
  if (options.select.trim() && !options.select.split(',').every(f => fieldPattern.test(f.trim()))) {
    return { path, error: 'Separate returned field names with commas.', filter };
  }
  const additions: [string, string][] = [
    ['$filter', filter], ['$select', options.select.split(',').map(f => f.trim()).filter(Boolean).join(',')],
    ['$orderby', options.orderBy.trim() ? `${options.orderBy.trim()} ${options.descending ? 'desc' : 'asc'}` : ''],
    ['$top', options.top]
  ].filter((entry): entry is [string, string] => !!entry[1]);
  const question = path.indexOf('?');
  const params = new URLSearchParams(question < 0 ? '' : path.slice(question + 1));
  const conflict = additions.find(([key]) => params.has(key));
  if (conflict) return { path, error: `${conflict[0]} is already in the path. Remove it there or clear its query option.`, filter };
  const suffix = additions.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
  return { path: suffix ? `${path}${question < 0 ? '?' : path.endsWith('?') || path.endsWith('&') ? '' : '&'}${suffix}` : path, error: '', filter };
}

export function metadataTarget(path: string): { path: string; entity: string } {
  const clean = path.trim().split('?')[0];
  const root = clean.match(/^(.*?\/api\/(?:v\d+(?:\.\d+)?|[^/]+\/[^/]+\/[^/]+))\//i) ??
    clean.match(/^(api\/(?:v\d+(?:\.\d+)?|[^/]+\/[^/]+\/[^/]+))\//i) ??
    clean.match(/^(.*?\/ODataV4)\//i);
  const entity = clean.split('/').pop()?.replace(/\(.*$/, '') ?? '';
  if (!entity || !fieldPattern.test(entity)) throw new Error('Enter a collection path before loading fields.');
  if (root) return { path: `${root[1]}/$metadata`, entity };
  if (!/^https?:/i.test(clean) && !clean.startsWith('api/')) return { path: 'api/v2.0/$metadata', entity };
  throw new Error('Field discovery needs a standard API, custom API, or OData collection path. You can still enter field names manually.');
}

export function parseMetadata(xml: string, entity: string): ApiField[] {
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.getElementsByTagName('parsererror').length) throw new Error('The API did not return valid XML metadata.');
  const elements = (name: string) => Array.from(doc.getElementsByTagNameNS('*', name));
  const set = elements('EntitySet').find(e => e.getAttribute('Name') === entity);
  const navigationTypes = [...new Set(elements('NavigationProperty')
    .filter(e => e.getAttribute('Name') === entity)
    .map(e => e.getAttribute('Type')?.replace(/^Collection\((.*)\)$/, '$1'))
    .filter((name): name is string => !!name))];
  if (!set && navigationTypes.length > 1) {
    throw new Error(`Metadata lists different types for "${entity}". Enter field names and types manually.`);
  }
  let type: string | undefined = set?.getAttribute('EntityType') ?? navigationTypes[0];
  if (!type) throw new Error(`No metadata was found for "${entity}". Enter field names manually or check the collection path.`);
  const fields: ApiField[] = [];
  const visited = new Set<string>();
  while (type && !visited.has(type)) {
    visited.add(type);
    const entityType = elements('EntityType').find(e => {
      const schema = e.parentElement;
      return [`${schema?.getAttribute('Namespace')}.${e.getAttribute('Name')}`,
        `${schema?.getAttribute('Alias')}.${e.getAttribute('Name')}`].includes(type!);
    });
    if (!entityType) throw new Error(`The API metadata could not resolve "${type}". Enter field names manually.`);
    for (const property of Array.from(entityType.children).filter(e => e.localName === 'Property')) {
      const name = property.getAttribute('Name');
      const edm = property.getAttribute('Type');
      const fieldType: FieldType | undefined = edm === 'Edm.String' ? 'text'
        : edm === 'Edm.Boolean' ? 'boolean' : edm === 'Edm.Date' ? 'date'
        : edm === 'Edm.DateTimeOffset' ? 'datetime' : edm === 'Edm.Guid' ? 'guid'
        : ['Edm.Byte', 'Edm.SByte', 'Edm.Int16', 'Edm.Int32', 'Edm.Int64', 'Edm.Decimal', 'Edm.Double', 'Edm.Single'].includes(edm ?? '') ? 'number' : undefined;
      if (name && fieldType && !fields.some(f => f.name === name)) fields.push({ name, type: fieldType });
    }
    type = entityType.getAttribute('BaseType') ?? undefined;
  }
  if (!fields.length) throw new Error('No supported filter fields were found. Enter field names and types manually.');
  return fields.sort((a, b) => a.name.localeCompare(b.name));
}
