import { hwp5TableWindowDependencies } from './hwp5-table-window-dependencies.mjs';
import { projectHwp5DependencyWindow } from './hwp5-window-projection.mjs';

// Table dependency slice only; not yet the general HWP5 Worker window route.
export function projectHwp5TableWindow(editor, projection, options) {
  return projectHwp5DependencyWindow(editor, projection, options, hwp5TableWindowDependencies);
}
