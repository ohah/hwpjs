import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjectPropertiesView } from '../src/object-properties-view.ts';
import { createObjectPropertiesEditGate } from '../src/object-properties-edit-gate.ts';
import { documentFixture, fire } from './formatting-dialog-test-dom.ts';
const tick = () => new Promise((r) => setImmediate(r));
function fixture() {
  const dom = documentFixture(),
    gate = createObjectPropertiesEditGate(),
    calls = [];
  let resolve,
    closed = 0;
  const state = {
    status: 'ready',
    historyRecoveryRequired: false,
    stateVersion: 1,
    token: { editorId: 'e', documentId: 'd', generation: 1, operationRevision: 0, viewRevision: 0 },
    content: { format: 'hwp5' },
  };
  const target = Object.freeze({});
  const editor = {
    getEditorState: () => state,
    async getObjectOuterMargins(selector) {
      calls.push({ selector });
      return {
        state: 'available',
        target,
        observation: {
          format: 'hwp5',
          kind: 'picture',
          section: 0,
          drawingNode: 11,
          margins: { left: 0, right: 1, top: 2, bottom: 3 },
        },
      };
    },
    async dispatchCommand(command, payload) {
      calls.push({ command, payload });
      return await new Promise((r) => {
        resolve = r;
      });
    },
  };
  const view = createObjectPropertiesView(
    dom.root,
    {
      state,
      target: { section: 0, pictureNode: 11, resizeRecordNode: 99, width: 7200, height: 3600 },
      reason: null,
    },
    { width: '25.4', height: '12.7' },
    {
      onApply(draft) {
        calls.push({ size: draft });
      },
      onDismiss() {
        closed++;
      },
      onReplace() {
        calls.push({ replacement: true });
      },
      outerMargins: {
        editor,
        selector: { kind: 'picture', section: 0, node: 11 },
        current: () => true,
        gate,
      },
    },
  );
  view.setReplacementAvailability(true, 'ready');
  return {
    ...dom,
    view,
    gate,
    calls,
    get closed() {
      return closed;
    },
    resolve: () => resolve?.({ status: 'committed-with-snapshot' }),
  };
}
test('H5 picture view queries physical picture node, never resize record node', async () => {
  const f = fixture();
  await tick();
  assert.deepEqual(f.calls, [{ selector: { kind: 'picture', section: 0, node: 11 } }]);
  assert.equal(f.role('object-outer-margins-left').value, '0');
  assert.equal(f.role('object-width').value, '25.4');
  f.view.destroy();
});
test('dirty margins and size cannot start two property intents or picture replacement', async () => {
  const f = fixture();
  await tick();
  const left = f.role('object-outer-margins-left');
  left.value = '1';
  fire(left, 'input');
  assert.equal(f.role('object-apply').disabled, true);
  assert.equal(f.role('object-replace-picture').disabled, true);
  f.role('object-width').value = '50.8';
  fire(f.role('object-width'), 'input');
  assert.equal(f.role('object-outer-margins-apply').disabled, true);
  assert.equal(f.calls.filter((x) => x.command || x.size || x.replacement).length, 0);
  f.role('object-width').value = '25.4';
  fire(f.role('object-width'), 'input');
  assert.equal(f.role('object-outer-margins-apply').disabled, false);
  f.view.destroy();
});
test('one pending margin command blocks size and file intents until completion, with no new queries', async () => {
  const f = fixture();
  await tick();
  f.role('object-outer-margins-left').value = '1';
  fire(f.role('object-outer-margins-left'), 'input');
  fire(f.role('object-outer-margins-apply'), 'click');
  await tick();
  assert.equal(f.calls.filter((x) => x.command).length, 1);
  assert.equal(f.role('object-width').disabled, true);
  assert.equal(f.role('object-replace-picture').disabled, true);
  assert.equal(f.role('object-cancel').textContent, '닫기 (적용은 계속)');
  assert.equal(f.calls.filter((x) => x.selector).length, 1);
  f.resolve();
  await tick();
  assert.equal(f.closed, 1);
  f.view.destroy();
});
test('external size busy and picture decode phases refresh margins without issuing new Native observations', async () => {
  const f = fixture();
  await tick();
  for (const [begin, end] of [
    [() => f.view.setBusy(true), () => f.view.setBusy(false)],
    [() => f.view.setReplacementPending('reading'), () => f.view.setReplacementPending(null)],
    [() => f.view.setReplacementPending('sending'), () => f.view.setReplacementPending(null)],
  ]) {
    begin();
    assert.equal(f.role('object-outer-margins-left').disabled, true);
    assert.equal(f.role('object-outer-margins-apply').disabled, true);
    end();
    assert.equal(f.role('object-outer-margins-left').disabled, false);
  }
  assert.equal(f.calls.length, 1);
  f.view.destroy();
  f.view.setBusy(false);
  assert.equal(f.calls.length, 1);
});
