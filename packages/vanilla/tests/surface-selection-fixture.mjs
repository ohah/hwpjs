// Controlled surface edge only; no renderer/Native correctness claim.
export function createRenderer() {
  return {
    layout: () => null,
    viewScale: () => 1,
    show() {},
    clear() {},
    close() {},
    pictureReader() {},
    tableBackgroundReader() {},
    chartReader() {},
    paragraph: () => ({ selectionOwner: "section:0:body" }),
    setViewScale: () => true,
  };
}
export function createCanvasEditor(options) {
  const w = globalThis.__surfaceOwnerWitness;
  w.emit = (value, meta = { origin: "canvas" }) => options.onCommittedSelection(value, meta);
  const clear = (origin) => {
    w.emit(null, { origin });
    w.frames.push(() => w.emit(null, { origin }));
  };
  return {
    reset: (options) => clear(options?.selectionOrigin ?? "canvas"),
    external: (message) => clear(message.origin ?? "canvas"),
    initializeCapabilities() {},
    selectTextRange() {
      return true;
    },
    message() {},
    close() {
      w.emit(null);
    },
    flushComposition() {
      return "unchanged";
    },
    settled() {
      return true;
    },
    focusInput() {
      return true;
    },
    canRequestHistory() {
      return false;
    },
    requestHistory() {
      return false;
    },
  };
}
