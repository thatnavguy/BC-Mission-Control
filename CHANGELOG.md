# Changelog

All notable changes to BC Mission Control are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

## [1.1.0] - 2026-10-30

### Added

- A new "Unconfirmed" result status for when a deploy or app update was
  accepted by BC but status polling timed out. Before, these showed as
  "Succeeded". Runs with unconfirmed results finish as "completed with
  errors", and their staged apps are not deleted.
- CI workflow that typechecks and builds the server and web app on every
  push to `main` and on every pull request.

### Changed

- The saved sign-in token (`token.json`) is now encrypted with Windows DPAPI
  for the current user. Existing plaintext tokens are migrated on first use.
- BC API calls now time out instead of hanging forever. Throttled requests
  (HTTP 429) are retried, honouring `Retry-After`. Read requests also retry
  on network errors and 502/503/504.
- Long deploys, app updates, and environment operations fetch a fresh access
  token as they go, so runs longer than an hour no longer fail mid-way.
- Live progress updates are batched, and the History page refreshes at most
  once a second, which keeps the UI responsive during busy runs.
- Pages load on demand, so the app opens faster.
- Company lists are cached for 5 minutes.

### Fixed

- Security: the local API now rejects requests from other websites (CSRF)
  and DNS-rebinding attacks, by checking the `Host` and `Origin` headers.
- Security: the container admin password is no longer written to a script
  file on disk. It is passed to PowerShell through an environment variable.
- Immediate PTE deploys no longer report the result of an older deployment
  of the same app. Only the new deployment of the exact version is matched.
- A temporary sign-in error (e.g. a network blip or Conditional Access
  prompt) no longer deletes the saved sign-in. It is only cleared when
  Microsoft reports the token is expired or revoked.
- Simultaneous requests no longer race to redeem the same refresh token.
- A network error while waiting for device sign-in no longer crashes the
  server.
- Settings, history, and token files are written atomically, so a crash
  can't leave them half-written. A corrupt `settings.json` is set aside
  (`settings.json.corrupt-<time>`) instead of stopping the app.
- Leftover temporary script files from interrupted container runs are
  cleaned up at startup.
- Opening the app with an unknown `#page` link now shows the default page
  instead of a blank screen.
## [1.0.0] - 2026-10-30

### Added

- Standalone `BCMissionControl.exe` distribution: the server and web UI are
  packaged into a single Node SEA executable (`npm run build:exe`), so end
  users no longer need Node.js or npm. State lives in
  `%APPDATA%\BCMissionControl`, or in a portable `data` folder next to the exe
  when one exists. Note: the exe is not code-signed, so Windows SmartScreen
  will show a warning on first run (More info → Run anyway).
- GitHub Actions release workflow: pushing a `v*` tag builds the exe and
  attaches it to a GitHub release.
- Configurable listen port on the Setup page (persisted in settings, applies
  on restart; the `PORT` env var still works as a one-off override).
