import test from 'node:test';
import assert from 'node:assert/strict';
import { layoutContent } from '../../web/preview/layout.mjs';
import {
  hitText,
  caretGeometry,
  selectionRects,
  selectionIntersectsText,
} from '../../web/preview/text-geometry.mjs';
import { textChange, graphemeUnits, snapUnit } from '../../web/preview/text-input.mjs';
import { displayContent } from '../../web/preview/content.mjs';
import { navigateText } from '../../web/preview/text-navigation.mjs';
import { createTextStyle, withDraftText } from '../../web/preview/text-style.mjs';
import { attachHwpxStyles } from '../../web/preview/hwpx-style-content.mjs';
import { rowAtY } from '../../web/preview/row-geometry.mjs';
import { createRenderer } from '../../web/preview/renderer.mjs';
import { navigationIntent } from '../../web/preview/navigation-intent.mjs';

const paragraph = (text, extras = {}) => ({
  section: 0,
  paragraph: 1,
  editable: true,
  label: 'label',
  text,
  ...extras,
});
test('renderer relief keeps central glyph color and measured advances without guessing conflict priority', (t) => {
  let renderer;
  const originals = new Map(
    ['window', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  t.after(() => {
    renderer?.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const frames = [],
    draws = [],
    stack = [];
  globalThis.window = { devicePixelRatio: 1 };
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  globalThis.requestAnimationFrame = (fn) => {
    frames.push(fn);
    return frames.length;
  };
  globalThis.cancelAnimationFrame = () => {};
  const ctx = {
    translate(x, y) {
      assert(x === 0);
      assert.equal(y, 0);
    },
    setTransform() {},
    fillRect() {},
    save() {
      stack.push(this.fillStyle);
    },
    restore() {
      this.fillStyle = stack.pop();
    },
    fillText(text, x, y) {
      draws.push({ text, x, y, color: this.fillStyle });
    },
    measureText() {
      return { width: 10, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 2 };
    },
  };
  renderer = createRenderer(
    { style: {}, dataset: {}, getContext: () => ctx },
    {
      clientWidth: 500,
      clientHeight: 100,
      scrollTop: 0,
      addEventListener() {},
      removeEventListener() {},
    },
    { style: {} },
    () => {},
  );
  const p = paragraph('AB', {
    label: '',
    characterRanges: [
      { start: 0, end: 1, charShapeId: 0 },
      { start: 1, end: 2, charShapeId: 1 },
    ],
  });
  for (const [emboss, engrave] of [
    [true, false],
    [false, true],
    [true, true],
    [false, false],
  ]) {
    draws.length = 0;
    renderer.show({
      paragraphs: [p],
      characterShapes: [
        { id: 0, height: 3000 },
        { id: 1, height: 3000 },
      ],
      characterTextColors: [{ id: 0, color: 0x123456 }],
      characterEffects: [{ id: 0, emboss, engrave, superscript: false, subscript: false }],
      limited: false,
    });
    frames.shift()();
    const a = draws.filter((row) => row.text === 'A'),
      b = draws.find((row) => row.text === 'B');
    assert.equal(a.length, emboss === engrave ? 1 : 3);
    const central = a.at(-1);
    assert.equal(central.color, '#123456');
    assert.equal(b.x - central.x, 10);
    if (emboss !== engrave) {
      assert.equal(a[0].x, central.x - 2);
      assert.equal(a[1].x, central.x + 2);
      assert.equal(a[0].y, central.y - 2);
      assert.equal(a[1].y, central.y + 2);
      assert.equal(a[0].color, emboss ? '#ffffff' : '#808080');
    }
    assert.equal(stack.length, 0);
  }
});
test('renderer scripts use measured font and shared offsets without leaking state to normal glyphs', (t) => {
  let renderer;
  const originals = new Map(
    ['window', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  t.after(() => {
    renderer?.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const frames = [],
    draws = [];
  globalThis.window = { devicePixelRatio: 1 };
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  globalThis.requestAnimationFrame = (fn) => {
    frames.push(fn);
    return frames.length;
  };
  globalThis.cancelAnimationFrame = () => {};
  const ctx = {
    translate(x, y) {
      assert(x === 0);
      assert.equal(y, 0);
    },
    setTransform() {},
    fillRect() {},
    fillText(text, x, y) {
      draws.push({ text, x, y, font: this.font });
    },
    measureText() {
      return {
        width: Number(/(\d+(?:\.\d+)?)pt/.exec(this.font)?.[1] ?? 10),
        actualBoundingBoxAscent: 10,
        actualBoundingBoxDescent: 2,
      };
    },
  };
  renderer = createRenderer(
    { style: {}, dataset: {}, getContext: () => ctx },
    {
      clientWidth: 500,
      clientHeight: 100,
      scrollTop: 0,
      addEventListener() {},
      removeEventListener() {},
    },
    { style: {} },
    () => {},
  );
  const p = paragraph('ABC', {
    label: '',
    characterRanges: [0, 1, 2].map((id) => ({ start: id, end: id + 1, charShapeId: id })),
  });
  renderer.show({
    paragraphs: [p],
    characterShapes: [0, 1, 2].map((id) => ({ id, height: 1200 })),
    characterEffects: [
      { id: 0, superscript: true, subscript: false },
      { id: 1, superscript: false, subscript: false },
      { id: 2, superscript: false, subscript: true },
    ],
    limited: false,
  });
  frames.shift()();
  const [a, b, c] = ['A', 'B', 'C'].map((text) => draws.find((row) => row.text === text));
  assert.match(a.font, /8\.4pt/);
  assert.match(b.font, /12pt/);
  assert.match(c.font, /8\.4pt/);
  assert(Math.abs(b.x - a.x - 8.4) < 1e-12);
  assert(Math.abs(c.x - b.x - 12) < 1e-12);
  assert(Math.abs(b.y - a.y - 4.8) < 1e-12);
  assert(Math.abs(c.y - b.y - 2.4) < 1e-12);
});
test('shade selection follows repeated page instance and noninvertible transform policy', () => {
  const row = { section: 0, paragraph: 1, editable: true, pageArea: 'master', pageOrdinal: 1 };
  const anchor = { ...row, unit: 0 },
    focus = { ...row, unit: 1 };
  const ranges = [{ section: 0, paragraph: 1, startUnit: 0, endUnit: 1 }];
  for (const selected of [null, ranges]) {
    assert.equal(selectionIntersectsText(row, 0, 1, anchor, focus, selected), true);
    assert.equal(
      selectionIntersectsText({ ...row, pageOrdinal: 2 }, 0, 1, anchor, focus, selected),
      false,
    );
    assert.equal(
      selectionIntersectsText(
        { ...row, transform: [0, 0, 0, 0, 0, 0] },
        0,
        1,
        anchor,
        focus,
        selected,
      ),
      false,
    );
    for (const transform of [
      [1, 0, 0, 1, 100, 200],
      [0, 1, -1, 0, 100, 200],
      [2, 0, 0, 3, -100, 200],
    ]) {
      assert.equal(
        selectionIntersectsText({ ...row, transform }, 0, 1, anchor, focus, selected),
        true,
      );
    }
    assert.equal(
      selectionIntersectsText(
        { ...row, editable: false, selectable: false },
        0,
        1,
        anchor,
        focus,
        selected,
      ),
      false,
    );
    assert.equal(selectionIntersectsText(row, 1, 2, anchor, focus, selected), false);
  }
});
test('renderer shade paints before glyph and restores text color with measured advance', (t) => {
  let renderer;
  const originals = new Map(
    ['window', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  t.after(() => {
    renderer?.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const frames = [],
    calls = [],
    stack = [];
  globalThis.window = { devicePixelRatio: 1 };
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  globalThis.requestAnimationFrame = (fn) => {
    frames.push(fn);
    return frames.length;
  };
  globalThis.cancelAnimationFrame = () => {};
  const ctx = {
    translate(x, y) {
      assert(x === 0);
      assert.equal(y, 0);
    },
    setTransform() {},
    save() {
      stack.push(this.fillStyle);
    },
    restore() {
      this.fillStyle = stack.pop();
    },
    fillRect(...args) {
      calls.push({ kind: 'rect', color: this.fillStyle, args });
    },
    fillText(text) {
      calls.push({ kind: 'text', color: this.fillStyle, text });
    },
    measureText() {
      return { width: 10, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 2 };
    },
  };
  renderer = createRenderer(
    { style: {}, dataset: {}, getContext: () => ctx },
    {
      clientWidth: 500,
      clientHeight: 100,
      scrollTop: 0,
      addEventListener() {},
      removeEventListener() {},
    },
    { style: {} },
    () => {},
  );
  const p = paragraph('AB', {
    label: '',
    characterRanges: [
      { start: 0, end: 1, charShapeId: 0 },
      { start: 1, end: 2, charShapeId: 1 },
    ],
  });
  renderer.show({
    paragraphs: [p],
    characterShapes: [
      { id: 0, height: 1200 },
      { id: 1, height: 1200 },
    ],
    characterTextColors: [{ id: 0, color: 0x123456 }],
    characterShades: [
      { id: 0, state: 'color', color: 0xffff00 },
      { id: 1, state: 'none', color: null },
    ],
    limited: false,
  });
  frames.shift()();
  assert.equal(renderer.characterShade({ section: 0, paragraph: 1 }, 0, 1), '#ffff00');
  assert.equal(renderer.characterShade({ section: 0, paragraph: 1 }, 0, 2), 'mixed');
  const background = calls.findIndex((call) => call.kind === 'rect' && call.color === '#ffff00');
  const glyph = calls.findIndex((call) => call.kind === 'text' && call.text === 'A');
  assert(background >= 0 && background < glyph);
  assert.equal(calls[glyph].color, '#123456');
  assert.equal(calls[background].args[2], 10);
  assert.equal(calls.filter((call) => call.kind === 'rect' && call.color === '#ffff00').length, 1);
  calls.length = 0;
  const first = { ...p, selectionOwner: 'body' };
  const second = { ...p, paragraph: 2, selectionOwner: 'body' };
  renderer.show({
    paragraphs: [first, second],
    characterShapes: [
      { id: 0, height: 1200 },
      { id: 1, height: 1200 },
    ],
    characterShades: [{ id: 0, state: 'color', color: 0xffff00 }],
    limited: false,
  });
  renderer.select({
    active: true,
    anchor: { section: 0, paragraph: 1, unit: 0 },
    focus: { section: 0, paragraph: 2, unit: 1 },
  });
  frames.shift()();
  assert.equal(calls.filter((call) => call.kind === 'rect' && call.color === '#ffff00').length, 0);
  assert.equal(calls.filter((call) => call.kind === 'rect' && call.color === '#bad9f4').length, 2);
  calls.length = 0;
  renderer.select({
    active: true,
    anchor: { section: 0, paragraph: 2, unit: 1 },
    focus: { section: 0, paragraph: 1, unit: 0 },
  });
  frames.shift()();
  assert.equal(calls.filter((call) => call.kind === 'rect' && call.color === '#ffff00').length, 0);
  assert.equal(stack.length, 0);
  calls.length = 0;
  renderer.show({
    paragraphs: [p],
    characterShapes: [
      { id: 0, height: 1200 },
      { id: 1, height: 1200 },
    ],
    characterTextColors: [{ id: 0, color: 0x123456 }],
    characterShades: [{ id: 0, state: 'color', color: 0xffff00 }],
    limited: false,
  });
  renderer.select({
    active: true,
    anchor: { section: 0, paragraph: 1, unit: 0 },
    focus: { section: 0, paragraph: 1, unit: 1 },
  });
  frames.shift()();
  assert(calls.some((call) => call.kind === 'rect' && call.color === '#bad9f4'));
  assert.equal(calls.filter((call) => call.kind === 'rect' && call.color === '#ffff00').length, 0);
  assert.equal(calls.find((call) => call.kind === 'text' && call.text === 'A').color, '#123456');
  calls.length = 0;
  renderer.select({
    active: true,
    anchor: { section: 0, paragraph: 1, unit: 1 },
    focus: { section: 0, paragraph: 1, unit: 0 },
  });
  frames.shift()();
  assert(calls.some((call) => call.kind === 'rect' && call.color === '#bad9f4'));
  assert.equal(calls.filter((call) => call.kind === 'rect' && call.color === '#ffff00').length, 0);
  calls.length = 0;
  renderer.select({
    active: true,
    anchor: { section: 0, paragraph: 1, unit: 1 },
    focus: { section: 0, paragraph: 1, unit: 1 },
  });
  frames.shift()();
  assert.equal(calls.filter((call) => call.kind === 'rect' && call.color === '#ffff00').length, 1);
});

test('macOS command vertical keys reach paragraph edges rather than one wrapped visual row', () => {
  const text = '1,498 ',
    layout = layoutContent(
      {
        paragraphs: [{ section: 0, paragraph: 0, text, editable: true, label: '' }],
        limited: false,
      },
      16,
      (text) => text.length * 8,
    );
  assert(layout.rows.length >= 3);
  for (const [key, unit, expected] of [
    ['ArrowUp', text.length, 0],
    ['ArrowDown', 0, text.length],
  ]) {
    const intent = navigationIntent({ key, metaKey: true }, 'MacIntel');
    assert.deepEqual(intent, {
      key: key === 'ArrowUp' ? 'Home' : 'End',
      paragraphEdge: true,
      word: false,
    });
    const point = { section: 0, paragraph: 0, unit };
    const moved = navigateText(layout, text, point, point, intent.key, intent);
    assert.equal(moved.focus.unit, expected);
    const selected = navigateText(layout, text, point, point, intent.key, {
      ...intent,
      extend: true,
    });
    assert.equal(selected.anchor.unit, unit);
    assert.equal(selected.focus.unit, expected);
  }
  assert.equal(navigationIntent({ key: 'ArrowUp', ctrlKey: true }, 'MacIntel'), null);
  assert.deepEqual(navigationIntent({ key: 'ArrowUp' }, 'MacIntel'), {
    key: 'ArrowUp',
    paragraphEdge: false,
    word: false,
  });
});

test('platform navigation separates macOS Option words and Cmd line edges', () => {
  assert.deepEqual(navigationIntent({ key: 'ArrowUp', metaKey: true }, 'MacIntel'), {
    key: 'Home',
    paragraphEdge: true,
    word: false,
  });
  assert.deepEqual(navigationIntent({ key: 'ArrowDown', metaKey: true }, 'MacIntel'), {
    key: 'End',
    paragraphEdge: true,
    word: false,
  });
  assert.deepEqual(navigationIntent({ key: 'ArrowRight', altKey: true }, 'MacIntel'), {
    key: 'ArrowRight',
    word: true,
    paragraphEdge: false,
  });
  assert.deepEqual(navigationIntent({ key: 'ArrowLeft', metaKey: true }, 'macOS'), {
    key: 'Home',
    word: false,
    paragraphEdge: false,
  });
  assert.deepEqual(navigationIntent({ key: 'ArrowRight', ctrlKey: true }, 'Win32'), {
    key: 'ArrowRight',
    word: true,
    paragraphEdge: true,
  });
  assert.equal(navigationIntent({ key: 'ArrowRight', altKey: true }, 'Linux'), null);
  assert.equal(
    navigationIntent({ key: 'ArrowRight', altKey: true, ctrlKey: true }, 'MacIntel'),
    null,
  );
  assert.equal(
    navigationIntent({ key: 'ArrowRight', getModifierState: () => true }, 'Win32'),
    null,
  );
});
test('macOS Control navigation stays available to the host', () => {
  for (const platform of ['MacIntel', 'macOS']) {
    for (const key of ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End']) {
      for (const shiftKey of [false, true]) {
        assert.equal(
          navigationIntent({ key, ctrlKey: true, shiftKey }, platform),
          null,
          `${platform}/${key}/${shiftKey}`,
        );
      }
    }
  }
});
test('word navigation skips punctuation without cutting Unicode and retains selection', () => {
  const text = '한글  😀 e\u0301 끝';
  const layout = layoutContent({ paragraphs: [paragraph(text)], limited: false }, 500, () => 10);
  const point = (unit) => ({ section: 0, paragraph: 1, unit });
  const next = navigateText(layout, text, point(0), point(0), 'ArrowRight', {
    word: true,
    extend: true,
  });
  assert.equal(next.focus.unit, text.indexOf('e'));
  assert.equal(next.anchor.unit, 0);
  assert.equal(
    navigateText(layout, text, point(text.length), point(text.length), 'ArrowLeft', { word: true })
      .focus.unit,
    text.indexOf('끝'),
  );
  assert.equal(
    navigateText(layout, text, next.focus, next.focus, 'ArrowLeft', { word: true }).focus.unit,
    0,
  );
  assert.equal(
    navigateText(layout, text, point(0), point(2), 'ArrowRight', { word: true }).focus.unit,
    2,
  );
  assert(text.slice(0, next.focus.unit).isWellFormed());
});
test('vertical navigation retains desired x through a short paragraph', () => {
  const layout = layoutContent(
    {
      paragraphs: [
        paragraph('abcdef'),
        paragraph('x', { paragraph: 2 }),
        paragraph('abcdef', { paragraph: 3 }),
      ],
      limited: false,
    },
    500,
    () => 10,
  );
  const anchor = { section: 0, paragraph: 1, unit: 5 };
  const options = { extend: true, crossParagraph: true };
  const short = navigateText(layout, 'abcdef', anchor, anchor, 'ArrowDown', options);
  assert.equal(short.focus.paragraph, 2);
  assert.equal(short.focus.unit, 1);
  const drift = navigateText(layout, 'x', anchor, short.focus, 'ArrowDown', options);
  assert.equal(drift.focus.unit, 1);
  const restored = navigateText(layout, 'x', anchor, short.focus, 'ArrowDown', {
    ...options,
    preferredX: short.preferredX,
  });
  assert.equal(restored.focus.paragraph, 3);
  assert.equal(restored.focus.unit, 5);
  assert.equal(restored.anchor, anchor);
  assert.equal(restored.preferredX, short.preferredX);
  const horizontal = navigateText(layout, 'abcdef', anchor, restored.focus, 'ArrowLeft', {
    ...options,
    preferredX: restored.preferredX,
  });
  assert.equal(horizontal.preferredX, null);
  const invalid = navigateText(layout, 'x', anchor, short.focus, 'ArrowDown', {
    ...options,
    preferredX: NaN,
  });
  assert.equal(invalid.focus.unit, 1);
});
test('renderer paints measured large text rows selection caret and scroll height from shared geometry', (t) => {
  let renderer;
  const originals = new Map(
    ['window', 'ResizeObserver', 'requestAnimationFrame', 'cancelAnimationFrame'].map((key) => [
      key,
      Object.getOwnPropertyDescriptor(globalThis, key),
    ]),
  );
  t.after(() => {
    renderer?.close();
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const frames = [],
    draws = [],
    rectangles = [];
  globalThis.window = { devicePixelRatio: 2 };
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
  };
  globalThis.requestAnimationFrame = (fn) => {
    frames.push(fn);
    return frames.length;
  };
  globalThis.cancelAnimationFrame = () => {};
  const ctx = {
    font: '',
    translate(x, y) {
      assert(x === 0);
      assert.equal(y, 0);
    },
    setTransform() {},
    fillRect(...args) {
      rectangles.push({ color: this.fillStyle, args });
    },
    fillText(text, x, y) {
      draws.push({ text, x, y, font: this.font });
    },
    measureText() {
      return { width: 10, actualBoundingBoxAscent: 10, actualBoundingBoxDescent: 2 };
    },
  };
  const canvas = { style: {}, dataset: {}, getContext: () => ctx };
  const viewport = {
      clientWidth: 50,
      clientHeight: 100,
      scrollTop: 0,
      addEventListener() {},
      removeEventListener() {},
    },
    spacer = { style: {} };
  let layout;
  renderer = createRenderer(canvas, viewport, spacer, (value) => {
    layout = value;
  });
  const p = paragraph('AB', {
    label: '',
    characterRanges: [
      { start: 0, end: 1, charShapeId: 7 },
      { start: 1, end: 2, charShapeId: null },
    ],
  });
  renderer.show({ paragraphs: [p], characterShapes: [{ id: 7, height: 4800 }], limited: false });
  assert.equal(layout.height, 172);
  assert.equal(spacer.style.height, '72px');
  renderer.select({
    active: true,
    anchor: { section: 0, paragraph: 1, unit: 0 },
    focus: { section: 0, paragraph: 1, unit: 1, affinity: 'backward' },
  });
  frames.shift()();
  assert(
    draws.some(
      (draw) => draw.text === 'A' && draw.font === '48pt system-ui, sans-serif' && draw.y === 36,
    ),
  );
  assert(!draws.some((draw) => draw.text === 'B')); // Next row starts below the viewport.
  assert(
    rectangles.some(
      (rect) => rect.color === '#bad9f4' && rect.args[1] === 36 && rect.args[3] === 80,
    ),
  );
  assert(
    rectangles.some(
      (rect) => rect.color === '#145b96' && rect.args[1] === 36 && rect.args[3] === 80,
    ),
  );
  viewport.scrollTop = 116;
  renderer.show(
    { paragraphs: [p], characterShapes: [{ id: 7, height: 4800 }], limited: false },
    { preserveScroll: true },
  );
  frames.shift()();
  assert(draws.some((draw) => draw.text === 'B' && draw.y === 8));
  assert.equal(canvas.height, 200);
  assert.equal(renderer.characterToggle(p, 0, 1, 'bold'), null);
  renderer.show({
    paragraphs: [p],
    characterPropertiesAvailable: true,
    characterShapes: [{ id: 7, height: 4800, bold: true, italic: false }],
    limited: false,
  });
  assert.deepEqual(renderer.characterToggle(p, 0, 1, 'bold'), { bold: false });
  renderer.preview({ ...p, text: 'draft' });
  assert.deepEqual(
    renderer.characterToggle(p, 0, 1, 'bold'),
    { bold: false },
    'toggle reads committed native projection, not temporary draft',
  );
  renderer.show({
    paragraphs: [p],
    characterPropertiesAvailable: true,
    characterShapes: [{ id: 7, bold: false, italic: true }],
    limited: false,
  });
  assert.deepEqual(renderer.characterToggle(p, 0, 1, 'bold'), { bold: true });
  renderer.clear();
  assert.equal(renderer.characterToggle(p, 0, 1, 'bold'), null);
});
test('native hundredth-point size uses CSS points and shared variable row metrics', () => {
  const p = paragraph('A😀B', {
    label: '',
    characterRanges: [
      { start: 0, end: 1, charShapeId: 0 },
      { start: 1, end: 3, charShapeId: 7 },
      { start: 3, end: 4, charShapeId: 8 },
    ],
  });
  const content = {
    paragraphs: [p],
    characterShapes: [
      { id: 0, height: 1000 },
      { id: 7, height: 4800, bold: true },
      { id: 8, height: 0 },
    ],
    limited: false,
  };
  const fontAt = createTextStyle(content, '16px sans-serif');
  assert.equal(fontAt(p, 0), '10pt sans-serif');
  assert.equal(fontAt(p, 1), 'bold 48pt sans-serif');
  assert.equal(fontAt(p, 3), '16px sans-serif');
  assert.equal(fontAt(p, 1, 'label'), '16px sans-serif');
  assert.equal(fontAt.textHeight(p, 1), 80);
  const layout = layoutContent(content, 10, (_text, owner, unit, kind) => ({
    width: 10,
    height: fontAt.textHeight(owner, unit, kind),
  }));
  assert.deepEqual(
    layout.rows.map((row) => [row.y, row.height]),
    [
      [0, 28],
      [28, 28],
      [56, 88],
      [144, 28],
      [172, 28],
    ],
  );
  assert.equal(caretGeometry(layout, hitText(layout, 20, 140)).height, 80);
  for (const height of [null, undefined, 0, -1, NaN, Infinity, 1.5]) {
    const resolve = createTextStyle({ characterShapes: [{ id: 7, height }] }, '16px sans-serif');
    assert.equal(resolve(p, 1), '16px sans-serif');
    assert.equal(resolve.textHeight(p, 1), 20);
  }
  assert.equal(fontAt(withDraftText(p, 'new'), 1), '16px sans-serif');
  assert.equal(content.characterShapes[1].height, 4800);
});
test('variable row heights share pointer caret selection and vertical navigation coordinates', () => {
  const p = paragraph('A😀B', { label: '' });
  const layout = layoutContent(
    { paragraphs: [p], limited: false },
    10,
    (_text, _owner, unit, kind) => ({ width: 10, height: kind === 'text' && unit === 1 ? 60 : 20 }),
  );
  assert.deepEqual(
    layout.rows.map((r) => [r.y, r.height]),
    [
      [0, 28],
      [28, 28],
      [56, 68],
      [124, 28],
      [152, 28],
    ],
  );
  assert.equal(layout.height, 180);
  const point = hitText(layout, 20, 100);
  assert.equal(point.unit, 1);
  assert.deepEqual(caretGeometry(layout, point), { x: 20, y: 64, row: 2, height: 60 });
  const next = navigateText(layout, p.text, point, point, 'ArrowDown');
  assert.equal(next.focus.unit, 3);
  assert.equal(caretGeometry(layout, next.focus).row, 3);
  const previous = navigateText(layout, p.text, next.focus, next.focus, 'ArrowUp');
  assert.equal(previous.focus.unit, 1);
  assert.deepEqual(
    selectionRects(layout, { ...point, unit: 0 }, { ...point, unit: 4 }).map((r) => [
      r.y,
      r.height,
    ]),
    [
      [36, 20],
      [64, 60],
      [132, 20],
    ],
  );
  assert.equal(hitText(layout, 20, 124).unit, 3);
  assert.equal(hitText(layout, 20, -1), null);
  assert.equal(hitText(layout, 20, 180), null);
  assert.equal(p.text, 'A😀B');
});
test('binary variable row hit lookup agrees with independent linear interval oracle', () => {
  const layout = layoutContent(
    { paragraphs: [paragraph('a'.repeat(128))], limited: false },
    10,
    (_text, _owner, unit) => ({ width: 10, height: 20 + (unit % 13) * 7 }),
  );
  for (let y = -1; y <= layout.height + 1; y += 0.5) {
    const expected = layout.rows.findIndex((row) => row.y <= y && y < row.y + row.height);
    assert.equal(rowAtY(layout, y), expected);
  }
  for (const y of [NaN, Infinity, -Infinity]) assert.equal(rowAtY(layout, y), -1);
});
test('variable row metrics reject invalid heights overflow and preserve clipping permissions', () => {
  const content = { paragraphs: [paragraph('ab')], limited: false };
  for (const height of [0, -1, NaN, Infinity, undefined]) {
    assert.throws(
      () => layoutContent(content, 10, () => ({ width: 10, height })),
      /InvalidTextMeasurement/,
    );
  }
  assert.throws(
    () => layoutContent(content, 10, () => ({ width: 10, height: Number.MAX_VALUE })),
    /InvalidLayoutBounds/,
  );
  const clipped = layoutContent(content, 10, () => ({ width: 10, height: 60 }), 2);
  assert.equal(clipped.height, 136);
  assert(clipped.limited);
  assert(clipped.rows.every((row) => !row.editable && !row.selectable));
});
test('read-only calculated text can be selected without becoming editable', () => {
  const p = paragraph('156.3', { editable: false });
  const content = { paragraphs: [p] };
  attachHwpxStyles(
    { characterShapes: () => [], characterRanges: () => [{ start: 0, end: 5, charShapeId: 7 }] },
    content,
    true,
  );
  assert.equal(p.editable, false);
  assert.equal(p.selectable, true);
  const layout = layoutContent({ ...content, limited: false }, 200, () => 10);
  const point = hitText(layout, 20, 36);
  assert.equal(point.unit, 0);
  assert(caretGeometry(layout, point));
  assert.equal(selectionRects(layout, point, { ...point, unit: 5 }).length, 1);
  const clipped = layoutContent({ ...content, limited: false }, 15, () => 10, 2);
  assert.equal(hitText(clipped, 20, 36), null);
});
test('repeated style projection clears stale ranges selection and errors without changing permissions', () => {
  const p = paragraph('ab', { editable: false }),
    content = { paragraphs: [p] };
  const editor = {
    characterShapes: () => [],
    characterRanges: () => [{ start: 0, end: 2, charShapeId: 7 }],
  };
  attachHwpxStyles(editor, content, true);
  assert.equal(p.selectable, true);
  p.characterRangesError = 'old error';
  attachHwpxStyles(editor, content, true);
  assert.equal(p.characterRangesError, undefined);
  attachHwpxStyles(
    {
      characterShapes() {
        assert.fail('unavailable query');
      },
      characterRanges() {
        assert.fail('unavailable query');
      },
    },
    content,
    false,
  );
  assert.equal(p.characterRanges, null);
  assert.equal(p.selectable, false);
  assert.equal(p.editable, false);
  p.editable = true;
  attachHwpxStyles(editor, content, false);
  assert.equal(p.editable, true);
  assert.equal(p.selectable, true);
});
test('acknowledged and unchanged Canvas drafts retain emphasis while uncommitted text drops stale ranges', () => {
  const p = paragraph('가😀', { characterRanges: [{ start: 0, end: 3, charShapeId: 7 }] });
  const font = createTextStyle({ characterShapes: [{ id: 7, bold: true }] }, '16px sans-serif');
  const unchanged = withDraftText(p, p.text);
  assert.equal(font(unchanged, 0), 'bold 16px sans-serif');
  const pending = withDraftText(p, '입력가😀');
  assert.equal(pending.characterRanges, null);
  assert.equal(font(pending, 0), '16px sans-serif');
  const acknowledged = {
    ...p,
    text: pending.text,
    characterRanges: [{ start: 0, end: 5, charShapeId: 7 }],
  };
  assert.equal(font(withDraftText(acknowledged, pending.text), 0), 'bold 16px sans-serif');
  assert.equal(p.text, '가😀');
  assert.equal(p.characterRanges[0].end, 3);
});
test('binary emphasis lookup agrees with linear oracle across empty provenance boundaries', () => {
  const ranges = [];
  for (let unit = 0; unit < 256; unit++) {
    ranges.push({ start: unit, end: unit, charShapeId: 7 });
    ranges.push({ start: unit, end: unit + 1, charShapeId: unit % 2 ? 7 : null });
  }
  ranges.push({ start: 256, end: 256, charShapeId: 7 });
  const p = paragraph('', { characterRanges: ranges });
  const resolve = createTextStyle(
    { characterShapes: [{ id: 7, bold: true, italic: true }] },
    '16px sans-serif',
  );
  for (let unit = -1; unit <= 257; unit++) {
    const expected =
      ranges.find((row) => row.start <= unit && unit < row.end)?.charShapeId === 7
        ? 'italic bold 16px sans-serif'
        : '16px sans-serif';
    assert.equal(resolve(p, unit), expected);
  }
});
test('native emphasis uses the same font for wrapping and Canvas grapheme positions', () => {
  const p = paragraph('A😀B', {
    label: '',
    characterRanges: [
      { start: 0, end: 1, charShapeId: 0 },
      { start: 1, end: 3, charShapeId: 7 },
      { start: 3, end: 4, charShapeId: null },
    ],
  });
  const content = {
    paragraphs: [p],
    characterShapes: [
      { id: 0, bold: true, italic: false },
      { id: 7, bold: false, italic: true },
    ],
    limited: false,
  };
  const fontAt = createTextStyle(content, '16px sans-serif'),
    observed = [];
  const layout = layoutContent(content, 25, (text, owner, unit, kind) => {
    const font = fontAt(owner, unit, kind);
    if (kind === 'text') observed.push([text, unit, font]);
    return font.startsWith('bold') ? 20 : 10;
  });
  assert.deepEqual(observed, [
    ['A', 0, 'bold 16px sans-serif'],
    ['😀', 1, 'italic 16px sans-serif'],
    ['B', 3, '16px sans-serif'],
  ]);
  assert.deepEqual(
    layout.rows.filter((row) => row.kind === 'text').map((row) => [row.startUnit, row.endUnit]),
    [
      [0, 1],
      [1, 4],
    ],
  );
  assert.equal(fontAt({ ...p, characterRanges: null }, 0), '16px sans-serif');
  assert.equal(fontAt(p, 0, 'label'), '16px sans-serif');
});

test('optional style display errors and clipped content preserve editing eligibility', () => {
  const good = paragraph('ab'),
    bad = paragraph('x', { paragraph: 2 }),
    clipped = paragraph('c', { paragraph: 3, clipped: true });
  const content = { paragraphs: [good, bad, clipped] },
    queried = [];
  attachHwpxStyles(
    {
      characterShapes() {
        throw new Error('UnsupportedDisplay');
      },
      characterRanges(section, ordinal) {
        queried.push([section, ordinal]);
        return [{ start: 0, end: 2, charShapeId: 0 }];
      },
    },
    content,
    true,
  );
  assert.equal(content.characterShapesError, 'UnsupportedDisplay');
  assert.deepEqual(queried, [
    [0, 2],
    [0, 3],
  ]);
  assert.equal(bad.characterRangesError, 'CharacterDisplayLengthMismatch');
  assert.equal(clipped.characterRanges, null);
  assert(content.paragraphs.every((p) => p.editable));
});
test('text hit-testing maps wrapped graphemes to exact UTF-16 boundaries', () => {
  const layout = layoutContent(
    { paragraphs: [paragraph('가😀e\u0301나', { label: 'ab' })], limited: false },
    20,
    () => 10,
  );
  const rows = layout.rows.filter((r) => r.kind === 'text');
  assert.deepEqual(
    rows.map((r) => [r.startUnit, r.endUnit]),
    [
      [0, 3],
      [3, 6],
    ],
  );
  assert.equal(hitText(layout, 20, 28 + 8).unit, 0);
  assert.equal(hitText(layout, 40, 28 + 8).unit, 3);
  assert.equal(hitText(layout, 30, 2 * 28 + 8).unit, 5);
  assert.equal(hitText(layout, 20, 8), null);
  assert.equal(hitText(layout, NaN, 8), null);
  const point = { section: 0, paragraph: 1, unit: 3 };
  assert.equal(caretGeometry(layout, point).row, 2);
  assert.equal(caretGeometry(layout, { ...point, affinity: 'backward' }).row, 1);
  const rects = selectionRects(layout, { ...point, unit: 1 }, { ...point, unit: 5 });
  assert.deepEqual(
    rects.map((r) => r.width),
    [10, 10],
  );
  assert.deepEqual(selectionRects(layout, point, { ...point, paragraph: 2 }), []);
});
test('clipped text and incomplete row groups never advertise editable coordinates', () => {
  const result = {
    version: [5, 0, 3, 2],
    sections: [
      {
        index: 0,
        paragraphs: [
          {
            text: '가😀',
            textPresent: true,
            parentNodeIndex: null,
            tokens: [{ type: 'control', code: 13 }],
          },
          { text: 'nested', textPresent: true, parentNodeIndex: 0, tokens: [] },
          {
            text: 'control',
            textPresent: true,
            parentNodeIndex: null,
            tokens: [{ type: 'control', code: 2 }],
          },
        ],
      },
    ],
  };
  assert.deepEqual(
    displayContent(result).paragraphs.map((p) => p.editable),
    [true, true, false],
  );
  assert.equal(displayContent(result, { maxUnits: 2 }).paragraphs[0].editable, false);
  const layout = layoutContent(
    { paragraphs: [paragraph('abcdef')], limited: false },
    10,
    () => 10,
    3,
  );
  assert(layout.limited);
  assert(layout.rows.every((r) => !r.editable));
});
test('empty paragraphs are hit-testable and dragging cannot cross paragraph ownership', () => {
  const layout = layoutContent(
    { paragraphs: [paragraph(''), paragraph('next', { paragraph: 2 })], limited: false },
    100,
    () => 10,
  );
  assert.equal(hitText(layout, 100, 28 + 8).unit, 0);
  assert.equal(hitText(layout, 100, 4 * 28 + 8, { section: 0, paragraph: 1 }).paragraph, 1);
});
test('replacement diffs reconstruct adversarial Unicode without split scalar boundaries', () => {
  const words = ['', 'a', '가', '각', '😀', '😁', 'e\u0301', '\uFEFF', '👩‍💻', '나😀가', '😀😀'];
  for (const before of words)
    for (const after of words) {
      const change = textChange(before, after);
      if (!change) {
        assert.equal(before, after);
        continue;
      }
      assert.equal(
        before.slice(0, change.startUnit) + change.text + before.slice(change.endUnit),
        after,
      );
      assert(before.slice(0, change.startUnit).isWellFormed());
      assert(before.slice(change.endUnit).isWellFormed());
      assert(change.text.isWellFormed());
    }
  assert.deepEqual(graphemeUnits('가😀e\u0301'), [0, 1, 3, 5]);
  assert.equal(snapUnit('가😀', 2), 1);
  assert.equal(snapUnit('가😀', 2, true), 3);
});
test('keyboard movement preserves graphemes, wrapped-line affinity and paragraph ownership', () => {
  const text = '가😀e\u0301나',
    layout = layoutContent(
      { paragraphs: [paragraph(text, { label: 'ab' })], limited: false },
      20,
      () => 10,
    );
  const point = (unit) => ({ section: 0, paragraph: 1, unit });
  assert.equal(navigateText(layout, text, point(1), point(1), 'ArrowRight').focus.unit, 3);
  assert.equal(navigateText(layout, text, point(3), point(3), 'ArrowLeft').focus.unit, 1);
  assert.equal(navigateText(layout, text, point(1), point(5), 'ArrowLeft').focus.unit, 1);
  const shifted = navigateText(layout, text, point(1), point(3), 'ArrowRight', { extend: true });
  assert.equal(shifted.anchor.unit, 1);
  assert.equal(shifted.focus.unit, 5);
  const end = navigateText(layout, text, point(1), point(1), 'End');
  assert.equal(end.focus.unit, 3);
  assert.equal(caretGeometry(layout, end.focus).row, 1);
  assert.equal(navigateText(layout, text, point(1), point(1), 'ArrowDown').focus.unit, 5);
  assert.equal(
    navigateText(layout, text, point(1), point(1), 'End', { paragraphEdge: true }).focus.unit,
    text.length,
  );
});

test('cross paragraph vertical candidates require extension and remain inside the section', () => {
  const layout = layoutContent(
    {
      paragraphs: [
        paragraph('가😀'),
        paragraph('둘', { paragraph: 2 }),
        paragraph('다른 구역', { section: 1, paragraph: 0 }),
      ],
      limited: false,
    },
    500,
    () => 10,
  );
  const point = { section: 0, paragraph: 1, unit: 0 };
  assert.equal(navigateText(layout, '가😀', point, point, 'ArrowDown').focus.paragraph, 1);
  assert.equal(
    navigateText(layout, '가😀', point, point, 'ArrowDown', { crossParagraph: true }).focus
      .paragraph,
    1,
  );
  const next = navigateText(layout, '가😀', point, point, 'ArrowDown', {
    crossParagraph: true,
    extend: true,
  });
  assert.equal(next.anchor, point);
  assert.equal(next.focus.paragraph, 2);
  const last = navigateText(layout, '둘', point, next.focus, 'ArrowDown', {
    crossParagraph: true,
    extend: true,
  });
  assert.equal(last.focus.section, 0);
  assert.equal(last.focus.paragraph, 2);
});
