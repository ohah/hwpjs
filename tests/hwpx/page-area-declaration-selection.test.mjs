import test from "node:test";
import assert from "node:assert/strict";
import { createPageAreaDeclarationSelection as prepare } from "../../web/preview/page-area-declaration-selection.mjs";
const group = (owner, host = "footer", apply = "both", section = 0) => ({ section, host, area: { owner_node: owner, list_node: owner + 1, apply } });
const declaration = (sourceElement, pageOrdinal, section = 0) => ({ section, sourceElement, pageOrdinal, paragraph: sourceElement, unit: 0 });
const binding = declarations => ({ state: "bound", declarations });
const page = (ordinal, number = ordinal + 1, section = 0) => ({ ordinal, number, section });
const selected = (selector, p) => selector.select(p).areas.map(row => row.area.owner_node);

test("declarations start on their bound page, persist and replace only their own kind", () => {
  const areas = [group(1, "header"), group(10), group(20)];
  const bound = binding([declaration(1, 0), declaration(10, 15), declaration(20, 16)]), before = structuredClone({ areas, bound });
  const selector = prepare(areas, bound); assert.equal(selector.state, "prepared");
  assert.deepEqual(selected(selector, page(0)), [1]);
  assert.deepEqual(selected(selector, page(14)), [1]);
  assert.deepEqual(selected(selector, page(15)), [1, 10]);
  assert.deepEqual(selected(selector, page(16)), [1, 20]);
  assert.deepEqual(selected(selector, page(19)), [1, 20]);
  assert.deepEqual({ areas, bound }, before);
  assert.deepEqual(selected(selector, page(0)), [1], "out of order queries do not mutate active state");
});

test("effective odd/even pages win over BOTH regardless of source arrival order", () => {
  const selector = prepare([group(10, "footer", "odd"), group(20), group(30, "footer", "even")],
    binding([declaration(10, 0), declaration(20, 1), declaration(30, 2)]));
  assert.deepEqual(selected(selector, page(1, 7)), [10]);
  assert.deepEqual(selected(selector, page(1, 8)), [20]);
  assert.deepEqual(selected(selector, page(2, 8)), [30]);
  assert.deepEqual(selected(selector, page(2, 9)), [10]);
  assert.deepEqual(selected(selector, { ...page(2, 9), hideFooter: true }), []);
});

test("same-page source order is deterministic and sections never inherit implicitly", () => {
  const selector = prepare([group(10), group(20), group(10, "footer", "both", 1)],
    binding([declaration(10, 0), declaration(20, 0), declaration(10, 2, 1)]));
  assert.deepEqual(selected(selector, page(0)), [20]);
  assert.deepEqual(selected(selector, page(1, 2, 1)), []);
  assert.deepEqual(selected(selector, page(2, 3, 1)), [10]);
});

test("missing or duplicate binding and invalid page values never select arbitrary owners", () => {
  assert.equal(prepare([group(1)], { state: "unavailable" }).state, "unavailable");
  assert.equal(prepare([group(1)], binding([])).error, "MissingPageAreaDeclaration");
  assert.equal(prepare([group(1), group(1)], binding([declaration(1, 0)])).error, "AmbiguousPageAreaDeclarationGroup");
  assert.equal(prepare([group(1)], binding([declaration(1, 0), declaration(1, 1)])).error, "AmbiguousPageAreaDeclarationGroup");
  const selector = prepare([group(1)], binding([declaration(1, 0)]));
  for (const bad of [null, page(-1), page(0, 0), page(0, 0x100000000)]) assert.equal(selector.select(bad).state, "unavailable");
});
