# Package Age Guard

Block npm packages that are too new. Protect your projects against supply chain attacks.

## Why?

Attackers sometimes publish malicious packages and rely on developers installing them immediately. By requiring packages to be **at least 7 days old** (configurable), you give the community time to discover and report malicious packages.

**Real incidents this would have prevented:**
- **colors** (Jan 2022) - Malicious version live for hours
- **node-ipc** (Mar 2022) - Protestware published and quickly installed
- **typosquatting attacks** - Fake packages with similar names

## Installation

```bash
# Use with npx (no install)
npx package-age-guard

# Or install globally
npm install -g package-age-guard
package-age-guard
```

## Usage

### Quick Check

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

### Add to Your Project

**1. As a preinstall hook (recommended):**

Add to your `package.json`:

```json
{
  "scripts": {
    "preinstall": "npx package-age-guard --quiet || true"
  }
}
```

**2. As CI check:**

```yaml
# .github/workflows/ci.yml
- name: Check Package Ages
  run: npx package-age-guard --strict
```

**3. Manual check:**

```bash
npm install -g package-age-guard
package-age-guard
```

## Configuration

Create `.package-age-guard.json` in your project root:

```json
{
  "minAge": 30,
  "productionOnly": false,
  "whitelist": ["my-internal-package"],
  "failOnWarning": false
}
```

## Options

| Option | Description | Default |
|--------|-------------|---------|
| `--min=<days>` | Minimum package age | 7 |
| `--production` | Check production deps only | false |
| `--json` | Output as JSON | false |
| `--strict` | Exit error on warnings | false |
| `--quiet` | Minimal output | false |

## Exit Codes

- `0` - All packages meet age requirements
- `1` - One or more packages are too new
- `2` - Configuration or system error

## How It Works

1. Reads your `package.json`
2. For each dependency, queries npm registry for publication date
3. Calculates age in days
4. Flags packages younger than minimum threshold
5. Blocks installation if violations found

## Recommended Minimum Ages

| Use Case | Recommended Min Age | Reason |
|----------|-------------------|---------|
| Personal projects | 7 days | Balance of security vs convenience |
| Team projects | 14 days | Time for community review |
| CI/CD pipelines | 30 days | Maximum security for automated builds |
| Financial/crypto | 60+ days | Critical security requirements |

## Whitelisting

If you need a specific new package:

```json
{
  "whitelist": ["emergency-security-patch", "@company/internal@1.2.3"]
}
```

## FAQ

**Q: Will this slow down npm install?**  
A: Adds ~5-10 seconds for first install. Checks are cached.

**Q: What if I need a security patch immediately?**  
A: Use whitelist or run with `--min=0` temporarily.

**Q: Does this work with private registries?**  
A: Yes, if the registry supports `npm view` commands.

## License

MIT
