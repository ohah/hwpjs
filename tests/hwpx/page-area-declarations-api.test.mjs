import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import { decodePageAreaDeclarations } from '../../js/hwpx-page-area-declarations.mjs';
const encode = (value) => new TextEncoder().encode(JSON.stringify(value));
const fixture = 'legacy/rust/crates/hwp-core/tests/fixtures/headerfooter.hwpx';

test('page area declaration wire validates current order, source identity and coordinates', () => {
  const row = { paragraph: 2, source_element: 9, source_control: 8, unit: 0, affinity: 'left' };
  assert.deepEqual(decodePageAreaDeclarations(encode([row])), [
    { paragraph: 2, sourceElement: 9, sourceControl: 8, unit: 0, affinity: 'left' },
  ]);
  assert.deepEqual(decodePageAreaDeclarations(encode([])), []);
  for (const bad of [
    null,
    {},
    [null],
    [{ ...row, paragraph: 0 }],
    [{ ...row, unit: -1 }],
    [{ ...row, unit: 0x100000000 }],
    [{ ...row, source_control: 9 }],
    [{ ...row, affinity: null }],
    [row, row],
    [row, { ...row, paragraph: 1, source_element: 10 }],
  ]) {
    assert.throws(() => decodePageAreaDeclarations(encode(bad)));
  }
  assert.throws(() => decodePageAreaDeclarations(Uint8Array.of(255)));
});

test(
  'actual declarations refresh through owner split history and saved reopen',
  { skip: !process.env.HWPJS_TEST_WASM },
  async () => {
    const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM)),
      input = readFileSync(fixture);
    try {
      editor.open(input);
      editor.enableHistory();
      const before = editor.pageAreaDeclarations(0);
      assert.equal(before.length, 2);
      assert.ok(before.every((row) => row.paragraph === 2 && row.unit === 0));
      assert.deepEqual(Buffer.from(editor.save()), input);
      editor.splitParagraph({ section: 0, paragraph: 2, atUnit: 0 });
      const changed = editor.pageAreaDeclarations(0);
      assert.equal(changed.length, 2);
      assert.deepEqual(changed, before);
      assert.equal(editor.undo(), true);
      assert.deepEqual(editor.pageAreaDeclarations(0), before);
      assert.equal(editor.redo(), true);
      assert.deepEqual(editor.pageAreaDeclarations(0), changed);
      const saved = editor.save();
      editor.open(saved);
      assert.deepEqual(
        editor
          .pageAreaDeclarations(0)
          .map(({ paragraph, unit, affinity }) => ({ paragraph, unit, affinity })),
        changed.map(({ paragraph, unit, affinity }) => ({ paragraph, unit, affinity })),
      );
      assert.throws(() => editor.pageAreaDeclarations(999), /InvalidSectionIndex/);
      assert.throws(() => editor.pageAreaDeclarations(-1));
      assert.equal(editor.pageAreaDeclarations(0).length, 2);
    } finally {
      editor.close();
    }
  },
);

test(
  'actual nested table declaration hosts remain distinct from area text owners',
  { skip: !process.env.HWPJS_TEST_WASM },
  async () => {
    const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
    try {
      const input = readFileSync(
        'reference/rhwp/samples/issue6298/copay_cap_tac_table_leading.hwpx',
      );
      editor.open(input);
      const rows = editor.pageAreaDeclarations(0);
      assert.deepEqual(
        rows.map((row) => [row.sourceElement, row.paragraph]),
        [
          [262, 18],
          [9506, 956],
          [9739, 963],
        ],
      );
      assert.deepEqual(Buffer.from(editor.save()), input);
    } finally {
      editor.close();
    }
  },
);

test(
  'old WASM refuses declaration capability explicitly',
  { skip: !process.env.HWPJS_BASELINE_WASM },
  async () => {
    const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_BASELINE_WASM));
    try {
      editor.open(readFileSync(fixture));
      assert.throws(() => editor.pageAreaDeclarations(0), /HwpxPageAreaDeclarationsAbiUnavailable/);
    } finally {
      editor.close();
    }
  },
);
