import { layoutContent } from "./layout.mjs";
import { tableGrid } from "./table-grid.mjs";
import { layoutNestedTables } from "./nested-table-flow.mjs";
import { TEXT_LEFT } from "./row-geometry.mjs";

// 소속 문단을 알면 재귀 배치하고, 조회 실패 시 첫 셀 문단의 평면 배치를 사용합니다.
// 두 경로 모두 실험용 블록 흐름이며 원본 쪽 배치나 인라인 위치를 재현하지 않습니다.
export function layoutTableContent(content, width, measure, maxRows = 20000) {
  if (!content.tables?.length) return layoutContent(content, width, measure, maxRows);
  if (!Number.isFinite(width) || width <= 0 || !Number.isInteger(maxRows) || maxRows < 1)
    throw new RangeError("InvalidLayoutBounds");
  if (content.tables.every((table) => Number.isInteger(table.hostParagraph)))
    return layoutNestedTables(content, width, measure, maxRows);
  const rows = [],
    boxes = [],
    emitted = new Set(),
    paragraphs = new Map(content.paragraphs.map((p) => [`${p.section}:${p.paragraph}`, p]));
  let flowPictures = [];
  let height = 0,
    limited = Boolean(content.limited);
  const append = (flow, x, y, cell = null, root = false) => {
    for (const row of flow.rows) {
      if (rows.length >= maxRows) {
        limited = true;
        for (const kept of rows)
          if (kept.section === row.section && kept.paragraph === row.paragraph) {
            kept.editable = false;
            kept.selectable = false;
          }
        continue;
      }
      rows.push({
        ...row,
        x: root && flow.spatialRows ? x + (row.x ?? TEXT_LEFT) - TEXT_LEFT : x,
        y: row.y + y,
        width:
          root && flow.spatialRows
            ? (row.width ?? width)
            : Math.max(1, (flow.width ?? width) - (row.paragraphX ?? 0)),
        ...(cell ? { tableNode: cell.tableNode, listNode: cell.listNode } : {}),
      });
    }
    limited ||= flow.limited;
  };
  for (const paragraph of content.paragraphs) {
    if (rows.length >= maxRows) {
      limited = true;
      break;
    }
    const table =
      paragraph.tableCell &&
      content.tables.find(
        (t) => t.section === paragraph.section && t.tableNode === paragraph.tableCell.tableNode,
      );
    if (!table) {
      const flow = layoutContent(
        {
          paragraphs: [paragraph],
          limited: false,
          pictures: content.pictures,
          placedPictures: flowPictures.map((item) => ({
            ...item,
            rectangle: { ...item.rectangle, y: item.rectangle.y - height },
          })),
        },
        width,
        measure,
        maxRows - rows.length + 1,
      );
      append(flow, TEXT_LEFT, height, null, true);
      if (flow.flowPictures)
        flowPictures = flow.flowPictures.map((item) => ({
          ...item,
          rectangle: { ...item.rectangle, y: item.rectangle.y + height },
        }));
      height += flow.height;
      continue;
    }
    if (emitted.has(table)) continue;
    emitted.add(table);
    const initial = tableGrid(table),
      flows = new Map();
    let prepared = 0;
    for (const [index, cell] of table.cells.entries()) {
      const members = cell.paragraphs
        .map((index) => paragraphs.get(`${table.section}:${index}`))
        .filter(Boolean);
      const cellWidth = Math.max(1, initial.cells[index].width - 12);
      // Paragraph labels are diagnostics outside the table; inside cells they
      // must not consume the document's text area.
      if (prepared >= maxRows - rows.length + 1) {
        flows.set(cell.listNode, { rows: [], height: 0, width: cellWidth, limited: true });
        continue;
      }
      const flow = layoutContent(
        { paragraphs: members.map((p) => ({ ...p, label: "" })), limited: false },
        cellWidth,
        measure,
        maxRows - rows.length - prepared + 2,
      );
      const kept = flow.rows.filter((row) => row.kind !== "label");
      let cellHeight = 0;
      for (const row of kept) {
        row.y = cellHeight;
        cellHeight += row.height;
      }
      prepared += kept.length;
      flows.set(cell.listNode, { ...flow, rows: kept, height: cellHeight, width: cellWidth });
    }
    const grid = tableGrid(table, {
      y: height,
      contentSize: (cell) => ({ width: 0, height: flows.get(cell.listNode).height + 12 }),
    });
    for (const box of grid.cells) {
      const displayedBox = { ...box, section: table.section, tableNode: table.tableNode };
      boxes.push(displayedBox);
      append(flows.get(box.listNode), box.x + 6, box.y + 6, displayedBox);
    }
    limited ||= table.partial;
    height += grid.height + 28;
  }
  return {
    rows,
    boxes,
    height,
    limited,
    spatialRows: true,
    ...(flowPictures.length ? { flowPictures } : {}),
  };
}
