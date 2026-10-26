import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

try {
  const { checkPackages, loadConfig, formatResults, shouldFail } = await import(
    pathToFileURL(path.resolve(process.env.PAG_ACTION_PATH, '../../../index.js')).href
  );
  const config = await loadConfig(process.cwd(), process.env.PAG_CONFIG || undefined);
  config.minAge = Number(process.env.PAG_MIN_AGE || NaN);
  if (process.env.PAG_PRODUCTION === 'true') config.productionOnly = true;
  if (process.env.PAG_STRICT === 'true') config.failOnWarning = true;
  const results = await checkPackages({ config, includeSuggestions: process.env.PAG_SUGGEST === 'true' });
  const output = {
    violations: results.violations.length,
    warnings: results.warnings.length,
    passed: results.passed.length,
    total: results.total,
    'has-violations': results.violations.length > 0,
    'results-json': JSON.stringify(results)
  };
  appendFileSync(process.env.GITHUB_OUTPUT, Object.entries(output).map(([key, value]) => `${key}=${value}\n`).join(''));
  console.log(process.env.PAG_JSON === 'true' ? JSON.stringify(results, null, 2) : formatResults(results));
  process.exitCode = results.errors.length ? 2 : shouldFail(results, config) ? 1 : 0;
} catch (error) {
  console.error(`Package Age Guard: ${error.message}`);
  process.exitCode = 2;
}
