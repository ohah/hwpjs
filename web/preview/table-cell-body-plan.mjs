import { paginateBodyRows } from "./page-row-flow.mjs";
import { pageReferenceBoxes } from "./page-reference-boxes.mjs";
import { planMeasuredCellCuts } from "./table-measured-cell-cuts.mjs";
import { paragraphCellOffset } from "./paragraph-cell-offset-policy.mjs";
import { paragraphTableStart } from "./paragraph-table-start.mjs";
import { frameMeasuredCellTable } from "./table-cell-outer-frame.mjs";
import { isFootnoteColumnReservation, hasCellFootnoteReferences } from "./footnote-column-reservation.mjs";
import { footnoteCellPageCapacities } from "./footnote-cell-page-capacities.mjs";
import { createCellFootnoteFragmentCapacity } from "./cell-footnote-fragment-capacity.mjs";

// Share the body cursor with CELL fragments; source float policy stays upstream.
export function planCellTableBodyPages(table, measured, setting, hostFlow, { beforeRows = [], afterRows = [], bodyFlows = [], origin, padding, frameInsets, protectAtomicRows=false, prefixHeight=0, pageCapacities, paginateRows, ...pageOptions } = {}) {
  const unavailable = error => ({ state: "unavailable", error });
  if (paginateRows !== undefined && typeof paginateRows !== "function") return unavailable("InvalidPageFlowBounds");
  const paginate = paginateRows ?? paginateBodyRows;
  if(!Number.isFinite(prefixHeight)||prefixHeight<0)return unavailable("InvalidTableHeaderReservation");
  if (!table || !hostFlow || hostFlow.top_level !== true || hostFlow.section !== table.section || hostFlow.paragraph !== table.hostParagraph) return unavailable("UnsupportedTablePageHost");
  if (![beforeRows, afterRows, bodyFlows].every(Array.isArray) || bodyFlows.some(flow => !flow) || [...beforeRows, ...afterRows].some(row => !row || row.cellFragment !== undefined)) return unavailable("InvalidTableBodyRows");
  if (pageOptions.columnDeclaration !== undefined || pageOptions.columnZones || pageOptions.measureRow !== undefined || [hostFlow, ...bodyFlows].some(flow => flow?.single_column === false || flow?.column_break === true)) return unavailable("UnsupportedCellTableColumns");
  const flows = [...bodyFlows], existing = flows.find(flow => flow.section === hostFlow.section && flow.paragraph === hostFlow.paragraph);
  if (existing && JSON.stringify(existing) !== JSON.stringify(hostFlow)) return unavailable("AmbiguousTablePageHost");
  if (!existing) flows.push(hostFlow);
  const prefix = paginate(beforeRows, setting, flows, pageOptions);
  if (!prefix || typeof prefix !== "object") return unavailable("InvalidCellBodyPagination");
  if (prefix.state !== "paginated") return prefix;
  if (!Array.isArray(prefix.rows) || !Array.isArray(prefix.pages)) return unavailable("InvalidCellBodyPagination");
  if (prefix.limited) return unavailable("TablePagePlanLimit");
  const reference = pageReferenceBoxes(setting, { x: pageOptions.x ?? 20, y: pageOptions.y ?? 20 });
  if (reference.state !== "placed") return unavailable(reference.state);
  const last = prefix.rows.at(-1), body = last?.referenceBoxes.page ?? reference.boxes.page;
  const forceBreak = last && hostFlow.page_break === true && (last.section !== hostFlow.section || last.paragraph !== hostFlow.paragraph);
  const capacity=body.height-prefixHeight;
  if(capacity<=0)return unavailable("RepeatedHeaderTooTall");
  let firstCapacity = last && !forceBreak ? Math.max(0, Math.min(capacity, body.y + body.height - (last.y + last.height)-prefixHeight)) : capacity;
  if (pageCapacities === undefined && isFootnoteColumnReservation(pageOptions.columnBottom)) {
    const reserved = footnoteCellPageCapacities(setting, hostFlow, prefix.rows, pageOptions.columnBottom, {
      firstPage: (prefix.pages.at(-1)?.ordinal ?? 0) + Number(Boolean(forceBreak)), prefixHeight,
      occupiedBottom: last && !forceBreak ? last.y + last.height : undefined,
      maxPages: pageOptions.maxPages, x: pageOptions.x, y: pageOptions.y, gap: pageOptions.gap,
    });
    if (reserved.state !== "planned") return reserved;
    pageCapacities = reserved.pageCapacities; firstCapacity = reserved.firstCapacity;
  }
  const offset = paragraphCellOffset(table);
  const occupied = last && !forceBreak ? last.y + last.height : body.y;
  const anchor = last && !forceBreak ? prefix.rows.find(row => row.pageOrdinal === last.pageOrdinal && row.section === table.section && row.paragraph === table.hostParagraph)?.y ?? occupied : body.y;
  let leadingGap = offset === null ? 0 : paragraphTableStart(anchor, occupied, body.y, offset).gap;
  const framed = gap => {
    const result = frameMeasuredCellTable(measured, { top: gap, bottom: 0 });
    return result.state !== "framed" ? result : { ...result, frameInsets: gap === 0 ? frameInsets : {
      top: (frameInsets?.top ?? 0) + gap, bottom: frameInsets?.bottom ?? 0 } };
  };
  let current = framed(leadingGap);
  if (current.state !== "framed") return current;
  let cellNotes = null;
  const cut = first => {
    if (hasCellFootnoteReferences(pageOptions.columnBottom, table.section, new Set(table.cells.flatMap(cell => cell.paragraphs)))) {
      cellNotes = createCellFootnoteFragmentCapacity(table, current.measured, setting, pageOptions.columnBottom, {
        origin, padding, prefixRows: prefix.rows, firstPage: (prefix.pages.at(-1)?.ordinal ?? 0) + Number(Boolean(forceBreak)),
        x: pageOptions.x, y: pageOptions.y, gap: pageOptions.gap,
      });
      if (cellNotes.state !== "ready") return cellNotes;
    }
    return planMeasuredCellCuts(table, current.measured, capacity, { origin, padding, firstCapacity: first,
      frameInsets: current.frameInsets, protectAtomicRows, maxRows: pageOptions.maxRows, maxPages: pageOptions.maxPages, pageCapacities,
      fragmentCapacity: cellNotes?.fragmentCapacity });
  };
  let cuts = cut(firstCapacity);
  if (offset !== null && cuts.state === "planned" && (cuts.firstPageSkipped || cuts.pageOffsets?.[0] > 0)) {
    leadingGap = paragraphTableStart(body.y, body.y, body.y, offset).gap;
    current = framed(leadingGap);
    if (current.state !== "framed") return current;
    cuts = cut(0);
  }
  if (cuts.state !== "planned") return cuts;
  const placeholders=[];
  for(const [cellFragment,fragment]of cuts.fragments.entries()){
    if(fragment.end>fragment.start+capacity)return unavailable("InvalidTableCellCuts");
    // Endpoints are already bounded; subtract/add roundoff must not fabricate an oversized reservation.
    placeholders.push({kind:"gap",section:table.section,paragraph:table.hostParagraph,height:Math.min(body.height,fragment.height+prefixHeight),cellFragment,
      ...(cellNotes ? { cellTableNode: table.tableNode, cellReferenceRows: cellNotes.referencesFor(fragment.start, fragment.end) } : {})});
  }
  const firstPage = (prefix.pages.at(-1)?.ordinal ?? 0) + Number(Boolean(forceBreak || cuts.firstPageSkipped));
  const minimumRowPage = row => {
    const supplied = pageOptions.minimumRowPage === undefined ? 0 : pageOptions.minimumRowPage(row);
    if (!Number.isSafeInteger(supplied) || supplied < 0) return NaN;
    return Math.max(supplied, row.cellFragment === undefined ? 0 : firstPage + (cuts.pageOffsets?.[row.cellFragment] ?? row.cellFragment));
  };
  const layout = paginate([...beforeRows, ...placeholders, ...afterRows], setting, flows, { ...pageOptions, minimumRowPage });
  if (!layout || typeof layout !== "object") return unavailable("InvalidCellBodyPagination");
  if (layout.state !== "paginated") return layout;
  if (!Array.isArray(layout.rows) || !Array.isArray(layout.pages)) return unavailable("InvalidCellBodyPagination");
  if (layout.limited) return unavailable("TablePagePlanLimit");
  const fragments = layout.rows.filter(row => row.cellFragment !== undefined);
  if (fragments.length !== placeholders.length || fragments.some((row,index) => row.cellFragment !== index
    || row.height !== placeholders[index].height || row.section !== table.section || row.paragraph !== table.hostParagraph))
    return unavailable("InvalidCellBodyPagination");
  if ((cuts.pageOffsets || paginateRows) && fragments.some(row =>
    row.pageOrdinal !== firstPage + (cuts.pageOffsets?.[row.cellFragment] ?? row.cellFragment))) return unavailable("TablePageCapacityPlacementMismatch");
  return { state: "planned", cuts, measured: current.measured, frameInsets: current.frameInsets, leadingGap, pages: layout.pages, height: layout.height,
    bodyRows: layout.rows.filter(row => row.cellFragment === undefined),
    placements: layout.rows.filter(row => row.cellFragment !== undefined).map(row => ({ x: row.x, y: row.y, height:row.height, pageOrdinal: row.pageOrdinal, referenceBoxes: row.referenceBoxes,
      ...(cellNotes ? { cellTableNode: row.cellTableNode, cellReferenceRows: row.cellReferenceRows } : {}) })),
  };
}
