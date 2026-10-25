import { queryCurveOwner } from "./curve-owner-content.mjs";

// Explicit native curve proof, not a rectangle snapshot fallback with fabricated corners.
export function readCurveTextSource(editor, section, node, bindings, paragraphs) {
  let source;
  try {
    if (typeof editor.curveGeometry !== "function") return { state: "not-curve" };
    source = editor.curveGeometry(section, node);
  } catch (error) {
    if (["InvalidCurveGeometryNode", "HwpxCurveGeometryAbiUnavailable"].includes(error.message)) return { state: "not-curve" };
    return { state: "unavailable", error: error.message };
  }
  const fail = error => ({ state: "unavailable", error });
  if (source?.sourceOnly !== true || source.node !== node || !source.text || !Array.isArray(bindings) || !bindings.length
    || bindings.some(row => row.drawingNode !== node || (row.kind ?? "text") !== "text" || row.listNode !== source.text.list_node || row.textNode !== source.text.node))
    return fail("CurveTextSourceBindingMismatch");
  const current = queryCurveOwner(editor, section, node, source.common?.group_context?.root_anchor);
  if (current.state !== "bound") return current;
  const host = paragraphs.get(`${section}:${current.owner.paragraph - 1}`);
  if (!host || host.clipped || typeof host.text !== "string" || host.text[current.owner.anchor_unit] !== "\ufffc") return fail("CurveTextHostBindingMismatch");
  return { state: "bound", item: { section, curveNode: node, hostParagraph: current.owner.paragraph - 1,
    anchorUnit: current.owner.anchor_unit, owner: current.owner, source } };
}
