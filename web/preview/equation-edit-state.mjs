// A transient draft needs a matching native value/revision lease before writes.
const uint = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
export function createEquationEditState({ request, changed = () => {} }) {
  let serial = 0, selection = null, baseline = null, revision = null, draft = "", pending = null, error = null, closed = false;
  const snapshot = () => ({ selection: selection && { ...selection }, baseline, revision, draft, pending, error, canSubmit: !closed && selection !== null && baseline !== null && revision !== null && pending === null });
  const publish = () => changed(snapshot());
  const invalidate = reason => { serial++; baseline = revision = pending = null; error = reason; publish(); };
  const query = () => {
    if (closed || !selection) return false;
    baseline = revision = null; draft = ""; error = null; pending = "query";
    const accepted = request({ kind: "equation-script-query", ...selection, requestId: ++serial });
    if (!accepted) { pending = null; error = "EquationQueryUnavailable"; }
    publish(); return accepted;
  };
  return {
    snapshot,
    select(value) {
      if (closed) return false;
      if (!value || !uint(value.section) || !uint(value.node)) throw new Error("InvalidEquationSelection");
      selection = { section: value.section, node: value.node }; return query();
    },
    refresh: query,
    edit(value) { if (!snapshot().canSubmit || typeof value !== "string") return false; draft = value; publish(); return true; },
    submit() {
      if (!snapshot().canSubmit) return false;
      if (draft === baseline) return true;
      const accepted = request({ kind: "equation-script-set", ...selection, requestId: ++serial, before: baseline, expectedRevision: revision, value: draft });
      if (accepted) { pending = "write"; error = null; publish(); }
      return accepted;
    },
    message(message) {
      if (closed) return false;
      const expected = pending === "query" ? "equation-script-query" : pending === "write" ? "equation-script-set" : null;
      if (expected && message.kind === expected && message.requestId === serial) {
        const identity = message.error ? message : message.equation;
        if (!identity || identity.section !== selection.section || identity.node !== selection.node) return false;
        if (message.error) {
          pending = null; error = message.error;
          if (message.applied || ["EquationRevisionMismatch", "EquationScriptMismatch"].includes(error)) baseline = revision = null;
        } else {
          if (typeof identity.value !== "string" || !uint(identity.revision)) return false;
          pending = null; error = null; baseline = draft = identity.value; revision = identity.revision;
        }
        publish(); return true;
      }
      if (selection && (message.content || ["undo", "redo"].includes(message.kind) && !message.error)) {
        invalidate("EquationContextChanged"); return true;
      }
      return false;
    },
    reset() { if (closed) return; serial++; selection = null; baseline = revision = pending = error = null; draft = ""; publish(); },
    close() { if (closed) return; serial++; selection = null; baseline = revision = pending = error = null; draft = ""; closed = true; publish(); },
  };
}
