# Package Age Guard

[![CI](https://github.com/MeonValleyWeb/package-age-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/MeonValleyWeb/package-age-guard/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/package-age-guard.svg)](https://www.npmjs.com/package/package-age-guard)
[![Latest Release](https://img.shields.io/github/v/release/MeonValleyWeb/package-age-guard)](https://github.com/MeonValleyWeb/package-age-guard/releases/latest)

Block npm packages that are too new. Protect your projects against supply chain attacks.

## Why?

Attackers sometimes publish malicious packages and rely on developers installing them immediately. By requiring packages to be **at least 7 days old** (configurable), you give the community time to discover and report malicious packages.

An age threshold gives maintainers time to detect a bad release. It does not establish that a package is safe, detect malware, or replace vulnerability auditing.

## What's New in v1.2.1

- Registry lookups and fixes use argument-based subprocesses, without a shell.
- Registry failures and malformed policy files fail the check.
- Dependency ranges use their resolved version from a matching npm lockfile. Unresolved ranges produce warnings; `--strict` makes those warnings fail.
- The pnpm CommonJS hook loads correctly and blocks unverifiable packages in `error` mode.
- GitHub Action results and exit codes are preserved in both output modes.
- npm publishing validates the release tag, tests the installed tarball, and includes provenance.

[See full changelog →](./CHANGELOG.md)

## Installation

```bash
# Use with npx (no install required)
npx package-age-guard

# Or install globally
npm install -g package-age-guard
package-age-guard

# Short alias after global or local installation
pag
```

## Quick Start

```bash
# Check all dependencies (default: 7 day minimum)
npx package-age-guard

# Require 30 days minimum
npx package-age-guard --min=30

# Check production dependencies only
npx package-age-guard --production

# Show safe version suggestions
npx package-age-guard --suggest

# Auto-fix violations (install safe versions)
npx package-age-guard --fix

# Interactive mode - choose fixes manually
npx package-age-guard --interactive

# Output as JSON for CI
npx package-age-guard --json
```

## CLI Usage

```
📦 Package Age Guard v1.2.1
   Block npm packages that are too new - protect against supply chain attacks

Usage: npx package-age-guard [options]

Options:
  --min=<days>         Minimum package age (default: 7)
  --config=<path>      Load a JSON configuration file
  --production         Check production dependencies only
  --json               Output results as JSON
  --strict             Exit with error on warnings too
  --quiet, -q          Minimal output
  --verbose, -V        Show detailed output
  --suggest, -s        Show safe version suggestions for violations
  --fix, -f            Auto-install suggested safe versions
  --interactive, -i    Interactive mode to choose fixes
  --dry-run            Show what would be done (with --fix)
  --init               Create .package-age-guard.json config file
  --help, -h           Show this help
  --version, -v        Show version

Exit codes:
  0  All packages meet age requirements
  1  One or more packages are too new (or warnings in strict mode)
  2  Configuration or system error
```

## What is checked

The CLI checks direct dependencies, optional dependencies, and (unless `--production` is set) dev dependencies. It does not scan the complete transitive dependency tree. For npm lockfile v2/v3, a matching root dependency declaration selects the resolved package version. Without a matching lockfile, exact versions are checked and unresolved ranges, tags, aliases, and local sources produce warnings. Use `--strict` to require every selected dependency to be verifiable. pnpm and Yarn lockfiles are not read by the CLI; the pnpm hook checks exact package versions during installation.

Registry errors exit with code 2; age violations exit with code 1. Malformed JSON or invalid policy values fail instead of silently falling back to defaults. JSON configuration is supported; JavaScript configuration is not loaded.

## Configuration File

Create `.package-age-guard.json` in your project root:

```json
{
  "minAge": 30,
  "productionOnly": false,
  "whitelist": [
    "my-internal-package",
    "emergency-patch@1.2.3"
  ],
  "failOnWarning": false,
  "ignorePatterns": ["*", "latest", "next", "beta", "alpha", "rc", "canary"]
}
```

Or add to your `package.json`:

```json
{
  "package-age-guard": {
    "minAge": 14,
    "productionOnly": false,
    "whitelist": []
  }
}
```

### Configuration Options

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `minAge` | number | 7 | Minimum package age in days |
| `productionOnly` | boolean | false | Check production deps only |
| `whitelist` | string[] | [] | Packages to skip (name or name@version) |
| `failOnWarning` | boolean | false | Treat warnings as failures |
| `ignorePatterns` | string[] | ['*', 'latest'] | Version patterns to skip |
| `pnpmMode` | string | 'warn' | pnpm hook mode: 'warn', 'error', or 'allow' |

## Programmatic API

Use in your Node.js scripts:

```javascript
import { checkPackages, loadConfig, formatResults } from 'package-age-guard';

// Check with default config
const results = await checkPackages();
console.log(formatResults(results));

// Check with custom config
const results = await checkPackages({
  config: {
    minAge: 30,
    productionOnly: true,
    whitelist: ['my-package']
  }
});

// Load config from file
const config = await loadConfig();
console.log(`Min age: ${config.minAge} days`);
```

### API Methods

#### `checkPackages(options)`

Check all packages in a project.

**Parameters:**
- `options.cwd` (string): Working directory (default: process.cwd())
- `options.config` (object): Configuration object
- `options.includeSuggestions` (boolean): Include safe version suggestions for violations

**Returns:** Promise<CheckResults>

```javascript
{
  passed: [{ name, version, age, published, status }],
  violations: [{ 
    name, version, age, published, status,
    suggestion: { version, published, ageDays }  // If includeSuggestions: true
  }],
  warnings: [{ name, version, age, reason, status }],
  errors: [{ name, version, error, code, status }],
  total: number,
  minAge: number,
  checkedAt: string
}
```

#### `getSafeVersion(packageName, minAge)`

Find the highest stable version of a package that meets the minimum age requirement. This checks age only; it does not assess vulnerabilities or API compatibility.

**Parameters:**
- `packageName` (string): Package name
- `minAge` (number): Minimum age in days (default: 7)

**Returns:** Promise<{version, published, ageDays} | null>

```javascript
const safeVersion = await getSafeVersion('axios', 30);
// Returns: { version: '1.6.8', published: '2022-01-15T...', ageDays: 892 }
```

#### `loadConfig(cwd)`

Load configuration from `.package-age-guard.json` or `package.json`.

**Parameters:**
- `cwd` (string): Working directory (default: process.cwd())

**Returns:** Promise<Config>

#### `formatResults(results)`

Format check results as human-readable text.

**Parameters:**
- `results` (CheckResults): Results from checkPackages()

**Returns:** string

#### `hasViolations(results)`

Check if results contain violations.

**Returns:** boolean

#### `shouldFail(results, config)`

Determine if check should fail based on results and config.

**Returns:** boolean

## Safe Version Suggestions

When a package is too new, Package Age Guard can suggest a safe, older version that's been around long enough:

```bash
$ npx package-age-guard --suggest

📦 Package Age Guard Results
   Checked 15 packages (min age: 7 days)

   ...
   ❌ axios@1.7.0 - Only 2 days old
      💡 Suggested: axios@1.6.8 (892 days old)
         Install: npm install axios@1.6.8
   ...

🔒 Security Policy Violation
   1 package(s) are newer than 7 days.
   These may be supply chain attack vectors.

   Options:
   1. Wait for packages to age
   2. Use older versions (see suggestions above)
   3. Install all suggested: npx package-age-guard --fix
   4. Add to whitelist in .package-age-guard.json
```

## Auto-Fix Mode

Automatically install the suggested safe versions:

```bash
# Preview what would be changed (dry run)
npx package-age-guard --fix --dry-run

# Actually install safe versions
npx package-age-guard --fix
```

This will:
1. Check all packages
2. Find violations
3. Look up safe versions
4. Install exact versions with lifecycle scripts disabled, preserving dev dependency placement
5. Recheck the project and return a nonzero exit status if violations or errors remain

## Interactive Mode

For more control, use interactive mode to choose how to handle each violation:

```bash
$ npx package-age-guard --interactive

🎮 Interactive Mode - 2 violation(s) to resolve

❌ axios@1.7.0 - Only 2 days old
   💡 Suggested: 1.6.8 (892 days old)

   Options:
      s - Skip (do nothing)
      i - Install suggested version (1.6.8)
      w - Add to whitelist (this package)
      W - Add to whitelist (name@version)
      q - Quit interactive mode

   Your choice [s/i/w/W/q]:
```

## 🧶 pnpm Support

Package Age Guard now works with **pnpm** via hooks that check package ages during installation!

### Setup pnpm Hooks

```bash
npx package-age-guard --setup-pnpm
```

This creates a `.pnpmfile.cjs` in your project root that automatically checks package ages during `pnpm install`.

### pnpm Modes

Configure pnpm behavior in `.package-age-guard.json`:

```json
{
  "minAge": 14,
  "pnpmMode": "warn"
}
```

**pnpmMode options:**
- `"warn"` (default) - Warn about unsafe packages but allow installation
- `"error"` - Block installation of packages that are too new
- `"allow"` - Disable pnpm hooks entirely

### pnpm Usage Examples

```bash
# Install with automatic age checking
pnpm install

# With warn mode (default):
# ⚠️  axios@1.7.0 is only 2 days old (minimum: 14 days)
#    This package is newer than your security policy allows.
#    + axios 1.7.0

# With error mode:
# ❌ Package Age Guard: axios@1.7.0 is only 2 days old
#    Package install error
```

### Manual pnpm Setup

If you prefer manual setup, create `.pnpmfile.cjs`:

```javascript
module.exports = require('package-age-guard/pnpm');
```

Or with custom configuration:

```javascript
const { hooks } = require('package-age-guard/pnpm');

module.exports = {
  hooks: {
    readPackage(pkg, context) {
      // Custom logic here
      return hooks.readPackage(pkg, context);
    },
    afterAllResolved: hooks.afterAllResolved
  }
};
```

## Programmatic API: Safe Versions

Use safe version suggestions in your code:

```javascript
import { getSafeVersion, checkPackages, formatResults } from 'package-age-guard';

// Get a specific safe version
const safeVersion = await getSafeVersion('lodash', 30);
console.log(`Safe version: ${safeVersion.version} (${safeVersion.ageDays} days old)`);

// Check with suggestions
const results = await checkPackages({
  includeSuggestions: true,
  config: { minAge: 14 }
});

// Violations now have .suggestion property
results.violations.forEach(v => {
  if (v.suggestion) {
    console.log(`${v.name}: ${v.version} → ${v.suggestion.version}`);
  }
});
```

## 🔄 GitHub Action

Package Age Guard is available as an official GitHub Action for easy CI/CD integration!

### Quick Start

```yaml
name: Package Age Check

on: [push, pull_request]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      
      - name: Check Package Ages
        uses: MeonValleyWeb/package-age-guard/.github/actions/check-packages@main
        with:
          min-age: 14
          strict: true
```

### GitHub Action Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `min-age` | 7 | Minimum package age in days |
| `production-only` | false | Check production dependencies only |
| `strict` | false | Exit with error on warnings too |
| `suggest` | true | Show safe version suggestions |
| `json-output` | false | Output results as JSON |
| `config-file` | empty (automatic discovery) | Path to a JSON config file |

### GitHub Action Outputs

| Output | Description |
|--------|-------------|
| `violations` | Number of packages that are too new |
| `warnings` | Number of warnings |
| `passed` | Number of packages that passed |
| `total` | Total packages checked |
| `has-violations` | Boolean if violations were found |
| `results-json` | Full JSON results (if json-output: true) |

### Advanced Example with PR Comments

```yaml
name: Package Security Check

on:
  pull_request:
    branches: [main]

jobs:
  check-packages:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      
      - name: Check Package Ages
        uses: MeonValleyWeb/package-age-guard/.github/actions/check-packages@main
        id: package-check
        with:
          min-age: 14
          suggest: true
          json-output: true
        continue-on-error: true
      
      - name: Comment PR with Results
        if: github.event_name == 'pull_request'
        uses: actions/github-script@v9
        with:
          script: |
            const results = JSON.parse(process.env.RESULTS);
            const violations = results.violations || [];
            
            let body = '## 📦 Package Age Guard Results\n\n';
            
            if (violations.length === 0) {
              body += '✅ All packages meet the age requirement!\n';
            } else {
              body += `❌ Found ${violations.length} package(s) newer than 14 days:\n\n`;
              body += '| Package | Version | Age | Suggestion |\n';
              body += '|---------|---------|-----|------------|\n';
              
              violations.forEach(v => {
                const suggestion = v.suggestion ? `\`${v.suggestion.version}\`` : '-';
                body += `| ${v.name} | ${v.version} | ${v.age} days | ${suggestion} |\n`;
              });
              
              body += '\n💡 Run `npx package-age-guard --fix` locally to install safe versions.\n';
            }
            
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: body
            });
        env:
          RESULTS: ${{ steps.package-check.outputs.results-json }}
```

## Integration Examples

### As npm preinstall hook

```json
{
  "scripts": {
    "preinstall": "npx package-age-guard --quiet --strict"
  }
}
```

### Manual GitHub Actions (without the official action)

If you prefer more control, you can use the CLI directly:

```yaml
name: CI

on: [push, pull_request]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v7
      - uses: actions/setup-node@v7
        with:
          node-version: '24'
      
      - name: Check package ages
        run: npx package-age-guard --strict
        # Fails if any package is too new
```

### As pre-commit hook

```bash
#!/bin/sh
# .git/hooks/pre-commit

npx package-age-guard --quiet || exit 1
```

### In package.json scripts

```json
{
  "scripts": {
    "security:check": "package-age-guard --min=14",
    "security:check:ci": "package-age-guard --strict --json"
  }
}
```

## Whitelisting

Sometimes you need to use a newer package (security patches, critical fixes).

### Whitelist by package name (any version)

```json
{
  "whitelist": ["lodash", "express"]
}
```

### Whitelist specific version

```json
{
  "whitelist": ["lodash@4.17.21", "react@18.2.0"]
}
```

### CLI override

```bash
# Temporarily use a newer version
npm install lodash@latest

# Or with --min=0 (not recommended for CI)
npx package-age-guard --min=0
```

## Recommended Minimum Ages

| Use Case | Recommended Min Age | Reason |
|----------|-------------------|---------|
| Personal projects | 7 days | Balance of security vs convenience |
| Team projects | 14 days | Time for community review |
| CI/CD pipelines | 30 days | Maximum security for automation |
| Financial/crypto | 60+ days | Critical security requirements |
| Production releases | 30 days | Conservative approach |

## Exit Codes

| Code | Meaning |
|------|---------|
| `0` | All packages meet age requirements |
| `1` | One or more packages are too new (or warnings in strict mode) |
| `2` | Configuration or system error |

## FAQ

**Q: Will this slow down npm install?**  
A: Adds ~5-10 seconds for the first install. Results are not cached between runs, but npm registry responses are fast.

**Q: What if I need a security patch immediately?**  
A: You have several options:
   - Use `--suggest` to see if there's a safe version that still includes the patch
   - Use `--fix` to automatically install safe versions
   - Use `--interactive` to choose per-package
   - Add the package to your whitelist temporarily
   - Use `--min=0` as a last resort (remember to remove it afterward)

**Q: Does this work with private registries?**  
A: Yes, as long as the registry supports `npm view` commands.

**Q: Can I use this in CI/CD?**  
A: Absolutely! Use `--json` for programmatic parsing or `--strict` to fail on warnings too.

**Q: What about pre-release versions (beta, alpha, rc)?**  
A: These are ignored by default since they're often recently published. Use exact versions for pre-releases.

**Q: How is age calculated?**  
A: From the package's `time.modified` field in npm registry (last publish time of that version).

## Comparison with npm audit

| Feature | `npm audit` | Package Age Guard |
|---------|-------------|-------------------|
| **What it checks** | Known vulnerabilities | Package age/supply chain risk |
| **When it runs** | After install | Before or during install |
| **Database** | npm security advisories | npm registry timestamps |
| **Blocks install?** | Configurable | Yes (configurable) |
| **Best for** | Known CVEs | Zero-day supply chain attacks |

**Use both together** for maximum protection:

```bash
npx package-age-guard && npm install && npm audit
```

## Contributing

Contributions welcome! Please read our [Contributing Guide](CONTRIBUTING.md).

## License

MIT © [Meon Valley Web](https://github.com/MeonValleyWeb)

---

**Pro tip:** Star ⭐ this repo if you find it useful!

## Development and releases

Node.js 18 or newer is supported for package compatibility. Use a currently supported Node.js LTS release for development. There are no runtime or development dependencies.

```sh
npm ci --ignore-scripts
npm run lint
npm test
npm run test:package
```

`test:package` packs the package, installs the tarball offline in a temporary project, and verifies its API, CLI version, and generated pnpm hook. The Action implementation runs from the selected repository revision, so an Action ref such as `main` is not interpreted as an npm version.

The publish workflow runs when a GitHub release is published. Update both package manifests, commit to `main`, then tag that commit `v<package.json version>` and publish its GitHub release. The workflow rejects mismatched tags, inconsistent lockfile versions, or a commit outside `main`. Manual uploads must also select that version tag. Manual `dry-run` validation can run against a branch and defaults to true. A source push alone does not publish to npm.

Publishing uses Node.js 24, validates the package before upload, and requests npm provenance. The existing `NPM_TOKEN` repository secret remains supported and must be a valid granular token with package publishing permission. To use tokenless publishing, configure the npm package's trusted publisher for GitHub owner `MeonValleyWeb`, repository `package-age-guard`, and workflow filename `publish.yml`, with no environment restriction; then remove the token secret when the replacement access is verified. The workflow grants OIDC permission only to the publishing job. See [npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

An example consumer workflow is available at [examples/package-check.yml](examples/package-check.yml).
