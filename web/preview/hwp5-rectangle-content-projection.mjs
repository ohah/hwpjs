import { projectHwp5RectangleGeometry } from "./hwp5-rectangle-geometry-projection.mjs";
import { projectHwp5DrawingText } from "./hwp5-drawing-text-projection.mjs";
import { hwp5DrawingPaintPlan } from "./hwp5-drawing-paint-plan.mjs";

// Assemble common rectangle inputs without changing raw inventories or the editor model.
export function projectHwp5RectangleContent(content) {
  const geometry = projectHwp5RectangleGeometry(content);
  if (geometry.state !== "projected") return geometry;
  const text = projectHwp5DrawingText(content);
  if (text.state !== "projected") return text;
  return assembleHwp5RectangleContent(content, geometry, text);
}

// Reuse complete text ownership when geometry was partitioned by root kind.
export function assembleHwp5RectangleContent(content, geometry, text) {
  const fail = (error) => ({ state: "unavailable", error });
  if (geometry?.state !== "projected" || text?.state !== "projected")
    return fail("IncompleteHwp5RectangleProjection");
  if (content.hwp5DrawingStyleErrors?.length) return fail("IncompleteHwp5DrawingPaintSources");
  const drawings = [];
  for (const drawing of geometry.drawings) {
    const styles = (content.hwp5DrawingStyles ?? []).filter(
      (row) =>
        row.section === drawing.section &&
        row.component_node === drawing.drawingNode &&
        row.owner_node === drawing.controlNode,
    );
    if (styles.length !== 1) return fail("MissingHwp5DrawingPaintSource");
    const paint = hwp5DrawingPaintPlan(styles[0]);
    if (paint.state !== "planned") return paint;
    const bindings = text.bindings.filter(
      (row) => row.section === drawing.section && row.drawingNode === drawing.drawingNode,
    );
    const bodies = bindings.filter((row) => row.kind === "body"),
      captions = bindings.filter((row) => row.kind === "caption");
    if (
      bodies.length > 1 ||
      captions.length > 1 ||
      drawing.source.has_caption !== (captions.length === 1)
    )
      return fail("AmbiguousHwp5RectangleText");
    drawing.source.text = bodies[0]?.text ?? null;
    drawing.source.caption = captions[0]?.caption ?? null;
    drawing.source.stroke = paint.stroke;
    drawing.source.paint = { shadow_type: paint.shadowType };
    drawing.source.flow.outside_margins = [...drawing.source.out_margin];
    drawings.push({ ...drawing, hwp5Style: structuredClone(styles[0]), fillPlan: paint.fill });
  }
  return {
    state: "projected",
    content: { ...content, paragraphs: text.paragraphs, drawings, containers: [] },
  };
}
