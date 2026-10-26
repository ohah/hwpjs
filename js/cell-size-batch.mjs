// Wire conversion only; model validation and atomic history remain native.
export function encodeCellSizes(cells) {
  if (!Array.isArray(cells)) throw new TypeError('InvalidCellSizeBatch');
  if (cells.length > 4096) throw new RangeError('LimitExceeded');
  const names = ['section', 'listNode', 'width', 'height'],
    seen = new Set();
  const bytes = new Uint8Array(cells.length * 16),
    view = new DataView(bytes.buffer);
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    if (
      !cell ||
      typeof cell !== 'object' ||
      Array.isArray(cell) ||
      Object.keys(cell).some((key) => !names.includes(key))
    )
      throw new TypeError('InvalidCellSizeBatch');
    const values = names.map((name) => {
      const value = cell[name];
      if (!Number.isInteger(value) || value < 0 || value > 0xffffffff)
        throw new RangeError('InvalidCellSizeBatch');
      return value;
    });
    const key = `${values[0]}:${values[1]}`;
    if (seen.has(key)) throw new Error('DuplicateCellSizeEdit');
    seen.add(key);
    values.forEach((value, column) => view.setUint32(i * 16 + column * 4, value, true));
  }
  return bytes;
}
