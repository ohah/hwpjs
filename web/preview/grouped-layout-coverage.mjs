import { groupShapeChildren } from "./group-shape-children.mjs";
import { validCurveCommands } from "./curve-rendering-geometry.mjs";
import { pageParagraphCoverage } from "./page-paragraph-coverage.mjs";

// 배치 후보의 구조적 완전성입니다. 비트맵 디코딩이나 픽셀 동치를 뜻하지 않습니다.
export function groupedLayoutCoverage(content, layout, rectangles, pictures, lines = { behind: [], front: [] }) {
  const counts = new Map();
  const key = (section, node) => `${section}:${node}`;
  const containers = new Map();
  for (const container of content.containers ?? []) {
    const id = key(container.section, container.containerNode);
    const matches = containers.get(id) ?? [];
    matches.push(container);
    containers.set(id, matches);
  }
  const add = (section, node) => counts.set(key(section, node), (counts.get(key(section, node)) ?? 0) + 1);
  for (const item of [...rectangles.behind, ...rectangles.front]) add(item.drawing.section, item.drawing.drawingNode);
  for (const item of [...pictures.behind, ...pictures.front]) add(item.picture.section, item.picture.pictureNode);
  for (const item of [...lines.behind, ...lines.front]) if (item.line.groupContext) add(item.line.section, item.line.anchorNode);
  for (const item of layout.placedDrawings ?? []) add(item.section, item.drawingNode);
  for (const item of layout.placedEllipses ?? []) {
    const sources = (content.ellipses ?? []).filter(e => e.section === item.section && e.source?.node === item.node);
    if (sources.length === 1 && sources[0].source.common?.group_context && item.paintPlan?.state === "planned") add(item.section, item.node);
  }
  for (const item of layout.placedCurves ?? []) {
    const sources = (content.groupCurves ?? []).filter(c => c.section === item.section && c.curveNode === item.curveNode);
    if (sources.length === 1 && sources[0].source?.common?.group_context?.root_anchor === item.rootNode
      && item.state === "placed" && item.paintPlan?.state === "planned" && validCurveCommands(item.commands)) add(item.section, item.curveNode);
  }
  return (content.containers ?? []).filter(c => c.source.group_context === null).map(root => {
    const errors = [], expected = [], expectedNodes = new Set(), visited = new Set(), pending = [root];
    if (containers.get(key(root.section, root.containerNode)).length !== 1) errors.push({ node: root.containerNode, error: "DuplicateGroupRoot" });
    while (pending.length) {
      const current = pending.pop();
      if (visited.has(current.containerNode)) { errors.push({ node: current.containerNode, error: "RepeatedGroupContainer" }); continue; }
      visited.add(current.containerNode);
      let children;
      try { children = groupShapeChildren(current.source, { allowCaptions: true }); }
      catch (error) { errors.push({ node: current.containerNode, error: error.message }); continue; }
      for (const child of children) {
        if (child.kind === "metadata") continue;
        if (child.kind === "caption") {
          const caption = current.source.caption;
          const paragraphs = (content.paragraphs ?? []).filter(p => p.section === root.section && p.drawingCaption?.drawingNode === current.containerNode);
          const rows = (layout.rows ?? []).filter(row => row.section === root.section && row.drawingNode === current.containerNode && row.captionNode === child.node && row.listNode === caption.list_node);
          const placements = (layout.placedContainers ?? []).filter(p => p.section === root.section && p.containerNode === root.containerNode);
          if (!paragraphs.length || paragraphs.some(p => p.drawingCaption.captionNode !== child.node || p.drawingCaption.listNode !== caption.list_node)
            || placements.length !== 1 || rows.some(row => row.pageOrdinal !== placements[0].pageOrdinal)
            || pageParagraphCoverage(paragraphs, rows).state !== "complete") errors.push({ node: child.node, error: "UnplacedGroupCaption" });
          continue;
        }
        if (child.kind === "unsupported") { errors.push({ node: child.node, error: "UnsupportedGroupChild" }); continue; }
        if (child.kind === "container") {
          const matches = containers.get(key(root.section, child.node)) ?? [];
          if (matches.length !== 1 || matches[0].source.group_context?.parent_container !== current.containerNode || matches[0].source.group_context?.root_anchor !== root.containerNode) errors.push({ node: child.node, error: "MissingGroupContainerBinding" });
          else pending.push(matches[0]);
        } else if (expectedNodes.has(child.node)) errors.push({ node: child.node, error: "RepeatedGroupChild" });
        else { expectedNodes.add(child.node); expected.push(child.node); }
      }
    }
    for (const node of expected) {
      const count = counts.get(key(root.section, node)) ?? 0;
      if (count !== 1) errors.push({ node, error: count === 0 ? "UnplacedGroupChild" : "DuplicateGroupChildPlacement" });
    }
    return { section: root.section, rootNode: root.containerNode, expected: expected.length, eligible: expected.filter(n => counts.get(key(root.section, n)) === 1).length, complete: errors.length === 0 && expected.length > 0, errors };
  });
}
