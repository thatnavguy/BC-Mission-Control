export interface TenantConfig {
  name: string;
  id: string;
  environments: Record<string, boolean>;
}

export interface ContainerConfig {
  name: string;
  containerName: string;
  enabled: boolean;
}

export interface Settings {
  clientId: string;
  tokenValidityDays: number;
  tenants: TenantConfig[];
  containers: ContainerConfig[];
  containerDefaults: ContainerDefaults;
}

export interface ContainerDefaults {
  licenseFile: string;
  dns: string;
  country: string;
  memoryLimit: string;
}

export interface TokenData {
  refreshToken?: string;
  savedAt?: string;
}

export interface AppManifest {
  id: string;
  name: string;
  publisher: string;
  version: string;
  dependencies: { id: string; name: string }[];
}

export interface StagedApp {
  fileName: string;
  size: number;
  uploadedAt: string;
  manifest?: AppManifest;
  manifestError?: string;
}

export type ScheduleOption = 'Immediate' | 'UpdateWindow';
export type SchemaSyncOption = 'Add' | 'Force';
export type ContainerSyncMode = 'Add' | 'Clean' | 'Development';
export type RunKind = 'cloud' | 'container' | 'container-create' | 'app-update' | 'environment';

export type TargetStatus =
  | 'pending'
  | 'running'
  | 'succeeded'
  | 'skipped'
  | 'scheduled'
  | 'failed';

export interface DeployTargetResult {
  tenantId: string;
  tenantName: string;
  environment: string;
  appFile: string;
  status: TargetStatus;
  message: string;
  operationId?: string;
  updatedAt: string;
}

export type RunStatus = 'running' | 'completed' | 'completed-with-errors' | 'failed';

export interface DeployRun {
  id: string;
  kind: RunKind;
  startedAt: string;
  finishedAt?: string;
  status: RunStatus;
  /** PTE deploy runs only */
  schedule?: ScheduleOption;
  schemaSync?: SchemaSyncOption;
  acceptIsvEula?: boolean;
  results: DeployTargetResult[];
  log: string[];
}

export interface EnvironmentInfo {
  name: string;
  type?: string;
  status?: string;
  version?: string;
}
