import { groupShapeChildren } from './group-shape-children.mjs';
import { objectCollisionBox } from './object-collision-box.mjs';

const validBox = (b) =>
  b &&
  [b.x, b.y, b.width, b.height, b.x + b.width, b.y + b.height].every(Number.isFinite) &&
  b.width > 0 &&
  b.height > 0;
// A root's declared size is not proof that all children fit inside it.
export function groupRootCollisionFootprint(root, containers, placement, children, captions = []) {
  const fail = (error) => ({ state: 'unavailable', error });
  if (
    !root ||
    root.source?.group_context !== null ||
    !Array.isArray(containers) ||
    !Array.isArray(children) ||
    !Array.isArray(captions) ||
    !Number.isSafeInteger(root.section) ||
    root.section < 0 ||
    !Number.isSafeInteger(root.containerNode) ||
    root.containerNode < 0 ||
    placement?.section !== root.section ||
    placement.containerNode !== root.containerNode ||
    !Number.isSafeInteger(placement.pageOrdinal) ||
    placement.pageOrdinal < 0 ||
    !validBox(placement.rectangle)
  )
    return fail('InvalidGroupCollisionRoot');
  const nodes = new Map(),
    expected = new Set(),
    expectedCaptions = new Map(),
    visited = new Set(),
    pending = [root];
  for (const c of containers.filter((c) => c?.section === root.section)) {
    if (nodes.has(c.containerNode)) return fail('AmbiguousGroupCollisionContainer');
    nodes.set(c.containerNode, c);
  }
  if (nodes.get(root.containerNode) !== root) return fail('MissingGroupCollisionRoot');
  try {
    while (pending.length) {
      const current = pending.pop();
      if (visited.has(current.containerNode)) return fail('RepeatedGroupCollisionContainer');
      visited.add(current.containerNode);
      for (const child of groupShapeChildren(current.source, { allowCaptions: true })) {
        if (child.kind === 'metadata') continue;
        if (child.kind === 'caption') {
          if (expectedCaptions.has(child.node)) return fail('RepeatedGroupCollisionCaption');
          expectedCaptions.set(child.node, current);
          continue;
        }
        if (child.kind === 'unsupported') return fail('UnsupportedGroupCollisionChild');
        if (child.kind === 'container') {
          const nested = nodes.get(child.node);
          if (
            !nested ||
            nested.source?.group_context?.root_anchor !== root.containerNode ||
            nested.source.group_context.parent_container !== current.containerNode
          )
            return fail('MissingGroupCollisionContainer');
          pending.push(nested);
        } else {
          if (expected.has(child.node)) return fail('RepeatedGroupCollisionChild');
          expected.add(child.node);
        }
      }
    }
    if (children.length !== expected.size) return fail('IncompleteGroupCollisionChildren');
    let left = placement.rectangle.x,
      top = placement.rectangle.y;
    let right = left + placement.rectangle.width,
      bottom = top + placement.rectangle.height;
    const seen = new Set();
    for (const child of children) {
      if (
        !child ||
        child.section !== root.section ||
        child.pageOrdinal !== placement.pageOrdinal ||
        !expected.has(child.node) ||
        seen.has(child.node) ||
        !validBox(child.rectangle)
      )
        return fail('InvalidGroupCollisionChildPlacement');
      seen.add(child.node);
      left = Math.min(left, child.rectangle.x);
      top = Math.min(top, child.rectangle.y);
      right = Math.max(right, child.rectangle.x + child.rectangle.width);
      bottom = Math.max(bottom, child.rectangle.y + child.rectangle.height);
    }
    if (captions.length !== expectedCaptions.size) return fail('IncompleteGroupCollisionCaptions');
    const seenCaptions = new Set();
    for (const caption of captions) {
      const owner = expectedCaptions.get(caption?.captionNode);
      if (
        !owner ||
        seenCaptions.has(caption.captionNode) ||
        caption.section !== root.section ||
        caption.containerNode !== owner.containerNode ||
        caption.listNode !== owner.source.caption.list_node ||
        caption.pageOrdinal !== placement.pageOrdinal ||
        !validBox(caption.rectangle)
      )
        return fail('InvalidGroupCollisionCaptionPlacement');
      seenCaptions.add(caption.captionNode);
      left = Math.min(left, caption.rectangle.x);
      top = Math.min(top, caption.rectangle.y);
      right = Math.max(right, caption.rectangle.x + caption.rectangle.width);
      bottom = Math.max(bottom, caption.rectangle.y + caption.rectangle.height);
    }
    const rectangle = objectCollisionBox(
      { x: left, y: top, width: right - left, height: bottom - top },
      root.source.flow?.outside_margins,
    );
    if (!validBox(rectangle)) return fail('InvalidGroupCollisionBounds');
    return {
      state: 'collected',
      footprint: {
        section: root.section,
        pageOrdinal: placement.pageOrdinal,
        node: root.containerNode,
        kind: 'group',
        rectangle,
      },
    };
  } catch (error) {
    return fail(error.message);
  }
}
