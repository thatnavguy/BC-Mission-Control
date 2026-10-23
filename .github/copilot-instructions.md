# Copilot Instructions — BC Mission Control

Local web UI for managing Business Central: cloud (SaaS) tenants and local Docker
containers. TypeScript monorepo with two packages: `server/` (Express API) and
`web/` (React + Fluent UI).

## Build and run

- `npm run setup` — install dependencies for both packages (first time)
- `npm start` — build both, serve everything at http://127.0.0.1:4321
- `Start-MissionControl.bat` — double-click launcher used by end users (install/build if missing, then start)
- Dev mode: `npm run dev:server` (tsx watch, port 4321) + `npm run dev:web` (Vite, port 5173, proxies `/api` → 4321)
- Typecheck/build server only: `npm --prefix server run build`
- Build web only: `npm --prefix web run build` (runs `tsc -b` then `vite build`)

There are no tests and no linter configured — typechecking is the gate. If you
change server code, restart the running process (it serves `web/dist` and the
API from memory). Web-only changes need no restart: the server serves
`web/dist` from disk per request.

## High-level architecture

### Two execution models

**Cloud actions** call BC APIs directly from Node — no PowerShell:
- Admin Center API `https://api.businesscentral.dynamics.com/admin/v2.29`
  (environment list, scheduled PTE install via multipart `apps/pteInstall`)
- Automation API `https://api.businesscentral.dynamics.com/v2.0/{tenantId}/{env}/api/microsoft/automation/v2.0`
  (companies → extensions, extensionUpload, extensionDeploymentStatus)
- Immediate PTE publish flow (mirrors BcContainerHelper's `Publish-PerTenantExtensionApps`):
  PATCH `extensionUpload(0)` with schedule + SchemaSyncMode → PATCH content
  (octet-stream, If-Match: *) → POST `Microsoft.NAV.upload` → poll
  `extensionDeploymentStatus` for terminal state.

**Container actions** spawn `pwsh` with BcContainerHelper (containers are local
Docker workloads; there is no REST alternative). See the marker protocol below.

### Auth (`server/src/auth.ts`)

- OAuth2 device code flow, scope `https://api.businesscentral.dynamics.com/.default offline_access`.
- Client ID is optional: blank falls back to the well-known shared Azure
  PowerShell public client (`effectiveClientId()`). Never require a configured
  clientId — always go through `effectiveClientId(settings.clientId)`.
- One refresh token (`server/data/token.json`) is shared across tenants and
  **rotates on every redemption** — always persist a returned new refresh token.
  Access tokens are cached per tenant in memory.
- Device flow runs server-side in background (`startDeviceFlow` returns
  immediately; the frontend polls `/api/auth/device/status`).

### Runs and live progress (`server/src/deploy.ts`, `container.ts`)

- All long-running work (cloud deploy, container deploy, container create) is a
  `DeployRun` in an in-memory registry. Distinguish by `run.kind`:
  `'cloud' | 'container' | 'container-create'`.
- Progress flows to the UI over a single SSE stream: `GET /api/events`
  broadcasts the whole run object on every change. Frontends subscribe via
  `subscribeRuns()` in `web/src/api.ts` and filter by run id/kind.
- Cloud deploys: units are grouped per environment and run sequentially within
  an environment (the automation API has **one shared extensionUpload slot per
  environment**), parallel across environments (max 5).
- Container runs: Node generates a temp `.ps1` in `server/data/`, spawns
  `pwsh -File`, and streams stdout. The script emits machine-readable lines
  prefixed with `__BCAC_RESULT__` + JSON per work unit; Node parses markers to
  update results, everything else goes to the run log. Keep this marker protocol
  when changing container scripts.

### State and uploads

- All persistent state is JSON files under `server/data/` (gitignored):
  `settings.json` (clientId, tenants, containers, containerDefaults),
  `token.json`, `uploads/` (staged `.app` files shared by cloud and container
  deployment).
- `.app` manifests are parsed server-side from `NavxManifest.xml` inside the
  zip (`server/src/appManifest.ts`), which also provides dependency-order
  topological sorting used by both deploy paths.
- Soft-deleted environments (`status` SoftDeleted/SoftDeleting/Removing) are
  filtered out of the environment list — the Admin Center UI does the same.

## Key conventions

- **Shared types are duplicated by hand** between `server/src/types.ts` and
  `web/src/types.ts`. When you change one, change the other.
- **Frontend pages don't auto-fetch heavy data.** Compare Versions, Apps, and
  Deployment Status only call the API when the user clicks a button
  (Compare/Refresh) — this is deliberate, keep it that way.
- Targets are identified by the key `` `${tenantId}|${environment}` `` in the
  compare API (`?target=` repeated) and by checkbox state in pages.
- API Explorer (`POST /api/call`) is allowlisted to
  `api.businesscentral.dynamics.com` — never widen this without a user request.
- Fluent UI v9 (Griffel) styling: do not mix the `border` shorthand with
  `borderColor`/`borderStyle` longhands across style slots in `makeStyles` —
  it fails typechecking with a cryptic error. Use the full shorthand.
- Navigation is hash-based (`#deploy`, `#apps`, ...) with sections
  Cloud / Container / General in `web/src/App.tsx`. Add new pages to
  `PAGE_KEYS`, the `TabList`, and the render block.
- The `Reference/` folder is a legacy PowerShell project kept for behavioral
  reference only. Nothing imports it; do not add dependencies on it.
