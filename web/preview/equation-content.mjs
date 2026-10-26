// Read-only current anchor identities. Script editing stays in native commands.
export function attachEquations(editor, content, available) {
  content.equationAvailable = available;
  content.equationErrors = [];
  for (const paragraph of content.paragraphs) paragraph.equations = [];
  if (!available) return content;
  const paragraphs = new Map(
    content.paragraphs.map((row) => [`${row.section}:${row.paragraph}`, row]),
  );
  for (const section of new Set(content.paragraphs.map((row) => row.section))) {
    try {
      const sites = editor.equationSites(section);
      const counts = new Map();
      for (const row of sites)
        if (row.source.issue === null && row.error_name === null) {
          const key = `${row.paragraph}:${row.anchor_unit}`;
          counts.set(key, (counts.get(key) ?? 0) + 1);
        }
      for (const row of sites) {
        const node = row.source.node;
        const error = row.source.issue ?? row.error_name;
        if (error !== null) {
          content.equationErrors.push({ section, node, error });
          continue;
        }
        const paragraph = paragraphs.get(`${section}:${row.paragraph - 1}`);
        if (!paragraph || paragraph.clipped) continue;
        if (
          counts.get(`${row.paragraph}:${row.anchor_unit}`) !== 1 ||
          paragraph.text[row.anchor_unit] !== '\ufffc'
        ) {
          content.equationErrors.push({ section, node, error: 'EquationBindingMismatch' });
          continue;
        }
        paragraph.equations.push({ node, unit: row.anchor_unit });
      }
    } catch (error) {
      content.equationErrors.push({ section, error: error.message });
    }
  }
  return content;
}
