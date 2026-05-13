# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/MeonValleyWeb/package-age-guard/compare/v1.1.0...HEAD
[1.1.0]: https://github.com/MeonValleyWeb/package-age-guard/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/MeonValleyWeb/package-age-guard/releases/tag/v1.0.0
