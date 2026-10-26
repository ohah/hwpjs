import { validateHwp5DrawingLineEndpoints } from "../../js/hwp5-drawing-line-endpoints.mjs";
import { validateHwp5DrawingStyleSources } from "../../js/hwp5-drawing-style-sources.mjs";
import { hwp5DrawingPaintTail } from "./hwp5-drawing-paint-tail.mjs";
import { hwp5DrawingGeometry } from "./hwp5-drawing-geometry.mjs";
import { strokeDashPattern } from "./stroke-dash-pattern.mjs";
import { hwp5StrokeDisplay } from "./hwp5-stroke-display.mjs";

// 원본 좌표 해석은 native에 유지하고 현재 표시 앵커와 공통 선 모델만 조립합니다.
export function attachHwp5Lines(editor, content) {
  content.lines = [];
  content.lineErrors = [];
  if (!editor) return content;
  const groupBindings =
    content.hwp5GroupGeometry?.state === "projected"
      ? (content.hwp5GroupGeometry.lineBindings ?? [])
      : [];
  for (const section of new Set([
    ...(content.hwp5Drawings ?? [])
      .filter((row) => row.source.kind_id === 0x246c696e)
      .map((row) => row.section),
    ...groupBindings.map((row) => row.section),
  ])) {
    try {
      if (
        content.hwp5DrawingErrors?.some((row) => row.section === section) ||
        content.hwp5DrawingStyleErrors?.some((row) => row.section === section)
      )
        throw new Error("IncompleteHwp5LineSources");
      if (typeof editor.drawingLineEndpoints !== "function")
        throw new Error("Hwp5DrawingLineEndpointsAbiUnavailable");
      const endpoints = validateHwp5DrawingLineEndpoints(editor.drawingLineEndpoints(section));
      const prepared = [];
      const roots = content.hwp5Drawings
        .filter((row) => row.section === section && row.source.kind_id === 0x246c696e)
        .map((root) => ({ root, group: null }));
      for (const group of groupBindings.filter((row) => row.section === section)) {
        if (
          group.component?.component_node !== group.lineNode ||
          group.component.owner_node !== group.parentContainer ||
          group.component.kind_id !== 0x246c696e ||
          group.component.second_id !== null
        )
          throw new Error("Hwp5GroupedLineBindingMismatch");
        const anchors = content.hwp5Drawings.filter(
          (row) =>
            row.section === section &&
            row.componentNode === group.rootAnchor &&
            row.source.kind_id === 0x24636f6e,
        );
        if (
          anchors.length !== 1 ||
          group.parentContainer !== group.rootAnchor ||
          group.hostParagraph !== anchors[0].hostParagraph ||
          group.anchorUnit !== anchors[0].anchorUnit
        )
          throw new Error("UnsupportedHwp5GroupedLineOwner");
        roots.push({ root: anchors[0], group });
      }
      for (const { root, group } of roots) {
        if (
          root.source.component_node !== root.componentNode ||
          root.source.control_node !== root.controlNode
        )
          throw new Error("Hwp5LineOwnerMismatch");
        const componentNode = group?.lineNode ?? root.componentNode,
          ownerNode = group?.parentContainer ?? root.controlNode;
        const matches = endpoints.filter(
          (row) => row.component_node === componentNode && row.owner_node === ownerNode,
        );
        const styles = (content.hwp5DrawingStyles ?? []).filter(
          (row) =>
            row.section === section &&
            row.component_node === componentNode &&
            row.owner_node === ownerNode,
        );
        if (matches.length !== 1 || styles.length !== 1) throw new Error("MissingHwp5LineSource");
        const endpoint = matches[0],
          style = styles[0];
        validateHwp5DrawingStyleSources([style]);
        const tail = hwp5DrawingPaintTail(style),
          attributes = style.border.attributes.raw,
          stroke = hwp5StrokeDisplay(style.border);
        if (
          endpoint.attributes !== 0 ||
          endpoint.extra_nonzero ||
          ![0, 2].includes(endpoint.extra_bytes) ||
          (group
            ? group.component.attributes !== 0 || group.component.rotation_angle !== 0
            : root.source.component_attributes !== 0) ||
          ![0x05000300, 0x05010001, 0x05010100].includes(style.fileVersion) ||
          style.tailLayout !== "alpha_shadow_metadata" ||
          style.borderLayout !== "observed13" ||
          tail.state !== "selected" ||
          style.fill_flags !== 0 ||
          style.additional_bytes !== 0 ||
          style.metadata?.shadow_alpha !== 0 ||
          !stroke ||
          !strokeDashPattern(stroke.style) ||
          ((attributes >>> 6) & 15) !== 1 ||
          ((attributes >>> 10) & 63) !== 0 ||
          ((attributes >>> 16) & 63) !== 0 ||
          style.border.outline !== 0
        )
          throw new Error("UnsupportedHwp5LinePaint");
        const source = hwp5DrawingGeometry(root.source),
          g = source.geometry;
        if (source.has_caption) throw new Error("UnsupportedHwp5LineCaption");
        const paragraph = content.paragraphs.filter(
          (row) => row.section === section && row.paragraph === root.hostParagraph,
        );
        if (
          paragraph.length !== 1 ||
          paragraph[0].clipped ||
          paragraph[0].text[root.anchorUnit] !== "\ufffc"
        )
          throw new Error("MissingHwp5LineAnchor");
        prepared.push({
          section,
          lineNode: endpoint.line_node,
          anchorNode: componentNode,
          paragraph: root.hostParagraph,
          ...(group
            ? {
                groupContext: {
                  rootAnchor: group.rootAnchor,
                  parentContainer: group.parentContainer,
                },
              }
            : {}),
          anchorUnit: root.anchorUnit,
          state: "located",
          error: null,
          placementError: null,
          endpoints: endpoint.points.map((point) => [...point]),
          rawSource: endpoint,
          stroke,
          placement: {
            geometry: {
              width: g.width,
              height: g.height,
              widthRelative: g.width_relative,
              heightRelative: g.height_relative,
              treatAsCharacter: g.treat_as_character,
              horizontalOffset: g.horizontal_offset,
              verticalOffset: g.vertical_offset,
            },
            position: source.position,
            flow: {
              textWrap: source.text_wrap,
              zOrder: source.z_order,
              outsideMargins: [...source.out_margin],
            },
          },
        });
      }
      if (new Set(prepared.map((row) => row.anchorNode)).size !== roots.length)
        throw new Error("AmbiguousHwp5LineSource");
      content.lines.push(...prepared);
    } catch (error) {
      content.lineErrors.push({ section, error: error.message });
    }
  }
  return content;
}
