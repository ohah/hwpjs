/** Explicit NONE or an observed absent XML element, never missing metadata. */
export function drawingHasNoShadow(paint) {
  return paint?.shadow_type === 0 || paint?.shadow_type === null && paint.shadow_node === null;
}
