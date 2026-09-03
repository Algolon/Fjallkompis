import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { zipSync, strToU8 } from 'fflate';
import {
  STORE_DEMO_BACKUP_SHA256,
  STORE_PROFILES,
  auditPinnedBackup,
  parseStoreCaptureArgs,
  pngDimensions,
  privacyFindings,
  validatePng,
} from '../scripts/lib/store-capture.mjs';

test('Store profiles are exact portrait 9:16 and meet Play dimension floors', () => {
  assert.deepEqual(STORE_PROFILES.map((profile) => profile.id), ['phone', 'tablet-7', 'tablet-10']);
  for (const profile of STORE_PROFILES) {
    assert.equal(profile.output.width * 16, profile.output.height * 9);
    assert.equal(profile.viewport.width * profile.deviceScaleFactor, profile.output.width);
    assert.equal(profile.viewport.height * profile.deviceScaleFactor, profile.output.height);
    assert.ok(profile.output.width >= 1080);
  }
});

test('Phone framing is capture-only and leaves tablet viewports native', () => {
  const runner = fs.readFileSync(new URL('../scripts/store-capture.mjs', import.meta.url), 'utf8');
  assert.match(runner, /async function applyCaptureFraming/);
  assert.match(runner, /if \(profile\.id !== 'phone'\) return/);
  assert.match(runner, /transform: scale\(0\.9\)/);
  assert.match(runner, /width: 111\.111111%/);
  assert.doesNotMatch(runner, /src\/styles\/global\.css/);
});

test('privacy checks reject personal patterns but permit explicit DEMO references', () => {
  assert.deepEqual(privacyFindings('Passenger: Demo Hiker · Reference: DEMO-0001'), []);
  assert.ok(privacyFindings('booking ref ZX9-PRIVATE').length > 0);
  assert.ok(privacyFindings('person@example.com').length > 0);
  assert.ok(privacyFindings('+31 6 1234 5678').length > 0);
  assert.ok(privacyFindings('/Users/private/backup.zip').length > 0);
});

test('CLI accepts backup path, output and build/caption switches', () => {
  assert.deepEqual(
    parseStoreCaptureArgs(['--backup', '/safe/demo.zip', '--output', 'tmp/store', '--skip-build', '--no-captions']),
    { backup: '/safe/demo.zip', output: 'tmp/store', skipBuild: true, captions: false },
  );
});

test('PNG dimension reader and Store validator fail loudly', () => {
  const fake = Buffer.alloc(24);
  Buffer.from('89504e470d0a1a0a', 'hex').copy(fake);
  fake.writeUInt32BE(1080, 16);
  fake.writeUInt32BE(1920, 20);
  assert.deepEqual(pngDimensions(fake), { width: 1080, height: 1920 });
  assert.deepEqual(validatePng(fake, STORE_PROFILES[0], 'phone/test.png'), { width: 1080, height: 1920 });
  assert.throws(() => validatePng(fake, STORE_PROFILES[1], 'tablet/test.png'), /expected 1620x2880/);
});

test('the pinned backup identity is a full SHA-256 and cannot be replaced by any ZIP', () => {
  assert.match(STORE_DEMO_BACKUP_SHA256, /^[a-f\d]{64}$/);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fj-store-test-'));
  const file = path.join(dir, 'other.zip');
  fs.writeFileSync(file, zipSync({ 'data.json': strToU8('{}') }));
  assert.throws(() => auditPinnedBackup(file), /Refusing unpinned demo backup/);
});
