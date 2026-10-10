import { validateHwp5DrawingLineEndpoints } from "../../js/hwp5-drawing-line-endpoints.mjs";
import { validateHwp5DrawingStyleSources } from "../../js/hwp5-drawing-style-sources.mjs";
import { hwp5DrawingPaintTail } from "./hwp5-drawing-paint-tail.mjs";
import { hwp5DrawingGeometry } from "./hwp5-drawing-geometry.mjs";

// 원본 좌표 해석은 native에 유지하고 현재 표시 앵커와 공통 선 모델만 조립합니다.
export function attachHwp5Lines(editor, content) {
  content.lines = [];
  content.lineErrors = [];
  if (!editor) return content;
  for (const section of new Set((content.hwp5Drawings ?? []).filter(row => row.source.kind_id === 0x246c696e).map(row => row.section))) {
    try {
      if (content.hwp5DrawingErrors?.some(row => row.section === section) || content.hwp5DrawingStyleErrors?.some(row => row.section === section)) throw new Error("IncompleteHwp5LineSources");
      if (typeof editor.drawingLineEndpoints !== "function") throw new Error("Hwp5DrawingLineEndpointsAbiUnavailable");
      const endpoints = validateHwp5DrawingLineEndpoints(editor.drawingLineEndpoints(section));
      const prepared = [];
      const roots = content.hwp5Drawings.filter(row => row.section === section && row.source.kind_id === 0x246c696e);
      for (const root of roots) {
        if (root.source.component_node !== root.componentNode || root.source.control_node !== root.controlNode) throw new Error("Hwp5LineOwnerMismatch");
        const matches = endpoints.filter(row => row.component_node === root.componentNode && row.owner_node === root.controlNode);
        const styles = (content.hwp5DrawingStyles ?? []).filter(row => row.section === section && row.component_node === root.componentNode && row.owner_node === root.controlNode);
        if (matches.length !== 1 || styles.length !== 1) throw new Error("MissingHwp5LineSource");
        const endpoint = matches[0], style = styles[0];
        validateHwp5DrawingStyleSources([style]);
        const tail = hwp5DrawingPaintTail(style), attributes = style.border.attributes.raw;
        if (endpoint.attributes !== 0 || endpoint.extra_nonzero || ![0, 2].includes(endpoint.extra_bytes) || root.source.component_attributes !== 0
          || ![0x05010001, 0x05010100].includes(style.fileVersion) || style.tailLayout !== "alpha_shadow_metadata" || style.borderLayout !== "observed13"
          || tail.state !== "selected" || style.fill_flags !== 0 || style.additional_bytes !== 0
          || style.metadata?.shadow_alpha !== 0 || (attributes & 63) !== 1 || (attributes >>> 6 & 15) !== 1
          || (attributes >>> 10 & 63) !== 0 || (attributes >>> 16 & 63) !== 0 || style.border.outline !== 0
          || style.border.width <= 0 || style.border.color > 0xffffff) throw new Error("UnsupportedHwp5LinePaint");
        const source = hwp5DrawingGeometry(root.source), g = source.geometry;
        if (source.has_caption) throw new Error("UnsupportedHwp5LineCaption");
        const paragraph = content.paragraphs.filter(row => row.section === section && row.paragraph === root.hostParagraph);
        if (paragraph.length !== 1 || paragraph[0].clipped || paragraph[0].text[root.anchorUnit] !== "\ufffc") throw new Error("MissingHwp5LineAnchor");
        prepared.push({ section, lineNode: endpoint.line_node, anchorNode: root.componentNode, paragraph: root.hostParagraph,
          anchorUnit: root.anchorUnit, state: "located", error: null, placementError: null,
          endpoints: endpoint.points.map(point => [...point]), rawSource: endpoint,
          stroke: { color: style.border.color, width: style.border.width, style: attributes & 63 },
          placement: { geometry: { width: g.width, height: g.height, widthRelative: g.width_relative, heightRelative: g.height_relative,
            treatAsCharacter: g.treat_as_character, horizontalOffset: g.horizontal_offset, verticalOffset: g.vertical_offset },
            position: source.position, flow: { textWrap: source.text_wrap, zOrder: source.z_order } } });
      }
      if (new Set(roots.map(row => row.componentNode)).size !== roots.length) throw new Error("AmbiguousHwp5LineSource");
      content.lines.push(...prepared);
    } catch (error) { content.lineErrors.push({ section, error: error.message }); }
  }
  return content;
}
