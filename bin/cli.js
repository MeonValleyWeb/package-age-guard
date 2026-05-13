#!/usr/bin/env node

/**
 * Package Age Guard CLI
 * Block npm packages that are too new - protect against supply chain attacks
 */

import { readFile } from 'node:fs/promises';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const DEFAULT_MIN_AGE = 7; // Changed to 7 days as user requested
const WARNING_AGE = 3;

const args = process.argv.slice(2);
const options = {
  minAge: parseInt(args.find(a => a.startsWith('--min='))?.split('=')[1]) || DEFAULT_MIN_AGE,
  production: args.includes('--production'),
  json: args.includes('--json'),
  strict: args.includes('--strict'),
  quiet: args.includes('--quiet') || args.includes('-q'),
  help: args.includes('--help') || args.includes('-h'),
  version: args.includes('--version') || args.includes('-v')
};

function showHelp() {
  console.log(`
Package Age Guard - Protect against supply chain attacks

Usage: npx package-age-guard [options]

Options:
  --min=<days>      Minimum package age (default: 7)
  --production      Production deps only
  --json            Output as JSON
  --strict          Exit error on warnings
  --quiet, -q       Minimal output
  --help, -h        Show help
  --version, -v     Show version

Examples:
  npx package-age-guard              # Check all packages
  npx package-age-guard --min=30     # Require 30+ days
  npx package-age-guard --production # Prod deps only
`);
}

function showVersion() {
  console.log('package-age-guard v1.0.0');
}

async function getPackageJson() {
  try {
    const content = await readFile('package.json', 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    throw new Error('Could not read package.json');
  }
}

async function getPackageAge(packageName, version) {
  try {
    const result = execSync(
      `npm view \${packageName}@\${version} time.modified 2>&1`,
      { encoding: 'utf-8', timeout: 10000 }
    ).trim();
    
    if (result.includes('error') || result.includes('E404') || result.includes('npm error')) {
      return { error: 'Version not found', code: 'E404' };
    }
    
    const published = new Date(result);
    const now = new Date();
    const ageDays = (now - published) / (1000 * 60 * 60 * 24);
    
    return { ageDays, published: result };
  } catch (e) {
    return { error: 'Could not check age', code: 'ERROR' };
  }
}

function cleanVersion(version) {
  return version.replace(/^[\\^~><=]+/, '').trim();
}

async function checkPackages(pkg) {
  const deps = { ...pkg.dependencies };
  if (!options.production) {
    Object.assign(deps, pkg.devDependencies);
  }
  
  const results = {
    passed: [],
    violations: [],
    warnings: [],
    errors: [],
    total: Object.keys(deps).length,
    minAge: options.minAge
  };
  
  for (const [name, version] of Object.entries(deps)) {
    const cleanVer = cleanVersion(version);
    
    if (cleanVer === '*' || cleanVer.includes('||')) {
      results.warnings.push({ name, version: cleanVer, reason: 'Cannot check wildcard' });
      continue;
    }
    
    const age = await getPackageAge(name, cleanVer);
    
    if (age.error) {
      results.errors.push({ name, version: cleanVer, reason: age.error });
      continue;
    }
    
    const ageInt = Math.floor(age.ageDays);
    
    if (age.ageDays < options.minAge) {
      results.violations.push({
        name,
        version: cleanVer,
        age: ageInt,
        published: age.published
      });
    } else if (age.ageDays < WARNING_AGE) {
      results.warnings.push({ name, version: cleanVer, age: ageInt });
    } else {
      results.passed.push({ name, version: cleanVer, age: ageInt });
    }
  }
  
  return results;
}

async function main() {
  if (options.help) {
    showHelp();
    process.exit(0);
  }
  
  if (options.version) {
    showVersion();
    process.exit(0);
  }
  
  try {
    const pkg = await getPackageJson();
    const results = await checkPackages(pkg);
    
    if (options.json) {
      console.log(JSON.stringify(results, null, 2));
    } else {
      console.log(`\n🔍 Checked \${results.total} packages (min: \${results.minAge} days)\n`);
      
      results.passed.forEach(p => {
        console.log(`   ✅ \${p.name}@\${p.version} - \${p.age} days`);
      });
      
      results.violations.forEach(v => {
        console.log(`   ❌ \${v.name}@\${v.version} - Only \${v.age} days old`);
      });
      
      results.warnings.forEach(w => {
        console.log(`   ⚠️  \${w.name}@\${w.version} - \${w.age} days`);
      });
      
      results.errors.forEach(e => {
        console.log(`   💥 \${e.name}@\${e.version} - \${e.reason}`);
      });
      
      console.log(`\n📊 \${results.passed.length} passed, \${results.violations.length} violations, \${results.warnings.length} warnings, \${results.errors.length} errors\n`);
      
      if (results.violations.length > 0) {
        console.log('🔒 Packages too new - potential supply chain risk\n');
      }
    }
    
    process.exit(results.violations.length > 0 ? 1 : 0);
    
  } catch (error) {
    console.error(`\n❌ \${error.message}\n`);
    process.exit(2);
  }
}

main();
