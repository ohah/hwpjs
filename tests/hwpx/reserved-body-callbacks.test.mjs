import test from "node:test";
import assert from "node:assert/strict";
import { createReservedBodyCallbacks } from "../../web/preview/reserved-body-callbacks.mjs";

const context = { y: 20, pageOrdinal: 0, column: { x: 20, y: 20, width: 200, height: 300 } };
const source = { kind: "text", section: 0, paragraph: 1, startUnit: 0, endUnit: 4, height: 28,
  paragraphSource: { section: 0, paragraph: 1, text: "abcd" } };
const measure = text => ({ width: text.length * 8, height: 20 });

test("shared reservation callbacks measure the source's actual right-hand square region", () => {
  const reservations = [{ section: 0, pageOrdinal: 0, rectangle: { x: 20, y: 20, width: 40, height: 40 },
    flow: { textWrap: 0, textFlow: 2, outsideMargins: [0, 0, 0, 0] } }];
  const before = structuredClone({ source, reservations, context });
  const callbacks = createReservedBodyCallbacks(reservations, measure);
  assert.equal(callbacks.state, "ready");
  assert.equal(callbacks.rowY(source, context), 20);
  const measured = callbacks.measurePositionedRow(source, source, context);
  assert.equal(measured.positionedFragments[0].paragraphX, 40);
  assert.equal(measured.endUnit, 4);
  assert.equal(callbacks.failure(), undefined);
  assert.deepEqual({ source, reservations, context }, before);
});

test("shared callbacks preserve opaque table bands and compose outer vertical advancement", () => {
  const callbacks = createReservedBodyCallbacks([], measure, { rowY: (_row, context) => context.y + 5 });
  const band = { kind: "gap", height: 50, tableIndex: 0 };
  assert.equal(callbacks.rowY(band, context), 25);
  assert.equal(callbacks.measurePositionedRow(band, band, context), band);
});

test("shared callbacks retain bounded failure without leaking it to a later request", () => {
  const bad = createReservedBodyCallbacks([], measure, { rowY: (_row, context) => context.y - 1 });
  assert.ok(Number.isNaN(bad.rowY(source, context)));
  assert.equal(bad.failure(), "InvalidReservedPictureAdvance");
  const next = createReservedBodyCallbacks([], measure);
  assert.equal(next.rowY(source, context), 20);
  assert.equal(next.failure(), undefined);
  const unstable = createReservedBodyCallbacks([], measure, { maxIterations: 2, rowY: (_row, c) => c.y + 1 });
  assert.ok(Number.isNaN(unstable.rowY(source, context)));
  assert.equal(unstable.failure(), "ReservedPictureAdvanceLimit");
});

test("shared callbacks reject invalid bounds and callback types before measurement", () => {
  for (const options of [{ maxIterations: 0 }, { maxIterations: 1001 }, { maxIterations: NaN }, { rowY: 1 }])
    assert.equal(createReservedBodyCallbacks([], measure, options).state, "unavailable");
  assert.equal(createReservedBodyCallbacks(null, measure).state, "unavailable");
  assert.equal(createReservedBodyCallbacks([], null).state, "unavailable");
});
