# Changelog

All notable changes to BC Mission Control are documented here. The format is
based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

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
