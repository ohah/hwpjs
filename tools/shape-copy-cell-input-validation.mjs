// Normal SDK only; reproducible authored fixtures + an exact test-only strict oracle.
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import { verifyShapeCopyTestInputs } from './shape-copy-test-inputs.mjs';
const sha = (b) => createHash('sha256').update(b).digest('hex');
const root = fileURLToPath(new URL('../', import.meta.url));
const oracle = 'apps/demo/tests/fixtures/shape-copy-strict-oracle/';
function safe(path) {
  assert(typeof path === 'string' && isAbsolute(path) && resolve(path) === path);
  assert(!/hwpers|title-column-roundtrip/iu.test(path), 'ProtectedBeforeAccess');
  return path;
}
async function pinned(row) {
  const b = await readFile(safe(row.path));
  assert.equal(sha(b), row.sha256);
  assert.equal(b.length, row.bytes);
  return b;
}
export async function oracleInputs() {
  const path = resolve(root, oracle, 'MANIFEST.json');
  const raw = await readFile(path);
  assert.equal(sha(raw), '85a8c49b120ea1384b9a0a1fab10404a5e6d97ea02de2fe17eb87c28ccfa303a');
  const m = JSON.parse(raw),
    files = [];
  for (const [name, pin] of Object.entries(m.files)) {
    assert(!isAbsolute(name) && !name.split('/').some((p) => !p || p === '.' || p === '..'));
    const row = { path: resolve(root, oracle, name), ...pin };
    await pinned(row);
    files.push(row);
  }
  return { strictPreimage: files.find((r) => r.path === resolve(root, oracle, m.entry)), files };
}
export async function verifyCellOwnerInputs(inputs) {
  assert.deepEqual(inputs, await oracleInputs(), 'CellStrictOracleBindingMismatch');
}
export async function verifyCellFixtureInputs(inputs) {
  assert.equal(inputs.schemaVersion, 2);
  const base = await readFile(safe(process.env.HWPJS_SHAPE_COPY_INPUTS));
  assert.equal(inputs.baseInputsSHA256, sha(base));
  await verifyShapeCopyTestInputs(JSON.parse(base));
  const kinds = Object.hasOwn(inputs, 'hwpxOpaque')
    ? ['opaque', 'protected', 'mixed-protected']
    : ['mixed-protected', 'unknown-border', 'unknown-fill-alpha', 'unknown-diagonal'];
  assert.deepEqual(
    inputs.files.map((r) => r.kind),
    kinds,
    'CellAuthoredFixtureInventoryMismatch',
  );
  if (Object.hasOwn(inputs, 'hwpxOpaque')) {
    assert.deepEqual(inputs.hwpxOpaque, inputs.files[0]);
    assert.deepEqual(inputs.hwpxProtected, inputs.files[1]);
  }
  for (const r of inputs.files) await pinned(r);
  return inputs;
}
