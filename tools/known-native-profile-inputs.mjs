import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

// Validate build provenance only. Profile admission remains private to the Core loader.
export async function readKnownNativeProfileInputs(coreDirectory, wasmPath) {
  const directory = resolve(coreDirectory);
  const wasm = resolve(wasmPath);
  const manifest = JSON.parse(await readFile(join(directory, 'build-manifest.json'), 'utf8'));
  assert.equal(manifest.package, 'core', 'CoreManifestRequired');
  const metadataBytes = await readFile(join(directory, 'wasm-artifact.json'));
  assert.equal(
    sha256(metadataBytes),
    manifest.files?.['wasm-artifact.json'],
    'NativeMetadataHashMismatch',
  );
  const metadata = JSON.parse(metadataBytes);
  const packaged = await readFile(join(directory, 'hwpjs.wasm'));
  assert.equal(sha256(packaged), manifest.files?.['hwpjs.wasm'], 'PackagedNativeHashMismatch');
  assert.equal(sha256(packaged), metadata.sha256, 'NativeArtifactHashMismatch');
  assert.equal(packaged.length, metadata.bytes, 'NativeArtifactSizeMismatch');
  const source = await readFile(wasm);
  const digest = sha256(source);
  assert.equal(digest, metadata.sourceSha256, 'CommittedNativeHashMismatch');
  assert.equal(source.length, metadata.sourceBytes, 'CommittedNativeSizeMismatch');
  assert.equal(metadata.identicalRuntime, true, 'NativeRuntimeIdentityRequired');
  assert(Number.isSafeInteger(metadata.debugBytesRemoved) && metadata.debugBytesRemoved >= 0);
  assert.equal(
    source.length - packaged.length,
    metadata.debugBytesRemoved,
    'NativeStripSizeMismatch',
  );
  return { wasm, sha256: digest };
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assert.equal(process.argv.length, 4, 'ExpectedCoreDistAndCommittedWasm');
  console.log(JSON.stringify(await readKnownNativeProfileInputs(process.argv[2], process.argv[3])));
}
