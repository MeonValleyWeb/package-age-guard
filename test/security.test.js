import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { checkPackages, getPackageAge, getSafeVersion, loadConfig, shouldFail } from '../index.js';
import registry from '../registry.cjs';

const root = path.resolve(new URL('..', import.meta.url).pathname);
const temp = mkdtempSync(path.join(tmpdir(), 'pag-security-'));
const originalPath = process.env.PATH;
const old = new Date(Date.now() - 100 * 86400000).toISOString();
const fresh = new Date(Date.now() - 86400000).toISOString();
const calls = path.join(temp, 'calls.jsonl');
function project(pkg, config) {
  writeFileSync(path.join(temp, 'package.json'), JSON.stringify(pkg));
  if (config) writeFileSync(path.join(temp, '.package-age-guard.json'), JSON.stringify(config));
}
function cli(...args) {
  return spawnSync(process.execPath, [path.join(root, 'bin/cli.js'), ...args], { cwd: temp, encoding: 'utf8' });
}
function action(overrides = {}) {
  const output = path.join(temp, 'output');
  writeFileSync(output, '');
  const result = spawnSync(process.execPath, [path.join(root, '.github/actions/check-packages/run.mjs')], {
    cwd: temp, encoding: 'utf8', env: { ...process.env, PAG_ACTION_PATH: path.join(root, '.github/actions/check-packages'), PAG_MIN_AGE: '7', PAG_JSON: 'true', PAG_SUGGEST: 'false', GITHUB_OUTPUT: output, ...overrides }
  });
  return { ...result, output: readFileSync(output, 'utf8') };
}

before(() => {
  writeFileSync(path.join(temp, 'npm'), `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2);
fs.appendFileSync(process.env.PAG_TEST_CALLS, JSON.stringify(args)+'\\n');
if (process.env.PAG_TEST_FAIL === '1') { console.error('registry unavailable'); process.exit(1); }
if (args[0] === 'view') console.log(process.env.PAG_TEST_TIMES);
`, { mode: 0o755 });
  process.env.PATH = `${temp}${path.delimiter}${originalPath}`;
  process.env.PAG_TEST_CALLS = calls;
});
after(() => {
  process.env.PATH = originalPath;
  for (const key of ['PAG_TEST_CALLS', 'PAG_TEST_TIMES', 'PAG_TEST_FAIL']) delete process.env[key];
  rmSync(temp, { recursive: true, force: true });
});
beforeEach(() => {
  for (const file of ['package-lock.json', '.package-age-guard.json']) rmSync(path.join(temp, file), { force: true });
  project({ dependencies: { example: '1.0.0' } });
  process.env.PAG_TEST_TIMES = JSON.stringify({ '1.0.0': old, '1.1.0': fresh, '2.0.0': fresh });
  delete process.env.PAG_TEST_FAIL;
  writeFileSync(calls, '');
});

describe('registry safety', () => {
  it('rejects shell syntax without executing it', async () => {
    const marker = path.join(temp, 'injected');
    const result = await getPackageAge(`example; touch ${marker}`, '1.0.0');
    assert.ok(result.error);
    assert.equal(await getSafeVersion(`example; touch ${marker}`), null);
    assert.equal(existsSync(marker), false);
    assert.equal(readFileSync(calls, 'utf8'), '');
  });
  it('passes scoped names as a single argument', async () => {
    assert.equal((await getPackageAge('@scope/example', '1.0.0')).age, 100);
    assert.deepEqual(JSON.parse(readFileSync(calls, 'utf8').trim()), ['view', '@scope/example', 'time', '--json']);
  });
  it('suggests highest stable version rather than a newer backport or prerelease', async () => {
    process.env.PAG_TEST_TIMES = JSON.stringify({ '2.0.0': old, '1.9.9': new Date(Date.now() - 30 * 86400000), '3.0.0-beta.1': old });
    assert.equal((await getSafeVersion('example')).version, '2.0.0');
  });
  it('rejects invalid registry dates', async () => {
    process.env.PAG_TEST_TIMES = '{"1.0.0":"invalid"}';
    assert.equal((await getPackageAge('example', '1.0.0')).code, 'INVALID_DATE');
  });
  it('installs exact versions without scripts and preserves dev dependencies', () => {
    registry.installPackage('example', '1.0.0', true);
    assert.deepEqual(JSON.parse(readFileSync(calls, 'utf8').trim()), ['install', '--ignore-scripts', '--save-exact', '--save-dev', 'example@1.0.0']);
  });
});

describe('policy enforcement', () => {
  it('checks the actual locked version of a dependency range', async () => {
    project({ dependencies: { example: '^1.0.0' } });
    writeFileSync(path.join(temp, 'package-lock.json'), JSON.stringify({ packages: { '': { dependencies: { example: '^1.0.0' } }, 'node_modules/example': { version: '1.1.0' } } }));
    const result = await checkPackages({ cwd: temp });
    assert.equal(result.violations[0].version, '1.1.0');
  });
  it('warns for unresolved ranges instead of checking their lower bound', async () => {
    project({ dependencies: { example: '^1.0.0' } });
    assert.equal((await checkPackages({ cwd: temp })).warnings.length, 1);
    assert.equal(readFileSync(calls, 'utf8'), '');
  });
  it('does not treat local lockfile packages as registry dependencies', async () => {
    project({ dependencies: { example: 'file:../example' } });
    writeFileSync(path.join(temp, 'package-lock.json'), JSON.stringify({ packages: { '': { dependencies: { example: 'file:../example' } }, 'node_modules/example': { version: '1.0.0' } } }));
    assert.equal((await checkPackages({ cwd: temp })).warnings.length, 1);
  });
  it('includes compliant suggestions for actual violations', async () => {
    project({ dependencies: { example: '2.0.0' } });
    const result = await checkPackages({ cwd: temp, includeSuggestions: true });
    assert.equal(result.violations[0].suggestion.version, '1.0.0');
  });
  it('does not trust a stale lockfile', async () => {
    project({ dependencies: { example: '^2.0.0' } });
    writeFileSync(path.join(temp, 'package-lock.json'), JSON.stringify({ packages: { '': { dependencies: { example: '^1.0.0' } }, 'node_modules/example': { version: '1.0.0' } } }));
    assert.equal((await checkPackages({ cwd: temp })).warnings.length, 1);
  });
  it('includes optional production dependencies and merges partial config', async () => {
    project({ optionalDependencies: { example: '2.0.0' } });
    assert.equal((await checkPackages({ cwd: temp, config: { minAge: 7, productionOnly: true } })).violations.length, 1);
  });
  it('fails closed on registry errors', async () => {
    process.env.PAG_TEST_FAIL = '1';
    const result = await checkPackages({ cwd: temp });
    assert.equal(result.errors.length, 1);
    assert.equal(shouldFail(result, {}), true);
    assert.equal(cli('--json').status, 2);
    assert.equal(cli('--fix').status, 2);
  });
  it('rejects malformed policy files', async () => {
    writeFileSync(path.join(temp, '.package-age-guard.json'), '{');
    await assert.rejects(loadConfig(temp));
    assert.equal(cli().status, 2);
  });
  it('rejects invalid ages but accepts --min=0', () => {
    project({ dependencies: { example: '2.0.0' } });
    for (const age of ['-1', 'NaN', 'Infinity', '7oops', '']) assert.equal(cli(`--min=${age}`).status, 2);
    assert.equal(cli('--min=0').status, 0);
  });
  it('returns failure for dry runs with outstanding violations', () => {
    project({ dependencies: { example: '2.0.0' } });
    assert.equal(cli('--fix', '--dry-run').status, 1);
  });
  it('reads custom configuration paths', () => {
    project({ dependencies: { example: '2.0.0' } });
    writeFileSync(path.join(temp, 'custom.json'), '{"minAge":0}');
    assert.equal(cli('--config=custom.json').status, 0);
  });
});

describe('pnpm hook', () => {
  it('is exported as CommonJS and blocks unverified packages in error mode', () => {
    const pnpm = createRequire(import.meta.url)('package-age-guard/pnpm');
    project({}, { minAge: 7, pnpmMode: 'error' });
    const cwd = process.cwd();
    try {
      process.chdir(temp);
      assert.throws(() => pnpm.hooks.readPackage({ name: 'example', version: '2.0.0' }), /too new/);
      process.env.PAG_TEST_FAIL = '1';
      assert.throws(() => pnpm.hooks.readPackage({ name: 'other', version: '1.0.0' }), /Could not verify/);
      pnpm.hooks.afterAllResolved({});
    } finally { process.chdir(cwd); }
  });
});

describe('GitHub Action', () => {
  it('sets counts and compact JSON outputs on success', () => {
    const result = action();
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.output, /passed=1\n/);
    assert.match(result.output, /total=1\n/);
    assert.match(result.output, /has-violations=false\n/);
    assert.doesNotThrow(() => JSON.parse(result.output.split('\n').find(line => line.startsWith('results-json=')).slice(13)));
  });
  it('fails on violations in JSON mode without strict mode', () => {
    project({ dependencies: { example: '2.0.0' } });
    const result = action();
    assert.equal(result.status, 1, result.stderr);
    assert.match(result.output, /violations=1\n/);
    assert.match(result.output, /has-violations=true\n/);
  });
  it('fails on registry errors and supports custom config', () => {
    process.env.PAG_TEST_FAIL = '1';
    assert.equal(action().status, 2);
    delete process.env.PAG_TEST_FAIL;
    writeFileSync(path.join(temp, 'action-config.json'), '{"whitelist":["example"]}');
    assert.equal(action({ PAG_CONFIG: 'action-config.json' }).status, 0);
  });
  it('passes untrusted action input as data', () => {
    const marker = path.join(temp, 'action-injected');
    assert.equal(action({ PAG_MIN_AGE: `7; touch ${marker}` }).status, 2);
    assert.equal(existsSync(marker), false);
  });
});
