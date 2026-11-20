// Captured Native read counters remain decimal u64 strings; never History revisions.
const decimal = (value, zero) =>
  typeof value === 'string' &&
  /^(0|[1-9][0-9]{0,19})$/.test(value) &&
  (zero || value !== '0') &&
  (value.length < 20 || value <= '18446744073709551615');
export function validDocumentTextReadStamp(value) {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Reflect.ownKeys(value).length === 2 &&
    Object.hasOwn(value, 'epoch') &&
    Object.hasOwn(value, 'serial') &&
    decimal(value.epoch, false) &&
    decimal(value.serial, true)
  );
}

export function sameDocumentTextReadStamp(a, b) {
  return (
    (a === undefined && b === undefined) ||
    (validDocumentTextReadStamp(a) &&
      validDocumentTextReadStamp(b) &&
      a.epoch === b.epoch &&
      a.serial === b.serial)
  );
}
