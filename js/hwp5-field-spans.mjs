// Current source-bound coordinates only; a span does not grant edit permission.
export function validateHwp5FieldSpans(rows) {
  const uint = value => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  const sources = new Set();
  if (!Array.isArray(rows)) throw new Error("InvalidHwp5FieldSpans");
  for (const row of rows) {
    if (!row || ![row.source_node, row.field_id, row.ordinal].every(uint)
      || ![row.begin, row.end].every(position => position && uint(position.paragraph) && uint(position.unit))
      || row.begin.paragraph > row.end.paragraph
      || row.begin.paragraph === row.end.paragraph && row.begin.unit > row.end.unit
      || sources.has(row.source_node)) throw new Error("InvalidHwp5FieldSpans");
    sources.add(row.source_node);
  }
  return rows;
}

export function decodeHwp5FieldSpans(bytes) {
  return validateHwp5FieldSpans(JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes)));
}
