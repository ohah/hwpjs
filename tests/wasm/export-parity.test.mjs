import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { compareWasmExports } from '../../tools/wasm-export-parity.mjs';

const header = [0, 97, 115, 109, 1, 0, 0, 0];
const memory = (name) =>
  Uint8Array.from([...header, 5, 3, 1, 0, 1, 7, 5, 1, 1, name.charCodeAt(0), 2, 0]);
const func = Uint8Array.from([
  ...header,
  1,
  4,
  1,
  96,
  0,
  0,
  3,
  2,
  1,
  0,
  7,
  5,
  1,
  1,
  109,
  0,
  0,
  10,
  4,
  1,
  2,
  0,
  11,
]);
const extended = Uint8Array.from([
  ...header,
  1,
  4,
  1,
  96,
  0,
  0,
  3,
  2,
  1,
  0,
  5,
  3,
  1,
  0,
  1,
  7,
  9,
  2,
  1,
  109,
  0,
  0,
  1,
  110,
  2,
  0,
  10,
  4,
  1,
  2,
  0,
  11,
]);

test('WASM export gate rejects missing names and changed kinds rather than trusting counts', () => {
  const missing = compareWasmExports(memory('m'), memory('n'));
  assert.equal(missing.baselineExports, missing.candidateExports);
  assert.equal(missing.compatible, false);
  assert.deepEqual(missing.missing, [{ name: 'm', kind: 'memory' }]);
  assert.deepEqual(missing.added, [{ name: 'n', kind: 'memory' }]);
  const changed = compareWasmExports(memory('m'), func);
  assert.equal(changed.compatible, false);
  assert.deepEqual(changed.changedKind, [{ name: 'm', expected: 'memory', actual: 'function' }]);
});

test('WASM export gate allows additions and accepts compiled modules without granting semantic parity', () => {
  const result = compareWasmExports(new WebAssembly.Module(func), extended);
  assert.equal(result.compatible, true);
  assert.deepEqual(result.added, [{ name: 'n', kind: 'memory' }]);
  assert.deepEqual(result.missing, []);
  assert.deepEqual(result.changedKind, []);
  assert.equal(compareWasmExports(memory('m'), memory('m')).compatible, true);
  assert.throws(() => compareWasmExports(new Uint8Array(), extended), WebAssembly.CompileError);
});

test('WASM export gate CLI refuses missing extra and empty arguments', () => {
  for (const args of [[], ['one'], ['one', 'two', 'three'], ['', '']]) {
    assert.throws(
      () =>
        execFileSync(process.execPath, ['tools/wasm-export-parity.mjs', ...args], {
          encoding: 'utf8',
          stdio: 'pipe',
        }),
      (error) => error.status === 2 && error.stderr.includes('Usage:'),
    );
  }
});
