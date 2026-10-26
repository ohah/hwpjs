// Derived display bindings only; never infer a native ID from a display ordinal.
export function attachHwp5CurrentReferences(editor, preview, content) {
  for (const row of content.paragraphs) delete row.currentReference;
  if (!editor?.supportsCurrentReferences?.()) return content;
  const errors = [];
  for (const section of new Set(content.paragraphs.map((row) => row.section))) {
    try {
      const total = editor.paragraphCount(section);
      if (total !== preview.sections[section]?.paragraphs.length)
        throw new Error('CurrentReferenceDisplayMismatch');
      const rows = content.paragraphs.filter((row) => row.section === section);
      const bindings = new Map();
      // Query only chunks containing displayed rows, including window context.
      for (const first of new Set(rows.map((row) => Math.floor(row.paragraph / 1024) * 1024))) {
        const query = editor.supportsCurrentSourceReferences?.()
          ? 'currentSourceReferences'
          : 'currentReferences';
        const window = editor[query](section, { first, count: Math.min(1024, total - first) });
        if (
          window.total !== total ||
          window.first !== first ||
          window.references.length !== Math.min(1024, total - first) ||
          window.references.some((ref) => ref.kind === 'cell' || ref.section !== section)
        )
          throw new Error('CurrentReferenceDisplayMismatch');
        window.references.forEach((ref, index) => bindings.set(first + index, ref));
      }
      for (const row of rows) {
        const ref = bindings.get(row.paragraph);
        if (!ref) throw new Error('CurrentReferenceDisplayMismatch');
      }
      for (const row of rows) row.currentReference = bindings.get(row.paragraph);
    } catch (error) {
      errors.push({ section, error: error.message });
    }
  }
  content.currentReferenceErrors = errors;
  return content;
}
