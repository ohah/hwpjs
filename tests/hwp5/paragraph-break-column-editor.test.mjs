import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';

const wasm = process.env.HWPJS_TEST_WASM ? readFileSync(process.env.HWPJS_TEST_WASM) : null;
for (const fixture of ['multicolumns', 'multicolumns-widths'])
  for (const kind of ['page', 'column'])
    for (const extend of [false, true]) {
      test(
        `explicit ${kind} survives ${fixture} ${extend ? 'extension' : 'continuation rejoin'}`,
        { skip: !wasm ? 'explicit corrected flow candidate required' : false },
        async () => {
          const input = readFileSync(`legacy/rust/crates/hwp-core/tests/fixtures/${fixture}.hwpx`);
          const editor = await createHwpxEditor(wasm);
          try {
            editor.open(input);
            editor.enableHistory();
            const originalText = editor
              .paragraphTextSnapshot(0)
              .map((row) => row.text)
              .join('');
            editor.mergeParagraph({ section: 0, paragraph: 1 });
            editor.splitParagraphWithBreak({ section: 0, paragraph: 1, atUnit: 1, kind });
            if (!extend) editor.splitParagraph({ section: 0, paragraph: 2, atUnit: 0 });
            const before = editor.save();
            editor.mergeParagraph({ section: 0, paragraph: 2 });
            const current = editor.paragraphFlow(0).find((row) => row.paragraph === 2);
            assert.equal(current.page_break, kind === 'page');
            assert.equal(current.column_break, kind === 'column');
            assert.equal(
              editor
                .paragraphTextSnapshot(0)
                .map((row) => row.text)
                .join(''),
              originalText,
            );
            const saved = editor.save();
            assert.equal(editor.undo(), true);
            assert.deepEqual(editor.save(), before);
            assert.equal(editor.redo(), true);
            assert.deepEqual(editor.save(), saved);
            editor.open(saved);
            const reopened = editor.paragraphFlow(0).find((row) => row.paragraph === 2);
            assert.equal(reopened.page_break, kind === 'page');
            assert.equal(reopened.column_break, kind === 'column');
            assert.deepEqual(editor.save(), saved);
          } finally {
            editor.close();
          }
        },
      );
    }
