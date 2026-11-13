// BorderFill codes verified by paired official HWP/HWPX exports, not table-29 ordinals.
const styles = Object.freeze([
  'HORIZONTAL',
  'VERTICAL',
  'SLASH',
  'BACK_SLASH',
  'CROSS',
  'CROSS_DIAGONAL',
]);
export function hwp5HatchStyle(raw) {
  return Number.isInteger(raw) && raw >= 0 && raw < styles.length ? styles[raw] : null;
}
