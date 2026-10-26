import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

const root = fileURLToPath(new URL('..', import.meta.url));
const temp = mkdtempSync(path.join(tmpdir(), 'package-age-guard-pack-'));
try {
  const [packed] = JSON.parse(execFileSync('npm', ['pack', '--ignore-scripts', '--json', '--pack-destination', temp], { cwd: root, encoding: 'utf8' }));
  const names = packed.files.map(file => file.path);
  for (const name of ['index.js', 'registry.cjs', 'pnpm.cjs', 'bin/cli.js']) assert.ok(names.includes(name), `Missing ${name}`);
  assert.ok(!names.some(name => name.startsWith('test/') || name.startsWith('.github/')), 'Unexpected development files');
  writeFileSync(path.join(temp, 'package.json'), '{"private":true,"type":"module"}');
  execFileSync('npm', ['install', '--ignore-scripts', '--offline', '--no-audit', '--no-fund', path.join(temp, packed.filename)], { cwd: temp, stdio: 'pipe' });
  const version = JSON.parse(readFileSync(path.join(root, 'package.json'))).version;
  const cli = path.join(temp, 'node_modules/package-age-guard/bin/cli.js');
  for (const name of ['package-age-guard', 'pag']) {
    const alias = path.join(temp, 'node_modules/.bin', name);
    assert.equal(execFileSync(alias, ['--version'], { encoding: 'utf8' }).trim(), `package-age-guard v${version}`);
    assert.match(execFileSync(alias, ['--help'], { encoding: 'utf8' }), /--setup-pnpm/);
  }
  execFileSync(process.execPath, ['--input-type=module', '-e', "import {checkPackages} from 'package-age-guard'; if(typeof checkPackages!=='function')process.exit(1)"], { cwd: temp });
  execFileSync(process.execPath, ['-e', "const p=require('package-age-guard/pnpm'); if(typeof p.hooks.readPackage!=='function')process.exit(1)"], { cwd: temp });
  execFileSync(process.execPath, [cli, '--setup-pnpm'], { cwd: temp, stdio: 'pipe' });
  execFileSync(process.execPath, ['-e', "const p=require('./.pnpmfile.cjs'); if(typeof p.hooks.readPackage!=='function')process.exit(1)"], { cwd: temp });
  console.log(`Verified installed tarball: ${packed.filename} (${packed.files.length} files)`);
} finally {
  rmSync(temp, { recursive: true, force: true });
}
