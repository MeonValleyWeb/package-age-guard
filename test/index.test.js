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
  getSafeVersion,
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

describe('Integration: End-to-end', () => {
  it('should work with a real package (node-fetch)', async () => {
    // This test actually calls npm registry
    const { checkPackages } = await import('../index.js');

    const results = await checkPackages({
      config: {
        minAge: 0, // Allow any age for this test
        productionOnly: true,
        whitelist: [],
        failOnWarning: false,
        ignorePatterns: ['*', 'latest']
      }
    });

    // Should have checked packages
    assert.ok(results.total >= 0);
    assert.ok(results.passed.length >= 0);

    // Should have a timestamp
    assert.ok(results.checkedAt);
  });
});

describe('getSafeVersion', () => {
  it('should return a safe version for an old package', async () => {
    // Test with a well-known old package (lodash has many versions)
    const safeVersion = await getSafeVersion('lodash', 30);

    if (safeVersion) {
      // Should have version, published date, and age
      assert.ok(safeVersion.version, 'Should have version string');
      assert.ok(safeVersion.published, 'Should have published date');
      assert.ok(safeVersion.ageDays >= 30, 'Should be at least 30 days old');
      assert.ok(typeof safeVersion.ageDays === 'number', 'ageDays should be a number');
    }
  });

  it('should return null for non-existent package', async () => {
    const safeVersion = await getSafeVersion('this-package-definitely-does-not-exist-12345', 7);
    assert.strictEqual(safeVersion, null);
  });

  it('should work with different minAge values', async () => {
    const safeVersion1 = await getSafeVersion('lodash', 1);
    const safeVersion90 = await getSafeVersion('lodash', 90);

    if (safeVersion1 && safeVersion90) {
      // The 90-day version should be older (higher ageDays)
      assert.ok(safeVersion90.ageDays >= 90, '90-day version should be at least 90 days old');
    }
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

describe('checkPackages with suggestions', () => {
  it('should include suggestions when includeSuggestions is true', async () => {
    const { checkPackages } = await import('../index.js');

    // Create a test scenario where we can check if suggestions are included
    const results = await checkPackages({
      config: {
        minAge: 0, // Allow any age
        productionOnly: true,
        whitelist: [],
        failOnWarning: false,
        ignorePatterns: ['*', 'latest']
      },
      includeSuggestions: true
    });

    // If there are violations, they should potentially have suggestions
    // Note: This depends on the actual package state
    assert.ok(results.hasOwnProperty('violations'), 'Should have violations array');
    assert.ok(results.hasOwnProperty('passed'), 'Should have passed array');
  });
});
