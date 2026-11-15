import { chartAreaPrimitives } from './chart-area-primitives.mjs';
import { projectFamily3D } from './chart-family-3d.mjs';
export function chartArea3DPrimitives(display, node) {
  return projectFamily3D(display, node, chartAreaPrimitives(display, node));
}
