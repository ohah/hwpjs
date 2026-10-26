import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import { execFileSync } from '../../tools/oracle-process.mjs';

test('all nine empty markpen paragraphs accept source text without changing annotations', async () => {
  assert(process.env.HWPJS_TEST_WASM, 'explicit markpen candidate required');
  const path =
    'reference/rhwp/samples/정책연구용역사업 중간진도보고서(살아있는 간장 기증자의 의학적 선별기준 연구).hwpx';
  const input = readFileSync(path);
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
  try {
    for (const paragraph of [27, 29, 31, 114, 168, 169, 170, 172, 190]) {
      editor.open(input);
      editor.enableHistory({ maxEntries: 8, maxCheckpointBytes: 16 * 1024 * 1024 });
      assert.equal(editor.canEdit(0, paragraph), true);
      const text = '형광펜😀<&';
      editor.splice(0, paragraph, 0, 0, text);
      const saved = Buffer.from(editor.save());
      const payload = {
        before: input.toString('base64'),
        after: saved.toString('base64'),
        section: 0,
        paragraph,
        text,
      };
      for (const flags of [[], ['-O']]) {
        const check = (data) =>
          execFileSync('python3', [...flags, 'tools/hwpx-anchor-prefix-oracle.py'], {
            input: JSON.stringify(data),
            timeout: 30000,
          });
        check(payload);
        assert.throws(
          () => check({ ...payload, text: 'wrong' }),
          (error) =>
            error.status === 1 && /ValueError: complete XML mismatch/.test(String(error.stderr)),
        );
      }
      assert.equal(editor.undo(), true);
      assert.deepEqual(Buffer.from(editor.save()), input);
      assert.equal(editor.redo(), true);
      assert.deepEqual(Buffer.from(editor.save()), saved);
      editor.open(saved);
      assert.deepEqual(Buffer.from(editor.save()), saved);
    }
    assert.deepEqual(readFileSync(path), input);
  } finally {
    editor.close();
  }
});
