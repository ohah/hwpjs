import test from "node:test";
import assert from "node:assert/strict";
import { measureCreatedTableHost } from "../../web/preview/created-table-host-measurement.mjs";
import { caretGeometry, hitText } from "../../web/preview/text-geometry.mjs";

const source = { section: 0, paragraph: 1, text: "A😀BC", editable: true, characterRanges: [{ start: 0, end: 1, charShapeId: 2 }, { start: 1, end: 5, charShapeId: 7 }] };
const entry = (identity, anchorUnit) => ({ table: { section: 0, hostParagraph: 1, identity, anchorUnit }, width: 32, height: 40 });
const entries = [entry("1", 1), entry("2", 4)];

test("generated host measurement uses original style units and restores source-only caret rows", () => {
  const calls = [], before = structuredClone({ source, entries });
  const result = measureCreatedTableHost(source, entries, 500, (text, paragraph, unit) => {
    assert.equal(paragraph, source);
    calls.push([text, unit]);
    return { width: [...text].length * (unit < 1 ? 8 : 12), height: 16 };
  });
  assert.equal(result.state, "measured", result.error);
  assert.equal(result.rows.map(row => row.text).join(""), source.text);
  assert(result.rows.every(row => !row.text.includes("\ufffc")));
  assert.deepEqual(result.anchors.map(anchor => anchor.unit), [1, 4]);
  assert(calls.some(([text, unit]) => text === "😀" && unit === 1));
  assert(calls.some(([text, unit]) => text === "C" && unit === 4));
  const emoji = result.rows.find(row => row.text.includes("😀"));
  assert.deepEqual(emoji.boundaries.map(point => point.unit), [1, 3, 4]);
  assert.equal(hitText(result, emoji.x + 1, emoji.y + 1).unit, 1);
  assert(caretGeometry(result, { section: 0, paragraph: 1, unit: 3 }));
  assert.deepEqual({ source, entries }, before);
});

test("generated host measurement retains wrapped newline and empty-host carets and enforces total rows", () => {
  const measure = text => ({ width: [...text].length * 8, height: 16 });
  const wrapped = measureCreatedTableHost({ ...source, text: "A😀B\n" }, [entry("1", 1)], 42, measure);
  assert.equal(wrapped.state, "measured", wrapped.error);
  assert.equal(wrapped.rows.map(row => row.text).join(""), "A😀B\n");
  assert.equal(wrapped.rows.at(-1).startUnit, 5);
  assert.equal(wrapped.rows.at(-1).text, "");
  const empty = measureCreatedTableHost({ ...source, text: "" }, [entry("1", 0), entry("2", 0)], 500, measure);
  assert.equal(empty.state, "measured", empty.error);
  assert.equal(empty.rows.length, 1);
  assert.equal(empty.rows[0].startUnit, 0);
  assert.equal(empty.rows[0].text, "");
  assert.equal(measureCreatedTableHost(source, entries, 500, measure, { maxRows: 2 }).error, "CreatedTableHostProjectionLimit");
  assert.equal(measureCreatedTableHost({ ...source, text: "A\ufffcB" }, [entry("1", 1)], 500, measure).error, "UnsupportedCreatedTableHostControls");
});

test("generated host measurement restores window offsets and same-anchor cursor affinity", () => {
  const window = { ...source, textStartUnit: 10 };
  const values = [entry("1", 11), entry("2", 11)];
  const result = measureCreatedTableHost(window, values, 500, (text, paragraph, unit) => {
    assert.equal(paragraph, window);
    assert(unit >= 10 && unit <= 15);
    return { width: [...text].length * 8, height: 16 };
  });
  assert.equal(result.state, "measured", result.error);
  assert.equal(result.rows[0].startUnit, 10);
  assert.equal(result.rows.at(-1).endUnit, 15);
  assert.deepEqual(result.anchors.map(anchor => anchor.unit), [11, 11]);
  const before = caretGeometry(result, { section: 0, paragraph: 1, unit: 11, affinity: "backward" });
  const after = caretGeometry(result, { section: 0, paragraph: 1, unit: 11, affinity: "forward" });
  assert.equal(after.x - before.x, 64);
});
