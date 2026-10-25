import { layoutTableBodyContent } from "./table-body-content-layout.mjs";
import { measureCreatedBodyFlow } from "./created-body-flow-measurement.mjs";
import { createdTableIdentity } from "../../js/created-table-identity.mjs";
import { measureCreatedSourceCell } from "./created-table-source-cell-flow.mjs";
import { completeCreatedSourceScene } from "./created-source-scene-completion.mjs";

// Source tables/pictures keep their engine. Body and flat source cells reserve
// generated host lines; generated identities never become source node indices.
export function layoutCreatedTableSourceScene(content, measure, maxRows) {
  const unavailable = error => ({ state: "unavailable", error });
  if (["drawings", "rectangles", "lines", "checkBoxes", "charts", "noteBodies"].some(key => content[key]?.length)) return unavailable("UnsupportedCreatedTablePageObjects");
  const groups = new Map(), identities = new Set();
  for (const table of content.createdTables) {
    try { createdTableIdentity(table?.identity); } catch { return unavailable("InvalidCreatedTablePageOwner"); }
    if (identities.has(table.identity)) return unavailable("InvalidCreatedTablePageOwner");
    identities.add(table.identity);
    const host = content.paragraphs.find(p => p.section === table.section && p.paragraph === table.hostParagraph);
    if (!host || host.tableCaption || host.drawingText || host.clipped || host.textStartUnit
      || !host.tableCell && content.tables.some(source => source.section === table.section && source.hostParagraph === table.hostParagraph)) return unavailable("UnsupportedCreatedTableSourceHost");
    const flow = content.paragraphFlows?.find(f => f.section === host.section && f.paragraph === host.paragraph);
    if (!host.tableCell && (!flow || flow.host !== "body" || flow.top_level !== true || flow.column_declaration?.count > 1)) return unavailable("UnsupportedCreatedTableSourceHost");
    const key = `${table.section}:${table.hostParagraph}`, entries = groups.get(key) ?? [];
    entries.push(table); groups.set(key, entries);
  }
  const prepared = new Map();
  return layoutTableBodyContent(content, measure, maxRows, {
    completeLayout: source => completeCreatedSourceScene(content,source,prepared,groups.size,maxRows),
    measureCellFlow: input => measureCreatedSourceCell(content,groups,prepared,input), measureBodyParagraph({ paragraph, width, measure: currentMeasure, maxRows: remaining }) {
    const key = `${paragraph.section}:${paragraph.paragraph}`, tables = groups.get(key);
    if (!tables) return null;
    if (prepared.has(key)) return unavailable("DuplicateCreatedTablePageHost");
    const flow = measureCreatedBodyFlow({ ...content, paragraphs: [paragraph], tables: [], createdTables: tables }, width, currentMeasure, remaining);
    if (flow.state === "measured") prepared.set(key, flow);
    return flow;
  } });
}
