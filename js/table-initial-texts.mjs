const encoder = new TextEncoder();
export const TABLE_TEXT_REQUEST_LIMIT = 4 * 1024 * 1024;

// JSON.stringify calls user toJSON hooks before a replacer can reject them.
// Capture data properties into plain owned JSON values instead.
export function captureTableTextRequest(input) {
  const active = new Set();
  let nodes = 0,
    units = 0;
  const capture = (value, depth = 0) => {
    if (++nodes > 100000 || depth > 32) throw new RangeError('LimitExceeded');
    if (typeof value === 'string') {
      units += value.length;
      if (units > TABLE_TEXT_REQUEST_LIMIT) throw new RangeError('LimitExceeded');
      return value;
    }
    if (
      value === null ||
      typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value))
    )
      return value;
    if (!value || typeof value !== 'object' || active.has(value))
      throw new TypeError('InvalidTableCreationRequest');
    active.add(value);
    try {
      const array = Array.isArray(value);
      if (!array && ![Object.prototype, null].includes(Object.getPrototypeOf(value)))
        throw new TypeError('InvalidTableCreationRequest');
      const result = array ? [] : Object.create(null);
      const keys = array
        ? Array.from({ length: Math.min(value.length, 100001) }, (_, i) => String(i))
        : Reflect.ownKeys(value);
      if (keys.length > 100000) throw new RangeError('LimitExceeded');
      for (const key of keys) {
        const field = Object.getOwnPropertyDescriptor(value, key);
        if (typeof key !== 'string' || !field || !Object.hasOwn(field, 'value'))
          throw new TypeError('InvalidTableCreationRequest');
        if (!array && !field.enumerable) continue;
        if (key === 'toJSON') throw new TypeError('InvalidTableCreationRequest');
        units += key.length;
        if (units > TABLE_TEXT_REQUEST_LIMIT) throw new RangeError('LimitExceeded');
        result[key] = capture(field.value, depth + 1);
      }
      return result;
    } finally {
      active.delete(value);
    }
  };
  return capture(input);
}

// Capture one owned grid before entering WASM. Never create one edit per cell.
export function captureTableInitialTexts(rows, columns, input) {
  if (
    !Number.isInteger(rows) ||
    rows < 1 ||
    !Number.isInteger(columns) ||
    columns < 1 ||
    rows * columns > 4096 ||
    !Array.isArray(input) ||
    input.length !== rows
  )
    throw new TypeError('InvalidTableCellTexts');
  let bytes = 0;
  return Array.from({ length: rows }, (_, row) => {
    const entry = Object.getOwnPropertyDescriptor(input, String(row));
    if (!entry || !Object.hasOwn(entry, 'value')) throw new TypeError('InvalidTableCellTexts');
    const cells = entry.value;
    if (!Array.isArray(cells) || cells.length !== columns)
      throw new TypeError('InvalidTableCellTexts');
    return Array.from({ length: columns }, (_, column) => {
      const entry = Object.getOwnPropertyDescriptor(cells, String(column));
      if (!entry || !Object.hasOwn(entry, 'value')) throw new TypeError('InvalidTableCellTexts');
      const text = entry.value;
      if (typeof text !== 'string' || !text.isWellFormed())
        throw new TypeError('InvalidTableCellText');
      if (text.length > TABLE_TEXT_REQUEST_LIMIT) throw new RangeError('LimitExceeded');
      for (let index = 0; index < text.length; index++) {
        const unit = text.charCodeAt(index);
        if (unit < 0x20 || unit === 0x7f) throw new TypeError('InvalidTableCellText');
      }
      bytes += encoder.encode(text).length;
      if (bytes > TABLE_TEXT_REQUEST_LIMIT) throw new RangeError('LimitExceeded');
      return text;
    });
  });
}

export function encodeTableTextRequest(request) {
  const json = JSON.stringify(request);
  if (json.length > TABLE_TEXT_REQUEST_LIMIT) throw new RangeError('LimitExceeded');
  const bytes = encoder.encode(json);
  if (bytes.length > TABLE_TEXT_REQUEST_LIMIT) throw new RangeError('LimitExceeded');
  return bytes;
}
