import test from "node:test";
import assert from "node:assert/strict";
import { reserveTableVerticalFlow } from "../../web/preview/table-vertical-flow-reservation.mjs";

test("page-relative alignment is fixed and cannot clamp to occupied flow", () => {
  const source = {
    geometry: { treat_as_character: false, vertical_offset: 1500 },
    vertical_relative: 1,
    vertical_alignment: 2,
    flow_with_text: true,
    allow_overlap: false,
  };
  const bounds = { anchorY: 400, occupiedBottom: 500, height: 80, pageTop: 100, pageBottom: 1000 };
  const original = structuredClone(source);
  assert.deepEqual(reserveTableVerticalFlow(source, bounds), {
    state: "reserved",
    requestedY: 900,
    y: 900,
    bottom: 980,
    gap: 400,
  });
  assert.equal(
    reserveTableVerticalFlow(source, { ...bounds, occupiedBottom: 901 }).state,
    "next-page",
  );
  const fresh = reserveTableVerticalFlow(source, {
    ...bounds,
    anchorY: 1100,
    occupiedBottom: 1100,
    pageTop: 1100,
    pageBottom: 2000,
  });
  assert.equal(fresh.y, 1900);
  assert.equal(fresh.bottom, 1980);
  assert.equal(
    reserveTableVerticalFlow({ ...source, vertical_alignment: 0 }, bounds).state,
    "next-page",
  );
  assert.equal(
    reserveTableVerticalFlow(
      { ...source, vertical_alignment: 1 },
      { ...bounds, occupiedBottom: 100 },
    ).y,
    530,
  );
  assert.equal(
    reserveTableVerticalFlow(
      { ...source, geometry: { ...source.geometry, vertical_offset: 0xffffffff } },
      bounds,
    ).error,
    "TablePageAnchorOverflow",
  );
  assert.equal(
    reserveTableVerticalFlow({ ...source, vertical_alignment: 3 }, bounds).error,
    "UnsupportedTableVerticalFlow",
  );
  assert.deepEqual(source, original);
});
