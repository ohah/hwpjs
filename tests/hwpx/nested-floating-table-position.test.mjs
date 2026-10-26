import test from "node:test";
import assert from "node:assert/strict";
import { positionNestedFloatingTable } from "../../web/preview/nested-floating-table-position.mjs";

test("nested floating bottom alignment uses explicit paragraph rather than parent height", () => {
  const table = {
    section: 0,
    tableNode: 2,
    parentTableNode: 1,
    parentListNode: 11,
    hostParagraph: 3,
    sourceGeometry: {
      geometry: {
        treat_as_character: false,
        width: 1500,
        height: 7500,
        width_relative: 4,
        height_relative: 2,
        horizontal_offset: 0,
        vertical_offset: 0,
      },
      text_wrap: 2,
      vertical_relative: 2,
      horizontal_relative: 3,
      vertical_alignment: 2,
      horizontal_alignment: 0,
    },
  };
  const parent = { section: 0, tableNode: 1, listNode: 11, x: 50, y: 100, width: 200, height: 300 };
  const paragraph = { section: 0, paragraph: 3, x: 50, y: 200, width: 200, height: 16 };
  const paper = { x: 0, y: 0, width: 600, height: 800 };
  const original = structuredClone({ table, parent, paragraph });
  const result = positionNestedFloatingTable(table, parent, paragraph, { paper });
  assert.equal(result.state, "positioned");
  assert.equal(result.rectangle.y, 116);
  assert.equal(result.paintLayer, "behind");
  assert.equal(result.outsideParentCell, false);
  const high = positionNestedFloatingTable(table, parent, { ...paragraph, y: 150 }, { paper });
  assert.equal(high.rectangle.y, 66);
  assert.equal(
    high.outsideParentCell,
    true,
    "do not clamp a legitimate paper-contained overlap to the cell",
  );
  assert.equal(
    positionNestedFloatingTable(table, parent, { ...paragraph, y: 20 }, { paper }).error,
    "NestedFloatingTablePaperOverflow",
  );
  assert.equal(
    positionNestedFloatingTable(table, { ...parent, listNode: 99 }, paragraph, { paper }).error,
    "InvalidNestedFloatingTableOwner",
  );
  assert.equal(
    positionNestedFloatingTable(table, parent, { ...paragraph, paragraph: 99 }, { paper }).error,
    "InvalidNestedFloatingTableOwner",
  );
  assert.equal(
    positionNestedFloatingTable(table, parent, { ...paragraph, height: NaN }, { paper }).error,
    "MissingNestedFloatingTableBounds",
  );
  assert.equal(
    positionNestedFloatingTable({ ...table, tableNode: "2" }, parent, paragraph, { paper }).error,
    "InvalidNestedFloatingTableOwner",
  );
  assert.equal(
    positionNestedFloatingTable(
      { ...table, parentTableNode: null },
      { ...parent, tableNode: null },
      paragraph,
      { paper },
    ).error,
    "InvalidNestedFloatingTableOwner",
  );
  assert.deepEqual({ table, parent, paragraph }, original);
});
