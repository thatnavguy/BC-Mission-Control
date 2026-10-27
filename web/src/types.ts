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
  containerDefaults: {
    licenseFile: string;
    dns: string;
    country: string;
    memoryLimit: string;
  };
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

export type TargetStatus = 'pending' | 'running' | 'succeeded' | 'skipped' | 'scheduled' | 'failed';

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

export interface DeployRun {
  id: string;
  kind: 'cloud' | 'container' | 'container-create' | 'app-update' | 'environment';
  startedAt: string;
  finishedAt?: string;
  status: 'running' | 'completed' | 'completed-with-errors' | 'failed';
  /** PTE deploy runs only */
  schedule?: 'Immediate' | 'UpdateWindow';
  schemaSync?: 'Add' | 'Force';
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

export interface AppUpdateRequirement {
  appId: string;
  name: string;
  publisher: string;
  version: string;
  type: string;
}

export interface AppUpdateInfo {
  appId: string;
  name: string;
  publisher: string;
  version: string;
  requirements: AppUpdateRequirement[];
}

export interface AvailableCountry {
  countryCode: string;
  rings: { name: string; productionRing: boolean; friendlyName: string }[];
}

export interface EnvironmentStorageUsage {
  environmentName: string;
  environmentType: string;
  /** Used database storage in KB; -1 when the service failed to measure it. */
  databaseStorageInKilobytes: number;
}

export interface StorageQuotas {
  productionEnvironments: number;
  sandboxEnvironments: number;
  storage: { default: number; userLicenses: number; additionalCapacity: number; total: number };
}

export interface StorageResponse {
  usage: EnvironmentStorageUsage[];
  quotas: StorageQuotas;
}

export interface EnvironmentOperation {
  id: string;
  type?: string;
  status?: string;
  createdOn?: string;
  startedOn?: string;
  completedOn?: string;
  createdBy?: string;
  errorMessage?: string;
  environmentName?: string;
  environmentType?: string;
  parameters?: Record<string, unknown>;
}

export interface OperationsResponse {
  operations: EnvironmentOperation[];
  apps: { appId: string; name: string; publisher: string; version: string }[];
}

export interface EnvironmentUpdateInfo {
  targetVersion: string;
  available: boolean;
  selected: boolean;
  targetVersionType?: string;
  updateStatus?: string;
  scheduleDetails?: {
    latestSelectableDateTime?: string;
    selectedDateTime?: string;
    ignoreUpdateWindow?: boolean;
    rolloutStatus?: string;
  };
  expectedAvailability?: { month: number; year: number };
}

export interface UpdateWindow {
  preferredStartTime?: string;
  preferredEndTime?: string;
  timeZoneId?: string;
  preferredStartTimeUtc?: string;
  preferredEndTimeUtc?: string;
}

export interface UpdateManagementResponse {
  updates: EnvironmentUpdateInfo[];
  window: UpdateWindow | null;
  currentVersion: string | null;
}

export interface TimeZoneInfo {
  id: string;
  displayName: string;
  currentUtcOffset: string;
}

export interface AuthStatus {
  signedIn: boolean;
  savedAt?: string;
  ageDays?: number;
  expired?: boolean;
}

export interface DeviceCodeInfo {
  userCode: string;
  verificationUri: string;
  message: string;
  expiresIn: number;
}

export interface DockerContainer {
  name: string;
  image: string;
  status: string;
  running: boolean;
}

export interface ContainerCapabilities {
  pwsh: boolean;
  bcContainerHelper: boolean;
  docker: boolean;
}

export interface ContainersResponse {
  configured: ContainerConfig[];
  running: DockerContainer[];
  capabilities: ContainerCapabilities;
}
