import test from "node:test";
import assert from "node:assert/strict";
import { createChartPointTable } from "../../web/preview/chart-point-table.mjs";

class Element extends EventTarget {
  constructor(tag = "div") { super(); this.tag = tag; this.children = []; this.dataset = {}; this.style = {}; this.ownerDocument = { createElement: name => new Element(name) }; }
  append(...children) { for (const child of children) { child.parent = this; this.children.push(child); } }
  replaceChildren(...children) { for (const child of this.children) child.parent = null; this.children = []; this.append(...children); }
  contains(child) { for (let node = child; node; node = node.parent) if (node === this) return true; return false; }
  closest() { return this.tag === "button" ? this : this.parent?.closest(); }
}
const click = (body, target) => { const event = new Event("click"); Object.defineProperty(event, "target", { value: target }); body.dispatchEvent(event); };

test("chart table paginates all canonical values and selection never writes a draft", () => {
  const body = new Element(), previous = new Element(), next = new Element(), note = new Element();
  let chart = { values: { points: Array.from({ length: 130 }, (_, index) => ({ index, kind: index === 64 ? "string_cache" : "numeric_cache", value: index === 0 ? "<img>\r\n\t😀" : String(index) })) } };
  let ready = true;
  const selected = [];
  const table = createChartPointTable({ body, previous, next, note, getChart: () => chart, accepts: kind => kind === "numeric_cache", ready: () => ready, select: index => selected.push(index) });
  table.refresh();
  assert.equal(body.children.length, 64);
  assert.equal(body.children[0].children[1].textContent, "<img>\r\n\t😀");
  assert.equal(body.children[0].children[1].style.whiteSpace, "pre-wrap");
  assert.equal(previous.disabled, true);
  assert.match(note.textContent, /1\/3쪽.*130/);
  const first = body.children[0].children[0].children[0];
  click(body, first); assert.deepEqual(selected, [0]);
  next.dispatchEvent(new Event("click"));
  assert.equal(body.children.length, 64);
  assert.equal(body.children[0].children[0].children[0].disabled, true);
  click(body, first); assert.deepEqual(selected, [0], "detached old rows must not select a current point");
  next.dispatchEvent(new Event("click"));
  assert.equal(body.children.length, 2);
  assert.equal(next.disabled, true);
  table.reveal(65);
  const target = body.children[1].children[0].children[0];
  click(body, target); assert.deepEqual(selected, [0, 65]);
  for (const invalid of ["", "-1", "0.5", "1e0", "130", "9007199254740992"]) { target.dataset.chartPoint = invalid; click(body, target); }
  assert.deepEqual(selected, [0, 65]);
  ready = false; table.refresh();
  assert.equal(previous.disabled, true); assert.equal(next.disabled, true);
  assert.ok(body.children.every(row => row.children[0].children[0].disabled));
  chart = { values: { points: [{ kind: "numeric_cache", index: 0, value: "new current value" }] } };
  ready = true; table.refresh();
  assert.equal(body.children[0].children[1].textContent, "new current value");
  assert.equal(chart.values.points[0].value, "new current value");
  table.close(); table.close();
  assert.equal(body.children.length, 0);
  click(body, target); next.dispatchEvent(new Event("click"));
  assert.deepEqual(selected, [0, 65]);
});
