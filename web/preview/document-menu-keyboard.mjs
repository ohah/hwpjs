// Focus navigation only; command execution remains in document-menu-controls.
export function navigateDocumentMenuBar(event, popups, refresh = () => {}) {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.keyCode === 229 ||
    event.shiftKey ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey ||
    !['ArrowLeft', 'ArrowRight'].includes(event.key) ||
    popups.length < 2
  )
    return false;
  const index = popups.findIndex(
    (popup) => popup.querySelector('summary') === event.target || popup.contains?.(event.target),
  );
  if (index < 0) return false;
  const current = popups[index],
    summary = current.querySelector('summary');
  if (!current.open && event.target !== summary) return false;
  const next =
    popups[(index + (event.key === 'ArrowRight' ? 1 : -1) + popups.length) % popups.length];
  const target = next.querySelector('summary');
  if (!target) return false;
  const opened = current.open;
  event.preventDefault();
  for (const popup of popups) popup.open = popup === next && opened;
  refresh();
  target.focus();
  return true;
}

export function navigateDocumentMenu(
  event,
  popup,
  buttons,
  openPopup = () => {
    popup.open = true;
  },
) {
  if (
    event.defaultPrevented ||
    event.isComposing ||
    event.keyCode === 229 ||
    event.altKey ||
    event.ctrlKey ||
    event.metaKey
  )
    return false;
  if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) || !buttons.length) return false;
  const summary = popup.querySelector('summary');
  const index = buttons.findIndex(
    (button) => button === event.target || button.contains?.(event.target),
  );
  if (index < 0 && event.target !== summary) return false;
  if (!popup.open && !['ArrowDown', 'ArrowUp'].includes(event.key)) return false;
  const next =
    event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? buttons.length - 1
        : index < 0
          ? event.key === 'ArrowDown'
            ? 0
            : buttons.length - 1
          : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
  event.preventDefault();
  openPopup();
  buttons[next].focus();
  return true;
}
