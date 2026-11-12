import test from 'node:test';
import { paintHwp5Form } from '../web/preview/hwp5-form-paint.mjs';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { createCanvasFormAutoSizer } from '../web/preview/form-autosize-provider.mjs';
import { createFormTextDraftMeasurements } from '../web/preview/form-text-draft-measurements.mjs';
import { createFormTextCanvasControls } from '../web/preview/form-text-canvas-controls.mjs';
import { formTextDraftEditorGeometry } from '../web/preview/form-text-draft-editor-geometry.mjs';

// Execute the actual renderer method with its real draft service, without loading
// unrelated scene imports or starting a renderer/browser.
const rendererSource = readFileSync(
  new URL('../web/preview/renderer.mjs', import.meta.url),
  'utf8',
);
const start = rendererSource.indexOf('    formTextDraftAdmission(target) {');
const end = rendererSource.indexOf('    checkBoxAtLogicalPoint:', start);
assert(start >= 0 && end > start);
const rendererMethods = new Function(
  'closed',
  'formTextDraftMeasurements',
  'paintedFormTargetSet',
  'currentFormDraftContexts',
  `return ({${rendererSource.slice(start, end)}});`,
);

// Node EventTarget + minimal DOM state double. Does not implement browser layout/IME.
class Element extends EventTarget {
  constructor(doc, tagName) {
    super();
    Object.assign(this, {
      ownerDocument: doc,
      tagName,
      style: {},
      dataset: {},
      value: '',
      selectionStart: 0,
      selectionEnd: 0,
      selectionDirection: 'none',
      scrollTop: 0,
      scrollLeft: 0,
    });
  }
  setAttribute() {}
  focus() {
    this.ownerDocument.activeElement = this;
  }
  select() {
    this.selectionStart = 0;
    this.selectionEnd = this.value.length;
  }
  setSelectionRange(a, b, direction) {
    this.selectionStart = a;
    this.selectionEnd = b;
    this.selectionDirection = direction;
  }
  remove() {
    this.ownerDocument.nodes = this.ownerDocument.nodes.filter((v) => v !== this);
    if (this.ownerDocument.activeElement === this) this.ownerDocument.activeElement = null;
  }
  getBoundingClientRect() {
    return { left: 10, top: 20 };
  }
}
function emit(node, type, fields = {}) {
  const e = new Event(type, { cancelable: true });
  Object.assign(e, fields);
  node.dispatchEvent(e);
}
function setup({ multiline = true, kind = 'combo_box' } = {}) {
  const doc = {
    nodes: [],
    activeElement: null,
    createElement(tag) {
      return new Element(this, tag);
    },
    body: {
      append(node) {
        doc.nodes.push(node);
      },
    },
  };
  const canvas = new Element(doc, 'canvas'),
    viewport = new Element(doc, 'div'),
    note = {};
  const metricCanvas = {
    font: '',
    textBaseline: '',
    textAlign: '',
    save() {},
    restore() {},
    measureText(text) {
      const bearing = this.font.includes('Epoch2') ? 12 : 20;
      return {
        width: text.length * 7,
        actualBoundingBoxLeft: bearing,
        actualBoundingBoxRight: text.length * 7,
        actualBoundingBoxAscent: 5,
        actualBoundingBoxDescent: 4,
        fontBoundingBoxAscent: 9,
        fontBoundingBoxDescent: this.unavailable ? undefined : 7,
      };
    },
  };
  const provider = createCanvasFormAutoSizer(metricCanvas),
    measurements = createFormTextDraftMeasurements(provider);
  const owner = Object.freeze({ formNode: 7 }),
    storedFrame = Object.freeze({ width: 70, height: 20 });
  let currentTargets,
    contexts,
    target,
    epoch = 0;
  const watchers = new Set(),
    requests = [];
  function reflow(font = 'italic 16px OwnFixture') {
    epoch++;
    const context = Object.freeze({
      kind,
      label: 'A'.repeat(18),
      name: 'OwnCombo',
      font,
      fontHeight: 16,
      lineHeight: null,
      multiline,
      wordWrap: multiline,
      storedFrame,
    });
    const form = {
      label: context.label,
      font,
      multiline,
      wordWrap: multiline,
      lineHeight: 18,
      foreground: '#000',
      background: '#fff',
      autoSizeOwner: owner,
      form: { editable: true, section: 0, formNode: 7, source: { kind } },
    };
    target = { x: 5, y: 8, width: 70, height: 54, form };
    currentTargets = new WeakSet([target]);
    contexts = new WeakMap([[form, context]]);
    measurements.begin({ epoch }, [owner]);
    for (const watcher of watchers) watcher(target);
    return target;
  }
  reflow();
  const renderer = {
    viewScale: () => 1.25,
    formTextAtLogicalPoint: () => target,
    formTextDraftAdmission(t) {
      return rendererMethods(false, measurements, currentTargets, contexts).formTextDraftAdmission(
        t,
      );
    },
    measureFormTextDraft(t, text) {
      return rendererMethods(false, measurements, currentTargets, contexts).measureFormTextDraft(
        t,
        text,
      );
    },
    watchFormTextGeometry(t, update) {
      watchers.add(update);
      return () => watchers.delete(update);
    },
  };
  const controls = createFormTextCanvasControls({
    canvas,
    viewport,
    renderer,
    note,
    ready: () => true,
    request: (r) => {
      requests.push(r);
      return true;
    },
  });
  controls.message({ kind: 'enable', formTextAvailable: true });
  return {
    doc,
    canvas,
    viewport,
    note,
    renderer,
    controls,
    reflow,
    measurements,
    requests,
    storedFrame,
    get target() {
      return target;
    },
    setMetricUnavailable(value) {
      metricCanvas.unavailable = value;
    },
    publishNarrowPaintedTarget(width) {
      const frame = renderer.measureFormTextDraft(target, target.form.label);
      Object.assign(target.form, {
        textOffset: frame.textOffset,
        lineHeight: frame.lineHeight,
        width,
        height: frame.height,
      });
      Object.assign(target, { width, height: frame.height });
      const ctx = {
        ...metricCanvas,
        beginPath() {},
        rect() {},
        clip() {},
        fillRect() {},
        fillText() {},
        moveTo() {},
        lineTo() {},
        closePath() {},
        fill() {},
      };
      assert.equal(paintHwp5Form(ctx, target.form, target.x, target.y), true);
      measurements.begin({ epoch: ++epoch }, [owner]);
      return frame;
    },
    open() {
      emit(canvas, 'pointerdown', { button: 0, clientX: 20, clientY: 30 });
      return doc.nodes[0];
    },
    invalidate() {
      currentTargets = new WeakSet();
      measurements.begin({}, []);
    },
    loseOwner() {
      for (const watcher of watchers) watcher(null);
    },
    close() {
      controls.close();
      measurements.dispose();
    },
  };
}
test('metric -> provider -> current receipt -> actual textarea setup uses Canvas origin and combo reserve', () => {
  const s = setup();
  try {
    const receipt = s.renderer.measureFormTextDraft(s.target, s.target.form.label);
    assert.equal(receipt.basis, 'current-autosize-measurement');
    assert.equal(receipt.textOffset, 22);
    const input = s.open();
    assert.equal(input.tagName, 'textarea');
    assert.equal(input.style.padding, '0 16px 0 22px');
    assert.equal(input.style.width, `${receipt.width}px`);
    assert.equal(input.style.lineHeight, `${receipt.lineHeight}px`);
    assert.equal(input.style.transform, 'scale(1.25)');
    assert.equal(input.dataset.formTextGeometryCapability, 'supported');
    assert.equal(s.doc.activeElement, input);
    assert.deepEqual(s.storedFrame, { width: 70, height: 20 });
  } finally {
    s.close();
  }
});
test('input geometry refresh retains node, cursor, backward selection, focus, value and scroll', () => {
  const s = setup();
  try {
    const input = s.open();
    input.setSelectionRange(2, 5, 'backward');
    input.scrollTop = 9;
    input.scrollLeft = 4;
    emit(input, 'beforeinput', { inputType: 'insertText' });
    input.value = 'AAxyzAAAA';
    emit(input, 'input', { inputType: 'insertText' });
    assert.equal(s.doc.nodes[0], input);
    assert.equal(s.doc.activeElement, input);
    assert.deepEqual(
      [input.selectionStart, input.selectionEnd, input.selectionDirection],
      [2, 5, 'backward'],
    );
    assert.equal(input.value, 'AAxyzAAAA');
    assert.equal(input.scrollTop, 9);
    assert.equal(input.scrollLeft, 4);
    assert.equal(input.style.padding, '0 16px 0 22px');
    assert.equal(s.requests.length, 0);
  } finally {
    s.close();
  }
});
test('font epoch refresh during composition defers style until end and preserves edit state', () => {
  const s = setup();
  try {
    const input = s.open();
    input.value = '조합중';
    input.setSelectionRange(1, 2, 'forward');
    const oldStyle = { ...input.style },
      oldTarget = s.target;
    emit(input, 'compositionstart');
    s.reflow('italic 16px Epoch2');
    assert.equal(s.renderer.measureFormTextDraft(oldTarget, input.value), null);
    assert.deepEqual(input.style, oldStyle);
    emit(input, 'compositionend');
    assert.equal(input.style.padding, '0 16px 0 14px');
    assert.equal(input.style.font, 'italic 16px Epoch2');
    assert.equal(s.doc.nodes[0], input);
    assert.equal(s.doc.activeElement, input);
    assert.equal(input.value, '조합중');
    assert.deepEqual(
      [input.selectionStart, input.selectionEnd, input.selectionDirection],
      [1, 2, 'forward'],
    );
    assert.equal(s.requests.length, 0);
  } finally {
    s.close();
  }
});
test('single-line input also uses measured origin and current receipt', () => {
  const s = setup({ multiline: false, kind: 'edit' });
  try {
    const input = s.open();
    assert.equal(input.tagName, 'input');
    assert.equal(input.style.padding, '0 2px 0 22px');
    assert.equal(input.dataset.formTextGeometryCapability, 'supported');
  } finally {
    s.close();
  }
});
test('stale painted target is denied with a Korean explanation', () => {
  const s = setup();
  try {
    s.invalidate();
    s.open();
    assert.equal(s.doc.nodes.length, 0);
    assert.match(s.note.textContent, /현재 편집할 수 없습니다/);
    assert.doesNotMatch(s.note.textContent, /FormText/);
    assert.deepEqual(formTextDraftEditorGeometry(null), {
      kind: 'unsupported',
      reason: 'FormTextDraftMeasurementUnavailable',
    });
  } finally {
    s.close();
  }
});
test('owner disappearance removes its editor, stops geometry watch, and sends no edit', () => {
  const s = setup();
  try {
    s.open();
    s.loseOwner();
    assert.equal(s.doc.nodes.length, 0);
    assert.equal(s.requests.length, 0);
  } finally {
    s.close();
  }
});
test('foreign equal-number owner, stale context and disposal cannot obtain a current draft receipt', () => {
  const s = setup();
  try {
    const t = s.target;
    assert.equal(s.renderer.measureFormTextDraft({ ...t }, 'A'), null);
    const old = s.renderer.measureFormTextDraft(t, 'A');
    assert.equal(old.basis, 'current-autosize-measurement');
    s.reflow();
    assert.equal(s.renderer.measureFormTextDraft(t, 'A'), null);
    s.measurements.dispose();
    assert.equal(s.renderer.measureFormTextDraft(s.target, 'A'), null);
  } finally {
    s.controls.close();
  }
});

test('unsupported font epoch keeps the active draft and selection with a typed explanation', () => {
  const s = setup();
  try {
    const input = s.open();
    input.value = 'draft';
    input.setSelectionRange(1, 3, 'backward');
    s.setMetricUnavailable(true);
    s.reflow('italic 16px Epoch2');
    assert.equal(input.dataset.formTextGeometryCapability, 'unsupported');
    assert.match(s.note.textContent, /자동 크기/);
    assert.doesNotMatch(s.note.textContent, /Unsupported/);
    assert.equal(s.doc.nodes[0], input);
    assert.equal(s.doc.activeElement, input);
    assert.equal(input.value, 'draft');
    assert.equal(input.style.width, `${s.target.width}px`);
    assert.equal(input.style.font, s.target.form.font);
    assert.equal(input.dataset.formTextGeometryBasis, 'current-painted-geometry');
    assert.deepEqual(
      [input.selectionStart, input.selectionEnd, input.selectionDirection],
      [1, 3, 'backward'],
    );
    s.setMetricUnavailable(false);
    s.reflow('italic 16px Epoch2');
    assert.equal(input.dataset.formTextGeometryCapability, 'supported');
    assert.equal(input.style.padding, '0 16px 0 14px');
    assert.equal(s.requests.length, 0);
  } finally {
    s.close();
  }
});
test('readonly and missing context keep the existing measurement admission boundary', () => {
  const measure = createFormTextDraftMeasurements(createCanvasFormAutoSizer({}));
  const owner = {},
    form = { autoSizeOwner: owner, form: { editable: false } },
    target = { form };
  measure.begin({}, [owner]);
  assert.equal(measure.measure(target, 'A', new WeakSet([target]), new WeakMap()), null);
  form.form.editable = true;
  assert.equal(measure.measure(target, 'A', new WeakSet([target]), new WeakMap()), null);
  form.autoSizeOwner = { formNode: 7 };
  const context = {
    kind: 'edit',
    label: 'A',
    font: '16px Own',
    fontHeight: 16,
    lineHeight: null,
    multiline: false,
    wordWrap: false,
    storedFrame: { width: 70, height: 20 },
  };
  assert.equal(
    measure.measure(target, 'A', new WeakSet([target]), new WeakMap([[form, context]])),
    null,
  );
  measure.dispose();
});

test('r4: valid painted owner with unavailable metrics can open, input and submit', () => {
  for (const multiline of [true, false]) {
    const s = setup({ multiline });
    try {
      s.setMetricUnavailable(true);
      const input = s.open();
      assert(input, 'existing text editor must remain available');
      assert.equal(input.style.width, `${s.target.width}px`);
      assert.equal(input.style.height, `${s.target.height}px`);
      assert.equal(input.dataset.formTextGeometryCapability, 'unsupported');
      assert.equal(input.dataset.formTextGeometryBasis, 'current-painted-geometry');
      assert.match(s.note.textContent, /자동 크기/);
      assert.doesNotMatch(s.note.textContent, /Unsupported|FormText|Metric/);
      input.value = '기존 입력 지원';
      emit(input, 'input', { inputType: 'insertText' });
      emit(input, 'keydown', { key: 'Enter', ctrlKey: multiline });
      assert.deepEqual(s.requests, [
        { kind: 'form-text', origin: 'form', section: 0, formNode: 7, text: '기존 입력 지원' },
      ]);
      assert.deepEqual(s.storedFrame, { width: 70, height: 20 });
    } finally {
      s.close();
    }
  }
});
test('r4: registered painted target with an owner outside the receipt epoch is refused', () => {
  const s = setup();
  try {
    s.measurements.begin({}, []);
    s.setMetricUnavailable(true);
    s.open();
    assert.equal(s.doc.nodes.length, 0);
    assert.equal(s.requests.length, 0);
  } finally {
    s.close();
  }
});
test('r4: foreign equal-number owner cannot use measurement failure to open an editor', () => {
  const s = setup();
  try {
    s.target.form.autoSizeOwner = { formNode: 7 };
    s.setMetricUnavailable(true);
    s.open();
    assert.equal(s.doc.nodes.length, 0);
    assert.equal(s.requests.length, 0);
  } finally {
    s.close();
  }
});
test('r4: stale or readonly target is denied at submit even during metric failure', () => {
  for (const mode of ['stale', 'readonly', 'owner-epoch']) {
    const s = setup();
    try {
      const input = s.open();
      input.value = 'cannot send';
      s.setMetricUnavailable(true);
      if (mode === 'stale') s.invalidate();
      else if (mode === 'readonly') s.target.form.form.editable = false;
      else s.measurements.begin({}, []);
      emit(input, 'keydown', { key: 'Enter', ctrlKey: true });
      assert.equal(s.doc.nodes.length, 0);
      assert.equal(s.requests.length, 0);
    } finally {
      s.close();
    }
  }
});
test('r4: fallback composition and backward selection survive and recover on a measured epoch', () => {
  const s = setup();
  try {
    s.setMetricUnavailable(true);
    const input = s.open();
    assert(input);
    input.value = '조합 값';
    input.setSelectionRange(1, 3, 'backward');
    input.scrollTop = 4;
    input.scrollLeft = 2;
    const style = { ...input.style };
    emit(input, 'compositionstart');
    s.setMetricUnavailable(false);
    s.reflow('italic 16px Epoch2');
    assert.deepEqual(input.style, style);
    emit(input, 'keydown', { key: 'Enter', ctrlKey: true, isComposing: true });
    assert.equal(s.requests.length, 0);
    emit(input, 'compositionend');
    assert.equal(s.doc.nodes[0], input);
    assert.equal(s.doc.activeElement, input);
    assert.equal(input.value, '조합 값');
    assert.deepEqual(
      [input.selectionStart, input.selectionEnd, input.selectionDirection],
      [1, 3, 'backward'],
    );
    assert.deepEqual([input.scrollTop, input.scrollLeft], [4, 2]);
    assert.equal(input.dataset.formTextGeometryCapability, 'supported');
    assert.equal(input.dataset.formTextGeometryBasis, 'current-autosize-measurement');
    assert.equal(input.style.padding, '0 16px 0 14px');
  } finally {
    s.close();
  }
});
test('r4: non-AutoSize editor keeps its existing style and submit path without measurement', () => {
  const s = setup();
  try {
    delete s.target.form.autoSizeOwner;
    s.setMetricUnavailable(true);
    const input = s.open();
    assert(input);
    assert.equal(input.style.padding, '0 3px');
    assert.equal(input.dataset.formTextGeometryCapability, undefined);
    input.value = 'fixed';
    emit(input, 'keydown', { key: 'Enter', ctrlKey: true });
    assert.equal(s.requests[0].text, 'fixed');
  } finally {
    s.close();
  }
});

test('r4: admitted target with missing draft measurer uses painted geometry and can submit', () => {
  const s = setup();
  try {
    s.renderer.measureFormTextDraft = undefined;
    const input = s.open();
    assert(input);
    assert.equal(input.dataset.formTextGeometryBasis, 'current-painted-geometry');
    input.value = 'still editable';
    emit(input, 'keydown', { key: 'Enter', ctrlKey: true });
    assert.equal(s.requests[0].text, 'still editable');
  } finally {
    s.close();
  }
});
test('r4: invalid owner is dismissed during composition before geometry can be reused', () => {
  const s = setup();
  try {
    const input = s.open();
    emit(input, 'compositionstart');
    s.target.form.form.editable = false;
    emit(input, 'input', { inputType: 'insertCompositionText' });
    assert.equal(s.doc.nodes.length, 0);
    assert.equal(s.requests.length, 0);
  } finally {
    s.close();
  }
});
test('r4: painted geometry with no valid frame is not replaced by a guessed size', () => {
  const s = setup();
  try {
    s.target.width = NaN;
    s.setMetricUnavailable(true);
    s.open();
    assert.equal(s.doc.nodes.length, 0);
    assert.equal(s.requests.length, 0);
  } finally {
    s.close();
  }
});

test('r4: fallback reuses actual painted offset from a provider receipt, without remeasurement or raw EOL loss', () => {
  const s = setup();
  try {
    const t = s.target,
      painted = s.renderer.measureFormTextDraft(t, t.form.label);
    assert.equal(painted.textOffset, 22);
    Object.assign(t, { width: painted.width, height: painted.height });
    Object.assign(t.form, {
      textOffset: painted.textOffset,
      lineHeight: painted.lineHeight,
      font: painted.font,
      label: 'A\r\nB',
    });
    s.measurements.begin({}, [t.form.autoSizeOwner]);
    s.setMetricUnavailable(true);
    const input = s.open();
    assert(input);
    assert.equal(input.dataset.formTextGeometryCapability, 'unsupported');
    assert.equal(input.dataset.formTextGeometryBasis, 'current-painted-geometry');
    assert.equal(input.style.padding, '0 16px 0 22px');
    assert.equal(input.style.width, `${painted.width}px`);
    assert.equal(input.style.height, `${painted.height}px`);
    assert.equal(input.value, 'A\nB');
    emit(input, 'keydown', { key: 'Enter', ctrlKey: true });
    assert.equal(s.requests[0].text, 'A\r\nB');
    assert.deepEqual(s.storedFrame, { width: 70, height: 20 });
  } finally {
    s.close();
  }
});

test('r5: narrow accepted paint with provider-derived bearing preserves typing in an explicit overflow viewport', () => {
  for (const width of [10, 22, 37, 38]) {
    const s = setup();
    try {
      const measured = s.publishNarrowPaintedTarget(width);
      assert.equal(measured.textOffset, 22);
      s.setMetricUnavailable(true);
      const input = s.open();
      assert(input);
      assert.equal(input.style.width, 'calc(38px + 1ch)');
      assert.equal(input.style.overflowX, 'auto');
      assert.equal(input.dataset.formTextGeometryCapability, 'unsupported');
      assert.equal(input.dataset.formTextGeometryBasis, 'painted-edit-viewport');
      assert.equal(s.target.width, width);
      input.value = 'narrow edit';
      emit(input, 'keydown', { key: 'Enter', ctrlKey: true });
      assert.equal(s.requests[0].text, 'narrow edit');
      assert.deepEqual(s.storedFrame, { width: 70, height: 20 });
    } finally {
      s.close();
    }
  }
});
test('r5: invalid initial viewScale never mounts an editor with nonfinite or nonpositive CSS scale', () => {
  for (const scale of [NaN, Infinity, 0, -1]) {
    const s = setup();
    try {
      s.renderer.viewScale = () => scale;
      s.open();
      assert.equal(s.doc.nodes.length, 0);
      assert.equal(s.requests.length, 0);
    } finally {
      s.close();
    }
  }
});
test('r5: invalid live scale retains editing and selection without writing invalid CSS, then recovers', () => {
  const s = setup();
  try {
    const input = s.open();
    input.setSelectionRange(1, 2, 'backward');
    const style = { ...input.style };
    s.renderer.viewScale = () => NaN;
    input.value = 'draft';
    emit(input, 'input', { inputType: 'insertText' });
    assert.deepEqual(input.style, style);
    assert.equal(input.dataset.formTextGeometryBasis, 'retained-edit-viewport');
    assert.equal(input.dataset.formTextGeometryCapability, 'unsupported');
    assert.equal(s.doc.activeElement, input);
    assert.deepEqual(
      [input.selectionStart, input.selectionEnd, input.selectionDirection],
      [1, 2, 'backward'],
    );
    s.renderer.viewScale = () => 1.25;
    emit(input, 'input', { inputType: 'insertText' });
    assert.equal(input.dataset.formTextGeometryCapability, 'supported');
  } finally {
    s.close();
  }
});
test('r5: opened AutoSize session cannot drop its owner field to bypass stale submit admission', () => {
  const s = setup();
  try {
    const input = s.open();
    input.value = 'not authorized';
    delete s.target.form.autoSizeOwner;
    s.invalidate();
    emit(input, 'keydown', { key: 'Enter', ctrlKey: true });
    assert.equal(s.requests.length, 0);
    assert.equal(s.doc.nodes.length, 0);
  } finally {
    s.close();
  }
});

test('r5: expanded editor viewport clears on measured epoch recovery without moving the source frame', () => {
  const s = setup();
  try {
    s.publishNarrowPaintedTarget(10);
    s.setMetricUnavailable(true);
    const input = s.open();
    assert.equal(input.style.minWidth, 'calc(38px + 1ch)');
    input.value = 'recover';
    input.setSelectionRange(1, 3, 'backward');
    s.setMetricUnavailable(false);
    s.reflow('italic 16px Epoch2');
    assert.equal(s.doc.nodes[0], input);
    assert.equal(s.doc.activeElement, input);
    assert.equal(input.style.minWidth, '');
    assert.equal(input.style.overflowX, '');
    assert.equal(input.dataset.formTextGeometryCapability, 'supported');
    assert.equal(input.dataset.formTextGeometryBasis, 'current-autosize-measurement');
    assert.equal(input.value, 'recover');
    assert.deepEqual(
      [input.selectionStart, input.selectionEnd, input.selectionDirection],
      [1, 3, 'backward'],
    );
    assert.deepEqual(s.storedFrame, { width: 70, height: 20 });
  } finally {
    s.close();
  }
});
