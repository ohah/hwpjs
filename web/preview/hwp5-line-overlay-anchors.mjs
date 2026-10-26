import { hwp5DrawingGeometry } from "./hwp5-drawing-geometry.mjs";
import { sourceDisplayPosition } from "./text-offsets.mjs";

// Source-proven nonreserving lines remain protected anchors even when paint is
// unavailable. This does not interpret component transforms or invent strokes.
export function withHwp5LineOverlayAnchors(content) {
  if (
    !content ||
    [
      content.hwp5Drawings ?? [],
      content.tables ?? [],
      content.paragraphs,
      content.hwp5DrawingBodies ?? [],
      content.floatingDrawingAnchors ?? [],
    ].some(
      (rows) =>
        !Array.isArray(rows) ||
        Array.from(rows).some((row) => !row || typeof row !== "object" || Array.isArray(row)),
    )
  )
    throw new Error("InvalidHwp5TableLineSources");
  const anchors = [];
  for (const line of content.hwp5Drawings ?? []) {
    if (
      line.source?.kind_id !== 0x246c696e ||
      !(content.tables ?? []).some(
        (table) =>
          table.section === line.section &&
          table.hostParagraph === line.hostParagraph &&
          table.sourceGeometry?.geometry?.treat_as_character === true,
      )
    )
      continue;
    const source = hwp5DrawingGeometry(line.source);
    if (
      source.geometry.treat_as_character ||
      source.affect_line_spacing ||
      source.has_caption ||
      ![2, 3].includes(source.text_wrap)
    )
      throw new Error("UnsupportedHwp5TableLineAnchor");
    const owners = content.paragraphs.filter(
      (p) => p.section === line.section && p.paragraph === line.hostParagraph,
    );
    if (
      owners.length !== 1 ||
      owners[0].clipped ||
      owners[0].tableCell ||
      owners[0].drawingText ||
      owners[0].text?.[line.anchorUnit] !== "\ufffc" ||
      !Number.isSafeInteger(line.anchorUnit) ||
      line.anchorUnit < 0 ||
      line.source.component_node !== line.componentNode ||
      line.source.control_node !== line.controlNode ||
      line.anchor?.control_node !== line.controlNode ||
      line.anchor.component_node !== line.componentNode ||
      line.anchor.paragraph !== line.hostParagraph ||
      sourceDisplayPosition(
        line.anchor.current_unit,
        owners[0].sourceOffsets,
        owners[0].text.length,
      ) !== line.anchorUnit ||
      sourceDisplayPosition(
        line.anchor.current_unit + 8,
        owners[0].sourceOffsets,
        owners[0].text.length,
      ) !==
        line.anchorUnit + 1 ||
      (content.hwp5DrawingBodies ?? []).some(
        (body) => body.section === line.section && body.controlNode === line.controlNode,
      )
    )
      throw new Error("InvalidHwp5TableLineOwner");
    anchors.push({
      section: line.section,
      paragraph: line.hostParagraph,
      anchorUnit: line.anchorUnit,
      node: line.componentNode,
    });
  }
  if (!anchors.length) return content;
  const combined = [...(content.floatingDrawingAnchors ?? []), ...anchors],
    sites = new Set(),
    nodes = new Set();
  for (const anchor of combined) {
    const site = `${anchor.section}:${anchor.paragraph}:${anchor.anchorUnit}`,
      node = `${anchor.section}:${anchor.node}`;
    if (sites.has(site) || nodes.has(node)) throw new Error("AmbiguousHwp5TableLineAnchor");
    sites.add(site);
    nodes.add(node);
  }
  return { ...content, floatingDrawingAnchors: combined };
}
