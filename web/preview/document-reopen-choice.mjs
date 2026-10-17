import { failureMessage } from "./failure-message.mjs";

// Owns selected-file lifetime and stale replies for explicit load choices.
export function createDocumentReopenChoice({ button, note, reopen, accepts, summary, offered, preparing, failed, confirm = () => true, cancelled = "" }) {
  let source = null, generation = 0, closed = false;
  const reset = () => { generation++; source = null; button.hidden = true; button.disabled = true; note.textContent = ""; };
  const click = () => {
    if (closed || source === null || button.disabled) return;
    const selected = source, offeredEpoch = generation;
    if (confirm(selected) !== true) { if (!closed && offeredEpoch === generation) note.textContent = cancelled; return; }
    if (closed || offeredEpoch !== generation || source !== selected) return;
    const epoch = ++generation;
    source = null; button.hidden = true; button.disabled = true;
    note.textContent = preparing;
    const reject = error => { if (!closed && epoch === generation) note.textContent = `${failed}: ${failureMessage(error)}`; };
    try { Promise.resolve(reopen(selected)).catch(reject); } catch (error) { reject(error); }
  };
  button.addEventListener("click", click);
  reset();
  return {
    reset,
    offer(selected, reply) {
      reset();
      if (closed || !selected || !accepts(reply)) return false;
      source = selected; button.hidden = false; button.disabled = false; note.textContent = offered;
      return true;
    },
    loaded(content) { reset(); if (!closed) note.textContent = summary(content) ?? ""; },
    close() { closed = true; reset(); button.removeEventListener("click", click); },
  };
}
