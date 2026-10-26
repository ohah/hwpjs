import { hwp5MasterPageProfiles } from "./hwp5-master-page-policy.mjs";

/** Separate repeated source text from body flow, retaining source paragraph IDs. */
export function projectHwp5MasterPages(content) {
  if (content.masterPageSourceErrors?.length) throw new Error("IncompleteHwp5MasterPageSources");
  const masters = content.currentParagraphFlows?.filter((row) => row.host === "master_page") ?? [];
  if (!masters.length) {
    if (content.masterPageSources?.length) throw new Error("Hwp5MasterPageBindingMismatch");
    return { content, groups: [] };
  }
  const groups = [],
    removed = new Set();
  for (const section of new Set(masters.map((row) => row.section))) {
    const settings = content.sectionSources?.filter((row) => row.section === section) ?? [];
    if (settings.length !== 1) throw new Error("AmbiguousHwp5SectionSources");
    const sources = content.masterPageSources?.filter((row) => row.section === section) ?? [];
    const profiles = hwp5MasterPageProfiles(settings[0], sources);
    const flows = masters.filter((row) => row.section === section);
    if (
      flows.some(
        (flow) =>
          !profiles.some(
            (profile) =>
              flow.list_node === profile.list_node && flow.parent_node === profile.owner_node,
          ),
      )
    )
      throw new Error("Hwp5MasterPageBindingMismatch");
    for (const profile of profiles) {
      const selected = flows.filter((flow) => flow.list_node === profile.list_node);
      const declaration = sources.find((source) => source.list_node === profile.list_node);
      if (selected.length !== declaration.paragraph_count)
        throw new Error("Hwp5MasterPageBindingMismatch");
      const paragraphs = selected.map((flow) => {
        if (
          flow.parent_node !== profile.owner_node ||
          flow.list_node !== profile.list_node ||
          flow.break_flags !== 0
        )
          throw new Error("UnsupportedHwp5MasterPageFlow");
        const matches = content.paragraphs.filter(
          (row) => row.section === section && row.paragraph === flow.paragraph,
        );
        const key = `${section}:${flow.paragraph}`;
        if (matches.length !== 1 || removed.has(key))
          throw new Error("Hwp5MasterPageBindingMismatch");
        removed.add(key);
        return matches[0];
      });
      groups.push({ section, profile, paragraphs });
    }
  }
  if (
    content.masterPageSources.some((row) => !groups.some((group) => group.section === row.section))
  )
    throw new Error("Hwp5MasterPageBindingMismatch");
  return {
    content: {
      ...content,
      paragraphs: content.paragraphs.filter(
        (row) => !removed.has(`${row.section}:${row.paragraph}`),
      ),
      currentParagraphFlows: content.currentParagraphFlows.filter(
        (row) => row.host !== "master_page",
      ),
    },
    groups,
  };
}
