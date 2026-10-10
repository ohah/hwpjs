// Native details.open is the sole authority; this module dispatches no commands.
export function createMenuDisclosures(popups) {
  let closed = false;
  const contains = node => typeof node?.nodeType === "number" && popups.some(popup => popup.contains?.(node));
  const rows = popups.map(popup => {
    popup.setAttribute?.("name", "hwpjs-document-menu");
    const summary = popup.querySelector?.("summary");
    const enter = event => {
      if (closed || event.pointerType === "touch" || popup.open || !popups.some(other => other.open)) return;
      for (const other of popups) if (other !== popup) other.open = false;
      popup.open = true;
    };
    summary?.addEventListener?.("pointerenter", enter);
    return { summary, enter };
  });
  const documents = [...new Set(popups.map(popup => popup.ownerDocument).filter(Boolean))];
  const outside = event => {
    if (closed || contains(event.target) || event.composedPath?.().some(contains)) return;
    for (const popup of popups) popup.open = false;
  };
  for (const document of documents) document.addEventListener("pointerdown", outside);
  return { close() {
    if (closed) return;
    closed = true;
    for (const { summary, enter } of rows) summary?.removeEventListener?.("pointerenter", enter);
    for (const document of documents) document.removeEventListener("pointerdown", outside);
    for (const popup of popups) popup.open = false;
  } };
}
