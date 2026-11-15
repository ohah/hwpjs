import test from 'node:test';
import assert from 'node:assert/strict';
import { createDrawingPropertiesPort } from '../src/drawing-properties-port.ts';
import { createDrawingPropertiesController } from '../src/drawing-properties-controller.ts';
const address = { section: 0, drawingNode: 10 };
function fixture(change = {}) {
  let token = {
    editorId: 'editor',
    documentId: 'doc',
    generation: 1,
    operationRevision: 4,
    viewRevision: 7,
  };
  const source = {
    drawing_node: 10,
    paragraph: 1,
    anchor_unit: 3,
    geometry: {
      width: 7200,
      height: 3600,
      width_relative: 4,
      height_relative: 2,
      treat_as_character: false,
    },
    position: { relations: [0, 1, 2, 3] },
    flow: { text_wrap: 2, text_flow: 0 },
    text: { node: 11, list_node: 12 },
  };
  let state = {
    ...token,
    token,
    stateVersion: 10,
    status: 'ready',
    historyRecoveryRequired: false,
    content: {
      format: 'hwpx',
      readOnly: true,
      drawings: [{ ...address, hostParagraph: 0, anchorUnit: 3, source }],
      paragraphs: [
        {
          section: 0,
          paragraph: 1,
          text: '',
          drawingText: { drawingNode: 10, listNode: 12, textNode: 11 },
        },
        {
          section: 0,
          paragraph: 2,
          text: '<img src=x onerror=alert(1)>',
          drawingText: { drawingNode: 10, listNode: 12, textNode: 11 },
        },
      ],
    },
    ...change,
  };
  const listeners = new Set();
  const editor = {
    getEditorState: () => state,
    registerStateListener(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    requestExperimental() {
      throw Error('NoWrites');
    },
    dispatchCommand() {
      throw Error('NoWrites');
    },
  };
  return {
    editor,
    source,
    get state() {
      return state;
    },
    set state(v) {
      state = v;
    },
    emit() {
      for (const fn of listeners) fn(state);
    },
    listeners,
    port: createDrawingPropertiesPort(editor),
  };
}
test('readonly current Native owner supplies absolute mm sizes, known boolean and exact source-ordered text', () => {
  const f = fixture(),
    result = f.port.capture(address);
  assert.equal(result.reason, null);
  const c = result.capture;
  assert.equal(c.text, '\n<img src=x onerror=alert(1)>');
  assert.deepEqual(c.fields, [
    { label: '너비', value: '25.4 mm' },
    { label: '높이', value: '12.7 mm' },
    { label: '글자처럼 취급', value: '아니오' },
  ]);
  assert(Object.isFrozen(c));
  assert(Object.isFrozen(c.fields[0]));
  assert(Object.isFrozen(c.token));
  f.source.geometry.width = 999;
  assert(c.fields.some((x) => x.label === '너비' && x.value === '25.4 mm'));
  assert(f.port.current(c));
  assert.equal(f.port.current({ ...c }), false, 'no forged captures');
});
test('all token coordinates and stateVersion invalidate capture even when the same state object is reused', () => {
  for (const key of [
    'editorId',
    'documentId',
    'generation',
    'operationRevision',
    'viewRevision',
    'stateVersion',
  ]) {
    const f = fixture(),
      c = f.port.capture(address).capture;
    f.state[key] = typeof f.state[key] === 'string' ? 'other' : f.state[key] + 1;
    assert.equal(f.port.current(c), false, key);
  }
  const f = fixture(),
    c = f.port.capture(address).capture;
  f.state = { ...f.state };
  assert.equal(f.port.current(c), false);
});
test('optional activation token fence rejects old address reuse across document replacement', () => {
  const f = fixture(),
    old = { ...f.state.token, documentId: 'old' };
  assert.equal(f.port.capture({ ...address, token: old }).capture, null);
  assert(f.port.capture({ ...address, token: f.state.token }).capture);
});
test('invalid addresses, duplicate/missing source owners, group-root substitution and anchor mismatch fail closed', () => {
  for (const bad of [
    { section: -0, drawingNode: 10 },
    { section: 0, drawingNode: NaN },
    { section: 0, drawingNode: 2 ** 32 },
  ])
    assert.equal(fixture().port.capture(bad).capture, null);
  for (const edit of [
    (f) => f.state.content.drawings.push({ ...f.state.content.drawings[0] }),
    (f) => (f.state.content.drawings = []),
    (f) => (f.source.drawing_node = 9),
    (f) => (f.source.paragraph = 2),
    (f) => (f.source.anchor_unit = 9),
  ]) {
    const f = fixture();
    edit(f);
    assert.equal(f.port.capture(address).capture, null);
  }
});
test('empty/loading/recovery/limited/window/no-data never fabricate dimensions from rectangles or rendering', () => {
  for (const edit of [
    (f) => (f.state.status = 'loading'),
    (f) => (f.state.historyRecoveryRequired = true),
    (f) => (f.state.content.limited = true),
    (f) => (f.state.content.window = {}),
    (f) => (f.state.content.drawings = undefined),
    (f) => {
      f.source.geometry = {};
      f.source.position = null;
      f.source.flow = null;
      f.state.content.paragraphs = [];
      f.source.rendering = { width: 888, height: 999 };
      f.state.content.drawings[0].rectangle = { width: 777, height: 666 };
    },
  ]) {
    const f = fixture();
    edit(f);
    assert.equal(f.port.capture(address).capture, null);
  }
  const f = fixture();
  f.source.geometry = { width: null, height: 0 };
  f.source.position = null;
  f.source.flow = null;
  const fields = f.port.capture(address).capture.fields;
  assert.deepEqual(fields, []);
});
test('text must have unique source paragraph ownership; no source-to-renderer or caption/table join', () => {
  for (const edit of [
    (f) => f.state.content.paragraphs.push({ ...f.state.content.paragraphs[0] }),
    (f) => (f.state.content.paragraphs[0].drawingText.listNode = 99),
    (f) => (f.state.content.paragraphs[0].drawingText.textNode = 99),
    (f) => (f.state.content.paragraphs[0].tableCell = {}),
    (f) => (f.state.content.paragraphs[0].clipped = true),
    (f) => (f.source.text = null),
  ]) {
    const f = fixture();
    edit(f);
    assert.equal(f.port.capture(address).capture, null);
  }
  const f = fixture();
  f.state.content.paragraphs[0].text = 'x'.repeat(17000);
  const c = f.port.capture(address).capture;
  assert.equal(c.text.length, 16000);
  assert(c.textTruncated);
});
test('token/content accessor reentry cannot combine old source with replacement state', () => {
  for (const key of ['token', 'content']) {
    const f = fixture(),
      original = f.state,
      value = original[key],
      replacement = { ...original };
    Object.defineProperty(original, key, {
      get() {
        f.state = replacement;
        return value;
      },
    });
    assert.equal(f.port.capture(address).capture, null, key);
  }
});
function controllerFixture() {
  const f = fixture(),
    views = [],
    statuses = [],
    errors = [];
  let closed = 0;
  const controller = createDrawingPropertiesController({
    port: f.port,
    createView(c, onDismiss) {
      const v = {
        capture: c,
        onDismiss,
        shown: 0,
        destroyed: 0,
        show() {
          this.shown++;
        },
        destroy() {
          this.destroyed++;
        },
      };
      views.push(v);
      return v;
    },
    onStatus: (t) => statuses.push(t),
    onClose: () => closed++,
    onError: (e) => errors.push(e),
  });
  return { ...f, f, controller, views, statuses, errors, closed: () => closed };
}
test('controller opens current target, closes on document/state change and unsubscribes without restoring stale focus', () => {
  const { f, controller, views, closed } = controllerFixture();
  assert(controller.open(address));
  assert.equal(views[0].shown, 1);
  f.state = { ...f.state, documentId: 'next', token: { ...f.state.token, documentId: 'next' } };
  f.emit();
  assert.equal(views[0].destroyed, 1);
  assert.equal(closed(), 0);
  controller.dispose();
  controller.dispose();
  assert.equal(f.listeners.size, 0);
  assert.equal(controller.open(address), false);
});
test('controller rejects no-data; dismissal restores only the current document and does not mutate editor', () => {
  const { controller, views, closed, statuses } = controllerFixture();
  assert.equal(controller.open({ section: 0, drawingNode: 99 }), false);
  assert.equal(statuses.length, 1);
  assert(controller.open(address));
  views[0].onDismiss();
  assert.equal(closed(), 1);
  assert.equal(views[0].destroyed, 1);
  controller.close();
  controller.dispose();
});
test('state invalidation during view factory destroys late view and never shows it', () => {
  const f = fixture();
  let shown = 0,
    destroyed = 0;
  const c = createDrawingPropertiesController({
    port: f.port,
    createView() {
      f.state = { ...f.state };
      f.emit();
      return {
        show() {
          shown++;
        },
        destroy() {
          destroyed++;
        },
      };
    },
  });
  assert.equal(c.open(address), false);
  assert.equal(shown, 0);
  assert.equal(destroyed, 1);
  c.dispose();
});
test('host errors and synchronous reentry cannot leak a modal session or invent success', () => {
  const f = fixture();
  let destroyed = 0,
    errors = 0,
    c;
  c = createDrawingPropertiesController({
    port: f.port,
    createView() {
      assert.equal(c.open(address), false);
      return {
        show() {
          throw Error('HostShow');
        },
        destroy() {
          destroyed++;
        },
      };
    },
    onClose() {
      throw Error('HostClose');
    },
    onError() {
      errors++;
      throw Error('TerminalBoundary');
    },
  });
  assert.equal(c.open(address), false);
  assert.equal(destroyed, 1);
  assert(errors >= 1);
  c.dispose();
});
test('formatting does not coerce host objects or substitute nonfinite/negative dimensions', () => {
  const f = fixture();
  let coerced = 0;
  f.source.geometry.width = {
    toString() {
      coerced++;
      throw Error('UnsafeCoercion');
    },
  };
  f.source.geometry.height = Infinity;
  const c = f.port.capture(address).capture;
  assert(c);
  assert.equal(coerced, 0);
  assert(!c.fields.some((row) => row.label === '너비' || row.label === '높이'));
  f.state.content.paragraphs[0].text = {
    toString() {
      throw Error('UnsafeTextCoercion');
    },
  };
  assert.equal(f.port.capture(address).capture, null);
});
test('mm requires each explicit absolute basis independently; relative, unknown and malformed bases cannot infer size', () => {
  for (const widthBasis of [undefined, null, 0, 1, 2, 3, 4, 5, '4']) {
    for (const heightBasis of [undefined, null, 0, 1, 2, 3, '2']) {
      const f = fixture();
      f.source.geometry.width_relative = widthBasis;
      f.source.geometry.height_relative = heightBasis;
      const c = f.port.capture(address).capture;
      assert(c);
      assert.equal(
        c.fields.some((x) => x.label === '너비'),
        widthBasis === 4,
        String(widthBasis),
      );
      assert.equal(
        c.fields.some((x) => x.label === '높이'),
        heightBasis === 2,
        String(heightBasis),
      );
      assert(
        !c.fields.some((x) =>
          /HWPUNIT|원값|text_wrap|text_flow|정렬|기준/.test(x.label + ' ' + x.value),
        ),
      );
    }
  }
});
test('absolute size values must be positive finite HWP units; missing measurements do not borrow renderer dimensions', () => {
  for (const value of [undefined, null, 0, -1, -0, NaN, Infinity, 2 ** 32, '7200']) {
    const f = fixture();
    f.source.geometry.width = value;
    f.source.geometry.height = value;
    f.state.content.drawings[0].rectangle = { width: 7200, height: 3600 };
    const c = f.port.capture(address).capture;
    assert(c);
    assert.deepEqual(c.fields, [{ label: '글자처럼 취급', value: '아니오' }]);
  }
});
test('unproven alignment/wrap enums are omitted; only real booleans get user labels', () => {
  for (const value of [true, false, null, undefined, 0, 1, 'true']) {
    const f = fixture();
    f.source.geometry.treat_as_character = value;
    f.source.position = { relations: [2, 3, 4, 4] };
    f.source.flow = { text_wrap: 5, text_flow: 3 };
    const fields = f.port.capture(address).capture.fields;
    assert(!fields.some((x) => /정렬|배치|흐름|원값/.test(x.label)));
    const flag = fields.find((x) => x.label === '글자처럼 취급');
    assert.equal(flag?.value, typeof value === 'boolean' ? (value ? '예' : '아니오') : undefined);
  }
});
test('status reasons use user-facing unavailability without source/node/anchor diagnostics', () => {
  for (const edit of [
    (f) => (f.state.content.drawings = []),
    (f) => (f.source.drawing_node = 999),
    (f) => (f.state.content.paragraphs[0].drawingText.listNode = 99),
  ]) {
    const f = fixture();
    edit(f);
    const result = f.port.capture(address);
    assert.equal(result.capture, null);
    assert.match(result.reason, /개체/);
    assert(!/노드|소유|앵커|주소|원값|HWPUNIT/.test(result.reason));
  }
});
test('Native owner paragraph order must be strictly increasing; unsorted data is rejected rather than sorted', () => {
  const f = fixture();
  f.state.content.paragraphs.reverse();
  assert.equal(f.port.capture(address).capture, null);
  const g = fixture();
  g.state.content.paragraphs[1].paragraph = g.state.content.paragraphs[0].paragraph;
  assert.equal(g.port.capture(address).capture, null);
});
test('legitimate sparse owner paragraph indices including a u32-sized gap preserve document order', () => {
  const f = fixture();
  const binding = { drawingNode: 10, listNode: 12, textNode: 11 };
  f.state.content.paragraphs = [
    { section: 0, paragraph: 0, text: 'first', drawingText: { ...binding } },
    { section: 0, paragraph: 37, text: 'unrelated' },
    { section: 0, paragraph: 0xfffffffe, text: 'second', drawingText: { ...binding } },
    { section: 0, paragraph: 0xffffffff, text: 'third', drawingText: { ...binding } },
  ];
  const c = f.port.capture(address).capture;
  assert(c);
  assert.equal(c.text, 'first\nsecond\nthird');
});
test('a large source-ordered collection is scanned by actual entries and keeps text bounds', () => {
  const f = fixture(),
    binding = { drawingNode: 10, listNode: 12, textNode: 11 };
  let textReads = 0;
  f.state.content.paragraphs = Array.from({ length: 6000 }, (_, i) => ({
    section: 0,
    paragraph: i * 500000,
    get text() {
      textReads++;
      return 'abc';
    },
    drawingText: { ...binding },
  }));
  const c = f.port.capture(address).capture;
  assert(c);
  assert.equal(c.text.length, 16000);
  assert(c.textTruncated);
  assert(textReads <= 12000, `text reads bounded by two passes over actual entries: ${textReads}`);
});
