import { paragraphSelectionOwner } from './paragraph-selection.mjs';

const own = (object, key) => Object.getOwnPropertyDescriptor(object ?? {}, key)?.value;
const uint = (value) =>
  Number.isInteger(value) && !Object.is(value, -0) && value >= 0 && value <= 0xffffffff;
const unique = (values, matches) => {
  if (!Array.isArray(values)) return null;
  const found = values.filter(matches);
  return found.length === 1 ? found[0] : null;
};

// Source DTO ownership only. This neither plans a grid edit nor grants Native eligibility.
function sourceCell(content, paragraph, point) {
  if (
    !['hwp5', 'hwpx'].includes(content?.format) ||
    content.limited !== false ||
    content.window ||
    content.viewKind ||
    content.readOnly === true ||
    !point ||
    point.createdCell ||
    !uint(point.section) ||
    !uint(point.paragraph) ||
    !paragraph ||
    paragraph.createdCell ||
    paragraph.clipped ||
    paragraph.sourceOffsets ||
    paragraph.editable !== true
  )
    return null;
  const source = unique(
    content.paragraphs,
    (p) => p.section === point.section && p.paragraph === point.paragraph,
  );
  if (
    !source ||
    source.createdCell ||
    source.clipped ||
    source.sourceOffsets ||
    source.editable !== true ||
    source.text !== paragraph.text ||
    paragraph.section !== point.section ||
    paragraph.paragraph !== point.paragraph
  )
    return null;
  if (
    content.format === 'hwp5' &&
    (source.currentReference?.kind !== 'original' ||
      paragraph.currentReference?.kind !== 'original')
  )
    return null;
  const binding = own(source, 'tableCell'),
    geometry = own(paragraph, 'tableCell');
  if (
    !binding ||
    !geometry ||
    ![own(binding, 'tableNode'), own(binding, 'listNode')].every(uint) ||
    own(geometry, 'tableNode') !== binding.tableNode ||
    own(geometry, 'listNode') !== binding.listNode ||
    !paragraphSelectionOwner(source) ||
    paragraphSelectionOwner(source) !== paragraphSelectionOwner(paragraph)
  )
    return null;
  const table = unique(
    content.tables,
    (t) => t.section === point.section && t.tableNode === binding.tableNode,
  );
  if (
    !table ||
    table.partial ||
    table.createdTable ||
    ![
      own(table, 'section'),
      own(table, 'tableNode'),
      own(table, 'rows'),
      own(table, 'columns'),
    ].every(uint) ||
    table.rows === 0 ||
    table.columns === 0 ||
    !Number.isSafeInteger(table.rows * table.columns)
  )
    return null;
  const cell = unique(table.cells, (c) => c.listNode === binding.listNode);
  if (
    !cell ||
    ![own(cell, 'listNode'), own(cell, 'row'), own(cell, 'column')].every(uint) ||
    !uint(own(cell, 'rowSpan')) ||
    cell.rowSpan < 1 ||
    !uint(own(cell, 'columnSpan')) ||
    cell.columnSpan < 1 ||
    cell.rowSpan > table.rows - cell.row ||
    cell.columnSpan > table.columns - cell.column ||
    cell.row >= table.rows ||
    cell.column >= table.columns ||
    !Array.isArray(cell.paragraphs) ||
    !cell.paragraphs.includes(point.paragraph)
  )
    return null;
  if (
    (cell.rowSpan > 1 || cell.columnSpan > 1) &&
    [binding, geometry].some(
      (value) =>
        own(value, 'rowSpan') !== cell.rowSpan || own(value, 'columnSpan') !== cell.columnSpan,
    )
  )
    return null;
  return {
    source,
    binding,
    geometry,
    table,
    cell,
    section: point.section,
    tableNode: table.tableNode,
    listNode: cell.listNode,
    row: cell.row,
    column: cell.column,
    rows: table.rows,
    columns: table.columns,
  };
}

/** Stable source address; every observation rechecks the original DTO and geometry owners. */
export function captureSourceTableGridSelection({ content, paragraph, point, current }) {
  try {
    if (typeof current !== 'function' || current() !== true) return null;
    const saved = sourceCell(content, paragraph, point);
    if (!saved) return null;
    let invalid = false;
    const live = () => {
      if (invalid) return false;
      try {
        const next = sourceCell(content, paragraph, point);
        if (
          next &&
          Object.keys(saved).every((key) => next[key] === saved[key]) &&
          current() === true
        )
          return true;
      } catch {
        /* Disposed renderers and malformed source observations fail closed. */
      }
      invalid = true;
      return false;
    };
    if (!live()) return null;
    const { section, tableNode, listNode, row, column, rows, columns } = saved;
    return Object.freeze({
      section,
      tableNode,
      listNode,
      row,
      column,
      rows,
      columns,
      current: live,
    });
  } catch {
    return null;
  }
}
