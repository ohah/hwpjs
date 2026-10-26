import { sourceDisplayPosition } from "./text-offsets.mjs";
import { HWP5_STRUCTURAL_ANCHOR_KINDS } from "../../js/hwp5-structural-anchors.mjs";

/** Metadata only: preserve text and editing coordinates until layout projection. */
export function attachHwp5StructuralAnchors(editor, content) {
  content.structuralAnchorErrors = [];
  for (const paragraph of content.paragraphs) delete paragraph.structuralAnchors;
  if (!editor) return content;
  for (let section = 0; section < editor.sectionCount(); section++) {
    try {
      const paragraphs = new Map(
        content.paragraphs
          .filter((row) => row.section === section)
          .map((row) => [row.paragraph, row]),
      );
      const prepared = [],
        controls = new Set(),
        positions = new Set();
      for (const row of editor.structuralAnchors(section)) {
        const paragraph = paragraphs.get(row.paragraph);
        if (
          !paragraph ||
          paragraph.clipped ||
          controls.has(row.control_node) ||
          !HWP5_STRUCTURAL_ANCHOR_KINDS.includes(row.kind)
        )
          throw new Error("StructuralDisplayAnchorBindingMismatch");
        const unit = sourceDisplayPosition(
          row.current_unit,
          paragraph.sourceOffsets,
          paragraph.text.length,
        );
        const end = sourceDisplayPosition(
          row.current_unit + 8,
          paragraph.sourceOffsets,
          paragraph.text.length,
        );
        const key = `${row.paragraph}:${unit}`;
        if (end !== unit + 1 || paragraph.text[unit] !== "\ufffc" || positions.has(key))
          throw new Error("StructuralDisplayAnchorMismatch");
        controls.add(row.control_node);
        positions.add(key);
        prepared.push({ paragraph, anchor: { ...row, unit } });
      }
      for (const { paragraph, anchor } of prepared)
        (paragraph.structuralAnchors ??= []).push(anchor);
    } catch (error) {
      content.structuralAnchorErrors.push({ section, error: error.message });
    }
  }
  return content;
}
