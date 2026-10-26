// Source declarations only; inherited layout policy remains a separate layer.
export function attachHwp5PageDeclarations(editor, content, selectedSections = null) {
  content.pageSources = [];
  content.pageSourceErrors = [];
  content.sectionSources = [];
  content.sectionSourceErrors = [];
  if (!editor) return content;
  const sections =
    selectedSections ?? Array.from({ length: editor.sectionCount() }, (_, index) => index);
  for (const section of sections) {
    try {
      const setting = editor.sectionSettings(section);
      let fileVersion;
      try {
        fileVersion = editor.fileVersion?.();
      } catch (error) {
        if (error.message !== 'Hwp5FileVersionAbiUnavailable') throw error;
      }
      content.sectionSources.push({
        section,
        ...setting,
        ...(fileVersion === undefined ? {} : { fileVersion }),
      });
    } catch (error) {
      content.sectionSourceErrors.push({ section, error: error.message });
    }
    try {
      content.pageSources.push({ section, ...editor.pageSettings(section) });
    } catch (error) {
      content.pageSourceErrors.push({ section, error: error.message });
    }
  }
  return content;
}
