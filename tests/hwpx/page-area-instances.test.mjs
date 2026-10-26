import test from "node:test";
import assert from "node:assert/strict";
import { layoutPageAreaInstances } from "../../web/preview/page-area-instance-layout.mjs";

function fixture() {
  const area = {
    section: 0,
    host: "footer",
    area: {
      owner_node: 10,
      list_node: 11,
      apply: "both",
      width: 7500,
      height: 3000,
      vertical_alignment: "top",
    },
    paragraphs: [{ section: 0, paragraph: 1, text: "footer" }],
    tables: [],
    drawings: [],
    pictures: [],
    lines: [],
    containers: [],
  };
  area.paragraphFlows = [{ section: 0, paragraph: 1, host: "footer", page_area: area.area }];
  const pages = [0, 1].map((ordinal) => ({
    section: 0,
    ordinal,
    number: ordinal + 1,
    paper: { x: 0, y: ordinal * 300, width: 200, height: 280 },
    page: { x: 20, y: ordinal * 300 + 20, width: 100, height: 180 },
    footer: { x: 20, y: ordinal * 300 + 200, width: 100, height: 40 },
  }));
  return { area, pages, partition: { state: "partitioned", areas: [area] } };
}
const measure = () => ({ width: 8, height: 16 });

test("area instances retain source owners and explicit physical page identities", () => {
  const f = fixture(),
    before = structuredClone(f);
  const result = layoutPageAreaInstances({}, f.partition, f.pages, measure, 100);
  assert.equal(result.state, "placed", result.error);
  assert.deepEqual(
    result.rows.map((row) => [row.paragraph, row.pageOrdinal, row.pageNumber, row.pageArea]),
    [
      [1, 0, 1, "footer"],
      [1, 1, 2, "footer"],
    ],
  );
  assert.deepEqual(f, before);
});

test("partial area output is never published after a later budget or ownership failure", () => {
  const f = fixture();
  const limited = layoutPageAreaInstances({}, f.partition, f.pages, measure, 1);
  assert.equal(limited.state, "unavailable");
  assert.equal(limited.rows, undefined);
  const duplicate = layoutPageAreaInstances(
    {},
    f.partition,
    [f.pages[0], f.pages[0]],
    measure,
    100,
  );
  assert.equal(duplicate.error, "AmbiguousPageAreaInstance");
  assert.equal(duplicate.rows, undefined);
  const missing = layoutPageAreaInstances(
    {},
    f.partition,
    [{ ...f.pages[0], section: -1 }],
    measure,
    100,
  );
  assert.equal(missing.error, "UnsupportedPageAreaSections");
});

test("unknown source objects cannot be replaced with successful text-only instances", () => {
  for (const property of ["lines", "containers", "drawings"]) {
    const f = fixture();
    f.area[property].push({ section: 0 });
    const before = structuredClone(f);
    const result = layoutPageAreaInstances({}, f.partition, f.pages, measure, 100);
    assert.equal(result.error, "UnsupportedPageAreaObjects");
    assert.equal(result.rows, undefined);
    assert.deepEqual(f, before);
  }
});
