// The editor/native session owns values and reference lifetimes.
export function currentReferenceCommand(editor, format, enabled, message) {
  if (!editor || !enabled) throw new Error("EditorNotOpen");
  if (format !== "hwp5") throw new Error("UnsupportedCurrentReferenceFormat");
  if (message.kind === "query-created-tables")
    return { tables: editor.createdTables(message.section) };
  if (message.kind === "query-current-references")
    return { window: editor.currentReferences(message.section, { first: message.first, count: message.count }) };
  if (message.kind === "query-current-source-references")
    return { window: editor.currentSourceReferences(message.section, { first: message.first, count: message.count }) };
  if (message.kind === "query-current-text")
    return { text: editor.currentText(message.reference) };
  if (message.kind !== "splice-current") throw new Error("UnknownCurrentReferenceCommand");
  editor.spliceCurrent(message);
  return null;
}
