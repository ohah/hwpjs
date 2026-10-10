import { projectHwp5RectangleGeometry } from "./hwp5-rectangle-geometry-projection.mjs";
import { assembleHwp5RectangleContent } from "./hwp5-rectangle-content-projection.mjs";
import { projectHwp5PictureGeometry } from "./hwp5-picture-geometry.mjs";
import { projectHwp5DrawingText } from "./hwp5-drawing-text-projection.mjs";
import { hwp5ObjectFlags } from "./hwp5-object-flags.mjs";

// Assemble ownership without claiming that the page engine can place mixed roots.
export function projectHwp5MixedRootContent(content) {
  const fail = error => ({ state: "unavailable", error });
  const roots = content.hwp5Drawings ?? [];
  if (!roots.length || roots.some(row => ![0x24726563, 0x24706963].includes(row.source?.kind_id))) return fail("UnsupportedHwp5MixedRootKind");
  const text = projectHwp5DrawingText(content);
  if (text.state !== "projected") return text;
  const geometry = projectHwp5RectangleGeometry({ ...content, hwp5Drawings: roots.filter(row => row.source.kind_id === 0x24726563) });
  if (geometry.state !== "projected") return geometry;
  const pictures = projectHwp5PictureGeometry(content);
  if (pictures.state !== "projected") return pictures;
  const projected = [];
  for (const root of roots.filter(row => row.source.kind_id === 0x24706963)) {
    const matches = pictures.pictures.filter(row => row.section === root.section && row.pictureNode === root.componentNode);
    const bindings = text.bindings.filter(row => row.section === root.section && row.drawingNode === root.componentNode);
    const captions = bindings.filter(row => row.kind === "caption");
    if (matches.length !== 1 || bindings.some(row => row.kind !== "caption") || captions.length > 1) return fail("AmbiguousHwp5MixedPictureOwnership");
    if (hwp5ObjectFlags(root.source.flags).has_caption !== (captions.length === 1)) return fail("Hwp5MixedPictureCaptionMismatch");
    projected.push({ ...matches[0], caption: captions[0]?.caption ?? null });
  }
  if (projected.length !== pictures.pictures.length) return fail("UnsupportedHwp5MixedPictureChildren");
  const rectangles = assembleHwp5RectangleContent(content, geometry, text);
  if (rectangles.state !== "projected") return rectangles;
  return { state: "projected", content: { ...rectangles.content, pictures: projected } };
}
