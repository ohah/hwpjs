import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHwpxEditor } from '../../js/hwpx-editor.mjs';
import { projectFieldLabelDisplay } from '../../web/preview/field-label-display-content.mjs';
import { workerCanvasHarness } from '../canvas/worker-harness.mjs';
import { execFileSync } from '../../tools/oracle-process.mjs';

test('field display errors preserve spelling and remove unsafe label coordinates', () => {
  const row = { section: 0, paragraph: 16, text: '', fieldLabels: [{ start: 0, end: 1 }] };
  assert.equal(projectFieldLabelDisplay({ fieldLabelDisplayText: () => '\ufffc' }, row, 1), 1);
  assert.equal(row.text, '\ufffc');
  const failed = { ...row, fieldLabels: [...row.fieldLabels] };
  assert.equal(projectFieldLabelDisplay({ fieldLabelDisplayText: () => 'xx' }, failed, 1), 0);
  assert.equal(failed.text, '\ufffc');
  assert.deepEqual(failed.fieldLabels, []);
  assert.equal(failed.fieldReadOnlyReason, 'FieldLabelDisplayBudgetExceeded');
});

test('actual field-hosted table uses native anchor spelling rather than empty text', async (t) => {
  assert(process.env.HWPJS_TEST_WASM, 'explicit field label display candidate required');
  const input = readFileSync(
    'reference/rhwp/samples/hwpx/opengov/36389301_결재문서본문_직장훈련계획_덧말.hwpx',
  );
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
  try {
    editor.open(input);
    editor.enableHistory();
    assert.equal(editor.fieldLabelDisplayText(0, 17), '\ufffc');
    assert.equal(editor.canEdit(0, 17), false);
    assert.throws(() => editor.anchorText(0, 17), /UnsupportedStructuralFieldEdit/);
    assert.deepEqual(Buffer.from(editor.save()), input);
    const field = editor.fieldLabels(0, 17)[0];
    editor.spliceFieldLabel(0, 17, field.beginElement, 0, 0, '앞😀');
    assert.equal(editor.fieldLabelDisplayText(0, 17), '앞😀\ufffc');
    const saved = Buffer.from(editor.save());
    const request = {
      before: input.toString('base64'),
      after: saved.toString('base64'),
      section: 0,
      paragraph: 17,
      text: '앞😀',
      mode: 'anchored',
    };
    for (const flags of [[], ['-O']]) {
      const verify = (value) =>
        execFileSync('python3', [...flags, 'tools/hwpx-anchor-prefix-oracle.py'], {
          input: JSON.stringify(value),
          timeout: 30000,
        });
      verify(request);
      assert.throws(
        () => verify({ ...request, text: 'wrong' }),
        (error) => error.status === 1 && /complete XML mismatch/.test(String(error.stderr)),
      );
    }
    assert.equal(editor.undo(), true);
    assert.equal(editor.fieldLabelDisplayText(0, 17), '\ufffc');
    assert.equal(editor.redo(), true);
  } finally {
    editor.close();
  }
  const h = await workerCanvasHarness(t);
  const loaded = await h.send({ kind: 'load', format: 'hwpx', bytes: input });
  assert.equal(loaded.error, undefined);
  const host = loaded.content.paragraphs.find((p) => p.section === 0 && p.paragraph === 16);
  assert.equal(host.text, '\ufffc');
  assert.equal(host.plainEditable, false);
  assert.equal(host.anchorEditable, false);
  assert.equal(host.fieldLabels.length, 1);
  assert.notEqual(h.renderer.layout().pageLayoutError, 'UnsupportedInlineTableHost');
  t.diagnostic(
    `Next actual page-layout boundary: ${h.renderer.layout().pageLayoutError ?? 'none'}`,
  );
});
