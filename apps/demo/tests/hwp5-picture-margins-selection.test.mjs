import test from 'node:test';
import assert from 'node:assert/strict';
import {
  captureHwp5PictureMarginsSelection,
  createHwp5PictureOuterMarginsTool,
} from '../src/hwp5-picture-outer-margins-tool.ts';
import { documentFixture, fire } from './formatting-dialog-test-dom.ts';
const tick = () => new Promise((r) => setImmediate(r));
function fixture(options = {}) {
  const d = documentFixture();
  let state = {
    status: 'ready',
    historyRecoveryRequired: false,
    token: { editorId: 'e', documentId: 'd', generation: 1, operationRevision: 0, viewRevision: 0 },
    stateVersion: 1,
    content: {
      format: 'hwp5',
      pictures: [
        {
          section: 0,
          pictureNode: 10,
          recordNode: 11,
          source: { component_node: 10, picture_node: 11 },
          sizeProtected: true,
          geometry: null,
        },
      ],
    },
    ...options.state,
  };
  let selected = true;
  let listener;
  const calls = [];
  const host = {
    capturePictureReplacementSelection: () => ({
      section: 0,
      pictureNode: 11,
      current: () => selected,
    }),
  };
  let activeHost = host;
  const editor = {
    getEditorState: () => state,
    registerStateListener(fn) {
      listener = fn;
      return () => {
        listener = undefined;
      };
    },
    async getObjectOuterMargins(selector) {
      calls.push({ read: selector });
      return options.unavailable
        ? { state: 'unavailable', reason: 'UnsupportedOwner' }
        : {
            state: 'available',
            target: Object.freeze({}),
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
      return { status: 'committed-with-snapshot' };
    },
  };
  let closed = 0;
  const optionsTool = {
    root: d.root,
    editor,
    host: () => activeHost,
    onClose: () => closed++,
    onStatus() {},
  };
  return {
    ...d,
    optionsTool,
    editor,
    host: () => activeHost,
    calls,
    get closed() {
      return closed;
    },
    change() {
      state = { ...state, stateVersion: 2 };
      listener?.();
    },
    selection() {
      selected = false;
    },
    swapHost() {
      activeHost = { ...host };
    },
    state: () => state,
  };
}
test('H5 margin selection keeps physical picture11 and ignores unrelated resize protection or absent dimensions', () => {
  const f = fixture();
  const c = captureHwp5PictureMarginsSelection(f.editor, f.host);
  assert.deepEqual(c.selector, { kind: 'picture', section: 0, node: 11 });
  assert.equal(c.current(), true);
  assert.equal('width' in c, false);
  assert.equal('height' in c, false);
  f.selection();
  assert.equal(c.current(), false);
});
test('H5 margin capture refuses readonly, unavailable state, wrong format, partial scope and unknown owner', () => {
  for (const patch of [
    { status: 'loading' },
    { historyRecoveryRequired: true },
    { nativeHistoryStats: { poisoned: true } },
    { capabilities: { readOnly: true } },
    { content: { format: 'hwpx', pictures: [{ section: 0, pictureNode: 11 }] } },
    { content: { format: 'hwp5', readOnly: true, pictures: [{ section: 0, pictureNode: 11 }] } },
    { content: { format: 'hwp5', window: {}, pictures: [{ section: 0, pictureNode: 11 }] } },
    { content: { format: 'hwp5', pictures: [] } },
  ]) {
    const f = fixture({ state: patch });
    assert.equal(captureHwp5PictureMarginsSelection(f.editor, f.host), null);
  }
});
test('captured selection does not survive host replacement or document state replacement', () => {
  for (const mutation of ['swapHost', 'change']) {
    const f = fixture();
    const c = captureHwp5PictureMarginsSelection(f.editor, f.host);
    f[mutation]();
    assert.equal(c.current(), false);
  }
});
test('margin-only dialog reads physical selector without inventing size and closes on document change', async () => {
  const f = fixture(),
    tool = createHwp5PictureOuterMarginsTool(f.optionsTool),
    c = tool.capture();
  tool.open(c);
  await tick();
  assert.deepEqual(f.calls[0], { read: { kind: 'picture', section: 0, node: 11 } });
  assert.equal(f.role('object-width'), undefined);
  assert(f.role('object-outer-margins'));
  f.change();
  assert.equal(f.role('object-outer-margins'), undefined);
  tool.dispose();
});
test('unsupported ABI/owner remains visibly unavailable with no dispatch', async () => {
  const f = fixture({ unavailable: true }),
    tool = createHwp5PictureOuterMarginsTool(f.optionsTool);
  tool.open(tool.capture());
  await tick();
  assert.equal(f.role('object-outer-margins-apply').disabled, true);
  assert.equal(f.calls.filter((x) => x.command).length, 0);
  tool.dispose();
});

test('qualified margin-only form dispatches once and keeps image size and replacement paths unused', async () => {
  const f = fixture(),
    tool = createHwp5PictureOuterMarginsTool(f.optionsTool);
  tool.open(tool.capture());
  await tick();
  const left = f.role('object-outer-margins-left');
  left.value = '1';
  fire(left, 'input');
  fire(f.role('object-outer-margins-apply'), 'click');
  await tick();
  assert.equal(f.calls.filter((x) => x.command).length, 1);
  assert.equal(f.calls.at(-1).payload.margins.left, 283);
  assert.equal('imageBytes' in f.calls.at(-1).payload, false);
  assert.equal('width' in f.calls.at(-1).payload, false);
  tool.dispose();
});
test('foreign margin-only capture cannot open another tool or substitute a selector', () => {
  const a = fixture(),
    b = fixture(),
    first = createHwp5PictureOuterMarginsTool(a.optionsTool),
    second = createHwp5PictureOuterMarginsTool(b.optionsTool),
    capture = first.capture();
  second.open(capture);
  assert.equal(b.role('object-outer-margins'), undefined);
  first.open({ ...capture, selector: { kind: 'picture', section: 0, node: 99 } });
  assert.equal(a.role('object-outer-margins'), undefined);
  first.dispose();
  second.dispose();
});
