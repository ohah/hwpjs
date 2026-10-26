import assert from "node:assert/strict";
import { partitionPageAreaOwnership } from "../../web/preview/page-area-ownership.mjs";
export const root = (section, componentNode, hostParagraph) => ({
  section,
  componentNode,
  controlNode: componentNode - 1,
  hostParagraph,
  source: { kind_id: 0x24726563 },
});
export const flow = (section, paragraph, host = "body") => ({
  section,
  paragraph,
  host,
  ...(["header", "footer"].includes(host)
    ? {
        page_area: {
          owner_node: 70,
          list_node: 71,
          apply: "both",
          width: 100,
          height: 20,
          vertical_alignment: 0,
        },
      }
    : {}),
});
export const partitionUnchanged = (content) => {
  const before = structuredClone(content);
  const result = partitionPageAreaOwnership(content);
  assert.deepEqual(
    content,
    before,
    "partition must not mutate raw or derived sources on success or failure",
  );
  return result;
};
export const ids = (roots) => roots.map((r) => `${r.section}:${r.componentNode}`);
export const assertConserved = (content, partition) => {
  const selected = [partition.body, ...partition.areas].flatMap((scope) => scope.hwp5Drawings);
  assert.equal(selected.length, content.hwp5Drawings.length);
  assert.equal(new Set(selected).size, selected.length, "each original root has exactly one owner");
  for (const original of content.hwp5Drawings)
    assert(selected.includes(original), "retain borrowed source identity");
};

export const nestedContent = () => ({
  paragraphs: [
    { section: 0, paragraph: 0, text: "\ufffc" },
    { section: 0, paragraph: 1, text: "\ufffc", tableCell: { tableNode: 100, listNode: 101 } },
    { section: 0, paragraph: 2, text: "\ufffc", drawingText: { drawingNode: 200, listNode: 201 } },
  ],
  paragraphFlows: [flow(0, 0, "header"), flow(0, 1, "table_cell"), flow(0, 2, "drawing")],
  tables: [
    { section: 0, tableNode: 100, hostParagraph: 0, cells: [{ listNode: 101, paragraphs: [1] }] },
  ],
  drawings: [
    { section: 0, drawingNode: 200, hostParagraph: 1, source: { text: { list_node: 201 } } },
  ],
  pictures: [{ section: 0, pictureNode: 300, paragraph: 2 }],
  hwp5Drawings: [root(0, 200, 1), { ...root(0, 300, 2), source: { kind_id: 0x24706963 } }],
});
