import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTableCellBackgroundPort } from '../src/table-cell-background-port.ts';
import { createTableCellBackgroundController } from '../src/table-cell-background-tool.ts';
import { fixture } from './table-cell-properties-fixture.mjs';
const draft = { color: '#000000', dirty: true };
const tick = async () => {
  for (let i = 0; i < 16; i++) await Promise.resolve();
};
function setup(statusCallback) {
  const f = fixture();
  f.state.capabilities.cellBackgroundAvailable = true;
  const port = createTableCellBackgroundPort(f.editor, f.api),
    views = [],
    handlers = [],
    messages = [];
  let focus = 0;
  const tool = createTableCellBackgroundController({
    root: { querySelector: () => null },
    port,
    onStatus: (s) => {
      messages.push(s);
      statusCallback?.();
    },
    onClose: () => {
      focus++;
    },
    createView(root, c, callbacks) {
      handlers.push(callbacks);
      const v = {
        busy: false,
        stale: '',
        status: '',
        destroyed: 0,
        focus() {},
        setBusy(b) {
          this.busy = b;
        },
        setStale(s) {
          this.stale = s;
        },
        setStatus(s) {
          this.status = s;
        },
        destroy() {
          this.destroyed++;
        },
      };
      views.push(v);
      return v;
    },
  });
  return {
    f,
    port,
    tool,
    views,
    handlers,
    messages,
    get focus() {
      return focus;
    },
  };
}
test('cancel original selection restores focus without mutation; closed tool disposes subscription', () => {
  const s = setup();
  s.tool.open();
  s.handlers[0].dismiss();
  assert.equal(s.focus, 1);
  assert.equal(s.f.mutationCalls().length, 0);
  s.tool.dispose();
  assert.equal(s.f.listeners.size, 0);
});
test('authoritative background no-op releases real capture and restores Canvas focus once', async () => {
  const s = setup();
  let requests = 0,
    captured;
  const capture = s.port.capture;
  s.port.capture = () => {
    const value = capture();
    captured ??= value;
    return value;
  };
  s.f.editor.requestExperimental = async (message, options) => {
    requests++;
    s.f.calls.push({ type: 'mutation', message, options });
    return { status: 'known-no-op', state: s.f.state };
  };
  s.tool.open();
  const handlers = s.handlers[0];
  handlers.apply(draft);
  await tick();
  assert.equal(s.port.isCurrent(captured), true);
  assert.equal(s.views[0].destroyed, 1);
  assert.equal(s.focus, 1);
  handlers.apply(draft);
  handlers.dismiss();
  await tick();
  assert.equal(requests, 1, 'closed no-op UI must not enqueue a second request');
  assert.equal(s.focus, 1);
  assert.equal(s.f.calls.filter((x) => x.type === 'selection').length, 0);
  s.tool.dispose();
});
test('authoritative no-op with changed state cannot restore stale focus or retry', async () => {
  const s = setup();
  let requests = 0,
    captured;
  const capture = s.port.capture;
  s.port.capture = () => {
    const value = capture();
    captured ??= value;
    return value;
  };
  s.f.editor.requestExperimental = async () => {
    requests++;
    s.f.replace({ selection: { ...s.f.state.selection, startUnit: 1 } });
    return { status: 'known-no-op', state: s.f.state };
  };
  s.tool.open();
  const handlers = s.handlers[0];
  handlers.apply(draft);
  await tick();
  assert.equal(s.port.isCurrent(captured), false);
  assert.equal(s.focus, 0);
  handlers.apply(draft);
  await tick();
  assert.equal(requests, 1);
  s.tool.dispose();
});
test('detached old view apply/dismiss cannot target or close newer view', async () => {
  const s = setup();
  s.tool.open();
  const old = s.handlers[0];
  old.dismiss();
  s.tool.open();
  old.dismiss();
  old.apply(draft);
  await tick();
  assert.equal(s.views[1].destroyed, 0);
  assert.equal(s.f.mutationCalls().length, 0);
  s.tool.dispose();
});
test('selection change marks stale and document change closes without old focus', () => {
  const s = setup();
  s.tool.open();
  s.f.replace({ selection: { ...s.f.state.selection, startUnit: 1 } });
  assert.ok(s.views[0].stale);
  s.f.replace({ documentId: 'new', selection: null });
  assert.equal(s.views[0].destroyed, 1);
  assert.equal(s.focus, 0);
  s.tool.dispose();
});
test('pending duplicate and late ACK after close are not reapplied or reported', async () => {
  const s = setup();
  let resolve;
  s.f.editor.requestExperimental = async (message, options) => {
    s.f.calls.push({ type: 'mutation', message, options });
    return new Promise((r) => {
      resolve = r;
    });
  };
  s.tool.open();
  s.handlers[0].apply(draft);
  await tick();
  s.handlers[0].apply(draft);
  s.handlers[0].dismiss();
  resolve({ status: 'committed-with-snapshot', state: s.f.state });
  await tick();
  assert.equal(s.f.mutationCalls().length, 1);
  assert.equal(s.messages.length, 0);
  assert.equal(s.focus, 0);
  s.tool.dispose();
});
test('commit-refresh warns once and closes; late dispose prevents updates', async () => {
  const s = setup();
  s.f.editor.requestExperimental = async () => ({
    status: 'committed-refresh-required',
    state: s.f.state,
  });
  s.tool.open();
  s.handlers[0].apply(draft);
  await tick();
  assert.equal(s.views[0].destroyed, 1);
  assert.match(s.messages[0], /다시 적용하지/);
  assert.equal(s.focus, 0);
  s.tool.dispose();
  const q = setup();
  let resolve;
  q.f.editor.requestExperimental = () =>
    new Promise((r) => {
      resolve = r;
    });
  q.tool.open();
  q.handlers[0].apply(draft);
  await tick();
  q.tool.dispose();
  resolve({ status: 'committed-with-snapshot', state: q.f.state });
  await tick();
  assert.equal(q.messages.length, 0);
  assert.equal(q.focus, 0);
  assert.equal(q.f.listeners.size, 0);
});
test('successful restore uses existing issued selection; status reentry cannot steal focus', async () => {
  let s;
  s = setup(() => s.f.replace({ documentId: 'other', selection: null }));
  s.f.editor.requestExperimental = async () => {
    s.f.replace({ selection: undefined, operationRevision: 1 });
    return { status: 'committed-with-snapshot', state: s.f.state };
  };
  s.tool.open();
  s.handlers[0].apply(draft);
  await tick();
  assert.equal(s.f.calls.filter((x) => x.type === 'selection').length, 1);
  assert.equal(s.focus, 0);
  s.tool.dispose();
});
test('destroy failure still releases listener and port', () => {
  const s = setup();
  s.tool.open();
  s.views[0].destroy = () => {
    throw Error('destroy');
  };
  assert.throws(() => s.tool.dispose());
  assert.equal(s.f.listeners.size, 0);
  assert.equal(s.port.presentation().enabled, false);
});
