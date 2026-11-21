// Public API contract fixture only; no Native, SDK build or browser execution.
import test from 'node:test';
import assert from 'node:assert/strict';
import { SET_HWP5_VERTICAL_MARGINS_COMMAND, SET_OBJECT_OUTER_MARGINS_COMMAND } from '@hwpjs/core';
import { createObjectOuterMarginsForm } from '../src/object-outer-margins-form.ts';
import { createObjectOuterMarginsPort } from '../src/object-outer-margins-port.ts';
import { createObjectPropertiesEditGate } from '../src/object-properties-edit-gate.ts';
import { documentFixture, fire } from './formatting-dialog-test-dom.ts';
const tick = () => new Promise((resolve) => setImmediate(resolve));
function fixture(kind = 'picture', options = {}) {
  const dom = documentFixture(),
    calls = [],
    selector = { kind, section: 0, node: kind === 'picture' ? 11 : 12 };
  const token = {
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    operationRevision: 0,
    viewRevision: 0,
  };
  let state = { ...token, token, status: 'ready', stateVersion: 1, content: { format: 'hwp5' } },
    live = true;
  const target = Object.freeze({}),
    margins = { left: -32768, right: -1, top: 0, bottom: 3, ...options.margins };
  const editor = {
    getEditorState: () => state,
    async getObjectOuterMargins(s) {
      calls.push({ squareRead: s });
      if (options.throw) throw Error('OriginalQueryFailure');
      return {
        state: 'unavailable',
        reason: options.reason ?? 'OuterMarginsTopBottomFollowUpRequired',
      };
    },
    async getHwp5VerticalMargins(s) {
      calls.push({ verticalRead: s });
      options.onVertical?.();
      return {
        state: 'available',
        target,
        observation: { format: 'hwp5', selector: s, ...margins },
      };
    },
    async dispatchCommand(command, payload) {
      calls.push({ command, payload });
      return { status: 'committed-with-snapshot' };
    },
  };
  const footer = dom.doc.createElement('footer');
  dom.root.append(footer);
  let closed = 0;
  const form = createObjectOuterMarginsForm(
    dom.root,
    footer,
    editor,
    selector,
    () => live,
    createObjectPropertiesEditGate(),
    () => closed++,
  );
  const set = (field, value) => {
    const e = dom.role('object-outer-margins-' + field);
    e.value = value;
    fire(e, 'input');
  };
  return {
    ...dom,
    form,
    calls,
    editor,
    selector,
    target,
    margins,
    set,
    closed: () => closed,
    apply: () => fire(dom.role('object-outer-margins-apply'), 'click'),
    change: () => {
      state = { ...state, stateVersion: 2 };
    },
    detach: () => {
      live = false;
    },
  };
}
for (const kind of ['picture', 'textbox'])
  test(
    'H5 raw1 ' +
      kind +
      ' locks exact signed horizontal words and dispatches vertical-only payload once',
    async () => {
      const f = fixture(kind);
      try {
        await tick();
        assert.equal(f.role('object-outer-margins-left').disabled, true);
        assert.equal(f.role('object-outer-margins-right').disabled, true);
        assert.equal(f.role('object-outer-margins-right').value, '-0.004');
        assert.equal(f.role('object-outer-margins-top').disabled, false);
        f.set('top', '2.646');
        f.set('bottom', '5.292');
        f.apply();
        await tick();
        assert.deepEqual(
          f.calls.filter((x) => x.verticalRead),
          [{ verticalRead: f.selector }],
        );
        const writes = f.calls.filter((x) => x.command);
        assert.equal(writes.length, 1);
        assert.equal(writes[0].command, SET_HWP5_VERTICAL_MARGINS_COMMAND);
        assert.deepEqual(writes[0].payload, { target: f.target, top: 750, bottom: 1500 });
        assert.equal(f.closed(), 1);
      } finally {
        f.form.dispose();
      }
    },
  );
test('unchanged signed vertical word is retained, while a newly changed negative value is refused', async () => {
  const f = fixture('textbox', { margins: { top: -32768 } });
  try {
    await tick();
    f.set('bottom', '2.646');
    f.apply();
    await tick();
    assert.deepEqual(f.calls.find((x) => x.command).payload, {
      target: f.target,
      top: -32768,
      bottom: 750,
    });
  } finally {
    f.form.dispose();
  }
  const g = fixture('textbox');
  try {
    await tick();
    g.set('top', '-0.004');
    assert.equal(g.role('object-outer-margins-apply').disabled, true);
    g.apply();
    await tick();
    assert.equal(
      g.calls.some((x) => x.command),
      false,
    );
  } finally {
    g.form.dispose();
  }
});
test('locked horizontal text cannot change through a synthetic input event', async () => {
  const f = fixture();
  try {
    await tick();
    f.set('left', '0');
    f.set('top', '2.646');
    f.apply();
    await tick();
    assert.equal(
      f.calls.some((x) => x.command),
      false,
    );
  } finally {
    f.form.dispose();
  }
});
test('vertical UI refuses stale document, stale selection and composition without a command', async () => {
  for (const revoke of [
    (f) => f.change(),
    (f) => f.detach(),
    (f) => fire(f.root, 'compositionstart'),
    (f) => fire(f.root, 'keydown', { keyCode: 229 }),
  ]) {
    const f = fixture();
    try {
      await tick();
      f.set('top', '2.646');
      revoke(f);
      f.apply();
      await tick();
      assert.equal(
        f.calls.some((x) => x.command),
        false,
      );
    } finally {
      f.form.dispose();
    }
  }
});
test('only the exact follow-up reason switches APIs; original failures remain failures', async () => {
  for (const options of [
    { reason: 'OuterMarginsReadOnly' },
    { reason: 'UnsupportedOwner' },
    { throw: true },
  ]) {
    const f = fixture('picture', options);
    try {
      await tick();
      assert.equal(
        f.calls.some((x) => x.verticalRead),
        false,
      );
      assert.equal(f.role('object-outer-margins-apply').disabled, true);
    } finally {
      f.form.dispose();
    }
  }
});
test('port preserves both horizontal words and consumes only its own current vertical target', async () => {
  const f = fixture();
  f.form.dispose();
  f.calls.length = 0;
  const port = createObjectOuterMarginsPort(f.editor, () => true),
    result = await port.read(f.selector);
  assert.equal(result.available, true);
  const other = createObjectOuterMarginsPort(f.editor, () => true);
  await assert.rejects(other.apply(result.capture, { ...f.margins, top: 750 }));
  await assert.rejects(port.apply(result.capture, { ...f.margins, left: -32767, top: 750 }));
  assert.equal(port.current(result.capture), true);
  await port.apply(result.capture, { ...f.margins, top: 750 });
  await assert.rejects(port.apply(result.capture, { ...f.margins, top: 750 }));
  assert.equal(f.calls.filter((x) => x.command).length, 1);
  assert.equal(
    f.calls.some((x) => x.command === SET_OBJECT_OUTER_MARGINS_COMMAND),
    false,
  );
});
test('the original dispatch getter still runs before the shared port final stale fence', async () => {
  const f = fixture();
  await tick();
  f.form.dispose();
  const port = createObjectOuterMarginsPort(f.editor, () => true),
    result = await port.read(f.selector);
  let invoked = 0;
  Object.defineProperty(f.editor, 'dispatchCommand', {
    get() {
      f.change();
      return async () => {
        invoked++;
      };
    },
  });
  await assert.rejects(port.apply(result.capture, { ...f.margins, top: 750 }));
  assert.equal(invoked, 0);
});
test('a state change while querying vertical margins cannot enable the form', async () => {
  const options = {},
    f = fixture('picture', options);
  options.onVertical = () => f.change();
  try {
    await tick();
    assert.equal(f.role('object-outer-margins-apply').disabled, true);
    assert.equal(
      f.calls.some((x) => x.command),
      false,
    );
  } finally {
    f.form.dispose();
  }
});
