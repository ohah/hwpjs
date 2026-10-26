import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import { decodeFormulaResultDisplaySnapshot } from '../../js/formula-result-display-snapshot.mjs';
const encode = (value) => new TextEncoder().encode(JSON.stringify(value));

test('formula display snapshot wire keeps ordered one-based paragraphs and UTF16 target ranges', () => {
  assert.deepEqual(
    decodeFormulaResultDisplaySnapshot(
      encode([{ paragraph: 2, text: '앞😀2', targets: [{ begin_element: 5, start: 0, end: 4 }] }]),
    ),
    [{ paragraph: 2, text: '앞😀2', targets: [{ beginElement: 5, start: 0, end: 4 }] }],
  );
  assert.deepEqual(decodeFormulaResultDisplaySnapshot(encode([])), []);
  const row = { paragraph: 2, text: 'x', targets: [{ begin_element: 5, start: 0, end: 1 }] };
  for (const bad of [
    null,
    {},
    [null],
    [{ ...row, paragraph: 0 }],
    [row, row],
    [{ ...row, text: null }],
    [{ ...row, targets: [] }],
    [{ ...row, targets: [null] }],
    [{ ...row, targets: [{ begin_element: -1, start: 0, end: 1 }] }],
    [{ ...row, targets: [{ begin_element: 5, start: 1, end: 0 }] }],
    [{ ...row, targets: [{ begin_element: 5, start: 0, end: 2 }] }],
  ]) {
    assert.throws(() => decodeFormulaResultDisplaySnapshot(encode(bad)));
  }
  assert.throws(() => decodeFormulaResultDisplaySnapshot(Uint8Array.of(255)));
});

for (const path of [
  'legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx',
  'reference/rhwp/samples/issue5543_carried_anchor_ladder.hwpx',
])
  test(
    'section display snapshot equals every old query and exact save: ' + path,
    { skip: !process.env.HWPJS_TEST_WASM },
    async (t) => {
      const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM)),
        input = readFileSync(path);
      try {
        editor.open(input);
        editor.enableHistory();
        const begin = performance.now(),
          expected = [];
        for (const paragraph of editor.manualFormulaResultParagraphs(0)) {
          const targets = editor.manualFormulaResultTargets(0, paragraph);
          if (targets.length)
            expected.push({
              paragraph,
              targets,
              text: editor.manualFormulaResultDisplayText(0, paragraph),
            });
        }
        const oldMs = performance.now() - begin,
          start = performance.now();
        const actual = editor.manualFormulaResultDisplaySnapshot(0),
          snapshotMs = performance.now() - start;
        assert.ok(actual.length > 0);
        assert.deepEqual(actual, expected);
        assert.deepEqual(Buffer.from(editor.save()), input);
        assert.throws(() => editor.manualFormulaResultDisplaySnapshot(999), /InvalidSectionIndex/);
        assert.throws(() => editor.manualFormulaResultDisplaySnapshot(-1));
        if (path.endsWith('/chart.hwpx')) {
          const first = actual[0],
            target = first.targets[0],
            saved = editor.save();
          editor.spliceManualFormulaResult(0, target.beginElement, 0, 0, '앞😀');
          const changed = editor.manualFormulaResultDisplaySnapshot(0);
          assert.notDeepEqual(changed, actual);
          assert.deepEqual(editor.manualFormulaResultDisplaySnapshot(0), changed);
          assert.equal(editor.undo(), true);
          assert.deepEqual(editor.manualFormulaResultDisplaySnapshot(0), actual);
          assert.deepEqual(editor.save(), saved);
          assert.equal(editor.redo(), true);
          assert.deepEqual(editor.manualFormulaResultDisplaySnapshot(0), changed);
          assert.deepEqual(actual, expected);
        }
        t.diagnostic(JSON.stringify({ path, paragraphs: actual.length, oldMs, snapshotMs }));
      } finally {
        editor.close();
      }
    },
  );

test(
  'old WASM keeps an explicit snapshot capability refusal',
  { skip: !process.env.HWPJS_BASELINE_WASM },
  async () => {
    const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_BASELINE_WASM));
    try {
      editor.open(readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx'));
      assert.throws(
        () => editor.manualFormulaResultDisplaySnapshot(0),
        /HwpxFormulaResultSnapshotAbiUnavailable/,
      );
    } finally {
      editor.close();
    }
  },
);
