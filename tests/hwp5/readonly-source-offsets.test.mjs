import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHwp5Reader } from '../../js/hwp5.mjs';
import { createExperimentalHwp5Editor } from '../../js/hwp5-editor.mjs';
import { displayContent } from '../../web/preview/content.mjs';
import { attachHwp5Styles } from '../../web/preview/hwp5-style-content.mjs';
import { attachHwp5Tables } from '../../web/preview/hwp5-table-content.mjs';

test('readonly full preview retains protected source offsets without activating edits', async () => {
  const wasm = readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm');
  for (const name of ['table-caption', 'textbox', 'sample-5017-pics']) {
    const input = readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${name}.hwp`);
    const reader = await createHwp5Reader(wasm),
      editor = await createExperimentalHwp5Editor(wasm, input);
    try {
      const preview = reader.readText(input),
        writable = displayContent(preview),
        readonly = displayContent({ ...preview, readOnly: true });
      assert(readonly.paragraphs.every((row) => !row.editable));
      assert(writable.paragraphs.some((row) => row.sourceOffsets));
      for (const row of readonly.paragraphs)
        assert.deepEqual(
          row.sourceOffsets,
          writable.paragraphs.find((other) => other.paragraph === row.paragraph).sourceOffsets,
        );
      attachHwp5Tables(editor, preview, attachHwp5Styles(editor, preview, readonly));
      assert.deepEqual(readonly.tableAnchorErrors, []);
      assert(readonly.paragraphs.every((row) => !row.editable));
      assert.deepEqual(Buffer.from(editor.save().bytes), input);
    } finally {
      reader.close();
      editor.close();
    }
  }
});
