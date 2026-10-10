import { validateHwp5DrawingSources } from "../../js/hwp5-drawing-sources.mjs";
import { validateHwp5DrawingAnchors } from "../../js/hwp5-drawing-anchors.mjs";
import { sourceDisplayPosition } from "./text-offsets.mjs";
import { attachHwp5DrawingBodies } from "./hwp5-drawing-body-content.mjs";
import { attachHwp5DrawingMatrices } from "./hwp5-drawing-matrix-content.mjs";
import { attachHwp5DrawingLocalTransforms } from "./hwp5-drawing-local-content.mjs";
import { attachHwp5DrawingCorners } from "./hwp5-drawing-corner-content.mjs";
import { attachHwp5DrawingGeometry } from "./hwp5-drawing-geometry.mjs";
import { attachHwp5DrawingStyles } from "./hwp5-drawing-style-content.mjs";
import { attachHwp5DrawingComponents } from "./hwp5-drawing-component-content.mjs";

export function attachHwp5Drawings(editor, content) {
  content.hwp5Drawings = [];
  content.hwp5DrawingErrors = [];
  attachHwp5DrawingComponents(null, content);
  if (!editor) return attachHwp5DrawingStyles(editor, attachHwp5DrawingGeometry(attachHwp5DrawingCorners(editor, attachHwp5DrawingLocalTransforms(editor, attachHwp5DrawingMatrices(editor, attachHwp5DrawingBodies(editor, content))))));
  for (const section of new Set((content.paragraphs ?? []).map(row => row.section))) {
    try {
      const sources = validateHwp5DrawingSources(editor.drawingSources(section));
      const anchors = validateHwp5DrawingAnchors(editor.drawingAnchors(section)), prepared = [];
      if (sources.length !== anchors.length) throw new Error("IncompleteHwp5DrawingAnchors");
      const paragraphsInSection = content.paragraphs.filter(row => row.section === section);
      const flowsInSection = (content.currentParagraphFlows ?? []).filter(row => row.section === section);
      if (new Set(paragraphsInSection.map(row => row.paragraph)).size !== paragraphsInSection.length
        || new Set(flowsInSection.map(row => row.paragraph)).size !== flowsInSection.length) throw new Error("AmbiguousHwp5DrawingOwner");
      for (const source of sources) {
        const anchor = anchors.find(row => row.control_node === source.control_node && row.component_node === source.component_node);
        if (!anchor) throw new Error("MissingHwp5DrawingAnchor");
        const paragraphs = content.paragraphs.filter(row => row.section === section && row.paragraph === anchor.paragraph);
        if (paragraphs.length !== 1 || paragraphs[0].clipped) throw new Error("MissingHwp5DrawingParagraph");
        const paragraph = paragraphs[0], flow = content.currentParagraphFlows?.find(row => row.section === section && row.paragraph === anchor.paragraph);
        if (flow?.source_node !== source.paragraph_node) throw new Error("Hwp5DrawingOwnerMismatch");
        const unit = sourceDisplayPosition(anchor.current_unit, paragraph.sourceOffsets, paragraph.text.length);
        const end = sourceDisplayPosition(anchor.current_unit + 8, paragraph.sourceOffsets, paragraph.text.length);
        if (end !== unit + 1 || paragraph.text[unit] !== "\ufffc") throw new Error("Hwp5DrawingDisplayAnchorMismatch");
        if (prepared.some(row => row.hostParagraph === anchor.paragraph && row.anchorUnit === unit)) throw new Error("AmbiguousHwp5DrawingAnchor");
        prepared.push({ section, controlNode: source.control_node, componentNode: source.component_node, hostParagraph: anchor.paragraph, anchorUnit: unit, source, anchor });
      }
      content.hwp5Drawings.push(...prepared);
    } catch (error) { content.hwp5DrawingErrors.push({ section, error: error.message }); }
  }
  attachHwp5DrawingComponents(editor, content);
  return attachHwp5DrawingStyles(editor, attachHwp5DrawingGeometry(attachHwp5DrawingCorners(editor, attachHwp5DrawingLocalTransforms(editor, attachHwp5DrawingMatrices(editor, attachHwp5DrawingBodies(editor, content))))));
}
