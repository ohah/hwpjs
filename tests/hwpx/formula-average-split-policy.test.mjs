import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import { execFileSync } from '../../tools/oracle-process.mjs';

test('actual AVG numeric inputs split with first paragraph arithmetic and exact history', async () => {
  const path = 'legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx';
  const input = readFileSync(path),
    original = Buffer.from(input);
  const editor = await createHwpxEditor(
    readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm'),
  );
  try {
    for (const paragraph of [153, 154, 155, 156, 159, 160, 161, 162, 165, 166, 167, 168]) {
      for (const atUnit of [0, 1, 3]) {
        editor.open(input);
        editor.enableHistory();
        const text = editor.paragraphTextSnapshot(0)[paragraph - 1].text;
        assert.equal(text.length, 3);
        editor.splitParagraphAnchored({ section: 0, paragraph, atUnit });
        const split = Buffer.from(editor.save());
        const request = {
          before: input.toString('base64'),
          after: split.toString('base64'),
          part: 'Contents/section0.xml',
          index: paragraph - 1,
          at: atUnit,
        };
        for (const flags of [[], ['-O']])
          execFileSync('python3', [...flags, 'tools/hwpx-sum-split-oracle.py'], {
            input: JSON.stringify(request),
            timeout: 30000,
          });
        if (paragraph === 153 && atUnit === 0) {
          const wrong = execFileSync('python3', ['tests/hwpx/formula-result-mutation.py'], {
            input: JSON.stringify({
              bytes: split.toString('base64'),
              ordinal: 10,
              display: '266.00',
            }),
            encoding: 'utf8',
            timeout: 30000,
          }).trim();
          assert.throws(
            () =>
              execFileSync('python3', ['tools/hwpx-sum-split-oracle.py'], {
                input: JSON.stringify({ ...request, after: wrong }),
                timeout: 30000,
              }),
            (error) => error.status === 1 && String(error.stderr).includes('complete XML mismatch'),
          );
        }
        assert.equal(editor.undo(), true);
        assert.deepEqual(Buffer.from(editor.save()), input);
        assert.throws(() => editor.splice(0, paragraph, 0, text.length, 'bad'), {
          message: 'InvalidFormulaNumber',
        });
        assert.equal(editor.redo(), true);
        assert.deepEqual(Buffer.from(editor.save()), split);
        editor.open(split);
        assert.deepEqual(Buffer.from(editor.save()), split);
      }
    }
    assert.deepEqual(input, original);
    assert.deepEqual(readFileSync(path), original);
  } finally {
    editor.close();
  }
});

test('AVG with every first paragraph empty saves zero without dividing by selected cells', async () => {
  const input = readFileSync('legacy/rust/crates/hwp-core/tests/fixtures/chart.hwpx');
  const editor = await createHwpxEditor(
    readFileSync(process.env.HWPJS_TEST_WASM ?? 'zig-out/bin/hwpjs.wasm'),
  );
  try {
    editor.open(input);
    editor.enableHistory();
    const saved = [Buffer.from(input)];
    for (const paragraph of [156, 155, 154, 153]) {
      editor.splitParagraphAnchored({ section: 0, paragraph, atUnit: 0 });
      const after = Buffer.from(editor.save());
      execFileSync('python3', ['tools/hwpx-sum-split-oracle.py'], {
        input: JSON.stringify({
          before: saved.at(-1).toString('base64'),
          after: after.toString('base64'),
          part: 'Contents/section0.xml',
          index: paragraph - 1,
          at: 0,
        }),
        timeout: 30000,
      });
      saved.push(after);
    }
    assert.equal(editor.paragraphTextSnapshot(0)[160].text, '0.00');
    for (let i = 3; i >= 0; i--) {
      assert.equal(editor.undo(), true);
      assert.deepEqual(Buffer.from(editor.save()), saved[i]);
    }
    for (let i = 1; i < saved.length; i++) {
      assert.equal(editor.redo(), true);
      assert.deepEqual(Buffer.from(editor.save()), saved[i]);
    }
    editor.open(saved.at(-1));
    assert.equal(editor.paragraphTextSnapshot(0)[160].text, '0.00');
  } finally {
    editor.close();
  }
});
