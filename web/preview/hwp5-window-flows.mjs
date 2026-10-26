// Selection of current native identities, shared by window object attachments.
export function memoHwp5WindowFlows(editor) {
  const scoped = Object.create(editor),
    flows = new Map();
  scoped.paragraphFlow = (section) => {
    if (!flows.has(section)) flows.set(section, editor.paragraphFlow(section));
    return flows.get(section);
  };
  return scoped;
}

export function hwp5WindowFlows(editor, content) {
  if (!content.window) throw new Error('MissingParagraphWindow');
  const displayed = new Set(content.paragraphs.map((row) => `${row.section}:${row.paragraph}`));
  if (displayed.size !== content.paragraphs.length)
    throw new Error('WindowDependencyBindingMismatch');
  const completeFlows = new Map(),
    selectedFlows = [];
  for (const section of new Set(content.paragraphs.map((row) => row.section))) {
    const flows = editor.paragraphFlow(section);
    if (
      flows.length !== editor.paragraphCount(section) ||
      flows.some((row, index) => row.paragraph !== index)
    )
      throw new Error('WindowDependencyBindingMismatch');
    completeFlows.set(section, flows);
    selectedFlows.push(
      ...flows
        .filter((row) => displayed.has(`${section}:${row.paragraph}`))
        .map((row) => ({ ...row, section })),
    );
  }
  if (selectedFlows.length !== displayed.size) throw new Error('WindowDependencyBindingMismatch');
  return { displayed, completeFlows, selectedFlows };
}
