/** Shared explicit counted-coordinate wire layouts; no byte-shape guessing. */
export function countedPointLayoutArg(layout, error) {
  if (layout === 'specified_i16_axes') return 0;
  if (layout === 'observed_i32_points') return 1;
  throw new Error(error);
}
