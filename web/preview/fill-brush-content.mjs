export function attachFillBrushSources(editor, content) {
  content.fillBrushReports = [];
  content.fillBrushErrors = [];
  for (const section of new Set(content.paragraphs.map(p => p.section))) {
    try {
      if (typeof editor.sectionFillBrushes !== "function") throw new Error("HwpxFillBrushesAbiUnavailable");
      content.fillBrushReports.push({ section, report: editor.sectionFillBrushes(section) });
    } catch (error) { content.fillBrushErrors.push({ section, error: error.message }); }
  }
  return content;
}
