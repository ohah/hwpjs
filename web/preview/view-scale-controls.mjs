import { VIEW_SCALES, isViewScale } from './view-scale.mjs';

// DOM projection only. The renderer owns the current presentation scale.
export function createViewScaleControls({ node, renderer, ready }) {
  let closed = false;
  node.replaceChildren(
    ...VIEW_SCALES.map((scale) => {
      const option = node.ownerDocument.createElement('option');
      option.value = String(scale);
      option.textContent = `${scale * 100}%`;
      return option;
    }),
  );
  const refresh = () => {
    if (closed) return;
    node.disabled = !ready();
    node.value = String(renderer.viewScale());
  };
  const change = () => {
    if (closed) return;
    const value = Number(node.value);
    if (!node.disabled && ready() && node.value === String(value) && isViewScale(value))
      renderer.setViewScale(value);
    refresh();
  };
  node.addEventListener('change', change);
  refresh();
  return {
    refresh,
    close() {
      if (closed) return;
      closed = true;
      node.removeEventListener('change', change);
      node.disabled = true;
    },
  };
}
