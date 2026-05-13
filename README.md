# Package Age Guard

[![CI](https://github.com/MeonValleyWeb/package-age-guard/actions/workflows/ci.yml/badge.svg)](https://github.com/MeonValleyWeb/package-age-guard/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/package-age-guard.svg)](https://www.npmjs.com/package/package-age-guard)

Block npm packages that are too new. Protect your projects against supply chain attacks.

## Why?

Attackers sometimes publish malicious packages and rely on developers installing them immediately. By requiring packages to be **at least 7 days old** (configurable), you give the community time to discover and report malicious packages.

**Real incidents this would have prevented:**
- **colors** (Jan 2022) - Malicious version live for hours
- **node-ipc** (Mar 2022) - Protestware published and quickly installed
- **typosquatting attacks** - Fake packages with similar names

## Installation

```bash
# Use with npx (no install required)
npx package-age-guard

# Or install globally
npm install -g package-age-guard
package-age-guard

# Short alias
npx pag
```

## Quick Start

```bash
# Check all dependencies (default: 7 day minimum)
npx package-age-guard

# Require 30 days minimum
npx package-age-guard --min=30

# Check production dependencies only
npx package-age-guard --production

# Output as JSON for CI
npx package-age-guard --json
```

## CLI Usage

```
📦 Package Age Guard v1.1.0
   Block npm packages that are too new - protect against supply chain attacks

Usage: npx package-age-guard [options]

Options:
  --min=<days>      Minimum package age (default: 7)
  --production      Check production dependencies only
  --json            Output results as JSON
  --strict          Exit with error on warnings too
  --quiet, -q       Minimal output
  --verbose, -V     Show detailed output
  --init            Create .package-age-guard.json config file
  --help, -h        Show this help
  --version, -v     Show version

Exit codes:
  0  All packages meet age requirements
  1  One or more packages are too new (or warnings in strict mode)
  2  Configuration or system error
```

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

**Returns:** Promise<CheckResults>

```javascript
{
  passed: [{ name, version, age, published, status }],
  violations: [{ name, version, age, published, status }],
  warnings: [{ name, version, age, reason, status }],
  errors: [{ name, version, error, code, status }],
  total: number,
  minAge: number,
  checkedAt: string
}
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

## Integration Examples

### As npm preinstall hook

```json
{
  "scripts": {
    "preinstall": "npx package-age-guard --quiet || true"
  }
}
```

### In GitHub Actions CI

```yaml
name: CI

on: [push, pull_request]

jobs:
  security:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
      
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
A: Add the package to your whitelist or use `--min=0` temporarily. Remember to remove it afterward.

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

MIT © [The Football Family](https://github.com/MeonValleyWeb)

---

**Pro tip:** Star ⭐ this repo if you find it useful!
