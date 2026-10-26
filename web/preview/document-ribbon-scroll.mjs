// The real sticky tab height owns the scroll inset; CSS provides the fallback.
export function synchronizeRibbonScrollInset(root, tabs) {
  if (!root?.style || typeof tabs?.getBoundingClientRect !== 'function') return { close() {} };
  const property = '--document-ribbon-tabs-height';
  const previous = root.style.getPropertyValue(property),
    priority = root.style.getPropertyPriority(property);
  let closed = false;
  const update = () => {
    if (closed) return;
    const height = tabs.getBoundingClientRect().height;
    if (Number.isFinite(height) && height > 0) root.style.setProperty(property, `${height}px`);
  };
  update();
  const Observer = root.ownerDocument?.defaultView?.ResizeObserver;
  const observer = typeof Observer === 'function' ? new Observer(update) : null;
  observer?.observe(tabs);
  return {
    close() {
      if (closed) return;
      closed = true;
      observer?.disconnect();
      if (previous) root.style.setProperty(property, previous, priority);
      else root.style.removeProperty(property);
    },
  };
}
