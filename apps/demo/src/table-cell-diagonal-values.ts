import type { TableCellAppearanceCapture } from './table-cell-appearance-port.ts';
import type { TableCellDiagonalDraft } from './table-cell-fill-draft.ts';
// @ts-ignore Shared RGB syntax; no source colour inference in the form adapter.
import { characterColorArg } from '../../../js/character-color-args.mjs';

export function tableCellDiagonalValues(
  draft: TableCellDiagonalDraft,
  captured: TableCellAppearanceCapture,
): Record<string, unknown> {
  if (
    (captured.state.capabilities as { cellDiagonalAvailable?: boolean })?.cellDiagonalAvailable !==
    true
  )
    throw Error('CellDiagonalAbiUnavailable');
  const fields = ['directions', 'style', 'width', 'color'] as const;
  if (!draft.dirty || fields.some((key) => typeof draft.dirty[key] !== 'boolean'))
    throw Error('InvalidCellDiagonal');
  const value: Record<string, unknown> = {};
  if (draft.dirty.directions) value.directions = draft.directions;
  if (draft.dirty.style) value.style = draft.style;
  if (draft.dirty.width) {
    if (typeof draft.width !== 'string' || !/^[1-9][0-9]*$/.test(draft.width))
      throw Error('InvalidCellDiagonal');
    value.width = Number(draft.width);
  }
  if (draft.dirty.color) value.color = characterColorArg(draft.color);
  if (!Object.keys(value).length) {
    const known = captured.observed?.diagonal,
      stroke = known?.stroke;
    if (
      !known?.directions ||
      !stroke ||
      !['known', 'none'].includes(stroke.state) ||
      !['NONE', 'SOLID'].includes(stroke.style) ||
      !Number.isInteger(stroke.width) ||
      typeof stroke.color !== 'string'
    )
      throw Error('CellDiagonalChoiceRequired');
    value.directions = known.directions;
    value.style = stroke.style;
    value.width = stroke.width;
    value.color = characterColorArg(stroke.color);
  }
  return value;
}
