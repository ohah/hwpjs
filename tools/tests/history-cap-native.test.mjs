import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, lstatSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, isAbsolute, resolve } from 'node:path';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';

const source = process.env.HWPJS_TEST_SOURCE_ROOT;
assert(
  typeof source === 'string' &&
    source.endsWith('/zig-out/verification/document-transforms-connect-r1/source'),
);
const workspace = source.slice(0, source.indexOf('/zig-out/verification/'));
const candidate = process.env.HWPJS_TEST_WASM;
const candidateSha = process.env.HWPJS_TEST_WASM_SHA256;
const baseline = join(
  workspace,
  'zig-out/verification/source-grid-multipara-r1/install/bin/hwpjs.wasm',
);
const baselineSha = '202fc55283b670ea7c695ef3a326a0e6b8c86af3def7232c8e5bfab003699389';
const fixture = join(workspace, 'apps/docs/docs/public/editor/fixtures/noori.hwpx');
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function read(path, expected) {
  assert(typeof path === 'string' && isAbsolute(path) && resolve(path) === path);
  assert(path.startsWith(workspace + '/') && !path.includes('//'));
  assert(!/hwpers|title-column-roundtrip|(?:^|\/)rhwp(?:\/|$)/iu.test(path));
  assert(![...path].some((c) => c.charCodeAt(0) < 32));
  let current = '/';
  for (const part of path.split('/').filter(Boolean)) {
    current = join(current, part);
    assert(!lstatSync(current).isSymbolicLink());
  }
  assert(lstatSync(path).isFile());
  const bytes = readFileSync(path);
  assert.equal(sha(bytes), expected);
  return bytes;
}
assert(/^[a-f0-9]{64}$/u.test(candidateSha ?? '') && candidateSha !== baselineSha);
const bytes = read(fixture, '6ee9014f23650987803481e7aa51b3b2201f91f549dccfe34880469621d62aab');
const modules = await Promise.all([
  WebAssembly.compile(read(baseline, baselineSha)),
  WebAssembly.compile(read(candidate, candidateSha)),
]);

test('WASM32 actual SDK keeps exact formatting bytes and two undos while reserving less metadata', async () => {
  const observations = [];
  for (const module of modules) {
    const sdk = await createHwpxEditor(module);
    try {
      sdk.open(bytes);
      sdk.enableHistoryV2({ maxRetainedBytes: 88662 });
      sdk.setCharacterProperties({
        section: 0,
        paragraph: 3,
        startUnit: 0,
        endUnit: 1,
        properties: { bold: true, italic: true, size: 1800 },
      });
      sdk.setParagraphAlignment({ section: 0, paragraph: 3, alignment: 'RIGHT' });
      const stats = sdk.historyStats(),
        saved = Buffer.from(sdk.save());
      assert.equal(stats.resolved.maxEntries, 256);
      assert.equal(stats.resolved.maxRetainedBytes, 88662);
      assert.equal(stats.undoCount, 2);
      assert.equal(stats.evictedCount, 0);
      assert.equal(stats.revision, 2);
      assert(stats.retainedBytes <= 88662);
      assert.equal(sdk.undo(), true);
      assert.equal(sdk.undo(), true);
      assert.equal(sdk.undo(), false);
      assert.deepEqual(Buffer.from(sdk.save()), bytes);
      assert.equal(sdk.redo(), true);
      assert.equal(sdk.redo(), true);
      assert.equal(sdk.redo(), false);
      assert.deepEqual(Buffer.from(sdk.save()), saved);
      observations.push({ stats, saved });
    } finally {
      sdk.close();
    }
  }
  const [before, after] = observations;
  assert.deepEqual(after.saved, before.saved);
  assert.equal(after.stats.currentOwnedBytes, before.stats.currentOwnedBytes);
  assert.equal(after.stats.undoOwnedBytes, before.stats.undoOwnedBytes);
  assert(after.stats.metadataOwnedBytes < before.stats.metadataOwnedBytes);
  assert.equal(
    before.stats.retainedBytes - after.stats.retainedBytes,
    before.stats.metadataOwnedBytes - after.stats.metadataOwnedBytes,
  );
  console.log(
    JSON.stringify({
      scope: 'WASM32 SDK, not AArch64 Native sizes',
      before: before.stats,
      after: after.stats,
    }),
  );
});
