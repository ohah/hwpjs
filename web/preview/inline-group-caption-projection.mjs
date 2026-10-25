// Caption rows retain native paragraph identity. No source coordinates are rewritten.
export function groupCaptionParagraphKeys(roots, paragraphs) {
  const keys = new Set(), owners = new Map(), seen = new Set();
  for (const root of roots) {
    const key = `${root.section}:${root.containerNode}`;
    if (owners.has(key)) return null;
    owners.set(key, root);
    if ((root.source.has_caption === true) !== (root.source.caption != null)) return null;
  }
  for (const paragraph of paragraphs) {
    if (!paragraph.drawingCaption) continue;
    const binding = paragraph.drawingCaption, owner = owners.get(`${paragraph.section}:${binding.drawingNode}`);
    const key = `${paragraph.section}:${paragraph.paragraph}`;
    if (!owner?.source.caption || keys.has(key) || paragraph.drawingText || paragraph.tableCell || paragraph.tableCaption
      || binding.captionNode !== owner.source.caption.caption_node || binding.listNode !== owner.source.caption.list_node) return null;
    keys.add(key); seen.add(`${owner.section}:${owner.containerNode}`);
  }
  return roots.some(root => root.source.caption != null && !seen.has(`${root.section}:${root.containerNode}`)) ? null : keys;
}

export function projectInlineGroupCaption(root, object, placement, { maxRows = 20000 } = {}) {
  const fail = error => ({ state: "unavailable", error });
  if (!root?.source || !object || !placement) return fail("InlineGroupCaptionReservationMismatch");
  const reserved = object.captionReservation;
  if (!root.source.caption) return reserved ? fail("InlineGroupCaptionReservationMismatch") : { state: "placed", rows: [] };
  if (reserved?.state !== "reserved" || reserved.caption?.state !== "positioned" || object.objectNode !== root.containerNode
    || placement.objectNode !== root.containerNode || placement.section !== root.section || placement.paragraph !== root.hostParagraph
    || !Number.isSafeInteger(placement.pageOrdinal) || placement.pageOrdinal < 0
    || !Array.isArray(reserved.caption.rows) || reserved.caption.rows.length !== reserved.rowCount
    || reserved.width !== object.width || reserved.height !== object.height
    || reserved.outerInsets?.left !== object.left || reserved.outerInsets?.top !== object.top
    || placement.rectangle?.width !== object.width || placement.rectangle?.height !== object.height
    || !Number.isSafeInteger(maxRows) || maxRows < reserved.rowCount || maxRows < 1
    || ![placement.rectangle?.x, placement.rectangle?.y, object.left, object.top].every(Number.isFinite)) return fail("InlineGroupCaptionReservationMismatch");
  if (Array.from(reserved.caption.rows).some(row => !row || row.section !== root.section || row.drawingNode !== root.containerNode
    || row.captionNode !== root.source.caption.caption_node || row.listNode !== root.source.caption.list_node)) return fail("InlineGroupCaptionReservationMismatch");
  const x = placement.rectangle.x + object.left, y = placement.rectangle.y + object.top;
  const rows = reserved.caption.rows.map(row => ({ ...row, x: x + row.x, y: y + row.y,
    pageOrdinal: placement.pageOrdinal, columnOrdinal: placement.columnOrdinal, referenceBoxes: placement.referenceBoxes }));
  if (rows.some(row => ![row.x, row.y, row.y + row.height, ...(row.kind === "gap" ? [] : [row.x + row.width])].every(Number.isFinite))) return fail("InvalidInlineGroupCaptionPosition");
  return { state: "placed", rows };
}
