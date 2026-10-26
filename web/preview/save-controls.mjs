/** Shared save command entry; native state and readiness stay with the caller. */
export function createSaveControls({
  button,
  keyboard,
  active,
  canRequest,
  request,
  reportBlocked = () => {},
}) {
  const events = new AbortController();
  const save = () => {
    if (!active() || !canRequest()) {
      reportBlocked();
      return false;
    }
    return request();
  };
  button.addEventListener("click", save, { signal: events.signal });
  keyboard.addEventListener(
    "keydown",
    (event) => {
      if (
        event.defaultPrevented ||
        !active() ||
        event.altKey ||
        event.shiftKey ||
        !(event.ctrlKey || event.metaKey) ||
        event.key?.toLowerCase() !== "s"
      )
        return;
      // Never open the browser's HTML-save dialog for an active document, even
      // if the native model is busy. Repeats/composition cannot issue a save.
      event.preventDefault();
      if (event.repeat || event.isComposing || event.keyCode === 229) return;
      save();
    },
    { signal: events.signal },
  );
  return {
    close() {
      events.abort();
    },
  };
}
