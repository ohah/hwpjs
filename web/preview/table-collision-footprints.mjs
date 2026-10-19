import { tableInsets } from "./table-insets.mjs";
import { nestedTableCollisionBoxes } from "./nested-table-collision-boxes.mjs";
const boxValid = b => b && [b.x, b.y, b.width, b.height, b.x + b.width, b.y + b.height].every(Number.isFinite) && b.width > 0 && b.height > 0;

/** Final placed cell bounds, with explicit margins and complete cell identity. */
export function tableCollisionFootprints(table, layout, outerInsets, content = null) {
  const fail = error => ({ state: "unavailable", error });
  const margins = tableInsets(outerInsets);
  if (!margins || !table || !Number.isSafeInteger(table.section) || table.section < 0 || !Number.isSafeInteger(table.tableNode) || table.tableNode < 0
    || !Array.isArray(table.cells) || !table.cells.length || !Array.isArray(layout?.boxes)) return fail("InvalidTableCollisionFootprint");
  if (table.parentTableNode != null) return fail("UnsupportedTableCollisionOwnership");
  let childBounds = [];
  if (content) {
    try { childBounds = nestedTableCollisionBoxes(table, layout, content); }
    catch (error) { return fail(error.message); }
  } else if (layout.boxes.some(box => box?.section === table.section && box.positionOwnerTableNode === table.tableNode && box.tableNode !== table.tableNode)) return fail("UnsupportedTableCollisionOwnership");
  const expected = new Set(table.cells.map(cell => cell?.listNode));
  if (expected.size !== table.cells.length || [...expected].some(id => !Number.isSafeInteger(id) || id < 0)) return fail("InvalidTableCollisionFootprint");
  const groups = new Map(), seen = new Set();
  for (const box of layout.boxes.filter(b => b?.section === table.section && b.tableNode === table.tableNode)) {
    const reference = box.referenceBoxes?.column ?? (table.sourceGeometry?.vertical_relative === 0 ? box.referenceBoxes?.page : null);
    if (!boxValid(box) || !expected.has(box.listNode) || !Number.isSafeInteger(box.pageOrdinal) || box.pageOrdinal < 0 || !boxValid(reference)) return fail("IncompleteTableCollisionFootprint");
    const group = groups.get(box.pageOrdinal) ?? { boxes: [], column: reference, ids: new Set() };
    if (group.ids.has(box.listNode)) return fail("AmbiguousTableCollisionFootprint");
    if (["x", "y", "width", "height"].some(key => group.column[key] !== reference[key])) return fail("UnsupportedTableCollisionColumns");
    group.ids.add(box.listNode); group.boxes.push(box); seen.add(box.listNode); groups.set(box.pageOrdinal, group);
  }
  if (seen.size !== expected.size) return fail("IncompleteTableCollisionFootprint");
  for (const box of childBounds) {
    if (!boxValid(box) || !groups.has(box.pageOrdinal)) return fail("IncompleteNestedTableCollisionBoxes");
  }
  let caption = null;
  if (table.sourceCaption) {
    const matches = (layout.tableCaptionBounds ?? []).filter(c => c.section === table.section && c.tableNode === table.tableNode);
    if (matches.length !== 1 || groups.size !== 1 || !groups.has(matches[0].pageOrdinal)
      || matches[0].captionNode !== table.sourceCaption.caption_node || matches[0].listNode !== table.sourceCaption.list_node
      || !boxValid(matches[0].rectangle) || !boxValid(matches[0].bounds)) return fail("IncompleteTableCaptionCollisionFootprint");
    caption = matches[0];
  }
  const fragments = [...groups].sort(([a], [b]) => a - b), footprints = [];
  for (const [index, [pageOrdinal, group]] of fragments.entries()) {
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const box of group.boxes) {
      left = Math.min(left, box.x); top = Math.min(top, box.y);
      right = Math.max(right, box.x + box.width); bottom = Math.max(bottom, box.y + box.height);
    }
    left -= margins.left; top -= index === 0 ? margins.top : 0;
    right += margins.right; bottom += index === fragments.length - 1 ? margins.bottom : 0;
    for (const child of childBounds.filter(box => box.pageOrdinal === pageOrdinal)) {
      left = Math.min(left, child.x); top = Math.min(top, child.y);
      right = Math.max(right, child.x + child.width); bottom = Math.max(bottom, child.y + child.height);
    }
    if (caption) {
      left = Math.min(left, caption.bounds.x); top = Math.min(top, caption.bounds.y);
      right = Math.max(right, caption.bounds.x + caption.bounds.width); bottom = Math.max(bottom, caption.bounds.y + caption.bounds.height);
    }
    const rectangle = { x: left, y: top, width: right - left, height: bottom - top };
    if (!boxValid(rectangle)) return fail("InvalidTableCollisionFootprint");
    footprints.push({ section: table.section, tableNode: table.tableNode, pageOrdinal, rectangle });
  }
  return { state: "collected", footprints };
}
