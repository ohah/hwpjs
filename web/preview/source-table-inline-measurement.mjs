import { mixedInlineTablePolicy } from "./mixed-inline-table-policy.mjs";
import { tablePageAnchorError } from "./table-page-anchor-policy.mjs";
import { measureTableCells } from "./table-cell-measurement.mjs";
import { hwpUnitPixels } from "./hwp-units.mjs";

// Keep source node/list ownership; never manufacture generated table identities.
export function measureSourceInlineTables(content, measure, maxRows) {
  const unavailable = error => ({ state: "unavailable", error });
  if (!Array.isArray(content?.paragraphs) || !Array.isArray(content.tables ?? []) || typeof measure !== "function" || !Number.isSafeInteger(maxRows) || maxRows < 1) return unavailable("InvalidSourceInlineTables");
  if (["structuralAnchorErrors", "tableAnchorErrors", "tableGeometryErrors", "cellLayoutSourceErrors", "tableCaptionErrors", "tableCaptionBindingErrors", "hwp5CaptionErrors", "hwp5CaptionGeometryErrors"].some(key => content[key]?.length)) return unavailable("IncompleteTableSources");
  const tables = new Map(), hosts = new Map();
  let rowCount = 0;
  for (const table of content.tables ?? []) {
    if (!table || !Number.isSafeInteger(table.tableNode) || table.tableNode < 0 || !Array.isArray(table.cells) || !table.cells.length) return unavailable("InvalidSourceInlineTables");
    const policy = mixedInlineTablePolicy(table);
    if (policy.state !== "supported") return policy;
    if (tables.has(table.tableNode)) return unavailable("AmbiguousTablePageHost");
    const anchorReason = tablePageAnchorError(table.sourceGeometry);
    if (anchorReason) return { ...unavailable("UnsupportedTablePageAnchor"), anchorReason };
    const host = content.paragraphs.find(p => p.section === table.section && p.paragraph === table.hostParagraph && !p.tableCell);
    if (!host || !Number.isSafeInteger(table.anchorUnit) || host.text[table.anchorUnit] !== "\ufffc") return unavailable("InvalidInlineTableAnchorPosition");
    const raw = table.sourceGeometry.out_margin;
    if (!Array.isArray(raw) || raw.length !== 4 || !raw.every(value => Number.isSafeInteger(value) && value >= 0 && value <= 0xffffffff)) return unavailable("MissingTableOuterInsets");
    if (rowCount >= maxRows) return unavailable("TableCellMeasurementLimit");
    const measured = measureTableCells(table, content.paragraphs, measure, { origin: { x: 0, y: 0 }, padding: "source", maxRows: maxRows - rowCount, paragraphFlows: content.paragraphFlows });
    if (measured.state !== "measured") return measured;
    rowCount += measured.rowCount;
    const [left, right, top, bottom] = raw.map(hwpUnitPixels), margins = { left, right, top, bottom };
    tables.set(table.tableNode, { table, measured, margins });
    const key = `${table.section}:${table.hostParagraph}`, entries = hosts.get(key) ?? [];
    entries.push({ tableNode: table.tableNode, unit: table.anchorUnit, width: measured.grid.width + left + right, height: measured.grid.height + top + bottom });
    hosts.set(key, entries);
  }
  return { state: "measured", tables, hosts, rowCount };
}
