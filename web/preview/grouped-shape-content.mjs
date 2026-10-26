import { queryCurveOwner } from "./curve-owner-content.mjs";
/** Native container sources only; no coordinate inheritance or page placement. */
export function attachGroupedShapeSources(editor, content) {
  content.containers = [];
  content.containerSourceErrors = [];
  content.groupRectangles = [];
  content.groupRectangleErrors = [];
  content.groupCurves = [];
  content.groupCurveErrors = [];
  content.groupCurveOwnerErrors = [];
  const visited = new Set();
  const owners = new Map();
  const addOwner = (section, node, paragraph, unit) => {
    if (![section, node, paragraph, unit].every((n) => Number.isSafeInteger(n) && n >= 0)) return;
    const key = `${section}:${node}`,
      old = owners.get(key);
    if (old === null || (old && (old.paragraph !== paragraph || old.unit !== unit)))
      owners.set(key, null);
    else owners.set(key, { paragraph, unit });
  };
  // Request-local only: never retain sources across edits/history.
  const rectangleBatches = new Map();
  const currentRectangles = new Map(
    (content.rectangles ?? []).map((r) => [`${r.section}:${r.drawingNode}`, r]),
  );
  const rectangleSource = (section, node) => {
    const current = currentRectangles.get(`${section}:${node}`);
    if (current) return { rectangle_node: current.drawingNode, source: current.source };
    if (!rectangleBatches.has(section)) {
      let batch = null;
      if (typeof editor.rectangleRenderingSources === "function") {
        try {
          batch = new Map(
            editor.rectangleRenderingSources(section).map((row) => [row.rectangle_node, row]),
          );
        } catch {
          /* Preserve existing single-node diagnostics on batch refusal. */
        }
      }
      rectangleBatches.set(section, batch);
    }
    return (
      rectangleBatches.get(section)?.get(node) ?? editor.rectangleRenderingSource(section, node)
    );
  };
  const pending = [];
  const currentCurves = new Map(
    (content.curveTextSources ?? []).map((item) => [`${item.section}:${item.curveNode}`, item]),
  );
  for (const item of currentCurves.values()) {
    const group = item.source?.common?.group_context;
    if (group && item.owner?.anchor_node === group.root_anchor) {
      pending.push({ section: item.section, node: group.parent_container });
      addOwner(item.section, group.root_anchor, item.owner.paragraph - 1, item.owner.anchor_unit);
    }
  }
  for (const ellipse of content.ellipses ?? []) {
    const group = ellipse.source?.common?.group_context;
    if (group) {
      pending.push({ section: ellipse.section, node: group.parent_container });
      const owner = ellipse.source.owner;
      if (owner && owner.anchor_node === group.root_anchor)
        addOwner(ellipse.section, group.root_anchor, owner.paragraph - 1, owner.anchor_unit);
    }
  }
  for (const drawing of [...(content.drawings ?? []), ...(content.rectangles ?? [])]) {
    const group = drawing.source?.group_context;
    if (group) {
      pending.push({ section: drawing.section, node: group.parent_container });
      addOwner(drawing.section, group.root_anchor, drawing.hostParagraph, drawing.anchorUnit);
    }
  }
  for (const picture of content.pictures ?? []) {
    if (picture.owner && picture.owner.anchorNode !== picture.pictureNode) {
      pending.push({ section: picture.section, node: picture.owner.anchorNode });
      addOwner(
        picture.section,
        picture.owner.anchorNode,
        picture.owner.paragraph,
        picture.owner.anchorUnit,
      );
    }
  }
  while (pending.length) {
    const { section, node } = pending.pop();
    const key = `${section}:${node}`;
    if (visited.has(key)) continue;
    visited.add(key);
    try {
      if (typeof editor.containerSourceSnapshot !== "function")
        throw new Error("HwpxContainerSourceAbiUnavailable");
      const source = editor.containerSourceSnapshot(section, node);
      if (source.container_node !== node) throw new Error("ContainerSourceBindingMismatch");
      const ownerKey = `${section}:${source.group_context?.root_anchor ?? node}`;
      if (owners.has(ownerKey) && owners.get(ownerKey) === null)
        throw new Error("ConflictingGroupOwner");
      const owner = owners.get(ownerKey);
      content.containers.push({
        section,
        containerNode: node,
        source,
        ...(owner ? { hostParagraph: owner.paragraph, anchorUnit: owner.unit } : {}),
      });
      if (source.group_context)
        pending.push({ section, node: source.group_context.parent_container });
      for (const child of source.children) {
        if (child.namespace_uri !== "http://www.hancom.co.kr/hwpml/2011/paragraph") continue;
        if (child.local_name === "container") pending.push({ section, node: child.node });
        if (child.local_name === "curve") {
          try {
            if (typeof editor.curveGeometry !== "function")
              throw new Error("HwpxCurveGeometryAbiUnavailable");
            const current = currentCurves.get(`${section}:${child.node}`);
            const geometry = current?.source ?? editor.curveGeometry(section, child.node);
            if (
              geometry.node !== child.node ||
              geometry.sourceOnly !== true ||
              (geometry.common && geometry.common.group_context?.parent_container !== node)
            )
              throw new Error("GroupCurveBindingMismatch");
            const binding = current
              ? { state: "bound", owner: current.owner }
              : queryCurveOwner(
                  editor,
                  section,
                  child.node,
                  geometry.common?.group_context?.root_anchor,
                );
            const rootKey = `${section}:${geometry.common?.group_context?.root_anchor}`,
              known = owners.get(rootKey);
            if (
              binding.state === "bound" &&
              (known === null ||
                (known &&
                  (known.paragraph !== binding.owner.paragraph - 1 ||
                    known.unit !== binding.owner.anchor_unit)))
            ) {
              binding.state = "unavailable";
              binding.error = "CurveOwnerBindingMismatch";
            }
            if (binding.state === "bound")
              addOwner(
                section,
                binding.owner.anchor_node,
                binding.owner.paragraph - 1,
                binding.owner.anchor_unit,
              );
            else
              content.groupCurveOwnerErrors.push({
                section,
                curveNode: child.node,
                error: binding.error,
              });
            content.groupCurves.push({
              section,
              curveNode: child.node,
              parentContainer: node,
              source: geometry,
              ...(binding.state === "bound"
                ? {
                    owner: binding.owner,
                    hostParagraph: binding.owner.paragraph - 1,
                    anchorUnit: binding.owner.anchor_unit,
                  }
                : { ownerError: binding.error }),
            });
          } catch (error) {
            content.groupCurveErrors.push({ section, curveNode: child.node, error: error.message });
          }
        }
        if (child.local_name !== "rect") continue;
        try {
          const rendering = rectangleSource(section, child.node);
          if (rendering.rectangle_node !== child.node)
            throw new Error("GroupRectangleBindingMismatch");
          content.groupRectangles.push({
            section,
            rectangleNode: child.node,
            parentContainer: node,
            source: rendering.source,
          });
        } catch (error) {
          content.groupRectangleErrors.push({
            section,
            rectangleNode: child.node,
            error: error.message,
          });
        }
      }
    } catch (error) {
      content.containerSourceErrors.push({ section, containerNode: node, error: error.message });
    }
  }
  content.containers.sort((a, b) => a.section - b.section || a.containerNode - b.containerNode);
  for (const container of content.containers) {
    const owner = owners.get(
      `${container.section}:${container.source.group_context?.root_anchor ?? container.containerNode}`,
    );
    if (owner) {
      container.hostParagraph = owner.paragraph;
      container.anchorUnit = owner.unit;
    }
  }
  return content;
}
