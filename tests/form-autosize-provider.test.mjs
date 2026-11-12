import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvasFormAutoSizer } from '../web/preview/form-autosize-provider.mjs';
const context = (extra = {}) => ({
  kind: 'edit',
  label: 'AV ffi 한글',
  name: 'F4',
  font: '16px Test',
  fontHeight: 16,
  lineHeight: null,
  multiline: false,
  wordWrap: false,
  storedFrame: { width: 70, height: 20 },
  ...extra,
});
function canvas(metric) {
  const calls = [];
  let saves = 0;
  return {
    calls,
    get saves() {
      return saves;
    },
    save() {
      saves++;
    },
    restore() {
      saves--;
    },
    measureText(s) {
      calls.push(s);
      return metric(s);
    },
  };
}
const metrics = (s) => ({
  width: s === 'ffi' ? 4 : s.length * 7,
  actualBoundingBoxLeft: 0,
  actualBoundingBoxRight: s === 'ffi' ? 4 : s.length * 7,
  actualBoundingBoxAscent: 5,
  actualBoundingBoxDescent: 4,
  fontBoundingBoxAscent: 9,
  fontBoundingBoxDescent: 7,
});
function run(ctx, c) {
  let frame;
  createCanvasFormAutoSizer(ctx)({ context: c, commit: (x) => (frame = x) });
  return frame;
}
test('full-string shaping is preserved instead of summing character widths', () => {
  const ctx = canvas(metrics),
    f = run(ctx, context({ label: 'ffi' }));
  assert.equal(f.width, 9);
  assert(ctx.calls.includes('ffi'));
  assert.equal(ctx.calls.includes('f'), false);
  assert.equal(f.height, 18);
  assert.equal(ctx.saves, 0);
});
test('real font bounding box controls height; missing metrics reject without height fallback', () => {
  const ctx = canvas((s) => ({ ...metrics(s), fontBoundingBoxAscent: 17 }));
  assert.equal(run(ctx, context()).height, 34);
  const missing = canvas((s) => ({ ...metrics(s), fontBoundingBoxDescent: undefined }));
  assert.throws(() => run(missing, context()), /Unsupported/);
  assert.equal(missing.saves, 0);
});
test('CRLF, LF and CR affect view rows but never mutate the Native raw label', () => {
  for (const label of ['A\r\nB', 'A\nB', 'A\rB']) {
    const c = context({ label, multiline: true, lineHeight: 16 });
    assert.equal(run(canvas(metrics), c).height, 36);
    assert.equal(c.label, label);
  }
});
test('empty Text uses current Name for measurement without changing value', () => {
  const c = context({ label: '', name: 'FormName' }),
    ctx = canvas(metrics);
  assert.equal(run(ctx, c).width, 61);
  assert.equal(c.label, '');
  assert(ctx.calls.includes('FormName'));
});
test('source wrap width constrains shaping; source geometry stays immutable', () => {
  const c = context({ label: 'AAAA BBBB CCCC', multiline: true, wordWrap: true, lineHeight: 16 }),
    source = structuredClone(c.storedFrame),
    f = run(canvas(metrics), c);
  assert(f.height > 18);
  assert(f.width >= source.width);
  assert.deepEqual(c.storedFrame, source);
});
test('choice and combo share existing painter space; unknown kind never gets guessed', () => {
  assert.equal(run(canvas(metrics), context({ kind: 'check_box', label: 'ffi' })).width, 24);
  assert.equal(run(canvas(metrics), context({ kind: 'combo_box', label: 'ffi' })).width, 23);
  assert.throws(() => run(canvas(metrics), context({ kind: 'future' })), /Unsupported/);
});
test('italic left overhang shifts paint origin rather than clipping or discarding the bearing', () => {
  const f = run(
    canvas((s) => ({ ...metrics(s), actualBoundingBoxLeft: 5 })),
    context({ label: 'ffi' }),
  );
  assert.equal(f.textOffset, 7);
  assert.equal(f.width, 13);
});

test('unknown fallback name is refused without an invented empty-field size', () => {
  assert.throws(
    () => run(canvas(metrics), context({ label: '', name: null })),
    /UnknownFormAutoSizeName/,
  );
});
