import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import { insertPrefix } from '../../tools/hwpx-prefix-edit-probe.mjs';

test('source inline strings expose separate dutmal values without mutating edit history', async () => {
  assert(process.env.HWPJS_TEST_WASM, 'explicit inline string candidate required');
  const input = readFileSync(
    'reference/rhwp/samples/hwpx/opengov/36389301_결재문서본문_직장훈련계획_덧말.hwpx',
  );
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
  try {
    editor.open(input);
    editor.enableHistory();
    const before = editor.inlineStringSources();
    assert.equal(before.sourceOnly, true);
    assert.equal(before.controls.length, 1);
    assert.equal(before.controls[0].kind, 'dutmal');
    assert.equal(before.controls[0].attributes.sz_ratio, '0');
    assert.deepEqual(
      before.texts.map((row) => [row.kind, row.value]),
      [
        ['main_text', '팀단위 훈련'],
        ['sub_text', '전술훈련 30% + 현지훈련 20%'],
      ],
    );
    assert.deepEqual(Buffer.from(editor.save()), input);
    const pristine = structuredClone(before);
    before.texts[0].value = 'client mutation';
    assert.deepEqual(editor.inlineStringSources(), pristine);
    insertPrefix(editor, 0, 26, '앞😀');
    const saved = Buffer.from(editor.save());
    assert.deepEqual(editor.inlineStringSources(), pristine);
    assert.equal(editor.undo(), true);
    assert.deepEqual(editor.inlineStringSources(), pristine);
    assert.deepEqual(Buffer.from(editor.save()), input);
    assert.equal(editor.redo(), true);
    assert.deepEqual(Buffer.from(editor.save()), saved);
  } finally {
    editor.close();
  }
});

test('missing optional export refuses source report instead of fabricating empty strings', async (t) => {
  assert(process.env.HWPJS_TEST_WASM, 'explicit inline string candidate required');
  const instantiate = WebAssembly.instantiate;
  t.mock.method(WebAssembly, 'instantiate', async (...args) => {
    const instance = await instantiate(...args);
    const exports = { ...instance.exports };
    delete exports.hwpx_edit_inline_string_sources;
    return { exports };
  });
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
  try {
    editor.open(
      readFileSync(
        'reference/rhwp/samples/hwpx/opengov/36389301_결재문서본문_직장훈련계획_덧말.hwpx',
      ),
    );
    assert.throws(() => editor.inlineStringSources(), /HwpxInlineStringSourcesAbiUnavailable/);
  } finally {
    editor.close();
  }
});
