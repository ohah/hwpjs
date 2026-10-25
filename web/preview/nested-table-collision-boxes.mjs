import { validateNestedTableOwnership } from "./nested-table-ownership.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";
import { createdTableIdentity } from "../../js/created-table-identity.mjs";

export function nestedTableCollisionBoxes(root, layout, content) {
  const validated = validateNestedTableOwnership(content);
  if (validated.tables.get(`${root.section}:${root.tableNode}`) !== root) throw new Error("InvalidNestedTableCollisionOwner");
  const children = new Map();
  for (const table of content.tables) {
    if (table.section !== root.section || table === root) continue;
    let parent = table;
    while (parent.parentTableNode != null) {
      parent = validated.tables.get(`${table.section}:${parent.parentTableNode}`);
      if (parent === root) { children.set(table.tableNode, table); break; }
    }
  }
  const bounds = [];
  const generatedSeen = new Set();
  const generatedOwner = box => {
    if (box.tableNode !== undefined || box.listNode !== undefined) return false;
    const cell = box.createdCell;
    try { createdTableIdentity(cell?.identity); } catch { return false; }
    if (![cell.row,cell.column].every(value=>Number.isSafeInteger(value)&&value>=0&&value<=0xffffffff)) return false;
    const tables = (content.createdTables ?? []).filter(table=>table.section===box.section&&table.identity===cell.identity);
    const key = `${box.section}:${cell.identity}:${cell.row}:${cell.column}`;
    if (generatedSeen.has(key) || tables.length!==1 || !tables[0].cells.some(value=>value.row===cell.row&&value.column===cell.column)) return false;
    generatedSeen.add(key);
    return true;
  };
  for (const table of children.values()) {
    if (!Number.isSafeInteger(table.tableNode) || table.tableNode < 0 || !table.cells.length
      || table.cells.some(c => !Number.isSafeInteger(c.listNode) || c.listNode < 0)) throw new Error("InvalidNestedTableCollisionOwner");
    const captions = table.sourceCaption ? (layout.tableCaptionBounds ?? []).filter(bound => bound.section === table.section
      && bound.tableNode === table.tableNode && bound.captionNode === table.sourceCaption.caption_node && bound.listNode === table.sourceCaption.list_node) : [];
    if (table.sourceCaption && captions.length !== 1) throw new Error("UnsupportedNestedTableCaptionCollision");
    const margins = table.sourceGeometry?.out_margin;
    if (!Array.isArray(margins) || margins.length !== 4 || !margins.every(v => Number.isInteger(v) && v >= 0 && v <= 0xffffffff)) throw new Error("MissingNestedTableCollisionMargins");
    const expected = new Set(table.cells.map(c => c.listNode)), seen = new Set(), groups = new Map();
    for (const box of layout.boxes.filter(b => b?.section === root.section && b.tableNode === table.tableNode)) {
      if (!expected.has(box.listNode) || box.positionOwnerTableNode !== root.tableNode || box.pageClip !== undefined
        || !Number.isSafeInteger(box.pageOrdinal) || box.pageOrdinal < 0 || ![box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(Number.isFinite)
        || box.width <= 0 || box.height <= 0) throw new Error("IncompleteNestedTableCollisionBoxes");
      const group = groups.get(box.pageOrdinal) ?? { boxes: [], ids: new Set() };
      if (group.ids.has(box.listNode)) throw new Error("AmbiguousNestedTableCollisionBoxes");
      group.ids.add(box.listNode); group.boxes.push(box); groups.set(box.pageOrdinal, group); seen.add(box.listNode);
    }
    if (seen.size !== expected.size) throw new Error("IncompleteNestedTableCollisionBoxes");
    if (groups.size !== 1) throw new Error("UnsupportedSplitNestedTableCollision");
    const [leftMargin, rightMargin, topMargin, bottomMargin] = margins.map(hwpUnitPixels);
    for (const [pageOrdinal, group] of groups) {
      let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
      for (const box of group.boxes) { left = Math.min(left, box.x); top = Math.min(top, box.y); right = Math.max(right, box.x + box.width); bottom = Math.max(bottom, box.y + box.height); }
      left -= leftMargin; top -= topMargin; right += rightMargin; bottom += bottomMargin;
      if (captions.length) {
        const caption = captions[0], extent = caption.bounds;
        if (caption.pageOrdinal !== pageOrdinal || caption.positionOwnerTableNode !== root.tableNode
          || !extent || ![extent.x, extent.y, extent.width, extent.height, extent.x + extent.width, extent.y + extent.height].every(Number.isFinite)
          || extent.width <= 0 || extent.height <= 0) throw new Error("UnsupportedNestedTableCaptionCollision");
        left = Math.min(left, extent.x); top = Math.min(top, extent.y);
        right = Math.max(right, extent.x + extent.width); bottom = Math.max(bottom, extent.y + extent.height);
      }
      bounds.push({ pageOrdinal, x: left, y: top, width: right - left, height: bottom - top });
    }
  }
  if (layout.boxes.some(b => b?.section === root.section && b.positionOwnerTableNode === root.tableNode && b.tableNode !== root.tableNode && !children.has(b.tableNode)
    && !generatedOwner(b))) throw new Error("InvalidNestedTableCollisionOwner");
  return bounds;
}
