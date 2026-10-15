import { layoutCreatedTable } from "./created-table-layout.mjs";
import { measureCreatedTableHost } from "./created-table-host-measurement.mjs";
import { layoutContent } from "./layout.mjs";
import { createdTableInlinePolicy } from "./created-table-inline-policy.mjs";
import { measureSourceInlineTables } from "./source-table-inline-measurement.mjs";
import { layoutInlineTablePageContent } from "./inline-table-page-content.mjs";

// Whole-line reservations shared by ordinary body and body-plus-note pagination.
export function measureCreatedBodyFlow(content, width, measure, maxRows) {
  const unavailable = error => ({ state: "unavailable", error });
  const cells = new Map(), hosts = new Map(), sequence = [], measuredHosts = new Map();
  const source = measureSourceInlineTables(content, measure, maxRows);
  if (source.state !== "measured") return source;
  let remaining = maxRows - source.rowCount;
  for (const key of source.hosts.keys()) hosts.set(key, []);
  for (const table of content.createdTables ?? []) {
    if (!createdTableInlinePolicy(table, content.format)) return unavailable("UnsupportedCreatedTableInlinePolicy");
    if (cells.has(table.identity) || !content.paragraphs.some(p => p.section === table.section)) return unavailable("InvalidCreatedTablePageOwner");
    if (!content.paragraphs.some(p => p.section === table.section && p.paragraph === table.hostParagraph)) return unavailable("MissingCreatedTablePageHost");
    if (remaining < 1) return unavailable("CreatedTablePageProjectionLimit");
    let flow;
    try { flow = layoutCreatedTable(table, measure, { x: 0, y: 0, maxRows: remaining }); }
    catch (error) {
      if (["InvalidTableGrid", "InvalidCreatedTableLayout", "CreatedTableLayoutRowBudgetExceeded"].includes(error.message)) return unavailable(error.message);
      throw error;
    }
    remaining -= flow.rows.length; cells.set(table.identity, flow);
    const key = `${table.section}:${table.hostParagraph}`, entries = hosts.get(key) ?? [];
    entries.push({ table, width: flow.width, height: flow.height }); hosts.set(key, entries);
  }
  for (const paragraph of content.paragraphs.filter(p => !p.tableCell && !p.tableCaption && !p.drawingText && !p.drawingCaption)) {
    const key = `${paragraph.section}:${paragraph.paragraph}`, entries = hosts.get(key);
    if (remaining < 1) return unavailable("CreatedTablePageProjectionLimit");
    if (!entries) {
      const measured = layoutContent({ paragraphs: [paragraph], limited: false }, width, measure, remaining, { documentBody: true });
      if (measured.limited) return unavailable("CreatedTablePageProjectionLimit");
      remaining -= measured.rows.length; sequence.push(...measured.rows); continue;
    }
    // HWP5 native note references were bound by the note engine; preserve their
    // existing text display instead of guessing a new number or object geometry.
    const sourceTextAnchorUnits = (content.boundNoteReferences ?? []).filter(note => note.section === paragraph.section && note.hostParagraph === paragraph.paragraph).map(note => note.anchorUnit);
    const measured = measureCreatedTableHost(paragraph, entries, width, measure, { maxRows: remaining, sourceTextAnchorUnits, sourceTables: source.hosts.get(key) ?? [] });
    if (measured.state !== "measured") return measured;
    const rowsByLine = measured.lines.map(() => []), anchorsByLine = measured.lines.map(() => []), prefixesByLine = measured.lines.map(() => []);
    for (const row of measured.rows) rowsByLine[row.lineOrdinal].push(row);
    for (const anchor of measured.anchors) anchorsByLine[anchor.lineOrdinal].push(anchor);
    for (const prefix of measured.numberPrefixes) prefixesByLine[prefix.lineOrdinal].push(prefix);
    measuredHosts.set(key, { ...measured, rowsByLine, anchorsByLine, prefixesByLine });
    remaining -= measured.rows.length + measured.numberPrefixes.length;
    sequence.push(...measured.lines.map(line => ({ kind: "gap", section: paragraph.section, paragraph: paragraph.paragraph,
      height: line.height, createdHost: key, hostLineOrdinal: line.lineOrdinal, referenceRows: rowsByLine[line.lineOrdinal] })));
  }
  if (remaining < 0 || measuredHosts.size !== hosts.size) return unavailable("CreatedTablePageProjectionLimit");
  return { state: "measured", rows: sequence, cells, sourceTables: source.tables, measuredHosts, rowCount: maxRows - remaining };
}

export function projectCreatedBodyFlow(measured, placedRows, maxRows) {
  const rows = [], boxes = [], hostNumberPrefixes = [], emitted = new Set();
  for (const placed of placedRows) {
    if (placed.createdHost === undefined) { rows.push(placed); continue; }
    const host = measured.measuredHosts.get(placed.createdHost), line = host?.lines[placed.hostLineOrdinal];
    if (!line) return { state: "unavailable", error: "MissingCreatedTablePageHost" };
    const placement = { pageOrdinal: placed.pageOrdinal, columnOrdinal: placed.columnOrdinal, referenceBoxes: placed.referenceBoxes };
    const dy = placed.y - line.y;
    for (const prefix of host.prefixesByLine[line.lineOrdinal]) hostNumberPrefixes.push({ ...prefix, x: prefix.x + placed.x - 20, y: prefix.y + dy, ...placement, pageClip: placed.referenceBoxes.column });
    for (const row of host.rowsByLine[line.lineOrdinal]) rows.push({ ...row, x: (row.x ?? 20) + placed.x - 20, y: row.y + dy, ...placement, pageClip: placed.referenceBoxes.column });
    for (const anchor of host.anchorsByLine[line.lineOrdinal]) {
      const identity = anchor.createdTableIdentity === undefined ? `source:${anchor.tableNode}` : `created:${anchor.createdTableIdentity}`;
      if (emitted.has(identity)) return { state: "unavailable", error: "DuplicateCreatedTablePageCell" };
      emitted.add(identity);
      if (anchor.createdTableIdentity === undefined) {
        const source = measured.sourceTables.get(anchor.tableNode);
        if (!source) return { state: "unavailable", error: "MissingCreatedTablePageHost" };
        const projected = layoutInlineTablePageContent(source.table, source.measured, {
          ...placement, objectNode: anchor.tableNode, section: source.table.section, paragraph: source.table.hostParagraph, unit: anchor.unit,
          rectangle: { x: placed.x + anchor.x, y: placed.y + anchor.y - line.y, width: anchor.width, height: anchor.height },
        }, source.margins, { maxRows: maxRows - rows.length - hostNumberPrefixes.length });
        if (projected.state !== "placed") return projected;
        rows.push(...projected.rows); boxes.push(...projected.boxes); continue;
      }
      const flow = measured.cells.get(anchor.createdTableIdentity), dx = placed.x + anchor.x, ay = placed.y + anchor.y - line.y;
      boxes.push(...flow.boxes.map(box => ({ ...box, x: box.x + dx, y: box.y + ay, ...placement })));
      rows.push(...flow.rows.map(row => ({ ...row, x: row.x + dx, y: row.y + ay, ...placement,
        pageClip: { ...row.pageClip, x: row.pageClip.x + dx, y: row.pageClip.y + ay } })));
    }
  }
  if (emitted.size !== measured.cells.size + measured.sourceTables.size || rows.length + hostNumberPrefixes.length > maxRows) return { state: "unavailable", error: "CreatedTablePageProjectionLimit" };
  return { state: "projected", rows, boxes, hostNumberPrefixes, createdCellParagraphs: [...measured.cells.values()].flatMap(flow => flow.paragraphs) };
}
