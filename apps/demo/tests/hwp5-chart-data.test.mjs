import test from 'node:test';
import assert from 'node:assert/strict';
import { createHwp5ChartDataEditor } from '../../../packages/core/src/commands/hwp5-chart-data.ts';
import { observeNativeReadSource } from '../../../packages/core/src/internal/native-read-source-evidence.ts';
import { installFormattingTestStyles } from './formatting-style-preload.mjs';
import { documentFixture, fire, all } from './formatting-dialog-test-dom.ts';
const styles = installFormattingTestStyles();
const { createHwp5ChartDataTool } = await import('../src/hwp5-chart-data-tool.ts');
const { createHwp5ChartPropertiesTool } = await import('../src/hwp5-chart-properties-tool.ts');
styles.deregister();
function fixture(qualified = true) {
  const target = { section: 0, controlNode: 17 };
  const owner = {
    control_node: 17,
    component_node: 18,
    ole_node: 19,
    paragraph_node: 14,
    paragraph: 2,
    current_unit: 0,
  };
  const token = {
    editorId: 'e',
    documentId: 'd',
    generation: 1,
    operationRevision: 1,
    viewRevision: 1,
  };
  let state = {
    ...token,
    token,
    status: 'ready',
    nativeHistoryRevision: 0,
    nativeHistoryStats: { protocolVersion: 2 },
    capabilities: {},
    content: {
      format: 'hwp5',
      hwp5ChartLiteralEditAvailable: true,
      hwp5ChartDisplayAvailable: true,
      hwp5ChartSourceEpoch: '2',
      hwp5ChartHistoryRevision: 0,
      hwp5ChartTargets: [
        {
          kind: 'hwp5-chart',
          ...target,
          componentNode: 18,
          oleNode: 19,
          physicalParagraphNode: 14,
          paragraph: 2,
          anchorUnit: 0,
          owner,
          sourceEpoch: '2',
          historyRevision: 0,
          resource: {},
        },
      ],
      paragraphs: [
        {
          section: 0,
          paragraph: 2,
          text: '\ufffc',
          sourceOffsets: [
            { at: 0, source: 0 },
            { at: 1, source: 8 },
          ],
        },
      ],
    },
  };
  // Controlled private-source observation fixture, never product admission/profile registration.
  if (qualified)
    observeNativeReadSource(state, {
      kind: 'load',
      binding: { format: 'hwp5' },
      context: { ...token, requestId: 1 },
      sourceContext: {},
      publicationSequence: 1,
      authority: () => true,
    });
  const calls = [],
    listeners = new Set();
  let wait = null,
    beforeReply = () => {};
  const literals = { categories: ['A', 'B'], series: [{ name: 'S', values: ['20', '40'] }] };
  const editor = {
    getEditorState: () => state,
    registerStateListener(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async readResource(message, settings) {
      calls.push(['read', message, settings]);
      if (wait) await wait;
      beforeReply();
      return {
        kind: 'hwp5-chart-data-capture',
        ...target,
        leaseKey: 'private',
        historyRevision: 0,
        literals,
      };
    },
    async requestExperimental(message, settings) {
      calls.push(['write', message, settings]);
      return { status: 'committed-with-snapshot', state, context: {}, changed: true };
    },
  };
  return {
    editor,
    target,
    calls,
    getState: () => state,
    replace() {
      state = { ...state };
      for (const f of listeners) f();
    },
    delay(p) {
      wait = p;
    },
    beforeReply(fn) {
      beforeReply = fn;
    },
  };
}
test('Core rejects unqualified direct/counterfeit capability state before querying', async () => {
  const f = fixture(false),
    api = createHwp5ChartDataEditor(f.editor);
  assert.equal(api.presentation().enabled, false);
  await assert.rejects(api.capture(f.target), /Unavailable/);
  assert.equal(f.calls.length, 0);
});
test('Core capture is private, exact target/token, copied data; stale response and cloned capture refuse', async () => {
  const f = fixture(),
    api = createHwp5ChartDataEditor(f.editor),
    c = await api.capture(f.target);
  assert.equal(f.calls[0][1].controlNode, 17);
  assert.equal(f.calls[0][1].wrapper, undefined);
  assert.deepEqual(f.calls[0][2], { token: f.getState().token });
  assert(Object.isFrozen(c.literals.series[0].values));
  assert.equal(api.current(c), true);
  await assert.rejects(api.apply({ ...c }, []), /Stale/);
  f.replace();
  assert.equal(api.current(c), false);
  const g = fixture(),
    other = createHwp5ChartDataEditor(g.editor);
  g.beforeReply(() => g.replace());
  await assert.rejects(other.capture(g.target), /Unavailable|Stale/);
});
test('Core applies logical edit once and keeps PNG and full witness out of public DTO', async () => {
  const f = fixture(),
    api = createHwp5ChartDataEditor(f.editor),
    c = await api.capture(f.target);
  const edits = [{ value: { series: 0, category: 0, expected: '20', value: '73' } }];
  await api.apply(c, edits);
  assert.deepEqual(f.calls[1][1], { kind: 'hwp5-chart-data-apply', leaseKey: 'private', edits });
  assert.deepEqual(f.calls[1][2], { mutation: true, token: c.state.token });
  await assert.rejects(api.apply(c, edits), /Stale/);
  assert.equal(f.calls.filter((x) => x[0] === 'write').length, 1);
});
function domFixture() {
  const d = documentFixture(),
    original = d.doc.createElement;
  d.doc.createElement = (tag) => {
    const e = original(tag);
    e.replaceChildren = (...nodes) => {
      const previous = [...e.children];
      for (const n of previous) n.remove();
      e.append(...nodes);
    };
    e.closest = (selector) =>
      e.tagName === 'BUTTON' && e.dataset.chartGridPoint !== undefined
        ? e
        : e.parentElement?.closest?.(selector);
    return e;
  };
  return d;
}
test('actual H5 dialog/grid input and Apply events produce one logical data edit, not a PNG', async () => {
  const f = fixture(),
    dom = domFixture(),
    notes = [];
  const tool = createHwp5ChartDataTool({
    root: dom.root,
    editor: f.editor,
    onStatus: (s) => notes.push(s),
    onClose() {},
  });
  await tool.open(f.target);
  const nodes = all(dom.root),
    input = nodes.find((n) => n.tagName === 'INPUT'),
    apply = nodes.find((n) => n.textContent === '변경 일괄 적용');
  assert.equal(dom.role('hwp5-chart-data').getAttribute('aria-modal'), 'true');
  assert.equal(input.value, '20');
  input.value = '73';
  fire(input, 'input');
  assert.equal(apply.disabled, false);
  fire(apply, 'click');
  fire(apply, 'click');
  await new Promise((r) => setImmediate(r));
  const write = f.calls.find((x) => x[0] === 'write');
  assert.deepEqual(write[1].edits, [
    { value: { series: 0, category: 0, expected: '20', value: '73' } },
  ]);
  assert.equal('rendered' in write[1], false);
  assert.match(notes[0], /수정/);
  tool.dispose();
});
test('close while capture pending drops late reply; IME and stale publication disable edits', async () => {
  const f = fixture(),
    dom = domFixture();
  let release;
  f.delay(new Promise((r) => (release = r)));
  const tool = createHwp5ChartDataTool({
    root: dom.root,
    editor: f.editor,
    onStatus() {},
    onClose() {},
  });
  const pending = tool.open(f.target);
  tool.dispose();
  release();
  await pending;
  assert.equal(
    all(dom.root).some((n) => n.dataset.role === 'hwp5-chart-data'),
    false,
  );
  const g = fixture(),
    d = domFixture(),
    t = createHwp5ChartDataTool({ root: d.root, editor: g.editor, onStatus() {}, onClose() {} });
  await t.open(g.target);
  const layer = d.role('hwp5-chart-data'),
    input = all(d.root).find((n) => n.tagName === 'INPUT'),
    apply = all(d.root).find((n) => n.textContent === '변경 일괄 적용');
  input.value = '73';
  fire(input, 'input');
  fire(layer, 'compositionstart');
  assert.equal(input.disabled, false, 'composition keeps the active text field enabled');
  fire(apply, 'click');
  assert.equal(g.calls.filter((x) => x[0] === 'write').length, 0);
  fire(layer, 'compositionend');
  assert.equal(apply.disabled, false);
  g.replace();
  assert.equal(
    all(d.root).some((n) => n.dataset.role === 'hwp5-chart-data'),
    false,
  );
  t.dispose();
});

test('H5 read-only properties exposes data action only after canonical admission and preserves exact clicked target', async () => {
  for (const allowed of [false, true]) {
    const f = fixture(),
      dom = domFixture(),
      state = f.getState(),
      row = state.content.hwp5ChartTargets[0],
      actions = [];
    row.owner.geometry = { width: 36000, height: 22000 };
    row.resource = { physical_id: 1, resource_sha256: Array(32).fill(9) };
    f.editor.readResource = async () => ({
      kind: 'hwp5-chart-display',
      ...f.target,
      historyRevision: 0,
      chart: {
        kind: 'hwp5_chart_display',
        format: 'hwp5',
        version: 1,
        section: 0,
        owner: structuredClone(row.owner),
        physical_id: 1,
        resource_sha256: Array(32).fill(9),
        data: { rich_text: [] },
      },
    });
    const tool = createHwp5ChartPropertiesTool({
      root: dom.root,
      editor: f.editor,
      onStatus() {},
      onClose() {},
      canEditData: async (t) => {
        assert.deepEqual(t, f.target);
        return allowed;
      },
      onEditData: (t) => actions.push(t),
    });
    tool.open(f.target);
    await new Promise((r) => setImmediate(r));
    const button = all(dom.root).find((n) => n.textContent === '차트 데이터 편집');
    assert.equal(!!button, allowed);
    if (button) {
      fire(button, 'click');
      assert.deepEqual(actions, [f.target]);
      assert.equal(
        all(dom.root).some((n) => n.dataset.role === 'hwp5-chart-properties'),
        false,
      );
    }
    tool.dispose();
  }
});
