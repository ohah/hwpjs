import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { verifyCellOwnerInputs } from '../../../tools/shape-copy-cell-input-validation.mjs';
const pins = JSON.parse(await readFile(process.env.HWPJS_CELL_OWNER_INPUTS, 'utf8'));
await verifyCellOwnerInputs(pins);
export const { observeTableCellAppearance: strictObserve } = await import(
  pathToFileURL(pins.strictPreimage.path)
);
