import test from "node:test";
import assert from "node:assert/strict";
import { hwp5TableWindowDependencies } from "../../web/preview/hwp5-table-window-dependencies.mjs";
import { planParagraphDependencies } from "../../web/preview/paragraph-dependency-plan.mjs";
import { projectHwp5TableWindow } from "../../web/preview/hwp5-table-window-projection.mjs";

const projection = { sections: [{ index: 0, paragraphs: [{}, {}, {}, {}] }] };
const placements = [
  { tableNode: 7, paragraph: 0, parentTableNode: null, parentListNode: null },
  { tableNode: 9, paragraph: 2, parentTableNode: 7, parentListNode: 8 },
];
const bindings = [
  { tableNode: 7, listNode: 8, paragraph: 1 },
  { tableNode: 7, listNode: 8, paragraph: 2 },
  { tableNode: 9, listNode: 10, paragraph: 3 },
];
const editor = (p = placements, b = bindings) => ({
  tablePlacements: () => p,
  tableBindings: () => b,
});

test("table window adapter closes nested owners and representative cells without changing inputs", () => {
  const before = structuredClone({ projection, placements, bindings });
  const found = hwp5TableWindowDependencies(editor(), projection);
  assert.deepEqual(
    planParagraphDependencies({ ...found, offset: 3, count: 1, maxParagraphs: 4 }).ordinals,
    [0, 1, 2, 3],
  );
  assert.deepEqual({ projection, placements, bindings }, before);
});

test("table slice distinguishes read-only ownership context and refuses clipped complete text", () => {
  const source = {
    version: [5, 0, 0, 0],
    sections: [
      {
        index: 0,
        paragraphs: ["owner", "cell", "nested", "selected😀"].map((text) => ({
          text,
          textPresent: true,
          declaredUnits: text.length + 1,
          parentNodeIndex: null,
          tokens: [],
        })),
      },
    ],
  };
  const before = structuredClone(source);
  const content = projectHwp5TableWindow(editor(), source, {
    offset: 3,
    count: 1,
    maxParagraphs: 4,
  });
  assert.deepEqual(
    content.paragraphs.map((p) => [p.paragraph, p.windowContext, p.editable]),
    [
      [0, true, false],
      [1, true, false],
      [2, true, false],
      [3, false, true],
    ],
  );
  assert.equal(content.window.contextCount, 3);
  assert.deepEqual(source, before);
  assert.throws(
    () => projectHwp5TableWindow(editor(), source, { offset: 3, count: 1, maxParagraphs: 3 }),
    /ParagraphWindowBudgetExceeded/,
  );
  assert.throws(
    () => projectHwp5TableWindow(editor(), source, { offset: 3, count: 1, maxUnits: 1 }),
    /ParagraphWindowTextBudgetExceeded/,
  );
  assert.throws(
    () =>
      projectHwp5TableWindow(
        {
          tableBindings() {
            assert.fail("invalid request queried native source");
          },
        },
        source,
        { offset: -1, count: 1 },
      ),
    /InvalidParagraphWindow/,
  );
});

test("table window adapter refuses ambiguous orphan and cyclic ownership", () => {
  for (const p of [
    [...placements, placements[0]],
    [placements[1]],
    [{ ...placements[0], paragraph: 99 }],
    [{ ...placements[0], parentListNode: 8 }, placements[1]],
    [placements[0], { ...placements[1], parentListNode: 99 }],
  ])
    assert.throws(
      () => hwp5TableWindowDependencies(editor(p), projection),
      /WindowDependencyBindingMismatch/,
    );
  assert.throws(
    () => hwp5TableWindowDependencies(editor(placements, [...bindings, bindings[0]]), projection),
    /WindowDependencyBindingMismatch/,
  );
  const cyclic = [
    { tableNode: 7, paragraph: 2, parentTableNode: 9, parentListNode: 10 },
    { tableNode: 9, paragraph: 1, parentTableNode: 7, parentListNode: 8 },
  ];
  assert.throws(
    () =>
      hwp5TableWindowDependencies(
        editor(cyclic, [
          { tableNode: 7, listNode: 8, paragraph: 1 },
          { tableNode: 9, listNode: 10, paragraph: 2 },
        ]),
        projection,
      ),
    /WindowDependencyOwnershipCycle/,
  );
});
