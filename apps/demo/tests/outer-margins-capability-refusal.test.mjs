import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjectOuterMarginsPort } from '../src/object-outer-margins-port.ts';
import { createObjectOuterMarginsForm } from '../src/object-outer-margins-form.ts';
import { createObjectPropertiesEditGate } from '../src/object-properties-edit-gate.ts';
import { Document, all } from './fake-dom.mjs';
const tick = () => new Promise((r) => setImmediate(r));
function fixture(message = 'UnsupportedObjectOuterMargins', format = 'hwpx') {
  let state = {
      status: 'ready',
      stateVersion: 1,
      token: {
        editorId: 'e',
        documentId: 'd',
        generation: 1,
        operationRevision: 0,
        viewRevision: 0,
      },
      content: { format },
    },
    calls = 0,
    during;
  const editor = {
    getEditorState: () => state,
    async getObjectOuterMargins() {
      during?.();
      throw Error(message);
    },
    async dispatchCommand() {
      calls++;
      throw Error('UnexpectedWrite');
    },
  };
  return {
    editor,
    selector: { kind: format === 'hwpx' ? 'drawing' : 'textbox', section: 0, node: 31 },
    port: createObjectOuterMarginsPort(editor, () => true),
    calls: () => calls,
    changeDuringRead() {
      during = () => {
        state = { ...state, stateVersion: 2 };
      };
    },
  };
}
test('exact HWPX unsupported placement is unavailable, with no editable capture or write', async () => {
  const f = fixture();
  assert.deepEqual(await f.port.read(f.selector), {
    available: false,
    reason: 'UnsupportedObjectOuterMargins',
  });
  assert.equal(f.calls(), 0);
});
test('unknown errors, uncertainty and H5 errors remain operation failures', async () => {
  for (const [message, format] of [
    ['InvalidObjectOuterMargins', 'hwpx'],
    ['HistoryMutationUncertain', 'hwpx'],
    ['UnsupportedObjectOuterMargins: detail', 'hwpx'],
    ['UnsupportedObjectOuterMargins', 'hwp5'],
  ]) {
    const f = fixture(message, format);
    await assert.rejects(f.port.read(f.selector), (e) => e.message === message);
    assert.equal(f.calls(), 0);
  }
});
test('unsupported reply cannot mask a concurrent document state change', async () => {
  const f = fixture();
  f.changeDuringRead();
  await assert.rejects(f.port.read(f.selector), /문서가 바뀌었습니다/);
});
test('HWPX refusal is shown as capability information with empty disabled inputs', async () => {
  const f = fixture(),
    doc = new Document(),
    root = doc.createElement('main'),
    footer = doc.createElement('footer');
  const form = createObjectOuterMarginsForm(
    root,
    footer,
    f.editor,
    f.selector,
    () => true,
    createObjectPropertiesEditGate(),
    () => {
      throw Error('UnexpectedSuccess');
    },
  );
  await tick();
  assert.equal(
    all(root, (n) => n.dataset.role === 'object-outer-margins-status')[0].textContent,
    '현재 배치에서는 바깥 여백 편집을 지원하지 않습니다.',
  );
  const field = all(root, (n) => n.dataset.role === 'object-outer-margins-left')[0];
  assert.equal(field.value, '');
  assert.equal(field.disabled, true);
  assert.equal(
    all(footer, (n) => n.dataset.role === 'object-outer-margins-apply')[0].disabled,
    true,
  );
  assert.equal(f.calls(), 0);
  form.dispose();
  form.refresh();
  assert.equal(f.calls(), 0);
});
