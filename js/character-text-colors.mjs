import { decodeCharacterSnapshot } from './character-snapshot-json.mjs';

export function decodeCharacterTextColors(bytes) {
  const rows = decodeCharacterSnapshot(bytes, ['id', 'color'], 'InvalidCharacterTextColors');
  for (const row of rows) {
    if (
      row.color !== null &&
      (!Number.isInteger(row.color) || row.color < 0 || row.color > 0xffffff)
    ) {
      throw new Error('InvalidCharacterTextColors');
    }
  }
  return rows;
}
