import { sourceDisplayPosition } from "./text-offsets.mjs";
/** Display-only boundaries derived from native current coordinates. */
export function attachHwp5ColumnDisplay(content) {
  content.columnDisplaySources = [];
  content.columnDisplayErrors = [];
  const paragraphs = new Map(
    (content.paragraphs ?? []).map((row) => [`${row.section}:${row.paragraph}`, row]),
  );
  for (const source of content.columnSources ?? []) {
    try {
      const paragraph = paragraphs.get(`${source.section}:${source.current_paragraph}`);
      if (!paragraph || paragraph.clipped || !Array.isArray(paragraph.sourceOffsets))
        throw new Error("MissingColumnDisplaySource");
      const unit = sourceDisplayPosition(
        source.current_unit,
        paragraph.sourceOffsets,
        paragraph.text.length,
      );
      const end = sourceDisplayPosition(
        source.current_unit + 8,
        paragraph.sourceOffsets,
        paragraph.text.length,
      );
      if (end !== unit + 1 || paragraph.text[unit] !== "\ufffc")
        throw new Error("ColumnDisplayAnchorMismatch");
      content.columnDisplaySources.push({ ...source, display_unit: unit, display_end: end });
    } catch (error) {
      content.columnDisplayErrors.push({
        section: source.section,
        source_node: source.source_node,
        error: error.message,
      });
    }
  }
  return content;
}
