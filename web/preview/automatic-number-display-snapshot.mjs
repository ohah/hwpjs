// One synchronous display rebuild owns this cache; never retain across edits.
export function createAutomaticNumberDisplaySnapshot(editor) {
  const sections = new Map();
  return (section) => {
    if (!sections.has(section)) {
      const sources = new Map(
        editor.automaticNumberSources(section).map((row) => [row.number_node, row]),
      );
      const sites = editor.automaticNumberSites(section);
      sections.set(section, { sources, sites });
    }
    return sections.get(section);
  };
}
