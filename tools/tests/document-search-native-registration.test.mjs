import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import {
  documentSearchTargets,
  nativeSearchResults,
} from '../document-search-native-registration.mjs';
const build = await readFile(new URL('../../build.zig', import.meta.url), 'utf8');
const expected = [
  ['src/document_text_search_probe.zig', 'document text search', 'read', 6],
  ['src/document_text_transaction_probe.zig', 'document text', 'transaction', 13],
  ['src/document_text_hx_probe.zig', 'document text HX', 'hx', 25],
  ['src/document_text_selection_probe.zig', 'document text selection', 'selection', 10],
  ['src/document_text_title_probe.zig', 'document text title diagnostic', 'title-diagnostic', 3],
  [
    'src/document_text_title_emission_probe.zig',
    'document text title emission',
    'title-emission',
    10,
  ],
  ['src/title_source_linear_probe.zig', 'title source linear', 'title-linear', 4],
  ['src/document_text_anchor_probe.zig', 'document text anchor', 'anchor', 7],
  [
    'src/document_text_read_generation_probe.zig',
    'document text read generation',
    'read-generation',
    8,
  ],
  ['src/document_text_readonly_hwp_probe.zig', 'document text readonly H5', 'readonly-hwp', 9],
  [
    'src/document_text_batch_delegation_probe.zig',
    'document text batch delegation',
    'batch-delegation',
    15,
  ],
  ['src/control_text_read_context_probe.zig', 'control text batch Native', 'control-kernel', 13],
  [
    'src/control_text_read_paragraph_coverage_probe.zig',
    'control paragraph coverage Native',
    'paragraph-coverage',
    3,
  ],
].map(([path, filter, step, named]) => ({
  path,
  filter,
  step: 'test-document-search-' + step,
  named,
}));
function exact(source) {
  assert.deepEqual(documentSearchTargets(source), expected);
}
test('preserved filters and the readonly/shared-kernel additions retain exact focused aggregate and regular registration', () =>
  exact(build));
for (const [name, before, after] of [
  ['missing regular test edge', 'core_test_step.dependOn(&run.step);', ''],
  ['missing aggregate edge', 'document_search_step.dependOn(&run.step);', ''],
  ['missing focused edge', 'focused.dependOn(&run.step);', ''],
  ['missing filter application', '.filters = &.{contract.filter}', '.filters = &.{}'],
  [
    'missing LLVM backend',
    '.use_llvm = true, .filters = &.{contract.filter}',
    '.use_llvm = false, .filters = &.{contract.filter}',
  ],
  [
    'removed root',
    '.{ .path = "src/document_text_search_probe.zig", .filter = "document text search", .step = "test-document-search-read", .named = 6 },',
    '',
  ],
  ['changed existing filter', '.filter = "document text HX"', '.filter = "document text"'],
  ['weakened expected count', '.named = 25', '.named = 20'],
  ['unsafe traversal', 'src/document_text_hx_probe.zig', 'src/../document_text_hx_probe.zig'],
  ['duplicate root', 'src/document_text_hx_probe.zig', 'src/document_text_search_probe.zig'],
])
  test('rejects ' + name, () => {
    assert(build.includes(before));
    assert.throws(() => exact(build.replace(before, after)));
  });
test('result parser separates named and anonymous without treating final summary as a test', () => {
  const rows = nativeSearchResults(
    '1/3 root.test_0...OK\n2/3 a.test.document text HX sample...phase=4\nOK\n3/3 imported.test_0...OK\nAll 3 tests passed.\n',
    'document text HX',
  );
  assert.deepEqual(
    rows.map((r) => [r.kind, r.result]),
    [
      ['anonymous', 'pass'],
      ['named', 'pass'],
      ['anonymous', 'pass'],
    ],
  );
});
test('result parser retains first failure and uncompleted or compile-only output', () => {
  const rows = nativeSearchResults(
    '1/2 a.test.document text HX sample...FAIL (TestUnexpectedResult)\ntrace\n2/2 root.test_0...OK\n1 passed; 0 skipped; 1 failed.\n',
    'document text HX',
  );
  assert.deepEqual(
    rows.map((r) => r.result),
    ['fail', 'pass'],
  );
  assert.equal(
    nativeSearchResults('1/1 a.test.document text HX sample...', 'document text HX')[0].result,
    'unknown',
  );
  assert.deepEqual(
    nativeSearchResults('src/foo.zig:1:2: error: invalid field', 'document text HX'),
    [],
  );
});
test('regular workflow invokes all-target runner and preserves first evidence with explicit pinned toolchain', async () => {
  const workflow = await readFile(
    new URL('../../.github/workflows/javascript-quality.yml', import.meta.url),
    'utf8',
  );
  const job = workflow.slice(
    workflow.indexOf('  document-search-native:'),
    workflow.indexOf('  quality:'),
  );
  for (const required of [
    'runs-on: ubuntu-24.04',
    'node tools/run-document-search-native.mjs --execute',
    'sha256sum --check --strict',
    'chmod -R a-w',
    'if: always()',
    'actions/upload-artifact@v4',
  ])
    assert(job.includes(required), required);
  assert(!job.includes('continue-on-error'));
  assert(!job.includes('--test-filter'));
  const pin = JSON.parse(
    await readFile(new URL('../document-search-zig-toolchain.json', import.meta.url), 'utf8'),
  );
  assert.equal(pin.version, '0.17.0');
  assert.equal(pin.platform, 'x86_64-linux');
  assert.equal(pin.url, 'https://ziglang.org/download/0.17.0/zig-x86_64-linux-0.17.0.tar.xz');
  assert.equal(
    pin.archiveSha256,
    '1cbe9df9f27e6b78d14ccbca43b6703a404ef79ef1c463de901d7f088d4e2026',
  );
  assert.equal(Number(pin.archiveBytes), 57332648);
});
