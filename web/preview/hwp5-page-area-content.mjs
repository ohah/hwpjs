import { validateHwp5PageAreaSources } from "../../js/hwp5-page-area-sources.mjs";
/** Raw source declarations attached by current native list ownership, not text labels. */
export function attachHwp5PageAreas(editor, content) {
  content.pageAreaSources = [];
  content.pageAreaSourceErrors = [];
  if (!editor) return content;
  const flows = content.currentParagraphFlows ?? [];
  for (const section of new Set(
    flows.filter((row) => ["header", "footer"].includes(row.host)).map((row) => row.section),
  )) {
    try {
      const areas = validateHwp5PageAreaSources(editor.pageAreaSources(section)),
        seen = new Set();
      const members = flows.filter(
        (row) => row.section === section && ["header", "footer"].includes(row.host),
      );
      for (const area of areas) {
        if (seen.has(area.list_node)) throw new Error("AmbiguousHwp5PageAreaSource");
        seen.add(area.list_node);
        const current = members.filter(
          (row) =>
            row.host === area.kind &&
            row.list_node === area.list_node &&
            row.parent_node === area.owner_node,
        );
        if (!current.length) throw new Error("MissingHwp5PageAreaOwner");
      }
      if (
        members.some(
          (row) =>
            !areas.some(
              (area) =>
                area.kind === row.host &&
                area.list_node === row.list_node &&
                area.owner_node === row.parent_node,
            ),
        )
      )
        throw new Error("Hwp5PageAreaBindingMismatch");
      content.pageAreaSources.push(...areas.map((row) => ({ ...row, section })));
    } catch (error) {
      content.pageAreaSourceErrors.push({ section, error: error.message });
    }
  }
  return content;
}

export function hwp5PageArea(source) {
  validateHwp5PageAreaSources([source]);
  if (
    !source ||
    !["header", "footer"].includes(source.kind) ||
    (source.control_attributes & ~3) !== 0 ||
    (source.control_attributes & 3) === 3 ||
    (source.list_attributes & ~0x60) !== 0 ||
    ((source.list_attributes >> 5) & 3) === 3 ||
    source.list_unknown !== 0 ||
    source.width <= 0 ||
    source.height < 0
  )
    throw new Error("UnsupportedHwp5PageArea");
  if (source.text_references !== 0 || source.number_references !== 0)
    throw new Error("UnsupportedHwp5PageAreaReferences");
  const identityOnly =
    source.control_extra_bytes === 4 &&
    Number.isInteger(source.control_instance_id) &&
    source.control_instance_id >= 0 &&
    source.control_instance_id <= 0xffffffff &&
    source.control_extra_nonzero === (source.control_instance_id !== 0);
  if (
    (source.control_extra_nonzero !== false && !identityOnly) ||
    source.list_extra_nonzero !== false ||
    ![0, 4].includes(source.control_extra_bytes) ||
    ![0, 16].includes(source.list_extra_bytes)
  )
    throw new Error("UnsupportedHwp5PageAreaExtension");
  return {
    owner_node: source.owner_node,
    list_node: source.list_node,
    apply: ["both", "even", "odd"][source.control_attributes & 3],
    width: source.width,
    height: source.height,
    vertical_alignment: ["top", "center", "bottom"][(source.list_attributes >> 5) & 3],
  };
}
