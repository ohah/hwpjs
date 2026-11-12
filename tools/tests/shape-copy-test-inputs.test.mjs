// Metadata-only fixtures; these do not replace SDK functions or prove Native behavior.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import {
  createShapeCopyTestInputs,
  verifyShapeCopyTestInputs,
} from '../shape-copy-test-inputs.mjs';
const sha = (b) => createHash('sha256').update(b).digest('hex');
async function fixture(fn) {
  const root = realpathSync(await mkdtemp(join(tmpdir(), 'shape-copy-metadata-')));
  const put = async (name, bytes) => {
    const p = join(root, name);
    await mkdir(join(p, '..'), { recursive: true });
    await writeFile(p, bytes);
    return p;
  };
  try {
    const wasm = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0, 0, 2, 1, 120]);
    const wasmPath = await put('engine.wasm', wasm);
    const source = await put('source.mjs', 'export const value = 1;\n');
    const ledger = JSON.stringify({ [source]: sha(await readFile(source)) });
    await put('zig-out/package-build/core-test.sources.json', ledger);
    const prefix = 'packages/core/dist/';
    const files = {
      'index.js': 'export {};\n',
      'runtime.js': 'export {};\n',
      'worker.js': 'export {};\n',
      'hwpjs.wasm': wasm,
      'wasm-artifact.json': JSON.stringify({
        sha256: sha(wasm),
        bytes: wasm.length,
        sourceSha256: sha(wasm),
        sourceBytes: wasm.length,
        identicalRuntime: true,
      }),
    };
    const pins = {};
    for (const [name, bytes] of Object.entries(files)) {
      await put(prefix + name, bytes);
      pins[name] = sha(bytes);
    }
    await put(
      prefix + 'build-manifest.json',
      JSON.stringify({ package: 'core', sourceFingerprint: sha(ledger), files: pins }),
    );
    await put(
      'packages/core/package.json',
      JSON.stringify({
        name: '@hwpjs/core',
        exports: {
          '.': { import: './dist/index.js' },
          './runtime': { import: './dist/runtime.js' },
        },
      }),
    );
    await put('apps/docs/docs/public/editor/fixtures/noori.hwp', 'metadata fixture H5');
    await put('apps/docs/docs/public/editor/fixtures/noori.hwpx', 'metadata fixture HX');
    await fn({ root, wasmPath, put, prefix, pins });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
test('manifest-bound future engine hash has no historical allowlist', async () =>
  fixture(async ({ root, wasmPath }) => {
    const config = await createShapeCopyTestInputs({ root, wasmPath });
    assert.notEqual(
      config.NativeSHA256,
      '87907e0b06d2a9021fd3ef5f788a783c8e231e4e54bf1f4aa61da6e88c5ef7f3',
    );
    await verifyShapeCopyTestInputs(config);
  }));
test('missing official manifest fails instead of skipping', async () =>
  fixture(async ({ root, wasmPath, prefix }) => {
    await rm(join(root, prefix, 'build-manifest.json'));
    await assert.rejects(createShapeCopyTestInputs({ root, wasmPath }), /InputUnavailable/);
  }));
test('actual engine bytes must match the manifest pin', async () =>
  fixture(async ({ root, wasmPath, put, prefix }) => {
    await put(prefix + 'hwpjs.wasm', 'tampered');
    await assert.rejects(createShapeCopyTestInputs({ root, wasmPath }), /HashMismatch/);
  }));
test('config cannot substitute an unrelated explicit engine hash', async () =>
  fixture(async ({ root, wasmPath }) => {
    const config = await createShapeCopyTestInputs({ root, wasmPath });
    config.NativeSHA256 = '0'.repeat(64);
    await assert.rejects(verifyShapeCopyTestInputs(config), /BindingMismatch/);
  }));
test('changed source ledger input fails before Native execution', async () =>
  fixture(async ({ root, wasmPath, put }) => {
    await put('source.mjs', 'export const changed = true;');
    await assert.rejects(createShapeCopyTestInputs({ root, wasmPath }), /HashMismatch/);
  }));
test('protected source engine path is rejected before file access', async () => {
  await assert.rejects(
    createShapeCopyTestInputs({
      root: '/nonexistent-shape-copy-root',
      wasmPath: '/nonexistent/legacy/hwpers/deny.hwp',
    }),
    /ProtectedBeforeAccess/,
  );
});
test('config duplicate pins cannot weaken the derived exact inventory', async () =>
  fixture(async ({ root, wasmPath }) => {
    const config = await createShapeCopyTestInputs({ root, wasmPath });
    config.files.push(config.files[0]);
    await assert.rejects(verifyShapeCopyTestInputs(config), /BindingMismatch/);
  }));
test('manifest path traversal is denied before referenced bytes are read', async () =>
  fixture(async ({ root, wasmPath, put, prefix, pins }) => {
    await put(
      prefix + 'build-manifest.json',
      JSON.stringify({
        package: 'core',
        sourceFingerprint: '1'.repeat(64),
        files: { ...pins, '../outside': '0'.repeat(64) },
      }),
    );
    await assert.rejects(createShapeCopyTestInputs({ root, wasmPath }), /InvalidManifestEntry/);
  }));
