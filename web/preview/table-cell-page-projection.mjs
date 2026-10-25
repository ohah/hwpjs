import { translatePicturePlacement } from "./picture-placement-translation.mjs";
import { createCellRowBandIndex } from "./cell-row-band-index.mjs";
import { nestedCellPageReferences } from "./nested-cell-page-references.mjs";
import { planMeasuredCellCuts } from "./table-measured-cell-cuts.mjs";
import { resolveTablePadding } from "./table-source-insets.mjs";
import { tableCellInsets } from "./table-insets.mjs";
import { prepareNestedCellCutIndex } from "./nested-cell-cut-index.mjs";
import { nestedFloatingCellCutScenes } from "./nested-floating-cell-cut-scenes.mjs";
import { projectNestedFloatingCellContent } from "./nested-floating-cell-content.mjs";
import { tableCellBand, isZeroAdvanceCellAnchor } from "./table-cell-band.mjs";
import { cellFloatingDrawingBands } from "./cell-floating-drawing-bands.mjs";
import { alignCellFragmentFlow } from "./cell-fragment-alignment.mjs";
import { pictureAnchorRow } from "./picture-anchor-row-index.mjs";

// Project explicit cuts and page placements; source pagination stays upstream.
export function projectCellPageCuts(table, measured, plan, placements, { origin, padding, frameInsets, maxRows = 20000, maxInspections = 400000, maxFragments = 2000 } = {}) {
  const unavailable = error => ({ state: "unavailable", error });
  if (plan?.state !== "planned" || !Array.isArray(plan.fragments) || !plan.fragments.length || !Array.isArray(placements) || placements.length !== plan.fragments.length || !Number.isSafeInteger(maxInspections) || maxInspections < 1 || !Number.isSafeInteger(maxFragments) || maxFragments < 1) return unavailable("InvalidCellPageProjection");
  if (plan.fragments.length > maxFragments) return { ...unavailable("CellPageProjectionLimit"), layoutStage: "cell-fragments", tableNode: table.tableNode, fragments: plan.fragments.length, maxFragments };
  padding = resolveTablePadding(table, padding);
  const validation = planMeasuredCellCuts(table, measured, measured?.grid?.height, { origin, padding, frameInsets, maxRows });
  if (validation.state !== "planned") return validation;
  let end = 0;
  for (const fragment of plan.fragments) {
    if (!fragment || ![fragment.start, fragment.end, fragment.height].every(Number.isFinite) || fragment.start !== end || fragment.end <= fragment.start || fragment.height !== fragment.end - fragment.start) return unavailable("InvalidCellPageProjection");
    end = fragment.end;
  }
  if (end !== measured.grid.height) return unavailable("InvalidCellPageProjection");
  for (const cut of validation.mandatoryCuts ?? []) if (cut > 0 && !plan.fragments.some(fragment => fragment.start === cut)) return unavailable("MissingTableCellPageBreak");
  const rows = [], boxes = [], flowPictures = [];
  let inspections = 0, previousPage = -1;
  const rowIndexes = new WeakMap();
  const nestedIndexes = new WeakMap();
  const limit = layoutStage => ({ ...unavailable("CellPageProjectionLimit"), layoutStage, tableNode: table.tableNode,
    inspections, maxInspections, projectedRows: rows.length, maxRows });
  for (const [fragmentIndex, fragment] of plan.fragments.entries()) {
    const placement = placements[fragmentIndex];
    if (!placement || ![placement.x, placement.y].every(Number.isFinite) || !Number.isSafeInteger(placement.pageOrdinal) || placement.pageOrdinal <= previousPage) return unavailable("InvalidCellPageProjection");
    previousPage = placement.pageOrdinal;
    for (const [index, cell] of table.cells.entries()) {
      if (++inspections > maxInspections) return limit("cell-owners");
      const source = measured.grid.cells[index], insets = tableCellInsets(padding, cell);
      let flow = measured.flows.get(cell.listNode);
      const top = source.y - origin.y, bottom = top + source.height;
      const start = Math.max(top, fragment.start), finish = Math.min(bottom, fragment.end);
      if (finish <= start) continue;
      try { flow=alignCellFragmentFlow(flow,top,start,finish,insets); }
      catch(error){return unavailable(error.message);}
      const drawings = cellFloatingDrawingBands(table, cell, flow);
      if (drawings.state !== "prepared") return drawings;
      for (const band of drawings.bands) {
        const start = top + insets.top + band.start, end = top + insets.top + band.end;
        if (end > fragment.start && start < fragment.end && (start < fragment.start || end > fragment.end)) return unavailable("SplitCellFloatingDrawing");
      }
      const x = placement.x + source.x - origin.x, y = placement.y + start - fragment.start;
      if (![x, y, source.width, x + source.width, y + finish - start].every(Number.isFinite) || source.width <= 0) return unavailable("InvalidCellPageProjection");
      boxes.push({ ...source, x, y, height: finish - start, section: table.section, tableNode: table.tableNode, pageOrdinal: placement.pageOrdinal,
        continuesBefore: start > top, continuesAfter: finish < bottom, referenceBoxes: placement.referenceBoxes });
      if(flow.floatingTables!==undefined){
        const parent={...source,section:table.section,tableNode:table.tableNode,listNode:cell.listNode};
        const floating=nestedFloatingCellCutScenes(parent,flow,insets);
        if(floating.state!=="prepared")return floating;
        const selected=[];
        for(const scene of floating.scenes){
          if(++inspections>maxInspections)return limit("cell-floating-tables");
          const sceneStart=top+insets.top+scene.start,sceneEnd=top+insets.top+scene.end;
          if(sceneEnd<=fragment.start||sceneStart>=fragment.end)continue;
          if(sceneStart<fragment.start||sceneEnd>fragment.end)return unavailable("SplitCellFloatingContent");
          selected.push(scene.entry);
        }
        if(selected.length){
          if(rows.length>=maxRows)return limit("cell-floating-table-rows");
          const projected=projectNestedFloatingCellContent({...parent,x,y:placement.y+top-fragment.start},flow,selected,
            {pageOrdinal:placement.pageOrdinal,columnOrdinal:placement.columnOrdinal,referenceBoxes:placement.referenceBoxes},{insets,maxRows:maxRows-rows.length});
          if(projected.state!=="placed")return projected;
          rows.push(...projected.rows);boxes.push(...projected.boxes);flowPictures.push(...(projected.flowPictures??[]));
        }
      }
      const hasOverlayPictures = flow.flowPictures?.some(p => [2, 3].includes(p?.flow?.textWrap));
      const cellPictureAnchors = hasOverlayPictures ? pictureAnchorRows(flow.rows, { tableNode: table.tableNode, listNode: cell.listNode }) : null;
      if (hasOverlayPictures && !cellPictureAnchors) return unavailable("InvalidCellPageProjection");
      for (const picture of flow.flowPictures ?? []) {
        if (++inspections > maxInspections) return limit("cell-pictures");
        const extent = picture.flowRectangle ?? picture.rectangle;
        const pictureTop = top + insets.top + extent.y, pictureBottom = pictureTop + extent.height;
        if ([2, 3].includes(picture.flow?.textWrap)) {
          const anchor = pictureAnchorRow(cellPictureAnchors, picture);
          if (!anchor) return unavailable("InvalidCellPageProjection");
          const anchorTop = top + insets.top + anchor.y;
          if (anchorTop < fragment.start || anchorTop >= fragment.end && !(isZeroAdvanceCellAnchor(anchor) && fragment.end === bottom && anchorTop === bottom)) continue;
        } else {
          if (pictureBottom <= fragment.start || pictureTop >= fragment.end) continue;
          if (pictureTop < fragment.start || pictureBottom > fragment.end) return unavailable("SplitTableCellPicture");
        }
        const moved = translatePicturePlacement(picture, x + insets.left, placement.y + top + insets.top - fragment.start,
          {pageOrdinal:placement.pageOrdinal,columnOrdinal:placement.columnOrdinal,referenceBoxes:placement.referenceBoxes});
        if (moved.state !== "translated") return unavailable("InvalidCellPageProjection");
        flowPictures.push(moved.picture);
      }
      if (flow.boxes?.length) {
        let cells = nestedIndexes.get(flow);
        if (!cells) nestedIndexes.set(flow, cells = new Map());
        let prepared = cells.get(cell.listNode);
        if (!prepared) {
          prepared = prepareNestedCellCutIndex(flow, { ...source, section: table.section, tableNode: table.tableNode, listNode: cell.listNode },
            insets, { pageOrdinal: placement.pageOrdinal, columnOrdinal: placement.columnOrdinal, referenceBoxes: placement.referenceBoxes }, origin, maxRows);
          if (prepared.state !== "prepared") return prepared;
          inspections += prepared.inspections;
          if (inspections > maxInspections) return limit("cell-nested-index-build");
          cells.set(cell.listNode, prepared);
        }
        const { nested, pictureAnchors } = prepared;
        const move = item => {
          const shifted = { ...item, x: placement.x + item.x - origin.x, y: placement.y + item.y - origin.y - fragment.start,
            pageOrdinal: placement.pageOrdinal, columnOrdinal: placement.columnOrdinal,
            referenceBoxes: nestedCellPageReferences(item, placement, placement.x - origin.x, placement.y - origin.y - fragment.start) };
          if (item.pageClip) shifted.pageClip = { ...item.pageClip, x: placement.x + item.pageClip.x - origin.x, y: placement.y + item.pageClip.y - origin.y - fragment.start };
          return shifted;
        };
        const selected = prepared.index.select(fragment.start, fragment.end);
        if (selected.state !== "selected") return selected;
        inspections += selected.inspections;
        if (inspections > maxInspections) return limit("cell-nested-index-query");
        for (const { item } of selected.rows) {
          if (++inspections > maxInspections) return limit("cell-nested-items");
          const itemTop = item.y - origin.y, itemBottom = itemTop + item.height;
          if (itemBottom <= fragment.start || itemTop >= fragment.end) continue;
          if (item.kind !== "gap" && (itemTop < fragment.start || itemBottom > fragment.end)) return unavailable("SplitNestedCellContent");
          const shifted = move(item);
          if (item.kind === "gap") {
            shifted.y = placement.y + Math.max(itemTop, fragment.start) - fragment.start;
            shifted.height = Math.min(itemBottom, fragment.end) - Math.max(itemTop, fragment.start);
          }
          if (![shifted.x, shifted.y, shifted.x + (shifted.width ?? 0), shifted.y + shifted.height].every(Number.isFinite)) return unavailable("InvalidCellPageProjection");
          if (Object.hasOwn(item, "kind")) {
            if (rows.length >= maxRows) return limit("cell-nested-rows");
            rows.push(shifted);
          } else boxes.push(shifted);
        }
        for (const picture of nested.flowPictures ?? []) {
          if (++inspections > maxInspections) return limit("cell-nested-pictures");
          const anchor = pictureAnchorRow(pictureAnchors, picture);
          if (!anchor) return unavailable("InvalidNestedPictureProjection");
          const anchorTop = anchor.y - origin.y;
          if (anchorTop < fragment.start || anchorTop >= fragment.end && !(isZeroAdvanceCellAnchor(anchor) && fragment.end === bottom && anchorTop === bottom)) continue;
          const moved = translatePicturePlacement(picture, placement.x - origin.x, placement.y - origin.y - fragment.start,
            {pageOrdinal:placement.pageOrdinal,columnOrdinal:placement.columnOrdinal,referenceBoxes:placement.referenceBoxes});
          if (moved.state !== "translated") return unavailable("InvalidNestedPictureProjection");
          const projected = moved.picture;
          if (picture.pageClip) projected.pageClip = move(picture.pageClip);
          flowPictures.push(projected);
        }
        continue;
      }
      const offset = top + insets.top;
      let offsets = rowIndexes.get(flow.rows);
      if (!offsets) rowIndexes.set(flow.rows, offsets = new Map());
      let rowIndex = offsets.get(offset);
      if (!rowIndex) {
        rowIndex = createCellRowBandIndex(flow.rows, offset);
        if (rowIndex.state !== "prepared") return unavailable(rowIndex.error);
        inspections += rowIndex.inspections;
        if (inspections > maxInspections) return limit("cell-row-index-build");
        offsets.set(offset, rowIndex);
      }
      const selected = rowIndex.select(fragment.start, fragment.end);
      if (selected.state !== "selected") return unavailable(selected.error);
      inspections += selected.inspections;
      if (inspections > maxInspections) return limit("cell-row-index-query");
      for (const row of selected.rows) {
        if (++inspections > maxInspections) return limit("cell-row-projection");
        const { start: rowTop, end: rowBottom } = tableCellBand(top + insets.top, row);
        const point = isZeroAdvanceCellAnchor(row);
        if (point ? rowTop < fragment.start || rowTop >= fragment.end && !(fragment.end === bottom && rowTop === bottom)
          : rowBottom <= fragment.start || rowTop >= fragment.end) continue;
        if (row.kind === "text" && (rowTop < fragment.start || rowBottom > fragment.end)) return unavailable("SplitTableTextRow");
        if (rows.length >= maxRows) return limit("cell-output-rows");
        const localX = row.x ?? 0;
        if (!Number.isFinite(localX)) return unavailable("InvalidCellPageProjection");
        if (row.width !== undefined && (!Number.isFinite(row.width) || row.width < 0)) return unavailable("InvalidCellPageProjection");
        const rowX = x + insets.left + localX, rowY = placement.y + Math.max(rowTop, fragment.start) - fragment.start;
        const rowHeight = Math.min(rowBottom, fragment.end) - Math.max(rowTop, fragment.start);
        if (![rowX, rowY, rowHeight, rowY + rowHeight, rowX + (row.width ?? 0)].every(Number.isFinite)) return unavailable("InvalidCellPageProjection");
        rows.push({ ...row, ...(flow.columns ? { cellColumnOrdinal: row.columnOrdinal } : {}), columnOrdinal: placement.columnOrdinal, x: rowX, y: rowY,
          height: row.kind === "text" ? row.height : rowHeight, tableNode: table.tableNode, listNode: cell.listNode,
          pageOrdinal: placement.pageOrdinal, referenceBoxes: placement.referenceBoxes });
      }
    }
  }
  return { state: "placed", rows: rows.toSorted((a, b) => a.pageOrdinal - b.pageOrdinal || a.y - b.y || a.x - b.x), boxes,
    ...(flowPictures.length ? { flowPictures } : {}), spatialRows: true, limited: false };
}
