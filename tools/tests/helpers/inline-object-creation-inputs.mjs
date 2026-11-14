import assert from 'node:assert/strict';
import { readFileSync, lstatSync, realpathSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { isAbsolute, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const OLD_879_SHA256 = '87907e0b06d2a9021fd3ef5f788a783c8e231e4e54bf1f4aa61da6e88c5ef7f3';
export const projectRoot = fileURLToPath(new URL('../../../', import.meta.url));
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const guard = (path) => {
  assert(typeof path === 'string' && isAbsolute(path), 'ExplicitAbsoluteInputRequired');
  assert(!/hwpers|title-column-roundtrip/i.test(path), 'ProtectedBeforeAccess');
  assert(!path.split(/[\\/]/).includes('..'), 'ParentTraversalForbidden');
  return path;
};
function pinned(path, expected) {
  guard(path);
  assert(/^[0-9a-f]{64}$/.test(expected ?? ''), 'ExplicitSha256Required');
  assert(lstatSync(path).isFile() && !lstatSync(path).isSymbolicLink(), 'InputNotRegularFile');
  const actual = guard(realpathSync(path));
  const bytes = readFileSync(actual);
  assert.equal(hash(bytes), expected, 'InputSha256Mismatch:' + actual);
  return bytes;
}
export function validateInlineObjectCreationInputs(env = process.env) {
  const candidateSha256 = env.HWPJS_TEST_WASM_EXPECTED_SHA256;
  const wasm = pinned(env.HWPJS_TEST_WASM, candidateSha256);
  const old = pinned(env.HWPJS_TEST_OLD_WASM, OLD_879_SHA256);
  for (const bytes of [wasm, old])
    assert(bytes.subarray(0, 8).equals(Buffer.from([0, 97, 115, 109, 1, 0, 0, 0])), 'InvalidWasm');
  assert.notEqual(candidateSha256, OLD_879_SHA256, 'NewCreationCandidateRequired');
  const metadata = JSON.parse(
    readFileSync(new URL('../fixtures/inline-object-creation-seed.json', import.meta.url), 'utf8'),
  );
  const seed = pinned(
    fileURLToPath(new URL('../fixtures/inline-object-creation-seed.hwpx', import.meta.url)),
    metadata.sha256,
  );
  assert.equal(seed.length, metadata.bytes);
  const directory = guard(env.HWPJS_TEST_EVIDENCE_DIR);
  const ownedRoots = [
    resolve(projectRoot, 'zig-out/verification'),
    ...(env.RUNNER_TEMP ? [resolve(env.RUNNER_TEMP)] : []),
  ];
  assert(
    ownedRoots.some((root) => directory.startsWith(root + sep)),
    'UnownedEvidenceDirectory',
  );
  return { wasm, old, seed, directory, candidateSha256, seedSha256: metadata.sha256 };
}
export async function compileInlineObjectCreationInputs() {
  const inputs = validateInlineObjectCreationInputs();
  assert(
    lstatSync(inputs.directory).isDirectory() && !lstatSync(inputs.directory).isSymbolicLink(),
    'PreparedEvidenceDirectoryRequired',
  );
  return {
    module: await WebAssembly.compile(inputs.wasm),
    old: await WebAssembly.compile(inputs.old),
    seed: inputs.seed,
    evidence: pathToFileURL(inputs.directory + sep),
  };
}

export function validateInlineObjectCaretFixtures() {
  const base = new URL('../fixtures/inline-object-caret/', import.meta.url);
  const metadata = JSON.parse(readFileSync(new URL('pins.json', base), 'utf8'));
  assert.deepEqual(Object.keys(metadata).sort(), [
    'caret-after-split.hwpx',
    'chart-created-edited.hwpx',
  ]);
  for (const [name, pin] of Object.entries(metadata)) {
    const bytes = pinned(fileURLToPath(new URL(name, base)), pin.sha256);
    assert.equal(bytes.length, pin.bytes);
  }
}
