import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  compareWasmRuntime,
  stripWasmDebug,
  wasmRuntimeSections,
} from '../../tools/wasm-runtime-parity.mjs';

const header = [0, 97, 115, 109, 1, 0, 0, 0];
const custom = (name, payload = []) => {
  const encoded = [...new TextEncoder().encode(name)],
    data = [encoded.length, ...encoded, ...payload];
  return [0, data.length, ...data];
};
const moduleBytes = (...sections) => Uint8Array.from([...header, ...sections.flat()]);
// Same exports, different function body: the weaker name-only check misses it.
const fn = (value) =>
  moduleBytes(
    [1, 5, 1, 96, 0, 1, 127],
    [3, 2, 1, 0],
    [7, 5, 1, 1, 102, 0, 0],
    [10, 6, 1, 4, 0, 65, value, 11],
  );

test('runtime comparison permits only DWARF and optional name changes', () => {
  const plain = fn(1),
    before = Uint8Array.from([
      ...plain,
      ...custom('.debug_info', [1, 2]),
      ...custom('name', [0, 1, 0]),
    ]);
  assert.equal(compareWasmRuntime(before, plain).identicalRuntime, true);
  assert.equal(wasmRuntimeSections(before).debug.length, 2);
  assert.equal(compareWasmRuntime(fn(1), fn(2)).identicalRuntime, false);
  assert.deepEqual(
    WebAssembly.Module.exports(new WebAssembly.Module(fn(1))),
    WebAssembly.Module.exports(new WebAssembly.Module(fn(2))),
  );
});

test('non-debug custom sections and their order are never ignored', () => {
  const a = custom('target_features', [0]),
    b = custom('vendor', [1]);
  assert.equal(compareWasmRuntime(moduleBytes(a, b), moduleBytes(a, b)).identicalRuntime, true);
  assert.equal(compareWasmRuntime(moduleBytes(a, b), moduleBytes(b, a)).identicalRuntime, false);
  assert.equal(compareWasmRuntime(moduleBytes(a), moduleBytes()).identicalRuntime, false);
  assert.equal(
    compareWasmRuntime(moduleBytes(custom('.debugger', [1])), moduleBytes()).identicalRuntime,
    false,
  );
});

test('runtime comparison rejects malformed and truncated input', () => {
  for (const bytes of [
    [],
    header.slice(0, 7),
    [...header, 0, 128],
    [...header, 0, 10, 0],
    [...header, 0, 128, 128, 128, 128, 16],
    [...header, 0, 2, 1, 255],
  ]) {
    assert.throws(() => wasmRuntimeSections(Uint8Array.from(bytes)));
    assert.throws(() => stripWasmDebug(Uint8Array.from(bytes)));
  }
});

test('debug stripping retains exact runtime bytes, source ownership, and custom sections', async () => {
  const plain = fn(42),
    runtime = Uint8Array.from([...plain, ...custom('vendor', [2])]);
  const input = Uint8Array.from([
    ...runtime,
    ...custom('.debug_line', [1, 2, 3]),
    ...custom('name', [0, 1, 0]),
  ]);
  const before = input.slice(),
    stripped = stripWasmDebug(input);
  assert.deepEqual(input, before);
  assert.deepEqual(stripped, runtime);
  assert.deepEqual(stripWasmDebug(stripped), stripped);
  assert.equal(compareWasmRuntime(input, stripped).identicalRuntime, true);
  assert.equal(wasmRuntimeSections(stripped).debug.length, 0);
  const instance = await WebAssembly.instantiate(stripped);
  assert.equal(instance.instance.exports.f(), 42);
  stripped.fill(0);
  assert.deepEqual(input, before);
});

test('strip CLI refuses existing outputs and invalid modules without writing', (t) => {
  const root = mkdtempSync(join(tmpdir(), 'hwpjs-strip-cli-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const input = join(root, 'input.wasm'),
    output = join(root, 'output.wasm');
  const cli = fileURLToPath(new URL('../../tools/strip-wasm-debug.mjs', import.meta.url));
  const run = (...args) => spawnSync(process.execPath, [cli, ...args], { encoding: 'utf8' });
  const source = Uint8Array.from([...fn(42), ...custom('.debug_info', [1])]);
  writeFileSync(input, source);
  assert.equal(run(input, input).status, 1);
  assert.deepEqual(readFileSync(input), Buffer.from(source));
  const success = run(input, output);
  assert.equal(success.status, 0, success.stderr);
  assert.equal(JSON.parse(success.stdout).identicalRuntime, true);
  const saved = readFileSync(output);
  assert.equal(run(input, output).status, 1);
  assert.deepEqual(readFileSync(output), saved);
  writeFileSync(input, Uint8Array.of(0));
  assert.equal(run(input, join(root, 'invalid.wasm')).status, 1);
  assert.throws(() => readFileSync(join(root, 'invalid.wasm')), { code: 'ENOENT' });
});
