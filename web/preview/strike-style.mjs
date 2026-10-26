/** Raw HWP5 mappings here are fixture-observed, not inferred from table 25. */
import { underlineStyle } from './underline-style.mjs';
export function strikeStyle(enabled, row) {
  if (enabled !== true || !row) return null;
  if (row.raw_style === null) return underlineStyle('center', row);
  const shape = { 0: 'SOLID', 1: 'DOT' }[row.raw_style];
  if (!shape) return null;
  // Reuse color validation without reusing underline's raw line mapping.
  const color = underlineStyle('center', { ...row, raw_style: 0 });
  return color ? { ...color, shape } : null;
}
