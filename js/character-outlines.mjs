import { decodeCharacterSnapshot } from './character-snapshot-json.mjs';
export function decodeCharacterOutlines(bytes) {
  const rows = decodeCharacterSnapshot(
    bytes,
    ['id', 'state', 'rawKind'],
    'InvalidCharacterOutlines',
  );
  for (const row of rows) {
    if (!['absent', 'none', 'solid', 'other', 'unknown'].includes(row.state))
      throw new Error('InvalidCharacterOutlines');
    if (row.rawKind !== null) {
      if (
        !Number.isInteger(row.rawKind) ||
        row.rawKind < 0 ||
        row.rawKind > 7 ||
        row.state !==
          (row.rawKind === 0
            ? 'none'
            : row.rawKind === 1
              ? 'solid'
              : row.rawKind === 7
                ? 'unknown'
                : 'other')
      )
        throw new Error('InvalidCharacterOutlines');
    } else if (row.state === 'other') throw new Error('InvalidCharacterOutlines');
  }
  return rows;
}
