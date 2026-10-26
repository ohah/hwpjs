import { hwp5ObjectFlags } from "./hwp5-object-flags.mjs";
import { hwp5CaptionGeometry } from "./hwp5-caption-geometry.mjs";

// Bind ownership only. Caption measurement and page reservation belong elsewhere.
export function bindHwp5RootGroupCaptions(content, containers, bindings) {
  const fail = (error) => ({ state: "unavailable", error });
  if (!Array.isArray(containers) || !Array.isArray(bindings))
    return fail("InvalidHwp5GroupCaptionInputs");
  try {
    const projected = new Map(),
      lists = new Set();
    const roots = (content.hwp5Drawings ?? []).filter((root) => root.source.kind_id === 0x24636f6e);
    for (const root of roots) {
      const key = `${root.section}:${root.componentNode}`;
      const matches = containers.filter(
        (row) =>
          row.section === root.section &&
          row.containerNode === root.componentNode &&
          row.source.group_context === null,
      );
      const owned = bindings.filter(
        (row) =>
          row.section === root.section &&
          (row.drawingNode === root.componentNode ||
            (row.kind === "caption" && row.controlNode === root.controlNode)),
      );
      if (
        projected.has(key) ||
        matches.length !== 1 ||
        owned.length > 1 ||
        owned.some(
          (row) =>
            row.kind !== "caption" ||
            row.drawingNode !== root.componentNode ||
            row.controlNode !== root.controlNode,
        ) ||
        matches[0].source.component?.owner_node !== root.controlNode
      )
        return fail("AmbiguousHwp5GroupCaptionOwnership");
      const present = owned.length === 1;
      if (
        hwp5ObjectFlags(root.source.flags).has_caption !== present ||
        matches[0].source.has_caption !== present
      )
        return fail("Hwp5GroupCaptionPresenceMismatch");
      let caption = null;
      if (present) {
        const binding = owned[0],
          listKey = `${root.section}:${binding.listNode}`;
        const bodies = (content.hwp5DrawingBodies ?? []).filter(
          (body) => body.section === root.section && body.listNode === binding.listNode,
        );
        if (
          lists.has(listKey) ||
          bodies.length !== 1 ||
          bodies[0].kind !== "caption" ||
          bodies[0].controlNode !== root.controlNode ||
          bodies[0].source.control_node !== root.controlNode ||
          bodies[0].source.list_node !== binding.listNode
        )
          return fail("Hwp5GroupCaptionSourceMismatch");
        const body = bodies[0];
        caption = hwp5CaptionGeometry({
          ...body.source.caption,
          attributes: body.source.attributes,
          list_node: body.listNode,
        });
        if (
          !binding.caption ||
          Object.keys(caption).some((key) => caption[key] !== binding.caption[key])
        )
          return fail("Hwp5GroupCaptionSourceMismatch");
        lists.add(listKey);
      }
      projected.set(key, { ...matches[0], source: { ...matches[0].source, caption } });
    }
    if (containers.filter((row) => row.source.group_context === null).length !== projected.size)
      return fail("MissingHwp5GroupCaptionRoot");
    return {
      state: "projected",
      rootCount: projected.size,
      captionCount: lists.size,
      containers: containers.map((row) =>
        row.source.group_context === null
          ? projected.get(`${row.section}:${row.containerNode}`)
          : row,
      ),
    };
  } catch (error) {
    return fail(error.message);
  }
}
