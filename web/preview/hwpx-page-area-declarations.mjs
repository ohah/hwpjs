// Response-local coordinates. Rendering/activation policy consumes these later.
export function attachHwpxPageAreaDeclarations(editor, content, available) {
  if (!available) return content;
  content.pageAreaDeclarations = [];
  content.pageAreaDeclarationErrors = [];
  const sections = new Set(
    (content.paragraphFlows ?? []).filter((row) => row.page_area).map((row) => row.section),
  );
  for (const section of sections) {
    try {
      const rows = editor.pageAreaDeclarations(section);
      content.pageAreaDeclarations.push(
        ...rows.map((row) => ({ ...row, section, paragraph: row.paragraph - 1 })),
      );
    } catch (error) {
      // Preserve the existing body preview but never claim usable coordinates.
      content.pageAreaDeclarationErrors.push({ section, error: error.message });
    }
  }
  return content;
}
