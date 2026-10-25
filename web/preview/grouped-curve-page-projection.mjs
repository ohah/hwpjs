import { curveRenderingGeometry, translateCurveGeometry } from "./curve-rendering-geometry.mjs";
import { validGroupContext } from "../../js/hwpx-group-context.mjs";
import { drawingPageReference } from "./drawing-page-reference.mjs";
import { placeGroupedRoot } from "./grouped-root-placement.mjs";
import { groupedPaintLayer } from "./grouped-paint-layer.mjs";
import { signedInt32 } from "./signed-int32.mjs";

// Bind one native curve child to one current root owner and physical anchor row.
export function projectGroupedCurve(item, containers, paragraphs, rows) {
  const fail = error => ({ state: "unavailable", error });
  const source = item?.source, group = source?.common?.group_context;
  if (item?.ownerError) return { ...fail("IncompleteGroupedCurveOwner"), sourceError: item.ownerError };
  if (!Number.isSafeInteger(item?.section) || item.section < 0 || item.curveNode !== source?.node || source?.sourceOnly !== true
    || !group || !validGroupContext(group, source.node) || item.parentContainer !== group.parent_container || !Array.isArray(containers)) return fail("InvalidGroupedCurveSource");
  const index = new Map();
  for (const container of containers) {
    if (container?.section !== item.section) continue;
    if (index.has(container.containerNode)) return fail("AmbiguousGroupedCurveRoot");
    index.set(container.containerNode, container);
  }
  const root = index.get(group.root_anchor);
  if (!root || root.source?.container_node !== group.root_anchor || root.source.group_context !== null
    || group.depth > index.size) return fail("AmbiguousGroupedCurveRoot");
  let parent = group.parent_container, child = source.node, kind = "curve";
  for (let depth = group.depth - 1; depth >= 0; depth--) {
    const row = index.get(parent), context = row?.source?.group_context, children = row?.source?.children;
    if (!row || row.source?.container_node !== parent || (depth === 0 ? parent !== root.containerNode || context !== null
      : !validGroupContext(context, parent) || context?.root_anchor !== group.root_anchor || context?.depth !== depth)) return fail("GroupedCurveAncestryMismatch");
    if (!Array.isArray(children) || children.filter(c => c?.node === child && c.local_name === kind
      && c.namespace_uri === "http://www.hancom.co.kr/hwpml/2011/paragraph").length !== 1) return fail("GroupedCurveChildMismatch");
    child = parent; kind = "container"; parent = context?.parent_container;
  }
  const zOrder = signedInt32(root.source.flow?.z_order), childOrder = signedInt32(source.common.flow?.z_order);
  if (item.owner && (item.owner.anchor_node !== root.containerNode || item.owner.paragraph !== root.hostParagraph + 1
    || item.owner.anchor_unit !== root.anchorUnit)) return fail("CurveOwnerBindingMismatch");
  if (zOrder === null || childOrder === null || !Number.isSafeInteger(root.hostParagraph) || root.hostParagraph < 0
    || !Number.isSafeInteger(root.anchorUnit) || root.anchorUnit < 0) return fail("MissingGroupedCurveOwner");
  const selected = drawingPageReference({ section: item.section, hostParagraph: root.hostParagraph, anchorUnit: root.anchorUnit, source: root.source }, paragraphs, rows);
  if (selected.state !== "selected") return selected;
  const layer = groupedPaintLayer(root.source, selected.host.reservedGroupRoot === root.containerNode);
  if (!layer) return fail("UnsupportedGroupedCurvePagePolicy");
  const local = curveRenderingGeometry(source);
  if (local.state !== "resolved") return local;
  const placed = placeGroupedRoot(root.source, selected.boxes, selected.host,
    { section: item.section, paragraph: root.hostParagraph, unit: root.anchorUnit });
  if (placed.state !== "placed") return placed;
  const geometry = translateCurveGeometry(local, [placed.rectangle.x, placed.rectangle.y]);
  if (geometry.state !== "placed") return geometry;
  return { ...geometry, section: item.section, curveNode: item.curveNode, rootNode: root.containerNode,
    hostParagraph: root.hostParagraph, anchorUnit: root.anchorUnit, pageOrdinal: selected.host.pageOrdinal,
    rootRectangle: placed.rectangle, referenceBoxes: selected.boxes, zOrder, childOrder, layer };
}
