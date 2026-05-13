#!/usr/bin/env node

/**
 * Package Age Guard CLI
 * Block npm packages that are too new - protect against supply chain attacks
 * 
 * @version 1.1.0
 */

import { 
  checkPackages, 
  loadConfig, 
  formatResults, 
  formatResultsJson,
  hasViolations,
  shouldFail,
  getDefaultConfig 
} from '../index.js';

import { writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';

const DEFAULT_MIN_AGE = 7;
const PACKAGE_VERSION = '1.1.0';

// Parse arguments
const args = process.argv.slice(2);
const options = {
  minAge: parseInt(args.find(a => a.startsWith('--min='))?.split('=')[1]),
  production: args.includes('--production'),
  json: args.includes('--json'),
  strict: args.includes('--strict'),
  quiet: args.includes('--quiet') || args.includes('-q'),
  help: args.includes('--help') || args.includes('-h'),
  version: args.includes('--version') || args.includes('-v'),
  init: args.includes('--init'),
  verbose: args.includes('--verbose') || args.includes('-V')
};

function showHelp() {
  console.log(`
📦 Package Age Guard v${PACKAGE_VERSION}
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

Configuration File:
  Create .package-age-guard.json in your project root:
  {
    "minAge": 30,
    "productionOnly": false,
    "whitelist": ["my-internal-package"],
    "failOnWarning": false
  }

Examples:
  npx package-age-guard                    # Check all packages (7+ days)
  npx package-age-guard --min=30          # Require 30+ days old
  npx package-age-guard --production     # Production deps only
  npx package-age-guard --json           # CI mode
  npx package-age-guard --init           # Create config file

Exit codes:
  0  All packages meet age requirements
  1  One or more packages are too new (or warnings in strict mode)
  2  Configuration or system error

For more info: https://github.com/MeonValleyWeb/package-age-guard
`);
}

function showVersion() {
  console.log(`package-age-guard v${PACKAGE_VERSION}`);
}

async function createConfigFile() {
  const configPath = '.package-age-guard.json';
  
  if (existsSync(configPath)) {
    console.log(`⚠️  ${configPath} already exists`);
    return;
  }
  
  const config = getDefaultConfig();
  
  await writeFile(configPath, JSON.stringify(config, null, 2));
  console.log(`✅ Created ${configPath}`);
  console.log(`   Edit this file to customize package age rules`);
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
  
  if (options.init) {
    await createConfigFile();
    process.exit(0);
  }
  
  try {
    // Load config from file
    const fileConfig = await loadConfig();
    
    // Override with CLI options
    const config = {
      ...fileConfig,
      ...(options.minAge && { minAge: options.minAge }),
      ...(options.production && { productionOnly: true }),
      ...(options.strict && { failOnWarning: true })
    };
    
    if (!options.quiet && !options.json) {
      console.log(`\n📦 Package Age Guard`);
      if (options.verbose) {
        console.log(`   Config: minAge=${config.minAge}d, productionOnly=${config.productionOnly}, whitelist=[${config.whitelist.length}]`);
      }
    }
    
    const results = await checkPackages({ config });
    
    if (options.json) {
      console.log(formatResultsJson(results));
    } else if (!options.quiet) {
      console.log(formatResults(results));
    } else {
      // Quiet mode - only show violations and errors
      if (results.violations.length > 0) {
        console.log(`❌ ${results.violations.length} package(s) too new`);
        results.violations.forEach(v => {
          console.log(`   ${v.name}@${v.version} - ${v.age} days`);
        });
      }
      if (results.errors.length > 0) {
        console.log(`💥 ${results.errors.length} error(s)`);
      }
    }
    
    const exitCode = shouldFail(results, config) ? 1 : 0;
    process.exit(exitCode);
    
  } catch (error) {
    console.error(`\n❌ Error: ${error.message}\n`);
    if (options.verbose) {
      console.error(error.stack);
    }
    process.exit(2);
  }
}

main();
