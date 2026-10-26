import { validateHwp5DrawingRectangleCorners } from "../../js/hwp5-drawing-rectangle-corners.mjs";

export function attachHwp5DrawingCorners(editor, content) {
  content.hwp5DrawingCorners = [];
  content.hwp5DrawingCornerErrors = [];
  if (!editor) return content;
  for (const section of new Set((content.hwp5Drawings ?? []).map((row) => row.section))) {
    try {
      if (content.hwp5DrawingLocalErrors?.some((row) => row.section === section))
        throw new Error("IncompleteHwp5DrawingTransforms");
      const corners = validateHwp5DrawingRectangleCorners(editor.drawingRectangleCorners(section));
      const locals = (content.hwp5DrawingLocalTransforms ?? []).filter(
        (row) => row.section === section,
      );
      const nodes = new Set(locals.map((row) => row.component_node));
      if (nodes.size !== locals.length) throw new Error("AmbiguousHwp5DrawingCornerTransform");
      if (corners.some((row) => !nodes.has(row.component_node)))
        throw new Error("MissingHwp5DrawingCornerTransform");
      for (const drawing of content.hwp5Drawings.filter(
        (row) => row.section === section && row.source.kind_id === 0x24726563,
      )) {
        if (!corners.some((row) => row.component_node === drawing.componentNode))
          throw new Error("MissingHwp5RectangleCorners");
      }
      content.hwp5DrawingCorners.push(...corners.map((row) => ({ ...row, section })));
    } catch (error) {
      content.hwp5DrawingCornerErrors.push({ section, error: error.message });
    }
  }
  return content;
}
