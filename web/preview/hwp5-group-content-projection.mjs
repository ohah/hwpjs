import { projectHwp5GroupGeometry } from "./hwp5-group-geometry-projection.mjs";
import { projectHwp5DrawingText } from "./hwp5-drawing-text-projection.mjs";
import { projectHwp5PictureGeometry } from "./hwp5-picture-geometry.mjs";
import { hwp5DrawingPaintPlan } from "./hwp5-drawing-paint-plan.mjs";

export function projectHwp5GroupContent(content) {
  const fail = error => ({ state: "unavailable", error });
  if ((content.hwp5Drawings ?? []).some(row => row.source.kind_id !== 0x24636f6e)) return fail("UnsupportedMixedHwp5GroupRoots");
  const geometry = projectHwp5GroupGeometry(content);
  if (geometry.state !== "projected") return geometry;
  if (geometry.containers.some(row => row.source.group_context === null && row.source.has_caption)) return fail("UnsupportedHwp5GroupCaption");
  const text = projectHwp5DrawingText(content);
  if (text.state !== "projected") return text;
  if (text.bindings.some(row => row.kind === "caption")) return fail("UnsupportedHwp5GroupCaption");
  if (content.hwp5DrawingStyleErrors?.length) return fail("IncompleteHwp5GroupPaintSources");
  const pictures = projectHwp5PictureGeometry(content);
  if (pictures.state !== "projected") return pictures;
  if (pictures.pictures.some(row => row.paintError)) return fail("UnsupportedHwp5GroupPicturePaint");
  const rectangles = [], drawings = [];
  for (const rectangle of geometry.rectangles) {
    const styles = (content.hwp5DrawingStyles ?? []).filter(row => row.section === rectangle.section && row.component_node === rectangle.drawingNode && row.owner_node === rectangle.source.component.owner_node);
    if (styles.length !== 1) return fail("MissingHwp5GroupPaintSource");
    const paint = hwp5DrawingPaintPlan(styles[0]);
    if (paint.state !== "planned") return paint;
    const bindings = text.bindings.filter(row => row.section === rectangle.section && row.drawingNode === rectangle.drawingNode);
    if (bindings.length > 1) return fail("AmbiguousHwp5GroupText");
    const source = { ...rectangle.source, text: bindings[0]?.text ?? null, caption: null, stroke: paint.stroke, paint: { shadow_type: paint.shadowType } };
    const current = { ...rectangle, source, hwp5Style: structuredClone(styles[0]), fillPlan: paint.fill };
    rectangles.push(current);
    if (bindings.length) drawings.push(current);
  }
  if (text.bindings.some(binding => !drawings.some(row => row.section === binding.section && row.drawingNode === binding.drawingNode))) return fail("MissingHwp5GroupTextGeometry");
  return { state: "projected", content: { ...content, paragraphs: text.paragraphs, containers: geometry.containers, rectangles, drawings, pictures: pictures.pictures } };
}
