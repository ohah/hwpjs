// JSON boundary types only; native code owns XML interpretation and defaults.
export const object = (value) =>
  value !== null && typeof value === 'object' && !Array.isArray(value);
export const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
export const text = (value) => typeof value === 'string' && value.isWellFormed();
export const nullableUint = (value) => value === null || uint(value);
export const oneOf = (values) => (value) => values.includes(value);
export function field(value, accepts, owner) {
  return (
    value === null ||
    (object(value) &&
      uint(value.node) &&
      value.node > owner &&
      (value.value === null || accepts(value.value)))
  );
}
export function number(value) {
  return (
    object(value) &&
    (value.kind === 'finite'
      ? typeof value.value === 'number' && Number.isFinite(value.value)
      : ['positive_infinity', 'negative_infinity', 'not_a_number'].includes(value.kind) &&
        value.value === null)
  );
}
export function scaling(value, owner) {
  return (
    value === null ||
    (object(value) &&
      uint(value.node) &&
      value.node > owner &&
      field(value.orientation, oneOf(['minMax', 'maxMin']), value.node) &&
      [value.minimum, value.maximum, value.log_base].every((item) =>
        field(item, number, value.node),
      ))
  );
}
