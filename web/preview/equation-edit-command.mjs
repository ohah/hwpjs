// Source address + native revision/current text form a write lease. Drafts are
// not native state and must never silently replace a newer value.
export function equationQueryIdentity(message) {
  if (!["equation-sources", "equation-script-query", "equation-script-set"].includes(message.kind))
    return {};
  return { requestId: message.requestId, section: message.section, node: message.node };
}

export function readEquationScript(editor, message) {
  return {
    section: message.section,
    node: message.node,
    value: editor.equationScript(message.section, message.node),
    revision: editor.historyRevision(),
  };
}

export function writeEquationScript(editor, message) {
  if (
    !Number.isInteger(message.expectedRevision) ||
    message.expectedRevision < 0 ||
    message.expectedRevision > 0xffffffff ||
    typeof message.before !== "string"
  )
    throw new Error("InvalidEquationScriptLease");
  if (editor.historyRevision() !== message.expectedRevision)
    throw new Error("EquationRevisionMismatch");
  if (editor.equationScript(message.section, message.node) !== message.before)
    throw new Error("EquationScriptMismatch");
  editor.setEquationScript(message.section, message.node, message.value);
}
