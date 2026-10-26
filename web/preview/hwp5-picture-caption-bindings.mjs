import { hwp5ObjectFlags } from "./hwp5-object-flags.mjs";

// Only direct picture roots own these captions; grouped picture models are retained.
export function bindHwp5RootPictureCaptions(content, pictures, bindings) {
  const fail = (error) => ({ state: "unavailable", error });
  const projected = new Map();
  for (const root of (content.hwp5Drawings ?? []).filter(
    (row) => row.source.kind_id === 0x24706963,
  )) {
    const matches = pictures.filter(
      (row) => row.section === root.section && row.pictureNode === root.componentNode,
    );
    const owned = bindings.filter(
      (row) => row.section === root.section && row.drawingNode === root.componentNode,
    );
    const captions = owned.filter((row) => row.kind === "caption"),
      key = `${root.section}:${root.componentNode}`;
    if (
      matches.length !== 1 ||
      owned.some((row) => row.kind !== "caption") ||
      captions.length > 1 ||
      projected.has(key)
    )
      return fail("AmbiguousHwp5MixedPictureOwnership");
    if (hwp5ObjectFlags(root.source.flags).has_caption !== (captions.length === 1))
      return fail("Hwp5MixedPictureCaptionMismatch");
    projected.set(key, { ...matches[0], caption: captions[0]?.caption ?? null });
  }
  return {
    state: "projected",
    rootCount: projected.size,
    pictures: pictures.map((row) => projected.get(`${row.section}:${row.pictureNode}`) ?? row),
  };
}
