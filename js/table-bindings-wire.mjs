/** HTB1 read-only cell source bindings. Sizes are raw HWP units, not pixels. */
export function decodeTableBindings(bytes) {
  const fail = () => { throw new Error("InvalidTableBindings"); };
  if (!(bytes instanceof Uint8Array) || bytes.length < 8) return fail();
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const magic = view.getUint32(0, true), optional = magic === 0x31585448;
  if (!optional && magic !== 0x31425448) return fail();
  const stride = optional ? 48 : 44;
  const count = view.getUint32(4, true);
  if (count > 100000 || bytes.length !== 8 + count * stride) return fail();
  let previous = -1;
  return Array.from({ length: count }, (_, index) => {
    const row = {};
    for (const [column, field] of ["paragraph", "tableNode", "listNode", "rows", "columns", "row", "column", "rowSpan", "columnSpan", "width", "height"].entries()) row[field] = view.getUint32(8 + index * stride + column * 4, true);
    if (optional) {
      const flags = view.getUint32(8 + index * stride + 44, true);
      if (flags & ~3 || (! (flags & 1) && row.width !== 0) || (!(flags & 2) && row.height !== 0) || row.paragraph === 0) return fail();
      if (!(flags & 1)) row.width = null;
      if (!(flags & 2)) row.height = null;
    }
    if (row.paragraph <= previous || !row.rows || !row.columns || !row.rowSpan || !row.columnSpan || row.row >= row.rows || row.column >= row.columns || row.rowSpan > row.rows - row.row || row.columnSpan > row.columns - row.column) return fail();
    previous = row.paragraph;
    return row;
  });
}
