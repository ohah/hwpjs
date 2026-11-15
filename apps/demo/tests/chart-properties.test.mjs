import test from 'node:test';
import assert from 'node:assert/strict';
import { createChartPropertiesPort } from '../src/chart-properties-port.ts';
import { createChartPropertiesController } from '../src/chart-properties-controller.ts';
import { installFormattingTestStyles } from './formatting-style-preload.mjs';
import { documentFixture, fire, all } from './formatting-dialog-test-dom.ts';
const styles = installFormattingTestStyles();
const { createChartPropertiesTool } = await import('../src/chart-properties-tool.ts');
const { chartPropertiesViewFactory } = await import('../src/chart-properties-view.ts');
styles.deregister();
const target = () => ({ section: 0, wrapper: 17 });
const tick = () => new Promise((resolve) => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
function fixture() {
  const listeners = new Set(),
    calls = [];
  let read, state;
  const host = {
    wrapper_node: 17,
    chart_node: 19,
    geometry: {
      width: 36000,
      height: 22000,
      width_relative: 4,
      height_relative: 2,
      treat_as_character: true,
      horizontal_offset: 0,
      vertical_offset: 0,
    },
    position: { flags: [true, true, false, false], relations: [2, 2, 0, 0] },
  };
  const content = {
    format: 'hwpx',
    chartDisplayAvailable: true,
    chartEditAvailable: true,
    chartPointBatchEditAvailable: true,
    chartStringEditAvailable: true,
    chartTargets: [{ ...target(), paragraph: 2, anchorUnit: 0, error_name: null }],
    paragraphs: [{ section: 0, paragraph: 2, text: '\ufffc' }],
    oles: [
      {
        section: 0,
        chartWrapper: 17,
        oleNode: 23,
        paragraph: 2,
        anchorUnit: 0,
        state: 'located',
        representation: 'chart-alternative',
        source: structuredClone(host),
      },
    ],
  };
  const reply = {
    kind: 'chart-display',
    section: 0,
    wrapper: 17,
    chart: {
      kind: 'chart_display',
      pair: {
        section_ordinal: 0,
        wrapper_node: 17,
        chart_path: 'Chart/chart1.xml',
        ole_path: 'BinData/chart1.ole',
        declared_external: false,
        section_sha256: Array(32).fill(1),
      },
      host,
      rich_text: [
        {
          owner_role: 'chart_title',
          plain_text_complete: true,
          owner_node: 3,
          text_node: 4,
          rich_node: 5,
          paragraph_node: 8,
          text: 'Native title',
        },
      ],
    },
  };
  function replace(delta = {}) {
    const token = {
      editorId: 'e',
      documentId: 'd',
      generation: 1,
      operationRevision: 2,
      viewRevision: 3,
      ...delta.token,
    };
    state = Object.freeze({
      ...token,
      status: 'ready',
      historyRecoveryRequired: false,
      content,
      capabilities: {},
      ...delta,
      token,
    });
    for (const fn of listeners) fn(state);
    return state;
  }
  replace();
  const editor = {
    getEditorState: () => state,
    registerStateListener(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    async readResource(...args) {
      calls.push(args);
      return read ? read(...args) : reply;
    },
    requestExperimental() {
      throw Error('Forbidden write');
    },
  };
  return {
    editor,
    port: createChartPropertiesPort(editor),
    reply,
    content,
    calls,
    listeners,
    replace,
    onRead(fn) {
      read = fn;
    },
  };
}
function controllerFixture() {
  const f = fixture(),
    views = [],
    messages = [],
    handoffs = [];
  let closes = 0;
  const tool = createChartPropertiesController({
    port: f.port,
    createView(callbacks) {
      const view = {
        callbacks,
        destroyed: false,
        focused: 0,
        capture: null,
        onDestroy: null,
        focus() {
          this.focused++;
        },
        destroy() {
          this.destroyed = true;
          this.onDestroy?.();
        },
        showCapture(c) {
          this.capture = c;
        },
      };
      views.push(view);
      return view;
    },
    onStatus: (t) => messages.push(t),
    onClose: () => closes++,
    getDataEditAvailability: () => ({ enabled: true }),
    onEditData: (t) => handoffs.push({ target: t, destroyed: views.at(-1).destroyed }),
  });
  return { ...f, tool, views, messages, handoffs, closes: () => closes };
}
function domFixture() {
  const f = documentFixture(),
    original = f.doc.createElement;
  f.doc.createElement = (tag) => {
    const e = original(tag);
    e.replaceChildren = (...nodes) => {
      for (const child of Array.from(e.children)) child.remove();
      e.append(...nodes);
    };
    return e;
  };
  return f;
}

test('fresh Native chart-display query owns immutable source and never uses preview or write APIs', async () => {
  const f = fixture(),
    input = target(),
    observation = f.port.observe(input);
  const capture = await f.port.capture(observation);
  input.wrapper = 999;
  assert.deepEqual(f.calls, [
    [{ kind: 'chart-display', section: 0, wrapper: 17 }, observation.token],
  ]);
  assert.equal(capture.source.host.geometry.width, 36000);
  assert.deepEqual(capture.title.lines, ['Native title']);
  f.reply.chart.host.geometry.width = 1;
  f.reply.chart.pair.section_sha256[0] = 99;
  assert.equal(capture.source.host.geometry.width, 36000);
  assert.equal(capture.source.pair.section_sha256[0], 1);
  assert(
    Object.isFrozen(capture.target) &&
      Object.isFrozen(capture.token) &&
      Object.isFrozen(capture.source.host.position.flags),
  );
  assert.throws(() => {
    capture.source.host.geometry.width = 2;
  }, TypeError);
  assert.equal(f.port.isCaptureCurrent({ ...capture }), false);
});

test('unknown/duplicate/stale owners and unsupported state refuse before Native read', () => {
  for (const mutate of [
    (f) => f.content.chartTargets.push({ ...f.content.chartTargets[0] }),
    (f) => f.content.oles.push({ ...f.content.oles[0] }),
    (f) => f.content.paragraphs.push({ ...f.content.paragraphs[0] }),
    (f) => (f.content.chartTargets[0].error_name = 'MissingCurrentParagraphDisplayHost'),
    (f) => (f.content.oles[0].sourceError = 'InvalidOwner'),
    (f) => (f.content.oles[0].anchorUnit = 1),
    (f) => (f.content.paragraphs[0].text = 'other'),
    (f) => (f.content.chartDisplayAvailable = false),
    (f) => (f.content.limited = true),
    (f) => f.replace({ status: 'refresh-required' }),
    (f) => f.replace({ historyRecoveryRequired: true }),
  ]) {
    const f = fixture();
    mutate(f);
    assert.throws(() => f.port.observe(target()));
    assert.equal(f.calls.length, 0);
  }
});

test('target accessors and extra fields cannot run reentrant owner changes', () => {
  const f = fixture();
  let getters = 0;
  const bad = {
    section: 0,
    get wrapper() {
      getters++;
      f.replace({ token: { documentId: 'new' } });
      return 17;
    },
  };
  assert.throws(() => f.port.observe(bad));
  assert.equal(getters, 0);
  for (const bad of [
    { section: 0, wrapper: 17, extra: true },
    { section: -1, wrapper: 17 },
    { section: 0, wrapper: NaN },
    { section: 0, wrapper: 17, [Symbol()]: 1 },
  ])
    assert.throws(() => f.port.observe(bad));
  assert.equal(f.calls.length, 0);
});

test('wrong wire identity, Native error, invalid host and frame mismatch never create a capture', async () => {
  for (const mutate of [
    (r) => (r.error = 'NativeRejected'),
    (r) => (r.kind = 'chart-points'),
    (r) => (r.section = 1),
    (r) => (r.wrapper = 18),
    (r) => (r.chart.pair.section_ordinal = 1),
    (r) => (r.chart.pair.wrapper_node = 18),
    (r) => (r.chart.pair.section_sha256 = [1]),
    (r) => (r.chart.pair.chart_path = ''),
    (r) => (r.chart.host.wrapper_node = 18),
    (r) => r.chart.host.geometry.width++,
    (r) => (r.chart.host.position.flags = [true]),
  ]) {
    const f = fixture();
    mutate(f.reply);
    await assert.rejects(f.port.capture(f.port.observe(target())));
  }
});

test('only ownership-complete Native title is shown, never inferred from generic or partial runs', async () => {
  for (const mutate of [
    (r) => delete r.owner_role,
    (r) => (r.owner_role = 'axis_title'),
    (r) => (r.plain_text_complete = false),
  ]) {
    const f = fixture();
    mutate(f.reply.chart.rich_text[0]);
    assert.equal((await f.port.capture(f.port.observe(target()))).title, null);
  }
  const f = fixture();
  f.reply.chart.rich_text.push({ ...f.reply.chart.rich_text[0], owner_node: 99 });
  assert.equal((await f.port.capture(f.port.observe(target()))).title, null);
});

test('read-only Native properties remain readable without guessing write capabilities', async () => {
  for (const mutate of [
    (f) => (f.content.readOnly = true),
    (f) => f.replace({ capabilities: { readOnly: true } }),
    (f) => (f.content.chartEditAvailable = false),
  ]) {
    const f = fixture();
    mutate(f);
    const c = await f.port.capture(f.port.observe(target()));
    assert.equal(c.source.host.geometry.width, 36000);
    assert.equal(f.port.isCaptureCurrent(c), true);
  }
});

test('port refuses concurrent capture and discards a late result after token change', async () => {
  const f = fixture(),
    d = deferred();
  f.onRead(() => d.promise);
  const observation = f.port.observe(target()),
    pending = f.port.capture(observation);
  await assert.rejects(f.port.capture(observation), /읽고/);
  f.replace({ token: { operationRevision: 3 } });
  d.resolve(f.reply);
  await assert.rejects(pending, /바뀌/);
  assert.equal(f.calls.length, 1);
});

test('same owner opens once, duplicate pending open focuses, different pending owner never queues a read', async () => {
  const f = controllerFixture(),
    d = deferred();
  f.onRead(() => d.promise);
  f.tool.open(target());
  f.tool.open(target());
  f.tool.open(target());
  assert.equal(f.views.length, 1);
  assert.equal(f.views[0].focused, 2);
  assert.equal(f.calls.length, 1);
  f.content.chartTargets.push({ section: 0, wrapper: 18, paragraph: 2, anchorUnit: 0 });
  f.content.oles.push({ ...f.content.oles[0], chartWrapper: 18 });
  f.tool.open({ section: 0, wrapper: 18 });
  assert.equal(f.views.length, 1);
  assert.equal(f.calls.length, 1);
  d.resolve(f.reply);
  await tick();
  assert(f.views[0].capture);
  f.tool.dispose();
});

test('every state/doc/token change closes and ignores late pending content', async () => {
  for (const delta of [
    { token: { documentId: 'new' } },
    { token: { generation: 2 } },
    { token: { operationRevision: 3 } },
    { token: { viewRevision: 4 } },
    { status: 'loading' },
    {},
  ]) {
    const f = controllerFixture(),
      d = deferred();
    f.onRead(() => d.promise);
    f.tool.open(target());
    f.replace(delta);
    assert.equal(f.views[0].destroyed, true);
    d.resolve(f.reply);
    await tick();
    assert.equal(f.views[0].capture, null);
    assert.equal(f.handoffs.length, 0);
    assert.equal(f.closes(), 0);
    f.tool.dispose();
  }
});

test('ready dialog also closes on state change; in-place token tampering cannot hand off', async () => {
  const f = controllerFixture();
  f.tool.open(target());
  await tick();
  f.replace({ token: { viewRevision: 9 } });
  assert.equal(f.views[0].destroyed, true);
  f.views[0].callbacks.onEditData();
  assert.equal(f.handoffs.length, 0);
  f.tool.dispose();
  const g = controllerFixture();
  g.tool.open(target());
  await tick();
  g.editor.getEditorState().token.documentId = 'tampered';
  g.views[0].callbacks.onEditData();
  assert.equal(g.handoffs.length, 0);
  g.tool.dispose();
});

test('data button closes first and hands off the exact immutable target only once', async () => {
  const f = controllerFixture();
  f.tool.open(target());
  await tick();
  const old = f.views[0];
  old.callbacks.onEditData();
  old.callbacks.onEditData();
  assert.deepEqual(f.handoffs, [{ target: { section: 0, wrapper: 17 }, destroyed: true }]);
  assert(Object.isFrozen(f.handoffs[0].target));
  assert.equal(f.closes(), 0);
  assert.equal(f.calls.length, 1);
  f.tool.dispose();
});

test('reentrant document replacement or open during modal destroy cancels old handoff', async () => {
  const f = controllerFixture();
  f.tool.open(target());
  await tick();
  f.views[0].onDestroy = () => f.replace({ token: { documentId: 'new' } });
  f.views[0].callbacks.onEditData();
  assert.equal(f.handoffs.length, 0);
  f.tool.dispose();
  const g = controllerFixture();
  g.tool.open(target());
  await tick();
  g.views[0].onDestroy = () => g.tool.open(target());
  g.views[0].callbacks.onEditData();
  assert.equal(g.handoffs.length, 0);
  await tick();
  g.tool.dispose();
});

test('dismiss and dispose fence callbacks and pending responses, with no leaked state listener', async () => {
  const f = controllerFixture(),
    d = deferred();
  f.onRead(() => d.promise);
  f.tool.open(target());
  const old = f.views[0];
  old.callbacks.onDismiss();
  assert.equal(old.destroyed, true);
  assert.equal(f.closes(), 1);
  f.tool.open(target());
  assert.equal(f.views.length, 1);
  f.tool.dispose();
  f.tool.dispose();
  assert.equal(f.listeners.size, 0);
  old.callbacks.onEditData();
  d.resolve(f.reply);
  await tick();
  assert.equal(old.capture, null);
  assert.equal(f.handoffs.length, 0);
});

test('failure closes with status, never retries or lends old capture to data editing', async () => {
  const f = controllerFixture();
  f.onRead(async () => {
    throw Error('NativeRejected');
  });
  f.tool.open(target());
  await tick();
  assert.equal(f.views[0].destroyed, true);
  assert.match(f.messages[0], /NativeRejected/);
  assert.equal(f.calls.length, 1);
  f.views[0].callbacks.onEditData();
  assert.equal(f.handoffs.length, 0);
  f.tool.dispose();
});

test('view uses existing modal and unit formatting, offers no resize writes and keeps labels as text', async () => {
  const f = fixture(),
    dom = domFixture(),
    capture = await f.port.capture(f.port.observe(target()));
  let edits = 0,
    dismiss = 0;
  const view = chartPropertiesViewFactory(dom.root)({
    onEditData: () => edits++,
    onDismiss: () => dismiss++,
  });
  const button = all(dom.root).find((e) => e.dataset.role === 'chart-properties-edit-data');
  assert.equal(dom.role('chart-properties').getAttribute('aria-label'), '개체 속성');
  assert.equal(dom.role('chart-properties').getAttribute('aria-modal'), 'true');
  view.showCapture(null, { enabled: false });
  fire(button, 'click');
  assert.equal(edits, 0);
  assert.equal(button.disabled, true);
  view.showCapture(
    { ...capture, title: { lines: ['<img src=x onerror=alert(1)>'], shortened: false } },
    { enabled: true },
  );
  assert.match(dom.text(), /127 mm/);
  assert.match(dom.text(), /77\.61 mm/);
  assert.match(dom.text(), /<img src=x/);
  assert.equal(all(dom.root).filter((e) => e.tagName === 'INPUT').length, 0);
  assert.equal(all(dom.root).filter((e) => e.tagName === 'IMG').length, 0);
  fire(button, 'click');
  assert.equal(edits, 1);
  view.destroy();
  fire(button, 'click');
  assert.equal(edits, 1);
  assert.equal(dom.root.children.length, 0);
});

test('relative or unknown Native dimensions never become measured mm or invented placement', async () => {
  const f = fixture();
  f.reply.chart.host.geometry.width_relative = 0;
  f.content.oles[0].source.geometry.width_relative = 0;
  f.reply.chart.host.geometry.height = null;
  f.content.oles[0].source.geometry.height = null;
  f.reply.chart.host.geometry.horizontal_offset = -3600;
  f.content.oles[0].source.geometry.horizontal_offset = -3600;
  const capture = await f.port.capture(f.port.observe(target())),
    dom = domFixture();
  const view = chartPropertiesViewFactory(dom.root)({ onEditData() {}, onDismiss() {} });
  view.showCapture(capture, { enabled: true });
  assert.doesNotMatch(dom.text(), /127 mm/);
  assert.doesNotMatch(dom.text(), /77\.61 mm/);
  assert.match(dom.text(), /−12\.7 mm/);
  assert.match(dom.text(), /확인할 수 없음/);
  view.destroy();
});

test('exact exported tool API integrates read-only modal and current target handoff', async () => {
  const f = fixture(),
    dom = domFixture(),
    handoffs = [];
  let closed = 0;
  const tool = createChartPropertiesTool({
    root: dom.root,
    editor: f.editor,
    onStatus() {},
    onClose: () => closed++,
    getDataEditAvailability: () => ({ enabled: true }),
    onEditData: (t) => handoffs.push({ target: t, remaining: dom.root.children.length }),
  });
  assert.deepEqual(Object.keys(tool).sort(), ['dispose', 'open']);
  tool.open(target());
  await tick();
  const button = all(dom.root).find((e) => e.dataset.role === 'chart-properties-edit-data');
  fire(button, 'click');
  assert.deepEqual(handoffs, [{ target: { section: 0, wrapper: 17 }, remaining: 0 }]);
  assert.equal(closed, 0);
  tool.dispose();
  assert.equal(f.listeners.size, 0);
});

test('existing data-editor availability is the only authority; absence or refusal never blocks basic read-only information', async () => {
  for (const getDataEditAvailability of [
    undefined,
    () => ({ enabled: false, reason: '읽기 전용 문서입니다.' }),
    () => {
      throw Error('No editor');
    },
  ]) {
    const f = fixture(),
      dom = domFixture(),
      handoffs = [];
    f.content.readOnly = true;
    f.content.chartEditAvailable = false;
    const tool = createChartPropertiesTool({
      root: dom.root,
      editor: f.editor,
      onStatus() {},
      onClose() {},
      onEditData: (t) => handoffs.push(t),
      getDataEditAvailability,
    });
    tool.open(target());
    await tick();
    assert.match(dom.text(), /127 mm/);
    const button = all(dom.root).find((e) => e.dataset.role === 'chart-properties-edit-data');
    assert.equal(button.disabled, true);
    fire(button, 'click');
    assert.equal(handoffs.length, 0);
    tool.dispose();
  }
});

test('fresh availability is rechecked on click, with no guessed capability override', async () => {
  const f = fixture(),
    dom = domFixture(),
    handoffs = [];
  let enabled = true;
  // No duplicate write-capability inference: the supplied SSOT controls the handoff.
  delete f.content.chartEditAvailable;
  delete f.content.chartPointBatchEditAvailable;
  delete f.content.chartStringEditAvailable;
  const tool = createChartPropertiesTool({
    root: dom.root,
    editor: f.editor,
    onStatus() {},
    onClose() {},
    onEditData: (t) => handoffs.push(t),
    getDataEditAvailability: () => ({ enabled, reason: '기존 차트 편집기가 처리 중입니다.' }),
  });
  tool.open(target());
  await tick();
  const button = all(dom.root).find((e) => e.dataset.role === 'chart-properties-edit-data');
  assert.equal(button.disabled, false);
  enabled = false;
  fire(button, 'click');
  assert.equal(handoffs.length, 0);
  assert.equal(button.disabled, true);
  assert.equal(dom.root.children.length, 1);
  assert.match(dom.text(), /처리 중/);
  tool.dispose();
});

test('availability changes while destroying modal or reenters state cannot authorize old data handoff', async () => {
  const f = fixture(),
    views = [],
    handoffs = [];
  let enabled = true;
  const tool = createChartPropertiesController({
    port: f.port,
    createView(callbacks) {
      const v = {
        callbacks,
        focus() {},
        showCapture() {},
        destroy() {
          enabled = false;
        },
      };
      views.push(v);
      return v;
    },
    onStatus() {},
    onClose() {},
    onEditData: (t) => handoffs.push(t),
    getDataEditAvailability: () => ({ enabled }),
  });
  tool.open(target());
  await tick();
  views[0].callbacks.onEditData();
  assert.equal(handoffs.length, 0);
  tool.dispose();
  const g = fixture(),
    dom = domFixture();
  let mutate = false;
  const other = createChartPropertiesTool({
    root: dom.root,
    editor: g.editor,
    onStatus() {},
    onClose() {},
    onEditData: (t) => handoffs.push(t),
    getDataEditAvailability: () => {
      if (mutate) g.replace({ token: { documentId: 'replacement' } });
      return { enabled: true };
    },
  });
  other.open(target());
  await tick();
  const button = all(dom.root).find((e) => e.dataset.role === 'chart-properties-edit-data');
  mutate = true;
  fire(button, 'click');
  assert.equal(handoffs.length, 0);
  assert.equal(dom.root.children.length, 0);
  other.dispose();
});
