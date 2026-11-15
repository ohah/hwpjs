import test from 'node:test';
import assert from 'node:assert/strict';
import { createRenderer } from '../../web/preview/renderer.mjs';
import { createObjectSelection } from '../../packages/vanilla/src/object-selection.ts';
import { EditorState } from '../../packages/core/src/state/editor-state.ts';
function chartFixture() {
  const geometry = {
    width: 1500,
    height: 1500,
    width_relative: 4,
    height_relative: 2,
    treat_as_character: false,
    horizontal_offset: 7500,
    vertical_offset: 0,
  };
  const position = { flags: [false, true, false, false], relations: [2, 2, 0, 0] };
  const scalar = (value) => ({ value: { kind: 'finite', value } });
  const display = {
    pair: { section_ordinal: 0, wrapper_node: 9 },
    host: { wrapper_node: 9, geometry: { ...geometry }, position: structuredClone(position) },
    plots: [{ node: 1, kind: 'barChart', series_nodes: [2] }],
    plot_settings: [{ direction: { value: 'col' }, grouping: { value: 'clustered' } }],
    axes: [
      { node: 20, kind: 'valAx', scaling: { minimum: scalar(-10), maximum: scalar(10) } },
      { node: 30, kind: 'catAx', scaling: null },
    ],
    axis_links: [
      { plot_node: 1, target: { status: 'resolved', node: 20 } },
      { plot_node: 1, target: { status: 'resolved', node: 30 } },
    ],
    points: [
      { index: 0, value: '-10', kind: 'numeric_literal', cache_node: 3 },
      { index: 1, value: '10', kind: 'numeric_literal', cache_node: 3 },
    ],
    bindings: [
      { series_node: 2, plot_node: 1, role: 'value' },
      { series_node: 2, plot_node: 1, role: 'value' },
    ],
    series_text: [],
    rich_text: [],
  };
  const content = {
    format: 'hwpx',
    limited: false,
    chartDisplayAvailable: true,
    paragraphs: [{ section: 0, paragraph: 0, text: '\ufffc본문😀' }],
    paragraphFlows: [
      {
        section: 0,
        paragraph: 0,
        host: 'body',
        top_level: true,
        single_column: true,
        page_break: false,
        column_break: false,
      },
    ],
    pageSettings: [
      {
        section_ordinal: 0,
        width: 15000,
        height: 22500,
        orientation: 'widely',
        gutter_type: 'left_only',
        duplicate_margins: 0,
        margin: { left: 0, right: 0, top: 0, bottom: 0, gutter: 0, header: 0, footer: 0 },
      },
    ],
    chartTargets: [{ section: 0, wrapper: 9, paragraph: 0, anchorUnit: 0, error_name: null }],
    oles: [
      {
        section: 0,
        oleNode: 8,
        chartWrapper: 9,
        paragraph: 0,
        anchorUnit: 0,
        state: 'located',
        error: null,
        sourceError: null,
        representation: 'chart-alternative',
        source: {
          geometry,
          position,
          transform_identity: true,
          flow: { text_wrap: 0, text_flow: 2, z_order: 0, outside_margins: [0, 0, 0, 0] },
        },
      },
    ],
  };
  return {
    content,
    display,
    read: () => ({ value: display }),
    measure: (text) => ({ width: text.length * 8, height: 20 }),
  };
}

const token = {
  editorId: 'e',
  documentId: 'd',
  generation: 1,
  operationRevision: 0,
  viewRevision: 0,
};
async function fixture(t) {
  const frames = [],
    canvas = { width: 800, height: 600, style: {}, dataset: {} },
    viewport = Object.assign(new EventTarget(), {
      clientWidth: 800,
      clientHeight: 600,
      scrollTop: 0,
      scrollLeft: 0,
    });
  const ctx = new Proxy(
    {
      measureText: (text) => ({
        width: text.length * 8,
        actualBoundingBoxAscent: 10,
        actualBoundingBoxDescent: 2,
      }),
    },
    { get: (o, k) => o[k] ?? (() => {}) },
  );
  canvas.getContext = () => ctx;
  const renderer = createRenderer(canvas, viewport, { style: {} }, () => {}, {
    requestFrame: (f) => (frames.push(f), frames.length),
    cancelFrame() {},
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    setInterval: () => 1,
    clearInterval() {},
  });
  const data = chartFixture();
  data.display.kind = 'chart_display';
  for (const geometry of [data.display.host.geometry, data.content.oles[0].source.geometry])
    Object.assign(geometry, { width: 30000, height: 15000 });
  Object.assign(data.content.pageSettings[0], { width: 60000, height: 60000 });
  let state = new EditorState({
      ...token,
      stateVersion: 4,
      status: 'ready',
      content: data.content,
      capabilities: {},
      selection: null,
    }),
    lease = {},
    modalRevision = 0,
    focused = true,
    ready = true,
    frameOverride = null;
  renderer.chartReader(() => data.display);
  renderer.show(state.content, { resourceDocument: 'd:1', resourceEpoch: 'd:1:0' });
  renderer.observeSourceState(state);
  const paint = () => {
    let n = 0;
    while (frames.length) {
      assert(++n < 30);
      frames.shift()();
    }
  };
  paint();
  await new Promise((r) => setImmediate(r));
  paint();
  assert.equal(renderer.chartPreviews().length, 1);
  const target = { kind: 'chart', section: 0, wrapper: 9 };
  let commits = 0,
    acknowledgements = 0,
    ackHook = null;
  const capture = () =>
    ready && renderer.isPaintedFrameCurrent()
      ? {
          state,
          lease,
          frame: frameOverride ?? renderer.paintedFrame(),
          source: state.content,
          modalRevision,
        }
      : null;
  const actor = createObjectSelection({
    capture,
    hit: (_scene, x, y) => renderer.objectAtLogicalPoint(x, y),
    hostFocused: () => focused,
    acknowledgePaint: (previous, next, value) => {
      acknowledgements++;
      return ackHook
        ? ackHook(previous, next, value)
        : (renderer.canAcknowledgeObjectSelectionPaint?.(previous.frame, next.frame, value) ??
            false);
    },
    onClear: () => renderer.selectObject(null),
    onError: (e) => {
      throw e;
    },
    async commit(request) {
      commits++;
      assert(request.current());
      renderer.preview(null);
      renderer.selectObject(request.target);
      state = new EditorState({
        ...token,
        stateVersion: state.stateVersion + 1,
        status: 'ready',
        content: state.content,
        capabilities: {},
        selection: null,
      });
      actor.observeState(state);
      renderer.observeSourceState(state);
      paint();
      return request.confirm(capture());
    },
  });
  const point = () => {
    const item = renderer.chartPreviews()[0];
    return {
      trusted: true,
      onCanvas: true,
      primary: true,
      pointerId: 1,
      button: 0,
      x: item.x + 10,
      y: item.y + 10,
      clientX: item.x + 10,
      clientY: item.y + 10,
    };
  };
  t.after(() => {
    actor.dispose();
    renderer.close();
  });
  return {
    actor,
    renderer,
    canvas,
    viewport,
    paint,
    capture,
    target,
    point,
    commits: () => commits,
    async select() {
      assert.equal(actor.pointerDown(point()), true);
      await actor.pointerUp(point());
      assert.deepEqual(actor.current()?.target, target);
    },
    repaint() {
      renderer.select({ active: false });
      paint();
    },
    setFocus(v) {
      focused = v;
    },
    setLease(v) {
      lease = v;
    },
    setModal(v) {
      modalRevision = v;
    },
    setReady(v) {
      ready = v;
    },
    setFrame(v) {
      frameOverride = v;
    },
    changeState(delta, observe = true) {
      state = new EditorState({
        ...token,
        stateVersion: state.stateVersion + 1,
        status: 'ready',
        content: state.content,
        capabilities: {},
        selection: null,
        ...delta,
      });
      if (observe) actor.observeState(state);
    },
    state: () => state,
    acknowledgements: () => acknowledgements,
    onAck(fn) {
      ackHook = fn;
    },
    installState(next) {
      state = next;
      actor.observeState(next);
    },
  };
}

test('actual renderer repaint of certified own selection preserves P; pointer state/token/source stay identical', async (t) => {
  const f = await fixture(t);
  await f.select();
  const before = f.capture();
  f.repaint();
  const after = f.capture();
  assert.notEqual(after.frame, before.frame);
  assert.equal(after.state, before.state);
  assert.equal(after.source, before.source);
  assert.deepEqual(after.state.token, before.state.token);
  assert.equal(f.renderer.isObjectSelectionPainted(f.target), true);
  assert.deepEqual(
    f.actor.current()?.target,
    f.target,
    'same certified scene repaint must preserve selected mode',
  );
  let calls = 0;
  f.actor.registerPropertiesRequest(() => {
    calls++;
  });
  assert.equal(f.actor.keyDown({ trusted: true, onCanvas: true, key: 'p' }), true);
  assert.equal(calls, 1);
});

test('pending pointer intent stays raw-frame exact even when actual scene and own repaint are equal', async (t) => {
  const f = await fixture(t);
  assert.equal(f.actor.pointerDown(f.point()), true);
  const count = f.acknowledgements();
  f.repaint();
  await f.actor.pointerUp(f.point());
  assert.equal(f.commits(), 0);
  assert.equal(f.actor.current(), null);
  assert.equal(f.acknowledgements(), count);
});

test('real reflow/layout, scroll axes, viewport, view and backing changes cannot reuse a certified selected presentation', async (t) => {
  for (const change of [
    (f) => f.renderer.preview(null),
    (f) => {
      f.viewport.scrollTop = 9;
    },
    (f) => {
      f.viewport.scrollLeft = 7;
    },
    (f) => {
      f.viewport.clientWidth = 850;
    },
    (f) => {
      f.viewport.clientHeight = 650;
    },
    (f) => f.renderer.setViewScale(1.5),
    (f) => {
      f.canvas.width++;
      assert.equal(f.renderer.isPaintedFrameCurrent(), false);
    },
    (f) => {
      f.canvas.height++;
      assert.equal(f.renderer.isPaintedFrameCurrent(), false);
    },
  ]) {
    const f = await fixture(t);
    await f.select();
    change(f);
    f.repaint();
    assert.equal(f.actor.current(), null);
    assert.equal(f.commits(), 1);
  }
});

test('scene stamp ABA cannot borrow an older certificate after intervening real paint or observed invalid backing', async (t) => {
  for (const observedOnly of [false, true]) {
    const f = await fixture(t);
    await f.select();
    const before = f.capture().frame;
    if (observedOnly) {
      f.canvas.width++;
      assert.equal(f.renderer.isPaintedFrameCurrent(), false);
      f.canvas.width--;
    } else {
      f.viewport.scrollTop = 8;
      f.repaint();
      f.viewport.scrollTop = 0;
    }
    f.repaint();
    assert.equal(
      f.renderer.canAcknowledgeObjectSelectionPaint(before, f.capture().frame, f.target),
      false,
    );
    assert.equal(f.actor.current(), null);
  }
});

test('forged frames, cross-renderer receipts, other target and resubmitted same target are refused', async (t) => {
  const f = await fixture(t),
    other = await fixture(t);
  await f.select();
  await other.select();
  const before = f.capture().frame;
  f.repaint();
  const after = f.capture().frame;
  assert.equal(f.renderer.canAcknowledgeObjectSelectionPaint(before, after, f.target), true);
  assert.equal(
    f.renderer.canAcknowledgeObjectSelectionPaint({ ...before }, after, f.target),
    false,
  );
  assert.equal(
    f.renderer.canAcknowledgeObjectSelectionPaint(before, { ...after }, f.target),
    false,
  );
  assert.equal(
    f.renderer.canAcknowledgeObjectSelectionPaint(other.capture().frame, after, f.target),
    false,
  );
  assert.equal(
    f.renderer.canAcknowledgeObjectSelectionPaint(before, after, { ...f.target, wrapper: 123 }),
    false,
  );
  f.renderer.selectObject(f.target);
  f.repaint();
  assert.equal(
    f.renderer.canAcknowledgeObjectSelectionPaint(before, f.capture().frame, f.target),
    false,
  );
  assert.equal(f.actor.current(), null);
});

test('clear/late repaint cannot resurrect selection; no current paint and old live receipt cannot authorize P', async (t) => {
  for (const sourceClear of [false, true]) {
    const f = await fixture(t);
    await f.select();
    if (sourceClear) f.actor.clear('outside');
    else f.renderer.selectObject(null);
    f.repaint();
    assert.equal(f.actor.current(), null);
    let n = 0;
    f.actor.registerPropertiesRequest(() => n++);
    assert.equal(f.actor.keyDown({ trusted: true, onCanvas: true, key: 'p' }), false);
    assert.equal(n, 0);
  }
});

test('exact state/token/lease/modal/focus fences remain required even for a privately certified own repaint', async (t) => {
  for (const change of [
    (f) => f.setLease({}),
    (f) => f.setModal(1),
    (f) => f.setFocus(false),
    (f) => f.changeState({ viewRevision: 1 }),
    (f) => f.changeState({ operationRevision: 1 }),
    (f) => f.changeState({ generation: 2 }),
    (f) => f.changeState({ documentId: 'other' }),
    (f) => f.changeState({ content: { ...f.state().content, limited: true } }),
  ]) {
    const f = await fixture(t);
    await f.select();
    f.repaint();
    change(f);
    assert.equal(f.actor.current(), null);
  }
});

test('intervening Core state ABA and reentrant acknowledgement cannot re-authorize an old selected record', async (t) => {
  const f = await fixture(t);
  await f.select();
  const old = f.state();
  f.changeState({ operationRevision: 1 });
  f.installState(old);
  f.repaint();
  assert.equal(f.actor.current(), null);
  for (const cause of ['clear', 'lease', 'modal', 'focus', 'state']) {
    const g = await fixture(t);
    await g.select();
    g.repaint();
    g.onAck(() => {
      if (cause === 'clear') g.actor.clear('input');
      if (cause === 'lease') g.setLease({});
      if (cause === 'modal') g.setModal(1);
      if (cause === 'focus') g.setFocus(false);
      if (cause === 'state') g.changeState({ viewRevision: 1 });
      return true;
    });
    assert.equal(g.actor.current(), null, cause);
  }
});

test('existing actual picture-selection painter supplies a private receipt; clearing or replacing the SSOT selection retires it', async (t) => {
  const frames = [],
    ctx = new Proxy(
      {
        measureText: (text) => ({
          width: text.length * 8,
          actualBoundingBoxAscent: 10,
          actualBoundingBoxDescent: 2,
        }),
      },
      { get: (o, k) => o[k] ?? (() => {}) },
    );
  const canvas = { width: 800, height: 600, style: {}, dataset: {}, getContext: () => ctx },
    viewport = Object.assign(new EventTarget(), {
      clientWidth: 800,
      clientHeight: 600,
      scrollTop: 0,
      scrollLeft: 0,
    });
  const renderer = createRenderer(canvas, viewport, { style: {} }, () => {}, {
    requestFrame: (f) => (frames.push(f), frames.length),
    cancelFrame() {},
    ResizeObserver: class {
      observe() {}
      disconnect() {}
    },
    setInterval: () => 1,
    clearInterval() {},
  });
  t.after(() => renderer.close());
  const paint = () => {
    let n = 0;
    while (frames.length) {
      assert(++n < 30);
      frames.shift()();
    }
  };
  const picture = {
    section: 0,
    paragraph: 0,
    pictureNode: 1,
    anchorUnit: 0,
    state: 'located',
    transform: { identity: true },
    geometry: {
      treatAsCharacter: true,
      widthRelative: 4,
      heightRelative: 2,
      width: 3000,
      height: 1500,
    },
    crop: { clip: [0, 3000, 0, 1500], imageDimensions: [null, null] },
  };
  renderer.pictureReader(() => new Uint8Array([1]));
  renderer.pictureDecoder(async () => ({ width: 40, height: 20, close() {} }));
  renderer.show(
    {
      paragraphs: [{ section: 0, paragraph: 0, text: '\ufffcX', editable: true, selectable: true }],
      pictures: [picture],
      limited: false,
    },
    { resourceDocument: 'p:1', resourceEpoch: 1 },
  );
  paint();
  await new Promise((r) => setImmediate(r));
  paint();
  renderer.selectPicture(picture);
  paint();
  const old = renderer.paintedFrame(),
    target = { kind: 'picture', section: 0, pictureNode: 1 };
  renderer.select({ active: false });
  paint();
  assert.notEqual(renderer.paintedFrame(), old);
  assert.equal(
    renderer.canAcknowledgeObjectSelectionPaint(old, renderer.paintedFrame(), target),
    true,
  );
  renderer.selectPicture(picture);
  paint();
  assert.equal(
    renderer.canAcknowledgeObjectSelectionPaint(old, renderer.paintedFrame(), target),
    false,
  );
  const newer = renderer.paintedFrame();
  renderer.selectPicture(null);
  assert.equal(renderer.canAcknowledgeObjectSelectionPaint(newer, newer, target), false);
});

test('resource epoch/provider and canvas CSS retirement cannot be hidden by identical source/state', async (t) => {
  for (const change of [
    (f) =>
      f.renderer.show(f.state().content, {
        resourceDocument: 'd:1',
        resourceEpoch: 'd:1:1',
        preserveScroll: true,
      }),
    (f) => f.renderer.chartReader(() => null),
    (f) => {
      f.canvas.style.width = '999px';
      assert.equal(f.renderer.isPaintedFrameCurrent(), false);
    },
    (f) => {
      f.canvas.style.height = '999px';
      assert.equal(f.renderer.isPaintedFrameCurrent(), false);
    },
  ]) {
    const f = await fixture(t);
    await f.select();
    change(f);
    f.repaint();
    assert.equal(f.actor.current(), null);
  }
});
