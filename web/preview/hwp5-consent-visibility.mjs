/** Format projection only; each command boundary still checks its own consent. */
export function updateHwp5Consent(node, format, ready) {
  if (!node) return;
  const applicable = format === "hwp5";
  node.disabled = !applicable || !ready;
  const label = node.closest?.("label");
  if (label) label.hidden = !applicable;
  if (!applicable) node.checked = false;
}
