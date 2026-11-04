import test from 'node:test';
import assert from 'node:assert/strict';
import { createObjectPropertiesPort } from '../src/object-properties-port.ts';
import { createObjectPropertiesView } from '../src/object-properties-view.ts';
import { pictureMillimeters, pictureUnits } from '../src/object-properties-input.ts';
import { documentFixture, fire } from './formatting-dialog-test-dom.ts';
function fixture(options = {}) {
  const calls = [];
  let node = 7,
    counter = 0;
  const picture = {
    section: 0,
    pictureNode: 7,
    geometry: { width: 7200, height: 3600, widthRelative: 4, heightRelative: 2 },
    ...options.picture,
  };
  let state;
  function replace(delta = {}) {
    const token = {
      editorId: 'editor',
      documentId: 'document',
      generation: 1,
      operationRevision: counter,
      viewRevision: 0,
      ...delta.token,
    };
    state = Object.freeze({
      ...token,
      status: 'ready',
      stateVersion: counter,
      capabilities: { pictureResizeAvailable: true },
      content: { format: 'hwp5', limited: false, pictures: [picture] },
      ...delta,
      token: Object.freeze(token),
    });
    return state;
  }
  replace(options.state);
  let duringRead;
  const host = {
    getContextPicture() {
      const answer =
        node === null
          ? null
          : node === undefined
            ? undefined
            : { ...state.token, section: 0, pictureNode: node };
      duringRead?.();
      return answer;
    },
  };
  const editor = {
    getEditorState: () => state,
    registerStateListener: () => () => {},
    requestExperimental: async (...args) => {
      calls.push(args);
      return { status: 'committed-with-snapshot', state };
    },
  };
  const port = createObjectPropertiesPort(editor, () => host);
  return {
    port,
    editor,
    picture,
    host,
    calls,
    replace,
    state: () => state,
    select: (n) => {
      node = n;
    },
    during: (fn) => {
      duringRead = fn;
    },
    advance() {
      counter++;
      return replace();
    },
  };
}

function setup() {
  const f = fixture({
    picture: { geometry: { width: 10001, height: 7001, widthRelative: 4, heightRelative: 2 } },
  });
  const dom = documentFixture(),
    capture = f.port.capture(),
    tasks = [];
  assert.equal(capture.reason, null);
  const view = createObjectPropertiesView(
    dom.root,
    capture,
    { width: pictureMillimeters(10001), height: pictureMillimeters(7001) },
    { onApply: (d) => tasks.push(f.port.apply(capture, d)), onDismiss() {} },
  );
  return { ...f, ...dom, view, tasks };
}
for (const locked of [false, true])
  test('무편집 비율 토글 ' + locked, async () => {
    const f = setup();
    try {
      f.role('object-lock-ratio').checked = locked;
      fire(f.role('object-lock-ratio'), 'change');
      fire(f.role('object-apply'), 'click');
      assert.equal((await f.tasks[0]).status, 'known-no-op');
      assert.equal(f.calls.length, 0);
    } finally {
      f.view.destroy();
    }
  });
for (const axis of ['width', 'height'])
  test('비율 유지 ' + axis + '는 원 정수 비율과 단일 요청', async () => {
    const f = setup();
    try {
      f.role('object-lock-ratio').checked = true;
      fire(f.role('object-lock-ratio'), 'change');
      f.role('object-' + axis).value = '50';
      fire(f.role('object-' + axis), 'input');
      fire(f.role('object-apply'), 'click');
      await f.tasks[0];
      const other = axis === 'width' ? 'height' : 'width',
        original = { width: 10001, height: 7001 };
      const units = pictureUnits('50');
      const expected = Number(
        (BigInt(units) * BigInt(original[other]) + BigInt(original[axis]) / 2n) /
          BigInt(original[axis]),
      );
      assert.equal(f.calls.length, 1);
      assert.equal(f.calls[0][0].kind, 'picture-resize');
      assert.equal(f.calls[0][0][axis], units);
      assert.equal(f.calls[0][0][other], expected);
    } finally {
      f.view.destroy();
    }
  });
for (const axis of ['width', 'height'])
  test('비율 해제 ' + axis + '만 변경하면 다른 축 원 정수 보존', async () => {
    const f = setup();
    try {
      f.role('object-' + axis).value = '50';
      fire(f.role('object-' + axis), 'input');
      fire(f.role('object-apply'), 'click');
      await f.tasks[0];
      assert.equal(f.calls.length, 1);
      assert.equal(
        f.calls[0][0][axis === 'width' ? 'height' : 'width'],
        axis === 'width' ? 7001 : 10001,
      );
    } finally {
      f.view.destroy();
    }
  });
for (const mode of ['undo', 'document', 'picture'])
  test('비율 초안 후 ' + mode + ' 교체는 요청0', async () => {
    const f = setup();
    try {
      f.role('object-lock-ratio').checked = true;
      f.role('object-width').value = '50';
      fire(f.role('object-width'), 'input');
      if (mode === 'undo') f.advance();
      else if (mode === 'document') f.replace({ token: { documentId: 'new' } });
      else f.select(8);
      fire(f.role('object-apply'), 'click');
      assert.equal((await f.tasks[0]).status, 'rejected-unapplied');
      assert.equal(f.calls.length, 0);
    } finally {
      f.view.destroy();
    }
  });
