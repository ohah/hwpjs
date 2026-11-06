import { validateCellDiagonals } from './cell-diagonal-command.mjs';
import { MAX_CELL_BORDER_EDITS } from './cell-border-batch.mjs';
import { validateCellBorderPatches } from './cell-border-patch-command.mjs';
import { validateCellFills } from './cell-fill-command.mjs';

export function validateCellStyles(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    throw TypeError('InvalidCellStyles');
  if (
    Reflect.ownKeys(input).length !== 2 + Number(Object.hasOwn(input, 'diagonals')) ||
    !Object.hasOwn(input, 'borders') ||
    !Object.hasOwn(input, 'fills')
  )
    throw TypeError('InvalidCellStyles');
  const borders = validateCellBorderPatches(input.borders),
    fills = validateCellFills(input.fills),
    diagonals = Object.hasOwn(input, 'diagonals')
      ? validateCellDiagonals(input.diagonals)
      : undefined,
    owners = new Map();
  for (const rows of [borders, fills, diagonals ?? []])
    for (const row of rows) {
      const key = `${row.section}:${row.listNode}`;
      if (owners.has(key) && owners.get(key) !== row.tableNode)
        throw TypeError('AmbiguousCellStyleOwner');
      owners.set(key, row.tableNode);
      if (owners.size > MAX_CELL_BORDER_EDITS) throw RangeError('LimitExceeded');
    }
  return Object.freeze({ borders, fills, ...(diagonals ? { diagonals } : {}) });
}
export function validateCellStylesMessage(input) {
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Reflect.ownKeys(input).length !== 3 + Number(Object.hasOwn(input, 'diagonals')) ||
    !Object.hasOwn(input, 'kind') ||
    !Object.hasOwn(input, 'borders') ||
    !Object.hasOwn(input, 'fills') ||
    input.kind !== 'cell-styles'
  )
    throw TypeError('InvalidCellStyles');
  return Object.freeze({
    kind: 'cell-styles',
    ...validateCellStyles({
      borders: input.borders,
      fills: input.fills,
      ...(Object.hasOwn(input, 'diagonals') ? { diagonals: input.diagonals } : {}),
    }),
  });
}
