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
  getDefaultConfig,
  getSafeVersion
} from '../index.js';

import { writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

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
  verbose: args.includes('--verbose') || args.includes('-V'),
  suggest: args.includes('--suggest') || args.includes('-s'),
  fix: args.includes('--fix') || args.includes('-f'),
  interactive: args.includes('--interactive') || args.includes('-i'),
  dryRun: args.includes('--dry-run'),
  setupPnpm: args.includes('--setup-pnpm')
};

function showHelp() {
  console.log(`
📦 Package Age Guard v${PACKAGE_VERSION}
   Block npm packages that are too new - protect against supply chain attacks

Usage: npx package-age-guard [options]

Options:
  --min=<days>         Minimum package age (default: 7)
  --production         Check production dependencies only
  --json               Output results as JSON
  --strict             Exit with error on warnings too
  --quiet, -q          Minimal output
  --verbose, -V        Show detailed output
  --suggest, -s        Show safe version suggestions for violations
  --fix, -f            Auto-install suggested safe versions
  --interactive, -i    Interactive mode to choose fixes
  --dry-run            Show what would be done (with --fix)
  --setup-pnpm         Setup pnpm hooks for automatic protection
  --init               Create .package-age-guard.json config file
  --help, -h           Show this help
  --version, -v        Show version

Configuration File:
  Create .package-age-guard.json in your project root:
  {
    "minAge": 30,
    "productionOnly": false,
    "whitelist": ["my-internal-package"],
    "failOnWarning": false,
    "pnpmMode": "warn"
  }

Examples:
  npx package-age-guard                       # Check all packages (7+ days)
  npx package-age-guard --min=30             # Require 30+ days old
  npx package-age-guard --production         # Production deps only
  npx package-age-guard --suggest            # Show safe alternatives
  npx package-age-guard --fix                # Auto-fix violations
  npx package-age-guard --interactive        # Guided resolution
  npx package-age-guard --json               # CI mode
  npx package-age-guard --init               # Create config file
  npx package-age-guard --setup-pnpm         # Setup pnpm hooks

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

/**
 * Setup pnpm hooks for automatic protection during install
 */
async function setupPnpmHooks() {
  const pnpmfilePath = '.pnpmfile.cjs';

  if (existsSync(pnpmfilePath)) {
    console.log(`⚠️  ${pnpmfilePath} already exists`);
    console.log(`   Add this to your ${pnpmfilePath}:`);
    console.log(`   module.exports = require('package-age-guard/pnpm');`);
    return;
  }

  const pnpmfileContent = `/**
 * Package Age Guard - pnpm hook
 * Automatically checks package ages during pnpm install
 * 
 * Make sure package-age-guard is installed:
 *   npm install -D package-age-guard
 *   # or
 *   pnpm add -D package-age-guard
 */

try {
  module.exports = require('package-age-guard/pnpm');
} catch (e) {
  // Fallback: package-age-guard not installed, skip hook
  console.warn('⚠️  Package Age Guard not installed. Run: pnpm add -D package-age-guard');
  module.exports = {};
}
`;

  try {
    await writeFile(pnpmfilePath, pnpmfileContent);
    console.log(`✅ Created ${pnpmfilePath}`);
    console.log(`   pnpm will now check package ages during install`);

    // Update or create config with pnpmMode
    const configPath = '.package-age-guard.json';
    let config = getDefaultConfig();

    if (existsSync(configPath)) {
      const content = await readFile(configPath, 'utf-8');
      config = { ...config, ...JSON.parse(content) };
    }

    // Add pnpmMode if not present
    if (!config.pnpmMode) {
      config.pnpmMode = 'warn';
    }

    await writeFile(configPath, JSON.stringify(config, null, 2));
    console.log(`\n📋 Configuration:`);
    console.log(`   pnpmMode: "${config.pnpmMode}"`);
    console.log(`\n   Options:`);
    console.log(`   - "warn": Warn about unsafe packages but allow install (default)`);
    console.log(`   - "error": Block install of unsafe packages`);
    console.log(`   - "allow": Disable pnpm hooks`);
    console.log(`\n   Change pnpmMode in ${configPath}`);

  } catch (e) {
    console.error(`❌ Error creating ${pnpmfilePath}: ${e.message}`);
    process.exit(2);
  }
}

/**
 * Auto-fix violations by installing safe versions
 * @param {Array} violations - Violations array from check results
 * @param {Object} config - Configuration object
 * @param {boolean} dryRun - If true, only show what would be done
 */
async function fixViolations(violations, config, dryRun = false) {
  if (violations.length === 0) {
    console.log('\n✅ No violations to fix');
    return;
  }

  console.log(`\n🔧 ${dryRun ? 'Would fix' : 'Fixing'} ${violations.length} violation(s):\n`);

  let fixed = 0;
  let failed = 0;

  for (const violation of violations) {
    // Get safe version suggestion
    const suggestion = await getSafeVersion(violation.name, config.minAge);

    if (!suggestion) {
      console.log(`   ⚠️  ${violation.name}@${violation.version} - No safe version found`);
      failed++;
      continue;
    }

    console.log(`   ${dryRun ? '📋' : '🔄'} ${violation.name}: ${violation.version} → ${suggestion.version}`);

    if (dryRun) {
      console.log(`      Command: npm install ${violation.name}@${suggestion.version}`);
      continue;
    }

    try {
      execSync(`npm install ${violation.name}@${suggestion.version}`, {
        stdio: 'inherit',
        timeout: 60000
      });
      console.log(`   ✅ Fixed ${violation.name}@${suggestion.version}`);
      fixed++;
    } catch (e) {
      console.log(`   ❌ Failed to fix ${violation.name}: ${e.message}`);
      failed++;
    }
  }

  if (!dryRun) {
    console.log(`\n📊 Fixed ${fixed} package(s), ${failed} failed`);
  } else {
    console.log(`\n📊 Would fix ${violations.length} package(s) (dry run)`);
  }
}

/**
 * Interactive mode - guide user through fixing violations
 * @param {Array} violations - Violations array
 * @param {Object} config - Configuration
 */
async function interactiveMode(violations, config) {
  if (violations.length === 0) {
    console.log('\n✅ No violations to resolve');
    return;
  }

  const readline = await import('node:readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  const question = (prompt) => new Promise((resolve) => {
    rl.question(prompt, resolve);
  });

  console.log(`\n🎮 Interactive Mode - ${violations.length} violation(s) to resolve\n`);

  for (const violation of violations) {
    console.log(`\n❌ ${violation.name}@${violation.version} - Only ${violation.age} days old`);

    // Get safe version suggestion
    const suggestion = await getSafeVersion(violation.name, config.minAge);

    if (suggestion) {
      console.log(`   💡 Suggested: ${suggestion.version} (${suggestion.ageDays} days old)`);
    }

    const choices = [];
    choices.push('s - Skip (do nothing)');
    if (suggestion) {
      choices.push(`i - Install suggested version (${suggestion.version})`);
    }
    choices.push('w - Add to whitelist (this package)');
    choices.push('W - Add to whitelist (name@version)');
    choices.push('q - Quit interactive mode');

    console.log('\n   Options:');
    choices.forEach(c => console.log(`      ${c}`));

    const answer = await question('\n   Your choice [s/i/w/W/q]: ');

    switch (answer.trim().toLowerCase()) {
      case 'i':
        if (suggestion) {
          try {
            console.log(`   🔄 Installing ${violation.name}@${suggestion.version}...`);
            execSync(`npm install ${violation.name}@${suggestion.version}`, {
              stdio: 'inherit',
              timeout: 60000
            });
            console.log(`   ✅ Installed successfully`);
          } catch (e) {
            console.log(`   ❌ Installation failed: ${e.message}`);
          }
        }
        break;

      case 'w':
        await addToWhitelist(violation.name, config);
        console.log(`   ⏭️  Added ${violation.name} to whitelist`);
        break;

      case 'W':
        await addToWhitelist(`${violation.name}@${violation.version}`, config);
        console.log(`   ⏭️  Added ${violation.name}@${violation.version} to whitelist`);
        break;

      case 'q':
        console.log('\n👋 Exiting interactive mode');
        rl.close();
        return;

      case 's':
      default:
        console.log(`   ⏭️  Skipped ${violation.name}`);
    }
  }

  rl.close();
  console.log('\n✅ Interactive mode complete');
}

/**
 * Add a package to the whitelist
 * @param {string} entry - Package name or name@version
 * @param {Object} config - Current config
 */
async function addToWhitelist(entry, config) {
  const configPath = '.package-age-guard.json';

  try {
    let currentConfig;

    if (existsSync(configPath)) {
      const content = await readFile(configPath, 'utf-8');
      currentConfig = JSON.parse(content);
    } else {
      currentConfig = getDefaultConfig();
    }

    if (!currentConfig.whitelist) {
      currentConfig.whitelist = [];
    }

    if (!currentConfig.whitelist.includes(entry)) {
      currentConfig.whitelist.push(entry);
    }

    await writeFile(configPath, JSON.stringify(currentConfig, null, 2));
  } catch (e) {
    console.error(`   ⚠️  Could not update whitelist: ${e.message}`);
  }
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

  if (options.setupPnpm) {
    await setupPnpmHooks();
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

    if (!options.quiet && !options.json && !options.fix && !options.interactive) {
      console.log(`\n📦 Package Age Guard`);
      if (options.verbose) {
        console.log(`   Config: minAge=${config.minAge}d, productionOnly=${config.productionOnly}, whitelist=[${config.whitelist.length}]`);
      }
    }

    // Check packages with suggestions if needed
    const results = await checkPackages({
      config,
      includeSuggestions: options.suggest || options.fix || options.interactive
    });

    // Handle interactive mode
    if (options.interactive) {
      await interactiveMode(results.violations, config);
      return;
    }

    // Handle fix mode
    if (options.fix) {
      if (results.violations.length > 0) {
        await fixViolations(results.violations, config, options.dryRun);
      } else {
        console.log('\n✅ No violations to fix');
      }

      // Don't exit with error when fixing
      process.exit(0);
    }

    // Output results
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
