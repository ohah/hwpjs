import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTableCellAppearancePort } from '../src/table-cell-appearance-port.ts';
import { createTableCellAppearanceController } from '../src/table-cell-appearance-tool.ts';
import { fixture } from './table-cell-properties-fixture.mjs';
const draft = { border: null, background: { color: '#123456', dirty: true } };
const tick = async () => {
  for (let i = 0; i < 30; i++) await Promise.resolve();
};
function setup() {
  const f = fixture();
  f.state.capabilities.cellAppearanceAvailable = true;
  const port = createTableCellAppearancePort(f.editor, f.api),
    views = [],
    handlers = [],
    messages = [];
  let focus = 0;
  const tool = createTableCellAppearanceController({
    root: { querySelector: () => null },
    port,
    onStatus: (s) => messages.push(s),
    onClose: () => focus++,
    createView(root, c, callbacks) {
      handlers.push(callbacks);
      const v = {
        capture: c,
        busy: false,
        stale: '',
        destroyed: 0,
        resets: [],
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
        reset(c) {
          this.resets.push(c);
          this.capture = c;
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
    views,
    handlers,
    messages,
    tool,
    get focus() {
      return focus;
    },
  };
}
test('apply keeps same view open only after successful recapture, next edit uses fresh token', async () => {
  const s = setup();
  s.f.editor.requestExperimental = async (message, options) => {
    s.f.calls.push({ type: 'mutation', message, options });
    const rev = s.f.state.operationRevision + 1;
    s.f.replace({
      selection: undefined,
      operationRevision: rev,
      token: { ...s.f.state.token, operationRevision: rev },
    });
    return { status: 'committed-with-snapshot', state: s.f.state };
  };
  s.tool.open();
  s.handlers[0].apply(draft, true);
  await tick();
  assert.equal(s.views[0].destroyed, 0);
  assert.equal(s.views[0].resets.length, 1);
  assert.equal(s.focus, 0);
  assert.equal(s.port.isCurrent(s.views[0].capture), true);
  assert.equal(s.views[0].busy, false);
  s.handlers[0].apply(draft, false);
  await tick();
  assert.equal(s.f.mutationCalls().length, 2);
  assert.deepEqual(
    s.f.mutationCalls().map((c) => c.options.token.operationRevision),
    [0, 1],
  );
  assert.equal(s.views[0].destroyed, 1);
  assert.equal(s.focus, 1);
  s.tool.dispose();
});
test('refresh-required ACK closes even for keep-open and never permits retry', async () => {
  const s = setup();
  s.f.editor.requestExperimental = async (message, options) => {
    s.f.calls.push({ type: 'mutation', message, options });
    return { status: 'committed-refresh-required', state: s.f.state };
  };
  s.tool.open();
  s.handlers[0].apply(draft, true);
  await tick();
  assert.equal(s.views[0].destroyed, 1);
  assert.match(s.messages[0], /다시 적용하지/);
  s.handlers[0].apply(draft, true);
  await tick();
  assert.equal(s.f.mutationCalls().length, 1);
  s.tool.dispose();
});
test('failed recapture closes instead of reopening with cloned old lease', async () => {
  const s = setup();
  s.f.api.createParagraphSelection = () => {
    throw Error('unavailable');
  };
  s.f.editor.requestExperimental = async () => {
    s.f.replace({ selection: undefined });
    return { status: 'committed-with-snapshot', state: s.f.state };
  };
  s.tool.open();
  s.handlers[0].apply(draft, true);
  await tick();
  assert.equal(s.views[0].destroyed, 1);
  assert.equal(s.views[0].resets.length, 0);
  assert.equal(s.focus, 0);
  s.tool.dispose();
});
test('known no-op apply recaptures and remains open; confirm preserves old close behavior', async () => {
  const s = setup();
  let count = 0;
  s.f.editor.requestExperimental = async () => {
    count++;
    return { status: 'known-no-op', state: s.f.state };
  };
  s.tool.open();
  s.handlers[0].apply(draft, true);
  await tick();
  assert.equal(s.views[0].resets.length, 1);
  assert.equal(s.views[0].destroyed, 0);
  s.handlers[0].apply(draft, false);
  await tick();
  assert.equal(count, 2);
  assert.equal(s.views[0].destroyed, 1);
  assert.equal(s.focus, 1);
  s.tool.dispose();
});
test('late ACK after close cannot reset or reopen the old view', async () => {
  const s = setup();
  let resolve;
  s.f.editor.requestExperimental = () => new Promise((r) => (resolve = r));
  s.tool.open();
  s.handlers[0].apply(draft, true);
  await tick();
  s.handlers[0].dismiss();
  resolve({ status: 'committed-with-snapshot', state: s.f.state });
  await tick();
  assert.equal(s.views[0].resets.length, 0);
  assert.equal(s.messages.length, 0);
  assert.equal(s.focus, 0);
  s.tool.dispose();
});
test('same view after apply still becomes stale on selection change and closes on document replacement', async () => {
  const s = setup();
  s.tool.open();
  s.handlers[0].apply(draft, true);
  await tick();
  assert.equal(s.views[0].resets.length, 1);
  s.f.replace({ selection: { ...s.f.state.selection, startUnit: 1 } });
  assert.ok(s.views[0].stale);
  s.f.replace({ documentId: 'another', selection: null });
  assert.equal(s.views[0].destroyed, 1);
  s.tool.dispose();
  assert.equal(s.f.listeners.size, 0);
});
test('no-op after selection reentry never keeps open a newly selected different cell', async () => {
  const s = setup();
  s.f.editor.requestExperimental = async () => {
    s.f.replace({ selection: { ...s.f.state.selection, startUnit: 1 } });
    return { status: 'known-no-op', state: s.f.state };
  };
  s.tool.open();
  s.handlers[0].apply(draft, true);
  await tick();
  assert.equal(s.views[0].destroyed, 1);
  assert.equal(s.views[0].resets.length, 0);
  assert.equal(s.focus, 0);
  s.tool.dispose();
});
test('successful apply cannot keep open on a different cell chosen during restoration', async () => {
  const s = setup();
  const t = s.f.state.content.tables[0],
    a = t.cells[0];
  t.rows = 1;
  t.columns = 2;
  t.cells = [a, { ...a, listNode: 83, row: 0, column: 1, paragraphs: [16] }];
  s.f.state.content.paragraphs.push({
    ...s.f.state.content.paragraphs[0],
    paragraph: 16,
    tableCell: { tableNode: 81, listNode: 83 },
  });
  s.f.editor.requestExperimental = async () => {
    s.f.replace({ selection: { ...s.f.state.selection, paragraph: 16 } });
    return { status: 'committed-with-snapshot', state: s.f.state };
  };
  s.tool.open();
  s.handlers[0].apply(draft, true);
  await tick();
  assert.equal(s.views[0].destroyed, 1);
  assert.equal(s.views[0].resets.length, 0);
  s.tool.dispose();
});
