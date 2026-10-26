import { cellFlowLineCount } from './cell-row-split-policy.mjs';
import { layoutContent } from './layout.mjs';
import { tableGrid } from './table-grid.mjs';
import { tableCellInsets } from './table-insets.mjs';
import { resolveTablePadding } from './table-source-insets.mjs';
import { tableCellColumnContext } from './table-cell-column-context.mjs';
import { measureTableCellColumns } from './table-cell-column-measurement.mjs';
import { pageParagraphCoverage } from './page-paragraph-coverage.mjs';
import { alignTableCellFlow } from './table-cell-vertical-alignment.mjs';
import { tableCellPictureReferences } from './table-cell-picture-references.mjs';
import {
  tableCellFlowExtent,
  tableCellRowExtent,
  isZeroAdvanceCellAnchor,
} from './table-cell-band.mjs';
import { measureCellSqueezeFlow } from './cell-squeeze-flow.mjs';
import { cellCrossesMandatoryCut } from './cell-fragment-alignment.mjs';

/** Measure flat cell paragraphs without inventing source padding or page policy. */
export function measureTableCells(
  table,
  paragraphs,
  measure,
  {
    origin,
    padding,
    maxRows = 20000,
    pictures = [],
    pictureReferences,
    paragraphFlows,
    measureCellFlow,
    completeCellFlow,
    compactLines = padding === 'source',
    columnWidths,
    sourceRowHorizontals = false,
    minimumRowHeight,
    minimumCellHeight,
    deferMultilineAlignment = false,
  } = {},
) {
  const unavailable = (error) => ({ state: 'unavailable', error });
  if (typeof compactLines !== 'boolean' || typeof deferMultilineAlignment !== 'boolean')
    return unavailable('InvalidTableCellMeasurement');
  if (minimumRowHeight === undefined) minimumRowHeight = padding === 'source' ? 0 : 28;
  if (!Number.isFinite(minimumRowHeight) || minimumRowHeight < 0)
    return unavailable('InvalidTableCellMeasurement');
  if (!Array.isArray(pictures)) return unavailable('InvalidTableCellPictures');
  if (measureCellFlow !== undefined && typeof measureCellFlow !== 'function')
    return unavailable('InvalidTableCellMeasurement');
  if (completeCellFlow !== undefined && typeof completeCellFlow !== 'function')
    return unavailable('InvalidTableCellMeasurement');
  if (minimumCellHeight !== undefined && typeof minimumCellHeight !== 'function')
    return unavailable('InvalidTableCellMinimumHeight');
  if (padding === 'source') {
    padding = resolveTablePadding(table, padding);
    if (!padding) return unavailable('MissingTableSourceInsets');
  }
  if (
    !Array.isArray(table?.cells) ||
    table.cells.some((cell) => !cell || !tableCellInsets(padding, cell)) ||
    !Array.isArray(paragraphs) ||
    typeof measure !== 'function' ||
    !origin ||
    ![origin.x, origin.y].every(Number.isFinite) ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1
  )
    return unavailable('InvalidTableCellMeasurement');
  const members = new Map();
  for (const paragraph of paragraphs) {
    const key = `${paragraph.section}:${paragraph.paragraph}`;
    if (members.has(key)) return unavailable('AmbiguousTableCellParagraph');
    members.set(key, paragraph);
  }
  const minima = new Map();
  for (const cell of table.cells) {
    const height = minimumCellHeight
      ? minimumCellHeight({
          section: table.section,
          tableNode: table.tableNode,
          listNode: cell.listNode,
        })
      : 0;
    if (!Number.isFinite(height) || height < 0) return unavailable('InvalidTableCellMinimumHeight');
    minima.set(cell, height);
  }
  const initial = tableGrid(table, {
      ...origin,
      columnWidths,
      sourceRowHorizontals,
      minRow: minimumRowHeight,
      contentSize: (cell) => ({ width: 0, height: minima.get(cell) }),
    }),
    flows = new Map(),
    owned = new Set();
  let measuredRows = 0;
  for (const [index, cell] of table.cells.entries()) {
    const insets = tableCellInsets(padding, cell);
    if (!Array.isArray(cell.paragraphs) || flows.has(cell.listNode))
      return unavailable('AmbiguousTableCellParagraph');
    const selected = [];
    for (const id of cell.paragraphs) {
      const key = `${table.section}:${id}`,
        paragraph = members.get(key);
      if (!paragraph || owned.has(key)) return unavailable('AmbiguousTableCellParagraph');
      if (
        paragraph.clipped ||
        paragraph.tableCell?.tableNode !== table.tableNode ||
        paragraph.tableCell?.listNode !== cell.listNode
      )
        return unavailable('UnsupportedTableCellContent');
      owned.add(key);
      selected.push(paragraph);
    }
    const width = initial.cells[index].width - insets.left - insets.right;
    const invalidMeasurement = (measurementStage, details = {}) => ({
      ...unavailable('InvalidTableCellMeasurement'),
      section: table.section,
      tableNode: table.tableNode,
      listNode: cell.listNode,
      measurementStage,
      ...details,
    });
    if (width <= 0)
      return invalidMeasurement('content-width', {
        availableWidth: width,
        cellWidth: initial.cells[index].width,
        horizontalInsets: insets.left + insets.right,
      });
    if (measuredRows >= maxRows) return unavailable('TableCellMeasurementLimit');
    const selectedIds = new Set(selected.map((paragraph) => paragraph.paragraph));
    const cellPictures = pictures.filter(
      (picture) => picture.section === table.section && selectedIds.has(picture.paragraph),
    );
    const context =
      paragraphFlows === undefined
        ? null
        : tableCellColumnContext(table, cell, paragraphs, paragraphFlows);
    if (context && context.state !== 'selected') return context;
    const resolvedPictures = tableCellPictureReferences(pictureReferences, {
      table,
      cell,
      box: { ...initial.cells[index] },
      origin: { ...origin },
      insets: { ...insets },
      width,
      height: Math.max(0, initial.cells[index].height - insets.top - insets.bottom),
      pictures: cellPictures,
      columnContext: context,
    });
    if (resolvedPictures.state !== 'resolved')
      return {
        ...resolvedPictures,
        section: table.section,
        tableNode: table.tableNode,
        listNode: cell.listNode,
      };
    const multiple = context?.declaration?.count > 1;
    if (multiple && cellPictures.length) return unavailable('UnsupportedTableCellColumnPictures');
    const defaultFlow = () =>
      multiple
        ? measureTableCellColumns(
            selected,
            context.declaration,
            width,
            Math.max(0, initial.cells[index].height - insets.top - insets.bottom),
            measure,
            maxRows - measuredRows,
          )
        : layoutContent(
            {
              paragraphs: selected,
              pictures: cellPictures,
              limited: false,
              pictureFlowContext: {
                cell: { tableNode: table.tableNode, listNode: cell.listNode },
                references: resolvedPictures.references,
              },
            },
            width,
            measure,
            maxRows - measuredRows,
            { documentBody: true, compactLines, includeTerminalAfter: false },
          );
    const supplied = measureCellFlow?.({
      table,
      cell,
      paragraphs: selected,
      width,
      height: Math.max(0, initial.cells[index].height - insets.top - insets.bottom),
      columnContext: context,
      pictures: cellPictures,
      pictureReferences: resolvedPictures.references,
      measure,
      maxRows: maxRows - measuredRows,
    });
    const squeezed =
      supplied == null &&
      cell.sourceLineWrap === 1 &&
      cell.sourceTextDirection === 0 &&
      !multiple &&
      !cellPictures.length
        ? measureCellSqueezeFlow(selected, width, measure, maxRows - measuredRows, compactLines)
        : null;
    let flow = supplied ?? squeezed ?? defaultFlow();
    if (completeCellFlow)
      flow = completeCellFlow({
        table,
        cell,
        paragraphs: selected,
        width,
        height: Math.max(0, initial.cells[index].height - insets.top - insets.bottom),
        columnContext: context,
        pictures: cellPictures,
        flow,
      });
    if (!flow || typeof flow !== 'object') return invalidMeasurement('flow-result');
    if (flow.state === 'unavailable') return flow;
    if (!Array.isArray(flow.rows) || !Number.isFinite(flow.height) || flow.height < 0)
      return invalidMeasurement('flow-shape');
    if (flow.limited || flow.rows.length > maxRows - measuredRows)
      return unavailable('TableCellMeasurementLimit');
    const extent = tableCellFlowExtent(flow);
    if (!Number.isFinite(extent)) return invalidMeasurement('flow-visual-extent');
    if (extent > flow.height) flow = { ...flow, height: extent };
    if (context?.pageBreakParagraphs?.length) {
      const cellPageBreaks = [];
      for (const paragraph of context.pageBreakParagraphs) {
        const rows = flow.rows.filter(
          (row) => row.section === table.section && row.paragraph === paragraph,
        );
        if (!rows.length || rows.some((row) => !Number.isFinite(row.y) || row.y < 0))
          return unavailable('MissingTableCellPageBreakRow');
        cellPageBreaks.push({
          section: table.section,
          paragraph,
          y: Math.min(...rows.map((row) => row.y)),
        });
      }
      if (flow.cellPageBreaks !== undefined) return unavailable('AmbiguousTableCellPageBreaks');
      flow = { ...flow, cellPageBreaks };
    }
    if (supplied != null || completeCellFlow !== undefined) {
      if (flow.coverageRows !== undefined && !Array.isArray(flow.coverageRows))
        return unavailable('InvalidTableCellMeasurement');
      const invalidIndex = flow.rows.findIndex(
        (row) =>
          !row ||
          !Number.isFinite(row.y) ||
          row.y < 0 ||
          !(tableCellRowExtent(row) > 0 || isZeroAdvanceCellAnchor(row)) ||
          row.y + tableCellRowExtent(row) > flow.height + 1e-8,
      );
      if (invalidIndex >= 0)
        return {
          ...unavailable('InvalidTableCellMeasurement'),
          tableNode: table.tableNode,
          listNode: cell.listNode,
          rowY: flow.rows[invalidIndex]?.y,
          rowHeight: flow.rows[invalidIndex]?.height,
          flowHeight: flow.height,
        };
      const ownRows = (flow.coverageRows ?? flow.rows).filter(
        (row) => row.section === table.section && selectedIds.has(row.paragraph),
      );
      if (pageParagraphCoverage(selected, ownRows).state !== 'complete')
        return unavailable('IncompleteTableCellMeasurement');
    }
    measuredRows += flow.rows.length;
    flows.set(cell.listNode, flow);
  }
  const grid = tableGrid(table, {
    ...origin,
    columnWidths,
    sourceRowHorizontals,
    minRow: minimumRowHeight,
    contentSize: (cell) => {
      const insets = tableCellInsets(padding, cell);
      return {
        width: 0,
        height: Math.max(
          minima.get(cell),
          flows.get(cell.listNode).height + insets.top + insets.bottom,
        ),
      };
    },
  });
  const mandatoryCuts = [];
  if (table.pagination?.page_break === 'cell')
    for (const [index, cell] of table.cells.entries()) {
      const insets = tableCellInsets(padding, cell);
      const flow = flows.get(cell.listNode),
        cuts = flow.cellPageBreaks;
      if (cuts === undefined) continue;
      if (!Array.isArray(cuts) || cuts.length > flow.rows.length)
        return unavailable('InvalidTableCellPageBreak');
      for (const cut of cuts) {
        if (!cut || !Number.isFinite(cut.y) || cut.y < 0 || cut.y > flow.height)
          return unavailable('InvalidTableCellPageBreak');
        const position = grid.cells[index].y + insets.top + cut.y;
        if (!Number.isFinite(position)) return unavailable('InvalidTableCellPageBreak');
        mandatoryCuts.push(position);
      }
    }
  mandatoryCuts.sort((a, b) => a - b);
  try {
    for (const [index, cell] of table.cells.entries()) {
      const flow = flows.get(cell.listNode),
        insets = tableCellInsets(padding, cell);
      try {
        const alignment = cell.sourceVerticalAlignment ?? 0;
        const aligned = alignTableCellFlow(flow, grid.cells[index].height, insets, alignment);
        const box = grid.cells[index];
        const multiline = deferMultilineAlignment && cellFlowLineCount(flow, table.section) > 1;
        flows.set(
          cell.listNode,
          alignment !== 0 &&
            (multiline || cellCrossesMandatoryCut(box.y, box.y + box.height, mandatoryCuts))
            ? { ...flow, fragmentVerticalAlignment: alignment }
            : aligned,
        );
      } catch (error) {
        return {
          ...unavailable(error.message),
          tableNode: table.tableNode,
          listNode: cell.listNode,
          flowHeight: flow.height,
          cellHeight: grid.cells[index].height,
          topInset: insets.top,
          bottomInset: insets.bottom,
          verticalAlignment: cell.sourceVerticalAlignment ?? 0,
        };
      }
    }
  } catch (error) {
    return unavailable(error.message);
  }
  return { state: 'measured', grid, flows, rowCount: measuredRows };
}
