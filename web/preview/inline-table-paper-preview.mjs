import { inlineTableRowFitsPaper } from './inline-table-row-fit.mjs';
import { isSingleInlineTableHost } from './single-inline-table-host.mjs';
import { pageVisibleRectangle } from './page-visible-rectangle.mjs';
import { hwpUnitPixels } from './hwp-units.mjs';

const uint = (value) => Number.isSafeInteger(value) && value >= 0;
const key = (section, paragraph) => `${section}:${paragraph}`;

// A view policy only. No source dimensions, paragraph identities or Native DTOs change.
export function createInlineTablePaperPreview(content, entries) {
  if (
    !content ||
    content.limited !== false ||
    content.window ||
    content.viewKind ||
    !['hwp5', 'hwpx'].includes(content.format) ||
    !Array.isArray(content.tables) ||
    content.tables.length !== 1 ||
    !Array.isArray(entries) ||
    entries.length !== 1 ||
    !Array.isArray(content.paragraphs)
  )
    return null;
  for (const name of [
    'pictures',
    'hwp5Pictures',
    'drawings',
    'hwp5Drawings',
    'charts',
    'formulas',
    'createdTables',
    'hwp5Notes',
    'pageAreaSources',
    'masterPageSources',
  ]) {
    if (content[name]?.length) return null;
  }
  const entry = entries[0],
    table = entry?.table,
    source = table?.sourceGeometry,
    g = source?.geometry;
  // HWP5 has an explicit flag; HWPX proves absence through the caption reader.
  const noCaption =
    source?.has_caption === false ||
    (content.format === 'hwpx' &&
      source?.has_caption === undefined &&
      table?.sourceCaption === null);
  if (
    !table ||
    table !== content.tables[0] ||
    table.partial !== false ||
    table.createdTable ||
    table.parentTableNode != null ||
    !entry.inline ||
    entry.inlineFlow ||
    entry.paperFlow ||
    !isSingleInlineTableHost(entry.host, table) ||
    !g ||
    g.treat_as_character !== true ||
    !uint(g.width) ||
    g.width === 0 ||
    !uint(g.height) ||
    g.height === 0 ||
    g.width_relative !== 4 ||
    g.height_relative !== 2 ||
    g.horizontal_offset !== 0 ||
    g.vertical_offset !== 0 ||
    !noCaption ||
    table.sourceCaption != null ||
    table.captionParagraphs?.length ||
    table.pagination?.page_break !== 'table' ||
    table.pagination?.repeat_header !== false ||
    table.pagination?.cell_spacing !== 0 ||
    !Array.isArray(table.cells) ||
    !uint(table.rows) ||
    !uint(table.columns) ||
    table.rows === 0 ||
    table.columns === 0 ||
    table.cells.length !== table.rows * table.columns ||
    entry.measured?.state !== 'measured' ||
    !(entry.measured.flows instanceof Map) ||
    !Number.isFinite(entry.measured.grid?.width) ||
    Math.abs(entry.measured.grid.width - hwpUnitPixels(g.width)) > 1e-8
  )
    return null;
  const paragraphs = new Map(),
    lists = new Set(),
    addresses = new Set(),
    owned = new Set();
  for (const p of content.paragraphs) {
    if (!p || !uint(p.section) || !uint(p.paragraph)) return null;
    const id = key(p.section, p.paragraph);
    paragraphs.set(id, paragraphs.has(id) ? null : p);
  }
  if (paragraphs.get(key(table.section, table.hostParagraph)) !== entry.host) return null;
  for (const cell of table.cells) {
    if (
      !cell ||
      cell.rowSpan !== 1 ||
      cell.columnSpan !== 1 ||
      !uint(cell.listNode) ||
      !uint(cell.row) ||
      !uint(cell.column) ||
      cell.row >= table.rows ||
      cell.column >= table.columns ||
      lists.has(cell.listNode) ||
      addresses.has(key(cell.row, cell.column)) ||
      !Array.isArray(cell.paragraphs) ||
      cell.paragraphs.length === 0
    )
      return null;
    lists.add(cell.listNode);
    addresses.add(key(cell.row, cell.column));
    for (const id of cell.paragraphs) {
      const p = paragraphs.get(key(table.section, id));
      if (
        !p ||
        owned.has(id) ||
        p.editable !== true ||
        p.clipped ||
        p.sourceOffsets ||
        typeof p.text !== 'string' ||
        p.text.includes('\ufffc') ||
        p.tableCell?.tableNode !== table.tableNode ||
        p.tableCell?.listNode !== cell.listNode
      )
        return null;
      owned.add(id);
    }
  }
  for (const p of content.paragraphs)
    if (
      p.section === table.section &&
      p.tableCell?.tableNode === table.tableNode &&
      !owned.has(p.paragraph)
    )
      return null;
  if (
    entry.measured.flows.size !== lists.size ||
    [...lists].some((list) => !entry.measured.flows.has(list))
  )
    return null;
  for (const flow of entry.measured.flows.values()) {
    if (
      !Array.isArray(flow?.rows) ||
      flow.cellPageBreaks?.length ||
      flow.flowPictures?.length ||
      flow.rows.some(
        (r) =>
          !r ||
          !['text', 'gap'].includes(r.kind) ||
          r.transform !== undefined ||
          (typeof r.text === 'string' && r.text.includes('\ufffc')),
      )
    )
      return null;
  }
  let admitted = false;
  return {
    fitsRow(row, context) {
      const fits = inlineTableRowFitsPaper(row, context);
      if (
        fits !== false ||
        row.tableIndex !== 0 ||
        row.paragraphSource ||
        context.columnCount !== 1 ||
        context.columnOrdinal !== 0 ||
        context.column?.x !== context.page?.x ||
        context.column?.width !== context.page?.width ||
        row.inlineTableFit?.width !==
          entry.measured.grid.width +
            (entry.outerInsets?.left ?? 0) +
            (entry.outerInsets?.right ?? 0) ||
        row.inlineTableFit?.paragraphShape !== entry.host.paragraphShape
      )
        return fits;
      admitted = true;
      return true;
    },
    mayClip(index) {
      return admitted && index === 0;
    },
    descriptor() {
      return {
        section: table.section,
        tableNode: table.tableNode,
        hostParagraph: table.hostParagraph,
        paragraphs: [...owned],
        reason: 'InlineTablePaperOverflow',
      };
    },
  };
}

// Final page references own clipping. Preserve coordinates and stricter prior clips.
export function clipInlineTablePaperPreview(table, layout) {
  const owns = (item) =>
    item.section === table.section &&
    (item.tableNode === table.tableNode || item.positionOwnerTableNode === table.tableNode);
  const boxes = layout.boxes.filter(owns);
  const instances = new Set(boxes.map((b) => `${b.pageOrdinal}:${b.columnOrdinal ?? 0}`));
  if (
    !boxes.length ||
    instances.size !== 1 ||
    boxes.some((b) => (b.depth ?? 0) !== 0) ||
    layout.flowPictures?.some(
      (p) =>
        p.section === table.section &&
        (p.cell?.tableNode === table.tableNode || p.positionOwnerTableNode === table.tableNode),
    )
  )
    return { state: 'unavailable', error: 'UnsupportedInlineTablePaperPreview' };
  let invalid = false;
  const clip = (item) => {
    if (!owns(item)) return item;
    const paper = item.referenceBoxes?.paper;
    if (
      item.transform !== undefined ||
      !paper ||
      !Number.isSafeInteger(item.pageOrdinal) ||
      item.pageOrdinal < 0 ||
      !instances.has(`${item.pageOrdinal}:${item.columnOrdinal ?? 0}`)
    ) {
      invalid = true;
      return item;
    }
    const result = pageVisibleRectangle(item.pageClip ?? paper, paper);
    if (result.state === 'invalid_page_clip') {
      invalid = true;
      return item;
    }
    return {
      ...item,
      previewOnly: true,
      editable: false,
      selectable: false,
      pageClip: result.rectangle ?? { x: paper.x, y: paper.y, width: 0, height: 0 },
    };
  };
  const result = {
    ...layout,
    rows: layout.rows.map(clip),
    boxes: layout.boxes.map(clip),
    sourceCoverage: 'incomplete',
    documentPageNumbersExact: false,
  };
  return invalid ? { state: 'unavailable', error: 'InvalidInlineTablePaperPreviewClip' } : result;
}
