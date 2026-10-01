/** Buttons share Canvas command gating; no history stack or editable cache here. */
export function createHistoryControls({ undo, redo, canRequest, request }) {
  const events = new AbortController();
  const update = () => {
    const enabled = canRequest();
    undo.disabled = !enabled; redo.disabled = !enabled;
  };
  for (const [button, kind] of [[undo, "undo"], [redo, "redo"]]) {
    button.addEventListener("click", () => {
      update();
      if (!button.disabled) request(kind);
      update();
    }, { signal: events.signal });
  }
  update();
  return { update, close() { events.abort(); undo.disabled = true; redo.disabled = true; } };
}
