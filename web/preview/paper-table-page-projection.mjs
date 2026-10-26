import { tableVerticalReference } from './table-vertical-reference.mjs';
import { tableBodyIntersection } from './table-body-intersection.mjs';
import { placeFloatingTable } from './table-placement.mjs';
import { prepareTablePageBands, tablePageBandFragment } from './table-page-bands.mjs';
import { projectTablePageFragments } from './table-page-fragments.mjs';
import { resolveTablePadding } from './table-source-insets.mjs';
import { hwpUnitPixels } from './hwp-units.mjs';
import { tableCellReferenceBox } from './table-cell-reference-box.mjs';
import { tableCellInsets } from './table-insets.mjs';

/** Physical placement is independent of body cursor advancement. */
export function projectPaperTablePage(table, measured, page, maxRows = 20000) {
  const fail = (error) => ({ state: 'unavailable', error });
  const source = table?.sourceGeometry;
  if (
    measured?.state !== 'measured' ||
    !Array.isArray(measured.grid?.rows) ||
    !(measured.flows instanceof Map) ||
    ![measured.grid.width, measured.grid.height].every((v) => Number.isFinite(v) && v > 0) ||
    source?.vertical_relative !== 0 ||
    source.geometry?.treat_as_character !== false ||
    source.text_wrap !== 1 ||
    source.flow_with_text !== true ||
    source.allow_overlap !== false ||
    table.sourceCaption ||
    ![0, 1, 2].includes(source.horizontal_relative)
  )
    return fail('UnsupportedPaperTableProjection');
  if (
    !Number.isSafeInteger(page?.ordinal) ||
    page.ordinal < 0 ||
    page.section !== table.section ||
    !Array.isArray(page.columns) ||
    !page.columns.length ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1
  )
    return fail('InvalidPaperTablePage');
  const valid = (box) =>
    box &&
    [box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(
      Number.isFinite,
    ) &&
    box.width > 0 &&
    box.height > 0;
  if (![page.paper, page.page, ...page.columns].every(valid)) return fail('InvalidPaperTablePage');
  if (source.horizontal_relative === 2 && page.columns.length !== 1)
    return fail('MissingPaperTableColumnOwner');
  if (
    !Array.isArray(source.out_margin) ||
    source.out_margin.length !== 4 ||
    !source.out_margin.every((v) => Number.isInteger(v) && v >= 0 && v <= 0xffffffff)
  )
    return fail('InvalidTableOuterInsets');
  const [left, right, top, bottom] = source.out_margin.map(hwpUnitPixels);
  const prepared = prepareTablePageBands(table, measured.grid.rows, 'whole', {
    left,
    right,
    top,
    bottom,
  });
  if (prepared.state !== 'prepared') return prepared;
  const vertical = tableVerticalReference(source, {
    paperTop: page.paper.y,
    paperBottom: page.paper.y + page.paper.height,
    pageTop: page.page.y,
    pageBottom: page.page.y + page.page.height,
    height: measured.grid.height + top + bottom,
  });
  if (vertical.state !== 'resolved') return vertical;
  const boxes = { paper: page.paper, page: page.page, column: page.columns[0] };
  const name = ['paper', 'page', 'column'][source.horizontal_relative];
  boxes[name] = {
    ...boxes[name],
    x: boxes[name].x + left,
    width: boxes[name].width - left - right,
  };
  const placed = placeFloatingTable(table, boxes);
  if (placed.state !== 'placed') return fail('UnsupportedPaperTableProjection');
  const footprint = {
    x: placed.rectangle.x - left,
    y: vertical.y,
    width: measured.grid.width + left + right,
    height: measured.grid.height + top + bottom,
  };
  if (
    !valid(footprint) ||
    footprint.x < page.paper.x ||
    footprint.y < page.paper.y ||
    footprint.x + footprint.width > page.paper.x + page.paper.width + 1e-8 ||
    footprint.y + footprint.height > page.paper.y + page.paper.height + 1e-8
  )
    return fail('PaperTablePaperOverflow');
  const overlap = tableBodyIntersection(footprint, page.page);
  if (overlap.state === 'unavailable') return overlap;
  const columnIntersections = page.columns.map((column, columnOrdinal) => ({
    columnOrdinal,
    ...tableBodyIntersection(footprint, column),
  }));
  const fragment = tablePageBandFragment(prepared, {
    x: footprint.x,
    y: footprint.y,
    bandOrdinal: 0,
    pageOrdinal: page.ordinal,
    referenceBoxes: { paper: page.paper, page: page.page },
  });
  const padding = resolveTablePadding(table, 'source');
  if (!padding) return fail('MissingTableSourceInsets');
  const projected = projectTablePageFragments(
    table,
    measured.grid,
    measured.flows,
    { state: 'planned', pages: [page], fragments: [fragment] },
    { origin: { x: 0, y: 0 }, padding, maxRows },
  );
  if (projected.state !== 'placed') return projected;
  const rows = [];
  for (const row of projected.rows) {
    if (row.tableNode !== table.tableNode) {
      rows.push(row);
      continue;
    }
    const cell = table.cells.find((cell) => cell.listNode === row.listNode);
    const box = projected.boxes.find(
      (box) => box.tableNode === table.tableNode && box.listNode === row.listNode,
    );
    const column =
      cell &&
      tableCellReferenceBox(
        box,
        tableCellInsets(padding, cell),
        measured.flows.get(row.listNode),
        row.cellColumnOrdinal,
      );
    if (!column) return fail('MissingPaperTableCellReference');
    rows.push({ ...row, referenceBoxes: { ...row.referenceBoxes, column } });
  }
  return {
    ...projected,
    rows,
    state: 'paper-projected',
    footprint,
    bodyIntersection: overlap.intersection,
    columnIntersections,
  };
}
