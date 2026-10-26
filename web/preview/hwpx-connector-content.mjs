/** Logical current ownership + immutable geometry; not renderable endpoints. */
import { drawingStrokeSourceContent } from "./drawing-stroke-source-content.mjs";
import { connectorReferenceContent } from "./connector-reference-content.mjs";
export function attachHwpxConnectors(editor, content) {
  content.connectors = [];
  content.connectorErrors = [];
  const visible = content.window
    ? new Set(content.paragraphs.map((row) => `${row.section}:${row.paragraph}`))
    : null;
  for (const section of new Set(content.paragraphs.map((row) => row.section))) {
    let nodes;
    try {
      if (typeof editor.connectorNodes !== "function")
        throw new Error("HwpxConnectorSourceAbiUnavailable");
      nodes = editor.connectorNodes(section);
    } catch (error) {
      content.connectorErrors.push({ section, error: error.message });
      continue;
    }
    for (const node of nodes) {
      try {
        if (typeof editor.connectorOwner !== "function")
          throw new Error("HwpxConnectorOwnerAbiUnavailable");
        const owner = editor.connectorOwner(section, node);
        if (
          owner.current !== true ||
          owner.node !== node ||
          !Number.isInteger(owner.paragraph) ||
          owner.paragraph < 1
        )
          throw new Error("ConnectorOwnerBindingMismatch");
        const paragraph = owner.paragraph - 1;
        if (visible && !visible.has(`${section}:${paragraph}`)) continue;
        if (typeof editor.connectorGeometrySource !== "function")
          throw new Error("HwpxConnectorSourceAbiUnavailable");
        const source = editor.connectorGeometrySource(section, node);
        if (source.sourceOnly !== true || source.node !== node)
          throw new Error("ConnectorSourceBindingMismatch");
        const rawStroke = drawingStrokeSourceContent(editor, section, node);
        const stroke = rawStroke.source,
          strokeError = rawStroke.error;
        const reference = connectorReferenceContent(editor, section, node, source, stroke, owner);
        content.connectors.push({
          section,
          node,
          paragraph,
          anchorNode: owner.anchor_node,
          anchorUnit: owner.anchor_unit,
          geometry: source.geometry,
          stroke,
          strokeError,
          referenceLine: reference.line,
          referenceError: reference.error,
          state: "source_only",
          renderable: false,
          error: null,
        });
      } catch (error) {
        content.connectors.push({
          section,
          node,
          paragraph: null,
          anchorNode: null,
          anchorUnit: null,
          geometry: null,
          stroke: null,
          strokeError: null,
          state: "unavailable",
          renderable: false,
          error: error.message,
        });
      }
    }
  }
  return content;
}
