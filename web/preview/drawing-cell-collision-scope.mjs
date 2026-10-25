import { drawingPageAnchor } from "./drawing-page-anchor.mjs";
import { validateNestedTableOwnership } from "./nested-table-ownership.mjs";
import { nestedTableCollisionBoxes } from "./nested-table-collision-boxes.mjs";
import { sourceTableCellInsets } from "./table-source-insets.mjs";
import { tableCellReferenceBox } from "./table-cell-reference-box.mjs";

/** Ancestor tables contain the drawing; their nested siblings remain obstacles. */
export function drawingCellCollisionScope(drawing, content, layout, inventory) {
  const fail = error => ({ state: "unavailable", error });
  if (inventory?.state !== "collected" || !Array.isArray(inventory.footprints)) return fail("IncompleteDrawingCollisionScope");
  const selected = drawingPageAnchor(drawing, content.paragraphs, layout.rows);
  if (selected.state !== "selected") return selected;
  const owners = content.paragraphs.filter(p => p.section === drawing.section && p.paragraph === drawing.hostParagraph);
  if (owners.length !== 1) return fail("AmbiguousDrawingCollisionOwner");
  const page = layout.pages.find(page => page.ordinal === selected.host.pageOrdinal && page.section === drawing.section);
  if (!page) return fail("IncompleteDrawingCollisionScope");
  if (!owners[0].tableCell) return { state: "scoped", body: page.page, inventory };
  try {
    const index = validateNestedTableOwnership(content);
    const binding = owners[0].tableCell;
    const owner = index.tables.get(`${drawing.section}:${binding.tableNode}`);
    const cell = owner?.cells.find(cell => cell.listNode === binding.listNode);
    if (!cell || cell.paragraphs.filter(id => id === drawing.hostParagraph).length !== 1) return fail("AmbiguousDrawingCollisionOwner");
    if (selected.host.cellColumnOrdinal !== undefined) return fail("UnsupportedDrawingCellCollisionColumns");
    const boxes = layout.boxes?.filter(box => box.section === drawing.section && box.tableNode === owner.tableNode
      && box.listNode === cell.listNode && box.pageOrdinal === selected.host.pageOrdinal);
    if (boxes?.length !== 1) return fail("MissingDrawingCollisionCell");
    const body = tableCellReferenceBox(boxes[0], sourceTableCellInsets(owner, cell), {}, undefined);
    if (!body) return fail("MissingDrawingCollisionCell");
    const ancestors = new Set();
    let root = owner;
    while (true) {
      if (ancestors.has(root.tableNode)) return fail("AmbiguousDrawingCollisionOwner");
      ancestors.add(root.tableNode);
      if (root.parentTableNode == null) break;
      root = index.tables.get(`${drawing.section}:${root.parentTableNode}`);
      if (!root) return fail("AmbiguousDrawingCollisionOwner");
    }
    const children = content.tables.filter(table => {
      if (table.section !== drawing.section || table === root) return false;
      let parent = table;
      while (parent.parentTableNode != null) {
        parent = index.tables.get(`${drawing.section}:${parent.parentTableNode}`);
        if (parent === root) return true;
      }
      return false;
    });
    const nested = nestedTableCollisionBoxes(root, layout, content);
    if (nested.length !== children.length) return fail("IncompleteDrawingNestedCollisionScope");
    const footprints = inventory.footprints.filter(footprint => !(footprint.kind === "table"
      && footprint.section === drawing.section && ancestors.has(footprint.node)));
    for (const [i, table] of children.entries()) {
      if (ancestors.has(table.tableNode)) continue;
      if (footprints.some(f => f.kind === "table" && f.section === drawing.section && f.node === table.tableNode)) return fail("AmbiguousDrawingNestedCollisionScope");
      const { pageOrdinal, x, y, width, height } = nested[i];
      footprints.push({ kind: "table", section: drawing.section, node: table.tableNode, tableNode: table.tableNode,
        pageOrdinal, rectangle: { x, y, width, height } });
    }
    return { state: "scoped", body, inventory: { state: "collected", footprints }, ancestorTableNodes: [...ancestors],
      cellOwner: { section: drawing.section, tableNode: owner.tableNode, listNode: cell.listNode, height: boxes[0].height } };
  } catch (error) { return fail(error.message); }
}
