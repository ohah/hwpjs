// Consent projection only; native text_ranges owns coordinate relocation.
export function createRangePolicyControls({ node, format, ready }) {
  return {
    reset() { if (node) node.checked = false; this.refresh(); },
    refresh() { if (node) node.disabled = format() !== "hwp5" || !ready(); },
    prepare(message) {
      if (message.kind !== "splice" || message.rangePolicy !== undefined || !node?.checked || format() !== "hwp5" || !ready()) return message;
      return { ...message, rangePolicy: "half-open" };
    },
  };
}
