/**
 * Package Age Guard - pnpm hook
 * Blocks or warns about packages that are too new during pnpm install
 *
 * Usage: Add to your project as .pnpmfile.cjs
 *   module.exports = require('package-age-guard/pnpm');
 *
 * Or use the setup command:
 *   npx package-age-guard --setup-pnpm
 */

const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

// Silence warnings in non-TTY environments (CI)
const isCI = process.env.CI || !process.stdout.isTTY;

const DEFAULT_MIN_AGE = 7;

/**
 * Load configuration from file
 */
function loadConfig(cwd = process.cwd()) {
  const configPaths = [
    path.join(cwd, '.package-age-guard.json'),
    path.join(cwd, 'package.json')
  ];

  for (const configPath of configPaths) {
    try {
      if (fs.existsSync(configPath)) {
        const content = fs.readFileSync(configPath, 'utf-8');
        const parsed = JSON.parse(content);
        
        if (configPath.endsWith('package.json')) {
          if (parsed['package-age-guard']) {
            return { ...getDefaultConfig(), ...parsed['package-age-guard'] };
          }
          continue;
        }
        
        return { ...getDefaultConfig(), ...parsed };
      }
    } catch (e) {
      // Continue to next
    }
  }

  return getDefaultConfig();
}

function getDefaultConfig() {
  return {
    minAge: DEFAULT_MIN_AGE,
    whitelist: [],
    ignorePatterns: ['*', 'latest', 'next', 'beta', 'alpha', 'rc', 'canary'],
    pnpmMode: 'warn' // 'warn', 'error', or 'allow'
  };
}

function isWhitelisted(name, version, whitelist = []) {
  return whitelist.includes(name) || whitelist.includes(`${name}@${version}`);
}

function shouldIgnoreVersion(version, patterns = []) {
  if (patterns.includes(version)) return true;
  if (version === '*') return true;
  if (version.includes('||') || version.includes(' - ')) return true;
  const preReleasePatterns = /^(latest|next|beta|alpha|rc|canary|dev|snapshot)/i;
  if (preReleasePatterns.test(version)) return true;
  return false;
}

function cleanVersion(version) {
  return version.replace(/^[\^~><=]+/, '').trim();
}

/**
 * Check package age via npm registry
 */
function getPackageAge(packageName, version) {
  try {
    const result = execSync(
      `npm view ${packageName} time --json 2>&1`,
      { encoding: 'utf-8', timeout: 10000 }
    ).trim();

    if (result.includes('npm error') || result.includes('E404')) {
      return { error: 'Not found', ageDays: 0 };
    }

    const times = JSON.parse(result);
    const versionTime = times[version];
    
    if (!versionTime) {
      return { error: 'Version not found', ageDays: 0 };
    }

    const published = new Date(versionTime);
    const now = new Date();
    const ageDays = (now - published) / (1000 * 60 * 60 * 24);

    return { ageDays, age: Math.floor(ageDays) };
  } catch (e) {
    return { error: e.message, ageDays: 0 };
  }
}

// Cache for package ages to avoid repeated npm calls
const ageCache = new Map();

/**
 * pnpm readPackage hook - called for each package
 */
function readPackage(pkg, context) {
  const config = loadConfig();
  
  // Skip if pnpm mode is 'allow' (disabled)
  if (config.pnpmMode === 'allow') {
    return pkg;
  }

  const name = pkg.name;
  const version = cleanVersion(pkg.version || '');

  // Skip if no version or should be ignored
  if (!version || shouldIgnoreVersion(version, config.ignorePatterns)) {
    return pkg;
  }

  // Skip if whitelisted
  if (isWhitelisted(name, version, config.whitelist)) {
    return pkg;
  }

  // Check cache first
  const cacheKey = `${name}@${version}`;
  let ageInfo = ageCache.get(cacheKey);

  if (!ageInfo) {
    ageInfo = getPackageAge(name, version);
    ageCache.set(cacheKey, ageInfo);
  }

  if (ageInfo.error) {
    // Could not check age, allow but warn (unless in CI)
    if (config.pnpmMode === 'warn' && !isCI) {
      console.warn(`⚠️  ${name}@${version} - Could not verify package age`);
    }
    return pkg;
  }

  if (ageInfo.ageDays < config.minAge) {
    const message = `❌ ${name}@${version} is only ${ageInfo.age} days old (minimum: ${config.minAge} days)`;
    
    if (config.pnpmMode === 'error') {
      throw new Error(`Package Age Guard: ${message}\n\nThis package is too new and may be a supply chain attack vector.\nTo override, add to whitelist or set pnpmMode to 'warn' in .package-age-guard.json`);
    } else {
      console.warn(`⚠️  ${message}`);
      console.warn(`   This package is newer than your security policy allows.`);
    }
  }

  return pkg;
}

/**
 * pnpm afterAllResolved hook - summary after install
 */
function afterAllResolved(lockfile, context) {
  const config = loadConfig();
  
  if (config.pnpmMode === 'allow') {
    return lockfile;
  }

  // Count violations from cache
  let violations = 0;
  for (const [key, ageInfo] of ageCache.entries()) {
    if (!ageInfo.error && ageInfo.ageDays < config.minAge) {
      violations++;
    }
  }

  if (violations > 0) {
    console.log(`\n📦 Package Age Guard: ${violations} package(s) are newer than ${config.minAge} days`);
    
    if (config.pnpmMode === 'warn') {
      console.log(`   Run 'npx package-age-guard --fix' to install safe versions\n`);
    }
  }

  // Clear cache for next run
  ageCache.clear();

  return lockfile;
}

module.exports = {
  readPackage,
  afterAllResolved,
  hooks: {
    readPackage,
    afterAllResolved
  }
};
