import { layoutCreatedTable } from "./created-table-layout.mjs";
import { measureCreatedTableHost } from "./created-table-host-measurement.mjs";
import { layoutContent } from "./layout.mjs";
import { pageReferenceBoxes } from "./page-reference-boxes.mjs";
import { paginateBodyRows } from "./page-row-flow.mjs";
import { pageParagraphCoverage } from "./page-paragraph-coverage.mjs";
import { createdTableInlinePolicy } from "./created-table-inline-policy.mjs";

// Inline whole-object path. Oversized objects retain explicit fallback, not loss.
export function layoutCreatedTableInlinePages(content, measure, maxRows = 20000) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!["hwp5", "hwpx"].includes(content.format) || content.window || content.limited || content.pageSettings?.length !== 1
      || !content.createdTables?.length || !Number.isSafeInteger(maxRows) || maxRows < 1) return unavailable("UnsupportedCreatedTablePageScope");
  if (content.hwp5PageNumberSource?.page_controls?.length || content.hwp5PageNumberSource?.section_starts?.length) return unavailable("UnsupportedCreatedTablePageControls");
  if (["tables", "pictures", "drawings", "rectangles", "lines", "checkBoxes", "charts", "noteBodies"].some(key => content[key]?.length)
      || content.paragraphs.some(paragraph => paragraph.tableCell || paragraph.drawingText || paragraph.clipped || paragraph.textStartUnit)
      || !content.paragraphFlows?.length || content.paragraphFlows.some(flow => flow.top_level !== true || flow.single_column !== true || flow.host !== "body"
        || flow.column_declaration && flow.column_declaration.count !== 1 || flow.column_changes?.some(change => change.declaration?.count !== 1))) return unavailable("UnsupportedCreatedTablePageObjects");
  const setting = content.pageSettings[0], reference = pageReferenceBoxes(setting, { x: 20, y: 20 });
  if (reference.state !== "placed") return unavailable(reference.state);
  if (content.paragraphs.some(paragraph => paragraph.section !== setting.section_ordinal)) return unavailable("UnsupportedCreatedTablePageScope");
  const width = reference.boxes.page.width, cells = new Map(), hosts = new Map(), sequence = [];
  let remaining = maxRows;
  for (const table of content.createdTables) {
    if (!createdTableInlinePolicy(table, content.format)) return unavailable("UnsupportedCreatedTableInlinePolicy");
    if (cells.has(table.identity) || table.section !== setting.section_ordinal) return unavailable("InvalidCreatedTablePageOwner");
    if (remaining < 1) return unavailable("CreatedTablePageProjectionLimit");
    let flow;
    try { flow = layoutCreatedTable(table, measure, { x: 0, y: 0, maxRows: remaining }); }
    catch (error) {
      if (["InvalidTableGrid", "InvalidCreatedTableLayout", "CreatedTableLayoutRowBudgetExceeded"].includes(error.message)) return unavailable(error.message);
      throw error;
    }
    remaining -= flow.rows.length;
    cells.set(table.identity, flow);
    const key = `${table.section}:${table.hostParagraph}`, entries = hosts.get(key) ?? [];
    entries.push({ table, width: flow.width, height: flow.height }); hosts.set(key, entries);
  }
  const measuredHosts = new Map();
  for (const paragraph of content.paragraphs) {
    const key = `${paragraph.section}:${paragraph.paragraph}`, entries = hosts.get(key);
    if (remaining < 1) return unavailable("CreatedTablePageProjectionLimit");
    if (entries) {
      const measured = measureCreatedTableHost(paragraph, entries, width, measure, { maxRows: remaining });
      if (measured.state !== "measured") return measured;
      const rowsByLine = measured.lines.map(() => []), anchorsByLine = measured.lines.map(() => []);
      for (const row of measured.rows) rowsByLine[row.lineOrdinal].push(row);
      for (const anchor of measured.anchors) anchorsByLine[anchor.lineOrdinal].push(anchor);
      measuredHosts.set(key, { ...measured, rowsByLine, anchorsByLine }); remaining -= measured.rows.length;
      sequence.push(...measured.lines.map(line => ({ kind: "gap", section: paragraph.section, paragraph: paragraph.paragraph,
        height: line.height, createdHost: key, hostLineOrdinal: line.lineOrdinal })));
    } else {
      const measured = layoutContent({ paragraphs: [paragraph], limited: false }, width, measure, remaining, { documentBody: true });
      if (measured.limited) return unavailable("CreatedTablePageProjectionLimit");
      remaining -= measured.rows.length; sequence.push(...measured.rows);
    }
  }
  if (measuredHosts.size !== hosts.size) return unavailable("MissingCreatedTablePageHost");
  const paginated = paginateBodyRows(sequence, setting, content.paragraphFlows, { maxRows });
  if (paginated.state !== "paginated") return paginated;
  if (paginated.limited) return unavailable("CreatedTablePageProjectionLimit");
  const rows = [], boxes = [], emitted = new Set();
  for (const placed of paginated.rows) {
    if (placed.createdHost === undefined) { rows.push(placed); continue; }
    const host = measuredHosts.get(placed.createdHost), line = host.lines[placed.hostLineOrdinal];
    const placement = { pageOrdinal: placed.pageOrdinal, columnOrdinal: placed.columnOrdinal, referenceBoxes: placed.referenceBoxes };
    const dy = placed.y - line.y;
    for (const row of host.rowsByLine[line.lineOrdinal]) rows.push({ ...row, x: (row.x ?? 20) + placed.x - 20, y: row.y + dy, ...placement, pageClip: placed.referenceBoxes.column });
    for (const anchor of host.anchorsByLine[line.lineOrdinal]) {
      if (emitted.has(anchor.createdTableIdentity)) return unavailable("DuplicateCreatedTablePageCell");
      emitted.add(anchor.createdTableIdentity);
      const flow = cells.get(anchor.createdTableIdentity), dx = placed.x + anchor.x, ay = placed.y + anchor.y - line.y;
      boxes.push(...flow.boxes.map(box => ({ ...box, x: box.x + dx, y: box.y + ay, ...placement })));
      rows.push(...flow.rows.map(row => ({ ...row, x: row.x + dx, y: row.y + ay, ...placement,
        pageClip: { ...row.pageClip, x: row.pageClip.x + dx, y: row.pageClip.y + ay } })));
    }
  }
  if (emitted.size !== cells.size || rows.length > maxRows) return unavailable("CreatedTablePageProjectionLimit");
  if (rows.some(row => ![row.x, row.y, row.height, row.x + (row.width ?? 0), row.y + row.height].every(Number.isFinite))) return unavailable("InvalidCreatedTablePageProjection");
  const sourceTexts = new Map(content.paragraphs.map(paragraph => [`${paragraph.section}:${paragraph.paragraph}`, paragraph.text]));
  const sourceRows = rows.filter(row => !row.createdCell && (row.kind !== "text" || row.startUnit < row.endUnit || sourceTexts.get(`${row.section}:${row.paragraph}`) === ""));
  const coverage = pageParagraphCoverage(content.paragraphs, sourceRows);
  if (coverage.state !== "complete") return coverage;
  return { ...paginated, rows: rows.sort((a, b) => a.y - b.y || a.x - b.x), boxes,
    pages: paginated.pages.map(page => ({ ...page, section: setting.section_ordinal })), spatialRows: true,
    createdTablesPaginated: true, createdCellParagraphs: [...cells.values()].flatMap(flow => flow.paragraphs), pageLayoutMode: "measured-created-inline" };
}
