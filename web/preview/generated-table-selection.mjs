/** Capture a generated-cell address without inventing a source paragraph ID. */
export function captureGeneratedTableSelection({ section, createdCell, current }) {
  const uint = (value) =>
    Number.isInteger(value) && !Object.is(value, -0) && value >= 0 && value <= 0xffffffff;
  if (
    !uint(section) ||
    !createdCell ||
    typeof createdCell.identity !== 'string' ||
    !/^[1-9][0-9]{0,19}$/.test(createdCell.identity) ||
    BigInt(createdCell.identity) > 18446744073709551615n ||
    !uint(createdCell.row) ||
    !uint(createdCell.column) ||
    typeof current !== 'function' ||
    current() !== true
  )
    return null;
  let invalid = false;
  return Object.freeze({
    section,
    createdCell: Object.freeze({
      identity: createdCell.identity,
      row: createdCell.row,
      column: createdCell.column,
    }),
    current() {
      if (invalid) return false;
      try {
        if (current() === true) return true;
      } catch {
        // A disposed surface or unavailable renderer cannot revive the capture.
      }
      invalid = true;
      return false;
    },
  });
}
