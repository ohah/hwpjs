import { translatePicturePlacement } from './picture-placement-translation.mjs';
import { tableCellInsets } from './table-insets.mjs';
import { projectNestedTableCellContent } from './nested-table-cell-projection.mjs';
import { projectNestedFloatingCellContent } from './nested-floating-cell-content.mjs';
import { tableCellRowExtent, isZeroAdvanceCellAnchor } from './table-cell-band.mjs';
/** Project already measured cell rows into an explicit table page plan. */
export function projectTablePageFragments(
  table,
  grid,
  cellFlows,
  plan,
  { origin, padding, maxRows = 20000 } = {},
) {
  const unavailable = (error) => ({ state: 'unavailable', error });
  if (
    plan?.state !== 'planned' ||
    !Array.isArray(plan.fragments) ||
    !Array.isArray(table?.cells) ||
    table.cells.some((cell) => !cell || !tableCellInsets(padding, cell)) ||
    !Array.isArray(grid?.cells) ||
    !(cellFlows instanceof Map) ||
    !origin ||
    ![origin.x, origin.y].every(Number.isFinite) ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1 ||
    grid.cells.length !== table.cells.length
  )
    return unavailable('InvalidTablePageProjection');
  if (plan.bodyRows !== undefined && !Array.isArray(plan.bodyRows))
    return unavailable('InvalidTablePageProjection');
  const bodyRows = plan.bodyRows ?? [];
  if (
    bodyRows.some(
      (row) =>
        !row ||
        ![row.x, row.y, row.height].every(Number.isFinite) ||
        row.height <= 0 ||
        !Number.isSafeInteger(row.pageOrdinal) ||
        row.pageOrdinal < 0,
    )
  )
    return unavailable('InvalidTablePageProjection');
  if (bodyRows.length > maxRows) return unavailable('TablePageProjectionLimit');
  for (const flow of cellFlows.values())
    if (flow?.cellPageBreaks !== undefined) {
      if (!Array.isArray(flow.cellPageBreaks)) return unavailable('InvalidTableCellPageBreak');
      if (flow.cellPageBreaks.length) return unavailable('UnsupportedTableCellPageBreakProjection');
    }
  const rows = [...bodyRows],
    boxes = [],
    flowPictures = [],
    tableCaptionBounds = [],
    emitted = new Set();
  for (const fragment of plan.fragments) {
    if (
      !fragment ||
      !Array.isArray(fragment.cells) ||
      ![fragment.x, fragment.y, fragment.offset].every(Number.isFinite) ||
      !Number.isSafeInteger(fragment.startRow) ||
      !Number.isSafeInteger(fragment.endRow) ||
      fragment.startRow < 0 ||
      fragment.endRow <= fragment.startRow ||
      !Number.isSafeInteger(fragment.pageOrdinal) ||
      fragment.pageOrdinal < 0
    )
      return unavailable('InvalidTablePageProjection');
    if (fragment.columnOrdinal !== undefined) {
      const page = Array.isArray(plan.pages)
        ? plan.pages.find((page) => page?.ordinal === fragment.pageOrdinal)
        : null;
      if (
        !Number.isSafeInteger(fragment.columnOrdinal) ||
        fragment.columnOrdinal < 0 ||
        (page?.columns !== undefined &&
          (!Array.isArray(page.columns) || fragment.columnOrdinal >= page.columns.length))
      )
        return unavailable('InvalidTablePageProjection');
    }
    for (const index of fragment.cells) {
      if (
        !Number.isInteger(index) ||
        index < 0 ||
        index >= table.cells.length ||
        emitted.has(index)
      )
        return unavailable('InvalidTablePageProjection');
      emitted.add(index);
      const cell = table.cells[index],
        sourceBox = grid.cells[index],
        flow = cellFlows.get(cell?.listNode);
      const insets = tableCellInsets(padding, cell);
      if (
        !cell ||
        !sourceBox ||
        !flow ||
        !Array.isArray(flow.rows) ||
        flow.limited ||
        cell.row < fragment.startRow ||
        cell.row + cell.rowSpan > fragment.endRow ||
        sourceBox.listNode !== cell.listNode
      )
        return unavailable('IncompleteTablePageCell');
      const box = {
        ...sourceBox,
        x: fragment.x + sourceBox.x - origin.x,
        y: fragment.y + sourceBox.y - origin.y - fragment.offset,
        section: table.section,
        tableNode: table.tableNode,
        pageOrdinal: fragment.pageOrdinal,
        ...(fragment.columnOrdinal !== undefined ? { columnOrdinal: fragment.columnOrdinal } : {}),
        referenceBoxes: fragment.referenceBoxes,
      };
      if (
        ![box.x, box.y, box.width, box.height, box.x + box.width, box.y + box.height].every(
          Number.isFinite,
        ) ||
        box.width <= insets.left + insets.right ||
        box.height < insets.top + insets.bottom
      )
        return unavailable('InvalidTablePageProjection');
      boxes.push(box);
      if (flow.floatingTables !== undefined) {
        const floating = projectNestedFloatingCellContent(
          box,
          flow,
          flow.floatingTables,
          {
            pageOrdinal: fragment.pageOrdinal,
            columnOrdinal: fragment.columnOrdinal,
            referenceBoxes: fragment.referenceBoxes,
          },
          { insets, maxRows: maxRows - rows.length },
        );
        if (floating.state !== 'placed') return floating;
        rows.push(...floating.rows);
        boxes.push(...floating.boxes);
        flowPictures.push(...(floating.flowPictures ?? []));
      }
      for (const picture of flow.flowPictures ?? []) {
        if (
          !picture ||
          picture.cell?.tableNode !== table.tableNode ||
          picture.cell?.listNode !== cell.listNode ||
          picture.section !== table.section ||
          !picture.rectangle
        )
          return unavailable('InvalidTablePagePicture');
        const moved = translatePicturePlacement(picture, box.x + insets.left, box.y + insets.top, {
          pageOrdinal: fragment.pageOrdinal,
          columnOrdinal: fragment.columnOrdinal,
          referenceBoxes: fragment.referenceBoxes,
        });
        if (moved.state !== 'translated') return unavailable('InvalidTablePagePicture');
        flowPictures.push(moved.picture);
      }
      if (flow.boxes?.length) {
        const nested = projectNestedTableCellContent(
          flow,
          box,
          insets,
          fragment,
          maxRows - rows.length,
        );
        if (nested.state !== 'placed') return nested;
        rows.push(...nested.rows);
        boxes.push(...nested.boxes);
        flowPictures.push(...(nested.flowPictures ?? []));
        tableCaptionBounds.push(...(nested.tableCaptionBounds ?? []));
        continue;
      }
      for (const row of flow.rows) {
        if (rows.length >= maxRows) return unavailable('TablePageProjectionLimit');
        const extent = tableCellRowExtent(row);
        if (
          !row ||
          ![row.y, extent, row.x ?? 0, row.paragraphX ?? 0].every(Number.isFinite) ||
          row.y < 0 ||
          (extent <= 0 && !isZeroAdvanceCellAnchor(row)) ||
          row.y + extent > box.height - insets.top - insets.bottom + 1e-8
        )
          return unavailable('TablePageCellOverflow');
        const projected = {
          ...row,
          ...(flow.columns ? { cellColumnOrdinal: row.columnOrdinal } : {}),
          x: box.x + insets.left + (row.x ?? 0),
          y: box.y + insets.top + row.y,
          section: table.section,
          tableNode: table.tableNode,
          listNode: cell.listNode,
          pageOrdinal: fragment.pageOrdinal,
          columnOrdinal: fragment.columnOrdinal,
          referenceBoxes: fragment.referenceBoxes,
        };
        if (
          ![projected.x, projected.y, projected.y + projected.height].every(Number.isFinite) ||
          (row.width !== undefined &&
            (!Number.isFinite(row.width) ||
              row.width < 0 ||
              !Number.isFinite(projected.x + row.width)))
        )
          return unavailable('InvalidTablePageProjection');
        rows.push(projected);
      }
    }
  }
  if (emitted.size !== table.cells.length) return unavailable('IncompleteTablePageCell');
  return {
    state: 'placed',
    rows: rows.toSorted(
      (a, b) =>
        a.pageOrdinal - b.pageOrdinal ||
        (a.columnOrdinal ?? 0) - (b.columnOrdinal ?? 0) ||
        a.y - b.y ||
        a.x - b.x,
    ),
    boxes,
    ...(flowPictures.length ? { flowPictures } : {}),
    ...(tableCaptionBounds.length ? { tableCaptionBounds } : {}),
    pages: plan.pages,
    height: plan.height,
    spatialRows: true,
    pageLayoutMode: 'measured-body',
    limited: false,
  };
}
