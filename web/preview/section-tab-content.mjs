import { validateSectionTabs } from "../../js/hwpx-section-tabs.mjs";
import { resolveSectionTabInterval } from "./section-tab-interval.mjs";

/** Raw declarations stay separate from the unique selected-body interval resolution. */
export function attachSectionTabSources(editor, content) {
  content.sectionTabSources = null;
  delete content.sectionTabSourcesError;
  const selected = [];
  for (const paragraph of content.paragraphs) {
    paragraph.sectionTabSources = null;
    paragraph.sectionTabInterval = null;
    if (paragraph.text.includes("\t") && !paragraph.clipped) selected.push(paragraph);
  }
  if (!selected.length) return content;
  try {
    if (typeof editor.sectionTabSources !== "function")
      throw new Error("HwpxSectionTabsAbiUnavailable");
    const rows = validateSectionTabs(editor.sectionTabSources());
    content.sectionTabSources = rows;
    const intervals = new Map();
    for (const paragraph of selected) {
      paragraph.sectionTabSources = rows.filter((row) => row.section === paragraph.section);
      if (!intervals.has(paragraph.section))
        intervals.set(paragraph.section, resolveSectionTabInterval(rows, paragraph.section));
      paragraph.sectionTabInterval = intervals.get(paragraph.section);
    }
  } catch (error) {
    content.sectionTabSourcesError = error.message;
  }
  return content;
}
