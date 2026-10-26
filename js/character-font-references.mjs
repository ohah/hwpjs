import { decodeCharacterSnapshot } from './character-snapshot-json.mjs';
import { FONT_LANGUAGES } from './font-faces.mjs';

export function decodeCharacterFontReferences(bytes) {
  const rows = decodeCharacterSnapshot(bytes, ['id', 'fontIds'], 'InvalidCharacterFontReferences');
  for (const row of rows) {
    if (
      row.fontIds !== null &&
      (!Array.isArray(row.fontIds) ||
        row.fontIds.length !== FONT_LANGUAGES.length ||
        row.fontIds.some(
          (id) => id !== null && (!Number.isInteger(id) || id < 0 || id > 0xffffffff),
        ))
    )
      throw new Error('InvalidCharacterFontReferences');
  }
  return rows;
}
