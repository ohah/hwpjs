// Source identities remain separate from current editable leaf values.
export function dutmalQueryIdentity(message) {
  if (message.kind === "inline-string-sources") return { requestId: message.requestId };
  if (!["dutmal-text-query", "dutmal-text"].includes(message.kind)) return {};
  return {
    requestId: message.requestId,
    section: message.section,
    node: message.node,
    textKind: message.textKind,
  };
}

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
