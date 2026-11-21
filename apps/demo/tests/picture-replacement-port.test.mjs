import test from 'node:test';
import assert from 'node:assert/strict';
import { createPictureReplacementPort } from '../src/picture-replacement-port.ts';

function fixture() {
  let state = Object.freeze({ status: 'ready', token: Object.freeze({ documentId: 'd1' }) });
  let selected = true;
  const target = Object.freeze({});
  const calls = [],
    queries = [];
  const editor = {
    getEditorState: () => state,
    async getPictureReplacement(selector, options) {
      queries.push({ selector, options });
      return { state: 'available', target };
    },
    async dispatchCommand(command, payload) {
      calls.push({ command, payload });
      return { status: 'committed-with-snapshot' };
    },
  };
  const host = {
    capturePictureReplacementSelection: () => ({
      section: 0,
      pictureNode: 7,
      current: () => selected,
    }),
  };
  const port = createPictureReplacementPort(editor, () => host);
  return {
    editor,
    host,
    target,
    port,
    calls,
    queries,
    stale: () => {
      state = Object.freeze({ ...state });
    },
    deselect: () => {
      selected = false;
    },
  };
}
test('real command factory receives Native opaque target and actual picture node once', async () => {
  const f = fixture(),
    capture = await f.port.capture(),
    imageBytes = new Uint8Array([1]);
  assert.deepEqual(f.queries[0].selector, { section: 0, pictureNode: 7 });
  assert.equal(f.queries[0].options.token, capture.state.token);
  await f.port.submit(capture, imageBytes);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].command.name, 'replace-picture');
  assert.equal(f.calls[0].payload.target, f.target);
  await assert.rejects(f.port.submit(capture, imageBytes));
  assert.equal(f.calls.length, 1);
});
test('cloned and foreign-port captures refuse before command dispatch', async () => {
  const f = fixture(),
    capture = await f.port.capture();
  await assert.rejects(f.port.submit({ ...capture }, new Uint8Array([1])));
  const other = createPictureReplacementPort(f.editor, () => f.host);
  await assert.rejects(other.submit(capture, new Uint8Array([1])));
  assert.equal(f.calls.length, 0);
});
for (const action of ['stale', 'deselect']) {
  test(`asynchronous Native owner read refuses ${action}`, async () => {
    const f = fixture();
    let resolve;
    f.editor.getPictureReplacement = () =>
      new Promise((done) => {
        resolve = done;
      });
    const pending = f.port.capture();
    f[action]();
    resolve({ state: 'available', target: f.target });
    await assert.rejects(pending);
    assert.equal(f.calls.length, 0);
  });
}
test('unavailable Native response never creates a UI replacement capture', async () => {
  const f = fixture();
  f.editor.getPictureReplacement = async () => ({
    state: 'unavailable',
    reason: 'ReadOnlyDocument',
  });
  await assert.rejects(f.port.capture(), /ReadOnlyDocument/);
  assert.equal(f.calls.length, 0);
});
test('dispatch getter reentry cannot combine a captured owner with a new document', async () => {
  const f = fixture(),
    capture = await f.port.capture();
  const send = f.editor.dispatchCommand;
  Object.defineProperty(f.editor, 'dispatchCommand', {
    get() {
      f.stale();
      return send;
    },
  });
  await assert.rejects(f.port.submit(capture, new Uint8Array([1])));
  assert.equal(f.calls.length, 0);
});
test('replacing the host invalidates a capture even when its old lease still reports current', async () => {
  const f = fixture();
  let host = f.host;
  const port = createPictureReplacementPort(f.editor, () => host);
  const capture = await port.capture();
  host = { ...f.host };
  await assert.rejects(port.submit(capture, new Uint8Array([1])));
  assert.equal(f.calls.length, 0);
});
