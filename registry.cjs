const { execFileSync } = require('node:child_process');

function validatePackageName(name) {
  if (typeof name !== 'string' || !/^(?:@[a-z0-9._~-]+\/)?[a-z0-9._~-]+$/i.test(name) || name.startsWith('-')) {
    throw new Error('Invalid npm package name');
  }
}

function isExactVersion(version) {
  return typeof version === 'string' && /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version);
}

function getTimes(name) {
  validatePackageName(name);
  const output = execFileSync('npm', ['view', name, 'time', '--json'], {
    encoding: 'utf8', timeout: 15000, maxBuffer: 10 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const times = JSON.parse(output);
  if (!times || typeof times !== 'object' || Array.isArray(times)) {
    throw new Error('Invalid response from registry');
  }
  return times;
}

function validateConfig(config) {
  if (!Number.isFinite(config.minAge) || config.minAge < 0) {
    throw new Error('minAge must be a finite, non-negative number');
  }
  for (const key of ['whitelist', 'ignorePatterns']) {
    if (!Array.isArray(config[key]) || config[key].some(value => typeof value !== 'string')) {
      throw new Error(`${key} must be an array of strings`);
    }
  }
  for (const key of ['productionOnly', 'failOnWarning']) {
    if (config[key] !== undefined && typeof config[key] !== 'boolean') {
      throw new Error(`${key} must be a boolean`);
    }
  }
  if (config.pnpmMode !== undefined && !['warn', 'error', 'allow'].includes(config.pnpmMode)) {
    throw new Error('pnpmMode must be warn, error, or allow');
  }
  return config;
}

function installPackage(name, version, dev = false) {
  validatePackageName(name);
  if (!isExactVersion(version)) throw new Error('Invalid npm package version');
  execFileSync('npm', ['install', '--ignore-scripts', '--save-exact', dev ? '--save-dev' : '--save-prod', `${name}@${version}`], {
    stdio: 'inherit', timeout: 60000
  });
}

module.exports = { getTimes, isExactVersion, validatePackageName, validateConfig, installPackage };
