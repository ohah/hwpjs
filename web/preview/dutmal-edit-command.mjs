// Source identities remain separate from current editable leaf values.
export function readDutmalText(editor, message) {
  return {
    section: message.section,
    node: message.node,
    textKind: message.textKind,
    value: editor.dutmalText(message.section, message.node, message.textKind),
  };
}

export function writeDutmalText(editor, message) {
  editor.setDutmalText(message.section, message.node, message.textKind, message.value);
  return readDutmalText(editor, message);
}
