import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

test('HWP5 corpus arguments reject duplicate and empty fixture before reading WASM', () => {
  for (const [args, message] of [
    [['--fixture=a', '--fixture=b'], 'DuplicateAuditArgument'],
    [['--history', '--history'], 'DuplicateAuditArgument'],
    [['--wasm=a', '--wasm=b'], 'DuplicateAuditArgument'],
    [['--fixture='], 'Unknown argument'],
    [['--wasm='], 'Unknown argument'],
    [['--unknown'], 'Unknown argument'],
  ]) {
    const result = spawnSync(process.execPath, ['tools/hwp5-edit-corpus-audit.mjs', ...args], {
      encoding: 'utf8',
      timeout: 10000,
    });
    assert.equal(result.error, undefined);
    assert.notEqual(result.status, 0);
    assert(result.stderr.includes(message), result.stderr);
  }
});
