import { layoutContent } from "./layout.mjs";
import { tableGrid } from "./table-grid.mjs";
import { validateNestedTableOwnership } from "./nested-table-ownership.mjs";
import { TEXT_LEFT, DEFAULT_ROW_HEIGHT } from "./row-geometry.mjs";
import { pictureReferenceSpace } from "./picture-reference-space.mjs";
import { sourceTableCellInsets } from "./table-source-insets.mjs";
import { tableInsets } from "./table-insets.mjs";
import { layoutSourceTableCaption } from "./table-caption-source-layout.mjs";

// Block placement inside the source host cell. Inline anchor placement and
// original page-flow rules remain separate from this display projection.
export function layoutNestedTables(content, width, measure, maxRows) {
  const { paragraphs: byParagraph } = validateNestedTableOwnership(content);
  const hosts = new Map();
  for (const table of content.tables) {
    const key = `${table.section}:${table.hostParagraph}`;
    if (!hosts.has(key)) hosts.set(key, []);
    hosts.get(key).push(table);
  }
  let used = 0,
    limited = Boolean(content.limited);
  const sourceInsetsErrors = [];
  const captionLayoutErrors = [],
    captionParagraphs = new Set();
  const active = new Set(),
    emitted = new Set();
  const empty = () => ({ rows: [], boxes: [], height: 0, width: 0, flowPictures: [] });
  const append = (into, flow, x, y) => {
    into.rows.push(...flow.rows.map((row) => ({ ...row, x: row.x + x, y: row.y + y })));
    into.boxes.push(...flow.boxes.map((box) => ({ ...box, x: box.x + x, y: box.y + y })));
    into.flowPictures.push(
      ...flow.flowPictures.map((item) => ({
        ...item,
        rectangle: { ...item.rectangle, x: item.rectangle.x + x, y: item.rectangle.y + y },
      })),
    );
    into.width = Math.max(into.width, x + flow.width);
  };
  const paragraphsFlow = (paragraphs, available, owner, depth, documentX = TEXT_LEFT) => {
    const result = empty();
    for (const p of paragraphs) {
      if (captionParagraphs.has(`${p.section}:${p.paragraph}`)) continue;
      if (used >= maxRows) {
        limited = true;
        break;
      }
      const references = pictureReferenceSpace(
        { column: { x: TEXT_LEFT, y: 0, width, height: 0 } },
        { x: documentX - TEXT_LEFT, y: 0 },
      );
      if (references.state !== "mapped") throw new Error("InvalidNestedPictureReferences");
      const flat = layoutContent(
        {
          paragraphs: [{ ...p, ...(owner ? { label: "" } : {}) }],
          limited: false,
          pictures: content.pictures,
          placedPictures: result.flowPictures.map((item) => ({
            ...item,
            rectangle: {
              ...item.rectangle,
              x: item.rectangle.x + (owner ? TEXT_LEFT : 0),
              y: item.rectangle.y - result.height + (owner ? DEFAULT_ROW_HEIGHT : 0),
            },
          })),
          ...(owner ? { pictureFlowContext: { cell: owner, references: references.boxes } } : {}),
        },
        available,
        measure,
        maxRows - used + 1,
      );
      const selected = owner ? flat.rows.filter((row) => row.kind !== "label") : flat.rows;
      const usedBefore = used;
      const labelHeight = owner
        ? flat.rows.filter((row) => row.kind === "label").reduce((sum, row) => sum + row.height, 0)
        : 0;
      let localY = 0;
      for (const row of selected) {
        if (used >= maxRows) {
          limited = true;
          for (const kept of result.rows)
            if (kept.section === p.section && kept.paragraph === p.paragraph) {
              kept.editable = false;
              kept.selectable = false;
            }
          break;
        }
        result.rows.push({
          ...row,
          x: flat.spatialRows ? (row.x ?? TEXT_LEFT) - TEXT_LEFT : 0,
          y: result.height + (flat.spatialRows ? row.y - labelHeight : localY),
          width: flat.spatialRows
            ? (row.width ?? available)
            : Math.max(1, available - (row.paragraphX ?? 0)),
          ...(owner ? { tableNode: owner.tableNode, listNode: owner.listNode } : {}),
        });
        localY += row.height;
        used++;
      }
      limited ||= flat.limited;
      if (flat.flowPictures)
        result.flowPictures = flat.flowPictures.map((item) => ({
          ...item,
          rectangle: {
            ...item.rectangle,
            x: item.rectangle.x - (owner ? TEXT_LEFT : 0),
            y: item.rectangle.y + result.height - labelHeight,
          },
        }));
      if (flat.spatialRows && used - usedBefore === selected.length)
        localY = flat.height - labelHeight;
      result.height += localY;
      result.width = Math.max(result.width, available);
      for (const table of hosts.get(`${p.section}:${p.paragraph}`) ?? []) {
        if (
          (table.parentTableNode ?? null) !== (owner?.tableNode ?? null) ||
          (table.parentListNode ?? null) !== (owner?.listNode ?? null)
        )
          continue;
        const flow = tableFlow(table, depth + 1, documentX);
        append(result, flow, 0, result.height);
        result.height += flow.height + 12;
      }
    }
    return result;
  };
  const tableFlow = (table, depth, documentX) => {
    if (depth > 64 || active.has(table)) throw new Error("InvalidNestedTableFlow");
    if (emitted.has(table)) return empty();
    emitted.add(table);
    active.add(table);
    const initial = tableGrid(table, { x: 0 }),
      cells = new Map(),
      insets = new Map();
    for (const [index, cell] of table.cells.entries()) {
      const source = table.sourceGeometry || cell.sourceMargin;
      const padding = source ? sourceTableCellInsets(table, cell) : tableInsets(6);
      if (!padding)
        sourceInsetsErrors.push({
          section: table.section,
          tableNode: table.tableNode,
          listNode: cell.listNode,
          error: "MissingTableSourceInsets",
        });
      // Preserve the existing experimental fallback, but report source failure.
      const inset = padding ?? tableInsets(6);
      insets.set(cell.listNode, inset);
      const paragraphs = cell.paragraphs
        .map((ordinal) => byParagraph.get(`${table.section}:${ordinal}`))
        .filter(Boolean);
      cells.set(
        cell.listNode,
        paragraphsFlow(
          paragraphs,
          Math.max(1, initial.cells[index].width - inset.left - inset.right),
          { tableNode: table.tableNode, listNode: cell.listNode },
          depth,
          documentX + initial.cells[index].x + inset.left,
        ),
      );
    }
    const grid = tableGrid(table, {
      x: 0,
      contentSize: (cell) => {
        const inset = insets.get(cell.listNode);
        return {
          width: cells.get(cell.listNode).width + inset.left + inset.right,
          height: cells.get(cell.listNode).height + inset.top + inset.bottom,
        };
      },
    });
    const result = { ...empty(), width: grid.width, height: grid.height };
    for (const box of grid.cells) {
      result.boxes.push({ ...box, section: table.section, tableNode: table.tableNode, depth });
      const inset = insets.get(box.listNode);
      append(result, cells.get(box.listNode), box.x + inset.left, box.y + inset.top);
    }
    if (table.sourceCaption) {
      const caption =
        used < maxRows
          ? layoutSourceTableCaption(
              table,
              content.paragraphs,
              { x: 0, y: 0, width: grid.width, height: grid.height },
              measure,
              { maxRows: maxRows - used },
            )
          : { state: "unavailable", error: "TableCaptionMeasurementLimit" };
      if (caption.state === "positioned") {
        result.rows.push(...caption.rows);
        const dx = -caption.bounds.x,
          dy = -caption.bounds.y;
        for (const row of result.rows) {
          row.x += dx;
          row.y += dy;
        }
        for (const box of result.boxes) {
          box.x += dx;
          box.y += dy;
        }
        for (const picture of result.flowPictures) {
          picture.rectangle.x += dx;
          picture.rectangle.y += dy;
        }
        result.width = caption.bounds.width;
        result.height = caption.bounds.height;
        used += caption.rows.length;
        for (const id of table.captionParagraphs) captionParagraphs.add(`${table.section}:${id}`);
      } else
        captionLayoutErrors.push({
          section: table.section,
          tableNode: table.tableNode,
          error: caption.error,
        });
    }
    active.delete(table);
    limited ||= Boolean(table.partial);
    return result;
  };
  const root = paragraphsFlow(
    content.paragraphs.filter((p) => !p.tableCell),
    width,
    null,
    0,
  );
  // Root row and box coordinates share the existing page gutter.
  for (const row of root.rows) row.x += TEXT_LEFT;
  for (const box of root.boxes) box.x += TEXT_LEFT;
  for (const item of root.flowPictures) if (item.cell) item.rectangle.x += TEXT_LEFT;
  if (emitted.size !== content.tables.length) limited = true;
  return {
    ...root,
    limited,
    spatialRows: true,
    ...(sourceInsetsErrors.length ? { sourceInsetsErrors } : {}),
    ...(captionLayoutErrors.length ? { captionLayoutErrors } : {}),
  };
}
