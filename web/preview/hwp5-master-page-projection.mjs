import { hwp5MasterPageProfile } from "./hwp5-master-page-policy.mjs";

/** Separate repeated source text from body flow, retaining source paragraph IDs. */
export function projectHwp5MasterPages(content) {
  if (content.masterPageSourceErrors?.length) throw new Error("IncompleteHwp5MasterPageSources");
  const masters = content.currentParagraphFlows?.filter(row => row.host === "master_page") ?? [];
  if (!masters.length) {
    if (content.masterPageSources?.length) throw new Error("Hwp5MasterPageBindingMismatch");
    return { content, groups: [] };
  }
  const groups = [], removed = new Set();
  for (const section of new Set(masters.map(row => row.section))) {
    const settings = content.sectionSources?.filter(row => row.section === section) ?? [];
    if (settings.length !== 1) throw new Error("AmbiguousHwp5SectionSources");
    const sources = content.masterPageSources?.filter(row => row.section === section) ?? [];
    const profile = hwp5MasterPageProfile(settings[0], sources);
    const flows = masters.filter(row => row.section === section);
    const paragraphs = flows.map(flow => {
      if (flow.parent_node !== profile.owner_node || flow.list_node !== profile.list_node || flow.break_flags !== 0) throw new Error("UnsupportedHwp5MasterPageFlow");
      const matches = content.paragraphs.filter(row => row.section === section && row.paragraph === flow.paragraph);
      const key = `${section}:${flow.paragraph}`;
      if (matches.length !== 1 || removed.has(key)) throw new Error("Hwp5MasterPageBindingMismatch");
      removed.add(key);
      return matches[0];
    });
    groups.push({ section, profile, paragraphs });
  }
  if (content.masterPageSources.some(row => !groups.some(group => group.section === row.section))) throw new Error("Hwp5MasterPageBindingMismatch");
  return { content: { ...content, paragraphs: content.paragraphs.filter(row => !removed.has(`${row.section}:${row.paragraph}`)),
    currentParagraphFlows: content.currentParagraphFlows.filter(row => row.host !== "master_page") }, groups };
}
