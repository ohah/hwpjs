// The table host projection already owns these units. Paint and pointer ink
// must skip the same host runs; other U+FFFC display glyphs stay ordinary ink.
export function isInlineTableHostUnit(row, unit) {
  return row.inlineTables?.some((table) => table.unit === unit) === true;
}
