import test from 'node:test';
import assert from 'node:assert/strict';
import { Document, all } from './fake-dom.mjs';
import { createObjectGeometryForm } from '../src/object-geometry-form.ts';
import { SET_OBJECT_GEOMETRY_COMMAND } from '@hwpjs/core';
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture(options = {}) {
  const doc = new Document(),
    root = doc.createElement('main'),
    footer = doc.createElement('footer'),
    target = Object.freeze({}),
    calls = [];
  let state = { status: 'ready', historyRecoveryRequired: false, token: { operationRevision: 2 } },
    closed = 0,
    resolve;
  const read = {
    state: 'available',
    target,
    observation: {
      frame: {
        width: 12345,
        height: 9876,
        horizontalOffset: -20,
        verticalOffset: 0,
        treatAsCharacter: true,
      },
      editable: { size: options.size !== false, position: options.position !== false },
    },
  };
  const editor = {
    getEditorState: () => state,
    async getObjectGeometry(selector, settings) {
      calls.push({ kind: 'query', selector, settings });
      if (options.deferred)
        return await new Promise((done) => {
          resolve = () => done(read);
        });
      return read;
    },
    async dispatchCommand(command, payload) {
      calls.push({ kind: 'write', command, payload });
      if (options.pendingWrite)
        return await new Promise((done) => {
          resolve = () => done({ status: 'committed-with-snapshot' });
        });
      return { status: 'committed-with-snapshot' };
    },
  };
  const form = createObjectGeometryForm(
    root,
    footer,
    editor,
    { kind: 'drawing', section: 0, node: 12 },
    () => closed++,
  );
  return {
    root,
    footer,
    form,
    calls,
    target,
    get closed() {
      return closed;
    },
    replace() {
      state = { ...state };
    },
    retoken() {
      state.token.operationRevision++;
    },
    resolve() {
      resolve();
    },
    input(field) {
      return all(root, (x) => x.dataset.role === 'object-geometry-' + field)[0];
    },
    get apply() {
      return all(footer, (x) => x.dataset.role === 'object-geometry-apply')[0];
    },
  };
}
test('form obtains fresh Native source geometry and submits exact typed target with sparse mm edit', async () => {
  const h = fixture();
  try {
    await tick();
    assert.equal(h.calls[0].kind, 'query');
    assert.deepEqual(h.calls[0].selector, { kind: 'drawing', section: 0, node: 12 });
    assert.equal(h.input('width').value, '43.55');
    h.input('width').value = '50';
    h.input('width').dispatchEvent(new Event('input'));
    h.apply.dispatchEvent(new Event('click'));
    await tick();
    const write = h.calls.find((x) => x.kind === 'write');
    assert.equal(write.command, SET_OBJECT_GEOMETRY_COMMAND);
    assert.equal(write.payload.target, h.target);
    assert.deepEqual(write.payload.patch, { width: 14173 });
    assert.equal(h.closed, 1);
  } finally {
    h.form.dispose();
  }
});
test('unchanged rounded form submits empty intent, never rounded height or position', async () => {
  const h = fixture();
  try {
    await tick();
    h.apply.dispatchEvent(new Event('click'));
    await tick();
    assert.deepEqual(h.calls.find((x) => x.kind === 'write').payload.patch, {});
  } finally {
    h.form.dispose();
  }
});
test('independent Native size protection disables sizes while current offset remains editable', async () => {
  const h = fixture({ size: false });
  try {
    await tick();
    assert.equal(h.input('width').disabled, true);
    assert.equal(h.input('horizontalOffset').disabled, false);
    h.input('horizontalOffset').value = '0';
    h.input('horizontalOffset').dispatchEvent(new Event('input'));
    h.apply.dispatchEvent(new Event('click'));
    await tick();
    assert.deepEqual(h.calls.find((x) => x.kind === 'write').payload.patch, {
      horizontalOffset: 0,
    });
  } finally {
    h.form.dispose();
  }
});
test('replacement state while reading or before apply cannot dispatch old target', async () => {
  for (const pending of [true, false]) {
    const h = fixture({ deferred: pending });
    try {
      if (pending) {
        h.replace();
        h.resolve();
      }
      await tick();
      if (!pending) h.replace();
      h.apply.dispatchEvent(new Event('click'));
      await tick();
      assert.equal(h.calls.filter((x) => x.kind === 'write').length, 0);
    } finally {
      h.form.dispose();
    }
  }
});
test('duplicate apply and disposed pending response cannot hand off or replay old edits', async () => {
  const h = fixture({ pendingWrite: true });
  await tick();
  h.apply.dispatchEvent(new Event('click'));
  h.apply.dispatchEvent(new Event('click'));
  assert.equal(h.calls.filter((x) => x.kind === 'write').length, 1);
  h.form.dispose();
  h.resolve();
  await tick();
  assert.equal(h.closed, 0);
});
test('inline mode is explicit and an offset edit never switches it implicitly', async () => {
  const h = fixture();
  try {
    await tick();
    const checkbox = all(h.root, (x) => x.type === 'checkbox')[0];
    checkbox.checked = false;
    h.apply.dispatchEvent(new Event('click'));
    await tick();
    assert.deepEqual(h.calls.find((x) => x.kind === 'write').payload.patch, {
      treatAsCharacter: false,
    });
  } finally {
    h.form.dispose();
  }
});

test('in-place token tampering cannot submit a captured UI target', async () => {
  const h = fixture();
  try {
    await tick();
    h.retoken();
    h.apply.dispatchEvent(new Event('click'));
    await tick();
    assert.equal(h.calls.filter((x) => x.kind === 'write').length, 0);
  } finally {
    h.form.dispose();
  }
});
