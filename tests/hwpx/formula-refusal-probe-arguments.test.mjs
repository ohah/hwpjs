import assert from 'node:assert/strict';
import test from 'node:test';
import { spawnSync } from 'node:child_process';

test('formula refusal probe requires exactly one explicit absolute candidate path', () => {
  for (const args of [
    [],
    ['--wasm='],
    ['--wasm=relative.wasm'],
    ['--unknown=/tmp/example.wasm'],
    ['--wasm=/tmp/a.wasm', '--wasm=/tmp/b.wasm'],
  ]) {
    const result = spawnSync(process.execPath, ['tools/hwpx-formula-refusal-probe.mjs', ...args], {
      encoding: 'utf8',
      timeout: 5000,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.signal, null);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Usage: node tools\/hwpx-formula-refusal-probe\.mjs/);
    assert.equal(result.stdout, '', 'invalid arguments must not start fixture queries');
  }
});
