import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';

test('plain fixture audit refuses missing WASM before loading the inventory', () => {
  const result = spawnSync(process.execPath, ['tools/hwpx-plain-fixture-audit.mjs'], {
    env: { ...process.env, HWPJS_TEST_WASM: '' },
    encoding: 'utf8',
    timeout: 10000,
  });
  assert.equal(result.error, undefined);
  assert.equal(result.signal, null);
  assert.equal(result.status, 1);
  assert.match(result.stderr, /ExplicitPlainProbeInputsRequired/);
  assert.equal(result.stdout, '');
});

test('plain fixture audit rejects partial-scope arguments before reading a candidate', () => {
  for (const argument of ['--limit=1', '--fixture=missing.hwpx', 'extra']) {
    const result = spawnSync(process.execPath, ['tools/hwpx-plain-fixture-audit.mjs', argument], {
      env: { ...process.env, HWPJS_TEST_WASM: 'must-not-read.wasm' },
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ExplicitPlainProbeInputsRequired/);
    assert.doesNotMatch(result.stderr, /ENOENT/);
    assert.equal(result.stdout, '');
  }
});
