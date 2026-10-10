/** Native current ownership and rendering endpoints; no XML parsing or layout. */
import { drawingStrokeSourceContent } from "./drawing-stroke-source-content.mjs";
import { decoratedLinePlan } from "./decorated-line-plan.mjs";
export function attachHwpxLines(editor, content) {
  content.lines = [];
  content.lineErrors = [];
  const displayed = content.window ? new Set(content.paragraphs.map(paragraph => `${paragraph.section}:${paragraph.paragraph}`)) : null;
  for (const section of new Set(content.paragraphs.map(row => row.section))) {
    let nodes;
    try {
      if (typeof editor.lineNodes !== "function") throw new Error("HwpxLineDisplayAbiUnavailable");
      nodes = editor.lineNodes(section);
    } catch (error) {
      content.lineErrors.push({ section, error: error.message });
      continue;
    }
    for (const lineNode of nodes) {
      try {
        if (typeof editor.lineDisplay !== "function") throw new Error("HwpxLineDisplayAbiUnavailable");
        const snapshot = editor.lineDisplay(section, lineNode);
        if (displayed && !displayed.has(`${section}:${snapshot.paragraph - 1}`)) continue;
        const row = { ...snapshot, section, paragraph: snapshot.paragraph - 1, state: "located", error: null, placement: null, placementError: null };
        try {
          if (typeof editor.linePlacement !== "function") throw new Error("HwpxLinePlacementAbiUnavailable");
          row.placement = editor.linePlacement(section, lineNode);
        } catch (error) { row.placementError = error.message; }
        const raw = drawingStrokeSourceContent(editor, section, lineNode);
        row.sourceStroke = raw.source;
        row.sourceStrokeError = raw.error;
        content.lines.push(row);
      } catch (error) {
        const raw = drawingStrokeSourceContent(editor, section, lineNode);
        let geometry = null, geometryError = null;
        try {
          if (typeof editor.lineGeometry !== "function") throw new Error("HwpxLineGeometryAbiUnavailable");
          const value = editor.lineGeometry(section, lineNode);
          if (value.current !== true || value.paintable !== false || value.coordinateSpace !== "renderingInfo" || value.geometry?.node !== lineNode || !Number.isInteger(value.geometry.paragraph) || value.geometry.paragraph < 1) throw new Error("LineGeometryBindingMismatch");
          geometry = value.geometry;
          if (displayed && !displayed.has(`${section}:${geometry.paragraph - 1}`)) continue;
        } catch (queryError) { geometryError = queryError.message; }
        const row = { section, lineNode, paragraph: geometry ? geometry.paragraph - 1 : null, anchorNode: geometry?.anchor_node ?? null, anchorUnit: geometry?.anchor_unit ?? null, endpoints: null, geometry, geometryError, sourceStroke: raw.source, sourceStrokeError: raw.error, state: "unavailable", error: error.message };
        if (error.message === "UnsupportedLineStrokeDecoration" && geometry && raw.source) {
          const plan = decoratedLinePlan(geometry, raw.source);
          if (plan.state === "planned") {
            try {
              if (typeof editor.linePlacement !== "function") throw new Error("HwpxLinePlacementAbiUnavailable");
              row.placement = editor.linePlacement(section, lineNode);
              row.referencePlan = plan;
              row.endpoints = geometry.endpoints;
              row.state = "reference_located";
              row.nativeDisplayError = error.message;
              row.error = null;
            } catch (placementError) { row.placementError = placementError.message; }
          } else row.referencePlanError = plan.error;
        }
        content.lines.push(row);
      }
    }
  }
  return content;
}
