/** Native container sources only; no coordinate inheritance or page placement. */
export function attachGroupedShapeSources(editor, content) {
  content.containers = [];
  content.containerSourceErrors = [];
  content.groupRectangles = [];
  content.groupRectangleErrors = [];
  const visited = new Set();
  const pending = [];
  for (const drawing of [...(content.drawings ?? []), ...(content.rectangles ?? [])]) {
    const group = drawing.source?.group_context;
    if (group) pending.push({ section: drawing.section, node: group.parent_container });
  }
  for (const picture of content.pictures ?? []) {
    if (picture.owner && picture.owner.anchorNode !== picture.pictureNode) pending.push({ section: picture.section, node: picture.owner.anchorNode });
  }
  while (pending.length) {
    const { section, node } = pending.pop();
    const key = `${section}:${node}`;
    if (visited.has(key)) continue;
    visited.add(key);
    try {
      if (typeof editor.containerSourceSnapshot !== "function") throw new Error("HwpxContainerSourceAbiUnavailable");
      const source = editor.containerSourceSnapshot(section, node);
      if (source.container_node !== node) throw new Error("ContainerSourceBindingMismatch");
      content.containers.push({ section, containerNode: node, source });
      if (source.group_context) pending.push({ section, node: source.group_context.parent_container });
      for (const child of source.children) {
        if (child.namespace_uri !== "http://www.hancom.co.kr/hwpml/2011/paragraph") continue;
        if (child.local_name === "container") pending.push({ section, node: child.node });
        if (child.local_name !== "rect") continue;
        try {
          const current = content.rectangles?.find(r => r.section === section && r.drawingNode === child.node);
          const rendering = current ? { rectangle_node: current.drawingNode, source: current.source } : editor.rectangleRenderingSource(section, child.node);
          if (rendering.rectangle_node !== child.node) throw new Error("GroupRectangleBindingMismatch");
          content.groupRectangles.push({ section, rectangleNode: child.node, parentContainer: node, source: rendering.source });
        } catch (error) { content.groupRectangleErrors.push({ section, rectangleNode: child.node, error: error.message }); }
      }
    } catch (error) { content.containerSourceErrors.push({ section, containerNode: node, error: error.message }); }
  }
  content.containers.sort((a, b) => a.section - b.section || a.containerNode - b.containerNode);
  return content;
}
