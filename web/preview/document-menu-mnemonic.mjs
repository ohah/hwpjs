/** Resolve a scoped key only; current command authority remains in controls. */
export function documentMenuMnemonic(event, popup, buttons) {
  if (
    !popup.open ||
    event.defaultPrevented ||
    event.isComposing ||
    event.keyCode === 229 ||
    event.repeat ||
    event.ctrlKey ||
    event.altKey ||
    event.metaKey ||
    event.shiftKey ||
    typeof event.key !== 'string' ||
    !/^[a-z0-9]$/i.test(event.key)
  )
    return null;
  if (
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(event.target?.tagName) ||
    event.target?.isContentEditable
  )
    return null;
  const summary = popup.querySelector('summary');
  if (
    event.target !== summary &&
    !buttons.some((button) => button === event.target || button.contains?.(event.target))
  )
    return null;
  const matches = buttons.filter(
    (button) => button.getAttribute?.('data-menu-key')?.toLowerCase() === event.key.toLowerCase(),
  );
  return matches.length === 1 ? matches[0] : null;
}
