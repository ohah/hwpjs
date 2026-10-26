import assert from 'node:assert/strict';
import test from 'node:test';
import { selectHwpxFiles, trackedHwpxFiles } from '../../tools/hwpx-corpus-files.mjs';

test('HWPX corpus includes demos and preserves NUL-separated paths', () => {
  assert.deepEqual(selectHwpxFiles('fixtures/a.hwpx\0demo/a b.hwpx\0demo/한글.hwpx\0other.hwp\0'), [
    'fixtures/a.hwpx',
    'demo/a b.hwpx',
    'demo/한글.hwpx',
  ]);
  assert.throws(() => selectHwpxFiles('other.hwp\0'), /EmptyFixtureInventory/);
  assert.throws(() => selectHwpxFiles('a.hwpx\0a.hwpx\0'), /DuplicateFixturePath/);
});

test('HWPX tracked corpus includes the public noori demo', () => {
  const files = trackedHwpxFiles();
  assert(files.includes('legacy/rust/documents/docs/public/demo/noori.hwpx'));
  assert(files.includes('legacy/rust/crates/hwp-core/tests/fixtures/noori.hwpx'));
  assert.equal(new Set(files).size, files.length);
});
