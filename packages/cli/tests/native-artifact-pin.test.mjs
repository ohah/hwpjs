import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  LEGACY820_WASM_SHA256,
  nativeArtifactExpectedSHA256,
  publicManifestWasmSHA256,
} from './native-artifact-pin.mjs';

const declared = '1234567890abcdef'.repeat(4);
const malformed = [
  '',
  null,
  7,
  'a'.repeat(63),
  'a'.repeat(65),
  'A'.repeat(64),
  'g'.repeat(64),
  `${declared}\n`,
  ` ${declared}`,
];

test('absent expectation retains Legacy820 regardless of reported artifact SHA', () => {
  assert.equal(nativeArtifactExpectedSHA256({}), LEGACY820_WASM_SHA256);
  assert.equal(
    nativeArtifactExpectedSHA256({ HWPJS_TEST_WASM_SHA256: declared }),
    LEGACY820_WASM_SHA256,
  );
  assert.equal(
    nativeArtifactExpectedSHA256({ HWPJS_EXTENDED_E2E_WASM_SHA256: declared }),
    LEGACY820_WASM_SHA256,
  );
});

test('only an explicit valid independent expectation overrides Legacy820', () => {
  assert.equal(
    nativeArtifactExpectedSHA256({
      HWPJS_TEST_WASM_EXPECTED_SHA256: declared,
      HWPJS_TEST_WASM_SHA256: '0'.repeat(64),
    }),
    declared,
  );
  for (const value of malformed)
    assert.throws(
      () => nativeArtifactExpectedSHA256({ HWPJS_TEST_WASM_EXPECTED_SHA256: value }),
      /InvalidExpectedWasmSHA256/,
    );
});

test('public manifest requires its own lowerhex64 wasmSha256 field', () => {
  assert.equal(publicManifestWasmSHA256({ wasmSha256: declared }), declared);
  for (const value of [...malformed, undefined])
    assert.throws(
      () => publicManifestWasmSHA256({ wasmSha256: value }),
      /InvalidPublicManifestWasmSHA256/,
    );
  for (const manifest of [null, undefined, {}, { files: { 'hwpjs.wasm': declared } }])
    assert.throws(() => publicManifestWasmSHA256(manifest), /InvalidPublicManifestWasmSHA256/);
});

test('manifest CLI refuses missing arguments and protected paths before access', () => {
  const helper = new URL('./native-artifact-pin.mjs', import.meta.url);
  for (const args of [
    [],
    ['--manifest', '/nonexistent/hwpers/manifest.json'],
    ['--manifest', '../manifest.json'],
  ]) {
    const result = spawnSync(process.execPath, [helper.pathname, ...args], { encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(
      result.stderr,
      args.length ? /ProtectedBeforeAccess/ : /ExplicitPublicManifestRequired/,
    );
    assert.doesNotMatch(result.stderr, /ENOENT/);
  }
});

test('manifest CLI emits the declaration and rejects malformed manifest pins', (t) => {
  const directory = mkdtempSync(join(tmpdir(), 'hwpjs-artifact-pin-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const manifest = join(directory, 'manifest.json');
  const helper = new URL('./native-artifact-pin.mjs', import.meta.url);
  writeFileSync(manifest, JSON.stringify({ wasmSha256: declared }));
  const valid = spawnSync(process.execPath, [helper.pathname, '--manifest', manifest], {
    encoding: 'utf8',
  });
  assert.equal(valid.status, 0, valid.stderr);
  assert.equal(valid.stdout, declared + '\n');
  writeFileSync(manifest, JSON.stringify({ wasmSha256: declared.toUpperCase() }));
  const invalid = spawnSync(process.execPath, [helper.pathname, '--manifest', manifest], {
    encoding: 'utf8',
  });
  assert.notEqual(invalid.status, 0);
  assert.match(invalid.stderr, /InvalidPublicManifestWasmSHA256/);
  assert.equal(invalid.stdout, '');
});
