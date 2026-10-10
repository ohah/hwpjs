import { prepareTablePageBands } from "./table-page-bands.mjs";
import { planMeasuredCellCuts } from "./table-measured-cell-cuts.mjs";

// 개체만 있는 인라인 호스트를 셀 병합 경계를 지킨 페이지 band로 확장합니다.
export function prepareSplitInlineTableHost(paragraph, measuredHost, entry, { capacity } = {}) {
  const unavailable = error => ({ state: "unavailable", error });
  if (capacity !== undefined && (!Number.isFinite(capacity) || capacity <= 0)) return unavailable("InvalidInlineTableSplitCapacity");
  const reasons = [];
  const hostRows = Array.isArray(measuredHost?.rows) ? measuredHost.rows : [];
  const textRows = hostRows.filter(row => row?.kind === "text");
  if (paragraph?.text !== "\ufffc") reasons.push("HostText");
  if (measuredHost?.anchors?.length !== 1 || textRows?.length !== 1
    || hostRows.some(row => !row || row.kind !== "text" && (row.kind !== "gap" || !Number.isFinite(row.height) || row.height < 0))) reasons.push("HostRows");
  if (entry?.table?.anchorUnit !== 0) reasons.push("AnchorPosition");
  if (entry?.table?.pagination?.page_break !== "cell") reasons.push("SourcePageBreak");
  if (reasons.length) return { ...unavailable("UnsupportedSplitInlineTableHost"), section: paragraph?.section,
    paragraph: paragraph?.paragraph, tableNode: entry?.table?.tableNode, reasons };
  const anchor = measuredHost.anchors[0];
  if (!anchor || anchor.objectNode !== entry.table.tableNode || anchor.unit !== 0 || !Number.isFinite(anchor.x)) return unavailable("UnsupportedSplitInlineTableHost");
  if (!Array.isArray(entry.measured?.grid?.rows)) return unavailable("UnsupportedSplitInlineTableHost");
  const prepared = prepareTablePageBands(entry.table, entry.measured.grid.rows, "row-bands", entry.margins);
  if (prepared.state !== "prepared") return prepared;
  const source = textRows[0];
  if (capacity !== undefined && prepared.rows.some(row => row.height > capacity)) {
    const available = capacity - prepared.margins.top - prepared.margins.bottom;
    const cuts = planMeasuredCellCuts(entry.table, entry.measured, available, { origin: { x: 0, y: 0 }, padding: "source" });
    if (cuts.state !== "planned") return cuts;
    const slicedRows = cuts.fragments.map((fragment, index) => ({ kind: "gap", section: paragraph.section, paragraph: paragraph.paragraph,
      splitInlineTableNode: entry.table.tableNode, cellCutOrdinal: index,
      ...(index === 0 ? { ...source, inlineTables: [{ tableNode: entry.table.tableNode, unit: 0 }] } : {}),
      height: fragment.height + (index === 0 ? prepared.margins.top : 0) + (index === cuts.fragments.length - 1 ? prepared.margins.bottom : 0) }));
    const index = hostRows.indexOf(source);
    return { state: "prepared", prepared, cuts, rows: [...hostRows.slice(0, index), ...slicedRows, ...hostRows.slice(index + 1)], anchorX: anchor.x };
  }
  const rows = prepared.rows.map((row, index) => ({ ...row, splitInlineTableNode: entry.table.tableNode,
    ...(index === 0 ? { ...source, height: row.height, bandOrdinal: row.bandOrdinal, inlineTables: [{ tableNode: entry.table.tableNode, unit: 0 }] } : {}) }));
  const sourceIndex = measuredHost.rows.indexOf(source);
  return { state: "prepared", prepared, rows: [...measuredHost.rows.slice(0, sourceIndex), ...rows, ...measuredHost.rows.slice(sourceIndex + 1)], anchorX: anchor.x };
}
