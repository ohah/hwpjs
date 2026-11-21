import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import {
  CURRENT_PUBLIC_FIXTURE_POLICY,
  HWP5_MARGIN_BASE_POLICY,
  HWP5_MARGIN_RECEIPT,
  loadPublicFixtureBaselinePolicy,
  loadPublicFixtureExtension,
} from './fixture-extension.mjs';
import { publicFixtureModules } from './public-fixture-modules.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url)),
  bytes = (name) => readFile(new URL('./' + name, import.meta.url)),
  sha = (b) => createHash('sha256').update(b).digest('hex');
test('active128 is the exact approved target and archived126 remains the immutable receipt basis', async () => {
  const [current, old, target, receiptBytes] = await Promise.all([
    bytes('public-gallery-fixtures.json'),
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
test('actual producer policy reader defaults to128 and explicit extension uses126 without touching the receipt', async () => {
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
    assert.equal(JSON.parse(data).files.length, extension === undefined ? 128 : 126);
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
test('current128 source metadata covers every exact ID without rewriting historical sourceHEAD', async () => {
  const [policyBytes, sourceBytes, historicalBytes, receiptBytes] = await Promise.all([
    bytes('public-gallery-fixtures.json'),
    bytes('public-gallery-current-sources.json'),
    bytes('public-gallery-sources.json'),
    bytes('hwp5-outer-margins-fixture-receipt.json'),
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
  assert.equal(Object.keys(current.sourcePaths).length, 128);
  assert.equal('sourceHEAD' in current, false);
  assert.equal(historic.sourceHEAD, '8376bd004580d2429a52be544a1706210a21b0fd');
  for (const row of policy.files) {
    const addition = receipt.additions.find((a) => a.row.id === row.id);
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
