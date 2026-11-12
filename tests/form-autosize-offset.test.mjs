import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasFormAutoSizer } from '../web/preview/form-autosize-provider.mjs';
import { paintHwp5Form } from '../web/preview/hwp5-form-paint.mjs';
import { formTextLayout } from '../web/preview/form-text-layout.mjs';

// Authored Canvas metrics: an italic-like left bearing and taller ink on long
// strings. Run the actual provider and painter; no browser/font equivalence.
function metric(text, bearing = 20) {
  return {
    width: text.length * 7,
    actualBoundingBoxLeft: text ? bearing : 0,
    actualBoundingBoxRight: text.length * 7,
    actualBoundingBoxAscent: text.length > 7 ? 30 : 5,
    actualBoundingBoxDescent: 4,
    fontBoundingBoxAscent: 9,
    fontBoundingBoxDescent: 7,
  };
}
function canvas(bearing) {
  let clip = null;
  const stack = [],
    drawn = [];
  return {
    drawn,
    save() {
      stack.push(clip);
    },
    restore() {
      clip = stack.pop();
    },
    beginPath() {},
    rect(x, y, width, height) {
      this.path = { x, y, width, height };
    },
    clip() {
      const p = this.path;
      if (!clip) clip = p;
      else {
        const x = Math.max(clip.x, p.x),
          y = Math.max(clip.y, p.y);
        clip = {
          x,
          y,
          width: Math.min(clip.x + clip.width, p.x + p.width) - x,
          height: Math.min(clip.y + clip.height, p.y + p.height) - y,
        };
      }
    },
    fillRect() {},
    moveTo() {},
    lineTo() {},
    closePath() {},
    fill() {},
    measureText(text) {
      return metric(text, bearing);
    },
    fillText(text, x, y) {
      const m = this.measureText(text);
      drawn.push({
        text,
        x,
        y,
        clip: { ...clip },
        left: x - m.actualBoundingBoxLeft,
        right: x + m.actualBoundingBoxRight,
        top: y - m.actualBoundingBoxAscent,
        bottom: y + m.actualBoundingBoxDescent,
      });
    },
  };
}
function context(kind = 'combo_box', label = 'A'.repeat(18), width = 70) {
  return Object.freeze({
    kind,
    label,
    name: 'OwnItalic',
    font: 'italic 16px OwnFixture',
    fontHeight: 16,
    lineHeight: null,
    multiline: true,
    wordWrap: true,
    storedFrame: Object.freeze({ width, height: 20 }),
  });
}
function sized(c, bearing = 20) {
  let frame;
  createCanvasFormAutoSizer(canvas(bearing))({
    context: c,
    commit(value) {
      frame = value;
    },
  });
  return frame;
}
function painted(c, frame, bearing = 20) {
  const ctx = canvas(bearing);
  assert.equal(
    paintHwp5Form(
      ctx,
      {
        ...frame,
        label: c.label,
        font: c.font,
        multiline: true,
        wordWrap: true,
        form: { source: { kind: c.kind } },
      },
      10,
      20,
    ),
    true,
  );
  return ctx.drawn;
}
function assertVisible(rows, text) {
  assert.equal(rows.map((r) => r.text).join(''), text, 'no dropped rows/characters');
  for (const r of rows) {
    assert(r.left >= r.clip.x, 'left ink clipped');
    assert(r.right <= r.clip.x + r.clip.width, 'right ink clipped');
    assert(r.top >= r.clip.y, 'top ink clipped after rewrapping');
    assert(r.bottom <= r.clip.y + r.clip.height, 'bottom ink clipped');
  }
}
test('shifted combo paint uses its actual origin for fixed-width wrapping', () => {
  const c = context(),
    rows = painted(c, { width: 70, height: 90, lineHeight: 18, textOffset: 22 });
  assertVisible(rows, c.label);
  assert.deepEqual(
    rows.map((r) => r.text.length),
    [4, 4, 4, 4, 2],
  );
});
test('actual provider final width fits initial rows; painter does not regroup into taller clipped ink', () => {
  const c = context(),
    frame = sized(c);
  assert.equal(frame.textOffset, 22);
  assert.equal(frame.width, 87);
  assert.equal(frame.height, 54);
  // Independent clip arithmetic, intentionally not the helper under test.
  const initial = formTextLayout(c.label, {
    width: 51,
    wrap: true,
    measure: (s) => metric(s).width,
  });
  const finalAvailable = frame.width - frame.textOffset - 16;
  for (const row of initial.rows) assert(metric(row.text).width <= finalAvailable);
  const rows = painted(c, frame);
  assertVisible(rows, c.label);
  assert.deepEqual(
    rows.map((r) => r.text),
    initial.rows.map((r) => r.text),
  );
  assert.equal(rows.length * frame.lineHeight, frame.height);
  assert.equal(c.label, 'A'.repeat(18));
  assert.deepEqual(c.storedFrame, { width: 70, height: 20 });
});
test('shifted edit origin also reserves its actual right clip boundary', () => {
  const c = context('edit', 'A'.repeat(18), 70);
  const rows = painted(c, { width: 70, height: 54, lineHeight: 18, textOffset: 22 });
  assertVisible(rows, c.label);
  assert.deepEqual(
    rows.map((r) => r.text.length),
    [6, 6, 6],
  );
});
test('provider height does not clip taller ink introduced by different painter rows', () => {
  const c = context(),
    frame = sized(c),
    rows = painted(c, frame);
  for (const r of rows) {
    assert(r.top >= r.clip.y, 'paint-only longer row has taller ink than measured rows');
    assert(r.bottom <= r.clip.y + r.clip.height);
  }
  assert.equal(rows.length, frame.height / frame.lineHeight);
});
test('all characters remain inside both horizontal and vertical clipping', () => {
  const c = context(),
    rows = painted(c, sized(c));
  const fullyVisible = rows.filter(
    (r) =>
      r.left >= r.clip.x &&
      r.right <= r.clip.x + r.clip.width &&
      r.top >= r.clip.y &&
      r.bottom <= r.clip.y + r.clip.height,
  );
  assert.equal(fullyVisible.map((r) => r.text).join(''), c.label);
});
test('fractional bearings and CRLF preserve visible text and immutable source frame', () => {
  for (const bearing of [5, 12.5, 20, 40.25]) {
    const c = context('combo_box', 'A'.repeat(18) + '\r\nBBBB', 70);
    const before = structuredClone(c),
      frame = sized(c, bearing),
      rows = painted(c, frame, bearing);
    assertVisible(rows, c.label.replace('\r\n', ''));
    assert.equal(rows.length * frame.lineHeight, frame.height);
    assert.deepEqual(c, before);
  }
});
