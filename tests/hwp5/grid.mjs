import assert from "node:assert/strict";
function input(rows, columns, sizes, cells) {
  const values = [rows, columns, ...sizes, ...cells.flat()];
  const b = Buffer.alloc(values.length * 2);
  values.forEach((v, i) => b.writeUInt16LE(v, i * 2));
  return b;
}
function counts(rows, cells) {
  const sizes = Array(rows).fill(0);
  for (const c of cells) sizes[c[0]]++;
  return sizes;
}
// Independent dense oracle for small grids, deliberately unlike the sweep/Fenwick core.
function expected(rows, columns, sizes, cells) {
  const starts = Array(rows).fill(0);
  for (const [y, x, h, w] of cells) {
    if (
      !h ||
      !w ||
      y >= rows ||
      x >= columns ||
      y + h > rows ||
      x + w > columns
    )
      return "InvalidCellSpan";
    if (starts[y] >= sizes[y]) return "TableRowCellCountMismatch";
    starts[y]++;
  }
  if (starts.some((v, i) => v !== sizes[i])) return "TableRowCellCountMismatch";
  const dense = new Uint16Array(rows * columns);
  for (const [y, x, h, w] of cells)
    for (let row = y; row < y + h; row++)
      for (let col = x; col < x + w; col++) {
        if (dense[row * columns + col]++) return "OverlappingTableCells";
      }
  return dense.some((v) => v === 0) ? "IncompleteTableGrid" : null;
}
export function checkGrid(call, rows, columns, sizes, cells) {
  const error = expected(rows, columns, sizes, cells);
  const b = input(rows, columns, sizes, cells);
  if (error) assert.throws(() => call(19, b), new RegExp(`^Error: ${error}$`));
  else assert.equal(call(19, b).length, 0);
  return error;
}
export function gridEdges(call) {
  const rectangles = [];
  for (let y = 0; y < 2; y++)
    for (let x = 0; x < 2; x++)
      for (let h = 1; h <= 2 - y; h++)
        for (let w = 1; w <= 2 - x; w++) rectangles.push([y, x, h, w]);
  let subsets = 0,
    mutations = 0,
    rejected = 0;
  for (let mask = 0; mask < 512; mask++) {
    const cells = rectangles.filter((_, i) => mask & (1 << i)),
      sizes = counts(2, cells);
    checkGrid(call, 2, 2, sizes, cells);
    checkGrid(call, 2, 2, sizes, [...cells].reverse());
    subsets += 2;
  }
  let seed = 0x5eedbeef;
  const random = (n) => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return (seed >>> 0) % n;
  };
  for (let round = 0; round < 32; round++) {
    const rows = 2 + random(7),
      columns = 2 + random(7),
      cells = [[0, 0, rows, columns]];
    for (let split = 0; split < 7; split++) {
      const index = random(cells.length),
        [y, x, h, w] = cells[index],
        vertical = !!random(2);
      if (vertical && h > 1) {
        const cut = 1 + random(h - 1);
        cells.splice(index, 1, [y, x, cut, w], [y + cut, x, h - cut, w]);
      } else if (w > 1) {
        const cut = 1 + random(w - 1);
        cells.splice(index, 1, [y, x, h, cut], [y, x + cut, h, w - cut]);
      }
    }
    for (let i = cells.length - 1; i > 0; i--) {
      const j = random(i + 1);
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    const sizes = counts(rows, cells);
    assert.equal(checkGrid(call, rows, columns, sizes, cells), null);
    for (let i = 0; i < cells.length; i++)
      for (let field = 0; field < 4; field++)
        for (let bit = 0; bit < 16; bit++) {
          const changed = cells.map((c) => [...c]);
          changed[i][field] ^= 1 << bit;
          if (checkGrid(call, rows, columns, sizes, changed)) rejected++;
          checkGrid(call, rows, columns, sizes, cells);
          mutations++;
        }
    // Same total count, wrong row distribution must still fail.
    const source = sizes.findIndex((v) => v > 0),
      target = (source + 1) % rows,
      wrong = [...sizes];
    wrong[source]--;
    wrong[target]++;
    assert.equal(
      checkGrid(call, rows, columns, wrong, cells),
      "TableRowCellCountMismatch",
    );
  }
  const sizes = Array(65535).fill(0);
  sizes[0] = 1;
  assert.equal(
    call(19, input(65535, 65535, sizes, [[0, 0, 65535, 65535]])).length,
    0,
  );
  // Maximum u16 cells in one row and many shared row-boundary remove/add events.
  for (const vertical of [false, true]) {
    const cells = Array.from({ length: 65535 }, (_, i) =>
      vertical ? [i, 0, 1, 1] : [0, i, 1, 1],
    );
    const rows = vertical ? 65535 : 1,
      columns = vertical ? 1 : 65535;
    const rowSizes = vertical ? Array(65535).fill(1) : [65535];
    assert.equal(
      call(19, input(rows, columns, rowSizes, cells.reverse())).length,
      0,
    );
  }
  const good = input(1, 1, [1], [[0, 0, 1, 1]]);
  for (let n = 0; n < good.length; n++)
    assert.throws(
      () => call(19, good.subarray(0, n)),
      /UnexpectedEnd|InvalidGridInput|TableRowCellCountMismatch/,
    );
  assert.equal(call(19, good).length, 0);
  return {
    subsets,
    partitions: 32,
    mutations,
    rejected,
    recoveries: mutations,
    maxGridUnits: 65535 * 65535,
    maxCells: 65535,
  };
}
