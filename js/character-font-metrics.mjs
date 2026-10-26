import { metadataKeys as keys } from './font-metadata-wire.mjs';
const fields = ['ratio', 'spacing', 'relativeSize', 'offset'];
/** Raw diagnostic values, not inferred defaults or a shaping instruction. */
export function decodeCharacterFontMetrics(bytes, format) {
  const fail = () => {
    throw new Error('InvalidCharacterFontMetrics');
  };
  let wire;
  try {
    if (!(bytes instanceof Uint8Array)) return fail();
    wire = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return fail();
  }
  if (
    !keys(wire, ['version', 'format', 'shapes']) ||
    wire.version !== 1 ||
    wire.format !== format ||
    !['hwp5', 'hwpx'].includes(format) ||
    !Array.isArray(wire.shapes) ||
    wire.shapes.length > 100000
  )
    return fail();
  let previous = -1;
  for (const row of wire.shapes) {
    if (
      !keys(row, ['id', 'values']) ||
      !Number.isInteger(row.id) ||
      row.id < 0 ||
      row.id > 0xffffffff ||
      row.id <= previous ||
      !keys(row.values, fields)
    )
      return fail();
    previous = row.id;
    for (const key of fields) {
      const values = row.values[key];
      if (values === null && format === 'hwpx') continue;
      if (!Array.isArray(values) || values.length !== 7) return fail();
      const signed = key === 'spacing' || key === 'offset';
      const lower = format === 'hwpx' ? -0x80000000 : signed ? -128 : 0;
      const upper = format === 'hwpx' ? 0x7fffffff : signed ? 127 : 255;
      if (
        values.some(
          (value) =>
            !(value === null && format === 'hwpx') &&
            (!Number.isInteger(value) || value < lower || value > upper),
        )
      )
        return fail();
    }
  }
  return wire.shapes;
}
