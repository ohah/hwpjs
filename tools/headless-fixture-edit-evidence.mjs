import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
const productKeys = [
  'packages/core/dist/index.js',
  'packages/core/dist/runtime.js',
  'apps/demo/src/document-loader.ts',
  'tools/hwpx-plain-splice-oracle.py',
  'tools/hwpx_text_snapshot_order.py',
  'tests/hwp5/style-preservation/text-record-oracle.mjs',
];
const sha = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const lifecycleKeys = [
  'loaded',
  'applied',
  'selectedText',
  'saved',
  'undo',
  'redo',
  'reopened',
  'exactResave',
  'complete',
];

/** Reuse recorded observations only under byte-identical product and old oracle.
 * Harness changes do not turn these observations into executions of the new tool.
 */
export function verifiedFixtureEvidence({ manifest, summary, results }, { wasmSHA, provenance }) {
  assert(sha(wasmSHA), 'InvalidEvidenceWasmSHA');
  assert.equal(manifest?.wasmSHA, wasmSHA, 'ReusedEvidenceWasmMismatch');
  assert(
    summary?.implementationUnchanged === true &&
      summary?.sourceFilesUnchanged === true &&
      summary?.wasmUnchanged === true,
    'UnstableReusedEvidence',
  );
  for (const key of productKeys)
    assert(
      sha(provenance[key]) && manifest.provenance?.[key] === provenance[key],
      `ReusedEvidenceProductMismatch:${key}`,
    );
  for (const key of [
    'tools/hwpx-insertion-oracle.mjs',
    'tools/hwpx-insertion-site.py',
    'tools/hwpx-insertion-source.py',
    'tools/hwpx-anchor-prefix-oracle.py',
  ])
    if (Object.hasOwn(manifest.provenance ?? {}, key))
      assert(
        sha(provenance[key]) && manifest.provenance[key] === provenance[key],
        `ReusedEvidenceOracleMismatch:${key}`,
      );
  const passwordPolicy = 'tools/fixture-known-password.mjs';
  if (Object.hasOwn(manifest.provenance ?? {}, passwordPolicy))
    assert(
      sha(provenance[passwordPolicy]) &&
        manifest.provenance[passwordPolicy] === provenance[passwordPolicy],
      'ReusedEvidencePasswordPolicyMismatch',
    );
  assert(Array.isArray(manifest.inputs) && Array.isArray(results), 'InvalidEvidenceInventory');
  assert(
    manifest.inputs.every((row) => typeof row.path === 'string' && sha(row.sha256)),
    'InvalidEvidenceInput',
  );
  assert(
    new Set(manifest.inputs.map((row) => row.path)).size === manifest.inputs.length,
    'DuplicateEvidenceInput',
  );
  assert(
    new Set(results.map((row) => row?.path)).size === results.length,
    'DuplicateEvidenceResult',
  );
  assert(
    summary.completedPaths === results.length && summary.selectedPaths === manifest.inputs.length,
    'EvidenceCountMismatch',
  );
  const inventory = new Map(manifest.inputs.map((row) => [row.path, row.sha256])),
    verified = new Map();
  for (const row of results) {
    assert(
      typeof row?.path === 'string' &&
        sha(row.sourceSHA) &&
        inventory.get(row.path) === row.sourceSHA,
      'InvalidEvidenceSourceIdentity',
    );
    if (row.status !== 'verified') continue;
    assert(
      row.independentVerified === true &&
        row.sourceUnchanged === true &&
        row.cleanup?.ownedGroupInactive === true &&
        row.cleanup?.remainingDescendants === false,
      'IncompleteVerifiedEvidence',
    );
    assert(
      row.childExitCode === 0 &&
        row.childSignal === null &&
        lifecycleKeys.every((key) => row.lifecycle?.[key] === true),
      'IncompleteEvidenceLifecycle',
    );
    if (row.format === 'hwpx')
      assert(
        row.oracle?.controls?.length === 2 &&
          ['normal', 'optimized'].every((mode) =>
            row.oracle.controls.some(
              (control) =>
                control.mode === mode &&
                control.status === 'pass' &&
                control.wrongExpectedRejected === true,
            ),
          ),
        'IncompleteEvidenceOracle',
      );
    else
      assert(
        row.format === 'hwp5' && row.oracle?.wrongExpectedRejected === true,
        'IncompleteEvidenceOracle',
      );
    if (!verified.has(row.sourceSHA)) verified.set(row.sourceSHA, row);
  }
  return verified;
}

export async function readVerifiedFixtureEvidence(directory, current) {
  const root = resolve(directory),
    paths = ['manifest.json', 'summary.json', 'results.jsonl'];
  const data = await Promise.all(paths.map((path) => readFile(join(root, path), 'utf8')));
  const rows = data[2].trim()
    ? data[2]
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line))
    : [];
  const verified = verifiedFixtureEvidence(
    { manifest: JSON.parse(data[0]), summary: JSON.parse(data[1]), results: rows },
    current,
  );
  return {
    verified,
    source: {
      directory: root,
      artifactHashes: Object.fromEntries(
        paths.map((path, index) => [path, createHash('sha256').update(data[index]).digest('hex')]),
      ),
    },
  };
}
