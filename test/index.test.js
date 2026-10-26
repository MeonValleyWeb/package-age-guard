#!/usr/bin/env node

/**
 * Tests for Package Age Guard
 * Run with: npm test
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';
import {
  cleanVersion,
  shouldIgnoreVersion,
  isWhitelisted,
  getDefaultConfig,
  hasViolations,
  shouldFail,
  formatResults
} from '../index.js';

describe('cleanVersion', () => {
  it('should remove ^ prefix', () => {
    assert.strictEqual(cleanVersion('^1.2.3'), '1.2.3');
  });
  
  it('should remove ~ prefix', () => {
    assert.strictEqual(cleanVersion('~1.2.3'), '1.2.3');
  });
  
  it('should remove >= prefix', () => {
    assert.strictEqual(cleanVersion('>=1.2.3'), '1.2.3');
  });
  
  it('should handle multiple prefixes', () => {
    assert.strictEqual(cleanVersion('^~1.2.3'), '1.2.3');
  });
  
  it('should trim whitespace', () => {
    assert.strictEqual(cleanVersion('  1.2.3  '), '1.2.3');
  });
  
  it('should return exact version unchanged', () => {
    assert.strictEqual(cleanVersion('1.2.3'), '1.2.3');
  });
});

describe('shouldIgnoreVersion', () => {
  it('should ignore wildcard *', () => {
    assert.strictEqual(shouldIgnoreVersion('*', ['*']), true);
  });
  
  it('should ignore latest', () => {
    assert.strictEqual(shouldIgnoreVersion('latest'), true);
  });
  
  it('should ignore next', () => {
    assert.strictEqual(shouldIgnoreVersion('next'), true);
  });
  
  it('should ignore beta versions', () => {
    assert.strictEqual(shouldIgnoreVersion('beta'), true);
  });
  
  it('should ignore alpha versions', () => {
    assert.strictEqual(shouldIgnoreVersion('alpha'), true);
  });
  
  it('should ignore rc versions', () => {
    assert.strictEqual(shouldIgnoreVersion('rc'), true);
  });
  
  it('should ignore canary versions', () => {
    assert.strictEqual(shouldIgnoreVersion('canary'), true);
  });
  
  it('should ignore dev versions', () => {
    assert.strictEqual(shouldIgnoreVersion('dev'), true);
  });
  
  it('should ignore snapshot versions', () => {
    assert.strictEqual(shouldIgnoreVersion('snapshot'), true);
  });
  
  it('should not ignore regular versions', () => {
    assert.strictEqual(shouldIgnoreVersion('1.2.3'), false);
  });
  
  it('should ignore version ranges with ||', () => {
    assert.strictEqual(shouldIgnoreVersion('1.2.3 || 2.0.0'), true);
  });
  
  it('should handle specific whitelist', () => {
    assert.strictEqual(shouldIgnoreVersion('1.2.3', ['1.2.3']), true);
    assert.strictEqual(shouldIgnoreVersion('1.2.3', ['2.0.0']), false);
  });
});

describe('isWhitelisted', () => {
  it('should return true for whitelisted package name', () => {
    assert.strictEqual(isWhitelisted('lodash', '4.17.21', ['lodash']), true);
  });
  
  it('should return true for whitelisted name@version', () => {
    assert.strictEqual(isWhitelisted('lodash', '4.17.21', ['lodash@4.17.21']), true);
  });
  
  it('should return false for non-whitelisted package', () => {
    assert.strictEqual(isWhitelisted('lodash', '4.17.21', ['react']), false);
  });
  
  it('should return false for wrong version', () => {
    assert.strictEqual(isWhitelisted('lodash', '4.17.21', ['lodash@4.17.20']), false);
  });
  
  it('should handle empty whitelist', () => {
    assert.strictEqual(isWhitelisted('lodash', '4.17.21', []), false);
  });
  
  it('should handle missing whitelist', () => {
    assert.strictEqual(isWhitelisted('lodash', '4.17.21'), false);
  });
});

describe('getDefaultConfig', () => {
  it('should return default configuration', () => {
    const config = getDefaultConfig();
    
    assert.strictEqual(config.minAge, 7);
    assert.strictEqual(config.productionOnly, false);
    assert.deepStrictEqual(config.whitelist, []);
    assert.strictEqual(config.failOnWarning, false);
    assert.deepStrictEqual(config.ignorePatterns, ['*', 'latest', 'next', 'beta', 'alpha', 'rc', 'canary']);
  });
});

describe('hasViolations', () => {
  it('should return true when violations exist', () => {
    const results = {
      violations: [{ name: 'test', version: '1.0.0' }],
      warnings: [],
      errors: [],
      passed: []
    };
    assert.strictEqual(hasViolations(results), true);
  });
  
  it('should return false when no violations', () => {
    const results = {
      violations: [],
      warnings: [],
      errors: [],
      passed: [{ name: 'test', version: '1.0.0' }]
    };
    assert.strictEqual(hasViolations(results), false);
  });
});

describe('shouldFail', () => {
  it('should return true when violations exist', () => {
    const results = {
      violations: [{ name: 'test', version: '1.0.0' }],
      warnings: [],
      errors: [],
      passed: []
    };
    assert.strictEqual(shouldFail(results, { failOnWarning: false }), true);
  });
  
  it('should return false when only warnings and failOnWarning is false', () => {
    const results = {
      violations: [],
      warnings: [{ name: 'test', version: '1.0.0' }],
      errors: [],
      passed: []
    };
    assert.strictEqual(shouldFail(results, { failOnWarning: false }), false);
  });
  
  it('should return true when warnings exist and failOnWarning is true', () => {
    const results = {
      violations: [],
      warnings: [{ name: 'test', version: '1.0.0' }],
      errors: [],
      passed: []
    };
    assert.strictEqual(shouldFail(results, { failOnWarning: true }), true);
  });
  
  it('should return false when all passed', () => {
    const results = {
      violations: [],
      warnings: [],
      errors: [],
      passed: [{ name: 'test', version: '1.0.0' }]
    };
    assert.strictEqual(shouldFail(results, { failOnWarning: false }), false);
  });
});

describe('formatResults with suggestions', () => {
  it('should show suggestions in output', () => {
    const results = {
      passed: [],
      violations: [{
        name: 'test-pkg',
        version: '2.0.0',
        age: 2,
        status: 'violation',
        suggestion: {
          version: '1.5.0',
          ageDays: 45,
          published: '2024-01-01T00:00:00.000Z'
        }
      }],
      warnings: [],
      errors: [],
      total: 1,
      minAge: 7,
      checkedAt: new Date().toISOString()
    };

    const output = formatResults(results);

    assert.ok(output.includes('test-pkg@2.0.0'), 'Should show violation');
    assert.ok(output.includes('Suggested:'), 'Should show suggestion label');
    assert.ok(output.includes('test-pkg@1.5.0'), 'Should show suggested version');
    assert.ok(output.includes('45 days old'), 'Should show age of suggested version');
    assert.ok(output.includes('npm install test-pkg@1.5.0'), 'Should show install command');
  });

  it('should show options section when violations exist', () => {
    const results = {
      passed: [],
      violations: [{
        name: 'test-pkg',
        version: '1.0.0',
        age: 2,
        status: 'violation'
      }],
      warnings: [],
      errors: [],
      total: 1,
      minAge: 7,
      checkedAt: new Date().toISOString()
    };

    const output = formatResults(results);

    assert.ok(output.includes('Security Policy Violation'), 'Should show violation header');
    assert.ok(output.includes('--fix'), 'Should mention --fix option');
  });
});
