import { layoutTableContent } from "./table-flow.mjs";
import { selectHwp5MemoPane } from "./hwp5-memo-pane-content.mjs";
import { attachHwp5MemoPane } from "./hwp5-memo-pane-layout.mjs";
import { TEXT_LEFT } from "./row-geometry.mjs";

// A failed annotation projection must retain the original full fallback, not
// return a body-only view with missing memo text.
export function layoutHwp5MemoFallback(content, width, measure, maxRows = 20000) {
  const original = error => ({ ...layoutTableContent(content, width, measure, maxRows), ...(error ? { memoPaneError: error } : {}) });
  const selection = selectHwp5MemoPane(content);
  if (selection.state !== "selected") return original(selection.error);
  if (!selection.groups.length) return original();
  const body = layoutTableContent(selection.content, width, measure, maxRows);
  const annotated = attachHwp5MemoPane(body, selection, measure, { bodyWidth: width + TEXT_LEFT, maxRows });
  return annotated.state === "unavailable" ? original(annotated.error) : annotated;
}
