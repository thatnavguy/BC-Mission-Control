# AGENTS.md

Guidance for AI agents working in this repository. Architecture and build
conventions are in the project's Copilot instructions / README — this file
covers the release process.

## Releasing a new version

Version is kept in lockstep across three places: `package.json` (root,
server, web), `CHANGELOG.md`, and the git tag. Never edit them by hand —
run the bump script instead:

```powershell
npm run version:bump -- 1.1.0
```

The script bumps all three `package.json` files and renames the CHANGELOG
`## [Unreleased]` section to `## [x.y.z] - <today>` with a fresh Unreleased
section on top. Then:

1. Review the CHANGELOG diff (make sure everything user-facing is listed).
2. Commit, tag `v<x.y.z>`, push with tags.
3. `.github/workflows/release.yml` builds `BCMissionControl.exe` and attaches
   it to a GitHub release automatically.

Rules:

- All user-facing changes go under `## [Unreleased]` in `CHANGELOG.md` as
  they are made — don't batch them at release time.
- Use semver: patch for fixes, minor for features, major for breaking changes.
- The tag must be `v` + the exact version from package.json.
