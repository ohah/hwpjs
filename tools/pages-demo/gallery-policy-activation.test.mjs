import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  CURRENT_PUBLIC_FIXTURE_POLICY,
  ANCHORED_PICTURE_RECEIPT,
  HWP5_LINE_CHART_RECEIPT,
  HWP5_VERTICAL_MARGINS_RECEIPT,
  HWP5_MARGIN_BASE_POLICY,
  HWP5_MARGIN_RECEIPT,
  loadPublicFixtureBaselinePolicy,
  loadPublicFixtureExtension,
} from './fixture-extension.mjs';
import { publicFixtureModules } from './public-fixture-modules.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url)),
  bytes = (name) => readFile(new URL('./' + name, import.meta.url)),
  sha = (b) => createHash('sha256').update(b).digest('hex');
test('archived128 is the exact approved margin target and archived126 remains the immutable receipt basis', async () => {
  const [current, old, target, receiptBytes] = await Promise.all([
    bytes('public-gallery-fixtures-128.json'),
    bytes('public-gallery-fixtures-126.json'),
    bytes('hwp5-outer-margins-fixture-policy.json'),
    bytes('hwp5-outer-margins-fixture-receipt.json'),
  ]);
  const receipt = JSON.parse(receiptBytes),
    active = JSON.parse(current),
    historical = JSON.parse(old);
  assert.equal(active.files.length, 128);
  assert.equal(historical.files.length, 126);
  assert.deepEqual(current, target);
  assert.equal(sha(old), receipt.basePolicySHA256);
  assert.equal(sha(current), receipt.targetPolicySHA256);
  assert.deepEqual(active.files, [...historical.files, ...receipt.additions.map((a) => a.row)]);
  assert.equal(
    sha(receiptBytes),
    'ce88245934d54e71730dac64770ab71dced91a6b627ac920eae4ee58a7c7f243',
  );
});
test('archived129 appends only the approved line file and preserves the archived basis', async () => {
  const receiptPath = resolve(root, HWP5_LINE_CHART_RECEIPT);
  const baseline = await loadPublicFixtureBaselinePolicy({ root, receiptPath, read: readFile });
  const current = await bytes('public-gallery-fixtures-129.json');
  const receipt = JSON.parse(await readFile(receiptPath));
  assert.equal(sha(baseline), receipt.basePolicySHA256);
  assert.equal(sha(current), receipt.targetPolicySHA256);
  assert.deepEqual(JSON.parse(current).files, [
    ...JSON.parse(baseline).files,
    receipt.additions[0].row,
  ]);
  assert.equal(
    sha(await readFile(resolve(root, receipt.additions[0].sourcePath))),
    receipt.additions[0].row.sha256,
  );
});
test('archived131 appends the exact vertical-margin samples to the archived129', async () => {
  const receiptPath = resolve(root, HWP5_VERTICAL_MARGINS_RECEIPT);
  const baseline = await loadPublicFixtureBaselinePolicy({ root, receiptPath, read: readFile });
  const current = await bytes('public-gallery-fixtures-131.json');
  const receipt = JSON.parse(await readFile(receiptPath));
  assert.equal(sha(baseline), receipt.basePolicySHA256);
  assert.equal(sha(current), receipt.targetPolicySHA256);
  assert.deepEqual(JSON.parse(current).files, [
    ...JSON.parse(baseline).files,
    ...receipt.additions.map((item) => item.row),
  ]);
  for (const item of receipt.additions)
    assert.equal(sha(await readFile(resolve(root, item.sourcePath))), item.row.sha256);
});
test('actual producer policy reader defaults to139 and historical margin extension uses126 without touching the receipt', async () => {
  for (const extension of [undefined, resolve(root, HWP5_MARGIN_RECEIPT)]) {
    const reads = [];
    const data = await loadPublicFixtureBaselinePolicy({
      root,
      receiptPath: extension,
      async read(path) {
        reads.push(path);
        return readFile(path);
      },
    });
    assert.deepEqual(reads, [
      resolve(
        root,
        extension === undefined ? CURRENT_PUBLIC_FIXTURE_POLICY : HWP5_MARGIN_BASE_POLICY,
      ),
    ]);
    assert.equal(JSON.parse(data).files.length, extension === undefined ? 139 : 126);
  }
  let extra = 0;
  assert.equal(
    await loadPublicFixtureExtension({
      root,
      receiptPath: undefined,
      read() {
        extra++;
        throw Error('UnexpectedReceiptIO');
      },
    }),
    null,
  );
  assert.equal(extra, 0);
});
test('current139 source metadata covers every exact ID without rewriting historical sourceHEAD', async () => {
  const [
    policyBytes,
    sourceBytes,
    historicalBytes,
    receiptBytes,
    lineReceiptBytes,
    verticalReceiptBytes,
    anchoredReceiptBytes,
    horizontalReceiptBytes,
    pieReceiptBytes,
    pageRestartReceiptBytes,
    tableMergeReceiptBytes,
  ] = await Promise.all([
    bytes('public-gallery-fixtures.json'),
    bytes('public-gallery-current-sources.json'),
    bytes('public-gallery-sources.json'),
    bytes('hwp5-outer-margins-fixture-receipt.json'),
    bytes('hwp5-line-chart-fixture-receipt.json'),
    bytes('hwp5-vertical-margins-fixture-receipt.json'),
    bytes('anchored-picture-fixture-receipt.json'),
    bytes('hwp5-horizontal-chart-fixture-receipt.json'),
    bytes('hwp5-pie-chart-fixture-receipt.json'),
    bytes('page-restart-fixture-receipt.json'),
    bytes('table-merge-fixture-receipt.json'),
  ]);
  const policy = JSON.parse(policyBytes),
    current = JSON.parse(sourceBytes),
    historic = JSON.parse(historicalBytes),
    receipt = JSON.parse(receiptBytes);
  assert.equal(current.schemaVersion, 1);
  assert.equal(current.policy, 'public-gallery-fixtures.json');
  assert.equal(current.policySHA256, sha(policyBytes));
  assert.deepEqual(
    Object.keys(current.sourcePaths),
    policy.files.map((r) => r.id),
  );
  assert.equal(Object.keys(current.sourcePaths).length, 139);
  assert.equal('sourceHEAD' in current, false);
  assert.equal(historic.sourceHEAD, '8376bd004580d2429a52be544a1706210a21b0fd');
  for (const row of policy.files) {
    const addition = [
      ...receipt.additions,
      ...JSON.parse(lineReceiptBytes).additions,
      ...JSON.parse(verticalReceiptBytes).additions,
      ...JSON.parse(anchoredReceiptBytes).additions,
      ...JSON.parse(horizontalReceiptBytes).additions,
      ...JSON.parse(pieReceiptBytes).additions,
      ...JSON.parse(pageRestartReceiptBytes).additions,
      ...JSON.parse(tableMergeReceiptBytes).additions,
    ].find((a) => a.row.id === row.id);
    assert.equal(
      current.sourcePaths[row.id],
      addition ? addition.sourcePath : 'apps/docs/docs/public/editor/' + row.path,
    );
    assert.doesNotMatch(current.sourcePaths[row.id], /(?:^\/|\.\.|hwpers|title-column)/i);
  }
});
test('workflow defaults stay bound to the active generic policy; public modules expose both new IDs without source paths', async () => {
  const [docs, quality, producer] = await Promise.all(
    [
      '.github/workflows/docs.yml',
      '.github/workflows/javascript-quality.yml',
      'tools/build-public-demo.mjs',
    ].map((p) => readFile(resolve(root, p), 'utf8')),
  );
  assert.match(docs, /--fixture-policy tools\/pages-demo\/public-gallery-fixtures\.json/);
  assert.match(
    quality,
    /HWPJS_TEST_PUBLIC_FIXTURE_POLICY: tools\/pages-demo\/public-gallery-fixtures\.json/,
  );
  assert.match(quality, /tools\/pages-demo\/gallery-policy-activation\.test\.mjs/);
  assert.match(producer, /await loadPublicFixtureBaselinePolicy\(/);
  assert.match(producer, /fixtures: policy\.files\.map/);
  const policy = JSON.parse(await bytes('public-gallery-fixtures.json')),
    modules = publicFixtureModules(policy);
  assert.match(modules.inventory, /hwp5-picture-outer-margins\.hwp/);
  assert.match(modules.inventory, /hwp5-textbox-outer-margins\.hwp/);
  assert.doesNotMatch(
    modules.inventory,
    /sourcePaths|sourceHEAD|apps\/docs|tools\/pages-demo|sha256/,
  );
});

test('gallery assembly regression uses current source metadata with an exact policy hash fence', async () => {
  const script = await readFile(
    resolve(root, 'tests/tools/pages-demo-fixture-policy.test.mjs'),
    'utf8',
  );
  assert.match(script, /public-gallery-current-sources\.json/);
  assert.match(script, /data\.policySHA256 !== sha\(policyBytes\)/);
  assert.doesNotMatch(script, /public-gallery-sources\.json/);
});

test('historical133 appends exactly the anchored HWP5 and HWPX examples to immutable131', async () => {
  const receiptPath = resolve(root, ANCHORED_PICTURE_RECEIPT);
  const baseline = await loadPublicFixtureBaselinePolicy({ root, receiptPath, read: readFile });
  const receiptBytes = await readFile(receiptPath);
  const receipt = JSON.parse(receiptBytes);
  const targetBytes = await bytes('public-gallery-fixtures-133.json');
  const target = JSON.parse(targetBytes);
  assert.deepEqual(baseline, await bytes('public-gallery-fixtures-131.json'));
  assert.deepEqual(baseline, await bytes('hwp5-vertical-margins-fixture-policy.json'));
  assert.equal(sha(baseline), receipt.basePolicySHA256);
  assert.equal(sha(targetBytes), receipt.targetPolicySHA256);
  assert.deepEqual(targetBytes, await bytes('anchored-picture-fixture-policy.json'));
  assert.equal(target.files.length, 133);
  assert.deepEqual(target.files, [
    ...JSON.parse(baseline).files,
    ...receipt.additions.map((a) => a.row),
  ]);
  assert.deepEqual(
    receipt.additions.map((a) => a.row.id),
    ['anchored-picture.hwp', 'anchored-picture.hwpx'],
  );
  for (const addition of receipt.additions) {
    const value = await readFile(resolve(root, addition.sourcePath));
    assert.equal(value.length, addition.row.bytes);
    assert.equal(sha(value), addition.row.sha256);
    const parent = JSON.parse(baseline).files.find((r) => r.id === addition.parentId);
    assert.equal(parent.sha256, addition.parentSHA256);
    assert.equal(parent.bytes, addition.parentBytes);
    assert.equal(
      sha(await bytes('anchored-picture-fixture-provenance.json')),
      addition.provenanceSHA256,
    );
  }
  const catalog = Buffer.from(
    JSON.stringify(
      target.files.map(({ id, name, label }) => ({ id, name, label, available: true })),
      null,
      2,
    ) + '\n',
  );
  assert.equal(sha(catalog), receipt.targetCatalogSHA256);
  assert.equal(target.catalogSHA256, receipt.targetCatalogSHA256);
  const modules = publicFixtureModules(target);
  assert.match(modules.inventory, /anchored-picture\.hwp/);
  assert.match(modules.inventory, /anchored-picture\.hwpx/);
  assert.doesNotMatch(
    modules.inventory,
    /sourcePath|provenance|parentSHA256|\/private\/|\/Users\//,
  );
});

test('anchored registry authenticates exact receipt inputs but still rejects an unrelated base manifest', async () => {
  const receiptPath = resolve(root, ANCHORED_PICTURE_RECEIPT);
  const baselinePolicyBytes = await loadPublicFixtureBaselinePolicy({
    root,
    receiptPath,
    read: readFile,
  });
  const reads = [];
  await assert.rejects(
    loadPublicFixtureExtension({
      root,
      receiptPath,
      baselinePolicyBytes,
      baseline: { files: new Map(), manifestBytes: Buffer.from('{}') },
      async read(path) {
        reads.push(path);
        return readFile(path);
      },
    }),
    /FixtureBaseManifestMismatch/,
  );
  const receipt = JSON.parse(await readFile(receiptPath));
  assert.deepEqual(reads, [
    receiptPath,
    resolve(root, receipt.targetPolicyPath),
    ...receipt.additions.map((a) => resolve(root, a.sourcePath)),
  ]);
  let count = 0;
  await assert.rejects(
    loadPublicFixtureExtension({
      root,
      receiptPath,
      baselinePolicyBytes,
      async read() {
        count++;
        return Buffer.from('{}');
      },
    }),
    /UnapprovedFixtureReceipt/,
  );
  assert.equal(count, 1);
});

test('historical134 appends one HWP5 horizontal bar example to immutable133', async () => {
  const receiptPath = resolve(root, 'tools/pages-demo/hwp5-horizontal-chart-fixture-receipt.json');
  const baseline = await loadPublicFixtureBaselinePolicy({ root, receiptPath, read: readFile });
  const receipt = JSON.parse(await readFile(receiptPath));
  const activeBytes = await bytes('public-gallery-fixtures-134.json');
  const active = JSON.parse(activeBytes);
  assert.deepEqual(baseline, await bytes('anchored-picture-fixture-policy.json'));
  assert.equal(sha(baseline), receipt.basePolicySHA256);
  assert.equal(sha(activeBytes), receipt.targetPolicySHA256);
  const [addition] = receipt.additions;
  assert.equal(receipt.additions.length, 1);
  assert.equal(addition.row.id, 'hwp5-chart-create-horizontal-bar.hwp');
  assert.deepEqual(active.files, [...JSON.parse(baseline).files, addition.row]);
  const source = await readFile(resolve(root, addition.sourcePath));
  assert.equal(source.length, addition.row.bytes);
  assert.equal(sha(source), addition.row.sha256);
});

test('historical135 appends a single standard HWP5 pie example to immutable134', async () => {
  const receiptPath = resolve(root, 'tools/pages-demo/hwp5-pie-chart-fixture-receipt.json');
  const baseline = await loadPublicFixtureBaselinePolicy({ root, receiptPath, read: readFile });
  const receipt = JSON.parse(await readFile(receiptPath));
  const activeBytes = await bytes('public-gallery-fixtures-135.json');
  const active = JSON.parse(activeBytes);
  assert.deepEqual(baseline, await bytes('hwp5-horizontal-chart-fixture-policy.json'));
  assert.equal(sha(baseline), receipt.basePolicySHA256);
  assert.deepEqual(activeBytes, await bytes('hwp5-pie-chart-fixture-policy.json'));
  assert.equal(sha(activeBytes), receipt.targetPolicySHA256);
  const [addition] = receipt.additions;
  assert.equal(receipt.additions.length, 1);
  assert.equal(addition.row.id, 'hwp5-chart-create-pie.hwp');
  assert.deepEqual(active.files, [...JSON.parse(baseline).files, addition.row]);
  const source = await readFile(resolve(root, addition.sourcePath));
  assert.equal(source.length, addition.row.bytes);
  assert.equal(sha(source), addition.row.sha256);
  const provenance = await bytes('hwp5-pie-chart-fixture-provenance.json');
  assert.equal(sha(provenance), addition.provenanceSHA256);
  assert.deepEqual(JSON.parse(provenance).values, [1, 2, 3]);
});

test('historical137 adds exactly the two own existing PAGE examples to immutable135', async () => {
  const receiptPath = resolve(root, 'tools/pages-demo/page-restart-fixture-receipt.json');
  const baseline = await loadPublicFixtureBaselinePolicy({ root, receiptPath, read: readFile });
  const receiptBytes = await readFile(receiptPath);
  const receipt = JSON.parse(receiptBytes);
  const activeBytes = await bytes('public-gallery-fixtures-137.json');
  assert.deepEqual(baseline, await bytes('public-gallery-fixtures-135.json'));
  assert.deepEqual(baseline, await bytes('hwp5-pie-chart-fixture-policy.json'));
  assert.equal(sha(baseline), receipt.basePolicySHA256);
  assert.equal(
    receipt.baseManifestSHA256,
    'f6be27b5b485e16ca64ad1895f0d6bc46a3d89010a4c70734ed57947ee5eaba9',
  );
  assert.equal(receipt.baseCount, 135);
  assert.equal(receipt.targetCount, 137);
  assert.deepEqual(activeBytes, await bytes('page-restart-fixture-policy.json'));
  assert.equal(sha(activeBytes), receipt.targetPolicySHA256);
  assert.deepEqual(JSON.parse(activeBytes).files, [
    ...JSON.parse(baseline).files,
    ...receipt.additions.map((a) => a.row),
  ]);
  assert.deepEqual(
    receipt.additions.map((a) => a.row.id),
    ['hwp5-page-restart.hwp', 'hwpx-page-restart.hwpx'],
  );
  const provenanceBytes = await bytes('page-restart-fixture-provenance.json');
  const provenance = JSON.parse(provenanceBytes);
  const recipeBytes = await bytes('page-restart-fixture-recipe.json');
  const recipe = JSON.parse(recipeBytes);
  assert.equal(sha(recipeBytes), provenance.recipeSHA256);
  assert.equal(provenance.claims.newControlInsertion, false);
  assert.equal(provenance.claims.defaultEditedHwp5Save, false);
  for (const addition of receipt.additions) {
    const artifact = await readFile(resolve(root, addition.sourcePath));
    assert.equal(artifact.length, addition.row.bytes);
    assert.equal(sha(artifact), addition.row.sha256);
    assert.equal(addition.provenanceSHA256, sha(provenanceBytes));
    const parent = JSON.parse(baseline).files.find((r) => r.id === addition.parentId);
    assert.equal(parent.bytes, addition.parentBytes);
    assert.equal(parent.sha256, addition.parentSHA256);
    const parentBytes = await readFile(resolve(root, 'apps/docs/docs/public/editor', parent.path));
    assert.equal(parentBytes.length, addition.parentBytes);
    assert.equal(sha(parentBytes), addition.parentSHA256);
  }
  for (const format of ['HWP5', 'HWPX']) {
    for (const key of format === 'HWP5'
      ? ['producer', 'normalBlankProducer', 'restartRecordProducer', 'containerProofProducer']
      : ['normalBlankProducer']) {
      assert.equal(
        sha(await readFile(resolve(root, recipe[format][key]))),
        recipe[format][key + 'SHA256'],
      );
    }
  }
  const first = [];
  await assert.rejects(
    loadPublicFixtureExtension({
      root,
      receiptPath,
      baselinePolicyBytes: baseline,
      read(path) {
        first.push(path);
        return Buffer.from('{}');
      },
    }),
    /UnapprovedFixtureReceipt/,
  );
  assert.deepEqual(first, [receiptPath]);
  const inventory = publicFixtureModules(JSON.parse(activeBytes)).inventory;
  assert.match(inventory, /hwp5-page-restart\.hwp/);
  assert.match(inventory, /hwpx-page-restart\.hwpx/);
  assert.doesNotMatch(
    inventory,
    /sourcePath|recipePath|GUIAudit|parentSHA256|\/private\/|\/Users\//,
  );
});

test('PAGE parent proof matches approved normal blank bytes in normal and optimized Python', async () => {
  const { spawnSync } = await import('node:child_process');
  for (const flags of [[], ['-O']]) {
    const result = spawnSync(
      'python3',
      ['-B', ...flags, resolve(root, 'tools/pages-demo/verify-page-restart-fixture-parents.py')],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 0, result.stderr);
    const proof = JSON.parse(result.stdout);
    assert.equal(proof['hwp5-page-restart.hwp'].normalBlankHeaderExact, true);
    assert.equal(proof['hwp5-page-restart.hwp'].parentContainerWholePreservationClaim, false);
    assert.equal(proof['hwpx-page-restart.hwpx'].normalBlankOtherEntriesExact, true);
  }
});

test('active139 appends the two own table merge examples to immutable137', async () => {
  const receiptPath = resolve(root, 'tools/pages-demo/table-merge-fixture-receipt.json');
  const before = await loadPublicFixtureBaselinePolicy({ root, receiptPath, read: readFile });
  const active = await bytes('public-gallery-fixtures.json');
  const receipt = JSON.parse(await readFile(receiptPath));
  assert.deepEqual(before, await bytes('public-gallery-fixtures-137.json'));
  assert.equal(sha(before), receipt.basePolicySHA256);
  assert.equal(sha(active), receipt.targetPolicySHA256);
  assert.deepEqual(active, await bytes('table-merge-fixture-policy.json'));
  assert.deepEqual(JSON.parse(active).files, [
    ...JSON.parse(before).files,
    ...receipt.additions.map(({ row }) => row),
  ]);
  const provenance = await bytes('table-merge-fixture-provenance.json');
  for (const addition of receipt.additions) {
    const example = await readFile(resolve(root, addition.sourcePath));
    assert.equal(example.length, addition.row.bytes);
    assert.equal(sha(example), addition.row.sha256);
    assert.equal(sha(provenance), addition.provenanceSHA256);
    const parent = JSON.parse(before).files.find((row) => row.id === addition.parentId);
    assert.equal(addition.parentSHA256, parent.sha256);
    assert.equal(addition.parentBytes, parent.bytes);
  }
});
