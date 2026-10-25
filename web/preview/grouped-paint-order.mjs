import { groupedPaintLayer } from "./grouped-paint-layer.mjs";
// 원본 전위 노드 번호는 컨테이너 자식 순서를 보존합니다.
export function groupedPaintOrder(content, layout, rectangles, pictures) {
  const entries = [];
  const rootFor = (section, node) => content.containers?.find(c => c.section === section && c.containerNode === node)?.source;
  const add = (kind, item, section, node, rootNode) => {
    const root = rootFor(section, rootNode);
    if (!root || groupedPaintLayer(root) !== "front") return;
    entries.push({ kind, item, section, node, rootNode, zOrder: root.flow.z_order });
  };
  for (const item of rectangles.front) if (item.drawing.source.group_context) add("rectangle", item, item.drawing.section, item.drawing.drawingNode, item.drawing.source.group_context.root_anchor);
  for (const item of pictures.front) if (item.picture.owner?.anchorNode !== undefined && item.picture.owner.anchorNode !== item.picture.pictureNode) add("picture", item, item.picture.section, item.picture.pictureNode, item.picture.owner.anchorNode);
  for (const item of layout.placedDrawings ?? []) {
    const drawing = content.drawings?.find(d => d.section === item.section && d.drawingNode === item.drawingNode);
    if (drawing?.source.group_context) add("text", item, item.section, item.drawingNode, drawing.source.group_context.root_anchor);
  }
  for (const item of layout.placedCurves ?? []) {
    const sources = content.groupCurves?.filter(c => c.section === item.section && c.curveNode === item.curveNode) ?? [];
    if (sources.length === 1 && item.layer === "front" && item.paintPlan?.state === "planned"
      && sources[0].source?.common?.group_context?.root_anchor === item.rootNode)
      add("curve", item, item.section, item.curveNode, item.rootNode);
  }
  return entries.sort((a, b) => a.zOrder - b.zOrder || a.section - b.section || a.rootNode - b.rootNode || a.node - b.node);
}
