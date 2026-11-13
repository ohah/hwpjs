import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEquationPort, equationAvailability } from '../src/equation-port.ts';
import { createEquationEditState } from '../../../web/preview/equation-edit-state.mjs';
import { fixture, tick } from './equation-fixture.mjs';
const query = { kind: 'equation-script-query', requestId: 1, section: 0, node: 3 };
const write = {
  ...query,
  kind: 'equation-script-set',
  before: 'a + b',
  expectedRevision: 0,
  value: 'x < y\r\n한글',
};
test('actual capability/format/readonly/recovery gates fail closed', () => {
  const f = fixture();
  assert.equal(equationAvailability(f.editor.getEditorState()).enabled, true);
  for (const patch of [
    { status: 'disposed' },
    { status: 'refresh-required' },
    { historyRecoveryRequired: true },
    { capabilities: {} },
    { capabilities: { equationScriptAvailable: true, equationSectionCount: -1 } },
    { capabilities: { equationScriptAvailable: true, equationSectionCount: 0 } },
    { capabilities: { equationScriptAvailable: true, equationSectionCount: 1, readOnly: true } },
    { content: { format: 'hwp5' } },
    { content: { format: 'hwpx', readOnly: true } },
    { content: { format: 'hwpx', limited: true } },
  ]) {
    assert.equal(equationAvailability(f.replace(patch)).enabled, false);
  }
});
test('query uses readResource and captured token; writes use explicit mutation and native lease', async () => {
  const f = fixture(),
    p = createEquationPort(f.editor, f.options);
  const token = f.editor.getEditorState().token;
  assert.equal(p.request(query), true);
  await tick();
  assert.deepEqual(f.calls[0], { message: query, options: { token } });
  assert.equal(p.request(write), true);
  await tick();
  assert.deepEqual(f.calls[1], { message: write, options: { mutation: true, token } });
  assert.equal(f.messages[1].equation.value, write.value);
  assert.equal(p.ready(), true);
  assert.equal(f.invalidations.length, 0);
  p.close();
});
test('existing edit state chains successful query/write/query with current revision; unchanged submit emits no write', async () => {
  const f = fixture();
  let p;
  const state = createEquationEditState({ request: (m) => p.request(m) });
  p = createEquationPort(f.editor, { ...f.options, receive: (m) => state.message(m) });
  state.select({ section: 0, node: 3 });
  await tick();
  assert.equal(state.submit(), true);
  assert.equal(f.calls.length, 1);
  state.edit(write.value);
  assert.equal(state.submit(), true);
  assert.equal(state.submit(), false);
  await tick();
  assert.equal(state.snapshot().revision, 1);
  assert.equal(state.snapshot().canSubmit, true);
  state.refresh();
  await tick();
  assert.equal(state.snapshot().draft, write.value);
  p.close();
});
test('external state replacement invalidates pending read and detaches listener', async () => {
  const f = fixture();
  let resolve;
  f.editor.readResource = () =>
    new Promise((r) => {
      resolve = r;
    });
  const p = createEquationPort(f.editor, f.options);
  p.request(query);
  await tick();
  f.replace({ viewRevision: 1 });
  resolve(f.reply(query));
  await tick();
  assert.equal(f.messages.length, 0);
  assert.equal(f.invalidations.length, 1);
  assert.equal(f.listeners.size, 0);
  assert.equal(p.request(write), false);
});
test('close before microtask sends nothing; close during write suppresses late delivery', async () => {
  const f = fixture(),
    p = createEquationPort(f.editor, f.options);
  p.request(write);
  p.close();
  await tick();
  assert.equal(f.calls.length, 0);
  let resolve;
  f.editor.requestExperimental = () =>
    new Promise((r) => {
      resolve = r;
    });
  const q = createEquationPort(f.editor, f.options);
  q.request(write);
  await tick();
  q.close();
  resolve({
    status: 'committed-with-snapshot',
    state: f.editor.getEditorState(),
    reply: f.reply(write),
  });
  await tick();
  assert.equal(f.messages.length, 0);
  assert.equal(f.listeners.size, 0);
});
test('malformed requests and overlapping operations never reach Core', async () => {
  const f = fixture(),
    p = createEquationPort(f.editor, f.options);
  for (const m of [
    { ...query, kind: 'insert-equation' },
    { ...query, section: 2 },
    { ...query, node: -1 },
    { ...query, requestId: NaN },
    { ...write, expectedRevision: null },
    { ...write, before: null },
  ])
    assert.equal(p.request(m), false);
  assert.equal(p.request(query), true);
  assert.equal(p.request(write), false);
  await tick();
  assert.equal(f.calls.length, 1);
  p.close();
});
test('rejected native revision mismatch invalidates reused draft lease without retry', async () => {
  const f = fixture();
  let p;
  const state = createEquationEditState({ request: (m) => p.request(m) });
  p = createEquationPort(f.editor, { ...f.options, receive: (m) => state.message(m) });
  state.select({ section: 0, node: 3 });
  await tick();
  f.editor.requestExperimental = async (m) => ({
    status: 'rejected-unapplied',
    state: f.editor.getEditorState(),
    reply: { ...m, error: 'EquationRevisionMismatch', applied: false },
  });
  state.edit('new');
  state.submit();
  await tick();
  assert.equal(state.snapshot().canSubmit, false);
  assert.equal(state.snapshot().baseline, null);
  p.close();
});
test('refresh-required, uncertain transport, wrong document and superseded result never lend a new write lease', async () => {
  for (const mode of ['refresh', 'throw', 'document', 'superseded', 'malformed', 'missing-reply']) {
    const f = fixture(),
      p = createEquationPort(f.editor, f.options);
    f.editor.requestExperimental = async (m) => {
      if (mode === 'throw') throw Error('transport');
      const state = f.replace(mode === 'document' ? { documentId: 'other' } : {});
      if (mode === 'superseded') f.replace();
      if (mode === 'missing-reply') return { status: 'committed-with-snapshot', state };
      return {
        status: mode === 'refresh' ? 'committed-refresh-required' : 'committed-with-snapshot',
        state,
        reply:
          mode === 'malformed' ? { ...m, equation: { value: 'oops', revision: -1 } } : f.reply(m),
      };
    };
    p.request(write);
    await tick();
    assert.equal(f.invalidations.length, 1, mode);
    assert.equal(f.messages.length, 0, mode);
    assert.equal(p.ready(), false, mode);
  }
});
test('wrong read identity or invalid revision produces matching error and clears pending', async () => {
  for (const reply of [
    { ...query, requestId: 9 },
    { ...query, equation: { section: 0, node: 3, value: '', revision: -1 } },
  ]) {
    const f = fixture();
    f.editor.readResource = async () => reply;
    const p = createEquationPort(f.editor, f.options);
    p.request(query);
    await tick();
    assert.ok(f.messages[0].error);
    assert.equal(f.messages[0].requestId, 1);
    assert.equal(p.request(query), true);
    p.close();
  }
});
test('synchronous read failure is delivered after state enters pending, allowing refresh', async () => {
  const f = fixture();
  f.editor.readResource = () => {
    throw Error('unavailable');
  };
  let p;
  const state = createEquationEditState({ request: (m) => p.request(m) });
  p = createEquationPort(f.editor, { ...f.options, receive: (m) => state.message(m) });
  state.select({ section: 0, node: 3 });
  await tick();
  assert.equal(state.snapshot().pending, null);
  assert.equal(state.snapshot().error, 'unavailable');
  p.close();
});
