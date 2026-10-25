// Optional native source adapter. Never parses XML or grants paint rights.
export function attachEllipses(editor, content, available) {
  if (!available) return content;
  content.ellipses = []; content.ellipseSourceErrors = [];
  for (const section of new Set(content.paragraphs.map(p => p.section))) {
    try {
      const rows = editor.ellipseSources(section);
      for (const source of rows) {
        const owner = content.paragraphs.find(p => p.section === section && p.paragraph === source.owner.paragraph - 1);
        if (!owner && content.window) continue;
        if (!owner) throw new Error("EllipseDisplayBindingMismatch");
        content.ellipses.push({ section, source });
      }
    } catch (error) { content.ellipseSourceErrors.push({ section, error: error.message }); }
  }
  return content;
}
