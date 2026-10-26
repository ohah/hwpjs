import { cellRowSplitPolicy } from './cell-row-split-policy.mjs';
import { tableCellInsets } from './table-insets.mjs';
import { planCellPageCuts } from './table-cell-page-cuts.mjs';
import { resolveTablePadding } from './table-source-insets.mjs';
import { projectNestedTableCellContent } from './nested-table-cell-projection.mjs';
import { nestedFloatingCellCutScenes } from './nested-floating-cell-cut-scenes.mjs';
import { tableCellBand, tableCellRowExtent, isZeroAdvanceCellAnchor } from './table-cell-band.mjs';
import { cellFloatingDrawingBands } from './cell-floating-drawing-bands.mjs';
import { pictureAnchorRows, pictureAnchorRow } from './picture-anchor-row-index.mjs';

// Convert owned cell measurements to local line bands; no placement policy.
export function planMeasuredCellCuts(
  table,
  measured,
  capacity,
  {
    origin,
    padding,
    maxRows = 20000,
    maxPages = 2000,
    firstCapacity = capacity,
    frameInsets,
    protectAtomicRows = false,
    pageCapacities,
    fragmentCapacity,
  } = {},
) {
  const unavailable = (error) => ({ state: 'unavailable', error });
  if (typeof protectAtomicRows !== 'boolean') return unavailable('InvalidMeasuredCellCuts');
  if (padding === 'source') {
    padding = resolveTablePadding(table, padding);
    if (!padding) return unavailable('MissingTableSourceInsets');
  }
  if (
    !Array.isArray(table?.cells) ||
    measured?.state !== 'measured' ||
    !Array.isArray(measured.grid?.cells) ||
    !(measured.flows instanceof Map) ||
    !origin ||
    ![origin.x, origin.y].every(Number.isFinite) ||
    measured.grid.cells.length !== table.cells.length ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1
  )
    return unavailable('InvalidMeasuredCellCuts');
  const bands = [],
    mandatoryCuts = [],
    seen = new Set();
  let rows = 0;
  for (const [index, cell] of table.cells.entries()) {
    const box = measured.grid.cells[index],
      flow = measured.flows.get(cell?.listNode),
      insets = cell && tableCellInsets(padding, cell);
    if (
      !cell ||
      !Array.isArray(cell.paragraphs) ||
      seen.has(cell.listNode) ||
      !box ||
      box.listNode !== cell.listNode ||
      !flow ||
      flow.limited ||
      !Array.isArray(flow.rows) ||
      !insets ||
      ![box.y, box.height].every(Number.isFinite) ||
      box.height <= 0 ||
      box.y < origin.y ||
      box.y + box.height > origin.y + measured.grid.height + 1e-8
    )
      return {
        ...unavailable('InvalidMeasuredCellCuts'),
        measurementStage: 'cell-geometry',
        listNode: cell?.listNode,
        cellY: box?.y,
        cellHeight: box?.height,
        measuredHeight: measured.grid.height,
      };
    seen.add(cell.listNode);
    const drawings = cellFloatingDrawingBands(table, cell, flow);
    if (drawings.state !== 'prepared') return drawings;
    for (const band of drawings.bands) {
      const offset = box.y - origin.y + insets.top;
      bands.push({ start: offset + band.start, end: offset + band.end });
    }
    const members = new Set(cell.paragraphs);
    if (flow.floatingTables !== undefined) {
      const floating = nestedFloatingCellCutScenes(
        { ...box, section: table.section, tableNode: table.tableNode, listNode: cell.listNode },
        flow,
        insets,
      );
      if (floating.state !== 'prepared') return floating;
      for (const scene of floating.scenes) {
        const start = box.y - origin.y + insets.top + scene.start;
        bands.push({ start, end: box.y - origin.y + insets.top + scene.end });
      }
    }
    if (flow.cellPageBreaks !== undefined) {
      if (!Array.isArray(flow.cellPageBreaks)) return unavailable('InvalidTableCellPageBreak');
      const paragraphs = new Set();
      for (const entry of flow.cellPageBreaks) {
        if (
          !entry ||
          entry.section !== table.section ||
          !members.has(entry.paragraph) ||
          paragraphs.has(entry.paragraph) ||
          !Number.isFinite(entry.y) ||
          entry.y < 0 ||
          !Number.isFinite(flow.height) ||
          entry.y >= flow.height ||
          !flow.rows.some(
            (row) =>
              row.section === entry.section &&
              row.paragraph === entry.paragraph &&
              row.y === entry.y,
          )
        )
          return unavailable('InvalidTableCellPageBreak');
        paragraphs.add(entry.paragraph);
        mandatoryCuts.push(box.y - origin.y + insets.top + entry.y);
      }
    }
    if (flow.flowPictures !== undefined && !Array.isArray(flow.flowPictures))
      return unavailable('InvalidMeasuredCellCuts');
    const hasOverlays = flow.flowPictures?.some((p) => [2, 3].includes(p?.flow?.textWrap));
    const pictureAnchors = hasOverlays
      ? pictureAnchorRows(flow.rows, { tableNode: table.tableNode, listNode: cell.listNode })
      : null;
    if (hasOverlays && !pictureAnchors) return unavailable('InvalidMeasuredCellCuts');
    const overlayNodes = new Set();
    for (const picture of flow.flowPictures ?? []) {
      const rectangle = picture?.flowRectangle ?? picture?.rectangle;
      const overlay = [2, 3].includes(picture?.flow?.textWrap);
      const pictureStart = box.y - origin.y + insets.top + (rectangle?.y ?? NaN);
      const pictureEnd = pictureStart + (rectangle?.height ?? NaN);
      if (
        !picture ||
        picture.section !== table.section ||
        !members.has(picture.paragraph) ||
        picture.cell?.tableNode !== table.tableNode ||
        picture.cell.listNode !== cell.listNode ||
        !rectangle ||
        ![
          rectangle.x,
          rectangle.y,
          rectangle.width,
          rectangle.height,
          rectangle.x + rectangle.width,
          rectangle.y + rectangle.height,
        ].every(Number.isFinite) ||
        rectangle.width <= 0 ||
        rectangle.height <= 0 ||
        (!overlay &&
          (pictureStart < 0 ||
            pictureEnd > measured.grid.height + 1e-8 ||
            pictureEnd <= box.y - origin.y ||
            pictureStart >= box.y - origin.y + box.height))
      )
        return {
          ...unavailable('InvalidMeasuredCellCuts'),
          measurementStage: 'cell-picture',
          listNode: cell.listNode,
          pictureNode: picture?.pictureNode,
          pictureParagraph: picture?.paragraph,
          pictureCell: picture?.cell,
          rectangle,
          cellContentHeight: box.height - insets.top - insets.bottom,
        };
      if (overlay) {
        if (
          !Number.isSafeInteger(picture.pictureNode) ||
          picture.pictureNode < 0 ||
          overlayNodes.has(picture.pictureNode) ||
          !Number.isSafeInteger(picture.anchorUnit) ||
          picture.anchorUnit < 0 ||
          !pictureAnchorRow(pictureAnchors, picture)
        )
          return unavailable('InvalidMeasuredCellCuts');
        overlayNodes.add(picture.pictureNode);
        continue;
      }
      const start = box.y - origin.y + insets.top + rectangle.y;
      bands.push({ start, end: start + rectangle.height });
    }
    if (flow.boxes?.length) {
      const nested = projectNestedTableCellContent(
        flow,
        { ...box, section: table.section, tableNode: table.tableNode, listNode: cell.listNode },
        insets,
        { pageOrdinal: 0 },
        maxRows - rows,
      );
      if (nested.state !== 'placed') return nested;
      for (const nestedBox of nested.boxes) {
        const start = nestedBox.y - origin.y;
        bands.push({ start, end: start + nestedBox.height });
      }
      for (const row of nested.rows) {
        if (++rows > maxRows) return unavailable('TableCellMeasurementLimit');
        if (!['text', 'gap'].includes(row.kind)) return unavailable('InvalidMeasuredCellCuts');
        if (row.kind === 'text') {
          const start = row.y - origin.y;
          bands.push({ start, end: start + row.height });
        }
      }
      continue;
    }
    for (const row of flow.rows) {
      if (++rows > maxRows) return unavailable('TableCellMeasurementLimit');
      const extent = tableCellRowExtent(row);
      if (
        !row ||
        !['text', 'gap'].includes(row.kind) ||
        row.section !== table.section ||
        !members.has(row.paragraph) ||
        !Number.isFinite(row.y) ||
        !Number.isFinite(extent) ||
        row.y < 0 ||
        (extent <= 0 && !isZeroAdvanceCellAnchor(row)) ||
        row.y + extent > box.height - insets.top - insets.bottom + 1e-8
      )
        return {
          ...unavailable('InvalidMeasuredCellCuts'),
          measurementStage: 'cell-row',
          listNode: cell.listNode,
          rowKind: row?.kind,
          rowY: row?.y,
          rowHeight: row?.height,
          cellContentHeight: box.height - insets.top - insets.bottom,
        };
      if (row.kind !== 'text' && row.createdHost === undefined) continue;
      if (isZeroAdvanceCellAnchor(row)) continue;
      bands.push({
        ...tableCellBand(box.y - origin.y + insets.top, row),
        listNode: cell.listNode,
        paragraph: row.paragraph,
      });
    }
  }
  if (protectAtomicRows) {
    const policy = cellRowSplitPolicy(table, measured, { top: frameInsets?.top ?? 0 });
    if (policy.state !== 'prepared') return policy;
    for (const band of policy.bands)
      if (!band.splittable && band.end - band.start <= capacity)
        bands.push({ start: band.start, end: band.end });
  }
  if (frameInsets !== undefined) {
    if (
      !frameInsets ||
      ![frameInsets.top, frameInsets.bottom].every((v) => Number.isFinite(v) && v >= 0) ||
      frameInsets.top + frameInsets.bottom >= measured.grid.height
    )
      return unavailable('InvalidTableOuterInsets');
    if (bands.length) {
      const first = bands.reduce((a, b) => (a.start <= b.start ? a : b)),
        last = bands.reduce((a, b) => (a.end >= b.end ? a : b));
      // A directive before the first content belongs before its leading outer space.
      for (let i = 0; i < mandatoryCuts.length; i++)
        if (mandatoryCuts[i] === first.start) mandatoryCuts[i] = 0;
      if (frameInsets.top > 0) first.start = 0;
      if (frameInsets.bottom > 0) last.end = measured.grid.height;
    }
  }
  const result = planCellPageCuts(measured.grid.height, bands, capacity, {
    maxPages,
    firstCapacity,
    mandatoryCuts,
    pageCapacities,
    fragmentCapacity,
  });
  if (result.state === 'unavailable' && result.error === 'TableCellPageBreakIntersectsContent') {
    const crossing = bands.find((band) => band.start < result.cellCut && result.cellCut < band.end);
    if (crossing?.listNode !== undefined)
      return {
        ...result,
        cellCutListNode: crossing.listNode,
        cellCutParagraph: crossing.paragraph,
        cellCutRowStart: crossing.start,
        cellCutRowEnd: crossing.end,
      };
  }
  return result;
}
