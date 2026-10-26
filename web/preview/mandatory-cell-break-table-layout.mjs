import { blockTableFlowAnchors } from './block-table-flow-anchors.mjs';
import { supportsSplitTableCaption } from './table-caption-fragment.mjs';
import { planCellTableBodyPages } from './table-cell-body-plan.mjs';
import { projectCellPageCuts } from './table-cell-page-projection.mjs';
import { paginateBodyRows } from './page-row-flow.mjs';
import { prepareTablePageBands, tablePageBandFragment } from './table-page-bands.mjs';
import { projectTablePageFragments } from './table-page-fragments.mjs';
import { resolveTablePadding } from './table-source-insets.mjs';
import { tableInsets } from './table-insets.mjs';
import { frameMeasuredCellTable } from './table-cell-outer-frame.mjs';
import { repeatedCellTableBody } from './repeated-cell-table-body.mjs';
import { projectCellTableHeaders } from './table-cell-header-projection.mjs';
import { inlineTableGroupRows } from './inline-table-group-rows.mjs';
import { automaticCellCutMode } from './automatic-cell-cut-policy.mjs';
import { cellCutBodyOptionsError } from './cell-cut-body-options.mjs';
import { wholeTableNoteReferences } from './whole-table-note-references.mjs';
import { paginateRepeatedTableBands } from './repeated-table-band-pagination.mjs';
import { projectRepeatedTableHeaders } from './repeated-table-header-projection.mjs';

// Replay the same body cursor for each CELL boundary; keep source tables intact.
export function layoutMandatoryCellBreakTable(entries, sequence, setting, flows, options = {}) {
  const fail = (error, details = {}) => ({ state: 'unavailable', error, ...details });
  if (
    !Array.isArray(entries) ||
    !entries.length ||
    entries.length > 10000 ||
    !Array.isArray(sequence) ||
    !Array.isArray(flows) ||
    flows.some((flow) => !flow)
  )
    return fail('InvalidMultipleTablePlan');
  if (options.paginateRows !== undefined && typeof options.paginateRows !== 'function')
    return fail('InvalidPageFlowBounds');
  if (cellCutBodyOptionsError(options))
    return fail('UnsupportedTableCellPageBreakCombination', { policyReason: 'custom-body-flow' });
  const maxRows = options.maxRows ?? 20000,
    maxInspections = options.maxInspections ?? 400000;
  if (
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1 ||
    !Number.isSafeInteger(maxInspections) ||
    maxInspections < 1 ||
    (options.minimumRowPage !== undefined && typeof options.minimumRowPage !== 'function')
  )
    return fail('InvalidPageFlowBounds');
  const prepared = [],
    owners = new Set();
  for (const entry of entries) {
    const table = entry?.table,
      margins = tableInsets(entry?.outerInsets ?? 0);
    if (!table || owners.has(`${table.section}:${table.tableNode}`))
      return fail('UnsupportedTablePageHost');
    owners.add(`${table.section}:${table.tableNode}`);
    if (
      entry.paperFlow ||
      (entry.captionReservation &&
        (entry.captionReservation.state !== 'reserved' ||
          (entry.splitMode !== 'whole' && !supportsSplitTableCaption(table)))) ||
      !margins
    )
      return fail('UnsupportedTableCellPageBreakCombination', {
        section: table.section,
        tableNode: table.tableNode,
        policyReason: entry.paperFlow
          ? 'paper-flow'
          : entry.captionReservation
            ? 'caption'
            : 'outer-margins',
      });
    if (
      entry.measured?.state !== 'measured' ||
      !(entry.measured.flows instanceof Map) ||
      !Array.isArray(entry.rowHeights) ||
      !Array.isArray(entry.measured.grid?.rows) ||
      entry.rowHeights.length !== entry.measured.grid.rows.length ||
      entry.rowHeights.some((height, index) => height !== entry.measured.grid.rows[index])
    )
      return fail('AmbiguousTableMeasurement');
    const explicitCuts = [...entry.measured.flows.values()].some(
      (flow) => flow?.cellPageBreaks?.length,
    );
    if (entry.inlineFlow && entry.splitMode !== 'whole')
      return fail('UnsupportedTableCellPageBreakCombination', {
        section: table.section,
        tableNode: table.tableNode,
        policyReason: 'inline-split',
      });
    if (
      explicitCuts &&
      (table.pagination?.page_break !== 'cell' || entry.splitMode !== 'row-bands')
    )
      return fail('UnsupportedTableCellPageBreakCombination', {
        section: table.section,
        tableNode: table.tableNode,
        policyReason: 'explicit-cut-mode',
      });
    const bandPlan = prepareTablePageBands(
      table,
      entry.rowHeights,
      entry.splitMode,
      entry.outerInsets,
    );
    if (bandPlan.state !== 'prepared') return bandPlan;
    const repeated =
      table.pagination?.page_break === 'cell' && bandPlan.repeatedHeader
        ? repeatedCellTableBody(table, entry.measured)
        : { state: 'none' };
    if (repeated.state === 'unavailable') return repeated;
    const header = repeated.state === 'prepared' ? repeated.header : null;
    const cutMode = automaticCellCutMode(entry, setting, options, flows);
    const cellCuts = header || explicitCuts || cutMode !== 'none';
    if (entry.inline && cellCuts)
      return fail('UnsupportedTableCellPageBreakCombination', {
        section: table.section,
        tableNode: table.tableNode,
        policyReason: 'inline-cell-cuts',
      });
    if (cellCuts && (table.pagination?.page_break !== 'cell' || entry.splitMode !== 'row-bands'))
      return fail('UnsupportedTableCellPageBreakCombination', {
        section: table.section,
        tableNode: table.tableNode,
        policyReason: 'cell-cut-mode',
      });
    const bands = cellCuts ? null : bandPlan;
    const host = flows.find(
      (flow) => flow.section === table.section && flow.paragraph === table.hostParagraph,
    );
    if (!host || host.top_level !== true) return fail('UnsupportedTablePageHost');
    const frame = cellCuts
      ? frameMeasuredCellTable(header ? repeated.measured : entry.measured, margins)
      : { state: 'framed', measured: entry.measured };
    if (frame.state !== 'framed') return frame;
    prepared.push({
      protectAtomicRows: !explicitCuts && cutMode === 'residual',
      entry,
      host,
      bands,
      margins,
      header,
      cellTable: header ? repeated.table : table,
      measured: frame.measured,
      frameInsets: frame.frameInsets,
    });
  }
  const rows = [],
    seen = new Set(),
    minimumPages = new Map();
  const bandPlans = prepared.map((item) => item.bands);
  const paginate = bandPlans.some((plan) => plan?.repeatedHeader)
    ? (rows, setting, flows, bounds) =>
        paginateRepeatedTableBands(
          rows,
          setting,
          flows,
          { ...bounds, paginateRows: options.paginateRows ?? paginateBodyRows },
          bandPlans,
        )
    : (options.paginateRows ?? paginateBodyRows);
  const minimumRowPage = (row) => {
    const supplied = options.minimumRowPage === undefined ? 0 : options.minimumRowPage(row);
    if (!Number.isSafeInteger(supplied) || supplied < 0) return NaN;
    return Math.max(
      supplied,
      minimumPages.get(`${row.tableIndex}:${row.mandatoryCellFragment}`) ?? 0,
    );
  };
  let inspections = 0;
  for (const item of sequence) {
    if (
      !item ||
      item.inlineTableAnchors !== undefined ||
      item.inlineTableAnchor !== undefined ||
      item.cellFragment !== undefined ||
      item.mandatoryCellFragment !== undefined ||
      item.bandOrdinal !== undefined ||
      item.repeatedTableHeader !== undefined
    )
      return fail('InvalidMultipleTablePlan');
    if (item.inlineTableIndices !== undefined) {
      if (item.tableIndex !== undefined) return fail('InvalidMultipleTablePlan');
      const grouped = inlineTableGroupRows(entries, item.inlineTableIndices);
      if (grouped.state !== 'grouped') return grouped;
      for (const index of item.inlineTableIndices) {
        if (seen.has(index)) return fail('InvalidMultipleTablePlan');
        seen.add(index);
      }
      rows.push(
        ...grouped.rows.map((row) => ({
          ...row,
          inlineTables: row.inlineTableAnchors.map((item) => ({
            unit: item.anchor.unit,
            tableNode: item.anchor.tableNode,
          })),
        })),
      );
    } else if (item.tableIndex === undefined) rows.push(item);
    else {
      const index = item.tableIndex;
      if (!Number.isSafeInteger(index) || index < 0 || index >= entries.length || seen.has(index))
        return fail('InvalidMultipleTablePlan');
      seen.add(index);
      const current = prepared[index],
        { entry, host, bands, margins } = current;
      if (entry.inlineFlow) {
        const grouped = inlineTableGroupRows(entries, [index]);
        if (grouped.state !== 'grouped') return grouped;
        rows.push(
          ...grouped.rows.map((row) => ({
            ...row,
            inlineTables: row.inlineTableAnchors.map((item) => ({
              unit: item.anchor.unit,
              tableNode: item.anchor.tableNode,
            })),
          })),
        );
      } else if (bands)
        rows.push(
          ...bands.rows.map((row) => ({
            ...row,
            tableIndex: index,
            ...(entry.inline
              ? {
                  inlineTableFit: {
                    width: entry.measured.grid.width + margins.left + margins.right,
                    paragraphShape: entry.host?.paragraphShape,
                  },
                }
              : {}),
          })),
        );
      else {
        inspections += rows.length;
        if (inspections > maxInspections) return fail('TablePagePlanLimit');
        const plan = planCellTableBodyPages(current.cellTable, current.measured, setting, host, {
          ...options,
          paginateRows: paginate,
          origin: entry.origin,
          padding: entry.padding,
          protectAtomicRows: current.protectAtomicRows,
          frameInsets: current.frameInsets,
          prefixHeight: current.header?.height ?? 0,
          beforeRows: rows,
          bodyFlows: flows,
          minimumRowPage,
        });
        if (plan.state !== 'planned')
          return {
            ...plan,
            section: entry.table.section,
            tableNode: entry.table.tableNode,
            paragraph: entry.table.hostParagraph,
          };
        current.cuts = plan.cuts;
        current.expectedPlacements = plan.placements;
        current.measured = plan.measured;
        current.frameInsets = plan.frameInsets;
        current.leadingGap = plan.leadingGap;
        for (const [cellFragment] of plan.cuts.fragments.entries()) {
          minimumPages.set(`${index}:${cellFragment}`, plan.placements[cellFragment].pageOrdinal);
          rows.push({
            kind: 'gap',
            section: entry.table.section,
            paragraph: entry.table.hostParagraph,
            height: plan.placements[cellFragment].height,
            tableIndex: index,
            mandatoryCellFragment: cellFragment,
            ...(plan.placements[cellFragment].cellReferenceRows
              ? {
                  cellTableNode: entry.table.tableNode,
                  cellReferenceRows: plan.placements[cellFragment].cellReferenceRows,
                }
              : {}),
          });
        }
      }
    }
    if (rows.length > maxRows) return fail('TablePagePlanLimit');
  }
  if (seen.size !== entries.length) return fail('IncompleteMultipleTablePlan');
  const references = wholeTableNoteReferences(entries, rows, options.columnBottom);
  if (references.state !== 'bound') return references;
  const layout = paginate(references.rows, setting, flows, { ...options, minimumRowPage });
  if (!layout || typeof layout !== 'object') return fail('InvalidCellBodyPagination');
  if (layout.state !== 'paginated') return layout;
  if (!Array.isArray(layout.rows) || !Array.isArray(layout.pages))
    return fail('InvalidCellBodyPagination');
  if (layout.limited) return fail('TablePagePlanLimit');
  const output = layout.rows.filter((row) => row.tableIndex === undefined),
    boxes = [],
    flowPictures = [],
    tableCaptionBounds = [],
    repeatedTableHeaderRows = [],
    repeatedTableHeaderBoxes = [];
  const placementsByTable = entries.map(() => []);
  const repeatedByTable = entries.map(() => []);
  for (const row of layout.rows) {
    if (row.repeatedTableHeader === true) {
      repeatedByTable[row.tableIndex].push(row);
      continue;
    }
    if (row.tableIndex !== undefined) placementsByTable[row.tableIndex].push(row);
    for (const item of row.inlineTableAnchors ?? [])
      placementsByTable[item.tableIndex].push({
        ...row,
        bandOrdinal: 0,
        inlineTableAnchor: item.anchor,
      });
  }
  for (const [index, current] of prepared.entries()) {
    if (!current.expectedPlacements) continue;
    const actual = placementsByTable[index];
    if (
      actual.length !== current.expectedPlacements.length ||
      actual.some(
        (row, fragment) =>
          row.mandatoryCellFragment !== fragment ||
          ['x', 'y', 'height', 'pageOrdinal'].some(
            (key) => row[key] !== current.expectedPlacements[fragment][key],
          ),
      )
    )
      return fail('TablePageCapacityPlacementMismatch', {
        section: current.entry.table.section,
        tableNode: current.entry.table.tableNode,
      });
  }
  if (layout.pictureCaptionRows !== undefined) {
    if (!Array.isArray(layout.pictureCaptionRows)) return fail('InvalidCellBodyPagination');
    output.push(...layout.pictureCaptionRows);
  }
  for (const [
    index,
    { entry, bands, cuts, margins, measured, frameInsets, header, cellTable, leadingGap = 0 },
  ] of prepared.entries()) {
    const placements = placementsByTable[index];
    if (output.length >= maxRows) return fail('TablePageProjectionLimit');
    const projectionOptions = {
      origin: entry.origin,
      padding: resolveTablePadding(entry.table, entry.padding),
      frameInsets,
      maxRows: maxRows - output.length,
      maxInspections,
    };
    const projected = bands
      ? projectTablePageFragments(
          entry.table,
          entry.measured.grid,
          entry.measured.flows,
          {
            state: 'planned',
            fragments: placements.map((row) => tablePageBandFragment(bands, row)),
            pages: layout.pages,
            height: layout.height,
          },
          projectionOptions,
        )
      : projectCellPageCuts(
          cellTable,
          measured,
          cuts,
          placements.map((row) => ({
            ...row,
            x: row.x + margins.left,
            y: row.y + (header?.height ?? 0),
          })),
          projectionOptions,
        );
    if (projected.state !== 'placed') return projected;
    output.push(...projected.rows);
    boxes.push(...projected.boxes);
    flowPictures.push(...(projected.flowPictures ?? []));
    tableCaptionBounds.push(...(projected.tableCaptionBounds ?? []));
    if (bands && repeatedByTable[index].length) {
      const fragments = repeatedByTable[index].map((row) => ({
        ...tablePageBandFragment(bands, row),
        y: row.y,
      }));
      const replay = projectRepeatedTableHeaders(entry.table, entry.measured, fragments, {
        ...projectionOptions,
        maxRows: maxRows - output.length - repeatedTableHeaderRows.length,
      });
      if (replay.state !== 'placed') return replay;
      repeatedTableHeaderRows.push(...replay.rows);
      repeatedTableHeaderBoxes.push(...replay.boxes);
    }
    if (header) {
      const headers = projectCellTableHeaders(
        entry.table,
        entry.measured,
        placements.map((row) => ({ ...row, x: row.x + margins.left })),
        {
          origin: entry.origin,
          padding: projectionOptions.padding,
          firstTop: margins.top + leadingGap,
          maxRows: maxRows - output.length - repeatedTableHeaderRows.length,
        },
      );
      if (headers.state !== 'placed') return headers;
      output.push(...headers.rows);
      boxes.push(...headers.boxes);
      repeatedTableHeaderRows.push(...headers.repeatedTableHeaderRows);
      repeatedTableHeaderBoxes.push(...headers.repeatedTableHeaderBoxes);
    }
  }
  if (output.length + repeatedTableHeaderRows.length > maxRows)
    return fail('TablePageProjectionLimit');
  const sourceAnchors = blockTableFlowAnchors(entries, layout.rows);
  if (sourceAnchors.state !== 'bound') return sourceAnchors;
  return {
    state: 'placed',
    rows: output.toSorted((a, b) => a.pageOrdinal - b.pageOrdinal || a.y - b.y || a.x - b.x),
    boxes,
    ...(flowPictures.length ? { flowPictures } : {}),
    ...(tableCaptionBounds.length ? { tableCaptionBounds } : {}),
    ...(repeatedTableHeaderRows.length
      ? { repeatedTableHeaderRows, repeatedTableHeaderBoxes }
      : {}),
    ...(layout.pictureReservations ? { pictureReservations: layout.pictureReservations } : {}),
    ...(sourceAnchors.anchors.length
      ? { flowAnchors: [...(layout.flowAnchors ?? []), ...sourceAnchors.anchors] }
      : {}),
    pages: layout.pages,
    height: layout.height,
    pageLayoutMode: 'measured-body',
    spatialRows: true,
    limited: false,
  };
}
