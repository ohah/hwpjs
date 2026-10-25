import { fixedColumnParagraphContext } from "./fixed-column-paragraph-context.mjs";
import { measureInlineTableParagraph } from "./inline-table-paragraph-measurement.mjs";

/** Inline anchors and text share the declared column width, never the page width. */
export function measureInlineTableColumnParagraph(paragraph, entries, flow, body, measure, options) {
  const fail = error => ({ state: "unavailable", error });
  const context = fixedColumnParagraphContext(paragraph, flow, body);
  if (context.state !== "resolved") return fail({ owner: "UnsupportedInlineTableColumnOwner", declaration: "UnsupportedInlineTableColumns", changes: "UnsupportedInlineTableColumnChanges", unequal: "UnsupportedUnequalInlineTableColumns" }[context.reason]);
  const measured = measureInlineTableParagraph(paragraph, entries, context.width, measure, options);
  if (measured.state !== "measured") return measured;
  return { ...measured, rows: measured.rows.map(row => ({ ...row, columnDeclaration: context.declaration })) };
}
