import { exactParagraphNumber } from './paragraph-shape-number.ts';

export type CellSizeUnit = 'mm' | 'pt';
type Axis = 'width' | 'height';
const uint = (n: number) => Number.isInteger(n) && n >= 0 && n <= 0xffffffff;
const unitKnown = (unit: CellSizeUnit) => unit === 'mm' || unit === 'pt';

/** HWPUNIT is 1/7200 inch. Only display and explicitly edited mm values round. */
export function formatCellSize(value: number, unit: CellSizeUnit): string {
  if (!uint(value) || !unitKnown(unit)) throw Error('InvalidCellDimensions');
  const raw = BigInt(value);
  if (unit === 'mm') {
    const hundredths = (raw * 127n + 180n) / 360n;
    return `${hundredths / 100n}.${String(hundredths % 100n).padStart(2, '0')}`;
  }
  const fraction = String(raw % 100n)
    .padStart(2, '0')
    .replace(/0+$/, '');
  return String(raw / 100n) + (fraction ? '.' + fraction : '');
}

export function parseCellSize(raw: string, unit: CellSizeUnit): number | null {
  if (
    !unitKnown(unit) ||
    raw.length > 64 ||
    !/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(raw) ||
    (unit === 'mm' && (raw.split('.')[1]?.length ?? 0) > 2)
  )
    return null;
  const hundredths = exactParagraphNumber(raw, 100);
  if (!Number.isSafeInteger(hundredths)) return null;
  // 0.01 mm = 360/127 HWPUNIT; nearest integer, with no binary-float conversion.
  const value = unit === 'mm' ? Number((BigInt(hundredths) * 360n + 63n) / 127n) : hundredths;
  return uint(value) ? value : null;
}

/** Temporary UI values only. Original identity, lease and mutation admission stay in the port. */
export function createCellSizeUnitDraft(original: { width: number; height: number }) {
  const originals = { width: original.width, height: original.height };
  if (!uint(originals.width) || !uint(originals.height)) throw Error('InvalidCellDimensions');
  let unit: CellSizeUnit = 'mm';
  const fields = {
    width: { text: formatCellSize(originals.width, unit), value: originals.width as number | null },
    height: {
      text: formatCellSize(originals.height, unit),
      value: originals.height as number | null,
    },
  };
  return {
    read() {
      return Object.freeze({ unit, width: fields.width.text, height: fields.height.text });
    },
    edit(axis: Axis, raw: string) {
      if (axis !== 'width' && axis !== 'height') throw Error('InvalidCellDimensions');
      const field = fields[axis];
      // A programmatic label refresh or repeated event must not reparse rounded display text.
      if (raw === field.text) return;
      const parsed = parseCellSize(raw, unit);
      const numericLabel = exactParagraphNumber(raw, 100);
      const sameCurrentLabel =
        parsed !== null && numericLabel === exactParagraphNumber(field.text, 100);
      const sameOriginalLabel =
        parsed !== null &&
        numericLabel === exactParagraphNumber(formatCellSize(originals[axis], unit), 100);
      field.text = raw;
      // Formatting-only edits must not turn a rounded label into a different integer.
      if (!sameCurrentLabel) field.value = sameOriginalLabel ? originals[axis] : parsed;
    },
    changeUnit(next: CellSizeUnit): boolean {
      if (!unitKnown(next)) return false;
      if (next === unit) return true;
      if (fields.width.value === null || fields.height.value === null) return false;
      unit = next;
      fields.width.text = formatCellSize(fields.width.value, unit);
      fields.height.text = formatCellSize(fields.height.value, unit);
      return true;
    },
    points() {
      if (fields.width.value === null || fields.height.value === null)
        throw Error('InvalidCellDimensions');
      return {
        widthPoints: formatCellSize(fields.width.value, 'pt'),
        heightPoints: formatCellSize(fields.height.value, 'pt'),
        dirty: {
          width: fields.width.value !== originals.width,
          height: fields.height.value !== originals.height,
        },
      };
    },
  };
}
