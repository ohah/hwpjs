import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasFormAutoSizer } from '../web/preview/form-autosize-provider.mjs';
import { createFormAutoSizeFrames } from '../web/preview/form-autosize-frame.mjs';
import { paintHwp5Form } from '../web/preview/hwp5-form-paint.mjs';

// Authored metrics exercise the real provider/painter functions, not a browser font.
function canvas() {
  const drawn = [],
    clips = [];
  let depth = 0;
  return {
    drawn,
    clips,
    get depth() {
      return depth;
    },
    save() {
      depth++;
    },
    restore() {
      depth--;
    },
    beginPath() {},
    clip() {},
    fillRect() {},
    rect(...args) {
      clips.push(args);
    },
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() {},
    measureText(text) {
      return {
        width: text.length * 7,
        actualBoundingBoxLeft: 0,
        actualBoundingBoxRight: text.length * 7,
        actualBoundingBoxAscent: 5,
        actualBoundingBoxDescent: 4,
        fontBoundingBoxAscent: 9,
        fontBoundingBoxDescent: 7,
      };
    },
    fillText(text, x, y) {
      drawn.push({ text, x, y });
    },
  };
}
function context(extra = {}) {
  return Object.freeze({
    kind: 'combo_box',
    label: 'A'.repeat(18),
    name: 'OwnCombo',
    font: '16px OwnFixture',
    fontHeight: 16,
    lineHeight: null,
    multiline: true,
    wordWrap: true,
    storedFrame: Object.freeze({ width: 70, height: 20 }),
    ...extra,
  });
}
function measure(c) {
  const ctx = canvas();
  let result;
  createCanvasFormAutoSizer(ctx)({
    context: c,
    commit: (frame) => {
      result = frame;
    },
  });
  assert.equal(ctx.depth, 0);
  return result;
}
function paint(c, frame) {
  const ctx = canvas();
  assert.equal(
    paintHwp5Form(
      ctx,
      {
        ...frame,
        label: c.label,
        font: c.font,
        multiline: c.multiline,
        wordWrap: c.wordWrap,
        form: { source: { kind: c.kind } },
      },
      10,
      20,
    ),
    true,
  );
  assert.equal(ctx.depth, 0);
  return ctx;
}
test('combo provider reserves arrow clip before computing wrapped height', () => {
  const c = context();
  const frame = measure(c);
  assert.equal(frame.width, 70);
  assert.equal(frame.height, 54); // authored metrics: 3 rows, each 18px
  assert.deepEqual(c.storedFrame, { width: 70, height: 20 });
  assert.equal(c.label, 'A'.repeat(18));
});
test('provider receipt and actual painter rows fit the combo text clip', () => {
  const c = context(),
    frame = measure(c),
    ctx = paint(c, frame);
  assert.deepEqual(
    ctx.drawn.map((row) => row.text),
    ['AAAAAAA', 'AAAAAAA', 'AAAA'],
  );
  const [clipX, , clipWidth] = ctx.clips[1];
  for (const row of ctx.drawn) {
    assert(row.x >= clipX);
    assert(row.x + ctx.measureText(row.text).width <= clipX + clipWidth);
    assert(row.y + frame.lineHeight / 2 <= 20 + frame.height);
  }
  assert.equal(ctx.drawn.map((row) => row.text).join(''), c.label);
});
test('fixed combo Canvas paint uses the same reserved text area', () => {
  const c = context(),
    ctx = paint(c, { width: 70, height: 54, lineHeight: 18 });
  assert.deepEqual(
    ctx.drawn.map((row) => row.text),
    ['AAAAAAA', 'AAAAAAA', 'AAAA'],
  );
});
test('noncombo wrap and combo no-wrap paths keep their prior policy', () => {
  const edit = context({ kind: 'edit' });
  assert.equal(measure(edit).height, 36);
  const noWrap = context({ wordWrap: false });
  const frame = measure(noWrap),
    ctx = paint(noWrap, frame);
  assert.equal(frame.height, 18);
  assert.deepEqual(
    ctx.drawn.map((row) => row.text),
    [noWrap.label],
  );
});

test('fractional and narrow viable combo widths preserve every row within the actual clip', () => {
  for (const width of [33, 40, 70, 103.5]) {
    for (const length of [1, 2, 9, 18, 55]) {
      const c = context({
        label: 'A'.repeat(length),
        storedFrame: Object.freeze({ width, height: 20 }),
      });
      const frame = measure(c),
        ctx = paint(c, frame);
      const [clipX, , clipWidth] = ctx.clips[1];
      assert.equal(frame.width, width);
      assert.equal(ctx.drawn.map((row) => row.text).join(''), c.label);
      assert.equal(frame.height, ctx.drawn.length * frame.lineHeight);
      for (const row of ctx.drawn)
        assert(row.x + ctx.measureText(row.text).width <= clipX + clipWidth);
    }
  }
});
test('actual provider commits a current owner receipt and a reset invalidates it', () => {
  const store = createFormAutoSizeFrames(),
    source = {},
    owner = Object.freeze({});
  const c = context(),
    ctx = canvas();
  store.begin(source, [owner]);
  const frame = store.request(source, owner, c, createCanvasFormAutoSizer(ctx));
  assert.equal(frame.basis, 'current-autosize-measurement');
  assert.equal(frame.width, 70);
  assert.equal(frame.height, 54);
  assert.deepEqual(frame.storedFrame, { width: 70, height: 20 });
  assert.equal(paint(c, frame).drawn.length, 3);
  store.begin(source, [owner]);
  assert.equal(store.resolve(source, owner, c), null);
  store.dispose();
});
