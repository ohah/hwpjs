import { prepareTablePageBands } from "./table-page-bands.mjs";
import { planMeasuredCellCuts } from "./table-measured-cell-cuts.mjs";
import { pageRowFitHeight } from "./page-row-extents.mjs";
import { inlineTablePageFitHeight } from "./inline-table-page-fit.mjs";

// 개체만 있는 인라인 호스트를 셀 병합 경계를 지킨 페이지 band로 확장합니다.
export function prepareSplitInlineTableHost(
  paragraph,
  measuredHost,
  entry,
  { capacity, zeroWidthUnits = [] } = {},
) {
  const unavailable = (error) => ({ state: "unavailable", error });
  if (capacity !== undefined && (!Number.isFinite(capacity) || capacity <= 0))
    return unavailable("InvalidInlineTableSplitCapacity");
  const reasons = [];
  const hostRows = Array.isArray(measuredHost?.rows) ? measuredHost.rows : [];
  const textRows = hostRows.filter((row) => row?.kind === "text");
  const unit = entry?.table?.anchorUnit;
  const validZeroWidth =
    Array.isArray(zeroWidthUnits) &&
    new Set(zeroWidthUnits).size === zeroWidthUnits.length &&
    zeroWidthUnits.every(
      (at) =>
        Number.isSafeInteger(at) && at >= 0 && at !== unit && paragraph?.text?.[at] === "\ufffc",
    );
  if (
    !validZeroWidth ||
    typeof paragraph?.text !== "string" ||
    paragraph.text.length !== zeroWidthUnits.length + 1 ||
    [...paragraph.text].some(
      (text, at) => text !== "\ufffc" || (at !== unit && !zeroWidthUnits.includes(at)),
    )
  )
    reasons.push("HostText");
  if (
    measuredHost?.anchors?.length !== 1 ||
    textRows?.length !== 1 ||
    hostRows.some(
      (row) =>
        !row ||
        (row.kind !== "text" &&
          (row.kind !== "gap" || !Number.isFinite(row.height) || row.height < 0)),
    )
  )
    reasons.push("HostRows");
  if (!Number.isSafeInteger(unit) || unit < 0 || paragraph?.text?.[unit] !== "\ufffc")
    reasons.push("AnchorPosition");
  if (entry?.table?.pagination?.page_break !== "cell") reasons.push("SourcePageBreak");
  if (entry?.captionReservation || entry?.table?.sourceCaption) reasons.push("TableCaption");
  if (reasons.length)
    return {
      ...unavailable("UnsupportedSplitInlineTableHost"),
      section: paragraph?.section,
      paragraph: paragraph?.paragraph,
      tableNode: entry?.table?.tableNode,
      reasons,
    };
  const anchor = measuredHost.anchors[0];
  if (
    !anchor ||
    anchor.objectNode !== entry.table.tableNode ||
    anchor.unit !== unit ||
    !Number.isFinite(anchor.x)
  )
    return unavailable("UnsupportedSplitInlineTableHost");
  if (!Array.isArray(entry.measured?.grid?.rows))
    return unavailable("UnsupportedSplitInlineTableHost");
  const prepared = prepareTablePageBands(
    entry.table,
    entry.measured.grid.rows,
    "row-bands",
    entry.margins,
  );
  if (prepared.state !== "prepared") return prepared;
  const source = textRows[0];
  const { pageFitHeight: _wholeFit, ...sourceFragment } = source;
  if (
    source.section !== paragraph.section ||
    source.paragraph !== paragraph.paragraph ||
    source.startUnit !== 0 ||
    source.endUnit !== paragraph.text.length ||
    source.text !== paragraph.text
  )
    return unavailable("UnsupportedSplitInlineTableHost");
  const reserved = prepared.rows.reduce((sum, row) => sum + row.height, 0);
  if (!Number.isFinite(source.height) || source.height <= 0 || !Number.isFinite(reserved))
    return unavailable("UnsupportedSplitInlineTableHost");
  const trailing = Math.max(0, source.height - reserved),
    sourceIndex = hostRows.indexOf(source);
  const finish = (rows) => [
    ...hostRows.slice(0, sourceIndex),
    ...rows,
    ...(trailing > 0
      ? [
          {
            kind: "gap",
            section: paragraph.section,
            paragraph: paragraph.paragraph,
            height: trailing,
          },
        ]
      : []),
    ...hostRows.slice(sourceIndex + 1),
  ];
  if (capacity !== undefined && prepared.rows.some((row) => pageRowFitHeight(row) > capacity)) {
    if (prepared.repeatedHeader) return unavailable("UnsupportedSplitInlineCellHeader");
    const available = capacity - prepared.margins.top - prepared.margins.bottom;
    const cuts = planMeasuredCellCuts(entry.table, entry.measured, available, {
      origin: { x: 0, y: 0 },
      padding: "source",
    });
    if (cuts.state !== "planned") return cuts;
    const slicedRows = cuts.fragments.map((fragment, index) => ({
      kind: "gap",
      section: paragraph.section,
      paragraph: paragraph.paragraph,
      splitInlineTableNode: entry.table.tableNode,
      cellCutOrdinal: index,
      ...(index === 0
        ? { ...sourceFragment, inlineTables: [{ tableNode: entry.table.tableNode, unit }] }
        : {}),
      height:
        fragment.height +
        (index === 0 ? prepared.margins.top : 0) +
        (index === cuts.fragments.length - 1 ? prepared.margins.bottom : 0),
    }));
    const last = slicedRows.at(-1),
      fit = inlineTablePageFitHeight(entry.table, last.height, prepared.margins);
    if (fit < last.height) last.pageFitHeight = fit;
    return { state: "prepared", prepared, cuts, rows: finish(slicedRows), anchorX: anchor.x };
  }
  const rows = prepared.rows.map((row, index) => ({
    ...row,
    splitInlineTableNode: entry.table.tableNode,
    ...(index === 0
      ? {
          ...sourceFragment,
          height: row.height,
          bandOrdinal: row.bandOrdinal,
          inlineTables: [{ tableNode: entry.table.tableNode, unit }],
        }
      : {}),
  }));
  return { state: "prepared", prepared, rows: finish(rows), anchorX: anchor.x };
}
