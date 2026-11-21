// Source integration with retained actual GUI projection; API responses remain synthetic.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { capturePictureSelection } from '../../../web/preview/picture-selection-capture.mjs';
import { captureHwp5PictureMarginsSelection } from '../src/hwp5-picture-outer-margins-tool.ts';
import { createObjectPropertiesTool } from '../src/object-properties-tool.ts';
import { createObjectPropertiesPort } from '../src/object-properties-port.ts';
import { documentFixture, fire } from './formatting-dialog-test-dom.ts';
const tick = () => new Promise((resolve) => setImmediate(resolve));
const recorded = JSON.parse(
  readFileSync(new URL('./fixtures/h5-picture-canonical-row.json', import.meta.url)),
);
function fixture() {
  const dom = documentFixture();
  const row = structuredClone(recorded);
  const token = {
    editorId: 'editor',
    documentId: 'document',
    generation: 1,
    operationRevision: 0,
    viewRevision: 0,
  };
  let state = {
    ...token,
    token,
    status: 'ready',
    stateVersion: 1,
    capabilities: { pictureResizeAvailable: true },
    content: { format: 'hwp5', pictures: [row] },
  };
  const source = state.content,
    receipt = {};
  let selected = { section: 0, pictureNode: 10 };
  let activeHost;
  const calls = [],
    listeners = new Set();
  const host = {
    getContextPicture: () => selected && { ...state.token, ...selected },
    capturePictureReplacementSelection: () =>
      capturePictureSelection(() => ({ picture: selected, source, receipt, epoch: 1 })),
  };
  activeHost = host;
  const editor = {
    getEditorState: () => state,
    registerStateListener(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async getPictureReplacement(selector) {
      calls.push({ replacementRead: selector });
      return { state: 'unavailable', reason: 'UnsupportedPictureReplacement' };
    },
    async getObjectOuterMargins(selector) {
      calls.push({ marginsRead: selector });
      return {
        state: 'available',
        target: Object.freeze({}),
        observation: {
          format: 'hwp5',
          kind: 'picture',
          section: 0,
          drawingNode: 11,
          margins: { left: 0, right: 0, top: 0, bottom: 0 },
        },
      };
    },
    async dispatchCommand(command, payload) {
      calls.push({ command, payload });
      return { status: 'committed-with-snapshot' };
    },
    async requestExperimental(message) {
      calls.push({ geometry: message });
      return { status: 'committed-with-snapshot' };
    },
  };
  const options = { root: dom.root, editor, host: () => activeHost, onStatus() {}, onClose() {} };
  return {
    ...dom,
    row,
    editor,
    host: options.host,
    options,
    calls,
    select: (node) => {
      selected = { section: 0, pictureNode: node };
    },
    swapHost: () => {
      activeHost = { ...host };
    },
    change: () => {
      state = { ...state, stateVersion: 2 };
      for (const fn of listeners) fn();
    },
  };
}
test('retained canonical component10/record11 and real renderer receipt admit physical margins11', () => {
  const f = fixture();
  assert.equal(f.host().capturePictureReplacementSelection().pictureNode, 11);
  const captured = captureHwp5PictureMarginsSelection(f.editor, f.host);
  assert(captured);
  assert.equal(captured.geometryPictureNode, 10);
  assert.deepEqual(captured.selector, { kind: 'picture', section: 0, node: 11 });
});
test('normal resize dialog keeps component10 geometry but queries and writes only physical margins11', async () => {
  const f = fixture(),
    tool = createObjectPropertiesTool(f.options);
  try {
    tool.open();
    await tick();
    assert(f.role('object-width'));
    assert.equal(f.role('object-width').value, '25.4');
    assert.deepEqual(
      f.calls.filter((x) => x.marginsRead),
      [{ marginsRead: { kind: 'picture', section: 0, node: 11 } }],
    );
    assert.equal(f.role('object-outer-margins-left').disabled, false);
    f.role('object-outer-margins-left').value = '2.646';
    fire(f.role('object-outer-margins-left'), 'input');
    assert.equal(f.role('object-apply').disabled, true);
    fire(f.role('object-outer-margins-apply'), 'click');
    await tick();
    const writes = f.calls.filter((x) => x.command);
    assert.equal(writes.length, 1);
    assert.equal(writes[0].payload.margins.left, 750);
    assert.equal(
      f.calls.some((x) => x.geometry),
      false,
    );
  } finally {
    tool.dispose();
  }
});
test('canonical receipt ignores resize identity while existing resize port retains its command identity', async () => {
  const f = fixture();
  f.row.resizeRecordNode = 99;
  const margins = captureHwp5PictureMarginsSelection(f.editor, f.host);
  assert.equal(margins.selector.node, 11);
  const port = createObjectPropertiesPort(f.editor, f.host),
    capture = port.capture();
  assert.equal(capture.target.pictureNode, 10);
  assert.equal(capture.target.resizeRecordNode, 99);
  await port.apply(capture, { width: '50.8', height: '12.7' });
  assert.deepEqual(
    f.calls.map((x) => x.geometry?.pictureNode),
    [99],
  );
});
test('malformed canonical ownership cannot borrow component or resize identity', () => {
  for (const mutate of [
    (f) => {
      delete f.row.recordNode;
    },
    (f) => {
      delete f.row.source;
    },
    (f) => {
      f.row.source.picture_node = 12;
    },
    (f) => {
      f.row.source.component_node = 12;
    },
    (f) => {
      f.row.pictureNode = 11;
    },
    (f) => {
      f.row.error = 'BadOwner';
    },
    (f) => {
      f.editor.getEditorState().content.pictures.push(structuredClone(f.row));
    },
    (f) => {
      f.editor.getEditorState().content.pictures.push({ ...f.row, pictureNode: 13 });
    },
    (f) => {
      f.editor.getEditorState().content.pictures.push({ ...f.row, recordNode: 13 });
    },
  ]) {
    const f = fixture();
    mutate(f);
    assert.equal(captureHwp5PictureMarginsSelection(f.editor, f.host), null);
    assert.equal(f.calls.length, 0);
  }
});
test('same-state row mutation and selection/host/document changes revoke the canonical capture', () => {
  for (const mutate of [
    (f) => {
      f.row.recordNode = 12;
    },
    (f) => {
      f.row.source.component_node = 12;
    },
    (f) => {
      f.row.source.picture_node = 12;
    },
    (f) => {
      f.row.error = 'BadOwner';
    },
    (f) => {
      f.editor.getEditorState().content.pictures = [structuredClone(f.row)];
    },
    (f) => {
      f.editor.getEditorState().content.pictures[0] = structuredClone(f.row);
    },
    (f) => {
      f.editor.getEditorState().content.pictures.push(structuredClone(f.row));
    },
    (f) => f.select(12),
    (f) => f.swapHost(),
    (f) => f.change(),
  ]) {
    const f = fixture(),
      capture = captureHwp5PictureMarginsSelection(f.editor, f.host);
    assert(capture);
    mutate(f);
    assert.equal(capture.current(), false);
  }
});
test('normal modal stale receipt blocks margin dispatch after its successful physical query', async () => {
  const f = fixture(),
    tool = createObjectPropertiesTool(f.options);
  try {
    tool.open();
    await tick();
    f.select(12);
    f.role('object-outer-margins-left').value = '2.646';
    fire(f.role('object-outer-margins-left'), 'input');
    fire(f.role('object-outer-margins-apply'), 'click');
    await tick();
    assert.equal(f.calls.filter((x) => x.marginsRead).length, 1);
    assert.equal(f.calls.filter((x) => x.command).length, 0);
  } finally {
    tool.dispose();
  }
});
test('a receipt callback cannot lend its old host authority after replacing that host', () => {
  const f = fixture(),
    host = f.host(),
    original = host.capturePictureReplacementSelection;
  host.capturePictureReplacementSelection = () => {
    const receipt = original();
    return {
      ...receipt,
      current() {
        f.swapHost();
        return receipt.current();
      },
    };
  };
  assert.equal(captureHwp5PictureMarginsSelection(f.editor, f.host), null);
});
