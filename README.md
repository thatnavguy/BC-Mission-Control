# BC Mission Control

![Mission Control](web\public\MissionControl.jpg)

A fast, local web UI for managing Business Central — cloud (SaaS) tenants and
local Docker containers from one place. The Node backend talks to the Business
Central Admin Center and Automation APIs directly; no scripts to run by hand.

## Features

- **Setup page** — one device code sign-in covers everything (no client secret
  needed). Client ID is optional: leave blank to use the built-in shared
  Microsoft registration, or enter your own multi-tenant Entra ID app. Manage
  tenants and tick which environments are enabled as targets.
- **PTE Deployment page** — drag & drop `.app` files (manifest is read
  automatically), select tenant/environment targets, choose **Immediate** or
  **Update window** scheduling, schema sync mode, and deploy with live
  per-target progress. Apps deploy in dependency order.
- **Apps page** — browse extensions in an environment with scope badges
  (PTE / Dev / AppSource). Reinstall uninstalled PTEs, unpublish old PTE
  versions, and apply AppSource updates — all from one table. Manual Refresh;
  nothing is fetched until you ask.
- **Compare Versions page** — pick which tenants/environments to scan, then
  compare installed versions in a matrix with drift detection
  (✓ Same / ✗ Different) and the latest version highlighted.
- **Deployment Status page** — latest extension deployment operations per
  environment, including error messages. Manual Refresh.
- **API Explorer page** — call any BC API endpoint (standard v2.0, custom APIs,
  automation API) with tenant/environment/company pickers and a formatted
  response viewer. Runs as your signed-in user.
- **History page** — every run (cloud deploy, container deploy, container
  create) with per-target results and a full log.

### Container section (requires Docker + PowerShell 7 + BcContainerHelper)

- **PTE Deployment** — deploy staged `.app` files to local BC containers
  (publish + sync + install/upgrade) with live per-container progress.
- **Containers** — map friendly names to Docker containers with live status,
  save defaults (license file, DNS, country, memory limit) once, and create
  new containers via a form (artifact type/country/version, credentials,
  toolkits) with streamed creation output.

## Architecture

Product and design context live in `PRODUCT.md` (what the product is and who
it serves) and `DESIGN.md` (the visual system: tokens, surfaces, rules), both
maintained with the Impeccable workflow in `.github/skills/impeccable/`.

```
server/   Express + TypeScript backend (port 4321)
          - OAuth2 device code flow against login.microsoftonline.com
          - Admin Center API  v2.29  (environment list, scheduled PTE install)
          - Automation API    v2.0   (extension upload, install/unpublish, status)
          - container actions spawn local pwsh + BcContainerHelper
web/      React + TypeScript + Vite + Fluent UI (port 5173 in dev)
```

Data (settings, token, uploaded apps) lives in `server/data/` — keep it private.

## Prerequisites

- Node.js 18+
- That's it for cloud. A custom Entra ID app registration is **optional**.
- Container section additionally needs: Docker Desktop, PowerShell 7 (`pwsh`),
  and `Install-Module BcContainerHelper`.

## Run

**Double-click `Start-MissionControl.bat`** — it installs dependencies and builds
on first run, starts the server, and opens http://127.0.0.1:4321 in your browser.
Keep the console window open while using the app.

For a desktop shortcut, run `Create-DesktopShortcut.ps1` once
(right-click → Run with PowerShell).

From a terminal instead:

```powershell
npm run setup     # first time: install dependencies
npm start         # build web + server, serve everything at http://127.0.0.1:4321
```

Development mode (hot reload):

```powershell
npm run dev:server   # terminal 1 — API on 4321
npm run dev:web      # terminal 2 — UI on 5173 (proxies /api to 4321)
```

## First-time setup in the UI

1. Open **Setup** and click **Sign in with device code**
   (optionally paste your own Client ID first).
2. Add a tenant (name + tenant ID), click **Load environments**, tick the
   environments you work with. Soft-deleted environments are hidden.
3. Go to **PTE Deployment**, drop your `.app` files, pick targets, deploy.
