import { createChartControls } from "../../web/preview/chart-controls.mjs";
export function chartSeriesControlsHarness() {
  const element = () => ({ value: "", listeners: new Map(), addEventListener(kind, fn) { this.listeners.set(kind, fn); }, removeEventListener(kind) { this.listeners.delete(kind); }, replaceChildren(...children) { this.children = children; this.value = children[0]?.value ?? ""; } });
  const form = element(), fields = element(), targets = element(), points = element(), kinds = element(), input = element(), note = element();
  kinds.value = "points"; form.ownerDocument = { createElement: element };
  const requests = [], state = { ready: true };
  const controls = createChartControls({ form, fields, targets, points, kinds, input, note, ready: () => state.ready, request: message => { requests.push(message); return true; } });
  return { form, fields, targets, points, kinds, input, note, requests, state, controls };
}
