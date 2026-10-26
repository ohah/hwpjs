// Consent projection only; native text_ranges owns coordinate relocation.
import { updateHwp5Consent } from './hwp5-consent-visibility.mjs';
export function createRangePolicyControls({ node, format, ready }) {
  return {
    reset() {
      if (node) node.checked = false;
      this.refresh();
    },
    refresh() {
      updateHwp5Consent(node, format(), ready());
    },
    prepare(message) {
      if (
        message.kind !== 'splice' ||
        message.rangePolicy !== undefined ||
        !node?.checked ||
        format() !== 'hwp5' ||
        !ready()
      )
        return message;
      return { ...message, rangePolicy: 'half-open' };
    },
  };
}
