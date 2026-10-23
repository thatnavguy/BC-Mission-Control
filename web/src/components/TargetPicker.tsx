import { Dropdown, Field, Option } from '@fluentui/react-components';
import { Settings } from '../types';

export interface TargetSelection {
  tenantId: string;
  tenantName: string;
  environment: string;
}

interface Props {
  settings: Settings;
  value: TargetSelection | null;
  onChange: (value: TargetSelection | null) => void;
}

/** Tenant + environment dropdown pair sourced from enabled environments in settings. */
export default function TargetPicker({ settings, value, onChange }: Props) {
  const tenant = settings.tenants.find(t => t.id === value?.tenantId) ?? null;
  const envs = tenant
    ? Object.entries(tenant.environments).filter(([, e]) => e).map(([name]) => name)
    : [];

  return (
    <>
      <Field label="Tenant">
        <Dropdown
          style={{ minWidth: '220px' }}
          placeholder="Select tenant"
          value={tenant?.name ?? ''}
          onOptionSelect={(_e, d) => {
            const t = settings.tenants.find(x => x.id === d.optionValue);
            if (!t) return;
            const firstEnv = Object.entries(t.environments).find(([, e]) => e)?.[0] ?? '';
            onChange({ tenantId: t.id, tenantName: t.name, environment: firstEnv });
          }}
        >
          {settings.tenants.map(t => (
            <Option key={t.id} value={t.id}>{t.name}</Option>
          ))}
        </Dropdown>
      </Field>
      <Field label="Environment">
        <Dropdown
          style={{ minWidth: '220px' }}
          placeholder="Select environment"
          disabled={!tenant}
          value={value?.environment ?? ''}
          onOptionSelect={(_e, d) => {
            if (!tenant || !d.optionValue) return;
            onChange({ tenantId: tenant.id, tenantName: tenant.name, environment: d.optionValue });
          }}
        >
          {envs.map(env => (
            <Option key={env} value={env}>{env}</Option>
          ))}
        </Dropdown>
      </Field>
    </>
  );
}
