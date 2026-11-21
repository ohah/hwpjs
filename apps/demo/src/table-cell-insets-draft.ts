import type { CellInsetsValue, CellInsetsPatch } from '@hwpjs/core';
import { formatCellSize, parseCellSize, type CellSizeUnit } from './table-cell-size-units.ts';
import { exactParagraphNumber } from './paragraph-shape-number.ts';
export const cellInsetsAxes = ['left', 'right', 'top', 'bottom'] as const;
type Axis = (typeof cellInsetsAxes)[number];
/** UI draft only: untouched rounded labels never replace exact Native effective values. */
export function createCellInsetsDraft(original: CellInsetsValue) {
  let mode = original.mode,
    unit: CellSizeUnit = 'mm';
  const fields = cellInsetsAxes.map((_, i) => ({
    value: original.effective[i] as number | null,
    text: formatCellSize(original.effective[i], unit),
  }));
  function patch(): CellInsetsPatch {
    if (mode === 'inherit') {
      const v = original.tableDefaults;
      if (original.frame.width <= v[0] + v[1] || original.frame.height <= v[2] + v[3])
        throw Error('InvalidCellInsetsInnerBox');
      return Object.freeze({ mode });
    }
    const out: { mode: 'custom'; left?: number; right?: number; top?: number; bottom?: number } = {
      mode,
    };
    cellInsetsAxes.forEach((axis, i) => {
      const value = fields[i].value;
      if (value === null || value > 32767) throw Error('InvalidCellInsetsPatch');
      if (value !== original.effective[i]) out[axis] = value;
    });
    const v = fields.map((f) => f.value!);
    if (original.frame.width <= v[0] + v[1] || original.frame.height <= v[2] + v[3])
      throw Error('InvalidCellInsetsInnerBox');
    return Object.freeze(out);
  }
  return {
    read() {
      return {
        mode,
        unit,
        text: fields.map((f, i) =>
          mode === 'inherit' ? formatCellSize(original.tableDefaults[i], unit) : f.text,
        ),
      };
    },
    setMode(value: 'inherit' | 'custom') {
      if (!['inherit', 'custom'].includes(value)) throw Error('InvalidCellInsetsPatch');
      mode = value;
    },
    edit(axis: Axis, text: string) {
      if (mode !== 'custom') return;
      const i = cellInsetsAxes.indexOf(axis);
      if (i < 0) throw Error('InvalidCellInsetsPatch');
      const f = fields[i];
      if (text === f.text) return;
      const parsed = parseCellSize(text, unit);
      const label = exactParagraphNumber(text, 100);
      const same = parsed !== null && label === exactParagraphNumber(f.text, 100);
      const originalLabel =
        parsed !== null &&
        label === exactParagraphNumber(formatCellSize(original.effective[i], unit), 100);
      f.text = text;
      if (parsed === 0 && text !== formatCellSize(original.effective[i], unit)) f.value = 0;
      else if (!same) f.value = originalLabel ? original.effective[i] : parsed;
    },
    changeUnit(next: CellSizeUnit) {
      if (!['pt', 'mm'].includes(next) || fields.some((f) => f.value === null)) return false;
      unit = next;
      for (const f of fields) f.text = formatCellSize(f.value!, unit);
      return true;
    },
    changed() {
      return (
        mode !== original.mode ||
        (mode === 'custom' && fields.some((f, i) => f.value !== original.effective[i]))
      );
    },
    patch,
  };
}
