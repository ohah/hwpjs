import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  DEFAULT_NATIVE_WASM_SHA256,
  nativeWasmExpectedSHA256,
  manifestWasmSHA256,
} from './helpers/native-wasm-pin.mjs';
const bd = 'bd095cdf56892d5b5708a567ca91ae271846a3949bfc41c3a717bdee6513684f';
const entry = fileURLToPath(new URL('./helpers/native-wasm-pin.mjs', import.meta.url));

test('unset expected pin retains d849 legacy CLI', () => {
  assert.equal(nativeWasmExpectedSHA256({}), DEFAULT_NATIVE_WASM_SHA256);
});
test('explicit official pin is selected without adding Native registration authority', () => {
  for (const value of [DEFAULT_NATIVE_WASM_SHA256, bd])
    assert.equal(nativeWasmExpectedSHA256({ HWPJS_TEST_WASM_EXPECTED_SHA256: value }), value);
});
test('malformed explicit env is rejected instead of legacy fallback', () => {
  for (const value of ['', null, false, 1, 'bd095', bd.toUpperCase(), ' ' + bd, bd + '\n'])
    assert.throws(
      () => nativeWasmExpectedSHA256({ HWPJS_TEST_WASM_EXPECTED_SHA256: value }),
      /InvalidExpectedWasmSHA256/,
    );
});
test('official manifest files wasm entry defines expectation', () => {
  for (const value of [DEFAULT_NATIVE_WASM_SHA256, bd])
    assert.equal(manifestWasmSHA256({ files: { 'hwpjs.wasm': value } }), value);
});
test('missing or malformed manifest pin never guesses from actual bytes', () => {
  for (const manifest of [
    null,
    {},
    { files: {} },
    { files: { 'hwpjs.wasm': '' } },
    { files: { 'hwpjs.wasm': false } },
    { files: { 'hwpjs.wasm': bd.toUpperCase() } },
  ])
    assert.throws(() => manifestWasmSHA256(manifest), /WasmManifestPinMissing/);
});
test('CLI selects manifest pin even if parent env has legacy pin', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hwpjs-wasm-pin-'));
  try {
    const path = join(dir, 'build-manifest.json');
    writeFileSync(path, JSON.stringify({ files: { 'hwpjs.wasm': bd } }));
    const result = execFileSync(process.execPath, [entry, '--manifest', path], {
      encoding: 'utf8',
      env: { ...process.env, HWPJS_TEST_WASM_EXPECTED_SHA256: DEFAULT_NATIVE_WASM_SHA256 },
    });
    assert.equal(result.trim(), bd);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
test('CLI invalid manifest fails nonzero with no fallback output', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hwpjs-wasm-pin-'));
  try {
    const path = join(dir, 'build-manifest.json');
    writeFileSync(path, JSON.stringify({ files: {} }));
    const result = spawnSync(process.execPath, [entry, '--manifest', path], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /WasmManifestPinMissing/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
