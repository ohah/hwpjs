import { groupShapeChildren } from "./group-shape-children.mjs";
import { projectGroupedPicturePage } from "./grouped-picture-page-projection.mjs";

const key = (section, node) => `${section}:${node}`;
const boxValid = (b) =>
  b &&
  [b.x, b.y, b.width, b.height, b.x + b.width, b.y + b.height].every(Number.isFinite) &&
  b.width > 0 &&
  b.height > 0;

// A group is one obstacle, including children extending beyond its reserved frame.
export function inlineGroupCollisionFootprints(content, layout) {
  const fail = (error) => ({ state: "unavailable", error }),
    covered = new Set(),
    drawingIds = new Set(),
    pictureIds = new Set(),
    footprints = [],
    seenContainers = new Set();
  const containers = content.containers ?? [];
  try {
    const claim = (section, node) => {
      const id = key(section, node);
      if (![section, node].every((n) => Number.isSafeInteger(n) && n >= 0) || covered.has(id))
        throw Error("AmbiguousGroupCollisionIdentity");
      covered.add(id);
    };
    for (const root of containers.filter((c) => c.source?.group_context === null)) {
      if (
        root.source.container_node !== root.containerNode ||
        root.source.geometry?.treat_as_character !== true
      )
        throw Error("UnsupportedGroupCollisionPlacement");
      const placed = (layout.placedContainers ?? []).filter(
        (p) => p.section === root.section && p.containerNode === root.containerNode,
      );
      if (
        placed.length !== 1 ||
        !boxValid(placed[0].outerRectangle) ||
        !boxValid(placed[0].rectangle) ||
        !layout.pages.some((p) => p.section === root.section && p.ordinal === placed[0].pageOrdinal)
      )
        throw Error("IncompleteGroupCollisionPlacement");
      const pageOrdinal = placed[0].pageOrdinal,
        boxes = [placed[0].outerRectangle, placed[0].rectangle],
        pending = [root];
      claim(root.section, root.containerNode);
      while (pending.length) {
        const parent = pending.pop();
        if (seenContainers.has(parent)) throw Error("AmbiguousGroupCollisionIdentity");
        seenContainers.add(parent);
        for (const child of groupShapeChildren(parent.source)) {
          if (child.kind === "metadata") continue;
          claim(root.section, child.node);
          if (child.kind === "container") {
            const matches = containers.filter(
              (c) =>
                c.section === root.section &&
                c.containerNode === child.node &&
                c.source?.group_context?.root_anchor === root.containerNode,
            );
            if (matches.length !== 1) throw Error("IncompleteGroupCollisionChildren");
            pending.push(matches[0]);
            continue;
          }
          let projected;
          if (child.kind === "rectangle") {
            drawingIds.add(key(root.section, child.node));
            const sources = (content.drawings ?? []).filter(
              (d) =>
                d.section === root.section &&
                d.drawingNode === child.node &&
                d.source?.group_context?.root_anchor === root.containerNode,
            );
            const matches = (layout.placedDrawings ?? []).filter(
              (d) => d.section === root.section && d.drawingNode === child.node,
            );
            if (sources.length !== 1 || matches.length !== 1)
              throw Error("IncompleteGroupCollisionChildren");
            projected = matches[0];
          } else if (child.kind === "picture") {
            pictureIds.add(key(root.section, child.node));
            const sources = (content.pictures ?? []).filter(
              (p) =>
                p.section === root.section &&
                p.pictureNode === child.node &&
                p.owner?.anchorNode === root.containerNode,
            );
            if (sources.length !== 1) throw Error("IncompleteGroupCollisionChildren");
            projected = projectGroupedPicturePage(
              sources[0],
              containers,
              content.paragraphs,
              layout.rows,
            );
            if (projected.state !== "placed")
              throw Error(projected.error ?? "IncompleteGroupCollisionChildren");
          } else throw Error("UnsupportedGroupCollisionChild");
          if (projected.pageOrdinal !== pageOrdinal || !boxValid(projected.rectangle))
            throw Error("IncompleteGroupCollisionChildren");
          boxes.push(projected.rectangle);
        }
      }
      let x = Infinity,
        y = Infinity,
        right = -Infinity,
        bottom = -Infinity;
      for (const b of boxes) {
        x = Math.min(x, b.x);
        y = Math.min(y, b.y);
        right = Math.max(right, b.x + b.width);
        bottom = Math.max(bottom, b.y + b.height);
      }
      const rectangle = { x, y, width: right - x, height: bottom - y };
      if (!boxValid(rectangle)) throw Error("InvalidGroupCollisionBounds");
      footprints.push({
        kind: "group",
        section: root.section,
        node: root.containerNode,
        pageOrdinal,
        rectangle,
      });
    }
    if (
      seenContainers.size !== containers.length ||
      (layout.placedContainers ?? []).some((p) => !covered.has(key(p.section, p.containerNode)))
    )
      throw Error("IncompleteGroupCollisionPlacement");
    return { state: "collected", covered, drawingIds, pictureIds, footprints };
  } catch (error) {
    return fail(error.message);
  }
}
