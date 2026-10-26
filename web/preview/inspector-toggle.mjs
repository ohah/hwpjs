// Presentation only. Native controls retain their own availability and values.
export function createInspectorToggle({ button, panel }) {
  if (!button || !panel) throw new TypeError('MissingInspectorElements');
  const show = (visible) => {
    if (typeof visible !== 'boolean') throw new TypeError('InvalidInspectorVisibility');
    const restoreFocus = !visible && panel.contains(panel.ownerDocument.activeElement);
    panel.hidden = !visible;
    button.setAttribute('aria-expanded', String(visible));
    if (visible) {
      const details = panel.querySelector('details');
      if (details) details.open = true;
    }
    if (restoreFocus) button.focus();
  };
  const toggle = () => show(panel.hidden);
  button.addEventListener('click', toggle);
  show(!panel.hidden);
  return {
    show,
    close() {
      button.removeEventListener('click', toggle);
    },
  };
}
