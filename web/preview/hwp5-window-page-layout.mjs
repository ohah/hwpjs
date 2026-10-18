import { validateHwp5WindowSelection } from "./hwp5-window-selection.mjs";
import { layoutHwp5PageContent } from "./hwp5-page-layout.mjs";

export const HWP5_WINDOW_LAYOUT_SCOPE = "paragraph-window-fragment";

// Measured window fragment only, never original document pagination or page numbers.
export function layoutHwp5WindowContent(content, measure, maxRows = 20000, options = {}) {
  try {
    const selection = validateHwp5WindowSelection(content);
    if (!content.paragraphs.length) return { state: "unavailable", error: "EmptyHwp5Window" };
    if (content.tables?.some(table => table.partial)) return { state: "unavailable", error: "IncompleteHwp5WindowTables" };
    const result = layoutHwp5PageContent({ ...content, limited: false }, measure, maxRows, options);
    if (result.state !== "paginated") return result;
    return { ...result, limited: content.limited, windowSelection: selection,
      layoutScope: HWP5_WINDOW_LAYOUT_SCOPE, documentPageNumbersExact: false };
  } catch (error) { return { state: "unavailable", error: error.message }; }
}
