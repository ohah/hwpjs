import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { sectionCountFixtures } from './section-count-fixtures.mjs';
import { createCfbReader } from '../../js/cfb.mjs';
import { inflateRawSync, deflateRawSync } from 'node:zlib';
import { execFileSync } from '../../tools/oracle-process.mjs';

assert(process.env.HWPJS_TEST_WASM, 'explicit available-section candidate required');
const wasm = readFileSync(process.env.HWPJS_TEST_WASM);
let identity = 0;
async function worker(t, binary = wasm) {
  const previousSelf = globalThis.self,
    previousFetch = globalThis.fetch,
    replies = [];
  globalThis.self = {
    postMessage(reply) {
      replies.push(reply);
    },
  };
  globalThis.fetch = async () => new Response(binary);
  t.after(() => {
    globalThis.fetch = previousFetch;
    if (previousSelf === undefined) delete globalThis.self;
    else globalThis.self = previousSelf;
  });
  identity += 1;
  await import(`../../web/preview/reader-worker.mjs?available=${identity}`);
  return async (message) => {
    await self.onmessage({ data: message });
    assert.equal(replies.length, 1);
    return replies.shift();
  };
}

for (const [name, , declared, available, , paragraphs] of sectionCountFixtures)
  test(`actual Worker available preview refuses every editor command: ${name}`, async (t) => {
    const path = `reference/rhwp/samples/${name}`;
    if (!existsSync(path)) {
      t.skip('RHWP section-count fixture is unavailable');
      return;
    }
    const bytes = readFileSync(path),
      send = await worker(t);
    const failed = await send({ kind: 'load', format: 'hwp5', bytes });
    assert.equal(failed.error, 'SectionCountMismatch');
    assert.equal(failed.availableSectionsPreviewAvailable, true);
    const loaded = await send({ kind: 'load', format: 'hwp5', bytes, availableSectionsOnly: true });
    assert.equal(loaded.error, undefined);
    assert.equal(loaded.historyRevision, undefined);
    assert.equal(loaded.content.readOnly, true);
    assert.equal(loaded.content.availableSectionsOnly, true);
    assert.equal(loaded.content.primarySource, 'available_bodytext');
    assert.deepEqual(loaded.content.sectionInventory, { declared, available, mismatch: true });
    assert.equal(loaded.content.totalParagraphs, paragraphs);
    assert(loaded.content.paragraphs.every((row) => row.editable === false));
    for (const kind of [
      'enable',
      'save',
      'undo',
      'redo',
      'splice',
      'format',
      'split',
      'merge',
      'character-font',
      'character-properties',
      'insert-table',
      'created-cell-text',
      'picture-bytes',
      'query-edit-range',
      'query-split-range',
      'unlock',
    ]) {
      const reply = await send({
        kind,
        section: 0,
        paragraph: 0,
        startUnit: 0,
        endUnit: 0,
        text: 'forbidden',
        allowStaleLayout: true,
        distribution: true,
        normalizeObservedCfb: true,
      });
      assert.equal(reply.error, 'AvailableSectionsReadOnly', kind);
      assert.equal(reply.applied, false);
      assert.equal(reply.bytes, undefined);
      assert.equal(reply.content, undefined);
      assert.equal(reply.historyRevision, undefined);
    }
    assert.deepEqual(
      (await send({ kind: 'load', bytes, availableSectionsOnly: true })).content,
      loaded.content,
    );
    const normal = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp');
    assert.equal((await send({ kind: 'load', bytes: normal })).error, undefined);
    assert.equal((await send({ kind: 'enable' })).error, undefined);
    assert.deepEqual(readFileSync(path), bytes);
  });

test('invalid available-preview load options preserve an existing editor and its redo', async (t) => {
  const send = await worker(t),
    bytes = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp');
  assert.equal((await send({ kind: 'load', bytes })).error, undefined);
  assert.equal((await send({ kind: 'enable' })).error, undefined);
  assert.equal(
    (
      await send({
        kind: 'splice',
        section: 0,
        paragraph: 1,
        startUnit: 0,
        endUnit: 0,
        text: 'retained',
      })
    ).error,
    undefined,
  );
  const saved = await send({ kind: 'save', allowStaleLayout: true });
  assert.equal(saved.error, undefined);
  const undone = await send({ kind: 'undo' });
  assert.equal(undone.error, undefined);
  for (const value of [null, 'true', 1]) {
    const reply = await send({ kind: 'load', bytes, availableSectionsOnly: value });
    assert.equal(reply.error, 'InvalidAvailableSectionsPolicy');
    assert.equal(reply.historyRevision, undone.historyRevision);
    assert.deepEqual(reply.historyRevisions, undone.historyRevisions);
  }
  assert.equal(
    (await send({ kind: 'load', format: 'hwpx', bytes, availableSectionsOnly: true })).error,
    'UnsupportedAvailableSectionsFormat',
  );
  assert.equal((await send({ kind: 'redo' })).error, undefined);
  assert.deepEqual((await send({ kind: 'save', allowStaleLayout: true })).bytes, saved.bytes);
});

test('Worker does not advertise available preview with an incomplete native ABI', async (t) => {
  const path = `reference/rhwp/samples/${sectionCountFixtures[0][0]}`;
  if (!existsSync(path)) {
    t.skip('RHWP section-count fixture is unavailable');
    return;
  }
  const altered = Buffer.from(wasm),
    at = altered.indexOf(Buffer.from('hwp5_text_declared_sections'));
  assert(at >= 0);
  altered[at] = 120;
  const send = await worker(t, altered),
    bytes = readFileSync(path);
  const failed = await send({ kind: 'load', bytes });
  assert.equal(failed.error, 'SectionCountMismatch');
  assert.equal(failed.availableSectionsPreviewAvailable, undefined);
  const explicit = await send({ kind: 'load', bytes, availableSectionsOnly: true });
  assert.equal(explicit.error, 'AvailableSectionsPreviewUnavailable');
  assert.equal(explicit.availableSectionsPreviewAvailable, undefined);
});

test('available distribution ViewText never advertises distribution editing or accepts its consent flags', async (t) => {
  const original = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/distribution.hwp');
  const cfb = await createCfbReader(wasm);
  let bytes, oracle;
  try {
    cfb.parse(original);
    const document = cfb.document();
    document.nodes[0].created = 0n;
    const info = document.nodes.find((node) => node.parent === 0 && node.name === 'DocInfo');
    const decoded = inflateRawSync(info.content, { maxOutputLength: 32 * 1024 * 1024 });
    // Test-only canonical compressed envelope: the strict count oracle rejects
    // the original fixture's unused DEFLATE tail, unlike its native reader.
    info.content = deflateRawSync(decoded);
    const canonical = cfb.write(document);
    oracle = JSON.parse(
      execFileSync('python3', ['tools/hwp5-section-count-oracle.py'], {
        input: Buffer.from(canonical),
        timeout: 30000,
      }),
    );
    assert.equal(decoded.readUInt16LE(oracle.properties.offset), oracle.properties.sectionCount);
    decoded.writeUInt16LE(oracle.properties.sectionCount + 1, oracle.properties.offset);
    info.content = deflateRawSync(decoded);
    bytes = cfb.write(document);
  } finally {
    cfb.close();
  }
  const send = await worker(t);
  assert.equal((await send({ kind: 'load', bytes })).error, 'SectionCountMismatch');
  const loaded = await send({ kind: 'load', bytes, availableSectionsOnly: true });
  assert.equal(loaded.error, undefined);
  assert.equal(loaded.content.primarySource, 'available_viewtext');
  assert.deepEqual(loaded.content.sectionInventory, {
    declared: oracle.properties.sectionCount + 1,
    available: oracle.properties.sectionCount,
    mismatch: true,
  });
  assert.equal(loaded.content.readOnly, true);
  assert.equal(loaded.content.distributionEditingAvailable, undefined);
  assert.equal(
    (await send({ kind: 'enable', distribution: true, normalizeObservedCfb: true })).error,
    'AvailableSectionsReadOnly',
  );
  assert.equal(
    (await send({ kind: 'save', allowStaleLayout: true })).error,
    'AvailableSectionsReadOnly',
  );
  assert.deepEqual(
    readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/distribution.hwp'),
    original,
  );
});

test('legacy real WASM retains strict failure without advertising the optional preview', async (t) => {
  const baseline = process.env.HWPJS_BASELINE_WASM;
  if (!baseline || !existsSync(baseline)) {
    t.skip('explicit legacy WASM baseline is unavailable');
    return;
  }
  const path = `reference/rhwp/samples/${sectionCountFixtures[0][0]}`;
  if (!existsSync(path)) {
    t.skip('RHWP section-count fixture is unavailable');
    return;
  }
  const send = await worker(t, readFileSync(baseline)),
    bytes = readFileSync(path);
  const failed = await send({ kind: 'load', bytes });
  assert.equal(failed.error, 'SectionCountMismatch');
  assert.equal(failed.availableSectionsPreviewAvailable, undefined);
  assert.equal(
    (await send({ kind: 'load', bytes, availableSectionsOnly: true })).error,
    'AvailableSectionsPreviewUnavailable',
  );
  const normal = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/charshape.hwp');
  assert.equal((await send({ kind: 'load', bytes: normal })).error, undefined);
  assert.equal((await send({ kind: 'enable' })).error, undefined);
});
