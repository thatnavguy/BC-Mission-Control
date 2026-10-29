# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

BC consultants and developers at partner organizations. They deploy per-tenant
extensions (PTEs) across many customer SaaS tenants and spin up local Docker
containers for development and testing. They are technical: comfortable with
BC environments, extension lifecycles, and Docker, but want the repetitive
mechanics taken off their hands.

## Product Purpose

BC Mission Control is a fast, local web UI for managing Business Central from
one place — cloud (SaaS) tenants and local Docker containers. It replaces
manual Admin Center clicking and hand-run BcContainerHelper scripts with a
single dashboard: sign in once with a device code, stage `.app` files, pick
targets, deploy, and watch live progress. Success means a consultant ships a
PTE to several tenants (or a fresh container) in minutes without leaving the
tool or opening a script.

## Positioning

A local, self-hosted mission control that talks to the BC Admin Center and
Automation APIs directly from Node — no client secret required (optional
Entra app registration; a shared Microsoft registration works out of the box)
— and drives local containers through BcContainerHelper when there is no REST
alternative. Neighboring tools are either the web Admin Center (manual,
per-tenant, no containers) or raw BcContainerHelper (scripts, no UI, no cloud
deploy); this product is both, in one local app.

## Operating Context

- Runs locally on the consultant's Windows machine; launched by
  double-clicking `Start-MissionControl.bat` (or an optional desktop
  shortcut), served at http://127.0.0.1:4321.
- OAuth2 device code flow; one refresh token shared across tenants.
- Cloud actions call BC APIs directly; container actions spawn `pwsh` with
  BcContainerHelper (requires Docker Desktop, PowerShell 7,
  BcContainerHelper module).
- Long-running work (deploys, container creation) streams live progress to
  the UI over SSE; every run is recorded in History.
- `.app` files are staged once in `server/data/uploads/` and shared by cloud
  and container deployment; manifests are parsed for dependency ordering.

## Capabilities and Constraints

- **Cloud:** tenant/environment management, PTE deployment (immediate or
  update-window scheduled, schema sync mode, dependency-ordered), extension
  browsing with scope badges, reinstall/unpublish/apply AppSource updates,
  bulk install/unpublish of extensions, per-environment feature management
  (enable/disable), tenant notification recipients, cross-environment
  version comparison with difference detection, deployment status with
  error messages, API Explorer (allowlisted to
  `api.businesscentral.dynamics.com`).
- **Container:** PTE deployment to local containers, friendly-name container
  mapping with live status, container creation form (artifacts, credentials,
  toolkits) with streamed output, saved defaults (license, DNS, country,
  memory).
- **Constraints:** local single-user app, not a hosted multi-user service;
  persistent state is JSON under `server/data/`; frontend deliberately avoids
  auto-fetching heavy data (Compare, Apps, Status load on explicit button
  click); soft-deleted environments are hidden.
- **Terminology:** PTE, tenant, environment, container, artifact, schema sync
  mode, update window — standard BC vocabulary, kept as-is.

## Brand Commitments

- Name: **BC Mission Control** (repository: BC-Mission-Control).
- Built with Fluent UI v9 (React + Griffel); components and behavior stay
  Fluent, the skin does not.
- **Standing visual preference (user-pinned, 2026-10-23):** a white, modern
  category-standard look at Linear/Vercel craft level — light ground, crisp
  hairlines, restrained layout — enlivened with a dash of blue + orange
  (mascot-derived) and the product mascot.
- **Mascot:** the orange fox in navy batik with a silver fern
  (`web/public/mascot.png`). It appears at brand moments (nav brand, empty
  states, Setup) — never as decoration inside working tables or forms.

## Evidence on Hand

- `README.md` — feature list and architecture summary (accurate).
- `Reference/` — legacy PowerShell project kept for behavioral reference
  only; not a dependency.
- No testimonials, screenshots, or marketing assets exist; future work must
  not fabricate them.

## Product Principles

1. **One place, both worlds.** Cloud tenants and local containers are managed
   side by side; neither is a second-class citizen.
2. **No scripts to run by hand.** Anything the Admin Center or
   BcContainerHelper can do should be a button with live progress.
3. **Explicit over eager.** Heavy data loads only when the user asks
   (Compare, Apps, Status); nothing phones home or fetches on page load.
4. **Local and private.** State stays on the user's machine; credentials are
   a single device-code sign-in, never a stored secret.
5. **Honest progress.** Long operations stream real logs and per-target
   results; failure messages are surfaced, not swallowed.
