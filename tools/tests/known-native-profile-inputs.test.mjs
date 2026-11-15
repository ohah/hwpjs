import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readKnownNativeProfileInputs } from '../known-native-profile-inputs.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function fixture(run) {
  const directory = await mkdtemp(join(tmpdir(), 'known-native-inputs-'));
  const wasm = Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]);
  const path = join(directory, 'committed.wasm');
  const metadata = {
    sha256: hash(wasm),
    bytes: wasm.length,
    sourceSha256: hash(wasm),
    sourceBytes: wasm.length,
    debugBytesRemoved: 0,
    identicalRuntime: true,
  };
  const manifest = { package: 'core', files: {} };
  const publish = async () => {
    const json = JSON.stringify(metadata);
    manifest.files['wasm-artifact.json'] = hash(json);
    manifest.files['hwpjs.wasm'] = hash(wasm);
    await writeFile(join(directory, 'wasm-artifact.json'), json);
    await writeFile(join(directory, 'build-manifest.json'), JSON.stringify(manifest));
  };
  try {
    await writeFile(path, wasm);
    await writeFile(join(directory, 'hwpjs.wasm'), wasm);
    await publish();
    await run({ directory, path, metadata, manifest, publish });
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('metadata and both byte hashes select inputs without granting a Native profile', () =>
  fixture(async ({ directory, path }) => {
    assert.deepEqual(await readKnownNativeProfileInputs(directory, path), {
      wasm: path,
      sha256: hash(await readFile(path)),
    });
  }));
test('wrong package and modified metadata are rejected', () =>
  fixture(async ({ directory, path, manifest, publish }) => {
    manifest.package = 'vanilla';
    await publish();
    await assert.rejects(readKnownNativeProfileInputs(directory, path), /CoreManifestRequired/);
    manifest.package = 'core';
    await publish();
    await writeFile(join(directory, 'wasm-artifact.json'), '{}');
    await assert.rejects(
      readKnownNativeProfileInputs(directory, path),
      /NativeMetadataHashMismatch/,
    );
  }));
test('changed committed or packaged bytes cannot pass a stale manifest', () =>
  fixture(async ({ directory, path }) => {
    const original = await readFile(path);
    await writeFile(path, Buffer.concat([original, Buffer.from([0])]));
    await assert.rejects(
      readKnownNativeProfileInputs(directory, path),
      /CommittedNativeHashMismatch/,
    );
    await writeFile(path, original);
    await writeFile(join(directory, 'hwpjs.wasm'), Buffer.concat([original, Buffer.from([0])]));
    await assert.rejects(
      readKnownNativeProfileInputs(directory, path),
      /PackagedNativeHashMismatch/,
    );
  }));
test('republished metadata still requires size and runtime provenance consistency', () =>
  fixture(async ({ directory, path, metadata, publish }) => {
    metadata.sourceBytes++;
    await publish();
    await assert.rejects(
      readKnownNativeProfileInputs(directory, path),
      /CommittedNativeSizeMismatch/,
    );
    metadata.sourceBytes--;
    metadata.identicalRuntime = false;
    await publish();
    await assert.rejects(
      readKnownNativeProfileInputs(directory, path),
      /NativeRuntimeIdentityRequired/,
    );
    metadata.identicalRuntime = true;
    metadata.debugBytesRemoved = 1;
    await publish();
    await assert.rejects(readKnownNativeProfileInputs(directory, path), /NativeStripSizeMismatch/);
  }));
test('Docs requires reusable quality and its exact two-test product gate after package build', async () => {
  const quality = await readFile(
    new URL('../../.github/workflows/javascript-quality.yml', import.meta.url),
    'utf8',
  );
  const docs = await readFile(new URL('../../.github/workflows/docs.yml', import.meta.url), 'utf8');
  const build = quality.indexOf('- name: Build core and vanilla');
  const gate = quality.indexOf('- name: Verify committed Native known owner-window profile');
  assert(build >= 0 && gate > build);
  const step = quality.slice(gate, quality.indexOf('\n      - name:', gate + 1));
  for (const text of [
    'set -euo pipefail',
    'packages/core/dist apps/docs/docs/public/editor/hwpjs/hwpjs.wasm',
    'tools/tests/forms-known-profile.test.mjs',
    '^# tests 2$',
    '^# pass 2$',
    '^# fail 0$',
    '^# skipped 0$',
  ])
    assert(step.includes(text), text);
  assert.match(docs, /quality:\n    uses: \.\/\.github\/workflows\/javascript-quality.yml/);
  assert.match(docs, /build:\n    needs: quality/);
  assert.match(docs, /deploy:\n    needs: build/);
  for (const path of [
    'packages/core/src/**',
    'tools/known-native-profile-inputs.mjs',
    'tools/tests/forms-known-profile.test.mjs',
    'tools/tests/known-native-profile-inputs.test.mjs',
  ])
    assert(docs.includes(`'${path}'`));
});
