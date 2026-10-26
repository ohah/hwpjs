import { connectorReferencePath } from "./connector-reference-path.mjs";
import { decoratedLinePlan } from "./decorated-line-plan.mjs";
export function connectorReferenceContent(editor, section, node, source, stroke, owner) {
  try {
    for (const point of [source.geometry.start, source.geometry.end]) {
      if (!point || point.subject_id_ref !== "0") throw new Error("UnresolvedConnectorSubject");
    }
    if (!stroke) throw new Error("ConnectorStrokeUnavailable");
    const head = stroke.attributes?.headStyle,
      tail = stroke.attributes?.tailStyle;
    const type = source.geometry.raw_type;
    if (
      (type === "STRAIGHT_NOARROW" && (head !== "NORMAL" || tail !== "NORMAL")) ||
      (type === "STRAIGHT_ONEWAY" && (head !== "NORMAL" || tail !== "ARROW")) ||
      (type === "STRAIGHT_BOTH" && (head !== "ARROW" || tail !== "ARROW"))
    )
      throw new Error("ConnectorArrowTypeMismatch");
    if (typeof editor.connectorRenderingSource !== "function")
      throw new Error("HwpxConnectorRenderingSourceAbiUnavailable");
    if (typeof editor.connectorPlacementSource !== "function")
      throw new Error("HwpxConnectorPlacementSourceAbiUnavailable");
    const path = connectorReferencePath(source, editor.connectorRenderingSource(section, node));
    if (path.state !== "planned") throw new Error(path.error);
    const plan = decoratedLinePlan({ node, endpoints: path.endpoints }, stroke);
    if (plan.state !== "planned") throw new Error(plan.error);
    const placement = editor.connectorPlacementSource(section, node);
    return {
      line: {
        section,
        lineNode: node,
        connectorNode: node,
        paragraph: owner.paragraph - 1,
        anchorNode: owner.anchor_node,
        anchorUnit: owner.anchor_unit,
        endpoints: path.endpoints,
        placement,
        referencePlan: plan,
        state: "reference_located",
        error: null,
      },
      error: null,
    };
  } catch (error) {
    return { line: null, error: error.message };
  }
}
