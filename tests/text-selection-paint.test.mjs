import test from 'node:test';
import assert from 'node:assert/strict';
import { paintTextSelectionBackground } from '../web/preview/text-selection-paint.mjs';

function context(fail = false) {
  const calls = [];
  let saved;
  const ctx = {
    fillStyle: 'original',
    save() {
      saved = this.fillStyle;
    },
    restore() {
      this.fillStyle = saved;
    },
    fillRect(...args) {
      calls.push({ style: this.fillStyle, args });
      if (fail) throw Error('PaintFailure');
    },
  };
  return { ctx, calls };
}

test('selection blends with existing object ink and restores the caller paint state', () => {
  const { ctx, calls } = context();
  paintTextSelectionBackground(ctx, [{ x: 10, y: 30, width: 480, height: 290 }], 20);
  assert.deepEqual(calls[0].args, [10, 10, 480, 290]);
  const rgba = calls[0].style.match(/^rgba\((\d+), (\d+), (\d+), ([\d.]+)\)$/);
  assert(rgba);
  const rgb = rgba.slice(1, 4).map(Number),
    alpha = Number(rgba[4]);
  assert(alpha > 0 && alpha < 1);
  const composite = (background) =>
    background.map((v, i) => Math.round(rgb[i] * alpha + v * (1 - alpha)));
  assert.deepEqual(composite([255, 255, 255]), [186, 217, 244]);
  assert.notDeepEqual(composite([68, 114, 196]), composite([255, 255, 255]));
  assert.equal(ctx.fillStyle, 'original');
});

test('selection painting restores state even when Canvas rejects a rectangle', () => {
  const { ctx } = context(true);
  assert.throws(
    () => paintTextSelectionBackground(ctx, [{ x: 0, y: 0, width: 1, height: 1 }], 0),
    /PaintFailure/,
  );
  assert.equal(ctx.fillStyle, 'original');
});

test('an empty selection does not acquire or change Canvas state', () => {
  paintTextSelectionBackground(
    new Proxy(
      {},
      {
        get() {
          throw Error('UnexpectedCanvasUse');
        },
      },
    ),
    [],
    0,
  );
});
