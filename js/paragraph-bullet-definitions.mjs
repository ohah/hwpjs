import { checkedBulletDefinition } from './paragraph-bullet-definition-write.mjs';
const reasons = new Set(['InvalidBulletId', 'DuplicateBulletId', 'UnsupportedBulletDeclaration']);
const uint = (value) => Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
const scalar = (value) =>
  uint(value) &&
  value > 0x20 &&
  value <= 0x10ffff &&
  !(value >= 0x7f && value <= 0x9f) &&
  !(value >= 0xd800 && value <= 0xdfff);

/** Only validates a Native DTO. No source XML, inference or retained inventory. */
export function checkedParagraphBulletDefinitions(result) {
  const invalid = () => {
    throw Error('MalformedParagraphBulletDefinitions');
  };
  if (result?.state === 'unavailable' && typeof result.reason === 'string' && result.reason.length)
    return result;
  if (
    result?.schemaVersion !== 1 ||
    result.state !== 'available' ||
    result.scope !== 'current-header' ||
    result.coverage !== 'complete' ||
    !Array.isArray(result.declarations) ||
    result.declarations.length > 4096
  )
    invalid();
  if (
    result.definitionWriter !== undefined &&
    result.definitionWriter !== 'character-definitions-v1'
  )
    invalid();
  const counts = new Map();
  for (const [index, row] of result.declarations.entries()) {
    if (
      !row ||
      row.ordinal !== index ||
      (row.id !== null && !uint(row.id)) ||
      (row.marker !== null && !scalar(row.marker)) ||
      typeof row.canApply !== 'boolean'
    )
      invalid();
    if (
      row.canApply
        ? row.id === null || row.marker === null || row.reason !== null
        : !reasons.has(row.reason)
    )
      invalid();
    if ((row.id === null) !== (row.reason === 'InvalidBulletId')) invalid();
    if (row.definition != null) {
      try {
        checkedBulletDefinition(row.definition);
      } catch {
        invalid();
      }
      if (!row.canApply || row.definition.marker !== row.marker) invalid();
    }
    if (row.id !== null) counts.set(row.id, (counts.get(row.id) ?? 0) + 1);
  }
  for (const row of result.declarations) {
    if (
      row.id !== null &&
      counts.get(row.id) > 1 &&
      (row.canApply || row.reason !== 'DuplicateBulletId')
    )
      invalid();
    if (row.reason === 'DuplicateBulletId' && counts.get(row.id) < 2) invalid();
  }
  return result;
}

export function decodeParagraphBulletDefinitions(bytes) {
  return checkedParagraphBulletDefinitions(
    JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)),
  );
}
