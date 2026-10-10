// Validate native display snapshots without interpreting XML or unknown enums.
export function decodeHwpxParagraphShapes(bytes) {
  const result = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  const invalid = () => { throw new Error("InvalidParagraphShapes"); };
  const text = value => value === null || typeof value === "string";
  const measure = value => value === null || (value && typeof value === "object" && !Array.isArray(value)
    && (value.value === null || (Number.isInteger(value.value) && value.value >= -2147483648 && value.value <= 4294967295)) && text(value.unit));
  if (!Array.isArray(result)) invalid();
  const ids = new Set();
  for (const row of result) {
    if (!row || typeof row !== "object" || !Number.isInteger(row.id) || row.id < 0 || row.id > 0xffffffff || ids.has(row.id)
      || !text(row.horizontal) || !text(row.spacing_type) || !measure(row.spacing)
      || !Array.isArray(row.margins) || row.margins.length !== 5 || !row.margins.every(measure)) invalid();
    ids.add(row.id);
  }
  return result;
}
