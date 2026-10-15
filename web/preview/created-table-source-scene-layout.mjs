import { layoutTableBodyContent } from "./table-body-content-layout.mjs";
import { measureCreatedBodyFlow, projectCreatedBodyFlow } from "./created-body-flow-measurement.mjs";
import { pageParagraphCoverage } from "./page-paragraph-coverage.mjs";
import { createdTableIdentity } from "../../js/created-table-identity.mjs";
import { sourceTableControlCoverage } from "./source-table-control-coverage.mjs";

// Source tables/pictures keep their existing engine; only separate body hosts
// supply generated whole-line reservations. No source node aliases are created.
export function layoutCreatedTableSourceScene(content, measure, maxRows) {
  const unavailable = error => ({ state: "unavailable", error });
  if (["drawings", "rectangles", "lines", "checkBoxes", "charts", "noteBodies"].some(key => content[key]?.length)) return unavailable("UnsupportedCreatedTablePageObjects");
  const groups = new Map(), identities = new Set();
  for (const table of content.createdTables) {
    try { createdTableIdentity(table?.identity); } catch { return unavailable("InvalidCreatedTablePageOwner"); }
    if (identities.has(table.identity)) return unavailable("InvalidCreatedTablePageOwner");
    identities.add(table.identity);
    const host = content.paragraphs.find(p => p.section === table.section && p.paragraph === table.hostParagraph);
    if (!host || host.tableCell || host.tableCaption || host.drawingText || host.clipped || host.textStartUnit
      || content.tables.some(source => source.section === table.section && source.hostParagraph === table.hostParagraph)) return unavailable("UnsupportedCreatedTableSourceHost");
    const flow = content.paragraphFlows?.find(f => f.section === host.section && f.paragraph === host.paragraph);
    if (!flow || flow.host !== "body" || flow.top_level !== true || flow.column_declaration?.count > 1) return unavailable("UnsupportedCreatedTableSourceHost");
    const key = `${table.section}:${table.hostParagraph}`, entries = groups.get(key) ?? [];
    entries.push(table); groups.set(key, entries);
  }
  const prepared = new Map();
  const source = layoutTableBodyContent(content, measure, maxRows, { measureBodyParagraph({ paragraph, width, measure: currentMeasure, maxRows: remaining }) {
    const key = `${paragraph.section}:${paragraph.paragraph}`, tables = groups.get(key);
    if (!tables) return null;
    if (prepared.has(key)) return unavailable("DuplicateCreatedTablePageHost");
    const flow = measureCreatedBodyFlow({ ...content, paragraphs: [paragraph], tables: [], createdTables: tables }, width, currentMeasure, remaining);
    if (flow.state === "measured") prepared.set(key, flow);
    return flow;
  } });
  if (source.state !== "paginated") return source;
  if (source.limited) return unavailable("CreatedTablePageProjectionLimit");
  if (prepared.size !== groups.size) return unavailable("MissingCreatedTablePageHost");
  const combined = { cells: new Map(), sourceTables: new Map(), measuredHosts: new Map() };
  for (const flow of prepared.values()) {
    for (const [key, value] of flow.cells) combined.cells.set(key, value);
    for (const [key, value] of flow.measuredHosts) combined.measuredHosts.set(key, value);
  }
  const projected = projectCreatedBodyFlow(combined, source.rows, maxRows);
  if (projected.state !== "projected") return projected;
  const texts = new Map(content.paragraphs.map(p => [`${p.section}:${p.paragraph}`, p.text]));
  const sourceRows = projected.rows.filter(row => !row.createdCell && (row.kind !== "text" || row.startUnit < row.endUnit || texts.get(`${row.section}:${row.paragraph}`) === ""));
  const controls = sourceTableControlCoverage(content, source, sourceRows);
  if (controls.state !== "verified") return controls;
  const coverage = pageParagraphCoverage(content.paragraphs, [...sourceRows, ...controls.rows]);
  if (coverage.state !== "complete") return coverage;
  return { ...source, rows: projected.rows.toSorted((a, b) => a.pageOrdinal - b.pageOrdinal || a.y - b.y || a.x - b.x),
    boxes: [...source.boxes, ...projected.boxes], hostNumberPrefixes: projected.hostNumberPrefixes,
    createdCellParagraphs: projected.createdCellParagraphs, createdTablesPaginated: true, spatialRows: true, pageLayoutMode: "measured-source-created-body" };
}
