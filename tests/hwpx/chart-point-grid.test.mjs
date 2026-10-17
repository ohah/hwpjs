import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createHwpxEditor } from "../../js/hwpx-editor.mjs";
import { chartPointGridModel } from "../../web/preview/chart-point-grid-model.mjs";
import { createChartPointGrid } from "../../web/preview/chart-point-grid.mjs";
import { createChartControls } from "../../web/preview/chart-controls.mjs";

const point = (index, cache_node = 10, level_node = null) => ({ index, cache_node, level_node, kind: level_node === null ? "numeric_cache" : "multilevel_cache", value: String(index) });
const source = points => ({ values: { points }, bindings: points.map((p, ordinal) => ({ point: ordinal, plot_node: 2, series_node: 3, role_node: 4, role: "value" })) });
test("grid preserves sparse source indices duplicates distinct caches and levels without merging edit ordinals", () => {
  const chart = source([point(0xffffffff), point(7), point(7), point(7, 11), point(7, 10, 12)]), before = structuredClone(chart);
  const model = chartPointGridModel(chart);
  assert.deepEqual(model.rows.map(row => row.index), [7, 0xffffffff]);
  assert.equal(model.columns.length, 3);
  assert.deepEqual(model.rows[0].cells.get(0), [1, 2]);
  assert.deepEqual(model.rows[0].cells.get(1), [3]); assert.deepEqual(model.rows[0].cells.get(2), [4]);
  assert.deepEqual(model.locations.get(0), { index: 0xffffffff, column: 0, row: 1 });
  assert.deepEqual(chart, before);
  for (const index of [-1, 0.5, "7", 0x100000000, null]) assert.throws(() => chartPointGridModel(source([point(index)])), /InvalidChartGridPoint/);
  assert.throws(() => chartPointGridModel(source([, point(1)])), /InvalidChartGridPoint/);
  assert.throws(() => chartPointGridModel(source([point(1, -1)])), /InvalidChartGridPoint/);
});

class Element extends EventTarget {
  constructor(tag = "div") { super(); this.tag = tag; this.children = []; this.style = {}; this.dataset = {}; this.value = ""; this.attributes = new Map(); this.ownerDocument = { createElement: tag => new Element(tag) }; }
  append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
  replaceChildren(...children) { for (const child of this.children) child.parent = null; this.children = []; this.append(...children); this.value = children[0]?.value ?? ""; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name); }
  contains(child) { for (let node = child; node; node = node.parent) if (node === this) return true; return false; }
  closest(selector) { return this.tag === "button" && this.dataset.chartGridPoint !== undefined ? this : this.parent?.closest(selector); }
  focus() { this.focused = true; }
}
const click = (body, target) => { const event = new Event("click"); Object.defineProperty(event, "target", { value: target }); body.dispatchEvent(event); };
function gridElements() {
  return Object.fromEntries(["head", "body", "previousRows", "nextRows", "previousColumns", "nextColumns", "note"].map(key => [key, new Element()]));
}
test("grid paginates rows and columns reveals canonical selection and rejects busy stale forged and closed picks", () => {
  const elements = gridElements(), picks = [];
  let chart = source(Array.from({ length: 340 }, (_, i) => point(i % 34, 10 + Math.floor(i / 34)))), selected = 339, ready = true;
  const grid = createChartPointGrid({ ...elements, getChart: () => chart, getSelected: () => selected, accepts: () => true, ready: () => ready, select: ordinal => { picks.push(ordinal); } });
  grid.reveal();
  assert.equal(elements.head.children[0].children.length, 3);
  assert.equal(elements.body.children.length, 2);
  const button = elements.body.children[1].children[2].children[0];
  assert.equal(button.dataset.chartGridPoint, "339"); assert.equal(button.getAttribute("aria-current"), "true");
  click(elements.body, button); assert.deepEqual(picks, [339]);
  ready = false; grid.refresh(); click(elements.body, button); assert.deepEqual(picks, [339]);
  ready = true; grid.refresh(); click(elements.body, button); assert.deepEqual(picks, [339], "detached button is stale");
  const current = elements.body.children[1].children[2].children[0];
  for (const forged of ["-1", "0.5", "00", "Infinity", "999999"]) { current.dataset.chartGridPoint = forged; click(elements.body, current); }
  assert.deepEqual(picks, [339]);
  elements.previousRows.dispatchEvent(new Event("click")); elements.previousColumns.dispatchEvent(new Event("click"));
  assert.equal(elements.body.children.length, 32); assert.equal(elements.head.children[0].children.length, 9);
  chart = source([point(-1)]); grid.refresh(); assert.equal(elements.body.children.length, 0); assert.match(elements.note.textContent, /구성/);
  chart = source([point(7)]); selected = 0; grid.reveal(); assert.equal(elements.body.children.length, 1);
  grid.close(); click(elements.body, current); assert.equal(elements.body.children.length, 0); assert.deepEqual(picks, [339]);
});

test("grid selection uses the existing canonical form and never submits drafts or stale values", async t => {
  const form = new Element(), fields = new Element(), targets = new Element(), points = new Element(), input = new Element(), note = new Element(), nodes = gridElements(), kinds = new Element(); kinds.value = "points";
  const selectors = { "[data-chart-grid-body]": nodes.body, "[data-chart-grid-head]": nodes.head, "[data-chart-grid-previous-rows]": nodes.previousRows, "[data-chart-grid-next-rows]": nodes.nextRows,
    "[data-chart-grid-previous-columns]": nodes.previousColumns, "[data-chart-grid-next-columns]": nodes.nextColumns, "[data-chart-grid-page]": nodes.note };
  form.querySelector = selector => selectors[selector] ?? null;
  const requests = [], controls = createChartControls({ form, fields, targets, points, kinds, input, note, ready: () => true, request: message => { requests.push(message); return true; } });
  t.after(() => controls.close());
  controls.message({ kind: "enable", content: { chartEditAvailable: true, chartStringEditAvailable: true, chartSeriesTextEditAvailable: true, chartTargets: [{ section: 0, wrapper: 9 }] } });
  await Promise.resolve();
  const query = requests.shift(), chart = source([point(100), point(7)]), before = structuredClone(chart);
  controls.message({ ...query, chart });
  const button = nodes.body.children[0].children[1].children[0];
  click(nodes.body, button); assert.equal(points.value, "1"); assert.equal(input.value, "7"); assert.equal(requests.length, 0);
  input.value = "123.40"; input.dispatchEvent(new Event("input"));
  form.dispatchEvent(new Event("submit", { cancelable: true }));
  assert.deepEqual(requests.shift(), { kind: "chart-point", section: 0, wrapper: 9, point: 1, value: "123.40" });
  assert.deepEqual(chart, before);
  kinds.value = "series"; kinds.dispatchEvent(new Event("change"));
  assert.equal(requests.shift().kind, "chart-series-text"); assert.equal(nodes.body.children.length, 0);
  controls.message({ ...query, chart }); assert.equal(nodes.body.children.length, 0, "obsolete point reply cannot restore grid in series mode");
  controls.message({ kind: "load" }); click(nodes.body, button); assert.equal(requests.length, 0); assert.equal(nodes.body.children.length, 0);
});

test("grid addresses every native point on all 28 originals and follows edits and undo without changing saved bytes", async () => {
  assert(process.env.HWPJS_TEST_WASM, "explicit candidate required");
  const editor = await createHwpxEditor(readFileSync(process.env.HWPJS_TEST_WASM));
  const root = "reference/rhwp/samples/chart", paths = readdirSync(root, { recursive: true }).filter(path => path.endsWith(".hwpx")).sort();
  assert.equal(paths.length, 28);
  try {
    for (const path of paths) {
      const original = readFileSync(root + "/" + path); editor.open(original); editor.enableHistory();
      const wrapper = editor.chartNodes(0)[0], chart = editor.chartPoints(0, wrapper), model = chartPointGridModel(chart);
      const ordinals = model.rows.flatMap(row => [...row.cells.values()].flat()).sort((a, b) => a - b);
      assert.deepEqual(ordinals, chart.values.points.map((_, i) => i), path);
      for (const [ordinal, point] of chart.values.points.entries()) {
        const location = model.locations.get(ordinal), row = model.rows[location.row];
        assert.equal(row.index, point.index, path);
        assert(row.cells.get(location.column).includes(ordinal), path);
        for (const sibling of row.cells.get(location.column)) {
          assert.equal(chart.values.points[sibling].cache_node, point.cache_node, path);
          assert.equal(chart.values.points[sibling].level_node, point.level_node, path);
          assert.deepEqual(chart.bindings[sibling], { ...chart.bindings[ordinal], point: sibling }, path);
        }
      }
      const ordinal = chart.values.points.findIndex(p => ["numeric_cache", "numeric_literal"].includes(p.kind)); assert(ordinal >= 0);
      editor.setChartPoint(0, wrapper, ordinal, "314.159");
      const current = editor.chartPoints(0, wrapper), location = chartPointGridModel(current).locations.get(ordinal);
      assert.deepEqual(location, model.locations.get(ordinal)); assert.equal(current.values.points[ordinal].value, "314.159");
      editor.undo(); assert.deepEqual(editor.chartPoints(0, wrapper), chart); assert.deepEqual(Buffer.from(editor.save()), original);
      assert.deepEqual(readFileSync(root + "/" + path), original);
    }
  } finally { editor.close(); }
});
