import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, realpath } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { validateExplicitFixturePolicy } from './fixture-policy.mjs';

export const HWP5_MARGIN_RECEIPT = 'tools/pages-demo/hwp5-outer-margins-fixture-receipt.json';
export const CURRENT_PUBLIC_FIXTURE_POLICY = 'tools/pages-demo/public-gallery-fixtures.json';
export const HWP5_MARGIN_BASE_POLICY = 'tools/pages-demo/public-gallery-fixtures-126.json';
const knownReceipt = {
  feature: 'hwp5-outer-margins',
  sha256: 'ce88245934d54e71730dac64770ab71dced91a6b627ac920eae4ee58a7c7f243',
  baselinePolicy: HWP5_MARGIN_BASE_POLICY,
  additions: 2,
};
export const HWP5_LINE_CHART_RECEIPT = 'tools/pages-demo/hwp5-line-chart-fixture-receipt.json';
export const HWP5_VERTICAL_MARGINS_RECEIPT =
  'tools/pages-demo/hwp5-vertical-margins-fixture-receipt.json';
export const ANCHORED_PICTURE_RECEIPT = 'tools/pages-demo/anchored-picture-fixture-receipt.json';
const approvedReceipts = new Map([
  [
    ANCHORED_PICTURE_RECEIPT,
    {
      feature: 'anchored-picture-resize',
      sha256: 'da624a4bf50340c44eda878318f57f2df6ae839d1d66b4833be78fde2e3bbccc',
      baselinePolicy: 'tools/pages-demo/public-gallery-fixtures-131.json',
      additions: 2,
    },
  ],
  [
    HWP5_VERTICAL_MARGINS_RECEIPT,
    {
      feature: 'hwp5-vertical-margins',
      sha256: '1471bf7fc065e8c058ce09a2fe5818ed72590c686675e3c99740f66c14d92a6f',
      baselinePolicy: 'tools/pages-demo/public-gallery-fixtures-129.json',
      additions: 2,
    },
  ],
  [HWP5_MARGIN_RECEIPT, knownReceipt],
  [
    HWP5_LINE_CHART_RECEIPT,
    {
      feature: 'hwp5-line-chart',
      sha256: '6dc6c78f1a838eb92b0001c2d1c477edf86bf6dc59286b408a3ac76746fffa99',
      baselinePolicy: 'tools/pages-demo/public-gallery-fixtures-128.json',
      additions: 1,
    },
  ],
]);

function receiptApproval(root, receiptPath) {
  const approval = approvedReceipts.get(relative(root, resolve(receiptPath)));
  assert(approval, 'UnapprovedFixtureExtension');
  return approval;
}

/** Ordinary production follows the active policy; explicit replay uses its pinned basis. */
export function loadPublicFixtureBaselinePolicy({ root, receiptPath, read }) {
  const policy =
    receiptPath === undefined
      ? CURRENT_PUBLIC_FIXTURE_POLICY
      : receiptApproval(root, receiptPath).baselinePolicy;
  return read(resolve(root, policy));
}
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
const bytesOf = (value) => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const equal = (a, b, message) => assert.deepEqual(a, b, message);

/** Pure assembly after the caller authenticates the source-controlled receipt. */
export function extendPublicFixtureFiles({
  files,
  baselineManifestBytes,
  baselinePolicyBytes,
  receipt,
  targetPolicyBytes,
  artifacts,
  approval = knownReceipt,
}) {
  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.feature, approval.feature);
  assert.equal(
    digest(baselineManifestBytes),
    receipt.baseManifestSHA256,
    'FixtureBaseManifestMismatch',
  );
  assert.equal(digest(baselinePolicyBytes), receipt.basePolicySHA256, 'FixtureBasePolicyMismatch');
  assert.equal(
    digest(targetPolicyBytes),
    receipt.targetPolicySHA256,
    'FixtureTargetPolicyMismatch',
  );
  const baselinePolicy = JSON.parse(baselinePolicyBytes);
  assert.equal(baselinePolicy.files.length, receipt.baseCount);
  assert.equal(baselinePolicy.catalogSHA256, receipt.baseCatalogSHA256);
  validateExplicitFixturePolicy(files, baselinePolicy);
  // The old manifest and all its bytes remain the authenticated starting point.
  const manifest = JSON.parse(baselineManifestBytes);
  assert.equal(files.get('manifest.json')?.equals(baselineManifestBytes), true);
  const listed = new Set(['manifest.json']);
  for (const row of manifest.files) {
    assert(!listed.has(row.path), 'FixtureDuplicateBaseFile');
    listed.add(row.path);
    const bytes = files.get(row.path);
    assert(
      bytes && bytes.length === row.bytes && digest(bytes) === row.sha256,
      'FixtureBaseFileMismatch',
    );
  }
  equal([...files.keys()].sort(), [...listed].sort(), 'FixtureUnlistedBaseFile');
  assert.equal(receipt.additions.length, approval.additions);
  assert.equal(receipt.targetCount, receipt.baseCount + approval.additions);
  equal(
    [...artifacts.keys()].sort(),
    receipt.additions.map(({ row }) => row.id).sort(),
    'FixtureArtifactSetMismatch',
  );
  const targetPolicy = JSON.parse(targetPolicyBytes);
  const existing = new Set(baselinePolicy.files.map((row) => row.id));
  const result = new Map(files);
  result.delete('manifest.json');
  for (const addition of receipt.additions) {
    const { row } = addition;
    assert(!existing.has(row.id) && !result.has(row.path), 'FixtureExistingIdOverwrite');
    existing.add(row.id);
    const parent = baselinePolicy.files.find((candidate) => candidate.id === addition.parentId);
    assert(
      parent && parent.sha256 === addition.parentSHA256 && parent.bytes === addition.parentBytes,
      'FixtureParentMismatch',
    );
    const parentBytes = files.get(parent.path);
    assert(
      parentBytes &&
        parentBytes.length === addition.parentBytes &&
        digest(parentBytes) === addition.parentSHA256,
      'FixtureParentBytesMismatch',
    );
    const bytes = artifacts.get(row.id);
    assert(
      bytes && bytes.length === row.bytes && digest(bytes) === row.sha256,
      'FixtureArtifactMismatch',
    );
    result.set(row.path, bytes);
  }
  equal(
    targetPolicy.files,
    [...baselinePolicy.files, ...receipt.additions.map(({ row }) => row)],
    'FixtureTargetRowsMismatch',
  );
  const catalogBytes = bytesOf(
    targetPolicy.files.map(({ id, name, label }) => ({ id, name, label, available: true })),
  );
  assert.equal(digest(catalogBytes), receipt.targetCatalogSHA256, 'FixtureTargetCatalogMismatch');
  assert.equal(targetPolicy.catalogSHA256, receipt.targetCatalogSHA256);
  assert.equal(targetPolicy.files.length, receipt.targetCount);
  result.set('fixture-catalog.json', catalogBytes);
  const embeddedPolicy = result.get('fixture-policy.json');
  if (embeddedPolicy)
    assert(embeddedPolicy.equals(baselinePolicyBytes), 'FixtureEmbeddedBasePolicyMismatch');
  result.set('fixture-policy.json', targetPolicyBytes);
  validateExplicitFixturePolicy(result, targetPolicy);
  return {
    files: result,
    policy: targetPolicy,
    binding: {
      feature: receipt.feature,
      receiptSHA256: approval.sha256,
      baseManifestSHA256: receipt.baseManifestSHA256,
      basePolicySHA256: receipt.basePolicySHA256,
      targetPolicySHA256: receipt.targetPolicySHA256,
      catalogSHA256: receipt.targetCatalogSHA256,
      baseCount: receipt.baseCount,
      targetCount: receipt.targetCount,
    },
  };
}

/** No option means no receipt/artifact IO and leaves the ordinary producer unchanged. */
export async function loadPublicFixtureExtension({
  root,
  receiptPath,
  baseline,
  baselinePolicyBytes,
  read,
}) {
  if (receiptPath === undefined) return null;
  const canonicalRoot = await realpath(root);
  const approval = receiptApproval(canonicalRoot, receiptPath);
  async function approvedRead(relativePath) {
    assert(typeof relativePath === 'string' && relativePath.startsWith('tools/pages-demo/'));
    assert(relativePath.split('/').every((part) => part && part !== '.' && part !== '..'));
    const path = resolve(canonicalRoot, relativePath);
    assert.equal(await realpath(path), path, 'FixtureInputSymlink');
    const info = await lstat(path);
    assert(info.isFile() && !info.isSymbolicLink(), 'FixtureInputNotRegular');
    assert(info.size > 0 && info.size <= 256 * 1024, 'FixtureInputSizeLimit');
    return read(path);
  }
  const receiptBytes = await approvedRead(relative(canonicalRoot, resolve(receiptPath)));
  assert.equal(digest(receiptBytes), approval.sha256, 'UnapprovedFixtureReceipt');
  const receipt = JSON.parse(receiptBytes);
  const targetPolicyBytes = await approvedRead(receipt.targetPolicyPath);
  const artifacts = new Map();
  for (const addition of receipt.additions) {
    assert(!artifacts.has(addition.row.id), 'DuplicateFixtureExtensionInput');
    artifacts.set(addition.row.id, await approvedRead(addition.sourcePath));
  }
  return extendPublicFixtureFiles({
    files: baseline.files,
    baselineManifestBytes: baseline.manifestBytes,
    baselinePolicyBytes,
    receipt,
    targetPolicyBytes,
    artifacts,
    approval,
  });
}
