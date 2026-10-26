import { validateTabSources } from "../../js/hwpx-tab-sources.mjs";

/** Current display provenance only; never grants edit or layout eligibility. */
export function attachTabSources(editor, content) {
  for (const paragraph of content.paragraphs) {
    paragraph.tabSources = null;
    delete paragraph.tabSourcesError;
    if (!paragraph.text.includes("\t") || paragraph.clipped) continue;
    try {
      if (typeof editor.tabSources !== "function") throw new Error("HwpxTabSourcesAbiUnavailable");
      const result = validateTabSources(
        editor.tabSources(paragraph.section, paragraph.paragraph + 1),
      );
      if (result.section !== paragraph.section || result.paragraph !== paragraph.paragraph + 1)
        throw new Error("TabSourcesParagraphMismatch");
      const positions = [];
      for (let i = 0; i < paragraph.text.length; i++)
        if (paragraph.text[i] === "\t") positions.push(i);
      if (
        positions.length !== result.rows.length ||
        result.rows.some((row, i) => row.unit !== positions[i])
      )
        throw new Error("TabSourcesDisplayMismatch");
      paragraph.tabSources = result.rows.map((row) => ({ ...row }));
    } catch (error) {
      paragraph.tabSourcesError = error.message;
    }
  }
  return content;
}
