import { isSingleInlineTableHost } from "./single-inline-table-host.mjs";
import { structuralAnchorUnits } from "./structural-anchor-units.mjs";
import { measureInlineTableParagraph } from "./inline-table-paragraph-measurement.mjs";

// The common inline engine owns spacing/alignment; page-area repetition owns
// only the final origin. Unsupported mixed anchors must not disappear.
export function pageAreaInlineTableAnchor(host, table, cells, box, margins, measure, maxRows) {
  const fail = (error) => ({ state: "unavailable", error });
  if (!isSingleInlineTableHost(host, table)) return fail("UnsupportedPageAreaInlineTableHost");
  if (
    cells?.state !== "measured" ||
    !cells.grid ||
    !box ||
    ![cells.grid.width, cells.grid.height, box.width, box.height].every(
      (n) => Number.isFinite(n) && n > 0,
    ) ||
    ![box.x, box.y].every(Number.isFinite) ||
    !Array.isArray(margins) ||
    margins.length !== 4 ||
    !margins.every((n) => Number.isFinite(n) && n >= 0) ||
    typeof measure !== "function" ||
    !Number.isSafeInteger(maxRows) ||
    maxRows < 1
  )
    return fail("InvalidPageAreaInlineTableAnchor");
  const [left, right, top, bottom] = margins;
  const result = measureInlineTableParagraph(
    host,
    [
      {
        tableNode: table.tableNode,
        unit: table.anchorUnit ?? 0,
        width: cells.grid.width + left + right,
        height: cells.grid.height + top + bottom,
      },
    ],
    box.width,
    measure,
    {
      maxRows,
      compactLines: true,
      allowLineOverflow: true,
      zeroWidthUnits: [...structuralAnchorUnits(host)],
    },
  );
  if (result.state !== "measured") return result;
  if (result.anchors.length !== 1) return fail("AmbiguousPageAreaInlineTableAnchor");
  const anchor = result.anchors[0];
  return {
    state: "selected",
    hostLayout: result,
    rectangle: {
      x: box.x + anchor.x + left,
      y: box.y + anchor.y + top,
      width: cells.grid.width,
      height: cells.grid.height,
    },
  };
}
