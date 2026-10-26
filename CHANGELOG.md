# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.2.1] - 2026-10-26

### Fixed

- Removed shell interpolation from npm registry lookups and package installs.
- Registry failures and malformed configuration now fail the CLI and strict pnpm hook.
- Dependency ranges check matching npm lockfile versions; unresolved versions warn instead of checking range lower bounds.
- Include optional dependencies, merge partial API configuration with defaults, validate policy values, and accept `--min=0`.
- Export pnpm hooks as CommonJS and verify the generated pnpmfile against an installed tarball.
- Preserve development dependency placement, install exact fixes with scripts disabled, and recheck before returning success.
- Restore the interactive version-specific whitelist choice and use the package manifest for CLI version output.
- Prefer the highest age-compliant stable suggestion over backports and prereleases.
- GitHub Action runs its selected source revision, safely handles inputs, exposes real counts and compact JSON, and propagates failures.

### Changed

- Synchronize package and lockfile version at 1.2.1; replace the unavailable ESLint command with syntax validation.
- Add regression and installed-package checks; test Node.js 18, 20, 22, 24, and 26 compatibility.
- Pin current GitHub Actions and limit workflow permissions. Move the consumer example out of active workflows.
- Publish only from matching release tags on main after verification, with provenance, Node.js 24, and optional OIDC authentication.

## [1.2.0]


### Added

#### Safe Version Suggestions
- New `getSafeVersion(packageName, minAge)` API function to find compliant older versions
- `--suggest` / `-s` CLI flag to show safe version suggestions for violations
- Enhanced `checkPackages({ includeSuggestions: true })` to include suggestions in results
- `formatResults()` now displays suggested safe versions with install commands

#### Auto-Fix Mode
- `--fix` / `-f` CLI flag to automatically install suggested safe versions
- `--dry-run` flag to preview fixes without applying changes
- Automatic downgrade of violating packages to compliant versions

#### Interactive Mode
- `--interactive` / `-i` CLI flag for guided per-package resolution
- Interactive prompts with options: skip, install safe version, whitelist package/version, or quit
- Automatic whitelist modification through interactive choices

#### pnpm Support
- New `pnpm.js` module providing pnpmfile hooks for install-time protection
- `--setup-pnpm` CLI command to automatically create `.pnpmfile.cjs`
- Three pnpm modes: `warn` (default), `error`, and `allow`
- Caching to avoid repeated npm registry calls during pnpm install
- Graceful handling when package-age-guard is not installed

#### GitHub Action
- Official GitHub Action at `MeonValleyWeb/package-age-guard/.github/actions/check-packages@main`
- Composite action with configurable inputs: `min-age`, `production-only`, `strict`, `suggest`, `json-output`
- Action outputs: `violations`, `warnings`, `passed`, `total`, `has-violations`, `results-json`
- Shield icon branding for security focus
- Example workflow with PR commenting

### Fixed

- `getPackageAge()` now uses version-specific publish dates from npm registry instead of `time.modified`
- Fixed issue where packages were incorrectly reported as 0 days old when the package entry was recently updated

### Changed

- Updated README with comprehensive documentation for all new features
- Added API documentation for `getSafeVersion` and enhanced `checkPackages`
- Added pnpm integration guide with setup instructions
- Added GitHub Action reference with examples
- Updated help text to include all new CLI options

## [1.1.0] - 2024-XX-XX

### Added
- Programmatic API with ES modules support
- Configuration file support (`.package-age-guard.json` and `package.json`)
- CLI with multiple flags: `--min`, `--production`, `--json`, `--strict`, `--quiet`, `--verbose`, `--init`
- Test suite with 32 tests
- CI/CD workflows
- Whitelist functionality
- Ignore patterns for pre-release versions

## [1.0.0] - 2024-XX-XX

### Added
- Initial release
- Basic package age checking
- npm integration
- Command-line interface
- MIT License

[Unreleased]: https://github.com/MeonValleyWeb/package-age-guard/compare/v1.2.1...HEAD
[1.2.1]: https://github.com/MeonValleyWeb/package-age-guard/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/MeonValleyWeb/package-age-guard/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/MeonValleyWeb/package-age-guard/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/MeonValleyWeb/package-age-guard/releases/tag/v1.0.0
