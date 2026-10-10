import { validateHwp5MasterPageSources } from "../../js/hwp5-master-page-sources.mjs";

/** Paired table-bug HWP/HWPX profile; not a general high-bit interpretation. */
export function hwp5MasterPageProfile(section, sources) {
  validateHwp5MasterPageSources(sources);
  if (!section || section.fileVersion !== 0x05010001 || section.flags !== 0x20000000 || sources.length !== 1) throw new Error("UnsupportedHwp5MasterPageProfile");
  const source = sources[0];
  if (source.owner_node !== section.source_node || source.list_attributes !== 0 || source.list_unknown !== 0
    || source.width <= 0 || source.height <= 0 || source.text_reference !== 0 || source.number_reference !== 0
    || source.extra_bytes !== 16 || source.extra_nonzero !== false) throw new Error("UnsupportedHwp5MasterPageProfile");
  return { apply: "both", width: source.width, height: source.height, owner_node: source.owner_node, list_node: source.list_node };
}
