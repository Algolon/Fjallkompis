/**
 * The version-consistency guard itself must both pass on the current repo
 * and actually fail when versions drift — otherwise it protects nothing.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const script = join(root, 'scripts', 'check-version-consistency.mjs');

function runCheck(scriptPath) {
  try {
    const stdout = execFileSync(process.execPath, [scriptPath], { encoding: 'utf8' });
    return { code: 0, output: stdout };
  } catch (e) {
    return { code: e.status, output: `${e.stdout ?? ''}${e.stderr ?? ''}` };
  }
}

// The script resolves files relative to its own location, so exercising a
// broken repo needs a full copy with the script inside it.
function brokenRepoFixture(mutate) {
  const dir = mkdtempSync(join(tmpdir(), 'fjallkompis-version-check-'));
  for (const f of ['package.json', 'package-lock.json', 'vite.config.ts']) {
    cpSync(join(root, f), join(dir, f));
  }
  mkdirSync(join(dir, 'src'));
  mkdirSync(join(dir, 'scripts'));
  cpSync(join(root, 'src', 'constants.ts'), join(dir, 'src', 'constants.ts'));
  cpSync(script, join(dir, 'scripts', 'check-version-consistency.mjs'));
  mutate(dir);
  return runCheck(join(dir, 'scripts', 'check-version-consistency.mjs'));
}

test('current repository passes the version-consistency check', () => {
  const { code, output } = runCheck(script);
  assert.equal(code, 0, output);
  const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  assert.match(output, new RegExp(pkg.version.replaceAll('.', '\\.')));
});

test('a package-lock version mismatch fails the check', () => {
  const { code, output } = brokenRepoFixture((dir) => {
    const lock = JSON.parse(readFileSync(join(dir, 'package-lock.json'), 'utf8'));
    lock.version = '0.0.1';
    writeFileSync(join(dir, 'package-lock.json'), JSON.stringify(lock));
  });
  assert.equal(code, 1);
  assert.match(output, /package-lock\.json root version/);
});

test('a hard-coded version literal in src/constants.ts fails the check', () => {
  const { code, output } = brokenRepoFixture((dir) => {
    writeFileSync(join(dir, 'src', 'constants.ts'), "export const APP_VERSION = '9.9.9';\n");
  });
  assert.equal(code, 1);
  assert.match(output, /hard-coded version literal/);
});
