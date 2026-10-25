import { validateHwp5FormSources, validateHwp5FormAnchors } from "../../js/hwp5-form-sources.mjs";
import { sourceDisplayPosition } from "./text-offsets.mjs";

/** Current native provenance only; no inferred form painting or input permission. */
export function attachHwp5Forms(editor, content) {
  content.hwp5FormSourcesAvailable = editor?.supportsFormSources?.() === true;
  content.hwp5Forms = []; content.hwp5FormErrors = [];
  if (!content.hwp5FormSourcesAvailable) return;
  for (const section of new Set(content.paragraphs.map(p => p.section))) {
    try {
      const sources = validateHwp5FormSources(editor.formSources(section));
      const anchors = validateHwp5FormAnchors(editor.formAnchors(section)), rows = [];
      if (sources.length !== anchors.length) throw Error("IncompleteHwp5FormAnchors");
      const byControl = new Map(anchors.map(anchor => [anchor.control_node, anchor])), paragraphs = new Map();
      for (const p of content.paragraphs) if (p.section === section) {
        if (paragraphs.has(p.paragraph)) throw Error("AmbiguousCurrentHwp5FormOwner");
        paragraphs.set(p.paragraph, p);
      }
      for (const source of sources) {
        const anchor = byControl.get(source.control_node);
        if (!anchor || anchor.object_node !== source.object_node || anchor.source_unit !== source.source_unit) throw Error("AmbiguousHwp5FormAnchor");
        const p = paragraphs.get(anchor.paragraph);
        if (!p || p.clipped) throw Error("MissingCurrentHwp5FormOwner");
        const unit = sourceDisplayPosition(anchor.current_unit, p.sourceOffsets, p.text.length);
        const end = sourceDisplayPosition(anchor.current_unit + 8, p.sourceOffsets, p.text.length);
        if (p.text[unit] !== "\ufffc" || end !== unit + 1) throw Error("InvalidCurrentHwp5FormAnchor");
        rows.push({ section, controlNode: source.control_node, formNode: source.object_node, paragraph: anchor.paragraph, anchorUnit: unit, source, anchor });
      }
      content.hwp5Forms.push(...rows);
    } catch (error) { content.hwp5FormErrors.push({ section, error: error.message }); }
  }
}
