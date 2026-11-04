import { paragraphSelectionOwner } from './paragraph-selection.mjs';
const validId = (value) => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff;
const key = (section, paragraph) => `${section}:${paragraph}`;
/** 그리기 호출마다 새 참조 범위를 캡처하며 측정/원문/편집 모델을 저장하지 않습니다. */
export function createFormattingMarkCellScope(content, rows, repeatedRows = []) {
  let currentRows;
  let prepared;
  return (row, p) => {
    // 소유권/명시좌표가 없으면 원문·표·행 배열을 순회하지 않습니다.
    const cell = p?.tableCell;
    if (
      !row ||
      !p ||
      !cell ||
      row.kind !== 'text' ||
      row.transform !== undefined ||
      p.clipped ||
      (p.textStartUnit ?? 0) !== 0 ||
      !validId(p.section) ||
      !validId(p.paragraph) ||
      !validId(cell.tableNode) ||
      !validId(cell.listNode) ||
      row.section !== p.section ||
      row.paragraph !== p.paragraph ||
      row.tableNode !== cell.tableNode ||
      row.listNode !== cell.listNode ||
      p.drawingText ||
      p.drawingCaption ||
      p.createdCell ||
      row.drawingText ||
      row.drawingCaption ||
      row.createdCell ||
      row.sourceObjectAnchor ||
      row.clipped ||
      !Number.isFinite(row.x) ||
      !Number.isFinite(row.y) ||
      !Number.isFinite(row.textHeight) ||
      row.textHeight <= 0
    )
      return false;
    const owner = paragraphSelectionOwner(p);
    if (owner == null || (row.selectionOwner != null && row.selectionOwner !== owner)) return false;
    if (currentRows === undefined) {
      currentRows = new Set();
      if (!Array.isArray(rows) || !Array.isArray(repeatedRows)) return false;
      for (const group of [rows, repeatedRows])
        for (const current of group) currentRows.add(current);
    }
    if (!currentRows.has(row)) return false;
    if (prepared === undefined) {
      prepared = null;
      const sourceParagraphs = content?.paragraphs,
        sourceTables = content?.tables;
      if (!Array.isArray(sourceParagraphs) || !Array.isArray(sourceTables)) return false;
      const paragraphs = new Map(),
        tables = new Map(),
        cells = new Map(),
        members = new Map();
      for (const paragraph of sourceParagraphs) {
        if (!paragraph || !validId(paragraph.section) || !validId(paragraph.paragraph)) continue;
        const id = key(paragraph.section, paragraph.paragraph);
        paragraphs.set(id, paragraphs.has(id) ? null : paragraph);
      }
      for (const table of sourceTables) {
        if (!table || !validId(table.section) || !validId(table.tableNode)) continue;
        const tableKey = key(table.section, table.tableNode);
        tables.set(tableKey, tables.has(tableKey) ? null : table);
        const sourceCells = table.cells;
        if (!Array.isArray(sourceCells)) continue;
        for (const sourceCell of sourceCells) {
          if (!sourceCell || !validId(sourceCell.listNode)) continue;
          const cellKey = `${tableKey}:${sourceCell.listNode}`,
            ordinals = sourceCell.paragraphs;
          const record = {
            table,
            cell: sourceCell,
            tableKey,
            cellKey,
            valid:
              !table.partial &&
              table.createdTableIdentity === undefined &&
              Array.isArray(ordinals) &&
              ordinals.length > 0,
          };
          cells.set(cellKey, cells.has(cellKey) ? null : record);
          if (!Array.isArray(ordinals)) continue;
          for (const ordinal of ordinals) {
            if (!validId(ordinal)) {
              record.valid = false;
              continue;
            }
            const id = key(table.section, ordinal);
            members.set(id, members.has(id) ? null : record);
          }
        }
      }
      prepared = { paragraphs, tables, cells, members };
    }
    if (!prepared) return false;
    const id = key(p.section, p.paragraph),
      record = prepared.members.get(id);
    return (
      prepared.paragraphs.get(id) === p &&
      record?.valid === true &&
      prepared.tables.get(record.tableKey) === record.table &&
      prepared.cells.get(record.cellKey) === record &&
      cell.tableNode === record.table.tableNode &&
      cell.listNode === record.cell.listNode
    );
  };
}
