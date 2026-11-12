// Normal package build metadata only. No SDK resolver, capability or writer hooks.
import assert from 'node:assert/strict';
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises';
import { resolve, relative, isAbsolute, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { guardAbsolute, lexicalPath } from './native-fixture-preflight.mjs';
import { manifestWasmSHA256 } from './tests/helpers/native-wasm-pin.mjs';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function absolute(path) {
  assert(typeof path === 'string' && isAbsolute(path), 'ShapeCopyAbsolutePathRequired');
  assert(!/hwpers|title-column-roundtrip/iu.test(path), 'ShapeCopyProtectedBeforeAccess');
  assert(
    resolve(path) === path && !path.split('/').includes('..'),
    'ShapeCopyCanonicalPathRequired',
  );
  return path;
}
function below(root, path) {
  absolute(path);
  const rel = relative(root, path);
  assert(rel && !isAbsolute(rel) && rel !== '..' && !rel.startsWith('../'), 'ShapeCopyOutsideRoot');
  return path;
}
function entry(root, name) {
  assert(typeof name === 'string' && name && !isAbsolute(name), 'ShapeCopyInvalidManifestEntry');
  assert(
    !name.split(/[\\/]/).some((part) => !part || part === '.' || part === '..'),
    'ShapeCopyInvalidManifestEntry',
  );
  return below(root, resolve(root, name));
}
async function bytes(path) {
  absolute(path);
  const denied = guardAbsolute(path);
  assert(!denied, `ShapeCopyInputUnavailable:${denied?.reason}`);
  return readFile(path);
}
export async function createShapeCopyTestInputs({ root, wasmPath }) {
  absolute(root);
  absolute(wasmPath);
  const dist = resolve(root, 'packages/core/dist');
  const pins = new Map();
  async function pin(path, expected) {
    const value = await bytes(path);
    if (expected !== undefined)
      assert(hash(expected) && sha(value) === expected, 'ShapeCopyInputHashMismatch');
    pins.set(path, { path, sha256: sha(value), bytes: value.length });
    return value;
  }
  const manifestPath = resolve(dist, 'build-manifest.json');
  const manifestBytes = await pin(manifestPath);
  const manifest = JSON.parse(manifestBytes);
  assert(
    manifest.package === 'core' && hash(manifest.sourceFingerprint),
    'ShapeCopyCoreManifestRequired',
  );
  const NativeSHA256 = manifestWasmSHA256(manifest);
  for (const [name, digest] of Object.entries(manifest.files)) await pin(entry(dist, name), digest);
  const pkg = JSON.parse(await pin(resolve(root, 'packages/core/package.json')));
  assert(pkg.name === '@hwpjs/core', 'ShapeCopyCorePackageMismatch');
  assert(
    pkg.exports?.['.']?.import === './dist/index.js' &&
      pkg.exports?.['./runtime']?.import === './dist/runtime.js',
    'ShapeCopyCoreExportsMismatch',
  );
  const sourceNative = await pin(wasmPath);
  const artifact = JSON.parse(await pin(resolve(dist, 'wasm-artifact.json')));
  const NativePath = resolve(dist, 'hwpjs.wasm');
  const compiled = await pin(NativePath, NativeSHA256);
  assert(
    artifact.sha256 === NativeSHA256 &&
      artifact.bytes === compiled.length &&
      artifact.sourceSha256 === sha(sourceNative) &&
      artifact.sourceBytes === sourceNative.length &&
      artifact.identicalRuntime === true,
    'ShapeCopyWasmArtifactMismatch',
  );
  const ledgerRoot = resolve(root, 'zig-out/package-build');
  const ledgers = (await readdir(ledgerRoot)).filter((name) =>
    /^core-[\w-]+\.sources\.json$/.test(name),
  );
  let sourceLedger;
  for (const name of ledgers) {
    const path = entry(ledgerRoot, name),
      raw = await bytes(path);
    if (sha(raw) !== manifest.sourceFingerprint) continue;
    const rows = JSON.parse(raw);
    assert(Object.keys(rows).length > 0, 'ShapeCopySourceLedgerEmpty');
    for (const [path, digest] of Object.entries(rows)) await pin(below(root, path), digest);
    await pin(path, manifest.sourceFingerprint);
    sourceLedger ??= path;
  }
  assert(sourceLedger, 'ShapeCopySourceLedgerMissing');
  const fixtures = {};
  for (const [format, name] of [
    ['hwp5', 'noori.hwp'],
    ['hwpx', 'noori.hwpx'],
  ]) {
    const rel = 'apps/docs/docs/public/editor/fixtures/' + name;
    assert(!lexicalPath(rel), 'ShapeCopyFixtureNotApproved');
    fixtures[format] = resolve(root, rel);
    await pin(fixtures[format]);
  }
  return {
    schemaVersion: 2,
    sourceRoot: root,
    coreIndex: resolve(dist, 'index.js'),
    runtimeIndex: resolve(dist, 'runtime.js'),
    NativePath,
    NativeSHA256,
    coreManifest: {
      path: manifestPath,
      sha256: sha(manifestBytes),
      sourceFingerprint: manifest.sourceFingerprint,
    },
    sourceLedger,
    sourceNative: { path: wasmPath, sha256: sha(sourceNative) },
    fixtures,
    files: [...pins.values()].sort((a, b) => a.path.localeCompare(b.path)),
  };
}
export async function verifyShapeCopyTestInputs(inputs) {
  assert(
    inputs?.schemaVersion === 2 && hash(inputs.NativeSHA256),
    'ShapeCopyManifestBoundInputsRequired',
  );
  absolute(inputs.sourceRoot);
  absolute(inputs.NativePath);
  assert(
    inputs.NativePath === resolve(inputs.sourceRoot, 'packages/core/dist/hwpjs.wasm'),
    'ShapeCopyNativeOutsideCore',
  );
  assert(
    inputs.coreIndex === resolve(inputs.sourceRoot, 'packages/core/dist/index.js') &&
      inputs.runtimeIndex === resolve(inputs.sourceRoot, 'packages/core/dist/runtime.js'),
    'ShapeCopyCoreEntryMismatch',
  );
  const expected = await createShapeCopyTestInputs({
    root: inputs.sourceRoot,
    wasmPath: absolute(inputs.sourceNative?.path),
  });
  assert.deepEqual(inputs, expected, 'ShapeCopyConfigOrManifestBindingMismatch');
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const options = new Map();
  assert(process.argv.length === 6, 'Usage: --wasm ABS --out ABS');
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i];
    assert(['--wasm', '--out'].includes(key) && !options.has(key), 'ShapeCopyInvalidOption');
    options.set(key, absolute(process.argv[i + 1]));
  }
  assert(options.size === 2, 'ShapeCopyExplicitInputsRequired');
  const inputs = await createShapeCopyTestInputs({
    root: fileURLToPath(new URL('../', import.meta.url)).replace(/\/$/, ''),
    wasmPath: options.get('--wasm'),
  });
  await mkdir(dirname(options.get('--out')), { recursive: true });
  await writeFile(options.get('--out'), JSON.stringify(inputs, null, 2) + '\n', { flag: 'wx' });
  console.log(
    JSON.stringify({
      path: options.get('--out'),
      NativeSHA256: inputs.NativeSHA256,
      sourceFingerprint: inputs.coreManifest.sourceFingerprint,
      pinnedFiles: inputs.files.length,
    }),
  );
}
