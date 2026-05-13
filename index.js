/**
 * Package Age Guard
 * Block npm packages that are too new - protect against supply chain attacks
 * 
 * @module package-age-guard
 * @version 1.0.0
 */

import { readFile, access } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
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
export async function loadConfig(cwd = process.cwd()) {
  const configPaths = [
    '.package-age-guard.json',
    '.package-age-guard.js',
    'package-age-guard.config.js',
    'package.json'
  ];
  
  for (const configPath of configPaths) {
    const fullPath = path.join(cwd, configPath);
    
    try {
      await access(fullPath);
      
      if (configPath.endsWith('.json')) {
        const content = await readFile(fullPath, 'utf-8');
        const parsed = JSON.parse(content);
        
        // Handle package.json specially
        if (configPath === 'package.json') {
          if (parsed['package-age-guard']) {
            return { ...getDefaultConfig(), ...parsed['package-age-guard'] };
          }
          continue;
        }
        
        return { ...getDefaultConfig(), ...parsed };
      }
      
      // For JS configs, we'd need dynamic import
      // This is a simplified version
    } catch (e) {
      // File doesn't exist or can't be read, continue to next
    }
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
export function shouldIgnoreVersion(version, patterns = ['*']) {
  if (patterns.includes('*')) return true;
  if (patterns.includes(version)) return true;
  
  // Check for wildcard ranges
  if (version.includes('||') || version.includes(' - ')) return true;
  
  // Check for common pre-release patterns
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
 * Get package age from npm registry
 * @param {string} packageName - Package name
 * @param {string} version - Package version
 * @returns {Promise<{ageDays: number, published: string}|{error: string, code: string}>}
 */
export async function getPackageAge(packageName, version) {
  try {
    const result = execSync(
      `npm view ${packageName}@${version} time.modified 2>&1`,
      { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] }
    ).trim();
    
    // Check for error output
    if (result.includes('npm error') || result.includes('E404') || result.includes('No match found')) {
      return { error: `Version ${version} not found in registry`, code: 'E404' };
    }
    
    // Check if result is a valid date
    const published = new Date(result);
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
 * @returns {Promise<CheckResults>}
 */
export async function checkPackages(options = {}) {
  const cwd = options.cwd || process.cwd();
  const config = options.config || await loadConfig(cwd);
  
  const pkg = await readPackageJson(cwd);
  const deps = { ...pkg.dependencies };
  
  if (!config.productionOnly) {
    Object.assign(deps, pkg.devDependencies);
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
    const cleanVer = cleanVersion(version);
    
    // Check if should be ignored
    if (shouldIgnoreVersion(cleanVer, config.ignorePatterns)) {
      results.warnings.push({
        name,
        version: cleanVer,
        age: null,
        published: null,
        status: 'warning',
        reason: 'Wildcard/range - cannot determine age'
      });
      continue;
    }
    
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
      results.violations.push({
        name,
        version: cleanVer,
        age: ageInt,
        published: age.published,
        status: 'violation'
      });
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
  if (hasViolations(results)) return true;
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
    output += `   2. Use older versions: npm install package@1.2.3\n`;
    output += `   3. Add to whitelist in .package-age-guard.json\n`;
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
  cleanVersion,
  shouldIgnoreVersion,
  isWhitelisted,
  hasViolations,
  shouldFail,
  formatResults,
  formatResultsJson,
  readPackageJson
};
