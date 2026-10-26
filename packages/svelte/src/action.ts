import type { Action } from 'svelte/action';
import type { CanvasSurfaceProps } from './types.ts';
import { createSurfaceLifecycle } from './lifecycle.ts';

/** Svelte creates/destroys only the root. Vanilla exclusively owns its children. */
export const canvasSurface: Action<HTMLElement, CanvasSurfaceProps> = (root, props) => {
  const lifecycle = createSurfaceLifecycle(root, async (options) => {
    const { createCanvasSurface } = await import('@hwpjs/vanilla');
    return createCanvasSurface(options);
  });
  lifecycle.update(props);
  return {
    update(next) {
      lifecycle.update(next);
    },
    destroy() {
      void lifecycle.destroy();
    },
  };
};
