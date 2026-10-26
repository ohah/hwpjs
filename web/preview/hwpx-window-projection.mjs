import { displayHwpxContent, HWPX_DISPLAY_BOUNDS } from "./hwpx-content.mjs";
import { hwpxWindowDependencies } from "./hwpx-window-dependencies.mjs";
import { planParagraphWindow } from "./paragraph-window-plan.mjs";

// A complete source-text window, not an editable model or original page layout.
export function projectHwpxWindow(
  editor,
  projection,
  {
    offset,
    count,
    maxParagraphs = HWPX_DISPLAY_BOUNDS.maxParagraphs,
    maxUnits = HWPX_DISPLAY_BOUNDS.maxUnits,
  },
) {
  planParagraphWindow({
    total: projection.paragraphCount,
    offset,
    count,
    groups: [],
    maxParagraphs,
  });
  if (!Number.isSafeInteger(maxUnits) || maxUnits < 0) throw new RangeError("InvalidDisplayBounds");
  const groups = hwpxWindowDependencies(editor, projection);
  const plan = planParagraphWindow({
    total: projection.paragraphCount,
    offset,
    count,
    groups,
    maxParagraphs,
  });
  const content = displayHwpxContent(projection, { ...plan, maxUnits });
  if (content.paragraphs.some((row) => row.clipped))
    throw new RangeError("ParagraphWindowTextBudgetExceeded");
  return {
    ...content,
    limited: false,
    window: {
      requestedOffset: offset,
      requestedCount: count,
      paragraphOffset: plan.paragraphOffset,
      paragraphCount: plan.maxParagraphs,
    },
  };
}
