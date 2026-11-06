import { validateCellBorders } from './cell-border-batch.mjs';
import { validateCellBackground } from './cell-background-command.mjs';

export function validateCellAppearance(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw TypeError('InvalidCellAppearance');
  const keys = Reflect.ownKeys(input);
  if (keys.length !== 2 || !Object.hasOwn(input, 'cells') || !Object.hasOwn(input, 'background'))
    throw TypeError('InvalidCellAppearance');
  const cells = validateCellBorders(input.cells),
    source = input.background;
  const background = source === null ? null : validateCellBackground(source);
  return Object.freeze({ cells, background });
}
export function validateCellAppearanceMessage(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw TypeError('InvalidCellAppearance');
  const keys = Reflect.ownKeys(input);
  if (
    keys.length !== 3 ||
    !Object.hasOwn(input, 'kind') ||
    !Object.hasOwn(input, 'cells') ||
    !Object.hasOwn(input, 'background') ||
    input.kind !== 'cell-appearance'
  )
    throw TypeError('InvalidCellAppearance');
  const value = validateCellAppearance({ cells: input.cells, background: input.background });
  return Object.freeze({ kind: 'cell-appearance', ...value });
}
