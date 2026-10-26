import { inlineTableHostAnchors } from "./inline-table-host-anchors.mjs";
import { measureInlineTableParagraph } from "./inline-table-paragraph-measurement.mjs";
import { layoutContent } from "./layout.mjs";
import { paragraphSpacePixels } from "./paragraph-geometry.mjs";
import { tableInsets } from "./table-insets.mjs";
import { textMeasurement } from "./text-measurement.mjs";

// Block anchors end inline runs; offsets and source object types stay intact.
export function measureMixedTableHost(
  paragraph,
  entries,
  width,
  measure,
  maxRows,
  { overlays = [], textAnchors = [] } = {},
) {
  const fail = (error) => ({ state: "unavailable", error });
  if (
    typeof paragraph?.text !== "string" ||
    (paragraph.textStartUnit ?? 0) !== 0 ||
    !Array.isArray(entries) ||
    !entries.length ||
    entries.some(
      (e) => !e?.entry?.table || !Number.isSafeInteger(e.tableIndex) || e.tableIndex < 0,
    ) ||
    new Set(entries.map((e) => e.tableIndex)).size !== entries.length ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1 ||
    !Number.isFinite(width) ||
    width <= 0 ||
    typeof measure !== "function"
  )
    return fail("InvalidMixedTableHost");
  const anchors = inlineTableHostAnchors(
    paragraph,
    entries.map(({ entry: { table } }) => ({
      section: table.section,
      paragraph: table.hostParagraph,
      anchorUnit: table.anchorUnit,
      node: table.tableNode,
    })),
    overlays,
    textAnchors,
  );
  if (anchors.state !== "resolved") return anchors;
  for (const part of new Intl.Segmenter("ko", { granularity: "grapheme" }).segment(paragraph.text))
    if (part.segment.includes("\ufffc") && part.segment.length !== 1)
      return fail("UnsupportedMixedTableHostGrapheme");
  const ordered = entries.toSorted((a, b) => a.entry.table.anchorUnit - b.entry.table.anchorUnit);
  if (!ordered.some((e) => e.entry.inline) || !ordered.some((e) => !e.entry.inline))
    return fail("InvalidMixedTableHost");
  const sequence = [],
    inlineFlows = [];
  let cursor = 0,
    rowCount = 0;
  const gap = (value) => {
    const height = paragraphSpacePixels(value);
    if (height > 0) {
      sequence.push({
        kind: "gap",
        text: "",
        section: paragraph.section,
        paragraph: paragraph.paragraph,
        height,
      });
      rowCount++;
    }
  };
  const chunk = (end) => {
    if (end === cursor) return null;
    const local = ordered.filter(
      (e) => e.entry.inline && cursor <= e.entry.table.anchorUnit && e.entry.table.anchorUnit < end,
    );
    const slice = {
      ...paragraph,
      text: paragraph.text.slice(cursor, end),
      textStartUnit: cursor,
      paragraphShape: { ...paragraph.paragraphShape, before: 0, after: 0 },
    };
    const budget = maxRows - rowCount;
    if (budget < 1) return fail("TablePagePlanLimit");
    if (local.length) {
      if (local.some((e) => e.entry.splitMode !== "whole"))
        return fail("UnsupportedMixedInlineTableSplit");
      const objects = [];
      for (const { entry } of local) {
        const margins = tableInsets(entry.outerInsets ?? 0);
        if (
          !margins ||
          ![entry.measured?.grid?.width, entry.measured?.grid?.height].every(
            (v) => Number.isFinite(v) && v > 0,
          )
        )
          return fail("InvalidMixedTableHost");
        objects.push({
          tableNode: entry.table.tableNode,
          unit: entry.table.anchorUnit,
          width: entry.measured.grid.width + margins.left + margins.right,
          height: entry.measured.grid.height + margins.top + margins.bottom,
        });
      }
      const flow = measureInlineTableParagraph(
        slice,
        objects,
        width,
        (text, _slice, unit, kind) => measure(text, paragraph, unit, kind),
        {
          maxRows: budget,
          allowLineOverflow: true,
          zeroWidthUnits: anchors.zeroWidthUnits.filter((u) => cursor <= u && u < end),
          textAnchorUnits: anchors.textAnchorUnits.filter((u) => cursor <= u && u < end),
        },
      );
      if (flow.state !== "measured") return flow;
      rowCount += flow.rows.length;
      const indices = local.map((e) => e.tableIndex);
      inlineFlows.push({ indices, flow });
      sequence.push({ inlineTableIndices: indices });
    } else {
      const zero = new Set(anchors.zeroWidthUnits);
      const flow = layoutContent(
        { paragraphs: [slice], limited: false },
        width,
        (text, _slice, unit, kind) =>
          kind === "text" && zero.has(unit)
            ? { ...textMeasurement(measure("", paragraph, unit, kind)), width: 0 }
            : measure(text, paragraph, unit, kind),
        budget,
        { documentBody: true },
      );
      if (flow.limited) return fail("TablePagePlanLimit");
      sequence.push(...flow.rows);
      rowCount += flow.rows.length;
    }
    return null;
  };
  gap(paragraph.paragraphShape?.before);
  for (const item of ordered.filter((e) => !e.entry.inline)) {
    const failure = chunk(item.entry.table.anchorUnit);
    if (failure) return failure;
    sequence.push({ tableIndex: item.tableIndex });
    cursor = item.entry.table.anchorUnit + 1;
  }
  const failure = chunk(paragraph.text.length);
  if (failure) return failure;
  gap(paragraph.paragraphShape?.after);
  return rowCount > maxRows
    ? fail("TablePagePlanLimit")
    : { state: "measured", sequence, inlineFlows, rowCount };
}
