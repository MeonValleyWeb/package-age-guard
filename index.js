/**
 * Package Age Guard
 * Block npm packages that are too new - protect against supply chain attacks
 * 
 * @module package-age-guard
 */

import { readFile } from 'node:fs/promises';
import registry from './registry.cjs';
const { getTimes, isExactVersion, validateConfig } = registry;
import path from 'node:path';

const DEFAULT_MIN_AGE = 7;
const WARNING_AGE = 3;

/**
 * Configuration options
 * @typedef {Object} Config
 * @property {number} [minAge=7] - Minimum package age in days
 * @property {boolean} [productionOnly=false] - Check production deps only
 * @property {string[]} [whitelist=[]] - Packages to whitelist
 * @property {boolean} [failOnWarning=false] - Treat warnings as failures
 * @property {string[]} [ignorePatterns=['*', 'latest']] - Version patterns to skip
 */

/**
 * Check result for a single package
 * @typedef {Object} PackageResult
 * @property {string} name - Package name
 * @property {string} version - Package version
 * @property {number|null} age - Age in days (null if unknown)
 * @property {string|null} published - Publication date ISO string
 * @property {string} [error] - Error message if check failed
 * @property {boolean} [whitelisted] - Whether package was whitelisted
 * @property {string} status - 'pass', 'violation', 'warning', or 'error'
 */

/**
 * Overall check results
 * @typedef {Object} CheckResults
 * @property {PackageResult[]} passed - Packages that passed
 * @property {PackageResult[]} violations - Packages too new
 * @property {PackageResult[]} warnings - Packages recently published
 * @property {PackageResult[]} errors - Packages that couldn't be checked
 * @property {number} total - Total packages checked
 * @property {number} minAge - Minimum age threshold used
 * @property {string} checkedAt - ISO timestamp
 */

/**
 * Load configuration from file or return defaults
 * @param {string} [cwd=process.cwd()] - Working directory
 * @returns {Promise<Config>}
 */
export async function loadConfig(cwd = process.cwd(), configFile) {
  for (const configPath of configFile ? [configFile] : ['.package-age-guard.json', 'package.json']) {
    let content;
    try {
      content = await readFile(path.resolve(cwd, configPath), 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT' && !configFile) continue;
      throw error;
    }
    const parsed = JSON.parse(content);
    const value = configPath === 'package.json' ? parsed['package-age-guard'] : parsed;
    if (value === undefined) continue;
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Configuration must be an object');
    return validateConfig({ ...getDefaultConfig(), ...value });
  }
  return getDefaultConfig();
}

/**
 * Get default configuration
 * @returns {Config}
 */
export function getDefaultConfig() {
  return {
    minAge: DEFAULT_MIN_AGE,
    productionOnly: false,
    whitelist: [],
    failOnWarning: false,
    ignorePatterns: ['*', 'latest', 'next', 'beta', 'alpha', 'rc', 'canary']
  };
}

/**
 * Clean version string (remove prefixes)
 * @param {string} version - Raw version string
 * @returns {string}
 */
export function cleanVersion(version) {
  return version.replace(/^[\^~><=]+/, '').trim();
}

/**
 * Check if version should be ignored
 * @param {string} version - Cleaned version
 * @param {string[]} [patterns] - Patterns to check
 * @returns {boolean}
 */
export function shouldIgnoreVersion(version, patterns = []) {
  // If specific version is in the ignore list
  if (patterns.includes(version)) return true;
  
  // Check for actual wildcard character in version
  if (version === '*') return true;
  
  // Check for wildcard ranges
  if (version.includes('||') || version.includes(' - ')) return true;
  
  // Always ignore common pre-release tags for security
  // These are typically moving targets that can't be verified
  const preReleasePatterns = /^(latest|next|beta|alpha|rc|canary|dev|snapshot)/i;
  if (preReleasePatterns.test(version)) return true;
  
  return false;
}

/**
 * Check if package is whitelisted
 * @param {string} name - Package name
 * @param {string} version - Package version
 * @param {string[]} whitelist - Whitelist array
 * @returns {boolean}
 */
export function isWhitelisted(name, version, whitelist = []) {
  return whitelist.includes(name) || 
         whitelist.includes(`${name}@${version}`);
}

/**
 * Get safe version suggestion (latest version that meets age requirement)
 * @param {string} packageName - Package name
 * @param {number} minAge - Minimum age in days
 * @returns {Promise<{version: string, published: string, ageDays: number}|null>}
 */
export async function getSafeVersion(packageName, minAge = DEFAULT_MIN_AGE) {
  try {
    const times = getTimes(packageName);

    const now = new Date();
    const cutoff = new Date(now.getTime() - minAge * 24 * 60 * 60 * 1000);
    
    // Select the highest stable version meeting the age threshold.
    const validVersions = Object.entries(times)
      .filter(([version, date]) => {
        // Skip metadata fields
        if (version === 'modified' || version === 'created') return false;
        // Must be a valid version string (semver)
        if (!/^\d+\.\d+\.\d+$/.test(version)) return false;
        const publishDate = new Date(date);
        return publishDate <= cutoff;
      })
      .sort((a, b) => {
        const left = a[0].split('.').map(Number);
        const right = b[0].split('.').map(Number);
        return right[0] - left[0] || right[1] - left[1] || right[2] - left[2];
      });
    
    if (validVersions.length === 0) {
      return null;
    }
    
    const [version, published] = validVersions[0];
    const publishDate = new Date(published);
    const ageDays = (now - publishDate) / (1000 * 60 * 60 * 24);
    
    return {
      version,
      published: publishDate.toISOString(),
      ageDays: Math.floor(ageDays),
      originalVersion: true
    };
  } catch (e) {
    return null;
  }
}

/**
 * Get package age from npm registry
 * @param {string} packageName - Package name
 * @param {string} version - Package version
 * @returns {Promise<{ageDays: number, published: string}|{error: string, code: string}>}
 */
export async function getPackageAge(packageName, version) {
  try {
    if (!isExactVersion(version)) return { error: 'An exact version is required', code: 'INVALID_VERSION' };
    const times = getTimes(packageName);

    // Get the specific version's publish time
    const versionTime = times[version];
    if (!versionTime) {
      return { error: `Version ${version} not found in registry`, code: 'E404' };
    }

    // Check if result is a valid date
    const published = new Date(versionTime);
    if (isNaN(published.getTime())) {
      return { error: 'Invalid date from registry', code: 'INVALID_DATE' };
    }

    const now = new Date();
    const ageDays = (now - published) / (1000 * 60 * 60 * 24);

    return {
      ageDays,
      published: published.toISOString(),
      age: Math.floor(ageDays)
    };
  } catch (e) {
    const errorMsg = e.message || '';
    const stderr = e.stderr?.toString() || '';

    if (errorMsg.includes('404') || errorMsg.includes('E404') ||
        stderr.includes('404') || stderr.includes('No match found')) {
      return { error: 'Version not found in registry', code: 'E404' };
    }

    if (errorMsg.includes('ETIMEOUT') || errorMsg.includes('ECONNREFUSED')) {
      return { error: 'Registry unavailable', code: 'NETWORK_ERROR' };
    }

    return { error: errorMsg || 'Failed to check package age', code: 'ERROR' };
  }
}

/**
 * Read package.json from directory
 * @param {string} [cwd=process.cwd()] - Working directory
 * @returns {Promise<Object>}
 */
export async function readPackageJson(cwd = process.cwd()) {
  try {
    const content = await readFile(path.join(cwd, 'package.json'), 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    throw new Error(`Could not read package.json from ${cwd}: ${e.message}`);
  }
}

/**
 * Check all packages in a project
 * @param {Object} [options={}] - Options
 * @param {string} [options.cwd=process.cwd()] - Working directory
 * @param {Config} [options.config] - Configuration (loaded from file if not provided)
 * @param {boolean} [options.includeSuggestions=false] - Include safe version suggestions for violations
 * @returns {Promise<CheckResults>}
 */
export async function checkPackages(options = {}) {
  const cwd = options.cwd || process.cwd();
  const config = validateConfig({ ...getDefaultConfig(), ...(options.config || await loadConfig(cwd)) });
  const includeSuggestions = options.includeSuggestions || false;
  
  const pkg = await readPackageJson(cwd);
  const deps = { ...pkg.dependencies };
  
  if (!config.productionOnly) {
    for (const [name, version] of Object.entries(pkg.devDependencies || {})) {
      if (!(name in deps)) deps[name] = version;
    }
  }
  
  Object.assign(deps, pkg.optionalDependencies);
  let lock;
  try {
    lock = JSON.parse(await readFile(path.join(cwd, 'package-lock.json'), 'utf8'));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }

  const results = {
    passed: [],
    violations: [],
    warnings: [],
    errors: [],
    total: Object.keys(deps).length,
    minAge: config.minAge,
    checkedAt: new Date().toISOString()
  };
  
  for (const [name, version] of Object.entries(deps)) {
    const locked = lock?.packages?.[`node_modules/${name}`] || lock?.dependencies?.[name];
    const root = lock?.packages?.[''];
    const lockedSpec = root?.optionalDependencies?.[name] ?? root?.dependencies?.[name] ?? root?.devDependencies?.[name];
    const matchesLock = root ? lockedSpec === version : isExactVersion(version) && locked?.version === version;
    const registrySpec = typeof version === 'string' && !version.includes(':') && !version.includes('/');
    const cleanVer = registrySpec && !locked?.link && matchesLock && isExactVersion(locked?.version) ? locked.version : version;
    
    // Check whitelist
    if (isWhitelisted(name, cleanVer, config.whitelist)) {
      results.passed.push({
        name,
        version: cleanVer,
        age: null,
        published: null,
        status: 'pass',
        whitelisted: true
      });
      continue;
    }
    
    // Check if should be ignored
    if (shouldIgnoreVersion(cleanVer, config.ignorePatterns) || !isExactVersion(cleanVer)) {
      results.warnings.push({
        name,
        version: cleanVer,
        age: null,
        published: null,
        status: 'warning',
        reason: 'Unresolved version or range - use a matching npm package-lock.json or an exact version'
      });
      continue;
    }
    
    // Check age
    const age = await getPackageAge(name, cleanVer);
    
    if (age.error) {
      results.errors.push({
        name,
        version: cleanVer,
        age: null,
        published: null,
        status: 'error',
        error: age.error,
        code: age.code
      });
      continue;
    }
    
    const ageInt = Math.floor(age.ageDays);
    
    if (age.ageDays < config.minAge) {
      const violation = {
        name,
        version: cleanVer,
        age: ageInt,
        published: age.published,
        status: 'violation'
      };
      
      // Fetch safe version suggestion if requested
      if (includeSuggestions) {
        const safeVersion = await getSafeVersion(name, config.minAge);
        if (safeVersion) {
          violation.suggestion = safeVersion;
        }
      }
      
      results.violations.push(violation);
    } else if (age.ageDays < WARNING_AGE) {
      results.warnings.push({
        name,
        version: cleanVer,
        age: ageInt,
        published: age.published,
        status: 'warning'
      });
      results.passed.push({
        name,
        version: cleanVer,
        age: ageInt,
        published: age.published,
        status: 'pass'
      });
    } else {
      results.passed.push({
        name,
        version: cleanVer,
        age: ageInt,
        published: age.published,
        status: 'pass'
      });
    }
  }
  
  return results;
}

/**
 * Check if results have violations
 * @param {CheckResults} results 
 * @returns {boolean}
 */
export function hasViolations(results) {
  return results.violations.length > 0;
}

/**
 * Check if results should fail (violations or warnings in strict mode)
 * @param {CheckResults} results 
 * @param {Config} config 
 * @returns {boolean}
 */
export function shouldFail(results, config) {
  if (results.errors.length > 0 || hasViolations(results)) return true;
  if (config.failOnWarning && results.warnings.length > 0) return true;
  return false;
}

/**
 * Format results as human-readable text
 * @param {CheckResults} results 
 * @returns {string}
 */
export function formatResults(results) {
  let output = `\n📦 Package Age Guard Results\n`;
  output += `   Checked ${results.total} packages (min age: ${results.minAge} days)\n\n`;
  
  results.passed.forEach(p => {
    if (p.whitelisted) {
      output += `   ⏭️  ${p.name}@${p.version} - Whitelisted\n`;
    } else {
      output += `   ✅ ${p.name}@${p.version} - ${p.age} days old\n`;
    }
  });
  
  results.warnings.forEach(w => {
    if (w.reason) {
      output += `   ⚠️  ${w.name}@${w.version} - ${w.reason}\n`;
    } else {
      output += `   ⚠️  ${w.name}@${w.version} - ${w.age} days old (recent)\n`;
    }
  });
  
  results.violations.forEach(v => {
    output += `   ❌ ${v.name}@${v.version} - Only ${v.age} days old\n`;
    if (v.suggestion) {
      output += `      💡 Suggested: ${v.name}@${v.suggestion.version} (${v.suggestion.ageDays} days old)\n`;
      output += `         Install: npm install ${v.name}@${v.suggestion.version}\n`;
    }
  });

  results.errors.forEach(e => {
    output += `   💥 ${e.name}@${e.version} - ${e.error}\n`;
  });

  output += `\n📊 Summary: ${results.passed.length} passed, ${results.violations.length} violations, ${results.warnings.length} warnings, ${results.errors.length} errors\n`;

  if (results.violations.length > 0) {
    output += `\n🔒 Security Policy Violation\n`;
    output += `   ${results.violations.length} package(s) are newer than ${results.minAge} days.\n`;
    output += `   These may be supply chain attack vectors.\n\n`;
    output += `   Options:\n`;
    output += `   1. Wait for packages to age\n`;
    output += `   2. Use older versions (see suggestions above)\n`;
    output += `   3. Install all suggested: npx package-age-guard --fix\n`;
    output += `   4. Add to whitelist in .package-age-guard.json\n`;
  }
  
  return output;
}

/**
 * Format results as JSON
 * @param {CheckResults} results 
 * @returns {string}
 */
export function formatResultsJson(results) {
  return JSON.stringify(results, null, 2);
}

// Default export
export default {
  checkPackages,
  loadConfig,
  getDefaultConfig,
  getPackageAge,
  getSafeVersion,
  cleanVersion,
  shouldIgnoreVersion,
  isWhitelisted,
  hasViolations,
  shouldFail,
  formatResults,
  formatResultsJson,
  readPackageJson
};
