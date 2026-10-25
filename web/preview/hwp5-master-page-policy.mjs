import { validateHwp5MasterPageSources } from "../../js/hwp5-master-page-sources.mjs";

/** Single-profile compatibility entry; paired source contracts remain below. */
export function hwp5MasterPageProfile(section, sources) {
  const profiles = hwp5MasterPageProfiles(section, sources);
  if (profiles.length !== 1) throw new Error("UnsupportedHwp5MasterPageProfile");
  return profiles[0];
}

export function hwp5MasterPageProfiles(section, sources) {
  validateHwp5MasterPageSources(sources);
  let applies;
  if (section && [0x05010001, 0x05010100].includes(section.fileVersion) && section.flags === 0x20000000 && sources.length === 1) applies = ["both"];
  else if (section?.fileVersion === 0x05010100 && section.flags === 0xc0000000 && sources.length === 2 && sources[0].list_node < sources[1].list_node) applies = ["even", "odd"];
  else throw new Error("UnsupportedHwp5MasterPageProfile");
  return sources.map((source, index) => {
    if (source.owner_node !== section.source_node || source.list_attributes !== 0 || source.list_unknown !== 0
      || source.width <= 0 || source.height <= 0 || source.text_reference !== 0 || source.number_reference !== 0
      || source.extra_bytes !== 16 || source.extra_nonzero !== false) throw new Error("UnsupportedHwp5MasterPageProfile");
    return { apply: applies[index], width: source.width, height: source.height, owner_node: source.owner_node, list_node: source.list_node };
  });
}
