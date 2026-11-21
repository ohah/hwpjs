// Presentation only: these cell IDs are never Native point ordinals or edit leases.
// The eventual format adapter must obtain edit authority separately.
export function createHwp5LiteralGridProjection(input) {
  const fail = () => {
    throw Error('InvalidHwp5LiteralGrid');
  };
  const categories = input?.categories,
    series = input?.series;
  if (
    !Array.isArray(categories) ||
    !Array.isArray(series) ||
    categories.length === 0 ||
    categories.length > 4096 ||
    series.length === 0 ||
    series.length > 64 ||
    categories.length * series.length > 16384
  )
    fail();
  const text = (value) => {
    if (typeof value !== 'string' || /[\uD800-\uDFFF]/u.test(value)) fail();
    return value;
  };
  // Array.from visits sparse slots; do not silently omit missing source values.
  const labels = Array.from(categories, text);
  const sources = Array.from(series, (item) => {
    if (!item || !Array.isArray(item.values) || item.values.length !== labels.length) fail();
    return { name: text(item.name), values: Array.from(item.values, text) };
  });
  const points = [],
    addresses = [],
    locations = new Map(),
    rows = [];
  const columns = [{ label: '범주' }, ...sources.map((item) => ({ label: item.name }))];
  const add = (value, address, row, column, cells) => {
    const id = points.length;
    points.push(
      Object.freeze({
        kind: address.kind === 'category' ? 'hwp5_literal_category' : 'hwp5_literal_value',
        value,
      }),
    );
    addresses.push(Object.freeze({ ...address, expected: value }));
    cells.set(column, [id]);
    locations.set(id, { index: row, row, column });
  };
  labels.forEach((value, category) => {
    const cells = new Map();
    add(value, { kind: 'category', category }, category, 0, cells);
    sources.forEach((source, series) => {
      add(
        source.values[category],
        { kind: 'value', series, category },
        category,
        series + 1,
        cells,
      );
    });
    rows.push({ index: category, cells });
  });
  const chart = Object.freeze({ values: Object.freeze({ points: Object.freeze(points) }) });
  const model = { columns, rows, locations };
  return Object.freeze({
    chart,
    projectModel(value) {
      if (value == null) return { columns: [], rows: [], locations: new Map() };
      if (value !== chart) throw Error('ForeignHwp5LiteralGridProjection');
      return model;
    },
    cellAddress(id) {
      if (!Number.isSafeInteger(id) || id < 0 || id >= addresses.length) return null;
      return addresses[id];
    },
  });
}
