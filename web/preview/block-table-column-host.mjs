import { fixedColumnParagraphContext } from "./fixed-column-paragraph-context.mjs";
import { measureBlockTableHost } from "./block-table-host-flow.mjs";

/** Preserve source-ordered block anchors and UTF-16 text at an explicit column width. */
export function measureBlockTableColumnHost(paragraph, entries, flow, body, measure, maxRows, anchors = {}) {
  const fail = error => ({ state: "unavailable", error });
  const context = fixedColumnParagraphContext(paragraph, flow, body);
  if (context.state !== "resolved") return fail({ owner: "UnsupportedBlockTableColumnOwner", declaration: "UnsupportedBlockTableColumns", changes: "UnsupportedBlockTableColumnChanges", unequal: "UnsupportedUnequalBlockTableColumns" }[context.reason]);
  const measured = measureBlockTableHost(paragraph, entries, context.width, measure, maxRows, anchors);
  if (measured.state !== "measured") return measured;
  return { ...measured, sequence: measured.sequence.map(row => row.tableIndex === undefined
    ? { ...row, columnDeclaration: context.declaration } : row) };
}
