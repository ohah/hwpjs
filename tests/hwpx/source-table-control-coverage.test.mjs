import test from "node:test";
import assert from "node:assert/strict";
import { sourceTableControlCoverage } from "../../web/preview/source-table-control-coverage.mjs";
import { pageParagraphCoverage } from "../../web/preview/page-paragraph-coverage.mjs";
import { layoutTableBodyContent } from "../../web/preview/table-body-content-layout.mjs";

const content = { paragraphs: [{ section: 0, paragraph: 1, text: "앞\ufffc뒤" }], tables: [{ section: 0, tableNode: 9, hostParagraph: 1, anchorUnit: 1, cells: [{ listNode: 5 }, { listNode: 6 }] }] };
const layout = { tableAnchors: [{ section: 0, tableNode: 9, hostParagraph: 1, anchorUnit: 1 }], boxes: [5, 6].map(listNode => ({ section: 0, tableNode: 9, listNode })) };

test("source body measurement rejects non-function injection before inspecting source state", () => {
  assert.equal(layoutTableBodyContent({}, () => 8, 100, { measureBodyParagraph: 1 }).error, "InvalidTableBodyMeasurement");
});

test("source cell representation verifies only its original control unit and cannot hide missing text", () => {
  const before = structuredClone({ content, layout });
  const verified = sourceTableControlCoverage(content, layout, []);
  assert.equal(verified.state, "verified");
  assert.deepEqual(verified.rows, [{ kind: "text", section: 0, paragraph: 1, startUnit: 1, endUnit: 2, text: "\ufffc" }]);
  assert.equal(pageParagraphCoverage(content.paragraphs, verified.rows).state, "unavailable");
  const textRows = [{ kind: "text", section: 0, paragraph: 1, startUnit: 0, endUnit: 1, text: "앞" }, { kind: "text", section: 0, paragraph: 1, startUnit: 2, endUnit: 3, text: "뒤" }];
  assert.equal(pageParagraphCoverage(content.paragraphs, [...textRows, ...verified.rows]).state, "complete");
  assert.deepEqual(sourceTableControlCoverage(content, layout, [{ kind: "text", section: 0, paragraph: 1, startUnit: 0, endUnit: 3, text: "앞\ufffc뒤" }]).rows, []);
  assert.deepEqual({ content, layout }, before);
});

test("missing cells foreign owners duplicate controls and incomplete anchors cannot grant coverage", () => {
  for (const patch of [{ boxes: [] }, { boxes: layout.boxes.slice(0, 1) }, { tableAnchors: [...layout.tableAnchors, ...layout.tableAnchors] },
    { tableAnchors: [null] }, { tableAnchors: [{ ...layout.tableAnchors[0], section: 1 }] }, { tableAnchors: [{ ...layout.tableAnchors[0], anchorUnit: 0 }] },
    { tableAnchors: [{ ...layout.tableAnchors[0], tableNode: 8 }] }]) {
    assert.equal(sourceTableControlCoverage(content, { ...layout, ...patch }, []).error, "IncompleteSourceTableControlCoverage");
  }
  assert.equal(sourceTableControlCoverage({}, layout, []).state, "unavailable");
});
