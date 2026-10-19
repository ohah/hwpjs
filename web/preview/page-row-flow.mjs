import { pageReferenceBoxes } from "./page-reference-boxes.mjs";
import { columnReferenceBoxes } from "./column-reference-boxes.mjs";
import { reserveTableVerticalFlow } from "./table-vertical-flow-reservation.mjs";
import { pageSequenceReference } from "./page-sequence-reference.mjs";
import { isHardLineBreak } from "./hard-line-break.mjs";
import { positionedRowFragments, positionedRowOwnerMatches } from "./positioned-row-fragments.mjs";

/** Paginate measured body rows. Caller owns shaping, columns and section selection. */
export function paginateBodyRows(rows, setting, paragraphFlows, { x = 20, y = 20, gap = 20, zoneGap = 0, maxPages = 2000, columnDeclaration, columnZones = false, measureRow, measurePositionedRow, maxRows = 20000, rowY, columnBottom, minimumRowPage } = {}) {
  const unavailable = error => ({ state: "unavailable", error });
  if (![x, y, gap, zoneGap].every(Number.isFinite) || gap < 0 || zoneGap < 0 || !Number.isSafeInteger(maxPages) || maxPages < 1) return unavailable("InvalidPageFlowBounds");
  const initial = pageReferenceBoxes(setting, { x, y });
  if (initial.state !== "placed") return unavailable(initial.state);
  const validRow = row => row && Number.isFinite(row.height) && row.height > 0 && row.height <= initial.boxes.page.height;
  if (!Number.isSafeInteger(maxRows) || maxRows < 1 || measureRow !== undefined && typeof measureRow !== "function") return unavailable("InvalidPageFlowBounds");
  if (rowY !== undefined && typeof rowY !== "function") return unavailable("InvalidPageFlowBounds");
  if (columnBottom !== undefined && typeof columnBottom !== "function") return unavailable("InvalidPageFlowBounds");
  if (minimumRowPage !== undefined && typeof minimumRowPage !== "function") return unavailable("InvalidPageFlowBounds");
  if (measurePositionedRow !== undefined && typeof measurePositionedRow !== "function") return unavailable("InvalidPageFlowBounds");
  if (typeof columnZones !== "boolean" || (columnZones && columnDeclaration !== undefined)) return unavailable("InvalidPageFlowBounds");
  if (columnZones) columnDeclaration = paragraphFlows[0]?.column_changes?.filter(change => change.unit === 0).at(-1)?.declaration ?? paragraphFlows[0]?.column_declaration;
  const columnsFor = body => columnDeclaration === undefined ? { state: "placed", boxes: [body] } : columnReferenceBoxes(body, columnDeclaration);
  const initialColumns = columnsFor(initial.boxes.page);
  if (initialColumns.state !== "placed") return unavailable(initialColumns.error);
  const flows = new Map();
  let section;
  for (const flow of paragraphFlows) {
    section ??= flow.section;
    if (!Number.isSafeInteger(flow.section) || flow.section < 0 || flow.section !== section || !Number.isSafeInteger(flow.paragraph) || flow.paragraph < 0) return unavailable("UnsupportedPageFlow");
    const key = `${flow.section}:${flow.paragraph}`;
    if (flows.has(key) || flow.top_level !== true || ![true, false, null].includes(flow.column_break) || ![true, false, null].includes(flow.page_break)) return unavailable("UnsupportedPageFlow");
    if (flow.column_break === true && columnDeclaration === undefined) {
      // A verified full-width single column advances to the next page. Do not
      // invent a declaration or infer the same for unknown/narrower columns.
      if (flow.single_column !== true || flow.column_declaration?.count !== 1) return unavailable("UnsupportedPageFlow");
      const proof = columnReferenceBoxes(initial.boxes.page, flow.column_declaration);
      if (proof.state !== "placed" || proof.boxes.length !== 1 || ["x", "y", "width", "height"].some(name => proof.boxes[0][name] !== initial.boxes.page[name])) return unavailable("UnsupportedPageFlow");
    }
    if (columnZones) {
      const declarations = flow.column_changes?.length ? flow.column_changes.map(change => change.declaration) : [flow.column_declaration];
      for (const declaration of declarations) {
        const columns = columnReferenceBoxes(initial.boxes.page, declaration);
        if (columns.state !== "placed") return unavailable(columns.error);
      }
    }
    flows.set(key, flow);
  }
  const pages = [], result = [];
  const paragraphAnchors = new Map();
  let current, cursor, previous, columnOrdinal, zoneBottom, zoneOrdinal = 0;
  const next = () => {
    if (pages.length >= maxPages) return false;
    const placed = pageSequenceReference(setting, pages.length, { x, y, gap });
    if (placed.state !== "placed") return false;
    const columns = columnsFor(placed.boxes.page);
    if (columns.state !== "placed") return false;
    current = { ordinal: pages.length, ...placed.boxes, columns: columns.boxes };
    pages.push(current); columnOrdinal = 0; cursor = current.columns[0].y; zoneBottom = cursor;
    return true;
  };
  const nextColumn = () => {
    if (columnOrdinal + 1 >= current.columns.length) return next();
    columnOrdinal++; cursor = current.columns[columnOrdinal].y;
    return true;
  };
  const input = rows[Symbol.iterator]();
  let pending, limited = false, positioned = false;
  while (true) {
    const source = pending ?? input.next().value;
    pending = undefined;
    if (source === undefined) break;
    if (result.length >= maxRows) {
      limited = true;
      if (source.kind === "text") for (const row of result) if (row.section === source.section && row.paragraph === source.paragraph) { row.editable = false; row.selectable = false; }
      break;
    }
    let row = source;
    const keepNextHeight = source.keepNextHeight ?? 0;
    if (!Number.isFinite(keepNextHeight) || keepNextHeight < 0) return unavailable("InvalidPageKeepTogether");
    const key = `${row.section}:${row.paragraph}`;
    const flow = flows.get(key);
    if (!flow || !["text", "gap"].includes(row.kind)) return unavailable("UnsupportedPageRow");
    const rowDeclaration = source.columnDeclaration ?? flow.column_declaration;
    const changedZone = columnZones && JSON.stringify(rowDeclaration) !== JSON.stringify(columnDeclaration);
    if (changedZone) {
      columnDeclaration = rowDeclaration;
      zoneOrdinal++;
    }
    const firstColumns = columnsFor(initial.boxes.page);
    if (firstColumns.state !== "placed") return unavailable(firstColumns.error);
    if (measureRow) row = measureRow(source, changedZone || !current ? firstColumns.boxes[0].width : current.columns[columnOrdinal].width);
    if (!validRow(row)) return unavailable("UnsupportedPageRow");
    if (!Number.isFinite(row.height + keepNextHeight)) return unavailable("InvalidPageKeepTogether");
    if (!current || (key !== previous && flow.page_break === true && result.length > 0)) {
      if (!next()) return unavailable("PageFlowLimit");
    } else if (changedZone) {
      const bottom = current.page.y + current.page.height;
      const zoneTop = zoneBottom + zoneGap;
      if (!Number.isFinite(zoneTop + row.height)) return unavailable("InvalidPageFlowBounds");
      if (zoneTop + row.height > bottom) {
        if (!next()) return unavailable("PageFlowLimit");
      } else {
        const columns = columnsFor({ ...current.page, y: zoneTop, height: bottom - zoneTop });
        if (columns.state !== "placed") return unavailable(columns.error);
        current.columns = columns.boxes;
        columnOrdinal = 0; cursor = zoneTop;
      }
    } else if (key !== previous && flow.column_break === true && result.length > 0) {
      if (!nextColumn()) return unavailable("PageFlowLimit");
    }
    if (measureRow) row = measureRow(source, current.columns[columnOrdinal].width);
    if (!validRow(row)) return unavailable("UnsupportedPageRow");
    if (minimumRowPage) {
      const minimum = minimumRowPage(row);
      if (!Number.isSafeInteger(minimum) || minimum < 0) return unavailable("InvalidPageRowPosition");
      while (current.ordinal < minimum) if (!next()) return unavailable("PageFlowLimit");
      if (measureRow) row = measureRow(source, current.columns[columnOrdinal].width);
      if (!validRow(row)) return unavailable("UnsupportedPageRow");
    }
    let flowAnchorY;
    while (true) {
      flowAnchorY = cursor;
      if (rowY) {
        const proposed = rowY(row, { y: cursor, column: current.columns[columnOrdinal], pageOrdinal: current.ordinal, columnOrdinal });
        if (!Number.isFinite(proposed) || proposed < cursor) return unavailable("InvalidPageRowPosition");
        cursor = proposed;
      }
      if (measurePositionedRow) {
        row = measurePositionedRow(source, row, { y: cursor, column: current.columns[columnOrdinal], pageOrdinal: current.ordinal, columnOrdinal });
        if (!validRow(row) || !positionedRowOwnerMatches(source, row)) return unavailable("UnsupportedPageRow");
      }
      const column = current.columns[columnOrdinal], fullBottom = column.y + column.height;
      const bottom = columnBottom ? columnBottom(row, { column, pageOrdinal: current.ordinal, columnOrdinal, placedRows: result }) : fullBottom;
      if (!Number.isFinite(bottom) || bottom < column.y || bottom > fullBottom) return unavailable("InvalidPageColumnBottom");
      if (cursor + row.height + keepNextHeight <= bottom) break;
      if ((columnBottom || keepNextHeight > 0) && cursor === column.y && row.height + keepNextHeight > bottom - column.y) return unavailable("PageColumnReservationOverflow");
      if (row.height > initial.boxes.page.height) return unavailable("UnsupportedPageRow");
      if (!(row.height + keepNextHeight > current.columns[columnOrdinal].height ? next() : nextColumn())) return unavailable("PageFlowLimit");
      if (measureRow) row = measureRow(source, current.columns[columnOrdinal].width);
      if (!validRow(row)) return unavailable("UnsupportedPageRow");
    }
    if (row.tableVerticalSource) {
      let reservation;
      for (let attempt = 0; attempt < 2; attempt++) {
        const column = current.columns[columnOrdinal], anchorKey = `${current.ordinal}:${columnOrdinal}:${key}`;
        const anchorY = paragraphAnchors.get(anchorKey) ?? cursor;
        reservation = reserveTableVerticalFlow(row.tableVerticalSource, { anchorY, occupiedBottom: cursor, height: row.height, pageTop: column.y, pageBottom: column.y + column.height });
        if (reservation.state === "reserved") break;
        if (reservation.state !== "next-page") return unavailable(reservation.error);
        if (attempt === 1) return unavailable("TableVerticalFlowPageOverflow");
        if (!nextColumn()) return unavailable("PageFlowLimit");
      }
      row = { ...row, height: row.height + reservation.gap, verticalReservationGap: reservation.gap };
    }
    const column = current.columns[columnOrdinal];
    if (columnBottom) {
      const bottom = columnBottom(row, { column, pageOrdinal: current.ordinal, columnOrdinal, placedRows: result });
      if (!Number.isFinite(bottom) || bottom < column.y || bottom > column.y + column.height) return unavailable("InvalidPageColumnBottom");
      if (cursor + row.height + keepNextHeight > bottom) return unavailable("PageColumnReservationOverflow");
    }
    const anchorKey = `${current.ordinal}:${columnOrdinal}:${key}`;
    if (!paragraphAnchors.has(anchorKey)) paragraphAnchors.set(anchorKey, cursor);
    const sourceEnd = source.endUnit ?? source.paragraphSource?.text.length;
    if (source.paragraphSource && (!Number.isInteger(sourceEnd) || sourceEnd > source.paragraphSource.text.length || !Number.isInteger(row.endUnit) || row.endUnit > sourceEnd || row.endUnit < source.startUnit || row.endUnit === source.startUnit && source.startUnit < sourceEnd)) return unavailable("UnsupportedPageRow");
    const expanded = row.positionedFragments === undefined ? { state: "expanded", rows: [row] }
      : positionedRowFragments(source, row, maxRows - result.length);
    if (expanded.state !== "expanded") return expanded;
    positioned ||= row.positionedFragments !== undefined;
    for (const fragment of expanded.rows) result.push({ ...fragment, x: column.x, y: cursor, ...((rowY || measurePositionedRow) ? { flowAnchorY } : {}), columnOrdinal, zoneOrdinal, pageOrdinal: current.ordinal, referenceBoxes: { paper: current.paper, page: current.page, column } });
    cursor += row.height; zoneBottom = Math.max(zoneBottom, cursor); previous = key;
    const terminalBreak = source.paragraphSource && sourceEnd === source.paragraphSource.text.length && row.startUnit < sourceEnd && isHardLineBreak(source.paragraphSource.text.slice(-1));
    if (source.paragraphSource && (row.endUnit < sourceEnd || terminalBreak)) {
      pending = { ...source, startUnit: row.endUnit };
    }
  }
  return { state: "paginated", rows: result, pages, limited, ...(positioned || columnZones || initialColumns.boxes.length > 1 ? { spatialRows: true } : {}), height: pages.length ? pages.at(-1).paper.y + pages.at(-1).paper.height : y };
}
